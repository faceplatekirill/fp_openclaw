const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_WINDOW_MS = 30 * DAY_MS;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 200;
const DEFAULT_TIMEZONE = 'UTC';
const DEFAULT_SELECT = ['dt_on', 'point', 'text', 'active', 'acknowledged', 'fact', 'relevant'];
const FORCED_SELECT = ['dt_on', 'point', 'text', 'fact', 'relevant', 'active', 'acknowledged'];
const RELATIVE_RANGE_PRESETS = {
  hours_1: 'last_1_hour',
  hours_2: 'last_2_hours',
  hours_6: 'last_6_hours',
  hours_24: 'last_24_hours',
  minutes_15: 'last_15_minutes',
  minutes_30: 'last_30_minutes',
  days_7: 'last_7_days',
};

const USAGE_HINT =
  'RETRY skill_run with corrected params. ' +
  'Minimal: skill_run({ skill: "scada-alarm-list" }). ' +
  'Supported: time (optional), scope: { folders: [...] }, filters: { active?, acknowledged?, fields?, search? }, ' +
  'select (array), page: { limit? (max 200), offset? }.';

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
    throw new Error(
      'time-window aliases require a non-empty end timestamp string. ' +
        USAGE_HINT,
    );
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

  const durationMs = durationMsByPreset[preset];
  return {
    from: formatUtcLocalDateTime(parsedEnd - durationMs),
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

function normalizeSelect(select) {
  if (select !== undefined && !Array.isArray(select)) {
    throw new Error('select must be an array of field names when provided. ' + USAGE_HINT);
  }

  const base = Array.isArray(select)
    ? select
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0)
    : DEFAULT_SELECT;

  return dedupeStrings([...base, ...FORCED_SELECT]);
}

function normalizePage(page) {
  if (page === undefined) {
    return {
      limit: DEFAULT_LIMIT,
      offset: 0,
    };
  }

  if (!isRecord(page)) {
    throw new Error('page must be an object when provided. ' + USAGE_HINT);
  }

  const unknownPageKeys = Object.keys(page).filter((k) => k !== 'limit' && k !== 'offset');
  if (unknownPageKeys.length > 0) {
    throw new Error(`Unexpected keys inside page: ${unknownPageKeys.join(', ')}. page only supports { limit, offset }. ${USAGE_HINT}`);
  }

  const limit = page.limit === undefined ? DEFAULT_LIMIT : page.limit;
  const offset = page.offset === undefined ? 0 : page.offset;

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('page.limit must be a positive integer. ' + USAGE_HINT);
  }

  if (limit > MAX_LIMIT) {
    throw new Error(`page.limit max is ${MAX_LIMIT}. ` + USAGE_HINT);
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('page.offset must be a non-negative integer. ' + USAGE_HINT);
  }

  return { limit, offset };
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

  const unit = typeof timeRange.from.unit === 'string' ? timeRange.from.unit.trim().toLowerCase() : '';
  const value =
    typeof timeRange.from.value === 'number'
      ? timeRange.from.value
      : Number.NaN;

  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  let normalizedUnit;
  if (unit === 'hour' || unit === 'hours' || unit === 'h') {
    normalizedUnit = 'hours';
  } else if (unit === 'minute' || unit === 'minutes' || unit === 'm' || unit === 'min' || unit === 'mins') {
    normalizedUnit = 'minutes';
  } else if (unit === 'day' || unit === 'days' || unit === 'd') {
    normalizedUnit = 'days';
  } else {
    return null;
  }

  return RELATIVE_RANGE_PRESETS[`${normalizedUnit}_${value}`] ?? null;
}

