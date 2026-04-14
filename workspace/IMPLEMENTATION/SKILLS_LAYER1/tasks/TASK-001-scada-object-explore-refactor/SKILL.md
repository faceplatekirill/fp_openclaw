# Skill: scada-object-explore

**Status:** Draft
**Capability Type:** retrieval
**Execution Model:** direct
**Owner:** main-supervisor
**Delegates To:** none
**Dependencies:** `workspace/skills/scada-object-explore/index.js`, `searchObjects`, `ViewModelContract(kind="scope_view")`, adjacent IndexRegistry tools `ecomet_indexes` and `types_info`

## Purpose

Refactor `scada-object-explore` and the adjacent IndexRegistry tool surface so the skill remains the main direct capability for searching and exploring real SCADA objects and reading requested field values across a matched scope. The search-driven branch of this skill is a wrapper around the existing `searchObjects(...)` capability; it should organize workflow, docs, and normalization, but not invent new search functionality. The refactor must keep the existing `scope_view` artifact shape, remove `read_fields` from the public skill surface in favor of `select`, keep `ecomet_indexes` narrow but non-fallback, and add `types_info` for broader type/field/index introspection with explicit invalid markers for unknown types or fields.

## Trigger Description

Route here when the request is about discovering what objects exist, resolving ambiguous names into real paths, listing matching objects in a scope, or understanding and reading the current state of a scope. If the caller wants the current state of a scope, also keep the request here: this skill can explore what the scope contains, determine what types and fields are relevant, consult `PROJECT_KB` for field meaning, and read the needed values.

This skill owns the workflow for SCADA object exploration. The workflow should branch as follows:

- if the caller doesn't know what types, fields to search or select, use `types_info` first, then continue with discovery or reading as needed
- if the caller already knows exact object paths and needs current/configuration reads, use `ecomet_read` instead of the search-driven path
- use `PROJECT_KB` for field meaning and project semantics

`PROJECT_KB/structure/project-model.md` is a must-read reference for this skill. It is the starting point for understanding which object families, path roles, and field families exist in the live project before choosing patterns or field reads.

Route here:

- "What objects match this name under this station?"
- "Show all objects of this type under this folder."
- "What is the current state of this station/scope?"
- "Read these field values for the matching objects."
- "Read field values for these exact object paths."
- "Which paths and patterns exist under this area?"

Do not route here:

- Historical, snapshot, or aggregate questions.
  Route to `scada-point-history`, `scada-point-snapshot`, or `scada-period-aggregates`.
- Archive-coverage questions.
  Route to `scada-archive-coverage`.

## Tasks The Skill Can Solve

- Discover candidate objects from `folder`, `pattern`, `fields`, and text search inputs.
- Handle schema-first exploration by using `PROJECT_KB`, `types_info` and then continuing the workflow when needed.
- Handle scope-wide current-state questions by exploring what exists in the scope, identifying relevant types/fields, and reading the requested values.
- Handle known-path fields reads by using `ecomet_read` instead of the search-driven path.
- Return requested projected field values for every returned object when the caller supplies `select`.
- Organize the workflow when the user explicitly asks for all matching objects and/or all current values in a scope, continue paging with `offset` until the required result set is collected.
- Produce a reusable `scope_view` artifact with object paths, names, patterns, and selected fields.

## Tasks This Skill Does NOT Handle

- Historical trends, exact past snapshots, or period aggregates.
- Alarm retrieval or alarm summary.

## Input Schema

The public documented parameter surface must be canonical and concise.

- search conditions:
  - `folder`: scope root folder path
  - `pattern`: one type or a list of types to match
  - `fields`: exact field-value filters
  - `searchText`: substring text to search
  - `searchIn`: optional list of fields to search in; if omitted, the wrapper may default to `[".fp_path"]`
- projection controls:
  - `select`: fields to return and surface on the returned objects
- paging controls:
  - `limit`: page size
  - `offset`: page offset
- scope controls:
  - `recursive`: include descendant folders when `true`

