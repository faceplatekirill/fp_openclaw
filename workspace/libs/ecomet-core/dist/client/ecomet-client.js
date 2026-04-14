import { Ecomet } from '../vendor/ecomet.js';
import { EcometError, ErrorCode, wrapError } from '../utils/errors.js';
export class EcometClient {
    config;
    logger;
    connection = null;
    state = 'disconnected';
    connectionPromise = null;
    pendingQueryRejectors = new Set();
    nextHostIndex = 0;
    lastCloseTime = 0;
    constructor(config = {}, logger) {
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
    connect() {
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
    async query(statement, options = {}) {
        const timeout = options.timeout ?? this.config.timeoutMs;
        return this.executeQuery(statement, timeout, true);
    }
    async application(module, method, params, options = {}) {
        const timeout = options.timeout ?? this.config.timeoutMs;
        return this.executeApplication(module, method, params, timeout, true);
    }
    async queryObjects(statement, options = {}) {
        const response = await this.query(statement, options);
        const normalized = this.normalizeResponse(response);
        if (normalized.table.length === 0) {
            return { total: 0, objects: [] };
        }
        return {
            total: normalized.total,
            objects: this.parseTable(normalized.table),
        };
    }
    isConnected() {
        return this.connection !== null && this.connection.is_ok();
    }
    getState() {
        return this.state;
    }
    async close() {
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
        }
        catch (error) {
            this.logger?.warn?.(`Error closing Ecomet connection: ${this.errorText(error)}`);
        }
    }
    async executeQuery(statement, timeout, allowReconnectRetry) {
        await this.connect();
        try {
            return await this.queryOnce(statement, timeout);
        }
        catch (error) {
            const wrapped = this.toQueryError(error, timeout);
            if (allowReconnectRetry && this.shouldReconnect(wrapped)) {
                this.logger?.warn?.(`Query connection issue, reconnecting once: ${wrapped.message}`);
                this.markDisconnected();
                this.rejectPendingQueries(new Error('Connection reset for retry'));
                await this.connect();
                return this.executeQuery(statement, timeout, false);
            }
            throw wrapped;
        }
    }
    async executeApplication(module, method, params, timeout, allowReconnectRetry) {
        await this.connect();
        try {
            return await this.applicationOnce(module, method, params, timeout);
        }
        catch (error) {
            const wrapped = this.toQueryError(error, timeout);
            if (allowReconnectRetry && this.shouldReconnect(wrapped)) {
                this.logger?.warn?.(`Application connection issue, reconnecting once: ${wrapped.message}`);
                this.markDisconnected();
                this.rejectPendingQueries(new Error('Connection reset for retry'));
                await this.connect();
                return this.executeApplication(module, method, params, timeout, false);
            }
            throw wrapped;
        }
    }
    queryOnce(statement, timeout) {
        if (!this.connection || !this.connection.is_ok()) {
            throw new EcometError('Connection error: No active connection', ErrorCode.CONNECTION_FAILED);
        }
        const connection = this.connection;
        return new Promise((resolve, reject) => {
            let settled = false;
            const finalize = () => {
                settled = true;
                this.pendingQueryRejectors.delete(rejectFromClose);
            };
            const rejectFromClose = (error) => {
                if (settled) {
                    return;
                }
                finalize();
                reject(error);
            };
            this.pendingQueryRejectors.add(rejectFromClose);
            const onSuccess = (result) => {
                if (settled) {
                    return;
                }
                finalize();
                resolve(result);
            };
            const onError = (error) => {
                if (settled) {
                    return;
                }
                finalize();
                reject(error);
            };
            try {
                connection.query(statement, onSuccess, onError, timeout);
            }
            catch (error) {
                if (settled) {
                    return;
                }
                finalize();
                reject(error);
            }
        });
    }
    applicationOnce(module, method, params, timeout) {
        if (!this.connection || !this.connection.is_ok()) {
            throw new EcometError('Connection error: No active connection', ErrorCode.CONNECTION_FAILED);
        }
        const connection = this.connection;
        return new Promise((resolve, reject) => {
            let settled = false;
            const finalize = () => {
                settled = true;
                this.pendingQueryRejectors.delete(rejectFromClose);
            };
            const rejectFromClose = (error) => {
                if (settled) {
                    return;
                }
                finalize();
                reject(error);
            };
            this.pendingQueryRejectors.add(rejectFromClose);
            const onSuccess = (result) => {
                if (settled) {
                    return;
                }
                finalize();
                resolve(result);
            };
            const onError = (error) => {
                if (settled) {
                    return;
                }
                finalize();
                reject(error);
            };
            try {
                connection.application(module, method, params, onSuccess, onError, timeout);
            }
            catch (error) {
                if (settled) {
                    return;
                }
                finalize();
                reject(error);
            }
        });
    }
    async tryConnectAllHosts() {
        if (this.config.hosts.length === 0) {
            this.state = 'error';
            throw new EcometError('All Ecomet hosts unreachable (tried: )', ErrorCode.CONNECTION_FAILED);
        }
        this.state = 'connecting';
        const startIndex = this.nextHostIndex % this.config.hosts.length;
        let lastError;
        for (let attempt = 0; attempt < this.config.hosts.length; attempt += 1) {
            const hostIndex = (startIndex + attempt) % this.config.hosts.length;
            const host = this.config.hosts[hostIndex];
            try {
                await this.connectToHost(host);
                this.state = 'connected';
                this.nextHostIndex = (hostIndex + 1) % this.config.hosts.length;
                this.logger?.info?.(`Ecomet connected: ${host}`);
                return;
            }
            catch (error) {
                lastError = error;
                this.logger?.warn?.(`Failed to connect to ${host}: ${this.errorText(error)}`);
            }
        }
        this.state = 'error';
        throw new EcometError(`All Ecomet hosts unreachable (tried: ${this.config.hosts.join(', ')})`, ErrorCode.CONNECTION_FAILED, { lastError });
    }
    connectToHost(host) {
        const { hostName, port } = this.parseHost(host);
        return new Promise((resolve, reject) => {
            const connection = new Ecomet();
            let settled = false;
            const resolveOnce = () => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve();
            };
            const rejectOnce = (error) => {
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
                connection.login(this.config.login, this.config.password, () => {
                    this.connection = connection;
                    this.state = 'connected';
                    resolveOnce();
                }, (error) => {
                    rejectOnce(new EcometError(`Login failed: ${this.errorText(error)}`, ErrorCode.AUTHENTICATION_FAILED, error));
                }, this.config.timeoutMs);
            };
            const onError = (error) => {
                rejectOnce(new EcometError(`Connection error: ${this.errorText(error)}`, ErrorCode.CONNECTION_FAILED, error));
            };
            try {
                connection.connect(hostName, port, this.config.protocol, onConnect, onError, onClose);
            }
            catch (error) {
                rejectOnce(new EcometError(`Connection error: ${this.errorText(error)}`, ErrorCode.CONNECTION_FAILED, error));
            }
        });
    }
    normalizeResponse(response) {
        if (response === null || response === undefined) {
            return { total: 0, table: [] };
        }
        if (Array.isArray(response)) {
            const table = this.ensureTable(response);
            return { total: Math.max(0, table.length - 1), table };
        }
        if (typeof response === 'object') {
            const candidate = response;
            if (Array.isArray(candidate.result)) {
                const table = this.ensureTable(candidate.result);
                const total = typeof candidate.count === 'number' && Number.isFinite(candidate.count)
                    ? candidate.count
                    : Math.max(0, table.length - 1);
                return { total, table };
            }
        }
        throw new EcometError('Unexpected response format', ErrorCode.QUERY_FAILED, { response });
    }
    ensureTable(value) {
        if (value.length === 0) {
            return [];
        }
        if (!value.every((row) => Array.isArray(row))) {
            throw new EcometError('Unexpected response format', ErrorCode.QUERY_FAILED, {
                response: value,
            });
        }
        return value;
    }
    parseTable(table) {
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
        const objects = [];
        for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
            const row = table[rowIndex];
            if (!Array.isArray(row)) {
                throw new EcometError('Unexpected response format', ErrorCode.QUERY_FAILED, {
                    response: table,
                });
            }
            const object = {};
            for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
                object[headers[columnIndex]] = row[columnIndex];
            }
            objects.push(object);
        }
        return objects;
    }
    shouldReconnect(error) {
        if (error instanceof EcometError && error.code === ErrorCode.TIMEOUT) {
            return true;
        }
        const errorString = this.errorText(error).toLowerCase();
        return (errorString.includes('connection') ||
            errorString.includes('timeout') ||
            errorString.includes('timed out') ||
            errorString.includes('closed') ||
            errorString.includes('socket'));
    }
    toConnectionError(error) {
        if (error instanceof EcometError) {
            return error;
        }
        return wrapError(error, ErrorCode.CONNECTION_FAILED);
    }
    toQueryError(error, timeout) {
        if (error instanceof EcometError) {
            return error;
        }
        const errorString = this.errorText(error);
        if (errorString.toLowerCase().includes('timeout')) {
            return new EcometError(`Query timed out after ${timeout}ms`, ErrorCode.TIMEOUT, { statementError: error });
        }
        return new EcometError(`Query failed: ${errorString}`, ErrorCode.QUERY_FAILED, {
            statementError: error,
        });
    }
    parseHost(host) {
        const trimmed = host.trim();
        if (!trimmed) {
            throw new EcometError(`Connection error: Invalid host format: ${host}`, ErrorCode.CONNECTION_FAILED);
        }
        const delimiterIndex = trimmed.lastIndexOf(':');
        const hostName = delimiterIndex >= 0 ? trimmed.slice(0, delimiterIndex) : trimmed;
        const portRaw = delimiterIndex >= 0 ? trimmed.slice(delimiterIndex + 1) : '9000';
        const port = Number.parseInt(portRaw, 10);
        if (!hostName || Number.isNaN(port) || port <= 0) {
            throw new EcometError(`Connection error: Invalid host format: ${host}`, ErrorCode.CONNECTION_FAILED);
        }
        return { hostName, port };
    }
    async waitReconnectDelay() {
        if (this.config.reconnectDelayMs <= 0 || this.lastCloseTime === 0) {
            return;
        }
        const elapsed = Date.now() - this.lastCloseTime;
        const waitMs = Math.max(0, this.config.reconnectDelayMs - elapsed);
        if (waitMs > 0) {
            await this.sleep(waitMs);
        }
    }
    sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
    markDisconnected() {
        this.connection = null;
        this.state = 'disconnected';
        this.lastCloseTime = Date.now();
    }
    rejectPendingQueries(error) {
        if (this.pendingQueryRejectors.size === 0) {
            return;
        }
        const rejectors = [...this.pendingQueryRejectors];
        this.pendingQueryRejectors.clear();
        for (const rejector of rejectors) {
            rejector(error);
        }
    }
    errorText(error) {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }
}
//# sourceMappingURL=ecomet-client.js.map