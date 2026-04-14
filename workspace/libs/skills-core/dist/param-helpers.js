/**
 * Shared param extraction helpers for skills.
 *
 * The agent model often sends flat params (e.g. { object: "...", field: "..." })
 * instead of the expected nested structure (e.g. { tags: [{ object, field }] }).
 * These helpers normalize both shapes so skills don't need to duplicate the logic.
 */
function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
// ---------------------------------------------------------------------------
// Unknown-key rejection
// ---------------------------------------------------------------------------
// Keys consumed by extractTimeRange (flat shorthands)
const TIME_RANGE_KEYS = new Set([
    'time', 'timeRange', 'from', 'to', 'until', 'time_from', 'time_to', 'time_range', 'time_window', 'time_preset', 'timezone', 'preset', 'period', 'range',
]);
// Keys consumed by extractTimePoint (flat shorthands)
const TIME_POINT_KEYS = new Set([
    'time', 'at', 'timestamp', 'timestamp_text', 'timestamp_local', 'timezone', 'timestamp_timezone', 'ago', 'offset',
]);
// Keys consumed by extractTags (flat shorthand) — basic form for non-aggregate skills
const TAG_KEYS = new Set([
    'tags', 'tag', 'tag_paths', 'object', 'objects', 'field', 'label', 'unit',
]);
// Extended form for aggregate skills that also accept flat `functions`
const TAG_KEYS_WITH_FUNCTIONS = new Set([
    'tags', 'tag', 'tag_paths', 'object', 'objects', 'field', 'label', 'unit', 'functions',
]);
/**
 * Reject unexpected top-level keys after normalization.
 *
 * Each skill declares its set of allowed keys (including aliases consumed by
 * the extract* helpers). Any key not in that set triggers an error that names
 * the unknown keys and shows the valid shape.
 *
 * Usage:
 *   rejectUnexpectedKeys(params, [...TAG_KEYS, ...TIME_RANGE_KEYS, 'bucket'], usageHint);
 */
export function rejectUnexpectedKeys(params, allowedKeys, usageHint) {
    const allowed = new Set(allowedKeys);
    const unknown = [];
    for (const key of Object.keys(params)) {
        if (!allowed.has(key)) {
            unknown.push(key);
        }
    }
    if (unknown.length > 0) {
        const hint = usageHint ? ' ' + usageHint : '';
        throw new Error(`Unexpected parameter${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. ` +
            `Supported keys: ${[...allowed].join(', ')}.` +
            hint);
    }
}
export { TIME_RANGE_KEYS, TIME_POINT_KEYS, TAG_KEYS, TAG_KEYS_WITH_FUNCTIONS };
/**
 * Normalize ISO 8601 datetime strings to local datetime format.
 *
 * Only strips the `T` separator when no offset/Z is present, because
 * stripping an offset silently changes the instant:
 *   "2026-03-18T09:37:00Z" interpreted as Asia/Almaty local time is
 *   5 hours off from the intended UTC instant.
 *
 * "2026-03-18T09:37:00"       → "2026-03-18 09:37:00"  (no offset, safe)
 * "2026-03-18T09:37:00Z"      → ERROR (offset-bearing, ambiguous)
 * "2026-03-18T09:37:00+05:00" → ERROR (offset-bearing, ambiguous)
 * "2026-03-18 09:37"           → unchanged
 */
function normalizeDateTime(value) {
    if (typeof value !== 'string')
        return value;
    const trimmed = value.trim();
    // Reject offset-bearing ISO: Z or +/-HH:MM at the end
    const offsetMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)(Z|[+-]\d{2}:\d{2})$/.exec(trimmed);
    if (offsetMatch) {
        throw new Error(`Do not pass offset-bearing ISO timestamps like "${trimmed}". ` +
            'Pass local datetime strings with a separate timezone field. ' +
            'Example: { from: "2026-03-18 09:37", to: "...", timezone: "UTC" }');
    }
    // Safe: ISO without offset — just replace T with space
    const safeMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)$/.exec(trimmed);
    if (safeMatch)
        return `${safeMatch[1]} ${safeMatch[2]}`;
    return value;
}
const RELATIVE_TIME_POINT_UNITS = new Set([
    'minute',
    'minutes',
    'hour',
    'hours',
    'day',
    'days',
]);
function normalizeAgo(ago) {
    if (!isRecord(ago)) {
        throw new Error('Malformed time params: ago must be an object with { amount, unit }.');
    }
    const amount = typeof ago.amount === 'number' ? ago.amount : Number.NaN;
    const unit = ago.unit;
    if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error('Malformed time params: ago.amount must be a positive integer.');
    }
    if (typeof unit !== 'string' ||
        !RELATIVE_TIME_POINT_UNITS.has(unit)) {
        throw new Error(`Malformed time params: ago.unit must be one of ${[...RELATIVE_TIME_POINT_UNITS].join(', ')}.`);
    }
    return { amount, unit };
}
// Known keys inside a time object (union of range and point forms)
const KNOWN_TIME_INNER_KEYS = new Set([
    'from', 'to', 'timezone', 'preset', // range
    'at', 'ago', // point
]);
/**
 * Normalize datetime fields inside a time object.
 * Rejects unknown keys inside the time object.
 */
