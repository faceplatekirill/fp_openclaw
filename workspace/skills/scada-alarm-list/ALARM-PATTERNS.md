# Alarm Patterns

## Scope

```
// Single folder
scope: { folders: ["/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220"] }

// Multiple folders
scope: { folders: ["/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220", "/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/110"] }

// Omit scope for all alarms (use with caution)
```

## Time

```
time: { preset: "last_24_hours" }          // default if omitted
time: { preset: "last_1_hour" }
time: { preset: "last_7_days" }
time: { from: "2026-03-15 00:00", to: "2026-03-16 00:00", timezone: "Asia/Almaty" }
```

Note: ranges longer than 30 days are automatically split into contiguous windows, merged, and disclosed with a split-window warning.

## Filters

```
// Active alarms only
filters: { active: true }

// Unacknowledged only
filters: { acknowledged: false }

// By alarm type
filters: { fields: { fact: "TI" } }

// Text search in alarm message
filters: { search: { text: "overload", in: ["text"] } }

// Combined
filters: { active: true, acknowledged: false, fields: { fact: "TI" } }
```

## Select (custom fields)

```
// Default fields: dt_on, point, text, active, acknowledged, fact, relevant
select: ["dt_on", "point", "text", "fact", "active", "acknowledged", "dt_off"]
```

## Paging

```
page: { limit: 50, offset: 0 }    // default: limit 200, offset 0
// max limit: 200
```

Check `result.completeness` for total available count and continuation hints.
If the range had to be split into multiple windows, stay on the first merged page; do not combine that case with manual `offset` paging.
