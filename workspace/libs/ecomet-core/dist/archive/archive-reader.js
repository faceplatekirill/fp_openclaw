import { EcometError, ErrorCode } from '../utils/errors.js';
import { validateArchives, validateTimestampMs } from '../utils/validators.js';
export async function readArchives(client, params) {
    const archives = validateArchives(params.archives);
    const from = validateTimestampMs(params.from, 'from');
    const to = validateTimestampMs(params.to, 'to');
    if (from > to) {
        throw new EcometError(`'from' must be <= 'to' (got from=${from}, to=${to})`, ErrorCode.INVALID_PARAMS);
    }
    const response = await client.application('fp_json', 'read_archives', {
        archives,
        from,
        to,
    });
    if (response === null || response === undefined) {
        return {};
    }
    if (typeof response !== 'object' || Array.isArray(response)) {
        throw new EcometError(`read_archives returned unexpected response type: ${typeof response}`, ErrorCode.QUERY_FAILED, { response });
    }
    return response;
}
//# sourceMappingURL=archive-reader.js.map