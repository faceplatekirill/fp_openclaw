const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_WINDOW_MS = 30 * DAY_MS;
const PAGE_LIMIT = 200;
const SAFETY_LIMIT = 10_000;
const STANDING_LOOKBACK_MS = 30 * DAY_MS;
const DEFAULT_TIMEZONE = 'UTC';
const DEFAULT_OPTIONS = {
  top_n: 10,
  flood_window_minutes: 15,
  flood_threshold_per_hour: 10,
  chattering_min_count: 3,
};
const MAIN_SELECT = [
  'dt_on',
  'dt_off',
  'point',
  'text',
  'fact',
  'relevant',
  'active',
  'acknowledged',
];
const STANDING_SELECT = [
  'dt_on',
  'point',
  'text',
  'fact',
  'relevant',
  'active',
  'acknowledged',
];
const RELATIVE_RANGE_PRESETS = {
  hours_1: 'last_1_hour',
  hours_2: 'last_2_hours',
  hours_6: 'last_6_hours',
  hours_24: 'last_24_hours',
  minutes_15: 'last_15_minutes',
  minutes_30: 'last_30_minutes',
  days_7: 'last_7_days',
};
const ISO_DURATION_PRESETS = {
  PT15M: 'last_15_minutes',
  PT30M: 'last_30_minutes',
  PT1H: 'last_1_hour',
  PT2H: 'last_2_hours',
  PT6H: 'last_6_hours',
  PT24H: 'last_24_hours',
  P1D: 'last_24_hours',
  P7D: 'last_7_days',
};
const USAGE_HINT =
  'RETRY skill_run with corrected params while preserving the requested scope and time intent. ' +
  'Calendar phrases such as "this week" must be retried as explicit time: { from, to, timezone } instead of unsupported presets or by dropping time entirely. ' +
  'Minimal: skill_run({ skill: "scada-alarm-summary" }). ' +
  'Supported: time (optional), scope: { folders: [...] }, options: { top_n?, flood_window_minutes?, flood_threshold_per_hour?, chattering_min_count? }.';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function roundNumber(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeIsoDurationPreset(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase().replace(/\s+/g, '');
  return ISO_DURATION_PRESETS[normalized] ?? null;
}

function formatUtcLocalDateTime(timestamp) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function buildTimeWindowAlias(end, duration, options = {}) {
  const preset = normalizeIsoDurationPreset(duration);
  if (!preset) {
    throw new Error(
      `Unsupported time-window duration "${String(duration)}". ` +
        'Supported examples: PT15M, PT30M, PT1H, PT2H, PT6H, PT24H, P7D. ' +
        USAGE_HINT,
    );
  }

  if (typeof end !== 'string' || end.trim().length === 0) {
    throw new Error('time-window aliases require a non-empty end timestamp string. ' + USAGE_HINT);
  }

  const parsedEnd = Date.parse(end);
  if (!Number.isFinite(parsedEnd)) {
    throw new Error(
      `Unsupported time-window end "${String(end)}". ` +
        'Use an ISO timestamp with Z or offset, for example 2026-03-18T14:45:00Z. ' +
        USAGE_HINT,
    );
  }

  const nowDeltaMs = Math.abs(Date.now() - parsedEnd);
  if (!options.forceExplicit && nowDeltaMs <= 5 * 60 * 1000) {
    return { preset };
  }

  const durationMsByPreset = {
    last_15_minutes: 15 * 60 * 1000,
    last_30_minutes: 30 * 60 * 1000,
    last_1_hour: 60 * 60 * 1000,
    last_2_hours: 2 * 60 * 60 * 1000,
    last_6_hours: 6 * 60 * 60 * 1000,
    last_24_hours: 24 * 60 * 60 * 1000,
    last_7_days: 7 * 24 * 60 * 60 * 1000,
  };

  return {
    from: formatUtcLocalDateTime(parsedEnd - durationMsByPreset[preset]),
    to: formatUtcLocalDateTime(parsedEnd),
    timezone: 'UTC',
  };
}

function resolveStructuredLastTimeRange(timeRange) {
  if (
    !isRecord(timeRange) ||
    typeof timeRange.kind !== 'string' ||
    timeRange.kind.trim().toLowerCase() !== 'last'
  ) {
    return null;
  }

  const rawUnit =
    typeof timeRange.unit === 'string'
      ? timeRange.unit.trim().toLowerCase()
      : '';
  const amount =
    typeof timeRange.amount === 'number'
      ? timeRange.amount
      : typeof timeRange.count === 'number'
        ? timeRange.count
        : typeof timeRange.value === 'number'
          ? timeRange.value
          : Number.NaN;

  if (!Number.isInteger(amount) || amount <= 0) {
    return null;
  }

  let normalizedUnit;
  let isoDuration;
  if (rawUnit === 'hour' || rawUnit === 'hours' || rawUnit === 'h') {
    normalizedUnit = 'hours';
    isoDuration = `PT${amount}H`;
  } else if (
    rawUnit === 'minute' ||
    rawUnit === 'minutes' ||
    rawUnit === 'm' ||
    rawUnit === 'min' ||
    rawUnit === 'mins'
  ) {
    normalizedUnit = 'minutes';
    isoDuration = `PT${amount}M`;
  } else if (rawUnit === 'day' || rawUnit === 'days' || rawUnit === 'd') {
    normalizedUnit = 'days';
    isoDuration = `P${amount}D`;
  } else {
    return null;
  }

  const preset = RELATIVE_RANGE_PRESETS[`${normalizedUnit}_${amount}`] ?? null;
  if (!preset) {
    return null;
  }

  const end = timeRange.end ?? timeRange.until;
  if (end === undefined) {
    return { preset };
  }

  return buildTimeWindowAlias(end, isoDuration, { forceExplicit: true });
}

function resolveRelativeTimeRangePreset(timeRange) {
  if (!isRecord(timeRange) || timeRange.kind !== 'relative') {
    return null;
  }

  if (!isRecord(timeRange.from)) {
    return null;
  }

  const toIsNow =
    timeRange.to === 'now' ||
    (isRecord(timeRange.to) && timeRange.to.kind === 'now');
  if (!toIsNow) {
    return null;
  }

  const rawUnit =
    typeof timeRange.from.unit === 'string'
      ? timeRange.from.unit.trim().toLowerCase()
      : '';
  const value =
    typeof timeRange.from.value === 'number'
      ? timeRange.from.value
      : Number.NaN;

  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  let normalizedUnit;
  if (rawUnit === 'hour' || rawUnit === 'hours' || rawUnit === 'h') {
    normalizedUnit = 'hours';
  } else if (
    rawUnit === 'minute' ||
    rawUnit === 'minutes' ||
    rawUnit === 'm' ||
    rawUnit === 'min' ||
    rawUnit === 'mins'
  ) {
    normalizedUnit = 'minutes';
  } else if (rawUnit === 'day' || rawUnit === 'days' || rawUnit === 'd') {
    normalizedUnit = 'days';
  } else {
    return null;
  }

  return RELATIVE_RANGE_PRESETS[`${normalizedUnit}_${value}`] ?? null;
}

function normalizeTopLevelAliases(params) {
  const normalized = { ...params };

  if (normalized.scopeLabel !== undefined) {
    if (normalized.scope_label !== undefined) {
      throw new Error('Conflicting params: scopeLabel cannot be combined with scope_label. ' + USAGE_HINT);
    }

    normalized.scope_label = normalized.scopeLabel;
    delete normalized.scopeLabel;
  }

  if (normalized.scope_label !== undefined) {
    if (typeof normalized.scope_label !== 'string' || normalized.scope_label.trim().length === 0) {
      throw new Error('scope_label alias must be a non-empty string when provided. ' + USAGE_HINT);
    }

    if (normalized.scope === undefined && normalized.folders === undefined) {
      const folder = normalized.scope_label.trim();
      normalized.scope = {
        folders: [folder.startsWith('/') ? folder : `/${folder}`],
      };
    }

    delete normalized.scope_label;
  }

  if (normalized.scope_folders !== undefined) {
    if (normalized.scope !== undefined || normalized.folders !== undefined) {
      throw new Error(
        'Conflicting params: scope_folders cannot be combined with scope or folders. ' +
          USAGE_HINT,
      );
    }

    const folders = Array.isArray(normalized.scope_folders)
      ? normalized.scope_folders
      : [normalized.scope_folders];
    normalized.scope = { folders };
    delete normalized.scope_folders;
  }

  if (
    normalized.time_range_end !== undefined ||
    normalized.time_range_duration !== undefined
  ) {
    if (
      normalized.time !== undefined ||
      normalized.timeRange !== undefined ||
      normalized.time_range !== undefined ||
      normalized.range !== undefined ||
      normalized.preset !== undefined ||
      normalized.period !== undefined
    ) {
      throw new Error(
        'Conflicting params: time_range_end/time_range_duration cannot be combined with other time aliases. ' +
          USAGE_HINT,
      );
    }

    if (
      normalized.time_range_end === undefined ||
      normalized.time_range_duration === undefined
    ) {
      throw new Error(
        'time_range_end and time_range_duration must be provided together. ' +
          USAGE_HINT,
      );
    }

    normalized.time_window = {
      end: normalized.time_range_end,
      duration: normalized.time_range_duration,
    };
    delete normalized.time_range_end;
    delete normalized.time_range_duration;
  }

  if (typeof normalized.scope === 'string') {
    const folder = normalized.scope.trim();
    if (!folder) {
      throw new Error('scope alias must be a non-empty folder path string when provided. ' + USAGE_HINT);
    }

    normalized.scope = { folders: [folder] };
  }

  if (typeof normalized.scope_path === 'string') {
    const folder = normalized.scope_path.trim();
    if (!folder) {
      throw new Error('scope_path alias must be a non-empty folder path string when provided. ' + USAGE_HINT);
    }

    if (normalized.scope !== undefined || normalized.folders !== undefined) {
      throw new Error(
        'Conflicting params: scope_path cannot be combined with scope or folders. ' +
          USAGE_HINT,
      );
    }

    normalized.scope = { folders: [folder] };
    delete normalized.scope_path;
  }

  if (typeof normalized.scope_folder === 'string') {
    const folder = normalized.scope_folder.trim();
    if (!folder) {
      throw new Error('scope_folder alias must be a non-empty folder path string when provided. ' + USAGE_HINT);
    }

    if (normalized.scope !== undefined || normalized.folders !== undefined) {
      throw new Error(
        'Conflicting params: scope_folder cannot be combined with scope or folders. ' +
          USAGE_HINT,
      );
    }

    normalized.scope = { folders: [folder] };
    delete normalized.scope_folder;
  }

  if (Array.isArray(normalized.scope)) {
    normalized.scope = { folders: normalized.scope };
  }

  if (normalized.time_range !== undefined) {
    if (normalized.timeRange !== undefined || normalized.range !== undefined) {
      throw new Error(
        'Conflicting params: time_range cannot be combined with timeRange or range. ' +
          USAGE_HINT,
      );
    }

    if (
      isRecord(normalized.time_range) &&
      (normalized.time_range.kind !== undefined ||
        isRecord(normalized.time_range.range))
    ) {
      normalized.timeRange = normalized.time_range;
    } else if (isRecord(normalized.time_range)) {
      normalized.time = { ...normalized.time_range };
    } else {
      normalized.range = normalized.time_range;
    }
    delete normalized.time_range;
  }

  if (isRecord(normalized.time_window)) {
    if (
      normalized.time !== undefined ||
      normalized.timeRange !== undefined ||
      normalized.from !== undefined ||
      normalized.to !== undefined ||
      normalized.time_from !== undefined ||
      normalized.time_to !== undefined ||
      normalized.time_range !== undefined ||
      normalized.preset !== undefined ||
      normalized.period !== undefined ||
      normalized.range !== undefined
    ) {
      throw new Error(
        'Conflicting params: time_window object cannot be combined with other time aliases. ' +
          USAGE_HINT,
      );
    }

    const unknownTimeWindowKeys = Object.keys(normalized.time_window).filter(
      (key) => key !== 'end' && key !== 'duration',
    );
    if (unknownTimeWindowKeys.length > 0) {
      throw new Error(
        `Unexpected keys inside time_window: ${unknownTimeWindowKeys.join(', ')}. ` +
          'time_window only supports { end, duration }. ' +
          USAGE_HINT,
      );
    }

    const normalizedWindow = buildTimeWindowAlias(
      normalized.time_window.end,
      normalized.time_window.duration,
    );

    if (normalizedWindow.preset) {
      normalized.range = normalizedWindow.preset;
    } else {
      normalized.time = normalizedWindow;
    }

    delete normalized.time_window;
  }

  if (normalized.time_preset !== undefined) {
    if (
      normalized.time !== undefined ||
      normalized.timeRange !== undefined ||
      normalized.range !== undefined ||
      normalized.preset !== undefined
    ) {
      throw new Error(
        'Conflicting params: time_preset cannot be combined with other time aliases. ' +
          USAGE_HINT,
      );
    }

    normalized.range = normalized.time_preset;
    delete normalized.time_preset;
  }

  if (normalized.timeRange !== undefined) {
    const hasOtherTimeShape =
      normalized.time !== undefined ||
      normalized.from !== undefined ||
      normalized.to !== undefined ||
      normalized.time_from !== undefined ||
      normalized.time_to !== undefined ||
      normalized.time_range !== undefined ||
      normalized.preset !== undefined ||
      normalized.period !== undefined ||
      normalized.range !== undefined;

    if (hasOtherTimeShape) {
      throw new Error(
        'Conflicting params: timeRange cannot be combined with other time fields. ' +
          USAGE_HINT,
      );
    }

    if (typeof normalized.timeRange === 'string') {
      normalized.range = normalized.timeRange;
      delete normalized.timeRange;
    } else {
      const structuredLastRange = resolveStructuredLastTimeRange(
        normalized.timeRange,
      );
      if (structuredLastRange) {
        if (structuredLastRange.preset) {
          normalized.range = structuredLastRange.preset;
        } else {
          normalized.time = structuredLastRange;
        }
        delete normalized.timezone;
        delete normalized.timeRange;
      } else {
        const preset = resolveRelativeTimeRangePreset(normalized.timeRange);
        if (!preset) {
          throw new Error(
            'timeRange alias currently supports only relative ranges ending at now or structured last ranges with an optional end timestamp. ' +
              USAGE_HINT,
          );
        }

        normalized.time = {
          preset,
          timezone: typeof normalized.timezone === 'string' ? normalized.timezone : DEFAULT_TIMEZONE,
        };
        delete normalized.timezone;
        delete normalized.timeRange;
      }
    }
  }

  if (normalized.folders !== undefined) {
    if (normalized.scope !== undefined) {
      throw new Error(
        'Conflicting params: scope and folders are both present. Use nested scope: { folders } or the flat folders alias, not both. ' +
          USAGE_HINT,
      );
    }

    normalized.scope = { folders: normalized.folders };
    delete normalized.folders;
  }

  return normalized;
}

function normalizeFolders(scope) {
  if (scope === undefined) {
    return undefined;
  }

  if (!isRecord(scope)) {
    throw new Error('scope must be an object when provided (e.g. { folders: ["/root/FP/..."] }). ' + USAGE_HINT);
  }

  const unknownScopeKeys = Object.keys(scope).filter((key) => key !== 'folders');
  if (unknownScopeKeys.length > 0) {
    throw new Error(`Unexpected keys inside scope: ${unknownScopeKeys.join(', ')}. scope only supports { folders }. ${USAGE_HINT}`);
  }

  if (scope.folders === undefined) {
    return undefined;
  }

  if (!Array.isArray(scope.folders)) {
    throw new Error('scope.folders must be an array of folder paths. ' + USAGE_HINT);
  }

  const folders = dedupeStrings(
    scope.folders
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0),
  );

  if (folders.length === 0) {
    throw new Error('scope.folders must contain at least one non-empty folder path. ' + USAGE_HINT);
  }

  return folders;
}