At least one search condition is required: `folder`, `pattern`, `fields`, or `searchText`.

The search-driven branch of `scada-object-explore` is a wrapper around `searchObjects(...)`. The refactored skill docs should explain its capability completely enough that an agent can solve normal exploration tasks through this skill without separately reading raw-tool docs. The wrapper may normalize and validate params where needed, but it must stay capability-equivalent to `searchObjects(...)`.

Do not document compatibility aliases or alternate search shapes in the refactored skill docs. Use the YAML `description` as the main trigger/discovery text. Keep the main `SKILL.md` body for workflow, canonical param explanations, a short checklist, and only a couple of representative examples. The body should also include a full index of search patterns with reference to `SEARCH-PATTERNS.md` for the details.

Field names are not discovered by direct params alone. If you do not know what fields, types, or indexes are available, the skill workflow should call `types_info` first, then use `PROJECT_KB` for field meaning. Treat `PROJECT_KB/structure/project-model.md` as mandatory reading before using this skill.

## Default Behaviors

- `recursive` defaults to `true`.
- `limit` defaults to `1000` and clamps to `10000`.
- `offset` defaults to `0`.
- the effective projection always includes `.fp_path` and `.pattern`
- `select` is the real projection mechanism for the search-driven branch
- one execution returns one search page controlled by `limit` and `offset`; when the user asks for all matches, the workflow must continue paging instead of treating the first page as the final answer
- pagination partiality remains based on search totals versus returned rows
- field-name semantics must come from `PROJECT_KB`, not from hardcoded assumptions inside this skill's docs

## Atomic Steps

### Step 1: Refactor IndexRegistry Tool Surface

**Goal:** Keep `ecomet_indexes` narrow but non-fallback, and add a broader `types_info` tool for type, field, and index discovery.

**Files:** `workspace/extensions/ecomet-connector/index.ts`, `workspace/libs/ecomet-core/src/query/index-registry.ts`, `workspace/libs/ecomet-core/src/index.ts`

**Details:**

- keep `ecomet_indexes` tool name and request/response shape as-is
- change `ecomet_indexes` description so it is no longer marked as a fallback tool
- position `ecomet_indexes` as the narrow single-pattern detail lookup
- add a new direct tool `types_info`
- implement `types_info` on top of `IndexRegistry`; do not issue new ad hoc raw Ecomet queries when the registry already has the needed data
- add exported library helpers in `workspace/libs/ecomet-core/src/query/index-registry.ts` to support:
  - listing known types (`.patterns`)
  - listing fields for one or more types
  - listing available index names for type-field pairs
- export the new helper types/functions from `workspace/libs/ecomet-core/src/index.ts`
- `types_info` must support these request forms:

```json
"*"
```

- and:

```json
{
  "/root/FP/prototypes/type-a/fields": ["field_a", "field_b"],
  "/root/FP/prototypes/type-b/fields": "*"
}
```

- `types_info('*')` means: return all known types and all their fields
- `'*'` means: return all fields for the requested type
- for array requests, return every requested field key for that type, using index arrays for known fields and `"invalid field"` for unknown requested fields
- the response must stay compact and machine-oriented:

```json
{
  "/root/FP/prototypes/type-a/fields": {
    "field_a": ["simple"],
    "field_b": ["simple", "3gram"]
  },
  "/root/FP/prototypes/type-b/fields": {
    ".name": ["simple", "3gram"],
    ".pattern": ["simple"]
  }
}
```

- response values must be index-name arrays using the canonical names:
  - `simple`
  - `3gram`
  - `datetime`
- existing fields with no indexes must return `[]`
- explicitly requested missing fields must be returned under the requested field key with the literal value `"invalid field"`
- explicitly requested unknown types must be returned under the requested type key with the literal value `"invalid type"`

### Step 2: Keep The Search-Driven Branch Equivalent To searchObjects(...)

**Goal:** Remove the second read phase and keep the search-driven branch a clean wrapper around `searchObjects(...)`.

