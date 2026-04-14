const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const DATE_TIME_FORMATTERS = new Map();
const OFFSET_FORMATTERS = new Map();

const BUCKET_PRESETS = {
  whole_range: null,
  '15_minutes': 15 * MINUTE_MS,
  '30_minutes': 30 * MINUTE_MS,
  '1_hour': HOUR_MS,
  '6_hours': 6 * HOUR_MS,
  '12_hours': 12 * HOUR_MS,
  '1_day': DAY_MS,
};

const BUCKET_LABELS = {
  whole_range: 'Whole requested range',
  '15_minutes': '15 minute buckets',
  '30_minutes': '30 minute buckets',
  '1_hour': '1 hour buckets',
  '6_hours': '6 hour buckets',
  '12_hours': '12 hour buckets',
  '1_day': '1 day buckets',
};

const USAGE_HINT =
  'RETRY skill_run with corrected params. ' +
  'Minimal: skill_run({ skill: "scada-period-aggregates", tags: [{ object: "/root/FP/PROJECT/...", field: "out_value", functions: ["avg"] }] }). ' +
  'Supported: tags (required, max 5, each with functions array), time (optional), bucket (optional). ' +
  'Bucket presets: whole_range, 15_minutes, 30_minutes, 1_hour, 6_hours, 12_hours, 1_day.';

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

function validateTag(tag, index) {
  if (!isRecord(tag)) {
    throw new Error(`tags[${index}] must be an object. ${USAGE_HINT}`);
  }

  const allowedTagKeys = new Set(['object', 'field', 'functions', 'label', 'unit']);
  const unknownTagKeys = Object.keys(tag).filter((k) => !allowedTagKeys.has(k));
  if (unknownTagKeys.length > 0) {
    throw new Error(`tags[${index}] has unexpected keys: ${unknownTagKeys.join(', ')}. Each tag supports only { object, field, functions, label?, unit? }. ${USAGE_HINT}`);
  }

  const object = typeof tag.object === 'string' ? tag.object.trim() : '';
  const field = typeof tag.field === 'string' ? tag.field.trim() : '';

  if (!object || !field) {
    throw new Error(`tags[${index}] must include non-empty object and field strings. ${USAGE_HINT}`);
  }

  if (!object.startsWith('/')) {
    throw new Error(`tags[${index}].object must be a full path starting with /. ${USAGE_HINT}`);
  }

  if (!Array.isArray(tag.functions) || tag.functions.length === 0) {
    throw new Error(`tags[${index}] must include a non-empty functions array (e.g. ["avg", "max"]). ${USAGE_HINT}`);
  }

  const functions = dedupeStrings(
    tag.functions
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0),
  );

  if (functions.length === 0) {
    throw new Error(`tags[${index}].functions must contain at least one valid function name. ${USAGE_HINT}`);
  }

  const normalized = { object, field, functions };

  if (typeof tag.label === 'string' && tag.label.trim().length > 0) {
    normalized.label = tag.label.trim();
  }

  if (typeof tag.unit === 'string' && tag.unit.trim().length > 0) {
    normalized.unit = tag.unit.trim();
  }

  return normalized;
}

