import { readArchives } from './archive-reader.js';
import { resolveArchives } from './archive-resolver.js';
import { EcometError, ErrorCode } from '../utils/errors.js';
import { validateTimestampMs } from '../utils/validators.js';
function toCompositeKey(objectPath, fieldName) {
    return `${objectPath}:${fieldName}`;
}
function normalizeTagsForOrdering(tags) {
    const dedupe = new Set();
    const normalized = [];
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
export async function fieldReadHistory(client, params) {
    const from = validateTimestampMs(params.from, 'from');
    const to = validateTimestampMs(params.to, 'to');
    if (from > to) {
        throw new EcometError(`'from' must be <= 'to' (got from=${from}, to=${to})`, ErrorCode.INVALID_PARAMS);
    }
    const resolved = await resolveArchives(client, { tags: params.tags });
    const orderedTags = normalizeTagsForOrdering(params.tags);
    const unresolvedSet = new Set(resolved.unresolved);
    const invalidObjects = new Set(resolved.invalid);
    const archivePathToKey = {};
    const invalid = [];
    const unresolved = [];
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
    const values = {};
    for (const archivePath of resolvedArchivePaths) {
        const key = archivePathToKey[archivePath];
        const series = readResult[archivePath];
        values[key] = Array.isArray(series) ? series : [];
    }
    return { values, invalid, unresolved };
}
//# sourceMappingURL=field-history.js.map