function normalizeTimeObject(time) {
    const unknownInner = Object.keys(time).filter((key) => !KNOWN_TIME_INNER_KEYS.has(key));
    if (unknownInner.length > 0) {
        throw new Error(`Unexpected key${unknownInner.length > 1 ? 's' : ''} inside time: ${unknownInner.join(', ')}. ` +
            'Known time keys: preset, from, to, timezone (range) or at, ago, timezone (point).');
    }
    const result = { ...time };
    if ('from' in result)
        result.from = normalizeDateTime(result.from);
    if ('to' in result)
        result.to = normalizeDateTime(result.to);
    if ('at' in result)
        result.at = normalizeDateTime(result.at);
    if ('ago' in result)
        result.ago = normalizeAgo(result.ago);
    return result;
}
const NOW_RANGE_PRESETS = {
    'now-15m': 'last_15_minutes',
    'now-30m': 'last_30_minutes',
    'now-1h': 'last_1_hour',
    'now-2h': 'last_2_hours',
    'now-6h': 'last_6_hours',
    'now-24h': 'last_24_hours',
    'now-7d': 'last_7_days',
};
/**
 * Extract a time-range spec from flat or nested params.
 *
 * Recognized shapes:
 *   - params.time (object)              → pass through
 *   - params.from + params.to           → { from, to, timezone? }
 *   - params.preset                     → { preset }
 *   - params.period ("1h", "24h", etc.) → { preset: mapped }
 *
 * Returns undefined when no time-related keys are present (skill applies its default).
 */
