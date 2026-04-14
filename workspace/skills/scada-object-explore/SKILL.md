---
name: scada-object-explore
description: Explore live SCADA objects in a real folder or scope, find matching objects by folder, pattern, field filters, or text search, and read current or configuration fields across the matched set with select or for exact known object paths. Use this as the main skill for object discovery, path resolution, scope understanding, known-path current reads, and scope-wide current-state reads.
---

# scada-object-explore

## Must Read First

- `PROJECT_KB/structure/project-model.md`
- `PROJECT_KB/structure/field-boundaries.md`

Do not answer real existence, type, or field-availability questions from KB memory alone. Use live discovery for what actually exists now. Use `PROJECT_KB` for field families and semantics, not for pretending a live object or type is present.

## Routing Pseudocode

`types_info` and `ecomet_read` are adjacent tool calls inside this workflow, not delegated skills.

```text
if (request is historical, snapshot, or aggregate)
    -> route to the archive skill family instead

read PROJECT_KB/structure/project-model.md
read PROJECT_KB/structure/field-boundaries.md when field families or boundaries matter

analyze the question
identify what the user wants, what is already known, what is still unknown
record assumptions that may need explicit confirmation later

build a short plan
decide what to inspect in PROJECT_KB, what to discover live, what to read, and what to verify before answering
  try 
    if (types, fields, or indexes are unclear)
        -> use types_info("*") for broad live discovery, or
           types_info({ "<type-path>": "*" }) / explicit field lists for targeted discovery
        -> use PROJECT_KB for semantics
        -> continue the workflow

    if (exact object paths are already known)
        if (fields are still unclear)
            -> ecomet_read(objects, [".pattern", ".name"]) to confirm the real type or pattern first
            -> use types_info(...) to confirm the real field names
            -> use PROJECT_KB to choose the right current/config fields
        -> ecomet_read(objects, fields)

    else if (request is discovery, scope understanding, or scope-wide current/config reads)
        -> skill_run({ skill: "scada-object-explore", ...canonical params })
        -> if the search times out, reduce limit, narrow scope or select if needed, and retry

    if (the user asked for all matching objects or all current values and the page is partial)
        -> continue with the next offset
        -> repeat until the requested scope is covered or the page already proves completeness
  catch (error)
    follow the feedback loops below

draft the answer
run the final checklist
if the checklist finds a gap, return to the workflow steps above
return the answer
```

## Feedback Loops

- Invalid params or rejected calls: fix the canonical params and retry `skill_run`.
- Unknown types, fields, or indexability: use `types_info("*")` for broad discovery or `types_info({ "/root/FP/prototypes/point/fields": "*" })` for a known type, then use `PROJECT_KB` to interpret what those fields mean.
- Exact object paths become known during discovery: switch the remaining known-path current read to `ecomet_read`.
- Exact object paths are known but the right fields are still unclear: first read `.pattern` and `.name` with `ecomet_read`, then use `types_info` plus `PROJECT_KB`, then call `ecomet_read` with the confirmed current/config field list.
- The user asked for current fields on exact object paths but did not enumerate them: do not stop for a follow-up question before trying the known-path workflow above.
- Search timeout: lower `limit`, narrow `folder`, `pattern`, or `select` if needed, and retry before answering.
- A page is partial but the user asked for all matches or all current values: rerun with the next `offset` until the requested scope is covered or one page already proves completeness.

## Canonical Params

- `folder`
  Scope root folder path for the search.
- `pattern`
  One type path or a list of type paths to match.
- `fields`
  Exact field-value filters for narrowing the matched objects.
- `searchText`
  Substring text to search for.
- `searchIn`
  Optional list of fields to search in. If omitted, this skill defaults to `[".name"]`. Prefer system fields such as `.name` and `.fp_path`. Do not search non-system fields without a narrow `pattern` filter unless you are prepared for heavy long-running searches.
- `recursive`
  When `true` (default), include descendants under `folder`. When `false`, only inspect direct children.
- `select`
  Fields to project onto every returned object. This is the only public projection mechanism.
- `limit`
  Page size. Default `1000`, max `10000`.
- `offset`
  Page offset for continuation.

At least one search condition is required: `folder`, `pattern`, `fields`, or `searchText`.

The effective projection always includes `.fp_path` and `.pattern`, even when you omit them from `select`.

## Workflow Checklist

Run this checklist immediately before returning the answer:

- Did I answer the user’s actual question, not just the first convenient sub-problem?
- What did I assume, and should any of those assumptions be verified or disclosed?
- What did I not verify yet that could make the answer more complete or more correct?
- Did I follow the plan, or did new findings change the workflow?
- Did any unexpected findings appear that require correction, another read, another search, or another page?
- If the user asked for all matching objects or all current values, did I continue paging until the requested scope was covered?

If any answer above reveals a gap, loop back through the workflow before returning the final answer.

## Representative Calls

```js
skill_run({
  skill: "scada-object-explore",
  folder: "/root/FP/PROJECT/.../STATION",
  pattern: "/root/FP/prototypes/.../fields",
  select: [".name", "state_field", "quality_field", "timestamp_field"]
})
```

Use `types_info` to discover the real field names first, then use `PROJECT_KB` to decide which current, quality, timestamp, state, or configuration fields matter for this scope. If you already know the exact object paths after discovery, switch the remaining current/config read to `ecomet_read` instead of re-searching the scope; if the fields are still unclear, first read `.pattern` and `.name` via `ecomet_read`, then continue with `types_info`.

```js
skill_run({
  skill: "scada-object-explore",
  folder: "/root/FP/PROJECT/.../AREA",
  searchText: "L2831",
  searchIn: [".name"],
  select: [".name", "configuration_field"],
  limit: 500,
  offset: 0
})
```

Keep broad text search on system fields when possible. Non-system `searchIn` fields can fall back to strict `:LIKE` instead of indexed `LIKE`; only use them after narrowing by `pattern` and confirming the field has a live `3gram` index.

## Search Pattern Index

See [SEARCH-PATTERNS.md](SEARCH-PATTERNS.md) for:

- schema-first discovery
- folder scans and type filters
- exact field-value filters
- text search across one or more fields
- current/config field projection with `select`
- known-path handoff to `ecomet_read`
- non-recursive searches
- pagination patterns for exhaustive scope reads
