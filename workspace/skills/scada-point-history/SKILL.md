---
name: scada-point-history
description: Retrieves time-series trend/history for known object+field tags. Use when the user asks for a trend, history, or last-change timeline over a time range. ARCHIVE-DEPENDENT. For current values use scada-object-explore or ecomet_read. For exact-time values use scada-point-snapshot. For bucketed statistics use scada-period-aggregates.
---

# scada-point-history

## Routing Pseudocode

```
if (paths_unknown)
    → scada-object-explore first, then come back

if (current_value_needed && no_time_range)
    → scada-object-explore or ecomet_read         // NOT this skill
    // WARNING: this skill depends on archives and is for a resolved range only

if (exact_time_snapshot_needed)
    → scada-point-snapshot

if (aggregates_needed: avg, max, min, integral, standard_deviation, buckets)
    → scada-period-aggregates

if (trend || history || time_series || last_change_over_range)
    → THIS SKILL
```

## Shared Time Contract

- Canonical `time` is either a rolling preset such as `last_15_minutes`, `last_1_hour`, `last_24_hours`, `last_7_days`, or an explicit `{ from, to, timezone }` range.
- Calendar presets such as `today` and `yesterday` require an explicit `timezone`.
- Non-canonical phrases such as `this week`, `this month`, or shift windows should be translated into an explicit `{ from, to, timezone }` range before the call.
- If `time` is omitted, this skill defaults to `last_1_hour`.
- History is change-driven. The first returned point may predate the requested start and still define the effective value at the boundary.

## Invalid And Unresolved Outcomes

- `invalid` means the object path does not exist or could not be resolved.
- `unresolved` means the object exists but the requested field is not archived.
- Preserve those outcomes explicitly and keep completeness `partial` when only some tags resolve. Never collapse them into generic "no data".

## Call

```
skill_run({
  skill: "scada-point-history",
  tags: [
    { object: "/root/FP/PROJECT/.../POINT", field: "out_value", label: "Active power", unit: "MW" }
  ],
  time: { preset: "last_1_hour" },
  format: "chat"
})
```

Use `format: "json"` when chaining into another skill or export flow; use `"chat"` only for the final answer.

## Workflow Pseudocode

```
// 1. Build tags from what user asks about
tags = []
for each measurement user mentions:
    tags.push({ object: resolved_full_path, field: field_name, label?, unit? })

// 2. Resolve time range
time = user_specified_range || { preset: "last_1_hour" }

// 3. Call
result = skill_run({ skill: "scada-point-history", tags, time })

// 4. Handle result
if (result has unresolved tags)  → field not archived, tell user
if (result has invalid tags)     → object path wrong, verify with scada-object-explore
if (result.completeness == "partial") → some tags failed
```

## Final Checklist

- Did I verify or resolve the full object path before asking for history?
- Did I keep the requested time range and timezone intact, or state the default I used?
- Did I preserve `invalid`, `unresolved`, warnings, and partial completeness explicitly?
- Did I explain change-driven or carry-forward semantics if gaps or an earlier first point could be misread?
- Did I keep `format: "json"` for chaining and reserve `"chat"` for the final answer?

## Tag and time details → [TAG-PATTERNS.md](TAG-PATTERNS.md)

## On failure

If `skill_run` rejects params, fix and retry immediately while preserving the requested time intent.
Do not answer from memory. Do not fall back to raw tools.