function normalizeTopLevelAliases(params) {
  const normalized = { ...params };

  if (normalized.include_values !== undefined) {
    delete normalized.include_values;
  }

  if (normalized.include_stats !== undefined) {
    delete normalized.include_stats;
  }

  if (normalized.pageSize !== undefined) {
    if (normalized.page_size !== undefined) {
      throw new Error(
        'Conflicting params: pageSize cannot be combined with page_size. ' +
          USAGE_HINT,
      );
    }

    normalized.page_size = normalized.pageSize;
    delete normalized.pageSize;
  }

  if (normalized.scopeLabel !== undefined) {
    if (normalized.scope_label !== undefined) {
      throw new Error(
        'Conflicting params: scopeLabel cannot be combined with scope_label. ' +
          USAGE_HINT,
      );
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

  if (isRecord(normalized.paging)) {
    if (
      normalized.page !== undefined ||
      normalized.page_size !== undefined ||
      normalized.pageSize !== undefined ||
      normalized.limit !== undefined ||
      normalized.offset !== undefined
    ) {
      throw new Error(
        'Conflicting params: paging cannot be combined with page, page_size, limit, or offset. ' +
          USAGE_HINT,
      );
    }

    const unknownPagingKeys = Object.keys(normalized.paging).filter(
      (key) => key !== 'page' && key !== 'page_size' && key !== 'pageSize',
    );
    if (unknownPagingKeys.length > 0) {
      throw new Error(
        `Unexpected keys inside paging: ${unknownPagingKeys.join(', ')}. paging only supports { page, page_size/pageSize }. ` +
          USAGE_HINT,
      );
    }

    if (normalized.paging.page !== undefined) {
      normalized.page = normalized.paging.page;
    }
    if (normalized.paging.page_size !== undefined) {
      normalized.page_size = normalized.paging.page_size;
    }
    if (normalized.paging.pageSize !== undefined) {
      normalized.pageSize = normalized.paging.pageSize;
    }

    delete normalized.paging;
  }

  if (normalized.include_history !== undefined) {
    delete normalized.include_history;
  }

  if (
    normalized.search_text !== undefined ||
    normalized.search_fields !== undefined
  ) {
    if (normalized.search !== undefined || normalized.filters !== undefined) {
      throw new Error(
        'Conflicting params: search_text/search_fields cannot be combined with search or filters. ' +
          USAGE_HINT,
      );
    }

    if (
      normalized.search_text !== null &&
      normalized.search_text !== undefined
    ) {
      if (
        typeof normalized.search_text !== 'string' ||
        normalized.search_text.trim().length === 0
      ) {
        throw new Error(
          'search_text must be a non-empty string when provided. ' +
            USAGE_HINT,
        );
      }

      let searchIn = ['text', 'point'];
      if (
        normalized.search_fields !== undefined &&
        normalized.search_fields !== null
      ) {
        if (!Array.isArray(normalized.search_fields)) {
          throw new Error(
            'search_fields must be an array of field names when provided. ' +
              USAGE_HINT,
          );
        }

        searchIn = normalized.search_fields
          .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
          .filter((entry) => entry.length > 0);

        if (searchIn.length === 0) {
          throw new Error(
            'search_fields must contain at least one non-empty field name when provided. ' +
              USAGE_HINT,
          );
        }
      }

      normalized.search = {
        text: normalized.search_text.trim(),
        in: searchIn,
      };
    }

    delete normalized.search_text;
    delete normalized.search_fields;
  }

  if (normalized.select_fields !== undefined) {
    if (normalized.select !== undefined) {
      throw new Error(
        'Conflicting params: select_fields cannot be combined with select. ' +
          USAGE_HINT,
      );
    }

    normalized.select = normalized.select_fields;
    delete normalized.select_fields;
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

  const flatFilterKeys = ['active', 'acknowledged', 'fields', 'search'];
  const presentFlatFilterKeys = flatFilterKeys.filter((key) => normalized[key] !== undefined);

  if (normalized.active_only !== undefined) {
    if (normalized.activeOnly !== undefined) {
      throw new Error(
        'Conflicting params: active_only cannot be combined with activeOnly. ' +
          USAGE_HINT,
      );
    }

    normalized.activeOnly = normalized.active_only;
    delete normalized.active_only;
  }

  if (normalized.ack_filter !== undefined) {
    if (normalized.ackFilter !== undefined) {
      throw new Error(
        'Conflicting params: ack_filter cannot be combined with ackFilter. ' +
          USAGE_HINT,
      );
    }

    normalized.ackFilter = normalized.ack_filter;
    delete normalized.ack_filter;
  }

  if (normalized.activeOnly !== undefined) {
    if (normalized.active !== undefined || normalized.filters !== undefined) {
      throw new Error(
        'Conflicting params: activeOnly cannot be combined with active or filters. ' +
          USAGE_HINT,
      );
    }

    if (normalized.activeOnly !== null && typeof normalized.activeOnly !== 'boolean') {
      throw new Error('activeOnly must be boolean when provided. ' + USAGE_HINT);
    }

    if (normalized.activeOnly === true) {
      normalized.active = true;
    }

    delete normalized.activeOnly;
  }

  if (normalized.ackFilter !== undefined) {
    if (normalized.acknowledged !== undefined || normalized.filters !== undefined) {
      throw new Error(
        'Conflicting params: ackFilter cannot be combined with acknowledged or filters. ' +
          USAGE_HINT,
      );
    }

    if (normalized.ackFilter !== null) {
      if (typeof normalized.ackFilter !== 'string') {
        throw new Error('ackFilter must be a string when provided. ' + USAGE_HINT);
      }

      const ackFilter = normalized.ackFilter.trim().toLowerCase();
      if (ackFilter === 'acknowledged' || ackFilter === 'acked') {
        normalized.acknowledged = true;
      } else if (
        ackFilter === 'unacknowledged' ||
        ackFilter === 'unacked' ||
        ackFilter === 'not_acknowledged'
      ) {
        normalized.acknowledged = false;
      } else if (ackFilter !== 'both' && ackFilter !== 'any' && ackFilter !== 'all') {
        throw new Error(
          'ackFilter must be one of acknowledged, unacknowledged, both, any, or all. ' +
            USAGE_HINT,
        );
      }
    }

    delete normalized.ackFilter;
  }

  if (presentFlatFilterKeys.length > 0) {
    if (normalized.filters !== undefined) {
      throw new Error(
        `Conflicting params: filters is present, but flat alias${presentFlatFilterKeys.length > 1 ? 'es' : ''} ` +
          `${presentFlatFilterKeys.join(', ')} ${presentFlatFilterKeys.length > 1 ? 'are' : 'is'} also present. ` +
          `Use nested filters or the flat aliases, not both. ${USAGE_HINT}`,
      );
    }

    normalized.filters = {};
    for (const key of presentFlatFilterKeys) {
      normalized.filters[key] = normalized[key];
      delete normalized[key];
    }
  }

  if (normalized.page_size !== undefined || typeof normalized.page === 'number') {
    if (isRecord(normalized.page) && normalized.page_size !== undefined) {
      throw new Error(
        'Conflicting params: page_size cannot be combined with nested page. Use page: { limit, offset } or numeric page + page_size, not both. ' +
          USAGE_HINT,
      );
    }

    if (normalized.limit !== undefined || normalized.offset !== undefined) {
      throw new Error(
        'Conflicting params: page/page_size cannot be combined with flat limit or offset aliases. ' +
          USAGE_HINT,
      );
    }

    const limit = normalized.page_size === undefined ? DEFAULT_LIMIT : normalized.page_size;
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('page_size must be a positive integer when provided. ' + USAGE_HINT);
    }

    if (limit > MAX_LIMIT) {
      throw new Error(`page_size max is ${MAX_LIMIT}. ` + USAGE_HINT);
    }

    if (normalized.page === undefined) {
      normalized.page = { limit, offset: 0 };
    } else {
      if (!Number.isInteger(normalized.page) || normalized.page <= 0) {
        throw new Error('page must be a positive integer when using numeric page shorthand. ' + USAGE_HINT);
      }

      normalized.page = {
        limit,
        offset: (normalized.page - 1) * limit,
      };
    }

    delete normalized.page_size;
  }

  const flatPageKeys = ['limit', 'offset'];
  const presentFlatPageKeys = flatPageKeys.filter((key) => normalized[key] !== undefined);
  if (presentFlatPageKeys.length > 0) {
    if (normalized.page !== undefined) {
      throw new Error(
        `Conflicting params: page is present, but flat alias${presentFlatPageKeys.length > 1 ? 'es' : ''} ` +
          `${presentFlatPageKeys.join(', ')} ${presentFlatPageKeys.length > 1 ? 'are' : 'is'} also present. ` +
          `Use nested page or the flat aliases, not both. ${USAGE_HINT}`,
      );
    }

    normalized.page = {};
    for (const key of presentFlatPageKeys) {
      normalized.page[key] = normalized[key];
      delete normalized[key];
    }
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

  const unknownScopeKeys = Object.keys(scope).filter((k) => k !== 'folders');
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

function normalizeFilters(filters) {
  if (filters === undefined) {
    return {};
  }

  if (!isRecord(filters)) {
    throw new Error('filters must be an object when provided. ' + USAGE_HINT);
  }

  const knownFilterKeys = new Set(['active', 'acknowledged', 'fields', 'search']);
  const unknownFilterKeys = Object.keys(filters).filter((k) => !knownFilterKeys.has(k));
  if (unknownFilterKeys.length > 0) {
    throw new Error(`Unexpected keys inside filters: ${unknownFilterKeys.join(', ')}. filters supports { active, acknowledged, fields, search }. ${USAGE_HINT}`);
  }

  const normalized = {};

  if (filters.active !== undefined) {
    if (filters.active === null) {
      // Treat null like an omitted optional filter from model retries.
    } else if (typeof filters.active !== 'boolean') {
      throw new Error('filters.active must be boolean when provided. ' + USAGE_HINT);
    } else {
      normalized.active = filters.active;
    }
  }

  if (filters.acknowledged !== undefined) {
    if (filters.acknowledged === null) {
      // Treat null like an omitted optional filter from model retries.
    } else if (typeof filters.acknowledged !== 'boolean') {
      throw new Error('filters.acknowledged must be boolean when provided. ' + USAGE_HINT);
    } else {
      normalized.acknowledged = filters.acknowledged;
    }
  }

  if (filters.fields !== undefined) {
    if (!isRecord(filters.fields)) {
      throw new Error('filters.fields must be an object when provided. ' + USAGE_HINT);
    }
    normalized.fields = filters.fields;
  }

  if (filters.search !== undefined) {
    if (filters.search === null) {
      // Treat null like an omitted optional filter from model retries.
    } else if (typeof filters.search === 'string') {
      const text = filters.search.trim();
      if (text.length === 0) {
        throw new Error('filters.search must be a non-empty string when provided as text. ' + USAGE_HINT);
      }
      normalized.search = {
        text,
        in: ['text', 'point'],
      };
    } else if (!isRecord(filters.search)) {
      throw new Error('filters.search must be an object when provided. ' + USAGE_HINT);
    } else {
      normalized.search = filters.search;
    }
  }

  return normalized;
}

function validateParams(params, extractTimeRange) {
  if (!isRecord(params)) {
    throw new Error('params must be an object. ' + USAGE_HINT);
  }

  return {
    time: extractTimeRange(params, USAGE_HINT),
    folders: normalizeFolders(params.scope),
    filters: normalizeFilters(params.filters),
    select: normalizeSelect(params.select),
    page: normalizePage(params.page),
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

function dedupeAlarmEntries(entries) {
  const seen = new Set();
  const deduped = [];

  for (const entry of entries) {
    const key = [
      entry.timestamp,
      entry.path,
      entry.message ?? '',
      entry.source ?? '',
      entry.extra?.relevant ?? '',
    ].join('|');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

function buildState(row) {
  const active = row.active === true;
  const acknowledged = row.acknowledged === true;

  if (active && acknowledged) {
    return 'active, acknowledged';
  }

  if (active) {
    return 'active, unacknowledged';
  }

  if (acknowledged) {
    return 'cleared, acknowledged';
  }

  return 'cleared, unacknowledged';
}

function toAlarmEntry(row, callerSelectSet) {
  const path = typeof row.point === 'string' ? row.point : '';
  const timestamp =
    typeof row.dt_on === 'number'
      ? row.dt_on
      : Number.isFinite(Number(row.dt_on))
        ? Number(row.dt_on)
        : 0;
  const message = typeof row.text === 'string' ? row.text : undefined;
  const source =
    typeof row.fact === 'string' || typeof row.fact === 'number' ? row.fact : undefined;

  const extra = {};
  for (const fieldName of callerSelectSet) {
    if (
      fieldName === 'dt_on' ||
      fieldName === 'point' ||
      fieldName === 'text' ||
      fieldName === 'fact' ||
      fieldName === 'active' ||
      fieldName === 'acknowledged'
    ) {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(row, fieldName)) {
      extra[fieldName] = row[fieldName];
    }
  }

  if (Object.prototype.hasOwnProperty.call(row, 'relevant')) {
    extra.relevant = row.relevant;
  }

  return {
    path,
    timestamp,
    message,
    source,
    state: buildState(row),
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

function buildScope(folders) {
  if (!folders || folders.length === 0) {
    return 'all alarms';
  }

  if (folders.length <= 3) {
    return folders.join(', ');
  }

  return `${folders.slice(0, 3).join(', ')} +${folders.length - 3} more`;
}

module.exports = async function runScadaAlarmList({ client, params }) {
  const [{ queryAlarms }, { resolveTimeRange, extractTimeRange, rejectUnexpectedKeys, TIME_RANGE_KEYS }] = await Promise.all([
    import('../../libs/ecomet-core/dist/index.js'),
    import('../../libs/skills-core/dist/index.js'),
  ]);

  if (!isRecord(params)) {
    throw new Error('params must be an object. ' + USAGE_HINT);
  }

  const normalizedParams = normalizeTopLevelAliases(params);

  rejectUnexpectedKeys(
    normalizedParams,
    [...TIME_RANGE_KEYS, 'scope', 'filters', 'select', 'page'],
    USAGE_HINT,
  );

  const validated = validateParams(normalizedParams, extractTimeRange);
  const resolvedTime = resolveTimeRange(validated.time);
  const windows = splitRange(resolvedTime.from, resolvedTime.to);

  if (windows.length > 1 && validated.page.offset > 0) {
    throw new Error(
      'scada-alarm-list does not support page.offset > 0 when the resolved range must be split into multiple windows',
    );
  }

  const warnings = [];
  if (windows.length > 1) {
    warnings.push(
      createWarning(
        `The requested alarm window was split into ${windows.length} contiguous queries because raw alarm reads support up to 30 days per request.`,
        'window_split',
        'info',
        { window_count: windows.length },
      ),
    );
  }

  const callerSelectSet = new Set(
    Array.isArray(validated.select)
      ? validated.select
          .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
          .filter((entry) => entry.length > 0)
      : DEFAULT_SELECT,
  );

  const perWindowResults = [];
  for (const window of windows) {
    const result = await queryAlarms(client, {
      time_from: window.from,
      time_to: window.to,
      active: validated.filters.active,
      acknowledged: validated.filters.acknowledged,
      folders: validated.folders,
      fields: validated.filters.fields,
      search: validated.filters.search,
      select: validated.select,
      limit: validated.page.limit,
      offset: windows.length === 1 ? validated.page.offset : 0,
    });

    perWindowResults.push(result);
    warnings.push(
      ...result.warnings.map((message) =>
        createWarning(message, 'alarm_query_warning', 'warning', window),
      ),
    );
  }

  const mergedRows = [];
  let totalAvailable = 0;

  for (const result of perWindowResults) {
    totalAvailable += result.total;
    for (const row of result.alarms) {
      if (!isRecord(row)) {
        continue;
      }
      mergedRows.push(toAlarmEntry(row, callerSelectSet));
    }
  }

  mergedRows.sort((left, right) => left.timestamp - right.timestamp);
  const dedupedRows = dedupeAlarmEntries(mergedRows);
  const returnedRows =
    windows.length === 1 && validated.page.offset > 0
      ? dedupedRows
      : dedupedRows.slice(0, validated.page.limit);

  const completeness =
    totalAvailable > returnedRows.length
      ? {
          status: 'partial',
          reason: `${returnedRows.length} of ${totalAvailable} alarms are included in this response.`,
          total_available: totalAvailable,
          total_returned: returnedRows.length,
          continuation_hint:
            'Narrow the time window or scope, or increase params.page.limit up to 200 for a larger first page.',
        }
      : { status: 'complete' };

  return {
    kind: 'alarm_list',
    blocks: [
      {
        block_kind: 'alarm_list',
        alarms: returnedRows,
        total: totalAvailable,
      },
    ],
    warnings,
    provenance: {
      source_skill: 'scada-alarm-list',
      scope: buildScope(validated.folders),
      period_from: resolvedTime.from,
      period_to: resolvedTime.to,
      timezone: resolvedTime.timezone || DEFAULT_TIMEZONE,
      produced_at: Date.now(),
    },
    completeness,
    metadata: {
      requested_limit: validated.page.limit,
      requested_offset: validated.page.offset,
      time_label: resolvedTime.label,
      split_window_count: windows.length,
    },
  };
};
