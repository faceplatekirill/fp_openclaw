import { type EcometClient } from '../client/ecomet-client.js';
import { getAggregates, type AggregateSpec } from './archive-aggregates.js';
import { resolveArchives, type TagSpec } from './archive-resolver.js';
import { EcometError, ErrorCode } from '../utils/errors.js';
import { validateTimestamps } from '../utils/validators.js';

export interface FieldAggregateTag extends TagSpec {
  functions: string[];
}

export interface FieldAggregatesParams {
  tags: FieldAggregateTag[];
  timestamps: number[];
}

export interface FieldAggregatesResult {
  values: Record<string, Record<string, Record<string, number | null | undefined>>>;
  invalid: string[];
  unresolved: string[];
}

const TAGS_ERROR = 'tags must be a non-empty array of { object, field, functions } entries';
const TAG_ENTRY_ERROR =
  "each tag must have 'functions' (non-empty string array) property (element at index %INDEX% is invalid)";
const BUILTIN_AGGREGATES = new Set([
  'avg',
  'min',
  'max',
  'integral',
  'standard_deviation',
]);

function formatTagEntryError(index: number): string {
  return TAG_ENTRY_ERROR.replace('%INDEX%', String(index));
}

function toCompositeKey(objectPath: string, fieldName: string): string {
  return `${objectPath}:${fieldName}`;
}

function isValidAggregateFn(fn: string): boolean {
  if (BUILTIN_AGGREGATES.has(fn)) {
    return true;
  }

  const colonIndex = fn.indexOf(':');
  return colonIndex > 0 && colonIndex < fn.length - 1 && fn.lastIndexOf(':') === colonIndex;
}

function validateTagsWithFunctions(tags: unknown): FieldAggregateTag[] {
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new EcometError(TAGS_ERROR, ErrorCode.INVALID_PARAMS);
  }

  for (let tagIndex = 0; tagIndex < tags.length; tagIndex += 1) {
    const tag = tags[tagIndex];
    if (!tag || typeof tag !== 'object' || Array.isArray(tag)) {
      throw new EcometError(formatTagEntryError(tagIndex), ErrorCode.INVALID_PARAMS);
    }

    const candidate = tag as Partial<FieldAggregateTag>;
    if (!Array.isArray(candidate.functions) || candidate.functions.length === 0) {
      throw new EcometError(formatTagEntryError(tagIndex), ErrorCode.INVALID_PARAMS);
    }

    for (let fnIndex = 0; fnIndex < candidate.functions.length; fnIndex += 1) {
      const functionName = candidate.functions[fnIndex];
      if (typeof functionName !== 'string' || functionName.length === 0) {
        throw new EcometError(formatTagEntryError(tagIndex), ErrorCode.INVALID_PARAMS);
      }

      if (!isValidAggregateFn(functionName)) {
        throw new EcometError(
          `invalid aggregate function '${functionName}' at tags[${tagIndex}].functions[${fnIndex}]: must be a built-in (avg, min, max, integral, standard_deviation) or 'module:function' format`,
          ErrorCode.INVALID_PARAMS,
        );
      }
    }
  }

  return tags as FieldAggregateTag[];
}

function normalizeTagsForOrdering(tags: FieldAggregateTag[]): FieldAggregateTag[] {
  const dedupe = new Map<
    string,
    {
      object: string;
      field: string;
      functions: string[];
      functionSet: Set<string>;
    }
  >();

  for (const tag of tags) {
    const object = tag.object.trim();
    const field = tag.field.trim();
    const key = toCompositeKey(object, field);

    const existing = dedupe.get(key);
    if (!existing) {
      const functions: string[] = [];
      const functionSet = new Set<string>();
      for (const functionName of tag.functions) {
        if (functionSet.has(functionName)) {
          continue;
        }
        functionSet.add(functionName);
        functions.push(functionName);
      }

      dedupe.set(key, { object, field, functions, functionSet });
      continue;
    }

    for (const functionName of tag.functions) {
      if (existing.functionSet.has(functionName)) {
        continue;
      }
      existing.functionSet.add(functionName);
      existing.functions.push(functionName);
    }
  }

  const normalized: FieldAggregateTag[] = [];
  for (const value of dedupe.values()) {
    normalized.push({
      object: value.object,
      field: value.field,
      functions: value.functions,
    });
  }
  return normalized;
}

export async function fieldAggregates(
  client: EcometClient,
  params: FieldAggregatesParams,
): Promise<FieldAggregatesResult> {
  const timestamps = validateTimestamps(params.timestamps);
  const tags = validateTagsWithFunctions(params.tags);

  const resolved = await resolveArchives(client, { tags });
  const orderedTags = normalizeTagsForOrdering(tags);

  const unresolvedSet = new Set<string>(resolved.unresolved);
  const invalidObjects = new Set<string>(resolved.invalid);
  const archivePathToKey: Record<string, string> = {};
  const aggregateSpecs: AggregateSpec[] = [];
  const invalid: string[] = [];
  const unresolved: string[] = [];

  for (const tag of orderedTags) {
    const compositeKey = toCompositeKey(tag.object, tag.field);
    const archivePath = resolved.resolved[compositeKey];

    if (typeof archivePath === 'string' && archivePath.length > 0) {
      archivePathToKey[archivePath] = compositeKey;
      for (const functionName of tag.functions) {
        aggregateSpecs.push([archivePath, functionName]);
      }
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

  if (Object.keys(archivePathToKey).length === 0) {
    return {
      values: {},
      invalid,
      unresolved,
    };
  }

  const aggregates = await getAggregates(client, {
    aggregates: aggregateSpecs,
    timestamps,
  });

  const values: FieldAggregatesResult['values'] = {};
  for (const [timestamp, timestampValues] of Object.entries(aggregates.values)) {
    const valueByKey: Record<string, Record<string, number | null | undefined>> = {};
    if (timestampValues && typeof timestampValues === 'object' && !Array.isArray(timestampValues)) {
      for (const [archivePath, functionValues] of Object.entries(timestampValues)) {
        const compositeKey = archivePathToKey[archivePath];
        if (!compositeKey) {
          continue;
        }

        if (
          functionValues &&
          typeof functionValues === 'object' &&
          !Array.isArray(functionValues)
        ) {
          valueByKey[compositeKey] = functionValues as Record<string, number | null | undefined>;
        }
      }
    }
    values[timestamp] = valueByKey;
  }

  return {
    values,
    invalid,
    unresolved,
  };
}
