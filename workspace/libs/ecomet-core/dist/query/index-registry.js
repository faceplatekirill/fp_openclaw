import { escapeLiteral } from '../utils/query-utils.js';
const ALL_PATTERNS_QUERY = "get .folder, .name, index from * where .pattern = $oid('/root/.patterns/.field') page 1:10000 format $to_json";
const SYSTEM_FIELD_TYPES = {
    '.fp_path': ['simple', '3gram'],
    '.name': ['simple', '3gram'],
    '.pattern': ['simple'],
    '.folder': ['simple'],
};
const registryPatternStore = new WeakMap();
export class IndexRegistry {
    client;
    patterns = new Map();
    missingPatterns = new Set();
    constructor(client) {
        this.client = client;
        registryPatternStore.set(this, this.patterns);
    }
    async init() {
        const next = await this.fetchAllPatterns();
        this.replacePatterns(next);
    }
    async update() {
        const next = await this.fetchAllPatterns();
        this.replacePatterns(next);
    }
    async loadPattern(patternPath) {
        if (this.patterns.has(patternPath)) {
            return true;
        }
        if (this.missingPatterns.has(patternPath)) {
            return false;
        }
        const query = `get .name, index from * where .folder = $oid('${escapeLiteral(patternPath)}') page 1:10000 format $to_json`;
        const result = await this.client.queryObjects(query);
        const fields = new Map();
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
    hasPattern(patternPath) {
        return this.patterns.has(patternPath);
    }
    getFieldIndex(patternPath, fieldName) {
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
    async fetchAllPatterns() {
        const result = await this.client.queryObjects(ALL_PATTERNS_QUERY);
        const patterns = new Map();
        for (const row of result.objects) {
            const patternPath = row['.folder'];
            const fieldName = row['.name'];
            if (typeof patternPath !== 'string' ||
                patternPath.length === 0 ||
                typeof fieldName !== 'string' ||
                fieldName.length === 0) {
                continue;
            }
            let fields = patterns.get(patternPath);
            if (!fields) {
                fields = new Map();
                patterns.set(patternPath, fields);
            }
            fields.set(fieldName, parseIndexTypes(row.index));
        }
        return patterns;
    }
    replacePatterns(next) {
        this.patterns = next;
        this.missingPatterns.clear();
        registryPatternStore.set(this, this.patterns);
    }
}
export function listKnownTypes(registry) {
    const patterns = registryPatternStore.get(registry);
    return [...(patterns?.keys() ?? [])].sort((left, right) => left.localeCompare(right));
}
export async function listFieldsForType(registry, patternPath) {
    const patternFields = await getPatternFieldMap(registry, patternPath);
    if (!patternFields) {
        return null;
    }
    return buildFieldIndexMap(patternFields);
}
export async function listFieldsForTypes(registry, patternPaths) {
    const result = {};
    for (const patternPath of normalizeNames(patternPaths)) {
        result[patternPath] = (await listFieldsForType(registry, patternPath)) ?? 'invalid type';
    }
    return result;
}
export async function getTypeFieldIndexes(registry, patternPath, fieldNames) {
    const patternFields = await getPatternFieldMap(registry, patternPath);
    if (!patternFields) {
        return 'invalid type';
    }
    const result = {};
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
export async function getPatternIndexes(registry, patternPath) {
    const patternFields = await getPatternFieldMap(registry, patternPath);
    const fields = {};
    for (const [fieldName, types] of Object.entries(buildFieldIndexMap(patternFields ?? undefined))) {
        fields[fieldName] = toIndexEntry(types);
    }
    return {
        pattern: patternPath,
        fields,
    };
}
async function getPatternFieldMap(registry, patternPath) {
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
function buildFieldIndexMap(patternFields) {
    const fields = {};
    for (const fieldName of Object.keys(SYSTEM_FIELD_TYPES).sort((left, right) => left.localeCompare(right))) {
        fields[fieldName] = cloneIndexNames(SYSTEM_FIELD_TYPES[fieldName]);
    }
    if (!patternFields) {
        return fields;
    }
    for (const [fieldName, types] of [...patternFields.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        fields[fieldName] = cloneIndexNames(types);
    }
    return fields;
}
function cloneIndexNames(types) {
    return [...types];
}
function normalizeNames(values) {
    const normalized = values
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    return [...new Set(normalized)];
}
function toIndexEntry(types) {
    return {
        simple: types.includes('simple'),
        trigram: types.includes('3gram'),
        datetime: types.includes('datetime'),
    };
}
function parseIndexTypes(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const types = [];
    const seen = new Set();
    for (const entry of value) {
        if (!isIndexType(entry) || seen.has(entry)) {
            continue;
        }
        seen.add(entry);
        types.push(entry);
    }
    return types;
}
function isIndexType(value) {
    return value === 'simple' || value === '3gram' || value === 'datetime';
}
//# sourceMappingURL=index-registry.js.map