/**
 * Error Handling Utilities
 *
 * Standardized error types and handling for Ecomet operations.
 */
/**
 * Error codes
 */
export var ErrorCode;
(function (ErrorCode) {
    ErrorCode["CONNECTION_FAILED"] = "CONNECTION_FAILED";
    ErrorCode["AUTHENTICATION_FAILED"] = "AUTHENTICATION_FAILED";
    ErrorCode["QUERY_FAILED"] = "QUERY_FAILED";
    ErrorCode["TIMEOUT"] = "TIMEOUT";
    ErrorCode["INVALID_PARAMS"] = "INVALID_PARAMS";
    ErrorCode["NOT_FOUND"] = "NOT_FOUND";
    ErrorCode["UNKNOWN"] = "UNKNOWN";
})(ErrorCode || (ErrorCode = {}));
/**
 * Ecomet Error
 */
export class EcometError extends Error {
    code;
    details;
    constructor(message, code = ErrorCode.UNKNOWN, details) {
        super(message);
        this.name = 'EcometError';
        this.code = code;
        this.details = details;
        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, EcometError);
        }
    }
}
/**
 * Wrap unknown error into EcometError
 */
export function wrapError(error, code = ErrorCode.UNKNOWN) {
    if (error instanceof EcometError) {
        return error;
    }
    if (error instanceof Error) {
        return new EcometError(error.message, code, { originalError: error });
    }
    return new EcometError(String(error), code, { originalError: error });
}
/**
 * Format error for user display
 */
export function formatError(error) {
    if (error instanceof EcometError) {
        return `[${error.code}] ${error.message}`;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
/**
 * Format error for logging (includes details)
 */
export function formatErrorForLog(error) {
    if (error instanceof EcometError) {
        const parts = [`[${error.code}] ${error.message}`];
        if (error.details) {
            parts.push(`Details: ${JSON.stringify(error.details)}`);
        }
        if (error.stack) {
            parts.push(`Stack: ${error.stack}`);
        }
        return parts.join('\n');
    }
    if (error instanceof Error) {
        return error.stack || error.message;
    }
    return String(error);
}
//# sourceMappingURL=errors.js.map