// Flat alias keys that conflict with nested `time` / `tags`
const FLAT_TIME_RANGE_ALIASES = [
    'timeRange',
    'from',
    'to',
    'until',
    'time_from',
    'time_to',
    'time_range',
    'time_window',
    'time_preset',
    'timezone',
    'preset',
    'period',
    'range',
];
const FLAT_TIME_POINT_ALIASES = ['at', 'timestamp', 'timestamp_text', 'timestamp_local', 'timezone', 'timestamp_timezone', 'ago', 'offset'];
const FLAT_TAG_ALIASES = ['tag', 'tag_paths', 'object', 'objects', 'field', 'label', 'unit', 'functions'];
function normalizeDurationPreset(amount, unit) {
    if (unit === 'minute') {
        if (amount === 15)
            return 'last_15_minutes';
        if (amount === 30)
            return 'last_30_minutes';
        if (amount === 60)
            return 'last_1_hour';
        if (amount === 120)
            return 'last_2_hours';
        if (amount === 360)
            return 'last_6_hours';
        if (amount === 1440)
            return 'last_24_hours';
        return undefined;
    }
    if (unit === 'hour') {
        if (amount === 1)
            return 'last_1_hour';
        if (amount === 2)
            return 'last_2_hours';
        if (amount === 6)
            return 'last_6_hours';
        if (amount === 24)
            return 'last_24_hours';
        return undefined;
    }
    if (amount === 1) {
        return 'last_24_hours';
    }
    if (amount === 7) {
        return 'last_7_days';
    }
    return undefined;
}
function normalizeRangeAlias(value, contextLabel) {
    if (typeof value !== 'string') {
        return undefined;
    }
    let normalized = value
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    if (normalized.endsWith('_to_now')) {
        normalized = normalized.slice(0, -'_to_now'.length);
    }
    if (normalized.endsWith('_ending_now')) {
        normalized = normalized.slice(0, -'_ending_now'.length);
    }
    if (normalized === 'today' || normalized === 'yesterday') {
        return normalized;
    }
    if (normalized === 'last_hour') {
        return 'last_1_hour';
    }
    if (normalized === 'last_day') {
        return 'last_24_hours';
    }
    if (normalized === 'last_week') {
        return 'last_7_days';
    }
    const compact = normalized.replace(/_/g, '');
    const match = /^(?:last)?(\d+)(minutes?|mins?|min|m|hours?|hrs?|hr|h|days?|day|d)$/.exec(compact);
    if (!match) {
        return undefined;
    }
    const amount = Number(match[1]);
    const rawUnit = match[2];
    if (!Number.isInteger(amount) || amount <= 0) {
        return undefined;
    }
    let unit;
    if (rawUnit === 'm' ||
        rawUnit === 'min' ||
        rawUnit === 'mins' ||
        rawUnit === 'minute' ||
        rawUnit === 'minutes') {
        unit = 'minute';
    }
    else if (rawUnit === 'h' ||
        rawUnit === 'hr' ||
        rawUnit === 'hrs' ||
        rawUnit === 'hour' ||
        rawUnit === 'hours') {
        unit = 'hour';
    }
    else {
        unit = 'day';
    }
    const preset = normalizeDurationPreset(amount, unit);
    if (preset) {
        return preset;
    }
    throw new Error(`Unrecognized ${contextLabel} "${String(value)}". ` +
        'Use a supported rolling range such as last_15_minutes, last_1_hour, last_6_hours, last_24_hours, last_7_days, today, or yesterday.');
}
function rollingPresetToAgo(preset) {
    switch (preset) {
        case 'last_15_minutes':
            return { amount: 15, unit: 'minute' };
        case 'last_30_minutes':
            return { amount: 30, unit: 'minute' };
        case 'last_1_hour':
            return { amount: 1, unit: 'hour' };
        case 'last_2_hours':
            return { amount: 2, unit: 'hour' };
        case 'last_6_hours':
            return { amount: 6, unit: 'hour' };
        case 'last_24_hours':
            return { amount: 1, unit: 'day' };
        case 'last_7_days':
            return { amount: 7, unit: 'day' };
        default:
            return undefined;
    }
}
function parseRelativeTimePointString(value) {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return undefined;
    }
    const compact = trimmed.toLowerCase().replace(/[\s_]+/g, '');
    const directMatch = /^(?:now)?-(\d+)(minutes?|mins?|min|m|hours?|hrs?|hr|h|days?|day|d)$/.exec(compact) ??
        /^(\d+)(minutes?|mins?|min|m|hours?|hrs?|hr|h|days?|day|d)ago$/.exec(compact);
    if (directMatch) {
        const amount = Number(directMatch[1]);
        const rawUnit = directMatch[2];
        if (!Number.isInteger(amount) || amount <= 0) {
            return undefined;
        }
        if (rawUnit === 'm' ||
            rawUnit === 'min' ||
            rawUnit === 'mins' ||
            rawUnit === 'minute' ||
            rawUnit === 'minutes') {
            return { amount, unit: 'minute' };
        }
        if (rawUnit === 'h' ||
            rawUnit === 'hr' ||
            rawUnit === 'hrs' ||
            rawUnit === 'hour' ||
            rawUnit === 'hours') {
            return { amount, unit: 'hour' };
        }
        return { amount, unit: 'day' };
    }
    const preset = normalizeRangeAlias(trimmed, 'time point');
    return preset ? rollingPresetToAgo(preset) : undefined;
}
function toTimePointFromString(value) {
    const ago = parseRelativeTimePointString(value);
    if (ago) {
        return { ago };
    }
    return { at: normalizeDateTime(value) };
}
function normalizeNestedTimeRangeObject(time) {
    if (time.kind !== undefined || time.unit !== undefined || time.value !== undefined || time.amount !== undefined || time.count !== undefined) {
        const conflicts = ['from', 'to', 'preset', 'range', 'period'].filter((key) => time[key] !== undefined);
        if (conflicts.length > 0) {
            throw new Error(`Conflicting nested time params: structured rolling windows cannot be combined with ${conflicts.join(', ')}.`);
        }
        const preset = normalizeStructuredPeriod(time);
        const normalized = { preset };
        if (typeof time.timezone === 'string') {
            normalized.timezone = time.timezone;
        }
        return normalized;
    }
    const knownTimeRangeKeys = new Set(['from', 'to', 'timezone', 'preset', 'range', 'period']);
    const unknownInner = Object.keys(time).filter((key) => !knownTimeRangeKeys.has(key));
    if (unknownInner.length > 0) {
        throw new Error(`Unexpected key${unknownInner.length > 1 ? 's' : ''} inside time: ${unknownInner.join(', ')}. ` +
            'Known time keys for ranges: preset, range, from, to, timezone.');
    }
    if (time.range !== undefined) {
        const conflictingKeys = ['from', 'to', 'preset', 'period'].filter((key) => time[key] !== undefined);
        if (conflictingKeys.length > 0) {
            throw new Error(`Conflicting nested time params: range cannot be combined with ${conflictingKeys.join(', ')}.`);
        }
        const preset = normalizeRangeAlias(time.range, 'time.range');
        if (!preset) {
            throw new Error('Malformed time params: time.range must be a supported rolling range string.');
        }
        const normalized = { preset };
        if (typeof time.timezone === 'string') {
            normalized.timezone = time.timezone;
        }
        return normalized;
    }
    if (time.period !== undefined) {
        const conflictingKeys = ['from', 'to', 'preset'].filter((key) => time[key] !== undefined);
        if (conflictingKeys.length > 0) {
            throw new Error(`Conflicting nested time params: period cannot be combined with ${conflictingKeys.join(', ')}.`);
        }
        let preset;
        if (typeof time.period === 'string') {
            preset = normalizeRangeAlias(time.period, 'time.period') ?? undefined;
            if (!preset) {
                throw new Error('Malformed time params: time.period must be a supported rolling range string.');
            }
        }
        else if (isRecord(time.period)) {
            preset = normalizeStructuredPeriod(time.period);
        }
        else {
            throw new Error('Malformed time params: time.period must be a string like "24h" or a structured { kind: "last", value/amount, unit } object.');
        }
        const normalized = { preset };
        if (typeof time.timezone === 'string') {
            normalized.timezone = time.timezone;
        }
        return normalized;
    }
    const normalized = normalizeTimeObject(time);
    if (typeof normalized.preset === 'string') {
        normalized.preset = normalizeRangeAlias(normalized.preset, 'time.preset') ?? normalized.preset;
    }
    return normalized;
}
function normalizeStructuredPeriod(period) {
    if (!isRecord(period)) {
        return undefined;
    }
    const kind = typeof period.kind === 'string' ? period.kind.trim().toLowerCase() : '';
    const unit = typeof period.unit === 'string' ? period.unit.trim().toLowerCase() : '';
    const value = typeof period.value === 'number'
        ? period.value
        : typeof period.amount === 'number'
            ? period.amount
            : typeof period.count === 'number'
                ? period.count
                : Number.NaN;
    if (kind !== 'last') {
        throw new Error(`Unrecognized period kind "${String(period.kind)}". Structured period only supports { kind: "last", value/amount, unit }.`);
    }
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error('Structured period requires a positive integer value.');
    }
    let normalizedUnit;
    if (unit === 'minute' || unit === 'minutes' || unit === 'min' || unit === 'mins' || unit === 'm') {
        normalizedUnit = 'minute';
    }
    else if (unit === 'hour' || unit === 'hours' || unit === 'hr' || unit === 'hrs' || unit === 'h') {
        normalizedUnit = 'hour';
    }
    else if (unit === 'day' || unit === 'days' || unit === 'd') {
        normalizedUnit = 'day';
    }
    else {
        throw new Error(`Unrecognized structured period unit "${String(period.unit)}".`);
    }
    const preset = normalizeDurationPreset(value, normalizedUnit);
    if (preset) {
        return preset;
    }
    throw new Error(`Unsupported structured period { kind: "last", value: ${value}, unit: "${String(period.unit)}" }. ` +
        'Use a supported rolling range such as 15 minutes, 1 hour, 6 hours, 24 hours, or 7 days.');
}
function normalizeRelativeNowToken(value) {
    if (typeof value !== 'string') {
        return undefined;
    }
    return value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
}
function extractRelativeNowPreset(from, to, timezone) {
    const fromToken = normalizeRelativeNowToken(from);
    const toToken = normalizeRelativeNowToken(to);
    if (!fromToken && !toToken) {
        return undefined;
    }
    if (typeof from === 'number' || typeof to === 'number') {
        throw new Error('Do not pre-compute epoch timestamps. Pass rolling ranges as time: { preset: "last_24_hours" } or local datetime strings with timezone.');
    }
    if (toToken !== 'now') {
        return undefined;
    }
    const preset = NOW_RANGE_PRESETS[fromToken ?? ''];
    if (!preset) {
        return undefined;
    }
    const time = { preset };
    if (typeof timezone === 'string') {
        time.timezone = timezone;
    }
    return time;
}
function extractStructuredTimeRangeAlias(value) {
    if (!isRecord(value)) {
        return undefined;
    }
    if (typeof value.kind === 'string' &&
        value.kind.trim().toLowerCase() === 'last') {
        return { preset: normalizeStructuredPeriod(value) };
    }
    const nestedRange = isRecord(value.range) ? value.range : value;
    const kind = typeof nestedRange.kind === 'string'
        ? nestedRange.kind.trim().toLowerCase()
        : '';
    if (kind === 'relative') {
        const fromToken = typeof nestedRange.from === 'string'
            ? normalizeRelativeNowToken(nestedRange.from)
            : undefined;
        const toToken = normalizeRelativeNowToken(nestedRange.to);
        if (fromToken && toToken === 'now') {
            const normalizedFromToken = fromToken.startsWith('-')
                ? `now${fromToken}`
                : fromToken;
            const preset = NOW_RANGE_PRESETS[normalizedFromToken];
            if (preset) {
                return { preset };
            }
        }
        const rawUnit = typeof nestedRange.unit === 'string'
            ? nestedRange.unit.trim().toLowerCase()
            : '';
        const fromOffset = typeof nestedRange.from === 'number' ? nestedRange.from : Number.NaN;
        const toOffset = typeof nestedRange.to === 'number' ? nestedRange.to : Number.NaN;
        if (Number.isInteger(fromOffset) &&
            Number.isInteger(toOffset) &&
            fromOffset < toOffset &&
            toOffset === 0) {
            const amount = toOffset - fromOffset;
            let unit;
            if (rawUnit === 'm' ||
                rawUnit === 'min' ||
                rawUnit === 'mins' ||
                rawUnit === 'minute' ||
                rawUnit === 'minutes') {
                unit = 'minute';
            }
            else if (rawUnit === 'h' ||
                rawUnit === 'hr' ||
                rawUnit === 'hrs' ||
                rawUnit === 'hour' ||
                rawUnit === 'hours') {
                unit = 'hour';
            }
            else if (rawUnit === 'd' ||
                rawUnit === 'day' ||
                rawUnit === 'days') {
                unit = 'day';
            }
            else {
                return undefined;
            }
            const preset = normalizeDurationPreset(amount, unit);
            return preset ? { preset } : undefined;
        }
    }
    if (kind !== 'relative') {
        return undefined;
    }
    if (!isRecord(nestedRange.from)) {
        return undefined;
    }
    const to = nestedRange.to === 'now' ||
        (isRecord(nestedRange.to) &&
            typeof nestedRange.to.kind === 'string' &&
            nestedRange.to.kind.trim().toLowerCase() === 'now')
        ? 'now'
        : null;
    if (to !== 'now') {
        return undefined;
    }
    const rawUnit = typeof nestedRange.from.unit === 'string'
        ? nestedRange.from.unit.trim().toLowerCase()
        : '';
    const amount = typeof nestedRange.from.value === 'number'
        ? nestedRange.from.value
        : Number.NaN;
    if (!Number.isInteger(amount) || amount <= 0) {
        return undefined;
    }
    let unit;
    if (rawUnit === 'm' ||
        rawUnit === 'min' ||
        rawUnit === 'mins' ||
        rawUnit === 'minute' ||
        rawUnit === 'minutes') {
        unit = 'minute';
    }
    else if (rawUnit === 'h' ||
        rawUnit === 'hr' ||
        rawUnit === 'hrs' ||
        rawUnit === 'hour' ||
        rawUnit === 'hours') {
        unit = 'hour';
    }
    else if (rawUnit === 'd' || rawUnit === 'day' || rawUnit === 'days') {
        unit = 'day';
    }
    else {
        return undefined;
    }
    const preset = normalizeDurationPreset(amount, unit);
    return preset ? { preset } : undefined;
}
function rejectConflictingAliases(params, nestedKey, flatAliases, usageHint) {
    const conflicts = flatAliases.filter((key) => params[key] !== undefined);
    if (conflicts.length > 0) {
        const hint = usageHint ? ' ' + usageHint : '';
        throw new Error(`Conflicting params: "${nestedKey}" is present, but flat alias${conflicts.length > 1 ? 'es' : ''} ` +
            `${conflicts.join(', ')} ${conflicts.length > 1 ? 'are' : 'is'} also present. ` +
            `Use either the nested form or the flat form, not both.` +
            hint);
    }
}
export function extractTimeRange(params, usageHint) {
    if (isRecord(params.time)) {
        rejectConflictingAliases(params, 'time', FLAT_TIME_RANGE_ALIASES, usageHint);
        return normalizeNestedTimeRangeObject(params.time);
    }
    if (typeof params.time === 'string') {
        const preset = normalizeRangeAlias(params.time, 'time');
        if (preset) {
            const time = { preset };
            if (typeof params.timezone === 'string')
                time.timezone = params.timezone;
            return time;
        }
    }
    if (typeof params.timeRange === 'string') {
        const preset = normalizeRangeAlias(params.timeRange, 'timeRange');
        if (preset) {
            const time = { preset };
            if (typeof params.timezone === 'string')
                time.timezone = params.timezone;
            return time;
        }
    }
    if (isRecord(params.timeRange)) {
        const structured = extractStructuredTimeRangeAlias(params.timeRange);
        if (structured) {
            if (typeof params.timezone === 'string')
                structured.timezone = params.timezone;
            return structured;
        }
    }
    if (isRecord(params.time_range)) {
        const structured = extractStructuredTimeRangeAlias(params.time_range);
        if (structured) {
            if (typeof params.timezone === 'string')
                structured.timezone = params.timezone;
            return structured;
        }
    }
    if (typeof params.range === 'string') {
        const preset = normalizeRangeAlias(params.range, 'range');
        if (preset) {
            const time = { preset };
            if (typeof params.timezone === 'string')
                time.timezone = params.timezone;
            return time;
        }
    }
    for (const [key, label] of [
        ['time_range', 'time_range'],
        ['time_window', 'time_window'],
        ['time_preset', 'time_preset'],
    ]) {
        if (typeof params[key] === 'string') {
            const preset = normalizeRangeAlias(params[key], label);
            if (preset) {
                const time = { preset };
                if (typeof params.timezone === 'string')
                    time.timezone = params.timezone;
                return time;
            }
        }
    }
    const from = params.from ?? params.time_from;
    const to = params.to ?? params.time_to ?? params.until;
    if (from !== undefined && to !== undefined) {
        const rollingRange = extractRelativeNowPreset(from, to, params.timezone);
        if (rollingRange) {
            return rollingRange;
        }
        if (typeof from === 'number' || typeof to === 'number') {
            const hint = usageHint ? ' ' + usageHint : '';
            throw new Error('Do not pre-compute epoch timestamps. Pass rolling ranges as time: { preset: "last_24_hours" } or local datetime strings with timezone.' +
                hint);
        }
        const time = {
            from: normalizeDateTime(from),
            to: normalizeDateTime(to),
        };
        if (typeof params.timezone === 'string')
            time.timezone = params.timezone;
        return time;
    }
    if (typeof params.preset === 'string') {
        return { preset: normalizeRangeAlias(params.preset, 'preset') ?? params.preset };
    }
    if (typeof params.period === 'string') {
        const preset = normalizeRangeAlias(params.period, 'period');
        if (preset) {
            return { preset };
        }
        const hint = usageHint ? ' ' + usageHint : '';
        throw new Error(`Unrecognized period "${params.period}". ` +
            'Use time: { preset: "last_1_hour" } or time: { from: "YYYY-MM-DD HH:MM", to: "...", timezone: "..." }.' +
            hint);
    }
    if (isRecord(params.period)) {
        return { preset: normalizeStructuredPeriod(params.period) };
    }
    // Fail closed: if any time-related key was present but no valid shape matched, reject
    const strayTimeKeys = ['time', 'timeRange', 'from', 'to', 'until', 'time_from', 'time_to', 'time_range', 'time_window', 'time_preset', 'timezone', 'preset', 'period', 'range'].filter((key) => params[key] !== undefined);
    if (strayTimeKeys.length > 0) {
        const hint = usageHint ? ' ' + usageHint : '';
        throw new Error(`Malformed time params: ${strayTimeKeys.join(', ')} present but no valid time shape matched. ` +
            'Valid shapes: time: { preset: "last_1_hour" } | time: { from: "...", to: "...", timezone: "..." } | ' +
            'flat: preset/range/time: "last_24_hours" | flat: from + to + timezone | flat: time_from + time_to | flat: period: "24h".' +
            hint);
    }
    return undefined;
}
// ---------------------------------------------------------------------------
// Time extraction (point-based skills: snapshot)
// ---------------------------------------------------------------------------
/**
 * Extract a time-point spec from flat or nested params.
 *
 * Recognized shapes:
 *   - params.time (object)                      → pass through
 *   - params.at / params.timestamp (string)     → { at, timezone? }
 *   - params.at / params.timestamp (number)     → error (reject epoch)
 *   - params.ago (object)                       → { ago, timezone? }
 *
 * Returns undefined when no time-related keys are present.
 */
