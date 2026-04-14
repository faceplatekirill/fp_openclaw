import { Ecomet } from '../vendor/ecomet.js';
import { EcometError, ErrorCode, wrapError } from '../utils/errors.js';

export interface EcometConfig {
  /** List of Ecomet hosts in format "host:port" */
  hosts?: string[];
  /** Login username */
  login?: string;
  /** Login password */
  password?: string;
  /** Query timeout in milliseconds (default: 5000) */
  timeoutMs?: number;
  /** Delay before reconnection attempt in milliseconds (default: 1000) */
  reconnectDelayMs?: number;
  /** WebSocket protocol (default: 'ws:') */
  protocol?: 'ws:' | 'wss:';
}

export interface Logger {
  info?(message: string): void;
  warn?(message: string): void;
  error?(message: string): void;
  debug?(message: string): void;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface QueryResult {
  /** Total number of matching objects */
  total: number;
  /** Parsed objects from table response */
  objects: Record<string, unknown>[];
}

type ResolvedConfig = Required<EcometConfig>;

interface NormalizedResponse {
  total: number;
  table: unknown[][];
}

export class EcometClient {
  private readonly config: ResolvedConfig;
  private readonly logger?: Logger;

  private connection: Ecomet | null = null;
  private state: ConnectionState = 'disconnected';
  private connectionPromise: Promise<void> | null = null;
  private pendingQueryRejectors = new Set<(error: unknown) => void>();

  private nextHostIndex = 0;
  private lastCloseTime = 0;

  constructor(config: EcometConfig = {}, logger?: Logger) {
    this.config = {
      hosts: config.hosts && config.hosts.length > 0 ? [...config.hosts] : ['127.0.0.1:9000'],
      login: config.login ?? 'ai_assistant',
      password: config.password ?? 'ai_assistant',
      timeoutMs: config.timeoutMs ?? 5000,
      reconnectDelayMs: config.reconnectDelayMs ?? 1000,
      protocol: config.protocol ?? 'ws:',
    };
    this.logger = logger;
  }

  connect(): Promise<void> {
    if (this.isConnected()) {
      return Promise.resolve();
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const inFlight = (async () => {
      await this.waitReconnectDelay();
      await this.tryConnectAllHosts();
    })()
      .catch((error) => {
        throw this.toConnectionError(error);
      })
      .finally(() => {
        if (this.connectionPromise === inFlight) {
          this.connectionPromise = null;
        }
      });

    this.connectionPromise = inFlight;
    return inFlight;
  }

  async query<T = unknown>(
    statement: string,
    options: { timeout?: number } = {},
  ): Promise<T> {
    const timeout = options.timeout ?? this.config.timeoutMs;
    return this.executeQuery<T>(statement, timeout, true);
  }

  async application<T = unknown>(
    module: string,
    method: string,
    params: unknown,
    options: { timeout?: number } = {},
  ): Promise<T> {
    const timeout = options.timeout ?? this.config.timeoutMs;
    return this.executeApplication<T>(module, method, params, timeout, true);
  }

  async queryObjects(
    statement: string,
    options: { timeout?: number } = {},
  ): Promise<QueryResult> {
    const response = await this.query<unknown>(statement, options);
    const normalized = this.normalizeResponse(response);

    if (normalized.table.length === 0) {
      return { total: 0, objects: [] };
    }

    return {
      total: normalized.total,
      objects: this.parseTable(normalized.table),
    };
  }

  isConnected(): boolean {
    return this.connection !== null && this.connection.is_ok();
  }

  getState(): ConnectionState {
    return this.state;
  }

  async close(): Promise<void> {
    const current = this.connection;
    this.connection = null;
    this.state = 'disconnected';
    this.lastCloseTime = Date.now();
    this.rejectPendingQueries(new Error('Connection closed'));

    if (!current) {
      return;
    }

    try {
      current.close();
      this.logger?.info?.('Ecomet connection closed');
    } catch (error) {
      this.logger?.warn?.(`Error closing Ecomet connection: ${this.errorText(error)}`);
    }
  }

  private async executeQuery<T>(
    statement: string,
    timeout: number,
    allowReconnectRetry: boolean,
  ): Promise<T> {
    await this.connect();

    try {
      return await this.queryOnce<T>(statement, timeout);
    } catch (error) {
      const wrapped = this.toQueryError(error, timeout);

      if (allowReconnectRetry && this.shouldReconnect(wrapped)) {
        this.logger?.warn?.(`Query connection issue, reconnecting once: ${wrapped.message}`);
        this.markDisconnected();
        this.rejectPendingQueries(new Error('Connection reset for retry'));
        await this.connect();
        return this.executeQuery<T>(statement, timeout, false);
      }

      throw wrapped;
    }
  }

  private async executeApplication<T>(
    module: string,
    method: string,
    params: unknown,
    timeout: number,
    allowReconnectRetry: boolean,
  ): Promise<T> {
    await this.connect();

    try {
      return await this.applicationOnce<T>(module, method, params, timeout);
    } catch (error) {
      const wrapped = this.toQueryError(error, timeout);

      if (allowReconnectRetry && this.shouldReconnect(wrapped)) {
        this.logger?.warn?.(`Application connection issue, reconnecting once: ${wrapped.message}`);
        this.markDisconnected();
        this.rejectPendingQueries(new Error('Connection reset for retry'));
        await this.connect();
        return this.executeApplication<T>(module, method, params, timeout, false);
      }

      throw wrapped;
    }
  }

  private queryOnce<T>(statement: string, timeout: number): Promise<T> {
    if (!this.connection || !this.connection.is_ok()) {
      throw new EcometError('Connection error: No active connection', ErrorCode.CONNECTION_FAILED);
    }

    const connection = this.connection;

    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const finalize = () => {
        settled = true;
        this.pendingQueryRejectors.delete(rejectFromClose);
      };

      const rejectFromClose = (error: unknown) => {
        if (settled) {
          return;
        }
        finalize();
        reject(error);
      };

      this.pendingQueryRejectors.add(rejectFromClose);

      const onSuccess = (result: unknown) => {
        if (settled) {
          return;
        }
        finalize();
        resolve(result as T);
      };

      const onError = (error: unknown) => {
        if (settled) {
          return;
        }
        finalize();
        reject(error);
      };

      try {
        connection.query(statement, onSuccess, onError, timeout);
      } catch (error) {
        if (settled) {
          return;
        }
        finalize();
        reject(error);
      }
    });
  }

