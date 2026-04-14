import { EcometError, ErrorCode } from '../utils/errors.js';
import { dedupePreserveOrder, escapeLiteral } from '../utils/query-utils.js';
const OBJECTS_ERROR = 'objects must be a non-empty array of strings';
const FIELDS_ERROR = 'fields must be a non-empty array of strings';
export async function readObjects(client, params) {
    const objects = validateObjects(params.objects);
    const fields = validateFields(params.fields);
    const uniqueObjects = dedupePreserveOrder(objects);
    const requestedFields = dedupePreserveOrder(fields);
    const selectFields = ['.fp_path', ...requestedFields.filter((field) => field !== '.fp_path')];
    const whereClause = buildWhereClause(uniqueObjects);
    const query = `get ${selectFields.join(', ')} from 'project' where ${whereClause} format $to_json`;
    const queryResult = await client.queryObjects(query);
    const byPath = indexByPath(queryResult.objects);
    const result = {};
    const includePathInOutput = requestedFields.includes('.fp_path');
    for (const path of objects) {
        const row = byPath.get(path);
        if (!row) {
            result[path] = null;
            continue;
        }
        const value = {};
        for (const field of requestedFields) {
            value[field] = Object.prototype.hasOwnProperty.call(row, field) ? row[field] : null;
        }
        if (!includePathInOutput) {
            delete value['.fp_path'];
        }
        result[path] = value;
    }
    return result;
}
function validateObjects(objects) {
    if (!Array.isArray(objects) || objects.length === 0) {
        throw new EcometError(OBJECTS_ERROR, ErrorCode.INVALID_PARAMS);
    }
    const normalized = objects.map((value) => (typeof value === 'string' ? value.trim() : value));
    const isValid = normalized.every((value) => typeof value === 'string' && value.length > 0);
    if (!isValid) {
        throw new EcometError(OBJECTS_ERROR, ErrorCode.INVALID_PARAMS);
    }
    return normalized;
}
function validateFields(fields) {
    if (!Array.isArray(fields) || fields.length === 0) {
        throw new EcometError(FIELDS_ERROR, ErrorCode.INVALID_PARAMS);
    }
    const normalized = fields.map((value) => (typeof value === 'string' ? value.trim() : value));
    const isValid = normalized.every((value) => typeof value === 'string' && value.length > 0);
    if (!isValid) {
        throw new EcometError(FIELDS_ERROR, ErrorCode.INVALID_PARAMS);
    }
    return normalized;
}
function buildWhereClause(objects) {
    if (objects.length === 1) {
        return `.fp_path = '${escapeLiteral(objects[0])}'`;
    }
    const parts = objects.map((path) => `.fp_path = '${escapeLiteral(path)}'`);
    return `OR(${parts.join(', ')})`;
}
function indexByPath(rows) {
    const byPath = new Map();
    for (const row of rows) {
        const path = row['.fp_path'];
        if (typeof path === 'string' && path.length > 0) {
            byPath.set(path, row);
        }
    }
    return byPath;
}
//# sourceMappingURL=object-reader.js.map