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
export declare class EcometClient {
    private readonly config;
    private readonly logger?;
    private connection;
    private state;
    private connectionPromise;
    private pendingQueryRejectors;
    private nextHostIndex;
    private lastCloseTime;
    constructor(config?: EcometConfig, logger?: Logger);
    connect(): Promise<void>;
    query<T = unknown>(statement: string, options?: {
        timeout?: number;
    }): Promise<T>;
    application<T = unknown>(module: string, method: string, params: unknown, options?: {
        timeout?: number;
    }): Promise<T>;
    queryObjects(statement: string, options?: {
        timeout?: number;
    }): Promise<QueryResult>;
    isConnected(): boolean;
    getState(): ConnectionState;
    close(): Promise<void>;
    private executeQuery;
    private executeApplication;
    private queryOnce;
    private applicationOnce;
    private tryConnectAllHosts;
    private connectToHost;
    private normalizeResponse;
    private ensureTable;
    private parseTable;
    private shouldReconnect;
    private toConnectionError;
    private toQueryError;
    private parseHost;
    private waitReconnectDelay;
    private sleep;
    private markDisconnected;
    private rejectPendingQueries;
    private errorText;
}
//# sourceMappingURL=ecomet-client.d.ts.map