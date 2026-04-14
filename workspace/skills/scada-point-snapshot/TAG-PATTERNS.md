# Tag and Time Patterns

## Tag format

```
{ object: "/root/FP/PROJECT/.../POINT", field: "out_value" }
// Optional: label, unit for display
{ object: "...", field: "out_value", label: "Active power", unit: "MW" }
```

- `object`: full canonical path (must start with `/`)
- `field`: runtime field name
- max 10 tags per call

## Exact local time

```
time: { at: "2026-03-16 12:00", timezone: "Asia/Almaty" }
time: { at: "2026-03-16 08:30:00", timezone: "UTC" }
```

## Relative time (ago)

```
// "an hour ago"
time: { ago: { amount: 1, unit: "hour" }, timezone: "Asia/Almaty" }

// "30 minutes ago"
time: { ago: { amount: 30, unit: "minute" }, timezone: "Asia/Almaty" }
```

Supported units: `minute`, `hour`, `day`.

## Exact-Time Contract

- `time` is **required** — do not omit it
- Keep `timezone` explicit for wall-clock timestamps
- If the user provides an offset-bearing ISO timestamp, normalize it carefully before retrying; do not silently reinterpret it
- Snapshot means the effective archived value at or before that timestamp, not a range trend
- Do not use this skill for current values (use ecomet_read instead)
- Unresolved tag = field exists but is not archived
- Invalid tag = object path does not exist
