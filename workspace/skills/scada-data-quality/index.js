const USAGE_HINT =
  'RETRY skill_run with corrected params. ' +
  'Minimal: skill_run({ skill: "scada-data-quality", tags: [{ object: "/root/FP/PROJECT/...", field: "out_value" }] }). ' +
  'Supported: tags (required, max 10), time (optional, default last_24_hours). ' +
  'Each tag: { object, field, label?, unit? }.';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toCompositeKey(objectPath, fieldName) {
  return `${objectPath}:${fieldName}`;
}

function dedupeStrings(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
}

function buildScope(tagKeys) {
  if (tagKeys.length <= 3) {
    return tagKeys.join(', ');
  }

  return `${tagKeys.slice(0, 3).join(', ')} +${tagKeys.length - 3} more`;
}

function createWarning(message, code, severity = 'warning', context) {
  const warning = { severity, message };

  if (code) {
    warning.code = code;
  }

  if (context && Object.keys(context).length > 0) {
    warning.context = context;
  }

  return warning;
}

function formatValue(value) {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  return String(value);
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

function normalizeTopLevelAliases(params) {
  const normalized = { ...params };

  if (normalized.title !== undefined) {
    delete normalized.title;
  }

  if (normalized.scope !== undefined) {
    if (normalized.tags !== undefined) {
      throw new Error(
        'Conflicting params: tags and scope are both present. Use canonical tags or the scope alias, not both. ' +
          USAGE_HINT,
      );
    }

    if (!Array.isArray(normalized.scope)) {
      throw new Error(
        'scope alias must be an array of { object, field } entries when used for scada-data-quality. ' +
          USAGE_HINT,
      );
    }

    normalized.tags = normalized.scope;
    delete normalized.scope;
  }

  if (normalized.tag_objects !== undefined || normalized.tag_fields !== undefined) {
    if (
      normalized.tags !== undefined ||
      normalized.scope !== undefined ||
      normalized.object !== undefined ||
      normalized.objects !== undefined
    ) {
      throw new Error(
        'Conflicting params: tag_objects/tag_fields cannot be combined with tags, scope, object, or objects. ' +
          USAGE_HINT,
      );
    }

    if (!Array.isArray(normalized.tag_objects) || normalized.tag_objects.length === 0) {
      throw new Error(
        'tag_objects must be a non-empty array of object paths when provided. ' +
          USAGE_HINT,
      );
    }

    if (!Array.isArray(normalized.tag_fields) || normalized.tag_fields.length === 0) {
      throw new Error(
        'tag_fields must be a non-empty array of field names when provided. ' +
          USAGE_HINT,
      );
    }

    const fields =
      normalized.tag_fields.length === 1
        ? Array.from({ length: normalized.tag_objects.length }, () => normalized.tag_fields[0])
        : normalized.tag_fields;

    if (fields.length !== normalized.tag_objects.length) {
      throw new Error(
        'tag_objects and tag_fields must have the same length, or tag_fields must contain exactly one shared field. ' +
          USAGE_HINT,
      );
    }

    normalized.tags = normalized.tag_objects.map((object, index) => ({
      object,
      field: fields[index],
    }));

    delete normalized.tag_objects;
    delete normalized.tag_fields;
  }

  return normalized;
}

function deriveCompanionInfo(fieldName) {
  const fields = [fieldName];
  const notes = [];

  if (fieldName.endsWith('_value')) {
    const prefix = fieldName.slice(0, -'value'.length);
    fields.push(`${prefix}qds`, `${prefix}ts`);

    if (fieldName.endsWith('out_value')) {
      const nestedPrefix = fieldName.slice(0, -'out_value'.length);
      fields.push(
        `${nestedPrefix}in_value`,
        `${nestedPrefix}op_value`,
        `${nestedPrefix}calculated_value`,
        `${nestedPrefix}remote_value`,
        `${nestedPrefix}se_value`,
        `${nestedPrefix}op_manual`,
        `${nestedPrefix}calc_manual`,
        `${nestedPrefix}remote_manual`,
        `${nestedPrefix}se_manual`,
      );
    }
  } else {
    notes.push(
      'No deterministic companion quality or timestamp fields could be derived automatically for this field name.',
    );
  }

  return {
    fields: dedupeStrings(fields),
    notes,
  };
}

function summarizeCurrentFacts(tag, objectRow, companionInfo) {
  const notes = [];

  notes.push(`Current value: ${formatValue(objectRow[tag.field])}`);

  if (tag.field.endsWith('_value')) {
    const prefix = tag.field.slice(0, -'value'.length);
    const qdsField = `${prefix}qds`;
    const tsField = `${prefix}ts`;

    if (objectRow[qdsField] !== null && objectRow[qdsField] !== undefined) {
      notes.push(`Current quality: ${qdsField} = ${formatValue(objectRow[qdsField])}`);
    }

    if (objectRow[tsField] !== null && objectRow[tsField] !== undefined) {
      notes.push(`Current timestamp: ${tsField} = ${formatValue(objectRow[tsField])}`);
    }

    if (tag.field.endsWith('out_value')) {
      const nestedPrefix = tag.field.slice(0, -'out_value'.length);
      for (const manualField of [
        `${nestedPrefix}op_manual`,
        `${nestedPrefix}calc_manual`,
        `${nestedPrefix}remote_manual`,
        `${nestedPrefix}se_manual`,
      ]) {
        if (objectRow[manualField]) {
          notes.push(`Source-selection clue: ${manualField} = ${formatValue(objectRow[manualField])}`);
        }
      }
    }
  }

  notes.push(...companionInfo.notes);
  return notes;
}

module.exports = async function runScadaDataQuality({ client, params }) {
  const [{ fieldReadHistory, readObjects, resolveArchives }, { resolveTimeRange, extractTimeRange, extractTags, rejectUnexpectedKeys, TAG_KEYS, TIME_RANGE_KEYS }] =
    await Promise.all([
      import('../../libs/ecomet-core/dist/index.js'),
      import('../../libs/skills-core/dist/index.js'),
    ]);

  if (!isRecord(params)) {
    throw new Error('params must be an object. ' + USAGE_HINT);
  }

  const normalizedParams = normalizeTopLevelAliases(params);

  rejectUnexpectedKeys(
    normalizedParams,
    [...TAG_KEYS, ...TIME_RANGE_KEYS],
    USAGE_HINT,
  );

  const tags = extractTags(normalizedParams);

  if (!tags) {
    throw new Error('tags is required as a non-empty array of { object, field } entries. ' + USAGE_HINT);
  }

  if (tags.length > 10) {
    throw new Error('tags may contain at most 10 entries. ' + USAGE_HINT);
  }

  const time = extractTimeRange(normalizedParams, USAGE_HINT);

  if (time !== undefined && !isRecord(time)) {
    throw new Error('time must be an object when provided. ' + USAGE_HINT);
  }

  const tagMap = new Map();
  for (let index = 0; index < tags.length; index += 1) {
    const tag = validateTag(tags[index], index);
    const key = toCompositeKey(tag.object, tag.field);
    if (!tagMap.has(key)) {
      tagMap.set(key, tag);
    }
  }

  const validated = {
    tags: Array.from(tagMap.values()),
    time: time ?? { preset: 'last_24_hours' },
  };

  const resolvedTime = resolveTimeRange(validated.time);
  const warnings = [];
  const tagKeys = validated.tags.map((tag) => toCompositeKey(tag.object, tag.field));
  const companionInfoByKey = new Map();
  const objectPaths = dedupeStrings(validated.tags.map((tag) => tag.object));
  const readFields = [];

  for (const tag of validated.tags) {
    const tagKey = toCompositeKey(tag.object, tag.field);
    const companionInfo = deriveCompanionInfo(tag.field);
    companionInfoByKey.set(tagKey, companionInfo);
    readFields.push(...companionInfo.fields);
  }

  const archiveResult = await resolveArchives(client, {
    tags: validated.tags.map(({ object, field }) => ({ object, field })),
  });

  let objectReads = {};
  let objectReadFailure = null;

  try {
    objectReads = await readObjects(client, {
      objects: objectPaths,
      fields: dedupeStrings(readFields),
    });
  } catch (error) {
    objectReadFailure = error instanceof Error ? error.message : String(error);
    warnings.push(
      createWarning(
        `Current object read failed for this data-quality request: ${objectReadFailure}`,
        'current_read_failed',
      ),
    );
  }

  const archivedTags = validated.tags.filter((tag) => {
    const tagKey = toCompositeKey(tag.object, tag.field);
    return typeof archiveResult.resolved[tagKey] === 'string';
  });

  let historyValues = {};
  let historyInvalid = new Set();
  let historyUnresolved = new Set();
  let historyFailure = null;
  const partialTagKeys = new Set();

  if (archivedTags.length > 0) {
    try {
      const historyResult = await fieldReadHistory(client, {
        tags: archivedTags.map(({ object, field }) => ({ object, field })),
        from: resolvedTime.from,
        to: resolvedTime.to,
      });
      historyValues = historyResult.values;
      historyInvalid = new Set(historyResult.invalid);
      historyUnresolved = new Set(historyResult.unresolved);
    } catch (error) {
      historyFailure = error instanceof Error ? error.message : String(error);
      warnings.push(
        createWarning(
          `Archive history facts could not be read for this data-quality request: ${historyFailure}`,
          'history_read_failed',
        ),
      );
    }
  }

  const invalidObjects = new Set(archiveResult.invalid);
  const unresolvedArchives = new Set(archiveResult.unresolved);

  const entries = validated.tags.map((tag) => {
    const tagKey = toCompositeKey(tag.object, tag.field);
    const archivePath = archiveResult.resolved[tagKey];
    const archived = typeof archivePath === 'string' && archivePath.length > 0;
    const notes = [];
    const companionInfo = companionInfoByKey.get(tagKey) ?? { fields: [tag.field], notes: [] };
    notes.push(...companionInfo.notes);

    if (archived) {
      notes.push(`Archive available: ${archivePath}`);
    } else if (invalidObjects.has(tag.object)) {
      notes.push('Object path is invalid.');
      warnings.push(
        createWarning(
          `Invalid object path: ${tag.object}. Data quality could not be assessed completely.`,
          'invalid_object',
          'warning',
          { object: tag.object, tag: tagKey },
        ),
      );
      partialTagKeys.add(tagKey);
    } else if (unresolvedArchives.has(tagKey)) {
      notes.push('Field is not archived.');
    } else {
      notes.push('Archive availability could not be proven.');
    }

    if (invalidObjects.has(tag.object)) {
      return {
        tag: tagKey,
        archived,
        archive_path: archived ? archivePath : undefined,
        notes,
      };
    }

    if (objectReadFailure) {
      notes.push('Current object facts could not be read for this request.');
      partialTagKeys.add(tagKey);
    } else {
      const objectRow = objectReads[tag.object];
      if (objectRow === null) {
        notes.push('Current object read returned no data.');
        warnings.push(
          createWarning(
            `Current object read returned no row for ${tag.object}.`,
            'current_read_missing',
            'warning',
            { object: tag.object, tag: tagKey },
          ),
        );
        partialTagKeys.add(tagKey);
      } else if (isRecord(objectRow)) {
        notes.push(...summarizeCurrentFacts(tag, objectRow, companionInfo));
      }
    }

    if (archived) {
      if (historyFailure) {
        notes.push('Archive history facts could not be read for this request.');
        partialTagKeys.add(tagKey);
      } else if (historyInvalid.has(tagKey) || historyUnresolved.has(tagKey)) {
        notes.push('Archive history facts could not be resolved for this archived tag.');
        warnings.push(
          createWarning(
            `Archive history facts were not fully resolved for ${tagKey}.`,
            'history_partial',
            'warning',
            { tag: tagKey },
          ),
        );
        partialTagKeys.add(tagKey);
      } else {
        const series = Array.isArray(historyValues[tagKey]) ? historyValues[tagKey] : [];
        if (series.length === 0) {
          notes.push('No history points were recorded in the requested window.');
        } else {
          const lastPoint = series[series.length - 1];
          if (lastPoint[0] >= resolvedTime.from && lastPoint[0] <= resolvedTime.to) {
            notes.push(`Last archive change in requested window: ${lastPoint[0]}`);
          } else {
            notes.push(
              'No archive changes were recorded inside the requested window; only carry-forward history was available.',
            );
          }
          notes.push(
            `Observed ${series.length} history point${series.length === 1 ? '' : 's'} in the requested window.`,
          );
        }
      }
    }

    return {
      tag: tagKey,
      archived,
      archive_path: archived ? archivePath : undefined,
      notes,
    };
  });

  const invalidCount = entries.filter(
    (entry) => Array.isArray(entry.notes) && entry.notes.includes('Object path is invalid.'),
  ).length;
  const archivedCount = entries.filter((entry) => entry.archived).length;
  const notArchivedCount = entries.length - archivedCount - invalidCount;

  const completeness =
    partialTagKeys.size > 0
      ? {
          status: 'partial',
          reason: `${entries.length - partialTagKeys.size} of ${entries.length} requested tags were assessed without invalid-path or current-read gaps.`,
          total_available: entries.length,
          total_returned: Math.max(entries.length - partialTagKeys.size, 0),
        }
      : { status: 'complete' };

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
      source_skill: 'scada-data-quality',
      scope: buildScope(tagKeys),
      period_from: resolvedTime.from,
      period_to: resolvedTime.to,
      timezone: resolvedTime.timezone,
      produced_at: Date.now(),
    },
    completeness,
    metadata: {
      requested_tag_count: validated.tags.length,
      archived_tag_count: archivedTags.length,
      time_label: resolvedTime.label,
    },
  };
};
