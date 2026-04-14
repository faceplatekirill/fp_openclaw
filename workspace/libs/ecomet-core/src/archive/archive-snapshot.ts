import { type EcometClient } from '../client/ecomet-client.js';
import { EcometError, ErrorCode } from '../utils/errors.js';
import { validateArchives, validateTimestampMs } from '../utils/validators.js';

export interface GetSnapshotParams {
  archives: string[];
  timestamp: number;
}

export type GetSnapshotResult = Record<string, number | null | undefined>;

export async function getSnapshot(
  client: EcometClient,
  params: GetSnapshotParams,
): Promise<GetSnapshotResult> {
  const archives = validateArchives(params.archives);
  const timestamp = validateTimestampMs(params.timestamp, 'timestamp');

  const response = await client.application<unknown>('fp_json', 'get_points', {
    archives,
    ts: timestamp,
  });

  if (response === null || response === undefined) {
    return {};
  }

  if (typeof response !== 'object' || Array.isArray(response)) {
    throw new EcometError(
      `get_points returned unexpected response type: ${typeof response}`,
      ErrorCode.QUERY_FAILED,
      { response },
    );
  }

  return response as GetSnapshotResult;
}
