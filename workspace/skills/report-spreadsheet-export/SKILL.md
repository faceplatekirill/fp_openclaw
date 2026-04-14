---
name: report-spreadsheet-export
description: Exports a ViewModelContract to a CSV spreadsheet file. Use when the user asks to export, download, save, or convert an already-produced skill result into CSV. This skill is downstream-only and does not fetch data by itself.
---

# report-spreadsheet-export

## Routing Pseudocode

```
if (user_wants_csv || user_wants_spreadsheet || user_wants_downloadable_table)
    -> THIS SKILL

if (user_still_needs_the_data_generated_first)
    -> call the appropriate data skill with format: "json", then call THIS SKILL
```

## Downstream-Only Contract

- This skill only accepts an already-produced `ViewModelContract`.
- Always call the upstream data skill with `format: "json"` first. Do not pass rendered chat markdown.
- This skill does not discover scope, fetch alarms, compute KPIs, or re-run archive reads.
- If the user wants export plus fresh data, the data-producing skill stays first and this skill remains the final downstream step.

## Call

```
const data = skill_run({
  skill: "scada-alarm-summary",
  params: {
    time: { preset: "last_24_hours" },
    scope: { folders: ["/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220"] }
  },
  format: "json"
});

skill_run({
  skill: "report-spreadsheet-export",
  params: {
    data,
    filename: "alarm_summary_20260319T143000.csv"
  },
  format: "chat"
})
```

## Algorithm pseudocode

```
// 1. Get the source ViewModelContract first
viewModel = prior_skill_result

// 2. Call export
exportResult = skill_run({
  skill: "report-spreadsheet-export",
  params: { data: viewModel, filename?: custom_name }
})

// 3. Return the file path / export pointer
```

Always use `format: "json"` on the source skill so the export skill receives the raw view model, not rendered markdown.

## Final Checklist

- Did I keep this as a downstream export step instead of mixing in data retrieval?
- Did I pass a real `ViewModelContract` from an upstream `format: "json"` skill call?
- Did I preserve the handoff boundary instead of improvising CSV text in the agent?
- Did I return the export pointer or file path rather than pretending the file content itself is the primary response?

## On failure

If `params.data` is missing or malformed, fix the upstream call and retry.
Do not manually write CSV in the agent when this skill applies.
