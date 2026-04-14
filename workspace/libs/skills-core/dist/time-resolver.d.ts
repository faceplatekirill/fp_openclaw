export type RollingRangePreset = 'last_15_minutes' | 'last_30_minutes' | 'last_1_hour' | 'last_2_hours' | 'last_6_hours' | 'last_24_hours' | 'last_7_days';
export type CalendarRangePreset = 'today' | 'yesterday';
export type RelativeTimePointUnit = 'minute' | 'minutes' | 'hour' | 'hours' | 'day' | 'days';
export type LocalDateTimeString = `${number}-${number}-${number} ${number}:${number}` | `${number}-${number}-${number} ${number}:${number}:${number}`;
export type TimeRangeSpec = {
    preset: RollingRangePreset;
    timezone?: string;
} | {
    preset: CalendarRangePreset;
    timezone: string;
} | {
    from: LocalDateTimeString;
    to: LocalDateTimeString;
    timezone: string;
};
export type TimePointSpec = {
    at: LocalDateTimeString;
    timezone: string;
} | {
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
export declare function resolveTimeRange(spec?: TimeRangeSpec, options?: ResolveTimeOptions): ResolvedTimeRange;
export declare function resolveTimePoint(spec: TimePointSpec, options?: ResolveTimeOptions): ResolvedTimePoint;
//# sourceMappingURL=time-resolver.d.ts.map