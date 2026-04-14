# Summary Patterns

## Contents

- Scope
- Time
- Options
- Common calls

## Scope

```
// Single folder
scope: { folders: ["/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220"] }

// Multiple folders
scope: { folders: [
  "/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220",
  "/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/110"
] }

// Omit scope for all alarms (use with caution)
```

## Time

```
time: { preset: "last_24_hours" }     // default if omitted
time: { preset: "last_1_hour" }
time: { preset: "last_7_days" }
time: { preset: "yesterday", timezone: "Asia/Almaty" }
time: { from: "2026-03-15 00:00", to: "2026-03-16 00:00", timezone: "UTC" }
```

Note: ranges longer than 30 days are automatically split into contiguous windows for the main metrics fetch.
Note: calendar phrases such as `this week` should be translated into an explicit `{ from, to, timezone }` window; do not pass unsupported presets such as `this_week`.
Note: `this week` means the current calendar week starting Monday 00:00 in the chosen timezone, or `UTC` when the user does not specify one.
Note: if a calendar preset is rejected, retry with the same explicit week/day window; do not remove `time` and fall back to the default last 24 hours.

## Options

```
options: { top_n: 5 }
options: { flood_window_minutes: 15, flood_threshold_per_hour: 20 }
options: { chattering_min_count: 4 }
options: {
  top_n: 10,
  flood_window_minutes: 15,
  flood_threshold_per_hour: 10,
  chattering_min_count: 3
}
```

Defaults:
- `top_n`: `10`
- `flood_window_minutes`: `15`
- `flood_threshold_per_hour`: `10`
- `chattering_min_count`: `3`

## Common calls

```
// Alarm rate
skill_run({
  skill: "scada-alarm-summary",
  params: {
    time: { preset: "last_24_hours" },
    scope: { folders: ["/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220"] }
  }
})

// Top offenders
skill_run({
  skill: "scada-alarm-summary",
  params: {
    time: { preset: "last_7_days" },
    scope: { folders: ["/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220"] },
    options: { top_n: 5 }
  }
})

// Exact calendar week request: "show me the top alarm offenders this week at AKMOLA"
skill_run({
  skill: "scada-alarm-summary",
  params: {
    time: { from: "<this-week Monday 00:00>", to: "<now>", timezone: "UTC" },
    scope: "AKMOLA",
    options: { top_n: 10 }
  }
})

// Flood detection
skill_run({
  skill: "scada-alarm-summary",
  params: {
    time: { preset: "yesterday", timezone: "Asia/Almaty" },
    scope: { folders: ["/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220"] },
    options: { flood_window_minutes: 15, flood_threshold_per_hour: 10 }
  }
})

// Standing alarms
skill_run({
  skill: "scada-alarm-summary",
  params: {
    scope: { folders: ["/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220"] }
  }
})
```

Standing alarms always use a separate 30-day lookback fetch unless the requested main range already covers at least 30 days.
