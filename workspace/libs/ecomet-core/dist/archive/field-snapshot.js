import { getSnapshot } from './archive-snapshot.js';
import { resolveArchives } from './archive-resolver.js';
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
export async function fieldSnapshot(client, params) {
    const timestamp = validateTimestampMs(params.timestamp, 'timestamp');
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
    const snapshotResult = await getSnapshot(client, {
        archives: resolvedArchivePaths,
        timestamp,
    });
    const values = {};
    for (const archivePath of resolvedArchivePaths) {
        const key = archivePathToKey[archivePath];
        const value = snapshotResult[archivePath];
        values[key] = typeof value === 'number' || value === null ? value : null;
    }
    return { values, invalid, unresolved };
}
//# sourceMappingURL=field-snapshot.js.map