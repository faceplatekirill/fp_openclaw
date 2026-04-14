# Tag and Time Patterns

## Tag format

```
{ object: "/root/FP/PROJECT/.../POINT", field: "out_value" }
// Optional: label, unit for display
{ object: "...", field: "out_value", label: "Active power", unit: "MW" }
```

- `object`: full canonical path (must start with `/`)
- `field`: runtime field name (out_value, state_graph, position, etc.)
- max 5 tags per call

## Time Contract

```
time: { preset: "last_1_hour" }
time: { preset: "last_15_minutes" }
time: { preset: "last_6_hours" }
time: { preset: "last_24_hours" }
time: { preset: "last_7_days" }
time: { preset: "today", timezone: "Asia/Almaty" }
time: { preset: "yesterday", timezone: "UTC" }
```

## Explicit time range

```
time: { from: "2026-03-15 00:00", to: "2026-03-16 00:00", timezone: "Asia/Almaty" }
```

- Calendar presets such as `today` and `yesterday` require `timezone`.
- Translate non-canonical phrases such as `this week`, `this month`, or shift windows into explicit `{ from, to, timezone }` before calling.

## Default

If `time` is omitted → last 1 hour.

## History notes

- History is change-driven: first point may precede the range start (defines effective value at boundary)
- Empty data means no archive changes in the requested period
- Unresolved tag = field exists but is not archived
- Invalid tag = object path does not exist
