# Export Patterns

## Two-step flow

Always fetch the source data first with `format: "json"`, then pass the returned `ViewModelContract` into `report-spreadsheet-export`.

```
const data = skill_run({
  skill: "scada-alarm-list",
  params: {
    time: { preset: "last_1_hour" },
    scope: { folders: ["/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220"] }
  },
  format: "json"
});

skill_run({
  skill: "report-spreadsheet-export",
  params: { data },
  format: "chat"
})
```

## Supported view model kinds

The export skill accepts any `ViewModelContract` with blocks of these kinds:
- `alarm_list`
- `alarm_summary`
- `history`
- `aggregate_table`
- `snapshot`
- `scope`
- `coverage`

## Common examples

```text
// Export alarm list
skill_run({ skill: "scada-alarm-list", ..., format: "json" })
-> skill_run({ skill: "report-spreadsheet-export", params: { data: <result> } })

// Export alarm summary
skill_run({ skill: "scada-alarm-summary", ..., format: "json" })
-> skill_run({ skill: "report-spreadsheet-export", params: { data: <result> } })

// Export aggregate table with a custom filename
skill_run({ skill: "scada-period-aggregates", ..., format: "json" })
-> skill_run({
     skill: "report-spreadsheet-export",
     params: { data: <result>, filename: "daily_aggregates.csv" }
   })
```

## Filename conventions

If `filename` is omitted, the default is:

```text
{kind}_{timestamp}.csv
```

Examples:
- `alarm_list_20260319T143000.csv`
- `alarm_summary_20260319T143000.csv`
- `aggregate_table_20260319T143000.csv`

## Notes

- Export uses UTF-8 with BOM and CRLF line endings for spreadsheet compatibility.
- Multi-section blocks such as `alarm_summary` are written as sectioned CSV, not flattened into one table.
- If the source data is partial, the CSV footer preserves that warning.
