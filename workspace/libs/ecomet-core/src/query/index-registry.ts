import { type EcometClient } from '../client/ecomet-client.js';
import { escapeLiteral } from '../utils/query-utils.js';

type IndexType = 'simple' | '3gram' | 'datetime';
export type IndexName = IndexType;

const ALL_PATTERNS_QUERY =
  "get .folder, .name, index from * where .pattern = $oid('/root/.patterns/.field') page 1:10000 format $to_json";

const SYSTEM_FIELD_TYPES: Record<string, IndexType[]> = {
  '.fp_path': ['simple', '3gram'],
  '.name': ['simple', '3gram'],
  '.pattern': ['simple'],
  '.folder': ['simple'],
};

const registryPatternStore = new WeakMap<IndexRegistry, Map<string, Map<string, IndexType[]>>>();
export interface IndexEntry {
  /** Field has a simple (exact-match) index */
  simple: boolean;
  /** Field has a 3gram (substring) index */
  trigram: boolean;
  /** Field has a datetime (range) index */
  datetime: boolean;
}

export interface PatternIndexesResult {
  pattern: string;
  fields: Record<string, IndexEntry>;
}

export type TypesInfoFieldResult = IndexName[] | 'invalid field';
export type TypesInfoTypeResult = Record<string, TypesInfoFieldResult> | 'invalid type';
export type TypesInfoResult = Record<string, TypesInfoTypeResult>;

export class IndexRegistry {
  private readonly client: EcometClient;
  private patterns: Map<string, Map<string, IndexType[]>> = new Map();
  private missingPatterns: Set<string> = new Set();

  constructor(client: EcometClient) {
    this.client = client;
    registryPatternStore.set(this, this.patterns);
  }

  async init(): Promise<void> {
    const next = await this.fetchAllPatterns();
    this.replacePatterns(next);
  }

  async update(): Promise<void> {
    const next = await this.fetchAllPatterns();
    this.replacePatterns(next);
  }

  async loadPattern(patternPath: string): Promise<boolean> {
    if (this.patterns.has(patternPath)) {
      return true;
    }

    if (this.missingPatterns.has(patternPath)) {
      return false;
    }

    const query =
      `get .name, index from * where .folder = $oid('${escapeLiteral(patternPath)}') page 1:10000 format $to_json`;
    const result = await this.client.queryObjects(query);

    const fields = new Map<string, IndexType[]>();
    for (const row of result.objects) {
      const fieldName = row['.name'];
      if (typeof fieldName !== 'string' || fieldName.length === 0) {
        continue;
      }
      fields.set(fieldName, parseIndexTypes(row.index));
    }

    if (fields.size === 0) {
      this.patterns.delete(patternPath);
      this.missingPatterns.add(patternPath);
      return false;
    }

    this.patterns.set(patternPath, fields);
    this.missingPatterns.delete(patternPath);
    return true;
  }

  hasPattern(patternPath: string): boolean {
    return this.patterns.has(patternPath);
  }

  getFieldIndex(patternPath: string, fieldName: string): IndexEntry | null {
    const systemTypes = SYSTEM_FIELD_TYPES[fieldName];
    if (systemTypes) {
      return toIndexEntry(systemTypes);
    }

    const pattern = this.patterns.get(patternPath);
    if (!pattern) {
      return null;
    }

    const fieldTypes = pattern.get(fieldName);
    if (!fieldTypes) {
      return null;
    }

    return toIndexEntry(fieldTypes);
  }

  private async fetchAllPatterns(): Promise<Map<string, Map<string, IndexType[]>>> {
    const result = await this.client.queryObjects(ALL_PATTERNS_QUERY);
    const patterns = new Map<string, Map<string, IndexType[]>>();

    for (const row of result.objects) {
      const patternPath = row['.folder'];
      const fieldName = row['.name'];

      if (
        typeof patternPath !== 'string' ||
        patternPath.length === 0 ||
        typeof fieldName !== 'string' ||
        fieldName.length === 0
      ) {
        continue;
      }

      let fields = patterns.get(patternPath);
      if (!fields) {
        fields = new Map<string, IndexType[]>();
        patterns.set(patternPath, fields);
      }

      fields.set(fieldName, parseIndexTypes(row.index));
    }

    return patterns;
  }

  private replacePatterns(next: Map<string, Map<string, IndexType[]>>): void {
    this.patterns = next;
    this.missingPatterns.clear();
    registryPatternStore.set(this, this.patterns);
  }
}

