## Routing Fixtures

### RF-1: Scope-wide current read routes to scada-object-explore

**User intent:** "Show the current state fields for all matching objects of this type under this station."
**Expected skill:** `scada-object-explore`
**NOT:** direct known-path `ecomet_read` usage because the paths are not known yet and the request is scope-wide.
**Rationale:** This is the primary direct skill for discovery plus current/config reads across a scope.

### RF-2: Known exact paths stay under scada-object-explore workflow and use ecomet_read

**User intent:** "Read the current fields for these exact object paths."
**Expected skill:** `scada-object-explore`
**Expected application boundary:** direct `ecomet_read` tool
**NOT:** search-driven discovery because discovery is unnecessary once the paths are already known.
**Rationale:** The skill should own the workflow but switch to `ecomet_read` internally for the known-path branch.

### RF-3: Schema-first exploration stays under scada-object-explore workflow and uses types_info

**User intent:** "What fields does this pattern have, and which of them are indexed?"
**Expected skill:** `scada-object-explore`
**Expected application boundary:** `types_info`
**NOT:** jumping straight to search-driven object reads when field/indexability is unknown.
**Rationale:** The skill should own schema-aided exploration by using `PROJECT_KB` for semantics and `types_info` for live availability before proceeding.

### RF-4: Historical request does not route to scada-object-explore

**User intent:** "Show the trend for this point over the last six hours."
**Expected skill:** `scada-point-history`
**NOT:** `scada-object-explore` because this task is only about present-state scope reads and discovery.
**Rationale:** The refactor must not blur current-value scope reads with history workflows.

## Runtime Verification Fixtures

### RV-1: Scope-wide current read selects and applies scada-object-explore

**Prompt or trigger:** "Find all matching objects of this type under this station and show their current state fields."
**Expected selection evidence:** `openclaw skills info scada-object-explore --json` shows the refactored concise description and the runtime trace shows either a `skill_run` call naming `scada-object-explore` or the first observable execution path unique to its search-driven scope read.
**Expected application evidence:** one observable search-driven path consistent with `scada-object-explore`, and final output consistent with `scope_view` containing object rows and requested fields.
**NOT evidence:** an initial `ecomet_read`-first path.
**Pass rule:** runtime shows the scope-read path via `scada-object-explore` rather than a known-path raw read.

### RV-2: Known-path current read does not over-select scada-object-explore

**Prompt or trigger:** "Read the current fields for these exact object paths."
**Expected selection evidence:** runtime follows the known-path branch documented by `scada-object-explore`.
**Expected application evidence:** a direct `ecomet_read` tool call is observed and no initial search-driven path is used.
**NOT evidence:** `searchObjects(...)` being used first for a request that already contains exact paths.
**Pass rule:** the refactored workflow uses `ecomet_read` internally without losing `scada-object-explore` as the workflow owner.

### RV-3: Schema-first question uses types_info before continuing

**Prompt or trigger:** "What fields does this type have, and which of them are indexed?"
**Expected selection evidence:** runtime follows the schema-first branch documented by `scada-object-explore`.
**Expected application evidence:** `types_info` is observed before any search-driven object read.
**NOT evidence:** a KB-only answer or a raw search-driven read before field/type discovery.
**Pass rule:** runtime behavior matches the new schema-first workflow guidance.

### RV-4: All-matches scope read pages until the requested scope is covered

**Prompt or trigger:** "Find all matching objects of this type under this station and show their current state fields."
**Expected selection evidence:** runtime starts with `scada-object-explore`, not `ecomet_read`.
**Expected application evidence:** if the first page is partial, runtime continues with increasing `offset` until the requested all-match answer is covered or proves that one page was sufficient.
**NOT evidence:** stopping after the first partial page for an "all" request, or rerouting to `ecomet_read` because the scope is broad.
**Pass rule:** runtime behavior matches the new paging guidance for exhaustive scope reads.

## Output Fixtures

### OF-0: types_info returns full registry view on empty request

**Input:** `types_info('*')`
**Expected output shape:** object keyed by type path
**Key assertions:**

- returns all known types from the registry snapshot
- each returned type contains its field map
- field values are arrays of index names

### OF-1: Canonical searchText plus searchIn drives multi-field text search

**Input:** `skill_run({ skill: "scada-object-explore", folder: "/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220", searchText: "L2831", searchIn: [".name", "title"], limit: 5 })`
**Expected output shape:** `scope_view`
**Key assertions:**

- the request is accepted without legacy alias forms
- the internal search path uses generic multi-field text-search semantics
- the query condition reflects OR-like matching across the requested fields
- the output remains a normal `scope_view`

### OF-2: Broad projected-field request stays on one search path

**Input:** `skill_run({ skill: "scada-object-explore", folder: "/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220", limit: 18, select: [".name", "state"] })`
**Expected output shape:** `scope_view`
**Key assertions:**