export function extractTimePoint(params, usageHint) {
    if (isRecord(params.time)) {
        rejectConflictingAliases(params, 'time', FLAT_TIME_POINT_ALIASES, usageHint);
        const normalized = normalizeTimeObject(params.time);
        if (normalized.from !== undefined || normalized.to !== undefined) {
            const hint = usageHint ? ' ' + usageHint : '';
            throw new Error('Exact time point skills do not accept time ranges. Pass time: { at: "YYYY-MM-DD HH:MM", timezone: "..." } or time: { ago: { amount: 1, unit: "hour" } }.' +
                hint);
        }
        if (normalized.preset !== undefined) {
            const preset = normalizeRangeAlias(normalized.preset, 'time.preset') ?? normalized.preset;
            if (preset === 'today' || preset === 'yesterday') {
                const hint = usageHint ? ' ' + usageHint : '';
                throw new Error(`Exact time point skills do not accept calendar presets like "${String(normalized.preset)}". ` +
                    'Use an exact local datetime or a relative ago offset instead.' +
                    hint);
            }
            const ago = rollingPresetToAgo(preset);
            if (!ago) {
                const hint = usageHint ? ' ' + usageHint : '';
                throw new Error(`Unrecognized time point preset "${String(normalized.preset)}". ` +
                    'Use time: { at: "YYYY-MM-DD HH:MM", timezone: "..." } or time: { ago: { amount: 1, unit: "hour" } }.' +
                    hint);
            }
            const time = { ago };
            if (typeof normalized.timezone === 'string')
                time.timezone = normalized.timezone;
            return time;
        }
        return normalized;
    }
    if (typeof params.time === 'string') {
        const conflictingKeys = ['at', 'timestamp', 'timestamp_text', 'timestamp_local', 'ago', 'offset'].filter((key) => params[key] !== undefined);
        if (conflictingKeys.length > 0) {
            const hint = usageHint ? ' ' + usageHint : '';
            throw new Error(`Conflicting params: "time" is present, but flat alias${conflictingKeys.length > 1 ? 'es' : ''} ` +
                `${conflictingKeys.join(', ')} ${conflictingKeys.length > 1 ? 'are' : 'is'} also present. ` +
                'Use either the string time shorthand or the flat form, not both.' +
                hint);
        }
        const point = toTimePointFromString(params.time);
        if (typeof params.timezone === 'string') {
            return { ...point, timezone: params.timezone };
        }
        return point;
    }
    if (typeof params.time === 'number') {
        const hint = usageHint ? ' ' + usageHint : '';
        throw new Error('Do not pre-compute epoch timestamps. Pass local datetime strings with timezone. ' +
            'Example: time: { at: "2026-03-18 06:00", timezone: "Asia/Almaty" } or ' +
            'time: { ago: { amount: 1, unit: "hour" } }.' +
            hint);
    }
    const at = params.at ?? params.timestamp ?? params.timestamp_text ?? params.timestamp_local;
    if (at !== undefined) {
        if (typeof at === 'number') {
            const hint = usageHint ? ' ' + usageHint : '';
            throw new Error('Do not pre-compute epoch timestamps. Pass local datetime strings with timezone. ' +
                'Example: time: { at: "2026-03-18 06:00", timezone: "Asia/Almaty" } or ' +
                'time: { ago: { amount: 1, unit: "hour" } }.' +
                hint);
        }
        if (typeof at !== 'string') {
            const hint = usageHint ? ' ' + usageHint : '';
            throw new Error('Malformed time params: at/timestamp aliases must be strings when provided.' +
                hint);
        }
        const time = toTimePointFromString(String(at));
        if (typeof params.timezone === 'string') {
            time.timezone = params.timezone;
        }
        else if (typeof params.timestamp_timezone === 'string') {
            time.timezone = params.timestamp_timezone;
        }
        return time;
    }
    if (params.ago !== undefined) {
        const time = {
            ago: normalizeAgo(params.ago),
        };
        if (typeof params.timezone === 'string')
            time.timezone = params.timezone;
        return time;
    }
    if (params.offset !== undefined) {
        if (typeof params.offset !== 'string') {
            const hint = usageHint ? ' ' + usageHint : '';
            throw new Error('Malformed time params: offset must be a string like "-1h" when provided.' +
                hint);
        }
        const ago = parseRelativeTimePointString(params.offset);
        if (!ago) {
            const hint = usageHint ? ' ' + usageHint : '';
            throw new Error(`Malformed time params: offset "${params.offset}" is not a supported relative time alias. ` +
                'Use values like "-1h", "now-30m", or "30m ago".' +
                hint);
        }
        const time = { ago };
        if (typeof params.timezone === 'string')
            time.timezone = params.timezone;
        return time;
    }
    // Fail closed: if any time-related key was present but no valid shape matched, reject
    const strayTimeKeys = ['time', 'at', 'timestamp', 'timestamp_text', 'timestamp_local', 'timezone', 'timestamp_timezone', 'ago', 'offset'].filter((key) => params[key] !== undefined);
    if (strayTimeKeys.length > 0) {
        const hint = usageHint ? ' ' + usageHint : '';
        throw new Error(`Malformed time params: ${strayTimeKeys.join(', ')} present but no valid time shape matched. ` +
            'Valid shapes: time: { at: "YYYY-MM-DD HH:MM", timezone: "..." } | ' +
            'time: { ago: { amount: 1, unit: "hour" } } | time: "2026-03-18 09:37" | flat: at: "...", timezone: "..." | timestamp_text/timestamp_local + timezone.' +
            hint);
    }
    return undefined;
}
function parseTagPathEntry(entry, index) {
    if (typeof entry !== 'string') {
        throw new Error(`tag_paths[${index}] must be a string in "/full/object/path:field" format.`);
    }
    const trimmed = entry.trim();
    const separatorIndex = trimmed.lastIndexOf(':');
    if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
        throw new Error(`tag_paths[${index}] must use "/full/object/path:field" format.`);
    }
    const object = trimmed.slice(0, separatorIndex).trim();
    const field = trimmed.slice(separatorIndex + 1).trim();
    if (!object.startsWith('/')) {
        throw new Error(`tag_paths[${index}] must start with a full object path beginning with /.`);
    }
    if (!field) {
        throw new Error(`tag_paths[${index}] must include a non-empty field name after ":".`);
    }
    return { object, field };
}
/**
 * Extract a tags array from flat or nested params.
 *
 * Recognized shapes:
 *   - params.tags (array)               → pass through
 *   - params.object + params.field      → wrap into single-element array
 *
 * Returns undefined when neither shape is present.
 */
