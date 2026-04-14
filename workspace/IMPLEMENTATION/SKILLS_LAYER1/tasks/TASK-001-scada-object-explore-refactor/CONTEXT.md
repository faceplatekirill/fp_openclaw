# Context: scada-object-explore refactor

## Runtime Context

`scada-object-explore` is a direct module-backed skill under `workspace/skills/scada-object-explore/`. It is invoked through `skill_run` and returns a typed `ViewModelContract` with `kind: "scope_view"`.

Conceptually, the search-driven branch of this skill is a wrapper around `searchObjects(...)`, with a raw-tool surface that exposes the same search shape through `ecomet_search`.

The current module imports from `workspace/libs/ecomet-core/dist/index.js` and uses:

- `searchObjects`
- `readObjects`
- `getPatternIndexes`

The adjacent tool surface currently includes:

- `ecomet_indexes`
  - narrow single-pattern index introspection
  - currently misdescribed as a fallback even though there is no wrapping skill

This task removes the skill-local need for `readObjects` and `getPatternIndexes`, removes `read_fields` from the public skill surface, keeps `ecomet_indexes` as-is except for its description, and adds a broader `types_info` tool around `IndexRegistry` with explicit invalid markers for unknown requested types or fields.

## Current Implementation Reality

The current code does the following:

- validates search params, legacy aliases, and alternate search shapes
- builds a search config
- calls `searchObjects(...)`
- if `read_fields` was requested:
  - limits read enrichment to `10` returned objects
  - otherwise calls `readObjects(...)` with returned paths
  - emits `enrichment_skipped` or `enrichment_missing`
- if `include_pattern_indexes` was requested:
  - resolves a single pattern
  - calls `getPatternIndexes(...)`
  - emits `metadata.pattern_indexes`
- maps search rows plus optional read rows into `scope_view`

The current validation surface is broader than the desired public contract. It accepts legacy alias forms such as `name_contains`, `include_descendants`, `include_fields`, `scope_folder`, `includeChildren`, `maxObjects`, and `includePatternsSummary`, plus alternate search shapes such as structured `search` and flat `text`.

This behavior conflicts with the user's requested direction and with the Layer 1 vision: `searchObjects(...)` already supports arbitrary `select`, so this skill does not need a second read phase just to expose additional fields on the matched objects.

## Tool And Library Boundaries

### Keep

- `searchObjects(...)`
  - canonical search helper for folder/pattern/field/text filtering
  - already supports caller-defined `select`
  - supports substring search across one or more caller-specified fields via `search: { text, in }`
  - automatically ensures `.fp_path` is present
- `ecomet_indexes`
  - adjacent raw-tool boundary for pattern/field/index introspection
  - should stay narrow and keep its current single-pattern API
  - should no longer be labeled as fallback-only
- `types_info`
  - new adjacent raw-tool boundary around `IndexRegistry`
  - should answer:
    - what types exist
    - what fields type/types have
    - what indexes are available for requested type-field pairs
  - should return explicit `"invalid field"` and `"invalid type"` markers for requested unknown fields/types instead of silently omitting them

### Remove From This Skill's Execution Path

- `readObjects(...)`
  - valid library/helper in general
  - still valid behind `ecomet_read`
  - no longer needed inside `scada-object-explore` once projected field reads are expressed only through `select`
- `getPatternIndexes(...)`
  - valid library/helper in general
  - should no longer be surfaced through `scada-object-explore`
  - field/index introspection belongs to the adjacent index-introspection boundary instead

### Preserve As Adjacent Boundary

- `ecomet_read`
  - direct known-path read tool
  - should be called by this skill workflow when the object paths are already known and discovery is unnecessary
- `ecomet_indexes`
  - separate schema/index introspection boundary
  - should be consulted for narrow single-pattern detail lookup
- `types_info`
  - broader schema/index introspection boundary
  - should be called by this skill workflow when type lists, field lists, or type-field indexability are unknown
- `PROJECT_KB`
  - separate semantics source for field meaning
  - should be consulted when the caller does not know what a discovered field means

## Routing Context

The authoritative Layer 1 vision describes `scada-object-explore` as the canonical direct skill for:

- object discovery
- scope understanding and current-state questions about what exists in a folder/area and what values should be read
- scope-wide current/config reads across matching objects
- current/config scope reads with an explicit field set, including requests that may require paging across multiple result pages when the user asks for all matches

The same vision describes `ecomet_read` as the narrower known-path read boundary and `ecomet_indexes` as the pattern/field/index introspection boundary. This task extends that boundary with a broader `types_info` tool built on the same registry.

The current `workspace/skills/scada-object-explore/SKILL.md` already has a known-path `ecomet_read` branch in its pseudocode. This refactor extends that workflow to cover schema-first `types_info` usage as well, while narrowing the search-module contract itself to canonical wrapper params around `searchObjects(...)`.

