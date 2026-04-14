# Sources: scada-object-explore refactor

## 1. Current skill module

**Path:** `workspace/skills/scada-object-explore/index.js`

**Relevant because:** This is the implementation being refactored.

**Key current facts:**

- imports `searchObjects`, `readObjects`, and `getPatternIndexes` from `workspace/libs/ecomet-core/dist/index.js`
- accepts multiple legacy alias forms and alternate public search shapes in addition to canonical params
- flat `searchText` / `text` currently defaults to searching `.name` when `searchIn` is omitted
- sets `ENRICHMENT_MAX_OBJECTS = 10`
- treats `read_fields` as a second execution phase after search
- exposes `include_pattern_indexes` and emits `metadata.pattern_indexes`
- emits `enrichment_skipped` and `enrichment_missing`
- computes completeness as `partial` when enrichment is skipped

## 2. Current skill docs

**Paths:**

- `workspace/skills/scada-object-explore/SKILL.md`
- `workspace/skills/scada-object-explore/SEARCH-PATTERNS.md`

**Relevant because:** These docs currently encode the outdated behavior and wording.

**Key current facts:**

- frontmatter description is longer than necessary
- description already frames this as the primary skill for finding paths
- routing pseudocode already uses `ecomet_read` for known exact paths
- routing pseudocode does not yet cover schema-first `types_info` usage
- docs do not yet explain that the search-driven branch is effectively a wrapper around `searchObjects(...)`
- docs still say `read_fields` is for `<= 10` results
- examples hardcode `out_value`, `out_qds`, and `out_ts`
- docs tell the reader to switch to `ecomet_read` when result sets are broad
- main `SKILL.md` still carries too much detailed usage payload content instead of acting as a concise entrypoint into `SEARCH-PATTERNS.md`
- docs still expose inline pattern-index metadata instead of sending index discovery to the dedicated index-introspection boundary

## 3. Search helper

**Path:** `workspace/libs/ecomet-core/src/search/object-search.ts`

**Relevant because:** This helper already supports the behavior the refactor needs.

**Key current facts:**

- accepts caller-provided `select`
- validates `select` as a non-empty field list
- auto-adds `.fp_path` when missing
- returns rows directly from one query
- already supports search by `pattern`, `folder`, `fields`, and structured text search
- structured text search supports:
  - `search.text`
  - `search.in` across one or more fields
  - OR-composition across requested fields
  - indexed `LIKE` when 3gram indexes exist
  - strict `:LIKE` plus warnings when 3gram indexes are absent

**Implementation consequence:** `scada-object-explore` does not need a second `readObjects(...)` phase merely to expose additional requested fields. The task can remove `read_fields` from the public skill surface, keep `select` as the only projection mechanism, and translate canonical `searchText` + `searchIn` into the helper's internal structured text-search form. If the refactor changes the default field used when `searchIn` is omitted, the docs, tests, and validation guidance must all be updated consistently.

## 4. Object reader

**Path:** `workspace/libs/ecomet-core/src/read/object-reader.ts`

**Relevant because:** This is the helper currently used for enrichment and the one being removed from this skill's path.

**Key current facts:**

- reads known object paths plus explicit field names
- returns a path-keyed map
- is still valid as the engine behind the raw known-path read tool `ecomet_read`

**Implementation consequence:** remove this dependency from `scada-object-explore`, but do not treat the library or raw tool as deprecated globally.

## 5. Raw tool boundary

**Path:** `workspace/extensions/ecomet-connector/index.ts`

**Relevant sections:**

- `ecomet_read` registration
- `ecomet_search` registration
- `ecomet_indexes` registration

**Relevant because:** The routing/task package must stay aligned with the real raw-tool surface.

**Key current facts:**

- `ecomet_read` is described as a fallback known-path read tool
- `ecomet_search` is described as a fallback discovery tool
- `ecomet_search` supports:
  - `pattern`
  - `folder`
  - `recursive`
  - `fields`
  - `search: { text, in }`
  - `select`
  - `limit`
  - `offset`
- `ecomet_search` requires `select`
- `ecomet_indexes` is already registered, but is currently described as a fallback pattern/field/index introspection tool even though there is no wrapping skill
- current `ecomet_indexes` request shape is only `{ pattern: string }`
- current `ecomet_indexes` result shape is only single-pattern detail

**Implementation consequence:** keep `ecomet_indexes` as-is functionally, remove the fallback framing, and add a new broader `types_info` tool for multi-type introspection. Also make `scada-object-explore` docs/wrapper align with `searchObjects(...)` and the same search feature set already exposed by the raw tool boundary.

## 6. Current IndexRegistry capabilities

**Path:** `workspace/libs/ecomet-core/src/query/index-registry.ts`

**Relevant because:** The new tool should be built on top of the existing registry rather than on fresh ad hoc queries.

**Key current facts:**

- `IndexRegistry.init()` loads all known pattern-field-index rows using one query
- `IndexRegistry.loadPattern(patternPath)` loads one pattern on demand
- the module already stores all loaded pattern and field index information in-memory
- `getPatternIndexes(...)` currently exposes only one narrow view of that registry

**Implementation consequence:** add exported helpers around `IndexRegistry` for:

- all known types
- all fields for one or more types
- index-name arrays for requested type-field combinations

These helpers should back the new `types_info` tool.