function readPositiveNumber(value, fieldName, { integer = false } = {}) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`options.${fieldName} must be a positive number. ${USAGE_HINT}`);
  }

  if (integer && !Number.isInteger(value)) {
    throw new Error(`options.${fieldName} must be a positive number. ${USAGE_HINT}`);
  }

  return value;
}

function normalizeOptions(options) {
  if (options === undefined) {
    return { ...DEFAULT_OPTIONS };
  }

  if (!isRecord(options)) {
    throw new Error('options must be an object when provided. ' + USAGE_HINT);
  }

  const knownOptionKeys = new Set([
    'top_n',
    'flood_window_minutes',
    'flood_threshold_per_hour',
    'chattering_min_count',
  ]);
  const unknownOptionKeys = Object.keys(options).filter((key) => !knownOptionKeys.has(key));
  if (unknownOptionKeys.length > 0) {
    throw new Error(`Unexpected keys inside options: ${unknownOptionKeys.join(', ')}. options supports { top_n, flood_window_minutes, flood_threshold_per_hour, chattering_min_count }. ${USAGE_HINT}`);
  }

  return {
    top_n: readPositiveNumber(options.top_n, 'top_n', { integer: true }) ?? DEFAULT_OPTIONS.top_n,
    flood_window_minutes:
      readPositiveNumber(options.flood_window_minutes, 'flood_window_minutes') ??
      DEFAULT_OPTIONS.flood_window_minutes,
    flood_threshold_per_hour:
      readPositiveNumber(options.flood_threshold_per_hour, 'flood_threshold_per_hour') ??
      DEFAULT_OPTIONS.flood_threshold_per_hour,
    chattering_min_count:
      readPositiveNumber(options.chattering_min_count, 'chattering_min_count', {
        integer: true,
      }) ?? DEFAULT_OPTIONS.chattering_min_count,
  };
}

