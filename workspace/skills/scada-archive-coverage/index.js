const DEFAULT_TIMEZONE = 'UTC';
const BATCH_SIZE = 50;

const USAGE_HINT =
  'RETRY skill_run with corrected params. ' +
  'Minimal: skill_run({ skill: "scada-archive-coverage", tags: [{ object: "/root/FP/PROJECT/...", field: "out_value" }] }). ' +
  'Each tag: { object, field, label?, unit? }.';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toCompositeKey(objectPath, fieldName) {
  return `${objectPath}:${fieldName}`;
}

function buildScope(tagKeys) {
  if (tagKeys.length === 0) {
    return 'archive coverage';
  }

  const objectPaths = [];
  const seen = new Set();

  for (const tagKey of tagKeys) {
    const separatorIndex = tagKey.lastIndexOf(':');
    const objectPath = separatorIndex >= 0 ? tagKey.slice(0, separatorIndex) : tagKey;
    if (seen.has(objectPath)) {
      continue;
    }

    seen.add(objectPath);
    objectPaths.push(objectPath);
  }

  if (objectPaths.length <= 3) {
    return objectPaths.join(', ');
  }

  return `${objectPaths.slice(0, 3).join(', ')} +${objectPaths.length - 3} more`;
}

function validateTag(tag, index) {
  if (!isRecord(tag)) {
    throw new Error(`tags[${index}] must be an object. ${USAGE_HINT}`);
  }

  const allowedTagKeys = new Set(['object', 'field', 'label', 'unit']);
  const unknownTagKeys = Object.keys(tag).filter((k) => !allowedTagKeys.has(k));
  if (unknownTagKeys.length > 0) {
    throw new Error(`tags[${index}] has unexpected keys: ${unknownTagKeys.join(', ')}. Each tag supports only { object, field, label?, unit? }. ${USAGE_HINT}`);
  }

  const object = typeof tag.object === 'string' ? tag.object.trim() : '';
  const field = typeof tag.field === 'string' ? tag.field.trim() : '';

  if (!object || !field) {
    throw new Error(`tags[${index}] must include non-empty object and field strings. ${USAGE_HINT}`);
  }

  if (!object.startsWith('/')) {
    throw new Error(`tags[${index}].object must be a full path starting with /. ${USAGE_HINT}`);
  }

  const normalized = { object, field };

  if (typeof tag.label === 'string' && tag.label.trim().length > 0) {
    normalized.label = tag.label.trim();
  }

  if (typeof tag.unit === 'string' && tag.unit.trim().length > 0) {
    normalized.unit = tag.unit.trim();
  }

  return normalized;
}

function validateParams(params, extractTags) {
  if (!isRecord(params)) {
    throw new Error('params must be an object. ' + USAGE_HINT);
  }

  const tags = extractTags(params);

  if (!tags) {
    throw new Error('tags is required as a non-empty array of { object, field } entries. ' + USAGE_HINT);
  }

  const tagMap = new Map();
  for (let index = 0; index < tags.length; index += 1) {
    const tag = validateTag(tags[index], index);
    const key = toCompositeKey(tag.object, tag.field);
    if (!tagMap.has(key)) {
      tagMap.set(key, tag);
    }
  }

  return {
    tags: Array.from(tagMap.values()),
  };
}

function createWarning(message, code, context) {
  const warning = {
    severity: 'warning',
    message,
  };

  if (code) {
    warning.code = code;
  }

  if (context && Object.keys(context).length > 0) {
    warning.context = context;
  }

  return warning;
}

function splitIntoBatches(values, batchSize) {
  const batches = [];

  for (let index = 0; index < values.length; index += batchSize) {
    batches.push(values.slice(index, index + batchSize));
  }

  return batches;
}

module.exports = async function runScadaArchiveCoverage({ client, params }) {
  const [{ resolveArchives }, { extractTags, rejectUnexpectedKeys, TAG_KEYS }] = await Promise.all([
    import('../../libs/ecomet-core/dist/index.js'),
    import('../../libs/skills-core/dist/index.js'),
  ]);

  if (!isRecord(params)) {
    throw new Error('params must be an object. ' + USAGE_HINT);
  }

  rejectUnexpectedKeys(params, [...TAG_KEYS], USAGE_HINT);

  const validated = validateParams(params, extractTags);
  const producedAt = Date.now();
  const resolvedByKey = {};
  const unresolved = new Set();
  const invalidObjects = new Set();
  const warnings = [];
  const tagKeys = validated.tags.map((tag) => toCompositeKey(tag.object, tag.field));
  const batches = splitIntoBatches(validated.tags, BATCH_SIZE);

  for (const batch of batches) {
    const result = await resolveArchives(client, {
      tags: batch.map(({ object, field }) => ({ object, field })),
    });

    Object.assign(resolvedByKey, result.resolved);

    for (const tagKey of result.unresolved) {
      unresolved.add(tagKey);
    }

    for (const objectPath of result.invalid) {
      invalidObjects.add(objectPath);
    }
  }

  const entries = validated.tags.map((tag) => {
    const tagKey = toCompositeKey(tag.object, tag.field);
    const archivePath = resolvedByKey[tagKey];

    if (typeof archivePath === 'string' && archivePath.length > 0) {
      return {
        tag: tagKey,
        archived: true,
        archive_path: archivePath,
      };
    }

    if (invalidObjects.has(tag.object)) {
      warnings.push(
        createWarning(
          `Invalid object path: ${tag.object}. Archive coverage could not be resolved.`,
          'invalid_object',
          { object: tag.object, tag: tagKey },
        ),
      );

      return {
        tag: tagKey,
        archived: false,
        notes: ['Object path is invalid.'],
      };
    }

    if (unresolved.has(tagKey)) {
      return {
        tag: tagKey,
        archived: false,
        notes: ['Field is not archived.'],
      };
    }

    return {
      tag: tagKey,
      archived: false,
      notes: ['Archive coverage could not be proven for this tag.'],
    };
  });

  const invalidCount = entries.filter(
    (entry) => Array.isArray(entry.notes) && entry.notes.includes('Object path is invalid.'),
  ).length;
  const archivedCount = entries.filter((entry) => entry.archived).length;
  const notArchivedCount = entries.length - archivedCount - invalidCount;

  return {
    kind: 'coverage_view',
    blocks: [
      {
        block_kind: 'coverage',
        entries,
        summary: {
          total: entries.length,
          archived: archivedCount,
          not_archived: notArchivedCount,
          invalid: invalidCount,
        },
      },
    ],
    warnings,
    provenance: {
      source_skill: 'scada-archive-coverage',
      scope: buildScope(tagKeys),
      period_from: producedAt,
      period_to: producedAt,
      timezone: DEFAULT_TIMEZONE,
      produced_at: producedAt,
    },
    completeness: {
      status: 'complete',
    },
    metadata: {
      batch_count: batches.length,
      batch_size: BATCH_SIZE,
    },
  };
};
