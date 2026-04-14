import { type EcometClient } from '../client/ecomet-client.js';
import { EcometError, ErrorCode } from '../utils/errors.js';
import { validateArchives, validateTimestampMs } from '../utils/validators.js';

export interface ReadArchivesParams {
  archives: string[];
  from: number;
  to: number;
}

export type ArchiveDataPoint = [number, number | null];

export type ArchiveSeries = ArchiveDataPoint[];

export type ReadArchivesResult = Record<string, ArchiveSeries>;

export async function readArchives(
  client: EcometClient,
  params: ReadArchivesParams,
): Promise<ReadArchivesResult> {
  const archives = validateArchives(params.archives);
  const from = validateTimestampMs(params.from, 'from');
  const to = validateTimestampMs(params.to, 'to');

  if (from > to) {
    throw new EcometError(
      `'from' must be <= 'to' (got from=${from}, to=${to})`,
      ErrorCode.INVALID_PARAMS,
    );
  }

  const response = await client.application<unknown>('fp_json', 'read_archives', {
    archives,
    from,
    to,
  });

  if (response === null || response === undefined) {
    return {};
  }

  if (typeof response !== 'object' || Array.isArray(response)) {
    throw new EcometError(
      `read_archives returned unexpected response type: ${typeof response}`,
      ErrorCode.QUERY_FAILED,
      { response },
    );
  }

  return response as ReadArchivesResult;
}
