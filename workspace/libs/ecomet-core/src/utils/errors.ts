/**
 * Error Handling Utilities
 * 
 * Standardized error types and handling for Ecomet operations.
 */

/**
 * Error codes
 */
export enum ErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  QUERY_FAILED = 'QUERY_FAILED',
  TIMEOUT = 'TIMEOUT',
  INVALID_PARAMS = 'INVALID_PARAMS',
  NOT_FOUND = 'NOT_FOUND',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Ecomet Error
 */
export class EcometError extends Error {
  code: ErrorCode;
  details?: unknown;
  
  constructor(message: string, code: ErrorCode = ErrorCode.UNKNOWN, details?: unknown) {
    super(message);
    this.name = 'EcometError';
    this.code = code;
    this.details = details;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, EcometError);
    }
  }
}

/**
 * Wrap unknown error into EcometError
 */
export function wrapError(error: unknown, code: ErrorCode = ErrorCode.UNKNOWN): EcometError {
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
export function formatError(error: unknown): string {
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
export function formatErrorForLog(error: unknown): string {
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
