const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_TIMEZONE =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const DATE_TIME_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const OFFSET_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

export type RollingRangePreset =
  | 'last_15_minutes'
  | 'last_30_minutes'
  | 'last_1_hour'
  | 'last_2_hours'
  | 'last_6_hours'
  | 'last_24_hours'
  | 'last_7_days';

export type CalendarRangePreset = 'today' | 'yesterday';

export type RelativeTimePointUnit =
  | 'minute'
  | 'minutes'
  | 'hour'
  | 'hours'
  | 'day'
  | 'days';

export type LocalDateTimeString =
  | `${number}-${number}-${number} ${number}:${number}`
  | `${number}-${number}-${number} ${number}:${number}:${number}`;

export type TimeRangeSpec =
  | { preset: RollingRangePreset; timezone?: string }
  | { preset: CalendarRangePreset; timezone: string }
  | { from: LocalDateTimeString; to: LocalDateTimeString; timezone: string };

export type TimePointSpec =
  | { at: LocalDateTimeString; timezone: string }
  | {
      ago: {
        amount: number;
        unit: RelativeTimePointUnit;
      };
      timezone?: string;
    };

export interface ResolvedTimeRange {
  from: number;
  to: number;
  timezone: string;
  label: string;
}

export interface ResolvedTimePoint {
  timestamp: number;
  timezone: string;
  label: string;
}

export interface ResolveTimeOptions {
  nowMs?: number;
}

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const ROLLING_PRESETS: Record<
  RollingRangePreset,
  { durationMs: number; label: string }
> = {
  last_15_minutes: { durationMs: 15 * MINUTE_MS, label: 'Last 15 minutes' },
  last_30_minutes: { durationMs: 30 * MINUTE_MS, label: 'Last 30 minutes' },
  last_1_hour: { durationMs: HOUR_MS, label: 'Last 1 hour' },
  last_2_hours: { durationMs: 2 * HOUR_MS, label: 'Last 2 hours' },
  last_6_hours: { durationMs: 6 * HOUR_MS, label: 'Last 6 hours' },
  last_24_hours: { durationMs: DAY_MS, label: 'Last 24 hours' },
  last_7_days: { durationMs: 7 * DAY_MS, label: 'Last 7 days' },
};

const RELATIVE_TIME_POINT_UNITS: Record<
  RelativeTimePointUnit,
  { durationMs: number; singular: string; plural: string }
> = {
  minute: { durationMs: MINUTE_MS, singular: 'minute', plural: 'minutes' },
  minutes: { durationMs: MINUTE_MS, singular: 'minute', plural: 'minutes' },
  hour: { durationMs: HOUR_MS, singular: 'hour', plural: 'hours' },
  hours: { durationMs: HOUR_MS, singular: 'hour', plural: 'hours' },
  day: { durationMs: DAY_MS, singular: 'day', plural: 'days' },
  days: { durationMs: DAY_MS, singular: 'day', plural: 'days' },
};

const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getDateTimeFormatter(timezone: string): Intl.DateTimeFormat {
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

function getOffsetFormatter(timezone: string): Intl.DateTimeFormat {
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

function validateTimezone(timezone?: string): string {
  const resolved = timezone ?? DEFAULT_TIMEZONE;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: resolved });
  } catch {
    throw new Error(`Invalid timezone: ${String(resolved)}`);
  }

  return resolved;
}

function validateRequiredTimezone(timezone: unknown, context: string): string {
  if (typeof timezone !== 'string' || timezone.trim().length === 0) {
    throw new Error(`${context} requires an explicit timezone`);
  }

  return validateTimezone(timezone);
}

function resolveNowMs(nowMs?: number): number {
  const resolved = nowMs ?? Date.now();
  if (!Number.isFinite(resolved)) {
    throw new Error(`Invalid nowMs: ${String(nowMs)}`);
  }
  return resolved;
}

function parseLocalDateTime(input: string): LocalDateTimeParts {
  const match = LOCAL_DATE_TIME_PATTERN.exec(input);

  if (!match) {
    throw new Error(
      `Invalid local datetime string: ${input}. Expected YYYY-MM-DD HH:mm or YYYY-MM-DD HH:mm:ss.`,
    );
  }

  const parts: LocalDateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] === undefined ? 0 : Number(match[6]),
  };

  if (
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > 31 ||
    parts.hour < 0 ||
    parts.hour > 23 ||
    parts.minute < 0 ||
    parts.minute > 59 ||
    parts.second < 0 ||
    parts.second > 59
  ) {
    throw new Error(`Invalid local datetime value: ${input}`);
  }

  const validationDate = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ),
  );

  if (
    validationDate.getUTCFullYear() !== parts.year ||
    validationDate.getUTCMonth() + 1 !== parts.month ||
    validationDate.getUTCDate() !== parts.day ||
    validationDate.getUTCHours() !== parts.hour ||
    validationDate.getUTCMinutes() !== parts.minute ||
    validationDate.getUTCSeconds() !== parts.second
  ) {
    throw new Error(`Invalid calendar datetime: ${input}`);
  }

  return parts;
}