function appendUsageHint(message) {
  if (message.includes('RETRY skill_run')) {
    return message;
  }

  return `${message} ${USAGE_HINT}`;
}

function wrapParamError(error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(appendUsageHint(message));
}

function validateParams(params, extractTimeRange) {
  if (!isRecord(params)) {
    throw new Error('params must be an object. ' + USAGE_HINT);
  }

  return {
    time: extractTimeRange(params, USAGE_HINT),
    folders: normalizeFolders(params.scope),
    options: normalizeOptions(params.options),
  };
}

function splitRange(from, to) {
  const windows = [];
  let cursor = from;

  while (cursor < to) {
    const windowTo = Math.min(cursor + MAX_WINDOW_MS, to);
    windows.push({ from: cursor, to: windowTo });
    cursor = windowTo;
  }

  return windows;
}

function coerceTimestamp(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeAlarmRow(row) {
  const dtOn = coerceTimestamp(row.dt_on);
  const point = typeof row.point === 'string' ? row.point : '';

  if (dtOn === null || point.length === 0) {
    return null;
  }

  const dtOff = coerceTimestamp(row.dt_off);
  const text = typeof row.text === 'string' ? row.text : undefined;
  const fact =
    typeof row.fact === 'string' || typeof row.fact === 'number'
      ? String(row.fact)
      : undefined;
  const relevant =
    typeof row.relevant === 'string' ||
    typeof row.relevant === 'number' ||
    typeof row.relevant === 'boolean'
      ? row.relevant
      : undefined;

  return {
    dt_on: dtOn,
    dt_off: dtOff === null ? undefined : dtOff,
    point,
    text,
    fact,
    relevant,
    active: row.active === true,
    acknowledged: row.acknowledged === true,
  };
}

function buildAlarmKey(alarm) {
  return [
    alarm.dt_on,
    alarm.point,
    alarm.text ?? '',
    alarm.fact ?? '',
    alarm.relevant ?? '',
  ].join('|');
}

function pushUniqueAlarm(alarm, alarms, seen, maxUnique) {
  const key = buildAlarmKey(alarm);
  if (seen.has(key)) {
    return 'duplicate';
  }

  if (alarms.length >= maxUnique) {
    return 'limit';
  }

  seen.add(key);
  alarms.push(alarm);
  return 'added';
}

async function fetchAllAlarms(client, queryAlarms, folders, windows, maxUnique) {
  const alarms = [];
  const seen = new Set();
  const warnings = [];
  let totalAvailable = 0;
  let pageCount = 0;
  let hitSafetyLimit = false;
  let paginationError = null;

  for (const window of windows) {
    let offset = 0;
    let firstPageFetched = false;

    while (true) {
      if (hitSafetyLimit && firstPageFetched) {
        break;
      }

      let result;
      try {
        result = await queryAlarms(client, {
          time_from: window.from,
          time_to: window.to,
          folders,
          select: MAIN_SELECT,
          limit: PAGE_LIMIT,
          offset,
        });
      } catch (error) {
        if (pageCount === 0) {
          throw error;
        }

        paginationError = error instanceof Error ? error.message : String(error);
        break;
      }

      pageCount += 1;
      if (!firstPageFetched) {
        totalAvailable += result.total;
        firstPageFetched = true;
      }

      warnings.push(
        ...(Array.isArray(result.warnings) ? result.warnings : []).map((message) =>
          createWarning(message, 'alarm_query_warning', 'warning', window),
        ),
      );

      for (const row of Array.isArray(result.alarms) ? result.alarms : []) {
        if (!isRecord(row)) {
          continue;
        }

        const normalized = normalizeAlarmRow(row);
        if (!normalized) {
          continue;
        }

        const pushResult = pushUniqueAlarm(normalized, alarms, seen, maxUnique);
        if (pushResult === 'limit') {
          hitSafetyLimit = true;
          break;
        }

        if (alarms.length >= maxUnique) {
          hitSafetyLimit = true;
          break;
        }
      }

      if (hitSafetyLimit || (Array.isArray(result.alarms) ? result.alarms.length : 0) < PAGE_LIMIT) {
        break;
      }

      offset += PAGE_LIMIT;
    }
  }

  return {
    alarms,
    totalAvailable,
    pageCount,
    warnings,
    hitSafetyLimit,
    paginationError,
  };
}

async function fetchStandingAlarms(client, queryAlarms, folders, nowMs) {
  const result = await queryAlarms(client, {
    time_from: nowMs - STANDING_LOOKBACK_MS,
    time_to: nowMs,
    active: true,
    folders,
    select: STANDING_SELECT,
    limit: PAGE_LIMIT,
    offset: 0,
  });

  const warnings = [
    ...(Array.isArray(result.warnings) ? result.warnings : []).map((message) =>
      createWarning(message, 'alarm_query_warning', 'warning'),
    ),
  ];

  if (
    (Array.isArray(result.alarms) && result.alarms.length === PAGE_LIMIT) ||
    result.total > PAGE_LIMIT
  ) {
    warnings.push(
      createWarning(
        'Standing alarm list may be incomplete; some active alarms older than 30 days cannot be detected',
        'standing_limit',
        'warning',
      ),
    );
  }

  const alarms = [];
  const seen = new Set();
  for (const row of Array.isArray(result.alarms) ? result.alarms : []) {
    if (!isRecord(row)) {
      continue;
    }

    const normalized = normalizeAlarmRow(row);
    if (!normalized) {
      continue;
    }

    pushUniqueAlarm(normalized, alarms, seen, Number.POSITIVE_INFINITY);
  }

  return { alarms, warnings };
}

function normalizeBucketKey(value, fallback) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return fallback;
}

