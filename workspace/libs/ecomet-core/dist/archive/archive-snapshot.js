import { EcometError, ErrorCode } from '../utils/errors.js';
import { validateArchives, validateTimestampMs } from '../utils/validators.js';
export async function getSnapshot(client, params) {
    const archives = validateArchives(params.archives);
    const timestamp = validateTimestampMs(params.timestamp, 'timestamp');
    const response = await client.application('fp_json', 'get_points', {
        archives,
        ts: timestamp,
    });
    if (response === null || response === undefined) {
        return {};
    }
    if (typeof response !== 'object' || Array.isArray(response)) {
        throw new EcometError(`get_points returned unexpected response type: ${typeof response}`, ErrorCode.QUERY_FAILED, { response });
    }
    return response;
}
//# sourceMappingURL=archive-snapshot.js.map