function validateBucket(bucket) {
  if (bucket === undefined || bucket === null) {
    return { preset: 'whole_range' };
  }

  if (typeof bucket === 'string') {
    const normalizedBucket = bucket
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');

    if (
      normalizedBucket === 'all' ||
      normalizedBucket === 'entire' ||
      normalizedBucket === 'whole' ||
      normalizedBucket === 'whole_range'
    ) {
      return { preset: 'whole_range' };
    }

    if (Object.prototype.hasOwnProperty.call(BUCKET_PRESETS, normalizedBucket)) {
      return { preset: normalizedBucket };
    }

    throw new Error(`Unsupported bucket preset: "${bucket}". ${USAGE_HINT}`);
  }

  if (isRecord(bucket) && bucket.preset === undefined && typeof bucket.kind === 'string') {
    const normalizedKind = bucket.kind
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');

    if (normalizedKind === 'single' || normalizedKind === 'all' || normalizedKind === 'entire' || normalizedKind === 'whole' || normalizedKind === 'whole_range') {
      return { preset: 'whole_range' };
    }

    if (Object.prototype.hasOwnProperty.call(BUCKET_PRESETS, normalizedKind)) {
      return { preset: normalizedKind };
    }
  }

  if (!isRecord(bucket) || typeof bucket.preset !== 'string') {
    throw new Error('bucket must be an object with a preset (e.g. { preset: "1_hour" }). ' + USAGE_HINT);
  }

  const unknownBucketKeys = Object.keys(bucket).filter((k) => k !== 'preset');
  if (unknownBucketKeys.length > 0) {
    throw new Error(`Unexpected keys inside bucket: ${unknownBucketKeys.join(', ')}. bucket only supports { preset }. ${USAGE_HINT}`);
  }

  if (!Object.prototype.hasOwnProperty.call(BUCKET_PRESETS, bucket.preset)) {
    throw new Error(`Unsupported bucket preset: "${bucket.preset}". ${USAGE_HINT}`);
  }

  return { preset: bucket.preset };
}

function normalizeTopLevelAliases(params) {
  const normalized = { ...params };

  if (normalized.bucket === null) {
    delete normalized.bucket;
  }

  if (normalized.scope !== undefined) {
    if (normalized.tags !== undefined) {
      throw new Error(
        'Conflicting params: tags and scope are both present. Use canonical tags or the scope alias, not both. ' +
          USAGE_HINT,
      );
    }

    if (typeof normalized.scope === 'string') {
      if (normalized.object !== undefined) {
        throw new Error(
          'Conflicting params: scope cannot be combined with object. ' +
            USAGE_HINT,
        );
      }

      normalized.object = normalized.scope;
    } else if (Array.isArray(normalized.scope)) {
      normalized.tags = normalized.scope;
    } else if (isRecord(normalized.scope) && Array.isArray(normalized.scope.tags)) {
      const scopeFunctions = Array.isArray(normalized.scope.functions)
        ? normalized.scope.functions
        : undefined;

      normalized.tags = normalized.scope.tags.map((entry) => {
        if (!isRecord(entry) || !scopeFunctions || entry.functions !== undefined) {
          return entry;
        }

        return {
          ...entry,
          functions: scopeFunctions,
        };
      });

      if (normalized.scope.period !== undefined && normalized.period === undefined) {
        normalized.period = normalized.scope.period;
      }

      if (normalized.scope.bucket !== undefined && normalized.bucket === undefined) {
        normalized.bucket = normalized.scope.bucket;
      }
    } else {
      throw new Error(
        'scope alias must be either a full object path string or an array of aggregate tag entries when used for scada-period-aggregates. ' +
          USAGE_HINT,
      );
    }

    delete normalized.scope;
  }

  if (normalized.timestampsMode !== undefined) {
    if (typeof normalized.timestampsMode !== 'string') {
      throw new Error(
        'timestampsMode must be a string when provided. ' + USAGE_HINT,
      );
    }

    delete normalized.timestampsMode;
  }

  if (normalized.bucketMinutes !== undefined) {
    if (normalized.bucket !== undefined) {
      throw new Error(
        'Conflicting params: bucketMinutes cannot be combined with bucket. ' +
          USAGE_HINT,
      );
    }

    if (!Number.isInteger(normalized.bucketMinutes) || normalized.bucketMinutes <= 0) {
      throw new Error(
        'bucketMinutes must be a positive integer when provided. ' +
          USAGE_HINT,
      );
    }

    const minutePreset = {
      15: '15_minutes',
      30: '30_minutes',
      60: '1_hour',
      360: '6_hours',
      720: '12_hours',
      1440: 'whole_range',
    };

    const preset = minutePreset[normalized.bucketMinutes];
    if (!preset) {
      throw new Error(
        `Unsupported bucketMinutes value ${normalized.bucketMinutes}. ` +
          'Supported values: 15, 30, 60, 360, 720, 1440.' +
          ` ${USAGE_HINT}`,
      );
    }

    normalized.bucket = preset;
    delete normalized.bucketMinutes;
  }

  return normalized;
}

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

