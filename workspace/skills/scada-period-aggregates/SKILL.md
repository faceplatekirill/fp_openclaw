---
name: scada-period-aggregates
description: Computes period aggregates (avg, min, max, integral, standard_deviation) for known object+field tags with optional bucketing. Use when the user asks for averages, peaks, totals, or period statistics. ARCHIVE-DEPENDENT. For raw trends use scada-point-history. For one exact timestamp use scada-point-snapshot.
---

# scada-period-aggregates

## Routing Pseudocode

```
if (paths_unknown)
    → scada-object-explore first, then come back

if (current_value_needed)
    → ecomet_read(paths, fields)                  // NOT this skill

if (raw_trend_or_history)
    → scada-point-history

if (value_at_exact_past_time)
    → scada-point-snapshot

if (avg || max || min || integral || standard_deviation || period_totals)
    → THIS SKILL
```

## Aggregate Semantics

- Supported functions are `avg`, `min`, `max`, `integral`, and `standard_deviation`.
- `avg`, `integral`, and `standard_deviation` are computed deterministically in code over the resolved time window and buckets; do not approximate them in prose from raw points.
- Bucket boundaries follow `[start, end)` semantics.
- `whole_range` is the default bucket preset when the user wants one aggregate over the full range.
- Day buckets remain timezone-aware. First or last buckets may be partial when the requested range does not align exactly.

## Invalid And Unresolved Outcomes

- `invalid` means the object path does not exist or could not be resolved.
- `unresolved` means the object exists but the field is not archived.
- Preserve those outcomes explicitly and keep completeness `partial` when only some tags resolve.

## Call

```
skill_run({
  skill: "scada-period-aggregates",
  tags: [
    { object: "/root/FP/PROJECT/.../POINT", field: "out_value", functions: ["avg", "max"], label: "Active power", unit: "MW" }
  ],
  time: { from: "2026-03-15 00:00", to: "2026-03-16 00:00", timezone: "Asia/Almaty" },
  bucket: { preset: "1_hour" },
  format: "chat"
})
```

Use `format: "json"` when chaining into another skill or export flow; use `"chat"` only for the final answer.

## Workflow Pseudocode

```
// 1. Build tags — each tag MUST include functions array
tags = []
for each measurement user asks about:
    functions = pick from ["avg", "min", "max", "integral", "standard_deviation"]
    tags.push({ object: resolved_path, field, functions, label?, unit? })

// 2. Resolve time and bucket
time = user_range || { preset: "last_24_hours" }        // defaults to 24h
bucket = user_bucket || { preset: "whole_range" }        // defaults to whole range

// 3. Call
result = skill_run({ skill: "scada-period-aggregates", tags, time, bucket })

// 4. Chained peak lookup
if (user_asks "peak and when did it occur?")
    → call this skill first with format: "json", functions: ["max"]
    → then use scada-point-history to find exact timestamp of peak
```

## Final Checklist

- Did I route true aggregate work here instead of leaving bucketing or statistics to free-form reasoning?
- Did I keep the requested time window and bucket semantics explicit?
- Did I preserve `invalid`, `unresolved`, warnings, and partial completeness explicitly?
- If the user asked "peak and when", did I use the aggregate-first `format: "json"` chain before the history follow-up?
- Did I reserve `"chat"` for the final answer only?

## Bucket presets and details → [AGGREGATE-PATTERNS.md](AGGREGATE-PATTERNS.md)

## On failure

If `skill_run` rejects params, fix and retry immediately while preserving the requested time and bucket intent.
Do not answer from memory. Do not fall back to raw tools.
