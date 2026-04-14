import { ErrorCode, EcometError } from '../utils/errors.js';
import { dedupePreserveOrder, escapeLiteral } from '../utils/query-utils.js';
const NO_CONDITIONS_ERROR = 'at least one search condition is required (pattern, folder, fields, or search)';
const SELECT_ERROR = 'select must be a non-empty array of field names';
const SEARCH_TEXT_EMPTY_ERROR = 'search.text must be a non-empty string';
const SEARCH_TEXT_SHORT_ERROR = 'search.text must be at least 3 characters (LIKE operator requirement)';
const SEARCH_IN_ERROR = 'search.in must be a non-empty array of field names';
const FIELDS_ERROR = 'fields must be a non-empty object';
const LIMIT_ERROR = 'limit must be a positive number';
const OFFSET_ERROR = 'offset must be a non-negative number';
export async function searchObjects(client, registry, params) {
    const normalized = validateParams(params);
    for (const pattern of normalized.patterns) {
        if (!registry.hasPattern(pattern)) {
            await registry.loadPattern(pattern);
        }
    }
    const { conditions, warnings } = buildConditions(normalized, registry);
    const whereClause = conditions.length === 1 ? conditions[0] : `AND(${conditions.join(', ')})`;
    const from = normalized.offset + 1;
    const to = normalized.offset + normalized.limit;
    const query = `get ${normalized.select.join(', ')} from 'project' where ${whereClause} page ${from}:${to} format $to_json`;
    const result = await client.queryObjects(query);
    return {
        total: result.total,
        objects: result.objects,
        warnings: dedupePreserveOrder(warnings),
    };
}
function validateParams(params) {
    const patterns = normalizePatterns(params.pattern);
    const folder = typeof params.folder === 'string' ? params.folder.trim() : undefined;
    const recursive = params.recursive ?? true;
    const fields = normalizeFields(params.fields);
    const search = normalizeSearch(params.search);
    const select = normalizeSelect(params.select);
    const limit = normalizeLimit(params.limit);
    const offset = normalizeOffset(params.offset);
    if (patterns.length === 0 && !folder && !fields && !search) {
        throw new EcometError(NO_CONDITIONS_ERROR, ErrorCode.INVALID_PARAMS);
    }
    return {
        patterns,
        folder,
        recursive,
        fields,
        search,
        select,
        limit,
        offset,
    };
}
function normalizePatterns(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? [trimmed] : [];
    }
    if (!Array.isArray(value)) {
        return [];
    }
    const normalized = value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0);
    return dedupePreserveOrder(normalized);
}
function normalizeFields(value) {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new EcometError(FIELDS_ERROR, ErrorCode.INVALID_PARAMS);
    }
    const entries = Object.entries(value)
        .map(([field, entryValue]) => [field.trim(), entryValue])
        .filter(([field]) => field.length > 0);
    if (entries.length === 0) {
        throw new EcometError(FIELDS_ERROR, ErrorCode.INVALID_PARAMS);
    }
    const result = {};
    for (const [field, entryValue] of entries) {
        if (typeof entryValue !== 'string' &&
            typeof entryValue !== 'number' &&
            typeof entryValue !== 'boolean') {
            throw new EcometError(FIELDS_ERROR, ErrorCode.INVALID_PARAMS);
        }
        result[field] = entryValue;
    }
    return result;
}
function normalizeSearch(value) {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new EcometError(SEARCH_TEXT_EMPTY_ERROR, ErrorCode.INVALID_PARAMS);
    }
    if (typeof value.text !== 'string' || value.text.trim().length === 0) {
        throw new EcometError(SEARCH_TEXT_EMPTY_ERROR, ErrorCode.INVALID_PARAMS);
    }
    const text = value.text.trim();
    if (text.length < 3) {
        throw new EcometError(SEARCH_TEXT_SHORT_ERROR, ErrorCode.INVALID_PARAMS);
    }
    if (!Array.isArray(value.in) || value.in.length === 0) {
        throw new EcometError(SEARCH_IN_ERROR, ErrorCode.INVALID_PARAMS);
    }
    const fields = value.in
        .map((field) => (typeof field === 'string' ? field.trim() : ''))
        .filter((field) => field.length > 0);
    if (fields.length === 0) {
        throw new EcometError(SEARCH_IN_ERROR, ErrorCode.INVALID_PARAMS);
    }
    return {
        text,
        in: dedupePreserveOrder(fields),
    };
}
function normalizeSelect(value) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new EcometError(SELECT_ERROR, ErrorCode.INVALID_PARAMS);
    }
    const normalized = value
        .map((field) => (typeof field === 'string' ? field.trim() : ''))
        .filter((field) => field.length > 0);
    if (normalized.length === 0) {
        throw new EcometError(SELECT_ERROR, ErrorCode.INVALID_PARAMS);
    }
    const unique = dedupePreserveOrder(normalized);
    if (unique.includes('.fp_path')) {
        return unique;
    }
    return ['.fp_path', ...unique];
}
function normalizeLimit(value) {
    if (value === undefined) {
        return 100;
    }
    if (typeof value !== 'number' ||
        !Number.isFinite(value) ||
        !Number.isInteger(value) ||
        value <= 0) {
        throw new EcometError(LIMIT_ERROR, ErrorCode.INVALID_PARAMS);
    }
    return value;
}
function normalizeOffset(value) {
    if (value === undefined) {
        return 0;
    }
    if (typeof value !== 'number' ||
        !Number.isFinite(value) ||
        !Number.isInteger(value) ||
        value < 0) {
        throw new EcometError(OFFSET_ERROR, ErrorCode.INVALID_PARAMS);
    }
    return value;
}
function buildConditions(params, registry) {
    const baseIndexed = [];
    const fieldIndexed = [];
    const searchIndexed = [];
    const fieldStrict = [];
    const searchStrict = [];
    const warnings = [];
    if (params.patterns.length === 1) {
        const pattern = params.patterns[0];
        baseIndexed.push(`.pattern = $oid('${escapeLiteral(pattern)}')`);
    }
    else if (params.patterns.length > 1) {
        const parts = params.patterns.map((pattern) => `.pattern = $oid('${escapeLiteral(pattern)}')`);
        baseIndexed.push(`OR(${parts.join(', ')})`);
    }
    if (params.folder) {
        if (params.recursive) {
            baseIndexed.push(`.fp_path LIKE '${escapeLiteral(normalizeFolder(params.folder))}'`);
        }
        else {
            baseIndexed.push(`.folder = $oid('${escapeLiteral(params.folder)}')`);
        }
    }
    if (params.fields) {
        for (const [fieldName, value] of Object.entries(params.fields)) {
            const formatted = formatValue(value);
            const indexedCheck = canUseIndexedOperator(fieldName, params.patterns, registry, 'simple');
            if (indexedCheck.canUseIndexed) {
                fieldIndexed.push(`${fieldName} = ${formatted}`);
            }
            else {
                fieldStrict.push(`${fieldName} := ${formatted}`);
                if (indexedCheck.warning) {
                    warnings.push(indexedCheck.warning);
                }
            }
        }
    }
    if (params.search) {
        const condition = buildSearchCondition(params.search, params.patterns, registry);
        if (condition.hasIndexed && !condition.hasStrict) {
            searchIndexed.push(condition.condition);
        }
        else {
            searchStrict.push(condition.condition);
        }
        warnings.push(...condition.warnings);
    }
    const conditions = [
        ...baseIndexed,
        ...fieldIndexed,
        ...searchIndexed,
        ...fieldStrict,
        ...searchStrict,
    ];
    return { conditions, warnings };
}
function buildSearchCondition(search, patterns, registry) {
    const indexed = [];
    const strict = [];
    const warnings = [];
    for (const fieldName of search.in) {
        const indexedCheck = canUseIndexedOperator(fieldName, patterns, registry, '3gram');
        const condition = indexedCheck.canUseIndexed
            ? `${fieldName} LIKE '${escapeLiteral(search.text)}'`
            : `${fieldName} :LIKE '${escapeLiteral(search.text)}'`;
        if (indexedCheck.canUseIndexed) {
            indexed.push(condition);
        }
        else {
            strict.push(condition);
            if (indexedCheck.warning) {
                warnings.push(indexedCheck.warning);
            }
        }
    }
    const ordered = [...indexed, ...strict];
    return {
        condition: ordered.length === 1 ? ordered[0] : `OR(${ordered.join(', ')})`,
        hasIndexed: indexed.length > 0,
        hasStrict: strict.length > 0,
        warnings,
    };
}
function normalizeFolder(folder) {
    return folder.endsWith('/') ? folder : `${folder}/`;
}
function formatValue(value) {
    if (typeof value === 'string') {
        return `'${escapeLiteral(value)}'`;
    }
    if (typeof value === 'number') {
        return `${value}`;
    }
    return value ? 'true' : 'false';
}
function isSystemField(name) {
    return name.startsWith('.');
}
function canUseIndexedOperator(fieldName, patterns, registry, indexKind) {
    const usesLike = indexKind === '3gram';
    const strictHint = usesLike ? 'strict LIKE' : 'strict comparison';
    const noIndexHint = usesLike ? 'has no 3gram index; using strict LIKE' : 'is not indexed; using strict comparison';
    if (patterns.length === 0) {
        if (isSystemField(fieldName)) {
            // System fields are resolved by IndexRegistry regardless of the pattern path value.
            const indexInfo = registry.getFieldIndex('', fieldName);
            return { canUseIndexed: Boolean(indexInfo?.[usesLike ? 'trigram' : 'simple']) };
        }
        return {
            canUseIndexed: false,
            warning: `No pattern specified; field '${fieldName}' uses ${strictHint} (may be slow)`,
        };
    }
    for (const pattern of patterns) {
        const indexInfo = registry.getFieldIndex(pattern, fieldName);
        const isIndexed = Boolean(indexInfo?.[usesLike ? 'trigram' : 'simple']);
        if (!isIndexed) {
            return {
                canUseIndexed: false,
                warning: `field '${fieldName}' on pattern '${pattern}' ${noIndexHint}`,
            };
        }
    }
    return { canUseIndexed: true };
}
//# sourceMappingURL=object-search.js.map