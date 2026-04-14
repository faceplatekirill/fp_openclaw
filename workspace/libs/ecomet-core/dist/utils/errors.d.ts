/**
 * Error Handling Utilities
 *
 * Standardized error types and handling for Ecomet operations.
 */
/**
 * Error codes
 */
export declare enum ErrorCode {
    CONNECTION_FAILED = "CONNECTION_FAILED",
    AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED",
    QUERY_FAILED = "QUERY_FAILED",
    TIMEOUT = "TIMEOUT",
    INVALID_PARAMS = "INVALID_PARAMS",
    NOT_FOUND = "NOT_FOUND",
    UNKNOWN = "UNKNOWN"
}
/**
 * Ecomet Error
 */
export declare class EcometError extends Error {
    code: ErrorCode;
    details?: unknown;
    constructor(message: string, code?: ErrorCode, details?: unknown);
}
/**
 * Wrap unknown error into EcometError
 */
export declare function wrapError(error: unknown, code?: ErrorCode): EcometError;
/**
 * Format error for user display
 */
export declare function formatError(error: unknown): string;
/**
 * Format error for logging (includes details)
 */
export declare function formatErrorForLog(error: unknown): string;
//# sourceMappingURL=errors.d.ts.map