function getLocalDateTimeParts(timestamp: number, timezone: string): LocalDateTimeParts {
  const values: Partial<Record<keyof LocalDateTimeParts, number>> = {};

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

function compareLocalDateTimeParts(
  left: LocalDateTimeParts,
  right: LocalDateTimeParts,
): number {
  const leftTuple = [
    left.year,
    left.month,
    left.day,
    left.hour,
    left.minute,
    left.second,
  ];
  const rightTuple = [
    right.year,
    right.month,
    right.day,
    right.hour,
    right.minute,
    right.second,
  ];

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

function getOffsetMs(timezone: string, timestamp: number): number {
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

function resolveLocalDateTimeEpoch(parts: LocalDateTimeParts, timezone: string): number {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const candidateOffsets = new Set<number>();

  for (let hours = -36; hours <= 36; hours += 6) {
    candidateOffsets.add(getOffsetMs(timezone, utcGuess + hours * HOUR_MS));
  }

  const matches: number[] = [];
  for (const offset of candidateOffsets) {
    const candidate = utcGuess - offset;
    if (compareLocalDateTimeParts(getLocalDateTimeParts(candidate, timezone), parts) === 0) {
      matches.push(candidate);
    }
  }

  if (matches.length === 0) {
    throw new Error(
      `Local datetime ${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')} does not exist in timezone ${timezone}.`,
    );
  }

  return Math.min(...matches);
}

function startOfLocalDay(timestamp: number, timezone: string): number {
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

function labelFromRange(input: string, timezone: string): string {
  return `${input} (${timezone})`;
}

function validateRelativeTimePointAgo(ago: unknown): {
  amount: number;
  durationMs: number;
  label: string;
} {
  if (!isRecord(ago)) {
    throw new Error(
      'Relative time point requires ago.amount and ago.unit (for example { ago: { amount: 1, unit: "hour" } }).',
    );
  }

  const amount =
    typeof ago.amount === 'number' ? ago.amount : Number.NaN;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(
      `Relative time point requires a positive integer ago.amount, got: ${String(amount)}`,
    );
  }

  const unit = ago.unit;
  if (
    typeof unit !== 'string' ||
    !Object.prototype.hasOwnProperty.call(RELATIVE_TIME_POINT_UNITS, unit)
  ) {
    throw new Error(
      `Relative time point requires ago.unit to be one of ${Object.keys(RELATIVE_TIME_POINT_UNITS).join(', ')}, got: ${String(unit)}`,
    );
  }

  const normalized = RELATIVE_TIME_POINT_UNITS[unit as RelativeTimePointUnit];
  const labelUnit = amount === 1 ? normalized.singular : normalized.plural;
  return {
    amount,
    durationMs: amount * normalized.durationMs,
    label: `${amount} ${labelUnit} ago`,
  };
}

export function resolveTimeRange(
  spec?: TimeRangeSpec,
  options: ResolveTimeOptions = {},
): ResolvedTimeRange {
  const nowMs = resolveNowMs(options.nowMs);
  const resolvedSpec: TimeRangeSpec = spec ?? { preset: 'last_1_hour' };

  if ('preset' in resolvedSpec) {
    if (resolvedSpec.preset in ROLLING_PRESETS) {
      const preset = ROLLING_PRESETS[resolvedSpec.preset as RollingRangePreset];
      const timezone = validateTimezone(resolvedSpec.timezone);
      return {
        from: nowMs - preset.durationMs,
        to: nowMs,
        timezone,
        label: preset.label,
      };
    }

    const timezone = validateRequiredTimezone(
      resolvedSpec.timezone,
      `Calendar preset "${resolvedSpec.preset}"`,
    );
    if (resolvedSpec.preset === 'today') {
      return {
        from: startOfLocalDay(nowMs, timezone),
        to: nowMs,
        timezone,
        label: 'Today',
      };
    }

    if (resolvedSpec.preset !== 'yesterday') {
      throw new Error(`Unsupported calendar preset: ${String(resolvedSpec.preset)}`);
    }

    const todayStart = startOfLocalDay(nowMs, timezone);
    return {
      from: startOfLocalDay(todayStart - 1, timezone),
      to: todayStart,
      timezone,
      label: 'Yesterday',
    };
  }

  const timezone = validateRequiredTimezone(
    resolvedSpec.timezone,
    'Explicit local time range',
  );
  const from = resolveLocalDateTimeEpoch(parseLocalDateTime(resolvedSpec.from), timezone);
  const to = resolveLocalDateTimeEpoch(parseLocalDateTime(resolvedSpec.to), timezone);

  if (from >= to) {
    throw new Error(`Invalid time range: from must be < to (got ${resolvedSpec.from} to ${resolvedSpec.to}).`);
  }

  return {
    from,
    to,
    timezone,
    label: `${labelFromRange(resolvedSpec.from, timezone)} -> ${resolvedSpec.to}`,
  };
}

export function resolveTimePoint(
  spec: TimePointSpec,
  options: ResolveTimeOptions = {},
): ResolvedTimePoint {
  const nowMs = resolveNowMs(options.nowMs);

  if ('ago' in spec) {
    const timezone = validateTimezone(spec.timezone);
    const relative = validateRelativeTimePointAgo(spec.ago);
    return {
      timestamp: nowMs - relative.durationMs,
      timezone,
      label: `${relative.label} (${timezone})`,
    };
  }

  const timezone = validateRequiredTimezone(spec.timezone, 'Exact local time point');
  return {
    timestamp: resolveLocalDateTimeEpoch(parseLocalDateTime(spec.at), timezone),
    timezone,
    label: labelFromRange(spec.at, timezone),
  };
}
