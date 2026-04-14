import { EcometError, ErrorCode } from './errors.js';
const MIN_MS_TIMESTAMP = 1_000_000_000_000;
const ARCHIVES_ERROR = 'archives must be a non-empty array of strings';
export function validateArchives(archives) {
    if (!Array.isArray(archives) || archives.length === 0) {
        throw new EcometError(ARCHIVES_ERROR, ErrorCode.INVALID_PARAMS);
    }
    const normalized = archives.map((value) => (typeof value === 'string' ? value.trim() : value));
    const isValid = normalized.every((value) => typeof value === 'string' && value.length > 0);
    if (!isValid) {
        throw new EcometError(ARCHIVES_ERROR, ErrorCode.INVALID_PARAMS);
    }
    return normalized;
}
export function validateTimestampMs(value, name) {
    if (typeof value !== 'number') {
        throw new EcometError(`'${name}' must be a timestamp in milliseconds, got: ${String(value)}`, ErrorCode.INVALID_PARAMS);
    }
    if (!Number.isFinite(value)) {
        throw new EcometError(`'${name}' must be a finite number, got: ${String(value)}`, ErrorCode.INVALID_PARAMS);
    }
    if (!Number.isInteger(value)) {
        throw new EcometError(`'${name}' must be an integer timestamp in milliseconds, got: ${String(value)}`, ErrorCode.INVALID_PARAMS);
    }
    if (value <= MIN_MS_TIMESTAMP) {
        throw new EcometError(`'${name}' appears to be in seconds (got ${value}), expected milliseconds — multiply by 1000`, ErrorCode.INVALID_PARAMS);
    }
    return value;
}
export function validateTimestamps(timestamps) {
    if (!Array.isArray(timestamps) || timestamps.length < 2) {
        throw new EcometError('timestamps must be an array of at least 2 integer millisecond timestamps', ErrorCode.INVALID_PARAMS);
    }
    const validated = timestamps.map((value, index) => validateTimestampMs(value, `timestamps[${index}]`));
    for (let index = 1; index < validated.length; index += 1) {
        const current = validated[index];
        const previous = validated[index - 1];
        if (current <= previous) {
            throw new EcometError(`timestamps must be monotonically increasing, but timestamps[${index}] (${current}) <= timestamps[${index - 1}] (${previous})`, ErrorCode.INVALID_PARAMS);
        }
    }
    return validated;
}
//# sourceMappingURL=validators.js.map