## 7. Layer 1 vision

**Path:** `IMPLEMENTATION/SKILLS_LAYER1/LAYER1-SKILLS-VISION.md`

**Relevant sections:**

- section `10.1 Narrow direct skills`
- subsection `scada-object-explore`
- section `11.1 Routing rules`
- section `12. Skill-to-Agent Routing Matrix`

**Relevant because:** This document is authoritative when implementation and target behavior disagree.

**Key current facts:**

- `scada-object-explore` is intended for discovery plus scope-wide current/config reads
- the vision explicitly says it should handle compact current-state summaries with an explicit field set
- `ecomet_read` is the narrower known-path boundary
- `ecomet_indexes` is the pattern/field/index introspection boundary

**Implementation consequence:** the skill workflow should handle schema-first questions via `types_info`, known-path reads via `ecomet_read`, and search-driven scope reads via the refactored direct module. The docs should also make it explicit that "all matching objects" requests continue by paging through `limit` / `offset`.

## 8. Current automated expectations that must change

**Paths:**

- `workspace/extensions/ecomet-connector/__tests__/integration/direct-skills-m1.test.ts`
- `workspace/libs/ecomet-core/src/skills/__eval__/m1-fixtures.ts`

**Relevant because:** These files currently encode the obsolete skip-broad-enrichment behavior.

**Key current facts:**

- integration test expects `enrichment_skipped`
- M1 edge fixture says broad `read_fields` should avoid bulk reads and skip enrichment

**Implementation consequence:** These fixtures must be replaced with one-query broad-projection expectations, and `read_fields` must become a removed rejected param rather than a transitional alias.

## 9. Current automated expectations for alias compatibility and removed pattern-index metadata

**Paths:**

- `workspace/extensions/ecomet-connector/__tests__/unit/direct-skills-validation.test.ts`
- `workspace/extensions/ecomet-connector/__tests__/integration/direct-skills-validation.test.ts`

**Relevant because:** These files currently encode legacy alias compatibility from observed live retries plus `includePatternsSummary` / `metadata.pattern_indexes` behavior that the revised task removes from this skill.

**Key current facts:**

- unit and integration coverage explicitly accept:
  - `name_contains`, `include_descendants`, and `include_fields` "from live retries"
  - `mode`, `includeValues`, and `groupByPattern` "from later live retries"
  - `includeChildren`, `maxObjects`, and `includePatternsSummary` "from newer live retries"
- unit coverage expects `includePatternsSummary` alias support
- integration coverage expects `payload.metadata?.pattern_indexes`

**Implementation consequence:** These fixtures must be removed or rewritten so the refactored public surface is canonical-only, legacy aliases are rejected, and inline pattern-index metadata stays removed.

## 10. Project KB entrypoint

**Path:** `PROJECT_KB/INDEX.md`

**Relevant because:** Skill docs should point here for project-specific field meaning.

**Key current facts:**

- `PROJECT_KB` is the curated project semantics corpus
- it is for object structure, field-family boundaries, and field semantics
- it is explicitly not for raw query syntax or tool behavior

## 11. Must-read project model reference

**Path:** `PROJECT_KB/structure/project-model.md`

**Relevant because:** This file should be treated as must-read for `scada-object-explore`.

**Key current facts:**

- defines the canonical role-based project path shape
- lists the important prototype families used in the live project
- lists the main field families by role
- explains where runtime fields may live: directly on the object, on telemetry children, or on optional nested state subtrees

**Implementation consequence:** skill docs and task guidance should explicitly mark this file as mandatory reading before using unfamiliar patterns, scopes, or field families.

## 12. Project field-family references

**Paths:**

- `PROJECT_KB/structure/project-model.md`
- `PROJECT_KB/structure/field-boundaries.md`
- `PROJECT_KB/semantics/qds-codes.md`

**Relevant because:** The refactored docs must stop pretending `out_value` / `out_qds` are universal defaults.

**Key current facts:**

- `project-model.md` lists important field families by role:
  - telemetry/value fields
  - quality fields
  - timestamps
  - state fields
  - connectivity fields
- `field-boundaries.md` distinguishes runtime/operational fields from configuration-oriented fields
- `qds-codes.md` shows that even "quality" meaning is project-specific and must be interpreted with the relevant value source and timestamp

**Implementation consequence:** main skill docs should use abstract field-family language, direct field/index discovery to `types_info` / `ecomet_indexes`, direct field semantics to `PROJECT_KB`, and clearly explain the canonical params with working examples.

## 13. External skill-authoring guidance

**Paths:**

- `https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview#skill-structure`
- `https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices`

**Relevant because:** The user's edits explicitly steer the task package toward this skill-structure guidance.

**Key current facts:**

- the YAML `description` is the main discovery/trigger surface for a skill
- the body should carry workflow details and supporting guidance
- complex skills benefit from a short checklist in the body
- feedback loops should be explicit when the skill requires iterative correction or continuation
- it is valid to keep only a small number of representative examples in the main skill file and point to deeper reference material elsewhere

**Implementation consequence:** the refactored main `SKILL.md` should keep the YAML `description` trigger-oriented, move workflow/detail into the body, include a short checklist, make iterative feedback loops explicit, and keep only a couple of representative examples while pointing to `SEARCH-PATTERNS.md` for the broader pattern index.
