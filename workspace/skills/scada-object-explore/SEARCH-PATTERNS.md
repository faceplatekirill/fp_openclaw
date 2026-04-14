# Search Patterns

Use `types_info` for live type, field, and index discovery before building a search when the schema is unclear. Use `PROJECT_KB` for field families and semantics after you know what exists live.

## Contents

- Schema-First Discovery
- Folder Scan
- Type Filter Inside A Scope
- Exact Field-Value Filter
- Text Search Across One Or More Fields
- Scope-Wide Fields Reads
- Known-Path Handoff
- Non-Recursive Search
- Exhaustive Paging

## Schema-First Discovery

```js
types_info("*")
```

Use this when you first need to see what type paths and field names exist.

```js
types_info({
  "/root/FP/prototypes/.../fields": "*",
  "/root/FP/prototypes/.../nested_state": ["state_field", "quality_field"]
})
```

Use this when you already know candidate types and want to check all fields for one type or specific fields for another.

## Folder Scan

```js
skill_run({
  skill: "scada-object-explore",
  folder: "/root/FP/PROJECT/.../STATION"
})
```

This is the simplest discovery pass for understanding what exists under a real scope.

## Type Filter Inside A Scope

```js
skill_run({
  skill: "scada-object-explore",
  folder: "/root/FP/PROJECT/.../STATION",
  pattern: "/root/FP/prototypes/.../fields"
})
```

```js
skill_run({
  skill: "scada-object-explore",
  folder: "/root/FP/PROJECT/.../STATION",
  pattern: [
    "/root/FP/prototypes/.../fields",
    "/root/FP/prototypes/.../nested_state"
  ]
})
```

Use this when the type is known and you want only that family of objects.

## Exact Field-Value Filter

```js
skill_run({
  skill: "scada-object-explore",
  folder: "/root/FP/PROJECT/.../AREA",
  fields: {
    "configuration_field": "target_value"
  },
  select: [".name", "configuration_field"]
})
```

Use this when the match condition is an exact field value rather than name text.

## Text Search Across One Or More Fields

```js
skill_run({
  skill: "scada-object-explore",
  folder: "/root/FP/PROJECT/.../AREA",
  searchText: "L2831",
  searchIn: [".name", ".fp_path"],
  limit: 50
})
```

`searchText` is substring search. If you omit `searchIn`, this skill defaults to `[".name"]`.
Prefer system fields such as `.name` and `.fp_path` for broad text search.
Do not use non-system `searchIn` fields without a narrow `pattern` filter unless you are prepared for heavy long-running searches.
Without a known `pattern`, non-system field search can fall back to strict `:LIKE` instead of indexed `LIKE`.

## Scope-Wide Fields Reads

```js
skill_run({
  skill: "scada-object-explore",
  folder: "/root/FP/PROJECT/.../STATION",
  pattern: "/root/FP/prototypes/.../fields",
  select: [".name", "current_field", "quality_field", "timestamp_field", "state_field"]
})
```

This stays on the search-driven path. `select` is the only public way to project the fields that should appear on each returned object.

## Known-Path Handoff

If discovery gives you the exact object paths and the remaining task is only a known-path current/configuration read, continue with `ecomet_read` instead of another scope search. If the field names are still unclear, first read `.pattern` and `.name` for those exact paths with `ecomet_read`, then run `types_info({ "<type-path>": "*" })`, then choose the right fields from `PROJECT_KB`.

## Non-Recursive Search

```js
skill_run({
  skill: "scada-object-explore",
  folder: "/root/FP/PROJECT/.../STATION",
  recursive: false
})
```

Use this when only direct children matter.

## Exhaustive Paging

```js
skill_run({
  skill: "scada-object-explore",
  folder: "/root/FP/PROJECT/.../AREA",
  select: [".name", "current_field"],
  limit: 1000,
  offset: 0
})
```

If the result is partial and the user asked for all matching objects or all current values, continue with `offset: 1000`, then `offset: 2000`, and so on until the requested scope is covered or the current page already proves completeness.

If a broad search times out, reduce `limit`, narrow `folder` or `pattern`, trim `select` to the fields the answer actually needs, and retry before continuing the paging loop.