function countBy(alarms, selector, fallback) {
  const counts = new Map();

  for (const alarm of alarms) {
    const key = normalizeBucketKey(selector(alarm), fallback);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function computeCoreMetrics(alarms, periodFrom, periodTo) {
  const totalAlarms = alarms.length;
  const periodHours = Math.max((periodTo - periodFrom) / 3_600_000, 0.001);
  const alarmsPerHour = totalAlarms === 0 ? 0 : roundNumber(totalAlarms / periodHours, 2);

  return {
    totalAlarms,
    alarmsPerHour,
    categoryDist: countBy(alarms, (alarm) => alarm.fact, 'unknown'),
    priorityDist: countBy(alarms, (alarm) => alarm.relevant, 'unclassified'),
  };
}

function computeTopOffenders(alarms, topN) {
  if (alarms.length === 0) {
    return [];
  }

  const groups = new Map();
  for (const alarm of alarms) {
    groups.set(alarm.point, (groups.get(alarm.point) ?? 0) + 1);
  }

  return [...groups.entries()]
    .map(([source, count]) => ({
      source,
      count,
      percentage: roundNumber((count / alarms.length) * 100, 1),
    }))
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
    .slice(0, topN);
}

function detectFloodPeriods(alarms, windowMinutes, thresholdPerHour) {
  if (alarms.length === 0) {
    return [];
  }

  const sorted = [...alarms].sort((left, right) => left.dt_on - right.dt_on);
  const windowMs = windowMinutes * 60_000;
  const floods = [];
  let startIndex = 0;
  let currentFlood = null;

  for (let index = 0; index < sorted.length; index += 1) {
    const alarm = sorted[index];
    const windowStart = alarm.dt_on - windowMs;

    while (startIndex < index && sorted[startIndex].dt_on < windowStart) {
      startIndex += 1;
    }

    const windowCount = index - startIndex + 1;
    const ratePerHour = windowCount / (windowMinutes / 60);
    if (ratePerHour >= thresholdPerHour) {
      if (!currentFlood) {
        currentFlood = {
          from: windowStart,
          to: alarm.dt_on,
          rate_per_hour: roundNumber(ratePerHour, 2),
        };
      } else {
        currentFlood.to = alarm.dt_on;
        currentFlood.rate_per_hour = Math.max(
          currentFlood.rate_per_hour,
          roundNumber(ratePerHour, 2),
        );
      }
      continue;
    }

    if (currentFlood) {
      floods.push(currentFlood);
      currentFlood = null;
    }
  }

  if (currentFlood) {
    floods.push(currentFlood);
  }

  return floods;
}

function detectStandingAlarms(alarms) {
  const groups = new Map();

  for (const alarm of alarms) {
    if (alarm.active !== true) {
      continue;
    }

    const current = groups.get(alarm.point);
    if (!current || alarm.dt_on < current.since) {
      groups.set(alarm.point, {
        source: alarm.point,
        message: alarm.text,
        since: alarm.dt_on,
      });
    }
  }

  return [...groups.values()].sort((left, right) => left.since - right.since);
}

function detectChatteringAlarms(alarms, minOccurrences, topN) {
  const groups = new Map();

  for (const alarm of alarms) {
    if (!groups.has(alarm.point)) {
      groups.set(alarm.point, []);
    }
    groups.get(alarm.point).push(alarm);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length >= minOccurrences)
    .map(([source, group]) => {
      const durations = group
        .filter((alarm) => typeof alarm.dt_off === 'number' && alarm.dt_off > alarm.dt_on)
        .map((alarm) => alarm.dt_off - alarm.dt_on);

      const avgDurationMs =
        durations.length > 0
          ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
          : undefined;

      return {
        source,
        count: group.length,
        avg_duration_ms: avgDurationMs,
      };
    })
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
    .slice(0, topN);
}

function buildScope(folders) {
  if (!folders || folders.length === 0) {
    return 'all alarms';
  }

  return folders.join(', ');
}

function buildAlarmSummaryViewModel({
  metrics,
  warnings,
  resolvedTime,
  folders,
  completeness,
  metadata,
}) {
  const block = {
    block_kind: 'alarm_summary',
    metrics: {
      total_alarms: metrics.totalAlarms,
      alarms_per_hour: metrics.alarmsPerHour,
      top_offenders: metrics.topOffenders,
      flood_periods: metrics.floodPeriods,
      standing_alarms: metrics.standingAlarms,
      chattering_alarms: metrics.chatteringAlarms,
    },
  };

  if (Object.keys(metrics.priorityDist).length > 0) {
    block.priority_distribution = metrics.priorityDist;
  }

  if (Object.keys(metrics.categoryDist).length > 0) {
    block.category_distribution = metrics.categoryDist;
  }

  return {
    kind: 'alarm_summary',
    blocks: [block],
    warnings,
    provenance: {
      source_skill: 'scada-alarm-summary',
      scope: buildScope(folders),
      period_from: resolvedTime.from,
      period_to: resolvedTime.to,
      timezone: resolvedTime.timezone || DEFAULT_TIMEZONE,
      produced_at: Date.now(),
    },
    completeness,
    metadata,
  };
}

module.exports = async function runScadaAlarmSummary({ client, params }) {
  const [{ queryAlarms }, { resolveTimeRange, extractTimeRange, rejectUnexpectedKeys, TIME_RANGE_KEYS }] =
    await Promise.all([
      import('../../libs/ecomet-core/dist/index.js'),
      import('../../libs/skills-core/dist/index.js'),
    ]);

  let normalizedParams;
  let validated;
  let resolvedTime;

  try {
    if (!isRecord(params)) {
      throw new Error('params must be an object. ' + USAGE_HINT);
    }

    normalizedParams = normalizeTopLevelAliases(params);
    rejectUnexpectedKeys(
      normalizedParams,
      [...TIME_RANGE_KEYS, 'scope', 'options'],
      USAGE_HINT,
    );
    validated = validateParams(normalizedParams, extractTimeRange);
    resolvedTime = resolveTimeRange(validated.time ?? { preset: 'last_24_hours' });
  } catch (error) {
    wrapParamError(error);
  }

  const windows = splitRange(resolvedTime.from, resolvedTime.to);
  const warnings = [];

  if (windows.length > 1) {
    warnings.push(
      createWarning(
        `Range split into ${windows.length} windows`,
        'window_split',
        'info',
        { window_count: windows.length },
      ),
    );
  }

  const mainFetch = await fetchAllAlarms(
    client,
    queryAlarms,
    validated.folders,
    windows,
    SAFETY_LIMIT,
  );
  warnings.push(...mainFetch.warnings);

  if (mainFetch.pageCount > 1) {
    warnings.push(
      createWarning(
        `Fetched ${mainFetch.pageCount} pages, ${mainFetch.totalAvailable} alarms total`,
        'auto_pagination',
        'info',
        {
          page_count: mainFetch.pageCount,
          total_available: mainFetch.totalAvailable,
        },
      ),
    );
  }

  if (mainFetch.hitSafetyLimit) {
    warnings.push(
      createWarning(
        'Alarm count exceeds safety limit; metrics computed on first 10,000',
        'safety_limit',
        'warning',
        {
          total_fetched: mainFetch.alarms.length,
          total_available: mainFetch.totalAvailable,
        },
      ),
    );
  }

  if (mainFetch.alarms.length === 0) {
    warnings.push(
      createWarning(
        'No alarms found for the requested scope and time range',
        'empty_result',
        'info',
      ),
    );
  }

  const mainRangeCoversLookback =
    resolvedTime.to - resolvedTime.from >= STANDING_LOOKBACK_MS;
  let standingSource = mainFetch.alarms;
  if (!mainRangeCoversLookback) {
    const standingFetch = await fetchStandingAlarms(
      client,
      queryAlarms,
      validated.folders,
      Date.now(),
    );
    standingSource = standingFetch.alarms;
    warnings.push(...standingFetch.warnings);
  }

  const core = computeCoreMetrics(mainFetch.alarms, resolvedTime.from, resolvedTime.to);
  const metrics = {
    ...core,
    topOffenders: computeTopOffenders(mainFetch.alarms, validated.options.top_n),
    floodPeriods: detectFloodPeriods(
      mainFetch.alarms,
      validated.options.flood_window_minutes,
      validated.options.flood_threshold_per_hour,
    ),
    standingAlarms: detectStandingAlarms(standingSource),
    chatteringAlarms: detectChatteringAlarms(
      mainFetch.alarms,
      validated.options.chattering_min_count,
      validated.options.top_n,
    ),
  };

  let completeness = { status: 'complete' };
  if (mainFetch.hitSafetyLimit) {
    completeness = {
      status: 'partial',
      reason: `Metrics computed on first ${SAFETY_LIMIT} of ${mainFetch.totalAvailable} total alarms`,
      total_available: mainFetch.totalAvailable,
      total_returned: mainFetch.alarms.length,
    };
  } else if (mainFetch.paginationError) {
    completeness = {
      status: 'partial',
      reason: 'Some alarm pages could not be retrieved',
      total_available: mainFetch.totalAvailable,
      total_returned: mainFetch.alarms.length,
    };
  }

  return buildAlarmSummaryViewModel({
    metrics,
    warnings,
    resolvedTime,
    folders: validated.folders,
    completeness,
    metadata: {
      total_fetched: mainFetch.alarms.length,
      pagination_pages: mainFetch.pageCount,
      split_window_count: windows.length,
      options_used: {
        top_n: validated.options.top_n,
        flood_window_minutes: validated.options.flood_window_minutes,
        flood_threshold_per_hour: validated.options.flood_threshold_per_hour,
        chattering_min_count: validated.options.chattering_min_count,
      },
    },
  });
};