**Files:** `workspace/skills/scada-object-explore/index.js`

**Details:**

- remove the `readObjects` dependency from the skill module
- remove `ENRICHMENT_MAX_OBJECTS`
- remove the `getPatternIndexes` dependency and the `include_pattern_indexes` / `includePatternsSummary` behavior from this skill
- keep `searchObjects`
- narrow the public input surface to canonical params only:
  - `folder`
  - `pattern`
  - `fields`
  - `searchText`
  - `searchIn`
  - `recursive`
  - `select`
  - `limit`
  - `offset`
- remove legacy alias normalization and alternate public search shapes from this module:
  - `name_contains`
  - `includeChildren`
  - `include_descendants`
  - `include_fields`
  - `maxObjects`
  - `scope`
  - `scope_folder`
  - `scope_folders`
  - `mode`
  - `includeValues`
  - `include_values`
  - `groupByPattern`
  - structured `search`
  - flat `text`
- keep the search-driven branch capability-equivalent to `searchObjects(...)`:
  - folder / pattern / fields filters
  - substring search across one or more requested fields
  - `select`
  - `limit` / `offset`
- translate canonical `searchText` + optional `searchIn` into the internal `searchObjects(...)` text-search form
- if `searchIn` is omitted, default it to `[".fp_path"]` for better search relevance in this exploration context
- reject any undeclared params with clear validation errors before side effects
- use `select` as the only projection mechanism
- call `searchObjects(...)` exactly once per search-driven execution
- build `objects[].fields` directly from the returned search rows
- keep `.fp_path` and `.pattern` as mandatory projected fields
- remove `metadata.pattern_indexes` from this skill's output path
- remove enrichment-specific warnings and completeness branches:
  - `enrichment_skipped`
  - `enrichment_missing`
- keep existing warnings that are still valid:
  - forwarded search warnings
  - `limit_clamped`
  - `missing_fp_path`

### Step 3: Rewrite Skill Docs Around Main-Skill Scope Reads

**Goal:** Make the skill's routing/docs concise and aligned with the one-query implementation.

**Files:** `workspace/skills/scada-object-explore/SKILL.md`, `workspace/skills/scada-object-explore/SEARCH-PATTERNS.md`

**Details:**

- replace the current frontmatter description with a shorter triggering description centered on:
  - this is the main skill for exploring SCADA objects
  - this skill can also read current fields across the matched scope
  - use it for finding matching objects in a real folder/scope and reading requested fields across the matched set
- keep workflow branches such as `types_info` and `ecomet_read` out of the frontmatter description; document those in routing pseudocode and the body instead
- keep the instruction "do not answer real existence/type questions from KB memory alone" in the body guidance, not in the frontmatter description
- remove wording that implies a separate enrichment/read phase exists for projected fields
- remove wording that tells the model to switch to `ecomet_read` merely because there are more than 10 results
- add guidance that requests for all matching objects or all current values should keep paging with `offset` rather than switching to `ecomet_read`
- extend the routing pseudocode so it explicitly covers:
  - schema-first questions -> `PROJECT_KB` for semantics + `types_info` for live types/fields/indexes -> continue
  - known exact paths + current/configuration read -> `ecomet_read`
  - discovery / scope search -> `searchObjects(...)`-equivalent skill path
- make `SKILL.md` body document canonical params in a clear dedicated section:
  - what each param means
  - how each param changes the search
  - a couple of the most useful working `skill_run({...})` examples
- include a short workflow/checklist section in the main `SKILL.md` body
- include an explicit feedback-loops section in the main `SKILL.md` body that covers:
  - invalid params or rejected calls -> fix params and retry `skill_run`
  - unknown types/fields/semantics -> consult `PROJECT_KB` and/or call `types_info`, then reformulate the search/read
  - exact paths become known during the workflow -> continue with `ecomet_read` when the remaining task is a known-path current read
  - partial page for an `all matching objects` / `all current values` request -> continue with increasing `offset` until the requested scope is covered
