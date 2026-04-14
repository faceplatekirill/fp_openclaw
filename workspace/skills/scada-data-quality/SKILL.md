---
name: scada-data-quality
description: Assesses telemetry freshness, quality codes, archive gaps, and last-change behavior for known tags. Use when the user asks about stale data, frozen values, data gaps, or signal health. Combines current-read, archive coverage, and recent history into one conservative fact-first view.
---

# scada-data-quality

## Routing Pseudocode

```
if (paths_unknown)
    → scada-object-explore first, then come back

if (user_wants_plain_trend)
    → scada-point-history

if (user_asks "is this field archived?" only)
    → scada-archive-coverage

if (freshness || stale_data || frozen_values || quality_codes ||
    data_gaps || last_change || suspicious_signals)
    → THIS SKILL
```

## Conservative Fact-First Boundary

- This skill owns the combined fact path: current value, current companion fields, archive coverage, and recent-history evidence.
- Report observable facts first: archive availability, current timestamps or quality codes, companion manual or source-selection fields when deterministically derivable, point counts, and last-change timestamps.
- Keep interpretation second. Do not escalate raw facts into speculative fault diagnosis without KB support or an explicit user request for deeper analysis.
- If the user only wants plain trend data, use `scada-point-history`. If the user only wants archive existence, use `scada-archive-coverage`.

## Call

```
skill_run({
  skill: "scada-data-quality",
  tags: [
    { object: "/root/FP/PROJECT/.../POINT", field: "out_value", label: "Active power" }
  ],
  time: { preset: "last_24_hours" },
  format: "chat"
})
```

Use `format: "json"` when chaining into another skill or export flow; use `"chat"` only for the final answer.

## Workflow Pseudocode

```
// 1. Build tags
tags = []
for each signal user is concerned about:
    tags.push({ object: resolved_path, field: field_name, label? })

// 2. Time window for history analysis
time = user_range || { preset: "last_24_hours" }

// 3. Call
result = skill_run({ skill: "scada-data-quality", tags, time })

// 4. Result includes per-tag:
//   - archive availability (archived / not archived)
//   - current value + quality codes (qds) + timestamps
//   - companion fields (manual flags, source selection)
//   - recent history point count and last change timestamp
```

## Final Checklist

- Did I keep the answer fact-first instead of drifting into speculative diagnosis?
- Did I use the combined current-read + archive + recent-history path instead of a plain history shortcut?
- Did I preserve invalid-path, not-archived, warning, and partial-completeness outcomes explicitly?
- Did I keep `format: "json"` for chaining and reserve `"chat"` for the final answer?

## On failure

If `skill_run` rejects params, fix and retry immediately while preserving the requested time window and tag set.
Do not answer from memory. Do not fall back to raw tools.
