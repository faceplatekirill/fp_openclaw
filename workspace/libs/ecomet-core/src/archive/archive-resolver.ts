import { type EcometClient } from '../client/ecomet-client.js';
import { EcometError, ErrorCode } from '../utils/errors.js';

const TAGS_ERROR = 'tags must be a non-empty array of { object, field } entries';
const TAG_ENTRY_ERROR =
  "each tag must have 'object' (string) and 'field' (string) properties (element at index %INDEX% is invalid)";
const RESPONSE_ERROR =
  "get_tags_archive returned unexpected response type: expected object with 'tags' and 'invalid_tags'";

export interface TagSpec {
  object: string;
  field: string;
}

export interface ResolveArchivesParams {
  tags: TagSpec[];
}

export interface ResolveArchivesResult {
  resolved: Record<string, string>;
  unresolved: string[];
  invalid: string[];
}

interface ResolveArchivesApiResponse {
  tags: Record<string, Record<string, string>>;
  invalid_tags: string[];
}

function formatTagEntryError(index: number): string {
  return TAG_ENTRY_ERROR.replace('%INDEX%', String(index));
}

function validateTags(tags: unknown): TagSpec[] {
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new EcometError(TAGS_ERROR, ErrorCode.INVALID_PARAMS);
  }

  const normalized: TagSpec[] = [];
  const dedupe = new Set<string>();

  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index];
    if (!tag || typeof tag !== 'object' || Array.isArray(tag)) {
      throw new EcometError(formatTagEntryError(index), ErrorCode.INVALID_PARAMS);
    }

    const candidate = tag as Partial<TagSpec>;
    if (typeof candidate.object !== 'string' || typeof candidate.field !== 'string') {
      throw new EcometError(formatTagEntryError(index), ErrorCode.INVALID_PARAMS);
    }

    const object = candidate.object.trim();
    const field = candidate.field.trim();
    if (object.length === 0 || field.length === 0) {
      throw new EcometError(formatTagEntryError(index), ErrorCode.INVALID_PARAMS);
    }

    const key = `${object}:${field}`;
    if (dedupe.has(key)) {
      continue;
    }

    dedupe.add(key);
    normalized.push({ object, field });
  }

  return normalized;
}

function buildRequestMap(tags: TagSpec[]): Record<string, string[]> {
  const requestMap: Record<string, string[]> = {};

  for (const tag of tags) {
    const fields = requestMap[tag.object];
    if (!fields) {
      requestMap[tag.object] = [tag.field];
      continue;
    }

    fields.push(tag.field);
  }

  return requestMap;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateResponse(response: unknown): ResolveArchivesApiResponse {
  if (!isRecord(response)) {
    throw new EcometError(RESPONSE_ERROR, ErrorCode.QUERY_FAILED, { response });
  }

  const tags = response.tags;
  const invalidTags = response.invalid_tags;

  if (!isRecord(tags) || !Array.isArray(invalidTags)) {
    throw new EcometError(RESPONSE_ERROR, ErrorCode.QUERY_FAILED, { response });
  }

  return {
    tags: tags as Record<string, Record<string, string>>,
    invalid_tags: invalidTags as string[],
  };
}

function toCompositeKey(objectPath: string, fieldName: string): string {
  return `${objectPath}:${fieldName}`;
}

export async function resolveArchives(
  client: EcometClient,
  params: ResolveArchivesParams,
): Promise<ResolveArchivesResult> {
  const tags = validateTags(params.tags);
  const requestMap = buildRequestMap(tags);

  const response = await client.application<unknown>('fp_json', 'get_tags_archive', requestMap);
  if (response === null || response === undefined) {
    return { resolved: {}, unresolved: [], invalid: [] };
  }

  const normalized = validateResponse(response);
  const invalidSet = new Set<string>();

  for (const invalidTag of normalized.invalid_tags) {
    if (typeof invalidTag === 'string' && invalidTag.length > 0) {
      invalidSet.add(invalidTag);
    }
  }

  const resolved: Record<string, string> = {};
  const unresolved: string[] = [];

  for (const tag of tags) {
    const key = toCompositeKey(tag.object, tag.field);

    if (invalidSet.has(tag.object)) {
      continue;
    }

    const fields = normalized.tags[tag.object];
    if (!isRecord(fields)) {
      continue;
    }

    const archivePath = fields[tag.field];
    if (typeof archivePath === 'string' && archivePath.length > 0) {
      resolved[key] = archivePath;
      continue;
    }

    unresolved.push(key);
  }

  return {
    resolved,
    unresolved,
    invalid: [...invalidSet],
  };
}
