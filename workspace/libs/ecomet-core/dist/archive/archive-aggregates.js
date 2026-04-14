import { EcometError, ErrorCode } from '../utils/errors.js';
import { validateTimestamps } from '../utils/validators.js';
const AGGREGATES_ERROR = 'aggregates must be a non-empty array of [archivePath, functionName] pairs';
const BUILTIN_AGGREGATES = new Set([
    'avg',
    'min',
    'max',
    'integral',
    'standard_deviation',
]);
function isValidAggregateFn(fn) {
    if (BUILTIN_AGGREGATES.has(fn)) {
        return true;
    }
    const colonIndex = fn.indexOf(':');
    return colonIndex > 0 && colonIndex < fn.length - 1 && fn.lastIndexOf(':') === colonIndex;
}
function validateAggregates(aggregates) {
    if (!Array.isArray(aggregates) || aggregates.length === 0) {
        throw new EcometError(AGGREGATES_ERROR, ErrorCode.INVALID_PARAMS);
    }
    const normalized = [];
    for (let index = 0; index < aggregates.length; index += 1) {
        const aggregate = aggregates[index];
        if (!Array.isArray(aggregate) || aggregate.length !== 2) {
            throw new EcometError(`each aggregate must be a [archivePath, functionName] pair (element at index ${index} is invalid)`, ErrorCode.INVALID_PARAMS);
        }
        const [archivePath, functionName] = aggregate;
        if (typeof archivePath !== 'string' || typeof functionName !== 'string') {
            throw new EcometError(`each aggregate must be a [archivePath, functionName] pair (element at index ${index} is invalid)`, ErrorCode.INVALID_PARAMS);
        }
        const normalizedArchivePath = archivePath.trim();
        if (normalizedArchivePath.length === 0 || functionName.length === 0) {
            throw new EcometError(`each aggregate must be a [archivePath, functionName] pair (element at index ${index} is invalid)`, ErrorCode.INVALID_PARAMS);
        }
        if (!isValidAggregateFn(functionName)) {
            throw new EcometError(`invalid aggregate function '${functionName}' at index ${index}: must be a built-in (avg, min, max, integral, standard_deviation) or 'module:function' format`, ErrorCode.INVALID_PARAMS);
        }
        normalized.push([normalizedArchivePath, functionName]);
    }
    return normalized;
}
export async function getAggregates(client, params) {
    const aggregates = validateAggregates(params.aggregates);
    const timestamps = validateTimestamps(params.timestamps);
    const response = await client.application('fp_archive', 'get_aggregates', {
        aggregates,
        timestamps,
    });
    if (response === null || response === undefined) {
        return { values: {}, invalid: {} };
    }
    if (typeof response !== 'object' || Array.isArray(response)) {
        throw new EcometError(`get_aggregates returned unexpected response type: ${typeof response}`, ErrorCode.QUERY_FAILED, { response });
    }
    return response;
}
//# sourceMappingURL=archive-aggregates.js.map