## Workflow And Data Flow After Refactor

1. Agent-facing workflow:
   - if the user asks for the current state of a scope, keep the request in `scada-object-explore`; this workflow can discover what the scope contains, determine relevant types/fields, use `PROJECT_KB` for semantics, and read the needed values
   - if the user asks schema-first questions or field choices are unknown, consult `PROJECT_KB` for semantics and call `types_info` for live types/fields/indexes first
   - if the user already knows exact paths and wants current/configuration reads, call `ecomet_read`
   - otherwise use the search-driven `scada-object-explore` module path, which wraps `searchObjects(...)`
2. Search-module execution path:
   - validate canonical params only
   - translate canonical `searchText` + optional `searchIn` into the internal `searchObjects(...)` text-search form
   - if `searchIn` is omitted, default it to `[".fp_path"]`
   - compute the effective `select` as caller `select` + mandatory core fields `.fp_path`, `.pattern`
   - execute one `searchObjects(...)` call
   - map each returned row into `scope_view`

Per execution, the module still returns one page. When the caller needs all matching objects or all current values across a broad scope, the skill workflow must repeat paged executions with increasing `offset` until enough rows have been collected.

The refactored skill docs should present this as an explicit feedback-loop workflow, not as a one-pass description only:

- validation fails -> correct canonical params and retry
- schema/semantic uncertainty -> consult `PROJECT_KB` and/or `types_info`, then continue
- exact paths become known -> switch the remaining current-read portion to `ecomet_read`
- partial page on an exhaustive scope request -> continue with increasing `offset`

## Constraints

- Intentionally narrow the public input surface rather than preserving the current broad compatibility layer.
- Narrow the public input surface to canonical params only:
  - `folder`
  - `pattern`
  - `fields`
  - `searchText`
  - `searchIn`
  - `recursive`
  - `select`
  - `limit`
  - `offset`
- Remove `read_fields` from the public skill surface; projected fields must be expressed only through `select`.
- Remove legacy alias compatibility and alternate public search shapes from the search module.
- Keep the search-driven branch capability-equivalent to `searchObjects(...)`; do not invent extra query features in the skill layer.
- Keep the existing `scope_view` contract stable.
- Change the skill-specific paging defaults to `default=1000` and `max=10000`.
- Keep one `searchObjects(...)` call per execution; exhaustive scope reads must be achieved by paging across executions rather than by reintroducing read enrichment or internal recursive search loops.
- Do not change `workspace/libs/ecomet-core/src/search/object-search.ts` unless a true blocker is discovered. The task assumes the current `select` support is sufficient.
- Do not broaden `ecomet_read` in this task.
- Change `ecomet_indexes` description so it is not marked as fallback-only.
- Add `types_info` as a direct raw tool; do not add a wrapping skill in this task.
- Make `types_info` return explicit invalid markers for unknown requested types/fields instead of omitting them.
- Do not implement field/index introspection inside the search module; the skill workflow may call `types_info` / `ecomet_indexes` as adjacent steps.
- Keep the YAML `description` trigger-oriented for search/exploration/field-read tasks; keep workflow branching details in the body sections instead.
- Keep `SKILL.md` concise and canonical-only, make it explain the `searchObjects(...)`-equivalent branch, and move most search/use recipes into `SEARCH-PATTERNS.md`.
- Make the body include workflow guidance, canonical param descriptions, a short checklist, and only a couple of representative working examples.
- Make the body include explicit iterative feedback loops, not just one-pass routing prose.
- Do not add project-specific field semantics into the skill runtime. Documentation should point outward to `PROJECT_KB`.

## Adjacent Files Likely To Change

- `workspace/skills/scada-object-explore/index.js`
- `workspace/skills/scada-object-explore/SKILL.md`
- `workspace/skills/scada-object-explore/SEARCH-PATTERNS.md`
- `workspace/extensions/ecomet-connector/index.ts`
- `workspace/extensions/ecomet-connector/__tests__/unit/direct-skills-validation.test.ts`
- `workspace/extensions/ecomet-connector/__tests__/integration/direct-skills-validation.test.ts`
- `workspace/extensions/ecomet-connector/__tests__/integration/direct-skills-m1.test.ts`
- `workspace/libs/ecomet-core/src/query/index-registry.ts`
- `workspace/libs/ecomet-core/src/index.ts`
- `workspace/libs/ecomet-core/__tests__/unit/index-registry.test.ts`
- `workspace/libs/ecomet-core/src/skills/__eval__/m1-fixtures.ts`

## Out Of Scope

- changing unrelated raw Ecomet helper implementations outside the IndexRegistry/tool work described above
- adding new skill parameters
- changing the `ViewModelContract` type family
- introducing automatic KB lookups inside the skill runtime
- implementing a wrapping skill around `types_info` or `ecomet_indexes`
