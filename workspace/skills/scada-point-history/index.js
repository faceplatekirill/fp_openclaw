const USAGE_HINT =
  'RETRY skill_run with corrected params. ' +
  'Minimal: skill_run({ skill: "scada-point-history", tags: [{ object: "/root/FP/PROJECT/...", field: "out_value" }] }). ' +
  'Supported: tags (required, max 5), time (optional, default last_1_hour). ' +
  'Each tag: { object, field, label?, unit? }.';

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

function normalizeLocalDateTimeString(value) {
  const trimmed = value.trim();

  if (
    /^\d{4}-\d{2}-\d{2}T/.test(trimmed) &&
    !/(Z|[+-]\d{2}:\d{2})$/i.test(trimmed)
  ) {
    return trimmed.replace('T', ' ');
  }

  return trimmed;
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

function normalizeWindowToRangeAlias(value) {
  if (!isRecord(value)) {
    return null;
  }

  const kind = typeof value.kind === 'string' ? value.kind.trim().toLowerCase() : '';
  const rawUnit = typeof value.unit === 'string' ? value.unit.trim().toLowerCase() : '';
  const amount =
    typeof value.amount === 'number'
      ? value.amount
      : typeof value.count === 'number'
        ? value.count
        : Number.NaN;

  if (kind !== 'last' || !Number.isInteger(amount) || amount <= 0) {
    return null;
  }

  if (rawUnit === 'minute' || rawUnit === 'minutes' || rawUnit === 'min' || rawUnit === 'mins' || rawUnit === 'm') {
    return `${amount}m`;
  }

  if (rawUnit === 'hour' || rawUnit === 'hours' || rawUnit === 'hr' || rawUnit === 'hrs' || rawUnit === 'h') {
    return `${amount}h`;
  }

  if (rawUnit === 'day' || rawUnit === 'days' || rawUnit === 'd') {
    return `${amount}d`;
  }

  return null;
}

function resolveAnchoredUntil(until, timezone, resolveTimePoint) {
  if (typeof until !== 'string') {
    return null;
  }

  const trimmed = until.trim();
  if (trimmed.length === 0) {
    throw new Error('until must be a non-empty string when provided. ' + USAGE_HINT);
  }

  if (trimmed.toLowerCase() === 'now') {
    return {
      timestamp: Date.now(),
      timezone: typeof timezone === 'string' && timezone.trim().length > 0 ? timezone : undefined,
    };
  }

  if (/(Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) {
    const timestamp = Date.parse(trimmed);

    if (!Number.isFinite(timestamp)) {
      throw new Error(`Invalid until timestamp: ${trimmed}. ${USAGE_HINT}`);
    }

    return {
      timestamp,
      timezone: typeof timezone === 'string' && timezone.trim().length > 0 ? timezone : 'UTC',
    };
  }

  if (typeof timezone !== 'string' || timezone.trim().length === 0) {
    throw new Error(
      'until requires an explicit timezone unless it is an offset-bearing ISO timestamp. ' +
        USAGE_HINT,
    );
  }

  const resolved = resolveTimePoint({
    at: normalizeLocalDateTimeString(trimmed),
    timezone: timezone.trim(),
  });

  return {
    timestamp: resolved.timestamp,
    timezone: resolved.timezone,
  };
}

function resolveAnchoredWindow(windowSpec, until, timezone, helpers) {
  const anchor = resolveAnchoredUntil(until, timezone, helpers.resolveTimePoint);
  if (!anchor) {
    return null;
  }

  let rangeSpec;
  if (typeof windowSpec === 'string') {
    rangeSpec = helpers.extractTimeRange(
      {
        range: windowSpec,
        timezone: anchor.timezone,
      },
      USAGE_HINT,
    );
  } else if (isRecord(windowSpec)) {
    rangeSpec = helpers.extractTimeRange(
      {
        period: windowSpec,
        timezone: anchor.timezone,
      },
      USAGE_HINT,
    );
  } else {
    return null;
  }

  if (!rangeSpec) {
    return null;
  }

  const resolvedRange = helpers.resolveTimeRange(rangeSpec, {
    nowMs: anchor.timestamp,
  });

  return {
    from: formatLocalDateTime(resolvedRange.from, resolvedRange.timezone),
    to: formatLocalDateTime(resolvedRange.to, resolvedRange.timezone),
    timezone: resolvedRange.timezone,
  };
}

function normalizeTopLevelAliases(params, helpers) {
  const normalized = { ...params };

  if (normalized.scope !== undefined) {
    if (normalized.tags !== undefined) {
      throw new Error(
        'Conflicting params: scope cannot be combined with tags. ' + USAGE_HINT,
      );
    }

    if (!Array.isArray(normalized.scope)) {
      throw new Error(
        'scope alias must be an array of { object, field } entries when provided. ' +
          USAGE_HINT,
      );
    }

    normalized.tags = normalized.scope;
    delete normalized.scope;
  }

  if (isRecord(normalized.range)) {
    const anchoredWindow = resolveAnchoredWindow(
      normalized.range,
      normalized.until,
      normalized.timezone,
      helpers,
    );
    if (anchoredWindow) {
      normalized.from = anchoredWindow.from;
      normalized.to = anchoredWindow.to;
      normalized.timezone = anchoredWindow.timezone;
      delete normalized.range;
      delete normalized.until;
      return normalized;
    }

    const alias = normalizeWindowToRangeAlias(normalized.range);
    if (alias) {
      normalized.range = alias;
    }
  }

  if (isRecord(normalized.time)) {
    const timeTimezone =
      typeof normalized.time.timezone === 'string' && normalized.time.timezone.trim().length > 0
        ? normalized.time.timezone.trim()
        : normalized.timezone;
    const timeWindowSpec =
      normalized.time.time_window !== undefined ? normalized.time.time_window : normalized.time.period;
    const anchoredWindow =
      timeWindowSpec !== undefined && normalized.time.until !== undefined
        ? resolveAnchoredWindow(timeWindowSpec, normalized.time.until, timeTimezone, helpers)
        : null;

    if (anchoredWindow) {
      normalized.from = anchoredWindow.from;
      normalized.to = anchoredWindow.to;
      normalized.timezone = anchoredWindow.timezone;
      delete normalized.time;
      return normalized;
    }

    const normalizedTime = { ...normalized.time };
    if (normalizedTime.preset === undefined && typeof normalizedTime.time_window === 'string') {
      normalizedTime.preset = normalizedTime.time_window;
    }
    delete normalizedTime.time_window;
    delete normalizedTime.until;
    normalized.time = normalizedTime;
  }

  return normalized;
}

module.exports = async function runScadaPointHistory({ client, params }) {
  const [{ fieldReadHistory }, { resolveTimePoint, resolveTimeRange, extractTimeRange, extractTags, rejectUnexpectedKeys, TAG_KEYS, TIME_RANGE_KEYS }] = await Promise.all([
    import('../../libs/ecomet-core/dist/index.js'),
    import('../../libs/skills-core/dist/index.js'),
  ]);

  if (!isRecord(params)) {
    throw new Error('params must be an object. ' + USAGE_HINT);
  }

  const normalizedParams = normalizeTopLevelAliases(params, {
    resolveTimePoint,
    resolveTimeRange,
    extractTimeRange,
  });

  rejectUnexpectedKeys(normalizedParams, [...TAG_KEYS, ...TIME_RANGE_KEYS], USAGE_HINT);

  const tags = extractTags(normalizedParams);

  if (!tags) {
    throw new Error('tags is required as a non-empty array of { object, field } entries. ' + USAGE_HINT);
  }

  if (tags.length > 5) {
    throw new Error('tags may contain at most 5 entries. ' + USAGE_HINT);
  }

  const tagMap = new Map();
  for (let index = 0; index < tags.length; index += 1) {
    const tag = validateTag(tags[index], index);
    const key = toCompositeKey(tag.object, tag.field);
    if (!tagMap.has(key)) {
      tagMap.set(key, tag);
    }
  }

  const time = extractTimeRange(normalizedParams, USAGE_HINT);
  const resolvedTime = resolveTimeRange(time);
  const historyResult = await fieldReadHistory(client, {
    tags: Array.from(tagMap.values()).map(({ object, field }) => ({ object, field })),
    from: resolvedTime.from,
    to: resolvedTime.to,
  });

  const validatedTags = Array.from(tagMap.values());
  const tagLookup = new Map(
    validatedTags.map((tag) => [toCompositeKey(tag.object, tag.field), tag]),
  );
  const blocks = [];

  for (const [tagKey, data] of Object.entries(historyResult.values)) {
    const tag = tagLookup.get(tagKey);
    const notes = [];

    if (data.length === 0) {
      notes.push('No data points were recorded in the requested period.');
    }

    if (data.length > 0 && data[0][0] < resolvedTime.from) {
      notes.push(
        'History is change-driven; the first returned point precedes the requested start and may define the effective value at the range boundary.',
      );
    }

    blocks.push({
      block_kind: 'history',
      tag: tagKey,
      label: tag?.label,
      unit: tag?.unit,
      data,
      last_change: data.length > 0 ? data[data.length - 1][0] : undefined,
      notes: notes.length > 0 ? notes : undefined,
    });
  }

  const warnings = [
    ...historyResult.invalid.map((tagKey) => ({
      severity: 'warning',
      code: 'invalid_tag',
      message: `Invalid tag: ${tagKey}. The object path could not be resolved.`,
      context: { tag: tagKey },
    })),
    ...historyResult.unresolved.map((tagKey) => ({
      severity: 'warning',
      code: 'unresolved_tag',
      message: `Unresolved tag: ${tagKey}. The object exists, but the field is not archived.`,
      context: { tag: tagKey },
    })),
  ];

  const totalRequested = validatedTags.length;
  const totalReturned = blocks.length;
  const completeness =
    warnings.length === 0
      ? { status: 'complete' }
      : {
          status: 'partial',
          reason: `${totalReturned} of ${totalRequested} requested tags resolved successfully.`,
          total_available: totalRequested,
          total_returned: totalReturned,
        };

  const tagKeys = validatedTags.map((tag) => toCompositeKey(tag.object, tag.field));

  return {
    kind: 'history_view',
    blocks,
    warnings,
    provenance: {
      source_skill: 'scada-point-history',
      scope: buildScope(tagKeys),
      period_from: resolvedTime.from,
      period_to: resolvedTime.to,
      timezone: resolvedTime.timezone,
      produced_at: Date.now(),
    },
    completeness,
    metadata: {
      requested_tag_count: totalRequested,
      resolved_tag_count: totalReturned,
      time_label: resolvedTime.label,
    },
  };
};