export function extractTags(params, options = {}) {
    if (Array.isArray(params.tags) && params.tags.length > 0) {
        rejectConflictingAliases(params, 'tags', FLAT_TAG_ALIASES);
        return params.tags.map((entry, index) => {
            if (typeof entry === 'string') {
                return parseTagPathEntry(entry, index);
            }
            if (!isRecord(entry)) {
                throw new Error(`tags[${index}] must be an object or a "/full/object/path:field" string.`);
            }
            return entry;
        });
    }
    if (params.tag !== undefined) {
        const conflictingKeys = ['object', 'objects', 'field', 'label', 'unit', 'functions', 'tag_paths'].filter((key) => params[key] !== undefined);
        if (conflictingKeys.length > 0) {
            throw new Error(`Conflicting params: tag is present, but flat alias${conflictingKeys.length > 1 ? 'es' : ''} ` +
                `${conflictingKeys.join(', ')} ${conflictingKeys.length > 1 ? 'are' : 'is'} also present. ` +
                'Use either tag or the flat object/field shorthand, not both.');
        }
        if (typeof params.tag === 'string') {
            return [parseTagPathEntry(params.tag, 0)];
        }
        if (!isRecord(params.tag)) {
            throw new Error('tag must be either a "/full/object/path:field" string or an object entry when provided.');
        }
        return [params.tag];
    }
    if (params.tag_paths !== undefined) {
        const conflictingKeys = ['object', 'objects', 'field', 'label', 'unit', 'functions'].filter((key) => params[key] !== undefined);
        if (conflictingKeys.length > 0) {
            throw new Error(`Conflicting params: tag_paths is present, but flat alias${conflictingKeys.length > 1 ? 'es' : ''} ` +
                `${conflictingKeys.join(', ')} ${conflictingKeys.length > 1 ? 'are' : 'is'} also present. ` +
                'Use either tag_paths or flat object/field shorthand, not both.');
        }
        if (!Array.isArray(params.tag_paths) || params.tag_paths.length === 0) {
            throw new Error('tag_paths must be a non-empty array of "/full/object/path:field" strings when provided.');
        }
        return params.tag_paths.map((entry, index) => parseTagPathEntry(entry, index));
    }
    if (params.objects !== undefined) {
        if (!Array.isArray(params.objects) || params.objects.length === 0) {
            throw new Error('objects must be a non-empty array of full object paths when provided.');
        }
        if (params.object !== undefined) {
            throw new Error('Conflicting params: object and objects are both present. Use either a single object or an objects array, not both.');
        }
        if (typeof params.field !== 'string') {
            throw new Error('objects shorthand requires a shared field string (for example { objects: ["/root/..."], field: "out_value" }).');
        }
        return params.objects
            .map((entry) => {
            if (typeof entry !== 'string') {
                throw new Error('objects must contain only string object paths.');
            }
            const tag = {
                object: entry,
                field: params.field,
            };
            if (typeof params.label === 'string')
                tag.label = params.label;
            if (typeof params.unit === 'string')
                tag.unit = params.unit;
            if (options.includeFunctions && Array.isArray(params.functions)) {
                tag.functions = params.functions;
            }
            return tag;
        });
    }
    if (typeof params.object === 'string' && typeof params.field === 'string') {
        const tag = {
            object: params.object,
            field: params.field,
        };
        if (typeof params.label === 'string')
            tag.label = params.label;
        if (typeof params.unit === 'string')
            tag.unit = params.unit;
        if (options.includeFunctions && Array.isArray(params.functions)) {
            tag.functions = params.functions;
        }
        return [tag];
    }
    return undefined;
}
//# sourceMappingURL=param-helpers.js.map