function getOffsetFormatter(timezone) {
  let formatter = OFFSET_FORMATTERS.get(timezone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });
    OFFSET_FORMATTERS.set(timezone, formatter);
  }

  return formatter;
}

function getOffsetMs(timezone, timestamp) {
  const timezoneName =
    getOffsetFormatter(timezone)
      .formatToParts(new Date(timestamp))
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';

  if (timezoneName === 'GMT') {
    return 0;
  }

  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(timezoneName);
  if (!match) {
    throw new Error(`Unsupported timezone offset format: ${timezoneName}`);
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  return sign * (hours * HOUR_MS + minutes * MINUTE_MS);
}

function getLocalDateTimeParts(timestamp, timezone) {
  const values = {};

  for (const part of getDateTimeFormatter(timezone).formatToParts(new Date(timestamp))) {
    if (
      part.type === 'year' ||
      part.type === 'month' ||
      part.type === 'day' ||
      part.type === 'hour' ||
      part.type === 'minute' ||
      part.type === 'second'
    ) {
      values[part.type] = Number(part.value);
    }
  }

  return {
    year: values.year ?? 0,
    month: values.month ?? 0,
    day: values.day ?? 0,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

function compareLocalDateTimeParts(left, right) {
  const leftTuple = [left.year, left.month, left.day, left.hour, left.minute, left.second];
  const rightTuple = [right.year, right.month, right.day, right.hour, right.minute, right.second];

  for (let index = 0; index < leftTuple.length; index += 1) {
    if (leftTuple[index] < rightTuple[index]) {
      return -1;
    }

    if (leftTuple[index] > rightTuple[index]) {
      return 1;
    }
  }

  return 0;
}

function resolveLocalDateTimeEpoch(parts, timezone) {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const candidateOffsets = new Set();

  for (let hours = -36; hours <= 36; hours += 6) {
    candidateOffsets.add(getOffsetMs(timezone, utcGuess + hours * HOUR_MS));
  }

  const matches = [];
  for (const offset of candidateOffsets) {
    const candidate = utcGuess - offset;
    if (compareLocalDateTimeParts(getLocalDateTimeParts(candidate, timezone), parts) === 0) {
      matches.push(candidate);
    }
  }

  if (matches.length === 0) {
    throw new Error('Could not resolve local bucket boundary for the requested timezone.');
  }

  return Math.min(...matches);
}

function startOfLocalDay(timestamp, timezone) {
  const parts = getLocalDateTimeParts(timestamp, timezone);
  return resolveLocalDateTimeEpoch(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timezone,
  );
}

function nextLocalDayBoundary(timestamp, timezone) {
  const parts = getLocalDateTimeParts(timestamp, timezone);
  const nextDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1, 0, 0, 0));

  return resolveLocalDateTimeEpoch(
    {
      year: nextDate.getUTCFullYear(),
      month: nextDate.getUTCMonth() + 1,
      day: nextDate.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timezone,
  );
}

function buildFixedEdges(from, to, durationMs) {
  const edges = [from];
  let boundary = Math.floor(from / durationMs) * durationMs;

  if (boundary <= from) {
    boundary += durationMs;
  }

  while (boundary < to) {
    edges.push(boundary);
    boundary += durationMs;
  }

  if (edges[edges.length - 1] !== to) {
    edges.push(to);
  }

  return edges;
}

function buildDayEdges(from, to, timezone) {
  const edges = [from];
  let boundary = startOfLocalDay(from, timezone);

  if (boundary <= from) {
    boundary = nextLocalDayBoundary(from, timezone);
  }

  while (boundary < to) {
    edges.push(boundary);
    boundary = nextLocalDayBoundary(boundary, timezone);
  }

  if (edges[edges.length - 1] !== to) {
    edges.push(to);
  }

  return edges;
}

function buildBucketEdges(from, to, timezone, bucketPreset) {
  if (bucketPreset === 'whole_range') {
    return [from, to];
  }

  if (bucketPreset === '1_day') {
    return buildDayEdges(from, to, timezone);
  }

  return buildFixedEdges(from, to, BUCKET_PRESETS[bucketPreset]);
}

function isAlignedToBucketBoundary(timestamp, bucketPreset, timezone) {
  if (bucketPreset === 'whole_range') {
    return true;
  }

  if (bucketPreset === '1_day') {
    return startOfLocalDay(timestamp, timezone) === timestamp;
  }

  const durationMs = BUCKET_PRESETS[bucketPreset];
  return timestamp % durationMs === 0;
}

function buildBucketDescription(bucketPreset, timezone) {
  return `${BUCKET_LABELS[bucketPreset]} in ${timezone}`;
}

function buildCaveats(tag, bucketPreset, timezone, edges) {
  const caveats = ['Buckets use [T_start, T_end) semantics.'];

  if (tag.functions.includes('avg')) {
    caveats.push('avg is time-weighted over each bucket.');
  }

  if (tag.functions.includes('standard_deviation')) {
    caveats.push('standard_deviation is based on time-weighted archive samples.');
  }

  if (tag.functions.includes('integral')) {
    caveats.push(
      'integral values depend on archive sampling intervals and may require unit conversion before interpretation.',
    );
  }

  if (
    bucketPreset !== 'whole_range' &&
    (!isAlignedToBucketBoundary(edges[0], bucketPreset, timezone) ||
      !isAlignedToBucketBoundary(edges[edges.length - 1], bucketPreset, timezone))
  ) {
    caveats.push(
      'The first or last bucket is partial because the requested range does not align to the selected bucket boundary.',
    );
  }

  if (bucketPreset === '1_day') {
    const durations = [];
    for (let index = 1; index < edges.length; index += 1) {
      durations.push(edges[index] - edges[index - 1]);
    }

    if (durations.some((duration) => duration !== DAY_MS)) {
      caveats.push(
        'Day bucket durations vary across the requested range because local day boundaries are DST-aware.',
      );
    }
  }

  return caveats;
}

module.exports = async function runScadaPeriodAggregates({ client, params }) {
  const [{ fieldAggregates }, { resolveTimeRange, extractTimeRange, extractTags, rejectUnexpectedKeys, TAG_KEYS_WITH_FUNCTIONS, TIME_RANGE_KEYS }] = await Promise.all([
    import('../../libs/ecomet-core/dist/index.js'),
    import('../../libs/skills-core/dist/index.js'),
  ]);

  if (!isRecord(params)) {
    throw new Error('params must be an object. ' + USAGE_HINT);
  }

  const normalizedParams = normalizeTopLevelAliases(params);

  rejectUnexpectedKeys(
    normalizedParams,
    [...TAG_KEYS_WITH_FUNCTIONS, ...TIME_RANGE_KEYS, 'bucket'],
    USAGE_HINT,
  );

  const rawTags = extractTags(normalizedParams, { includeFunctions: true });

  if (!rawTags) {
    throw new Error('tags is required as a non-empty array of { object, field, functions } entries. ' + USAGE_HINT);
  }

  if (rawTags.length > 5) {
    throw new Error('tags may contain at most 5 entries. ' + USAGE_HINT);
  }

  const time = extractTimeRange(normalizedParams, USAGE_HINT);

  if (time !== undefined && !isRecord(time)) {
    throw new Error('time must be an object when provided. ' + USAGE_HINT);
  }

  const tagMap = new Map();
  for (let index = 0; index < rawTags.length; index += 1) {
    const tag = validateTag(rawTags[index], index);
    const key = toCompositeKey(tag.object, tag.field);

    if (!tagMap.has(key)) {
      tagMap.set(key, { ...tag });
      continue;
    }

    const existing = tagMap.get(key);
    for (const functionName of tag.functions) {
      if (!existing.functions.includes(functionName)) {
        existing.functions.push(functionName);
      }
    }
  }

  const validated = {
    tags: Array.from(tagMap.values()),
    time,
    bucket: validateBucket(normalizedParams.bucket),
  };

  const resolvedTime = resolveTimeRange(validated.time ?? { preset: 'last_24_hours' });
  const edges = buildBucketEdges(
    resolvedTime.from,
    resolvedTime.to,
    resolvedTime.timezone,
    validated.bucket.preset,
  );
  const warnings = [];
  const aggregateResult = await fieldAggregates(client, {
    tags: validated.tags.map(({ object, field, functions }) => ({ object, field, functions })),
    timestamps: edges,
  });

  warnings.push(
    ...aggregateResult.invalid.map((tagKey) =>
      createWarning(
        `Invalid tag: ${tagKey}. The object path could not be resolved.`,
        'invalid_tag',
        'warning',
        { tag: tagKey },
      ),
    ),
    ...aggregateResult.unresolved.map((tagKey) =>
      createWarning(
        `Unresolved tag: ${tagKey}. The object exists, but the field is not archived.`,
        'unresolved_tag',
        'warning',
        { tag: tagKey },
      ),
    ),
  );

  const blockedTagKeys = new Set([
    ...aggregateResult.invalid,
    ...aggregateResult.unresolved,
  ]);

  const blocks = validated.tags
    .filter((tag) => !blockedTagKeys.has(toCompositeKey(tag.object, tag.field)))
    .map((tag) => {
    const tagKey = toCompositeKey(tag.object, tag.field);
    const rows = [];

    for (let index = 1; index < edges.length; index += 1) {
      const periodFrom = edges[index - 1];
      const periodTo = edges[index];
      const byBucket = aggregateResult.values[String(periodTo)] ?? {};
      const functionValues = isRecord(byBucket[tagKey]) ? byBucket[tagKey] : {};
      const rowValues = {};

      for (const functionName of tag.functions) {
        rowValues[functionName] = Object.prototype.hasOwnProperty.call(functionValues, functionName)
          ? functionValues[functionName]
          : undefined;
      }

      rows.push({
        period_from: periodFrom,
        period_to: periodTo,
        values: rowValues,
      });
    }

    const caveats = buildCaveats(tag, validated.bucket.preset, resolvedTime.timezone, edges);
    if (rows.every((row) => Object.values(row.values).every((value) => value === undefined))) {
      caveats.push('No aggregate values were returned for the requested period.');
    }

    return {
      block_kind: 'aggregate_table',
      tag: tagKey,
      label: tag.label,
      unit: tag.unit,
      functions: tag.functions,
      rows,
      bucket_description: buildBucketDescription(validated.bucket.preset, resolvedTime.timezone),
      caveats,
    };
    });

  const completeness =
    blockedTagKeys.size === 0
      ? { status: 'complete' }
      : {
          status: 'partial',
          reason: `${blocks.length} of ${validated.tags.length} requested tags resolved without archive issues.`,
          total_available: validated.tags.length,
          total_returned: blocks.length,
        };

  const tagKeys = validated.tags.map((tag) => toCompositeKey(tag.object, tag.field));

  return {
    kind: 'aggregate_table',
    blocks,
    warnings,
    provenance: {
      source_skill: 'scada-period-aggregates',
      scope: buildScope(tagKeys),
      period_from: resolvedTime.from,
      period_to: resolvedTime.to,
      timezone: resolvedTime.timezone,
      produced_at: Date.now(),
    },
    completeness,
    metadata: {
      bucket_preset: validated.bucket.preset,
      bucket_edges: edges,
      time_label: resolvedTime.label,
    },
  };
};