- only one search-style query is issued
- no `readObjects(...)` call occurs
- no `enrichment_skipped` warning appears
- returned rows include `state` in `objects[].fields` for all objects on the page
- `completeness` depends only on search pagination totals

### OF-3: types_info returns explicit invalid markers for unknown requested fields and types

**Input:** `types_info({ "/root/FP/prototypes/type-a/fields": ["state", "missing_field"], "/root/FP/prototypes/missing/fields": "*" })`
**Expected output shape:** object keyed by type path
**Key assertions:**

- known requested fields return index arrays
- explicitly missing requested fields return `"invalid field"`
- explicitly unknown requested types return `"invalid type"`

### OF-4: types_info supports mixed `'*'` and explicit field lists

**Input:** `types_info({ "/root/FP/prototypes/type-a/fields": ["state", "quality"], "/root/FP/prototypes/type-b/fields": "*" })`
**Expected output shape:** object keyed by type path
**Key assertions:**

- type-a returns entries for the requested fields only
- type-b returns all fields for that type
- existing but unindexed fields return `[]`
- index names are `simple`, `3gram`, and/or `datetime`

### OF-5: First-page metadata supports follow-up paging for exhaustive scope reads

**Input:** `skill_run({ skill: "scada-object-explore", folder: "/root/FP/PROJECT/UNIT_1", limit: 1000, offset: 0 })`
**Expected output shape:** `scope_view`
**Key assertions:**

- when more than one page exists, `completeness.status` is `partial`
- `metadata.search_total` is greater than `metadata.search_returned`
- `completeness.total_available` and `completeness.total_returned` are present for a partial page
- the returned metadata is sufficient to drive the next paged call with a larger `offset`

## Edge Case Fixtures

### EF-1: Oversized limit still clamps

**Scenario:** Caller asks for more than the supported maximum.
**Input:** `skill_run({ skill: "scada-object-explore", folder: "/root/FP/PROJECT/UNIT_1", limit: 20000 })`
**Expected behavior:** clamp to `10000`, emit `limit_clamped`, and return normal `scope_view`.
**Anti-pattern:** silently honoring unsupported page size.

### EF-2: Broad projected-field requests no longer trigger synthetic partiality

**Scenario:** More than 10 rows are returned while projected fields are requested.
**Input:** `skill_run({ skill: "scada-object-explore", folder: "/root/FP/PROJECT/UNIT_1", limit: 18, select: [".name", "state"] })`
**Expected behavior:** no skip warning, no enrichment-only `partial`, one search path, and normal field projection.
**Anti-pattern:** preserving the removed broad-enrichment guardrail behavior.

### EF-3: Malformed canonical searchIn still fails before side effects

**Scenario:** `searchIn` is not a non-empty string array.
**Input:** `skill_run({ skill: "scada-object-explore", folder: "/root/FP/PROJECT/UNIT_1", searchText: "L2431", searchIn: ".name" })`
**Expected behavior:** validation failure before any query is executed.
**Anti-pattern:** coercing malformed canonical text-search fields or issuing a query first.

### EF-4: Noncanonical structured search is rejected

**Scenario:** Caller sends the removed structured search shape.
**Input:** `skill_run({ skill: "scada-object-explore", search: { text: "L2431", in: [".name"], bogus: true } })`
**Expected behavior:** validation failure before side effects because canonical public params use `searchText` and `searchIn`.
**Anti-pattern:** silently continuing to support removed alternate search shapes.

### EF-5: Legacy aliases are rejected

**Scenario:** Caller still sends a live-retry alias such as `scope_folder` or `includeChildren`.
**Input:** `skill_run({ skill: "scada-object-explore", scope_folder: "/root/FP/PROJECT/UNIT_1", includeChildren: true })`
**Expected behavior:** validation failure before side effects because canonical params only are supported.
**Anti-pattern:** silently preserving legacy alias compatibility.

### EF-6: Removed read_fields is rejected

**Scenario:** Caller still sends the removed projection alias.
**Input:** `skill_run({ skill: "scada-object-explore", folder: "/root/FP/PROJECT/UNIT_1", read_fields: ["state"] })`
**Expected behavior:** validation failure before side effects, telling the caller to use `select`.
**Anti-pattern:** silently preserving `read_fields` compatibility.

### EF-7: Removed pattern-index params are rejected

**Scenario:** Caller still sends the removed inline pattern-index metadata params.
**Input:** `skill_run({ skill: "scada-object-explore", folder: "/root/FP/PROJECT/UNIT_1", include_pattern_indexes: true })`
**Expected behavior:** validation failure before side effects, directing field/index introspection to `types_info`.
**Anti-pattern:** silently preserving the removed inline pattern-index feature.

### EF-8: types_info rejects malformed request values

**Scenario:** Caller sends invalid wildcard/value shapes.
**Input:** `types_info({ "/root/FP/prototypes/telemetry/fields": 123 })`
**Expected behavior:** validation failure before side effects.
**Anti-pattern:** silently coercing invalid tool params.