export function listKnownTypes(registry: IndexRegistry): string[] {
  const patterns = registryPatternStore.get(registry);
  return [...(patterns?.keys() ?? [])].sort((left, right) => left.localeCompare(right));
}

export async function listFieldsForType(
  registry: IndexRegistry,
  patternPath: string,
): Promise<Record<string, IndexName[]> | null> {
  const patternFields = await getPatternFieldMap(registry, patternPath);
  if (!patternFields) {
    return null;
  }

  return buildFieldIndexMap(patternFields);
}

export async function listFieldsForTypes(
  registry: IndexRegistry,
  patternPaths: string[],
): Promise<Record<string, Record<string, IndexName[]> | 'invalid type'>> {
  const result: Record<string, Record<string, IndexName[]> | 'invalid type'> = {};

  for (const patternPath of normalizeNames(patternPaths)) {
    result[patternPath] = (await listFieldsForType(registry, patternPath)) ?? 'invalid type';
  }

  return result;
}

export async function getTypeFieldIndexes(
  registry: IndexRegistry,
  patternPath: string,
  fieldNames: string[],
): Promise<Record<string, TypesInfoFieldResult> | 'invalid type'> {
  const patternFields = await getPatternFieldMap(registry, patternPath);
  if (!patternFields) {
    return 'invalid type';
  }

  const result: Record<string, TypesInfoFieldResult> = {};

  for (const fieldName of normalizeNames(fieldNames)) {
    const systemTypes = SYSTEM_FIELD_TYPES[fieldName];
    if (systemTypes) {
      result[fieldName] = cloneIndexNames(systemTypes);
      continue;
    }

    const fieldTypes = patternFields.get(fieldName);
    result[fieldName] = fieldTypes ? cloneIndexNames(fieldTypes) : 'invalid field';
  }

  return result;
}

export async function getPatternIndexes(
  registry: IndexRegistry,
  patternPath: string,
): Promise<PatternIndexesResult> {
  const patternFields = await getPatternFieldMap(registry, patternPath);
  const fields: Record<string, IndexEntry> = {};

  for (const [fieldName, types] of Object.entries(buildFieldIndexMap(patternFields ?? undefined))) {
    fields[fieldName] = toIndexEntry(types);
  }

  return {
    pattern: patternPath,
    fields,
  };
}

async function getPatternFieldMap(
  registry: IndexRegistry,
  patternPath: string,
): Promise<Map<string, IndexType[]> | null> {
  const normalizedPatternPath = patternPath.trim();
  if (normalizedPatternPath.length === 0) {
    return null;
  }

  const patterns = registryPatternStore.get(registry);
  const existing = patterns?.get(normalizedPatternPath);
  if (existing) {
    return existing;
  }

  const loaded = await registry.loadPattern(normalizedPatternPath);
  if (!loaded) {
    return null;
  }

  return registryPatternStore.get(registry)?.get(normalizedPatternPath) ?? null;
}

function buildFieldIndexMap(
  patternFields?: Map<string, IndexType[]>,
): Record<string, IndexName[]> {
  const fields: Record<string, IndexName[]> = {};

  for (const fieldName of Object.keys(SYSTEM_FIELD_TYPES).sort((left, right) => left.localeCompare(right))) {
    fields[fieldName] = cloneIndexNames(SYSTEM_FIELD_TYPES[fieldName]);
  }

  if (!patternFields) {
    return fields;
  }

  for (const [fieldName, types] of [...patternFields.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    fields[fieldName] = cloneIndexNames(types);
  }

  return fields;
}

function cloneIndexNames(types: IndexType[]): IndexName[] {
  return [...types];
}

function normalizeNames(values: string[]): string[] {
  const normalized = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return [...new Set(normalized)];
}

function toIndexEntry(types: IndexType[]): IndexEntry {
  return {
    simple: types.includes('simple'),
    trigram: types.includes('3gram'),
    datetime: types.includes('datetime'),
  };
}

function parseIndexTypes(value: unknown): IndexType[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const types: IndexType[] = [];
  const seen = new Set<IndexType>();

  for (const entry of value) {
    if (!isIndexType(entry) || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    types.push(entry);
  }

  return types;
}

function isIndexType(value: unknown): value is IndexType {
  return value === 'simple' || value === '3gram' || value === 'datetime';
}
