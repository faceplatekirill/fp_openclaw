import { type EcometClient } from '../client/ecomet-client.js';
import { readArchives, type ArchiveSeries } from './archive-reader.js';
import { resolveArchives, type TagSpec } from './archive-resolver.js';
import { EcometError, ErrorCode } from '../utils/errors.js';
import { validateTimestampMs } from '../utils/validators.js';

export interface FieldReadHistoryParams {
  tags: TagSpec[];
  from: number;
  to: number;
}

export interface FieldReadHistoryResult {
  values: Record<string, ArchiveSeries>;
  invalid: string[];
  unresolved: string[];
}

function toCompositeKey(objectPath: string, fieldName: string): string {
  return `${objectPath}:${fieldName}`;
}

function normalizeTagsForOrdering(tags: TagSpec[]): TagSpec[] {
  const dedupe = new Set<string>();
  const normalized: TagSpec[] = [];

  for (const tag of tags) {
    const object = tag.object.trim();
    const field = tag.field.trim();
    const key = toCompositeKey(object, field);

    if (dedupe.has(key)) {
      continue;
    }

    dedupe.add(key);
    normalized.push({ object, field });
  }

  return normalized;
}

export async function fieldReadHistory(
  client: EcometClient,
  params: FieldReadHistoryParams,
): Promise<FieldReadHistoryResult> {
  const from = validateTimestampMs(params.from, 'from');
  const to = validateTimestampMs(params.to, 'to');

  if (from > to) {
    throw new EcometError(
      `'from' must be <= 'to' (got from=${from}, to=${to})`,
      ErrorCode.INVALID_PARAMS,
    );
  }

  const resolved = await resolveArchives(client, { tags: params.tags });
  const orderedTags = normalizeTagsForOrdering(params.tags);

  const unresolvedSet = new Set<string>(resolved.unresolved);
  const invalidObjects = new Set<string>(resolved.invalid);
  const archivePathToKey: Record<string, string> = {};
  const invalid: string[] = [];
  const unresolved: string[] = [];

  for (const tag of orderedTags) {
    const compositeKey = toCompositeKey(tag.object, tag.field);
    const archivePath = resolved.resolved[compositeKey];

    if (typeof archivePath === 'string' && archivePath.length > 0) {
      archivePathToKey[archivePath] = compositeKey;
      continue;
    }

    if (unresolvedSet.has(compositeKey)) {
      unresolved.push(compositeKey);
      continue;
    }

    if (invalidObjects.has(tag.object)) {
      invalid.push(compositeKey);
      continue;
    }

    unresolved.push(compositeKey);
  }

  const resolvedArchivePaths = Object.keys(archivePathToKey);
  if (resolvedArchivePaths.length === 0) {
    return { values: {}, invalid, unresolved };
  }

  const readResult = await readArchives(client, { archives: resolvedArchivePaths, from, to });
  const values: Record<string, ArchiveSeries> = {};

  for (const archivePath of resolvedArchivePaths) {
    const key = archivePathToKey[archivePath];
    const series = readResult[archivePath];
    values[key] = Array.isArray(series) ? series : [];
  }

  return { values, invalid, unresolved };
}
