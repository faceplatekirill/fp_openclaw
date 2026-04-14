const USAGE_HINT =
  'RETRY skill_run with corrected params. ' +
  'Minimal: skill_run({ skill: "scada-point-snapshot", tags: [{ object: "/root/FP/PROJECT/...", field: "out_value" }], time: { at: "2026-03-16 12:00", timezone: "Asia/Almaty" } }). ' +
  'Relative: time: { ago: { amount: 1, unit: "hour" } }. ' +
  'Each tag: { object, field, label?, unit? }. Max 10 tags.';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toCompositeKey(objectPath, fieldName) {
  return `${objectPath}:${fieldName}`;
}

function buildScope(tagKeys) {
  if (tagKeys.length <= 3) {
    return tagKeys.join(', ');
  }

  return `${tagKeys.slice(0, 3).join(', ')} +${tagKeys.length - 3} more`;
}

const DATE_TIME_FORMATTERS = new Map();

function getDateTimeFormatter(timezone) {
  let formatter = DATE_TIME_FORMATTERS.get(timezone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      calendar: 'iso8601',
      numberingSystem: 'latn',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    DATE_TIME_FORMATTERS.set(timezone, formatter);
  }

  return formatter;
}

function formatLocalDateTime(timestamp, timezone) {
  const parts = {};

  for (const part of getDateTimeFormatter(timezone).formatToParts(new Date(timestamp))) {
    if (
      part.type === 'year' ||
      part.type === 'month' ||
      part.type === 'day' ||
      part.type === 'hour' ||
      part.type === 'minute' ||
      part.type === 'second'
    ) {
      parts[part.type] = part.value;
    }
  }

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function normalizeAbsoluteTimePoint(value, timezone) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)(Z|[+-]\d{2}:\d{2})$/i.exec(trimmed);
  if (!match) {
    return null;
  }

  if (typeof timezone === 'string' && timezone.trim().length > 0) {
    return {
      at: `${match[1]} ${match[2]}`,
      timezone: timezone.trim(),
    };
  }

  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid absolute time point "${trimmed}". ${USAGE_HINT}`);
  }

  return {
    at: formatLocalDateTime(timestamp, 'UTC'),
    timezone: 'UTC',
  };
}

function normalizeTopLevelAliases(params) {
  const normalized = { ...params };
  const explicitTimezone =
    typeof normalized.timestamp_timezone === 'string'
      ? normalized.timestamp_timezone
      : normalized.timezone;

  if (isRecord(normalized.time) && typeof normalized.time.at === 'string') {
    const nestedTimezone =
      typeof normalized.time.timezone === 'string'
        ? normalized.time.timezone
        : explicitTimezone;
    const absolute = normalizeAbsoluteTimePoint(
      normalized.time.at,
      nestedTimezone,
    );

    if (absolute) {
      normalized.time = {
        ...normalized.time,
        at: absolute.at,
        timezone: absolute.timezone,
      };
    }
  }

  for (const key of ['time', 'at', 'timestamp', 'timestamp_text', 'timestamp_local']) {
    if (typeof normalized[key] !== 'string') {
      continue;
    }

    const absolute = normalizeAbsoluteTimePoint(normalized[key], explicitTimezone);
    if (!absolute) {
      continue;
    }

    normalized[key] = absolute.at;
    if (
      normalized.timezone === undefined &&
      normalized.timestamp_timezone === undefined
    ) {
      normalized.timezone = absolute.timezone;
    }
  }

  return normalized;
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

module.exports = async function runScadaPointSnapshot({ client, params }) {
  const [{ fieldSnapshot }, { resolveTimePoint, extractTimePoint, extractTags, rejectUnexpectedKeys, TAG_KEYS, TIME_POINT_KEYS }] = await Promise.all([
    import('../../libs/ecomet-core/dist/index.js'),
    import('../../libs/skills-core/dist/index.js'),
  ]);

  if (!isRecord(params)) {
    throw new Error('params must be an object. ' + USAGE_HINT);
  }

  const normalizedParams = normalizeTopLevelAliases(params);

  rejectUnexpectedKeys(normalizedParams, [...TAG_KEYS, ...TIME_POINT_KEYS], USAGE_HINT);

  const tags = extractTags(normalizedParams);

  if (!tags) {
    throw new Error('tags is required as a non-empty array of { object, field } entries. ' + USAGE_HINT);
  }

  if (tags.length > 10) {
    throw new Error('tags may contain at most 10 entries. ' + USAGE_HINT);
  }

  const tagMap = new Map();
  for (let index = 0; index < tags.length; index += 1) {
    const tag = validateTag(tags[index], index);
    const key = toCompositeKey(tag.object, tag.field);
    if (!tagMap.has(key)) {
      tagMap.set(key, tag);
    }
  }

  const time = extractTimePoint(normalizedParams, USAGE_HINT);

  if (!isRecord(time)) {
    throw new Error('time is required (e.g. { at: "2026-03-16 12:00", timezone: "Asia/Almaty" } or flat: at: "...", timezone: "..."). ' + USAGE_HINT);
  }

  const validatedTags = Array.from(tagMap.values());
  const resolvedTime = resolveTimePoint(time);
  const snapshotResult = await fieldSnapshot(client, {
    tags: validatedTags.map(({ object, field }) => ({ object, field })),
    timestamp: resolvedTime.timestamp,
  });

  const warnings = [
    ...snapshotResult.invalid.map((tagKey) =>
      createWarning(
        `Invalid tag: ${tagKey}. The object path could not be resolved.`,
        'invalid_tag',
        { tag: tagKey },
      ),
    ),
    ...snapshotResult.unresolved.map((tagKey) =>
      createWarning(
        `Unresolved tag: ${tagKey}. The object exists, but the field is not archived.`,
        'unresolved_tag',
        { tag: tagKey },
      ),
    ),
  ];

  const tagKeys = validatedTags.map((tag) => toCompositeKey(tag.object, tag.field));
  const resolvedValueKeys = Object.keys(snapshotResult.values);
  const completeness =
    warnings.length === 0
      ? { status: 'complete' }
      : {
          status: 'partial',
          reason: `${resolvedValueKeys.length} of ${validatedTags.length} requested tags returned a snapshot value.`,
          total_available: validatedTags.length,
          total_returned: resolvedValueKeys.length,
        };

  return {
    kind: 'snapshot_view',
    blocks: [
      {
        block_kind: 'snapshot',
        timestamp: resolvedTime.timestamp,
        values: snapshotResult.values,
        invalid: snapshotResult.invalid,
        unresolved: snapshotResult.unresolved,
      },
    ],
    warnings,
    provenance: {
      source_skill: 'scada-point-snapshot',
      scope: buildScope(tagKeys),
      period_from: resolvedTime.timestamp,
      period_to: resolvedTime.timestamp,
      timezone: resolvedTime.timezone,
      produced_at: Date.now(),
    },
    completeness,
    metadata: {
      requested_tag_count: validatedTags.length,
      resolved_tag_count: resolvedValueKeys.length,
      time_label: resolvedTime.label,
    },
  };
};
