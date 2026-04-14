---
name: scada-archive-coverage
description: Checks which fields on known objects are archived. Use when the user asks whether a field has history available, or before calling history, snapshot, or aggregate skills to verify data availability. This skill reports coverage only; it does not retrieve archive values.
---

# scada-archive-coverage

## Routing Pseudocode

```
if (paths_unknown)
    → scada-object-explore first, then come back

if (user_asks "is this field archived?" || "which fields have history?")
    → THIS SKILL

if (user_wants_actual_data: trend, snapshot, aggregate)
    → scada-point-history / snapshot / aggregates
    // check coverage first if unsure about archiving
```

## Coverage Ownership

- Route here when the user is asking whether history exists, which fields are archived, or whether a later archive skill is likely to succeed.
- Do not turn this into a history, snapshot, or aggregate fetch. Those skills own actual archive values once coverage is known.
- Use `format: "json"` when the next step will chain into another skill; use `"chat"` only for the final answer.

## Outcome Contract

- `archived: true` means the field resolved to an archive path and the response includes that `archive_path`.
- `archived: false` with `Field is not archived.` means the object exists but the field has no archive coverage.
- `archived: false` with `Object path is invalid.` means the path itself is wrong and should be rechecked with `scada-object-explore`.
- If coverage cannot be proven cleanly, preserve the warning instead of guessing.

## Call

```
skill_run({
  skill: "scada-archive-coverage",
  tags: [
    { object: "/root/FP/PROJECT/.../POINT", field: "out_value" },
    { object: "/root/FP/PROJECT/.../POINT", field: "state_graph" }
  ],
  format: "chat"
})
```

## Algorithm pseudocode

```
// 1. Build tags
tags = []
for each object+field user mentions:
    tags.push({ object: resolved_path, field: field_name })

// 2. Call
result = skill_run({ skill: "scada-archive-coverage", tags })

// 3. Interpret per-tag results
// archived=true  → field has archive, archive_path available
// archived=false + "not archived" → no archive configured
// archived=false + "invalid" → object path is wrong
```

## Final Checklist

- Did I keep this on the archive-existence boundary instead of retrieving data?
- Did I distinguish archived, not archived, invalid, and warning-only outcomes explicitly?
- Did I preserve the archive path when coverage exists?
- Did I keep `format: "json"` for chaining and reserve `"chat"` for the final answer?

## On failure

If skill_run rejects params — fix and retry immediately.
Do not answer from memory. Do not fall back to raw tools.
