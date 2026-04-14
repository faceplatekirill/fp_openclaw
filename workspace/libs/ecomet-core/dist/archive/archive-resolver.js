import { EcometError, ErrorCode } from '../utils/errors.js';
const TAGS_ERROR = 'tags must be a non-empty array of { object, field } entries';
const TAG_ENTRY_ERROR = "each tag must have 'object' (string) and 'field' (string) properties (element at index %INDEX% is invalid)";
const RESPONSE_ERROR = "get_tags_archive returned unexpected response type: expected object with 'tags' and 'invalid_tags'";
function formatTagEntryError(index) {
    return TAG_ENTRY_ERROR.replace('%INDEX%', String(index));
}
function validateTags(tags) {
    if (!Array.isArray(tags) || tags.length === 0) {
        throw new EcometError(TAGS_ERROR, ErrorCode.INVALID_PARAMS);
    }
    const normalized = [];
    const dedupe = new Set();
    for (let index = 0; index < tags.length; index += 1) {
        const tag = tags[index];
        if (!tag || typeof tag !== 'object' || Array.isArray(tag)) {
            throw new EcometError(formatTagEntryError(index), ErrorCode.INVALID_PARAMS);
        }
        const candidate = tag;
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
function buildRequestMap(tags) {
    const requestMap = {};
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
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function validateResponse(response) {
    if (!isRecord(response)) {
        throw new EcometError(RESPONSE_ERROR, ErrorCode.QUERY_FAILED, { response });
    }
    const tags = response.tags;
    const invalidTags = response.invalid_tags;
    if (!isRecord(tags) || !Array.isArray(invalidTags)) {
        throw new EcometError(RESPONSE_ERROR, ErrorCode.QUERY_FAILED, { response });
    }
    return {
        tags: tags,
        invalid_tags: invalidTags,
    };
}
function toCompositeKey(objectPath, fieldName) {
    return `${objectPath}:${fieldName}`;
}
export async function resolveArchives(client, params) {
    const tags = validateTags(params.tags);
    const requestMap = buildRequestMap(tags);
    const response = await client.application('fp_json', 'get_tags_archive', requestMap);
    if (response === null || response === undefined) {
        return { resolved: {}, unresolved: [], invalid: [] };
    }
    const normalized = validateResponse(response);
    const invalidSet = new Set();
    for (const invalidTag of normalized.invalid_tags) {
        if (typeof invalidTag === 'string' && invalidTag.length > 0) {
            invalidSet.add(invalidTag);
        }
    }
    const resolved = {};
    const unresolved = [];
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
//# sourceMappingURL=archive-resolver.js.map