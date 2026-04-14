---
name: scada-alarm-list
description: Retrieves filtered alarm rows for a scope and time range with paging. Use when the user asks to list or filter alarms, or asks what happened in a region, station, or voltage scope over the last hour or day and needs the actual alarm or event rows. For alarm statistics, ranking, flood detection, or summaries use scada-alarm-summary.
---

# scada-alarm-list

## Routing Pseudocode

```
if (scope_unknown)
    → scada-object-explore first, then come back

if (alarm_KPIs || flood_analysis || top_offenders || alarm_rates)
    → scada-alarm-summary

if (list_alarms || filter_alarms || raw_alarm_rows)
    → THIS SKILL
```

## Alarm Window And Completeness Contract

- This skill owns row-oriented alarm retrieval, not KPI or summary behavior.
- Default `time` is `last_24_hours` when omitted.
- Long ranges are split into contiguous windows of 30 days or less and merged deterministically before the final response.
- Page defaults are `limit: 200` and `offset: 0`; max limit is `200`.
- If the merged result is not complete, preserve `completeness.status = "partial"` plus totals and continuation guidance.
- Do not combine manual `page.offset > 0` with a long range that must be split into multiple windows. Narrow the range first or start from the first merged page.

## Call

```
skill_run({
  skill: "scada-alarm-list",
  time: { preset: "last_24_hours" },
  scope: { folders: ["/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220"] },
  filters: { active: true },
  page: { limit: 50, offset: 0 },
  format: "chat"
})
```

Use `format: "json"` when chaining into another skill or export flow; use `"chat"` only for the final answer.

## Workflow Pseudocode

```
// 1. Build params from user intent
params = {}
params.time = user_range || { preset: "last_24_hours" }

if (user_specifies_area)
    params.scope = { folders: [resolved_folder_paths] }

params.filters = {}
if (user_wants_active_only)      params.filters.active = true
if (user_wants_unacked_only)     params.filters.acknowledged = false
if (user_wants_type_filter)      params.filters.fields = { fact: "TI" }
if (user_searches_text)          params.filters.search = { text: "stale", in: ["text"] }

// 2. Call
result = skill_run({ skill: "scada-alarm-list", ...params })

// 3. Handle result
if (result.completeness == "partial")  → suggest narrowing scope/time or next page
```

## Final Checklist

- Did I keep this on raw row retrieval instead of drifting into KPI or summary behavior?
- Did I preserve the requested time window, scope, filters, and paging intent?
- If the range exceeded 30 days, did I document the split-window behavior instead of implying one raw fetch?
- Did I preserve totals, partiality, and continuation guidance instead of overstating completeness?
- Did I keep `format: "json"` for chaining and reserve `"chat"` for the final answer?

## Filter and paging details → [ALARM-PATTERNS.md](ALARM-PATTERNS.md)

## On failure

If `skill_run` rejects params, fix and retry immediately while preserving the requested time, scope, and filter intent.
Do not answer from memory. Do not fall back to raw tools.