- keep only a short index of the more detailed search/use patterns in `SEARCH-PATTERNS.md`
- move most usage recipes and example payloads into `SEARCH-PATTERNS.md`
- describe text search as substring search across specified fields, not as `.fp_path`-only capability
- use `select` in docs/examples for projected fields and remove `read_fields` from the docs entirely
- rewrite examples and pseudocode so they use abstract field language such as:
  - current field
  - quality field
  - timestamp field
  - state field
  - configuration field
- explicitly tell the reader to use `types_info` for field/index discovery and use `PROJECT_KB` for available field families and field semantics
- avoid hardcoded `out_value` / `out_qds` examples in the main skill docs

### Step 4: Update Verification To Match The New Behavior

**Goal:** Replace the old broad-enrichment skip expectation, remove inline pattern-index metadata expectations, and add coverage for the IndexRegistry tool surface.

**Files:** `workspace/extensions/ecomet-connector/__tests__/unit/direct-skills-validation.test.ts`, `workspace/extensions/ecomet-connector/__tests__/integration/direct-skills-validation.test.ts`, `workspace/extensions/ecomet-connector/__tests__/integration/direct-skills-m1.test.ts`, `workspace/libs/ecomet-core/__tests__/unit/index-registry.test.ts`, `workspace/libs/ecomet-core/src/skills/__eval__/m1-fixtures.ts`

**Details:**

- add direct tool tests for `types_info`
- add or update helper tests for the new IndexRegistry exports
- update tool-surface tests so `ecomet_indexes` is no longer described as fallback-only
- add assertions that the search-driven branch remains capability-equivalent to `searchObjects(...)`
- remove or rewrite tests that expect broad projected-field requests to be skipped
- add assertions that broad projected-field requests still produce a single search query and do not trigger `readObjects`
- add assertions that projected fields appear in `objects[].fields` for all returned rows on the page
- add coverage that canonical `searchText` + `searchIn` supports multi-field text search
- add assertions that removed `read_fields` is rejected before side effects
- add direct tool/output assertions that `types_info` returns explicit `"invalid field"` and `"invalid type"` markers for requested unknown fields/types
- add assertions that pagination partiality is still computed from search totals, not from removed enrichment rules
- remove or rewrite tests that expect legacy alias support or noncanonical search shapes
- remove or rewrite tests that expect `include_pattern_indexes` / `includePatternsSummary` support or `metadata.pattern_indexes`
- update limit tests to the new default/max behavior
- add validation coverage that legacy aliases and removed search shapes are rejected before side effects
- add coverage that the canonical `searchText` path still works with the documented default search field behavior
- if the source eval catalog has a committed generated counterpart, keep it in sync with repository conventions

## Domain And Semantic Dependencies

- The skill exposes requested fields but does not define their project meaning.
- The search-driven branch should stay capability-equivalent to `searchObjects(...)`.
- The skill workflow may call `types_info` when the caller needs type, field, or index discovery before continuing.
- Before using `fields` with unknown field names, call `types_info` first.
- If projected field choices are unknown, call `types_info` for available fields and `PROJECT_KB` for their meaning. Use `ecomet_indexes` only for narrow single-pattern detail lookup.
- `PROJECT_KB/structure/project-model.md` is must-read for this skill.
- Skill docs must point to `PROJECT_KB` for project-specific field families and semantics.
- Use `PROJECT_KB/structure/project-model.md` and `PROJECT_KB/structure/field-boundaries.md` when describing available field families.
- Use `PROJECT_KB/semantics/*` only to explain that some field meaning is project-specific, not to hardcode those meanings into the skill runtime.

## Definition of Done

