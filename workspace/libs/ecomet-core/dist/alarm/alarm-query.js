import { ErrorCode, EcometError } from '../utils/errors.js';
import { dedupePreserveOrder, escapeLiteral } from '../utils/query-utils.js';
import { validateTimestampMs } from '../utils/validators.js';
const ALARM_FIELD_INDEXES = {
    dt_on: { simple: true, trigram: false, datetime: true },
    dt_off: { simple: true, trigram: false, datetime: true },
    dt_ack: { simple: true, trigram: false, datetime: true },
    dt_comment: { simple: true, trigram: false, datetime: true },
    dt_device: { simple: true, trigram: false, datetime: true },
    active: { simple: true, trigram: false, datetime: false },
    acknowledged: { simple: true, trigram: false, datetime: false },
    fact: { simple: true, trigram: false, datetime: false },
    type: { simple: true, trigram: false, datetime: false },
    text: { simple: true, trigram: true, datetime: false },
    point: { simple: true, trigram: true, datetime: false },
    comment: { simple: false, trigram: true, datetime: false },
    category_1: { simple: false, trigram: true, datetime: false },
    category_2: { simple: false, trigram: true, datetime: false },
    category_3: { simple: false, trigram: true, datetime: false },
    category_4: { simple: false, trigram: true, datetime: false },
    category_5: { simple: false, trigram: true, datetime: false },
};
const SELECT_ERROR = 'select must be a non-empty array of field names';
const SEARCH_TEXT_EMPTY_ERROR = 'search.text must be a non-empty string';
const SEARCH_TEXT_SHORT_ERROR = 'search.text must be at least 3 characters (LIKE operator requirement)';
const SEARCH_IN_ERROR = 'search.in must be a non-empty array of field names';
const FIELDS_ERROR = 'fields must be a non-empty object';
const FOLDERS_ERROR = 'folders must be a non-empty array of paths';
const LIMIT_ERROR = 'limit must be a positive number';
const OFFSET_ERROR = 'offset must be a non-negative number';
const ACTIVE_ERROR = 'active must be a boolean';
const ACKNOWLEDGED_ERROR = 'acknowledged must be a boolean';
const TIME_ORDER_ERROR = 'time_from must be less than time_to';
const TIME_RANGE_ERROR = 'time range must not exceed 30 days';
const MAX_RANGE_MS = 30 * 24 * 60 * 60 * 1000;
const PATTERN_PATH = '/root/.patterns/alarm';
const PROJECT_ROOT_PATH = '/root/FP/PROJECT';
export async function queryAlarms(client, params) {
    const normalized = validateParams(params);
    const { conditions, warnings } = buildConditions(normalized);
    const whereClause = `AND(${conditions.join(', ')})`;
    const pageNumber = Math.floor(normalized.offset / normalized.limit) + 1;
    const pageSize = normalized.limit;
    const query = `get ${normalized.select.join(', ')} from 'archive' where ${whereClause} order by dt_on asc page ${pageNumber}:${pageSize} format $to_json`;
    const result = await client.queryObjects(query);
    return {
        total: result.total,
        alarms: result.objects,
        warnings: dedupePreserveOrder(warnings),
    };
}
function validateParams(params) {
    const timeFrom = validateTimestampMs(params.time_from, 'time_from');
    const timeTo = validateTimestampMs(params.time_to, 'time_to');
    if (timeFrom >= timeTo) {
        throw new EcometError(TIME_ORDER_ERROR, ErrorCode.INVALID_PARAMS);
    }
    if (timeTo - timeFrom > MAX_RANGE_MS) {
        throw new EcometError(TIME_RANGE_ERROR, ErrorCode.INVALID_PARAMS);
    }
    if (params.active !== undefined && typeof params.active !== 'boolean') {
        throw new EcometError(ACTIVE_ERROR, ErrorCode.INVALID_PARAMS);
    }
    if (params.acknowledged !== undefined && typeof params.acknowledged !== 'boolean') {
        throw new EcometError(ACKNOWLEDGED_ERROR, ErrorCode.INVALID_PARAMS);
    }
    const folders = normalizeFolders(params.folders);
    const fields = normalizeFields(params.fields);
    const search = normalizeSearch(params.search);
    const select = normalizeSelect(params.select);
    const limit = normalizeLimit(params.limit);
    const offset = normalizeOffset(params.offset);
    return {
        timeFrom,
        timeTo,
        active: params.active,
        acknowledged: params.acknowledged,
        folders,
        fields,
        search,
        select,
        limit,
        offset,
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
    return unique.includes('dt_on') ? unique : ['dt_on', ...unique];
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
    const inFields = value.in
        .map((field) => (typeof field === 'string' ? field.trim() : ''))
        .filter((field) => field.length > 0);
    if (inFields.length === 0) {
        throw new EcometError(SEARCH_IN_ERROR, ErrorCode.INVALID_PARAMS);
    }
    return {
        text,
        in: dedupePreserveOrder(inFields),
    };
}
function normalizeFields(value) {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new EcometError(FIELDS_ERROR, ErrorCode.INVALID_PARAMS);
    }
    const entries = Object.entries(value)
        .map(([fieldName, fieldValue]) => [fieldName.trim(), fieldValue])
        .filter(([fieldName]) => fieldName.length > 0);
    if (entries.length === 0) {
        throw new EcometError(FIELDS_ERROR, ErrorCode.INVALID_PARAMS);
    }
    const normalized = {};
    for (const [fieldName, fieldValue] of entries) {
        if (typeof fieldValue !== 'string' &&
            typeof fieldValue !== 'number' &&
            typeof fieldValue !== 'boolean') {
            throw new EcometError(FIELDS_ERROR, ErrorCode.INVALID_PARAMS);
        }
        normalized[fieldName] = fieldValue;
    }
    return normalized;
}
function normalizeFolders(value) {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value) || value.length === 0) {
        throw new EcometError(FOLDERS_ERROR, ErrorCode.INVALID_PARAMS);
    }
    const normalized = value
        .map((folder) => (typeof folder === 'string' ? normalizeFolderPath(folder) : ''))
        .filter((folder) => folder.length > 0);
    if (normalized.length === 0) {
        throw new EcometError(FOLDERS_ERROR, ErrorCode.INVALID_PARAMS);
    }
    return dedupePreserveOrder(normalized);
}
function normalizeLimit(value) {
    if (value === undefined) {
        return 200;
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
function buildConditions(params) {
    const indexedConditions = [];
    const strictConditions = [];
    const warnings = [];
    indexedConditions.push(`.pattern = $oid('${escapeLiteral(PATTERN_PATH)}')`);
    indexedConditions.push(`dt_on[${params.timeFrom}:${params.timeTo}]`);
    if (typeof params.active === 'boolean') {
        indexedConditions.push(`active = ${params.active ? 'true' : 'false'}`);
    }
    if (typeof params.acknowledged === 'boolean') {
        indexedConditions.push(`acknowledged = ${params.acknowledged ? 'true' : 'false'}`);
    }
    if (params.folders && params.folders.length > 0) {
        indexedConditions.push(buildFoldersCondition(params.folders));
    }
    if (params.fields) {
        for (const [fieldName, value] of Object.entries(params.fields)) {
            const indexEntry = alarmFieldIndex(fieldName);
            const formatted = formatValue(value);
            if (indexEntry?.simple) {
                indexedConditions.push(`${fieldName} = ${formatted}`);
                continue;
            }
            strictConditions.push(`${fieldName} := ${formatted}`);
            if (indexEntry?.trigram) {
                warnings.push(`field '${fieldName}' has no simple index on alarm pattern; using strict comparison`);
            }
            else {
                warnings.push(`field '${fieldName}' is not a known alarm field; using strict comparison`);
            }
        }
    }
    if (params.search) {
        const searchCondition = buildSearchCondition(params.search);
        if (searchCondition.hasStrict) {
            strictConditions.push(searchCondition.condition);
        }
        else {
            indexedConditions.push(searchCondition.condition);
        }
        warnings.push(...searchCondition.warnings);
    }
    return {
        conditions: [...indexedConditions, ...strictConditions],
        warnings,
    };
}
function buildSearchCondition(search) {
    const indexedConditions = [];
    const strictConditions = [];
    const warnings = [];
    const escaped = escapeLiteral(search.text);
    for (const fieldName of search.in) {
        const indexEntry = alarmFieldIndex(fieldName);
        if (indexEntry?.trigram) {
            indexedConditions.push(`${fieldName} LIKE '${escaped}'`);
            continue;
        }
        strictConditions.push(`${fieldName} :LIKE '${escaped}'`);
        warnings.push(`field '${fieldName}' has no 3gram index on alarm pattern; using strict LIKE`);
    }
    const orderedConditions = [...indexedConditions, ...strictConditions];
    return {
        condition: orderedConditions.length === 1
            ? orderedConditions[0]
            : `OR(${orderedConditions.join(', ')})`,
        hasStrict: strictConditions.length > 0,
        warnings,
    };
}
function buildFoldersCondition(folders) {
    const parts = folders.map((folder) => `point LIKE '${escapeLiteral(normalizeFolder(folder))}'`);
    return parts.length === 1 ? parts[0] : `OR(${parts.join(', ')})`;
}
function normalizeFolder(folder) {
    return folder.endsWith('/') ? folder : `${folder}/`;
}
function normalizeFolderPath(folder) {
    const trimmed = folder.trim();
    if (trimmed.length === 0) {
        return '';
    }
    if (trimmed === PROJECT_ROOT_PATH || trimmed === `${PROJECT_ROOT_PATH}/`) {
        return '/';
    }
    const relevant = trimmed.startsWith(`${PROJECT_ROOT_PATH}/`)
        ? trimmed.slice(PROJECT_ROOT_PATH.length)
        : trimmed;
    const withLeadingSlash = relevant.startsWith('/') ? relevant : `/${relevant}`;
    return withLeadingSlash !== '/' && withLeadingSlash.endsWith('/')
        ? withLeadingSlash.slice(0, -1)
        : withLeadingSlash;
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
function alarmFieldIndex(fieldName) {
    return ALARM_FIELD_INDEXES[fieldName] ?? null;
}
//# sourceMappingURL=alarm-query.js.map