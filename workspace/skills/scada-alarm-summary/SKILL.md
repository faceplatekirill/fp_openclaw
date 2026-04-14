---
name: scada-alarm-summary
description: Computes alarm statistics, KPIs, rates, top offenders, flood periods, standing alarms, chattering alarms, and category or priority distributions for a scope and time range. Scope may be provided as folder paths or a plain scope label string such as AKMOLA. Use when the user asks for alarm summaries or analytics rather than raw alarm rows. For listing individual alarm events use scada-alarm-list.
---

# scada-alarm-summary

## Current Surface

- This skill is implemented and usable now as a standalone Layer 1 surface from the current `main` workspace.
- Today it computes alarm analytics directly on the current runtime path.
- Later-phase delegated artifact-return behavior is future context only. Do not describe `alarm-analyst` delegation as if it were the only current execution path.

## Routing Pseudocode

```
if (scope_unknown)
    -> scada-object-explore first, then come back

if (list_alarm_rows || filter_alarm_rows || show_individual_events)
    -> scada-alarm-list

if (alarm_statistics || alarm_KPIs || top_offenders || flood_analysis ||
    standing_alarms || chattering || alarm_rate || category_distribution)
    -> THIS SKILL
```

## Time, Scope, And Completeness Contract

- Default `time` is `last_24_hours` when omitted.
- Scope may be folder-based or a plain scope label such as `AKMOLA`.
- Translate unsupported calendar phrases such as `this week` into explicit `{ from, to, timezone }`; do not drop the requested time meaning on retry.
- Long ranges are split into contiguous windows of 30 days or less and surfaced with a warning.
- If alarm volume hits the 10,000 safety limit or some pages fail, preserve `partial` completeness instead of overstating the metrics.
- Standing alarms may require a separate 30-day lookback when the requested main range is shorter.

## Call

```
skill_run({
  skill: "scada-alarm-summary",
  params: {
    time: { preset: "last_24_hours" },
    scope: { folders: ["/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220"] },
    options: {
      top_n: 10,
      flood_window_minutes: 15,
      flood_threshold_per_hour: 10,
      chattering_min_count: 3
    }
  },
  format: "chat"
})
```

Use `format: "json"` when chaining into another skill such as `report-spreadsheet-export`. Use `"chat"` only for the final answer.

## Workflow Pseudocode

```
// 1. Build params from user intent
params = {}
params.time = user_range || { preset: "last_24_hours" }

if (user_uses_calendar_phrase_like_this_week)
    params.time = { from: week_start, to: now, timezone: user_timezone || "UTC" }

if (user_specifies_scope_label)
    params.scope = user_scope_label
else if (user_specifies_scope)
    params.scope = { folders: [resolved_folder_paths] }

params.options = {}
if (user_requests_specific_top_n)         params.options.top_n = user_top_n
if (user_requests_flood_tuning)           params.options.flood_window_minutes = user_window
if (user_requests_flood_tuning)           params.options.flood_threshold_per_hour = user_threshold
if (user_requests_chattering_threshold)   params.options.chattering_min_count = user_min_count

// 2. Call
result = skill_run({ skill: "scada-alarm-summary", params, format: "json"|"chat" })

// 3. Handle result
if (result.completeness.status == "partial")
    -> surface the warning/reason instead of silently overstating completeness

if (skill_run rejects an unsupported calendar preset)
    -> retry with the same requested calendar meaning as explicit { from, to, timezone }
    -> never drop the requested time window and fall back to default last_24_hours
```

Calendar phrases:
- `this week` means the current calendar week from Monday 00:00 to now in the chosen timezone
- if the user gives no timezone, default to `UTC`
- a plain scope label such as `AKMOLA` may be passed directly as `scope: "AKMOLA"`

## Final Checklist

- Did I keep this on analytics and KPI behavior instead of raw alarm rows?
- Did I preserve the user's requested time and scope semantics, including any translated calendar phrase?
- Did I surface split-window, safety-limit, pagination, warning, and partial-completeness signals when they apply?
- Did I keep `format: "json"` for chaining and reserve `"chat"` for the final answer?
- Did I describe the current standalone surface accurately without pretending later-phase delegation is already required?

## Patterns -> [SUMMARY-PATTERNS.md](SUMMARY-PATTERNS.md)

## On failure

If `skill_run` rejects params, fix them and retry immediately.
Preserve the user's requested semantics on retry, especially time windows and scope.
If the user asked for `this week`, retry with an explicit week range instead of omitting `time`.
Do not answer from memory.
Do not switch to raw tools for analytics that this skill can compute.