  private applicationOnce<T>(
    module: string,
    method: string,
    params: unknown,
    timeout: number,
  ): Promise<T> {
    if (!this.connection || !this.connection.is_ok()) {
      throw new EcometError('Connection error: No active connection', ErrorCode.CONNECTION_FAILED);
    }

    const connection = this.connection;

    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const finalize = () => {
        settled = true;
        this.pendingQueryRejectors.delete(rejectFromClose);
      };

      const rejectFromClose = (error: unknown) => {
        if (settled) {
          return;
        }
        finalize();
        reject(error);
      };

      this.pendingQueryRejectors.add(rejectFromClose);

      const onSuccess = (result: unknown) => {
        if (settled) {
          return;
        }
        finalize();
        resolve(result as T);
      };

      const onError = (error: unknown) => {
        if (settled) {
          return;
        }
        finalize();
        reject(error);
      };

      try {
        connection.application(module, method, params, onSuccess, onError, timeout);
      } catch (error) {
        if (settled) {
          return;
        }
        finalize();
        reject(error);
      }
    });
  }

  private async tryConnectAllHosts(): Promise<void> {
    if (this.config.hosts.length === 0) {
      this.state = 'error';
      throw new EcometError(
        'All Ecomet hosts unreachable (tried: )',
        ErrorCode.CONNECTION_FAILED,
      );
    }

    this.state = 'connecting';
    const startIndex = this.nextHostIndex % this.config.hosts.length;
    let lastError: unknown;

    for (let attempt = 0; attempt < this.config.hosts.length; attempt += 1) {
      const hostIndex = (startIndex + attempt) % this.config.hosts.length;
      const host = this.config.hosts[hostIndex];

      try {
        await this.connectToHost(host);
        this.state = 'connected';
        this.nextHostIndex = (hostIndex + 1) % this.config.hosts.length;
        this.logger?.info?.(`Ecomet connected: ${host}`);
        return;
      } catch (error) {
        lastError = error;
        this.logger?.warn?.(`Failed to connect to ${host}: ${this.errorText(error)}`);
      }
    }

    this.state = 'error';
    throw new EcometError(
      `All Ecomet hosts unreachable (tried: ${this.config.hosts.join(', ')})`,
      ErrorCode.CONNECTION_FAILED,
      { lastError },
    );
  }

  private connectToHost(host: string): Promise<void> {
    const { hostName, port } = this.parseHost(host);

    return new Promise<void>((resolve, reject) => {
      const connection = new Ecomet();
      let settled = false;

      const resolveOnce = () => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
      };

      const rejectOnce = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      };

      const onClose = () => {
        if (this.connection === connection) {
          this.logger?.warn?.('Ecomet connection closed');
          this.markDisconnected();
          this.rejectPendingQueries(new Error('Connection closed'));
        }
      };

      const onConnect = () => {
        connection.login(
          this.config.login,
          this.config.password,
          () => {
            this.connection = connection;
            this.state = 'connected';
            resolveOnce();
          },
          (error: unknown) => {
            rejectOnce(
              new EcometError(
                `Login failed: ${this.errorText(error)}`,
                ErrorCode.AUTHENTICATION_FAILED,
                error,
              ),
            );
          },
          this.config.timeoutMs,
        );
      };

      const onError = (error: unknown) => {
        rejectOnce(
          new EcometError(
            `Connection error: ${this.errorText(error)}`,
            ErrorCode.CONNECTION_FAILED,
            error,
          ),
        );
      };

      try {
        connection.connect(hostName, port, this.config.protocol, onConnect, onError, onClose);
      } catch (error) {
        rejectOnce(
          new EcometError(
            `Connection error: ${this.errorText(error)}`,
            ErrorCode.CONNECTION_FAILED,
            error,
          ),
        );
      }
    });
  }

  private normalizeResponse(response: unknown): NormalizedResponse {
    if (response === null || response === undefined) {
      return { total: 0, table: [] };
    }

    if (Array.isArray(response)) {
      const table = this.ensureTable(response);
      return { total: Math.max(0, table.length - 1), table };
    }

    if (typeof response === 'object') {
      const candidate = response as { count?: unknown; result?: unknown };

      if (Array.isArray(candidate.result)) {
        const table = this.ensureTable(candidate.result);
        const total =
          typeof candidate.count === 'number' && Number.isFinite(candidate.count)
            ? candidate.count
            : Math.max(0, table.length - 1);

        return { total, table };
      }
    }

    throw new EcometError('Unexpected response format', ErrorCode.QUERY_FAILED, { response });
  }

  private ensureTable(value: unknown[]): unknown[][] {
    if (value.length === 0) {
      return [];
    }

    if (!value.every((row) => Array.isArray(row))) {
      throw new EcometError('Unexpected response format', ErrorCode.QUERY_FAILED, {
        response: value,
      });
    }

    return value as unknown[][];
  }

  private parseTable(table: unknown[][]): Record<string, unknown>[] {
    if (table.length === 0) {
      return [];
    }

    const headerRow = table[0];
    if (!Array.isArray(headerRow)) {
      throw new EcometError('Unexpected response format', ErrorCode.QUERY_FAILED, {
        response: table,
      });
    }

    const headers = headerRow.map((header) => String(header));
    const objects: Record<string, unknown>[] = [];

    for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
      const row = table[rowIndex];
      if (!Array.isArray(row)) {
        throw new EcometError('Unexpected response format', ErrorCode.QUERY_FAILED, {
          response: table,
        });
      }

      const object: Record<string, unknown> = {};
      for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
        object[headers[columnIndex]] = row[columnIndex];
      }
      objects.push(object);
    }

    return objects;
  }

  private shouldReconnect(error: unknown): boolean {
    if (error instanceof EcometError && error.code === ErrorCode.TIMEOUT) {
      return true;
    }

    const errorString = this.errorText(error).toLowerCase();
    return (
      errorString.includes('connection') ||
      errorString.includes('timeout') ||
      errorString.includes('timed out') ||
      errorString.includes('closed') ||
      errorString.includes('socket')
    );
  }

  private toConnectionError(error: unknown): EcometError {
    if (error instanceof EcometError) {
      return error;
    }
    return wrapError(error, ErrorCode.CONNECTION_FAILED);
  }

  private toQueryError(error: unknown, timeout: number): EcometError {
    if (error instanceof EcometError) {
      return error;
    }

    const errorString = this.errorText(error);
    if (errorString.toLowerCase().includes('timeout')) {
      return new EcometError(
        `Query timed out after ${timeout}ms`,
        ErrorCode.TIMEOUT,
        { statementError: error },
      );
    }

    return new EcometError(`Query failed: ${errorString}`, ErrorCode.QUERY_FAILED, {
      statementError: error,
    });
  }

  private parseHost(host: string): { hostName: string; port: number } {
    const trimmed = host.trim();
    if (!trimmed) {
      throw new EcometError(
        `Connection error: Invalid host format: ${host}`,
        ErrorCode.CONNECTION_FAILED,
      );
    }

    const delimiterIndex = trimmed.lastIndexOf(':');
    const hostName = delimiterIndex >= 0 ? trimmed.slice(0, delimiterIndex) : trimmed;
    const portRaw = delimiterIndex >= 0 ? trimmed.slice(delimiterIndex + 1) : '9000';
    const port = Number.parseInt(portRaw, 10);

    if (!hostName || Number.isNaN(port) || port <= 0) {
      throw new EcometError(
        `Connection error: Invalid host format: ${host}`,
        ErrorCode.CONNECTION_FAILED,
      );
    }

    return { hostName, port };
  }

  private async waitReconnectDelay(): Promise<void> {
    if (this.config.reconnectDelayMs <= 0 || this.lastCloseTime === 0) {
      return;
    }

    const elapsed = Date.now() - this.lastCloseTime;
    const waitMs = Math.max(0, this.config.reconnectDelayMs - elapsed);
    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private markDisconnected(): void {
    this.connection = null;
    this.state = 'disconnected';
    this.lastCloseTime = Date.now();
  }

  private rejectPendingQueries(error: unknown): void {
    if (this.pendingQueryRejectors.size === 0) {
      return;
    }

    const rejectors = [...this.pendingQueryRejectors];
    this.pendingQueryRejectors.clear();
    for (const rejector of rejectors) {
      rejector(error);
    }
  }

  private errorText(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