- [ ] `ecomet_indexes` is still present and its description is no longer marked as fallback-only
- [ ] new direct tool `types_info` is added around `IndexRegistry`
- [ ] `types_info('*')` returns all known types and all their fields
- [ ] `types_info({ "<type>": "*" })` returns all fields for the requested type
- [ ] `types_info({ "<type>": ["field_a", "field_b"] })` returns index arrays for the matching fields on that type
- [ ] `types_info` returns `"invalid field"` for explicitly requested missing fields
- [ ] `types_info` returns `"invalid type"` for explicitly requested unknown types
- [ ] `types_info` index names use `simple`, `3gram`, and `datetime`
- [ ] `workspace/skills/scada-object-explore/index.js` no longer imports or calls `readObjects`
- [ ] `workspace/skills/scada-object-explore/index.js` no longer imports or calls `getPatternIndexes`
- [ ] projected fields no longer have a 10-object cap
- [ ] `include_pattern_indexes` / `includePatternsSummary` are removed from this skill's public surface
- [ ] `read_fields` is removed from this skill's public surface
- [ ] legacy aliases and noncanonical public search shapes are removed from this skill's public surface
- [ ] the canonical public params are `folder`, `pattern`, `fields`, `searchText`, `searchIn`, `recursive`, `select`, `limit`, and `offset`
- [ ] the search-driven branch remains capability-equivalent to `searchObjects(...)`
- [ ] the effective search projection is the deduped union of `select` and mandatory core fields
- [ ] the search-driven path executes one `searchObjects(...)` call for a normal request
- [ ] `scope_view` output shape stays compatible with the existing `ViewModelContract`
- [ ] enrichment-specific warnings and completeness branches are removed
- [ ] `metadata.pattern_indexes` is no longer produced by this skill
- [ ] default limit is `1000` and max limit is `10000`
- [ ] skill docs are shorter and clearly position `scada-object-explore` as the workflow owner for search, schema-first exploration, and current reads
- [ ] the YAML `description` is trigger-oriented and does not inline workflow branching details
- [ ] skill docs explicitly show the workflow branches for `types_info` and `ecomet_read`
- [ ] skill docs explicitly explain the `searchObjects(...)`-equivalent branch
- [ ] skill docs document only canonical params and keep detailed recipes in `SEARCH-PATTERNS.md`
- [ ] the main `SKILL.md` body includes workflow, canonical param descriptions, a short checklist, and only a couple of representative examples
- [ ] the main `SKILL.md` body includes explicit feedback-loop guidance for validation correction, schema-first refinement, known-path continuation, and paging continuation
- [ ] the instruction not to answer real existence/type questions from KB memory alone is kept in the body guidance, not the YAML `description`
- [ ] skill docs explicitly say field semantics belong to `PROJECT_KB`
- [ ] skill docs explicitly say that "all matching objects" / "all current values" requests must page across offsets until the requested scope is covered
- [ ] skill docs explicitly mark `PROJECT_KB/structure/project-model.md` as must-read
- [ ] automated tests and eval fixtures reflect the new broad-projection behavior

## Testing Strategy

- Unit-test the new `types_info` helper/tool behavior for:
  - top-level `'*'`
  - `'*'`
  - selected field lists
  - explicit `"invalid type"` markers
  - explicit `"invalid field"` markers
  - fields with no indexes
- Unit-test parameter normalization, select-only projection behavior, wrapper-to-search mapping, and removed enrichment behavior.
- Unit-test removal of `include_pattern_indexes` / `includePatternsSummary`.
- Unit-test rejection of removed `read_fields`.
- Unit-test rejection of legacy aliases and noncanonical public search shapes.
- Integration-test broad projected-field requests to prove they stay on the search path and keep `scope_view` output stable.
- Integration-test the canonical `searchText` + `searchIn` path.
- Integration-test new default/max limit behavior.
- Verify that broad projected-field requests do not introduce extra read calls or extra warnings.
- Verify the refactored skill docs include explicit feedback-loop guidance for correction/retry, schema-first continuation, known-path continuation, and paged continuation.
- Verify runtime guidance uses `types_info` for schema-first questions and `ecomet_read` for known-path current reads inside this skill workflow.
- Verify runtime guidance pages across offsets when the user asks for all matching objects or all current values in a scope.
