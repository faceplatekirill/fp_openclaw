# Aggregate Patterns

## Tag format (functions required)

```
{ object: "/root/FP/PROJECT/.../POINT", field: "out_value", functions: ["avg", "max"] }
// Optional: label, unit
{ object: "...", field: "out_value", functions: ["avg"], label: "Active power", unit: "MW" }
```

- `functions`: required array, pick from `avg`, `min`, `max`, `integral`, `standard_deviation`
- max 5 tags per call

## Bucket presets

```
bucket: { preset: "whole_range" }       // single aggregate over entire range (default)
bucket: { preset: "15_minutes" }
bucket: { preset: "30_minutes" }
bucket: { preset: "1_hour" }
bucket: { preset: "6_hours" }
bucket: { preset: "12_hours" }
bucket: { preset: "1_day" }             // DST-aware day boundaries
```

## Time Contract

```
time: { preset: "last_24_hours" }       // default if omitted
time: { preset: "last_1_hour" }
time: { preset: "last_7_days" }
time: { preset: "today", timezone: "Asia/Almaty" }
time: { preset: "yesterday", timezone: "UTC" }
```

## Explicit time range

```
time: { from: "2026-03-15 00:00", to: "2026-03-16 00:00", timezone: "Asia/Almaty" }
```

- Calendar presets such as `today` and `yesterday` require `timezone`.
- Translate non-canonical phrases such as `this week`, `this month`, or shift windows into explicit `{ from, to, timezone }` ranges before calling.

## Caveats

- `avg` is time-weighted over each bucket
- `integral` is time-weighted and may need unit conversion from `ms * value` when the physical unit is known
- `standard_deviation` is computed by the skill; do not estimate it from a prose summary
- Buckets use `[T_start, T_end)` semantics
- First/last bucket may be partial if range doesn't align to bucket boundary
- Day buckets are DST-aware — duration varies across DST transitions

## Chained peak-follow-up

For "what was the peak and when?":
1. Call scada-period-aggregates with `functions: ["max"]`, `format: "json"`
2. Use the max value to drive scada-point-history for exact timestamp
