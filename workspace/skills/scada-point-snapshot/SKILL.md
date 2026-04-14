---
name: scada-point-snapshot
description: Returns the value of known object+field tags at a specific past timestamp. Use when the user asks what a value was at an exact moment. ARCHIVE-DEPENDENT. NEVER use for current values; use scada-object-explore or ecomet_read instead. For ranges use scada-point-history.
---

# scada-point-snapshot

## Routing Pseudocode

```
if (paths_unknown)
    → scada-object-explore first, then come back

if (current_value_needed)
    → scada-object-explore or ecomet_read         // NOT this skill
    // WARNING: this skill is archive-only and does not answer "what is it now?"

if (trend_or_history_over_range)
    → scada-point-history

if (aggregates_needed: avg, max, min, integral)
    → scada-period-aggregates

if (value_at_exact_past_time)
    → THIS SKILL
```

## Exact-Time Contract

- `time` is required. Use either `{ at: "YYYY-MM-DD HH:MM", timezone: "Asia/Almaty" }` or `{ ago: { amount, unit }, timezone: "Asia/Almaty" }`.
- Keep timezone semantics explicit whenever the user gives a wall-clock time.
- If the timestamp is already absolute and offset-bearing, normalize it carefully before retrying; do not silently reinterpret it in another timezone.
- This skill returns the effective archived value at or before the requested timestamp. If the user wants a range, trend, or bucketed view, route elsewhere.

## Invalid And Unresolved Outcomes

- `invalid` means the object path does not exist or could not be resolved.
- `unresolved` means the object exists but the field is not archived.
- Keep those outcomes explicit and preserve partial completeness instead of flattening them into null values.

## Call

```
skill_run({
  skill: "scada-point-snapshot",
  tags: [
    { object: "/root/FP/PROJECT/.../POINT", field: "out_value", label: "Active power" }
  ],
  time: { at: "2026-03-16 12:00", timezone: "Asia/Almaty" },
  format: "chat"
})
```

Use `format: "json"` when chaining into another skill or export flow; use `"chat"` only for the final answer.

## Workflow Pseudocode

```
// 1. Build tags
tags = []
for each measurement user mentions:
    tags.push({ object: resolved_full_path, field: field_name, label?, unit? })

// 2. Resolve time — REQUIRED, must be a past moment
if (user_says "an hour ago")
    time = { ago: { amount: 1, unit: "hour" }, timezone: "Asia/Almaty" }
else
    time = { at: "YYYY-MM-DD HH:MM", timezone: user_timezone }

// 3. Call
result = skill_run({ skill: "scada-point-snapshot", tags, time })

// 4. Handle result
if (result has unresolved tags)  → field not archived, tell user
if (result has invalid tags)     → object path wrong
```

## Final Checklist

- Did I confirm this is an exact-time question, not a current read or range trend?
- Did I keep the requested timestamp and timezone semantics explicit?
- Did I preserve `invalid`, `unresolved`, warnings, and partial completeness distinctly from valid null values?
- Did I keep `format: "json"` for chaining and use `"chat"` only for the final answer?

## Tag and time details → [TAG-PATTERNS.md](TAG-PATTERNS.md)

## On failure

If `skill_run` rejects params, fix and retry immediately while preserving the requested timestamp semantics.
Do not answer from memory. Do not fall back to raw tools.
