## Input Contract

Canonical accepted inputs:

```ts
type SearchFieldValue = string | number | boolean;

interface ScadaObjectExploreParams {
  folder?: string;
  pattern?: string | string[];
  recursive?: boolean;
  fields?: Record<string, SearchFieldValue>;
  searchText?: string;
  searchIn?: string[];
  select?: string[];
  limit?: number;
  offset?: number;
}
```

Required behavior:

- at least one search condition must be present:
  - `folder`
  - `pattern`
  - `fields`
  - `searchText`
- `searchText` is the canonical substring-search input for the wrapper
- `searchIn` is the canonical optional list of fields to search in; when omitted, the wrapper may default to `['.fp_path']`
- the search-driven branch must stay capability-equivalent to `searchObjects(...)`, preserving the current folder/pattern/fields/text/select/limit/offset search semantics
- `select` is the only projection mechanism on the public skill surface
- `limit` defaults to `1000` and clamps to `10000`
- legacy aliases and noncanonical public search shapes must be rejected with clear validation errors before side effects:
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
  - `read_fields`
  - structured `search`
  - flat `text`
- the search-module params do not expose field/index discovery directly; the workflow uses `types_info` when discovery is needed
- if field names or indexability are unknown, the caller must use `types_info` first and `PROJECT_KB` for semantics; reserve `ecomet_indexes` for narrow single-pattern detail lookup

## IndexRegistry Tool Contracts

### Existing Tool: `ecomet_indexes`

Keep the tool request/response shape as-is:

```ts
interface EcometIndexesParams {
  pattern: string;
}

interface EcometIndexesResult {
  pattern: string;
  fields: Record<string, {
    simple: boolean;
    trigram: boolean;
    datetime: boolean;
  }>;
}
```

Required behavior:

- keep the name `ecomet_indexes`
- keep the current single-pattern request shape
- keep the current boolean response shape
- update the tool description so it is not marked as `FALLBACK TOOL`

### New Tool: `types_info`

Add a new direct tool around `IndexRegistry`.

Request contract:

```ts
type TypesInfoRequest = '*' | Record<string, '*' | string[]>;
```

Examples:

```json
"*"
```

Meaning: all known types, all fields.

```json
{
  "/root/FP/prototypes/telemetry/fields": "*"
}
```

Meaning: all fields for the telemetry type.

```json
{
  "/root/FP/prototypes/type-a/fields": ["state", "quality"],
  "/root/FP/prototypes/type-b/fields": ["title"]
}
```

Meaning: only the requested fields for the requested types.

Response contract:

```ts
type IndexName = 'simple' | '3gram' | 'datetime';

type TypesInfoFieldResult = IndexName[] | 'invalid field';
type TypesInfoTypeResult = Record<string, TypesInfoFieldResult> | 'invalid type';
type TypesInfoResult = Record<string, TypesInfoTypeResult>;
```

Rules:

- top-level `'*'` means: return all known types and all their fields
- `'*'` means: return all fields for that type
- `string[]` means: return every requested field key for that type, using either an index-name array or `"invalid field"`
- response arrays contain the available index names for that known field
- fields that exist but have no indexes return `[]`
- explicitly requested missing fields must be returned as `"invalid field"`
- explicitly requested unknown types must be returned as `"invalid type"`
- include system fields when returning all fields for a type, consistent with current `IndexRegistry` behavior
- do not wrap the response in extra metadata unless a blocker is found

JSON Schema guidance for the connector tool:

```ts
{
  oneOf: [
    { type: 'string', enum: ['*'] },
    {
      type: 'object',
      additionalProperties: {
        oneOf: [
          { type: 'string', enum: ['*'] },
          {
            type: 'array',
            items: { type: 'string' }
          }
        ]
      }
    }
  ]
}
```

## Effective Search Contract

The runtime must derive:

```ts
interface EffectiveSearchCall {
  folder?: string;
  pattern?: string | string[];
  recursive: boolean;
  fields?: Record<string, SearchFieldValue>;
  search?: {
    text: string;
    in: string[];
  };
  select: string[];
  limit: number;
  offset: number;
}
```

`select` must be the deduped union of:

- caller `select`
- mandatory core fields:
  - `.fp_path`
  - `.pattern`

Rules:

- when `searchText` is provided, the internal search call must use `search: { text, in }`
- when `searchIn` is omitted, the wrapper may default `in` to `['.fp_path']`
- `select` is the real projection mechanism for the search-driven branch
- `limit` greater than `10000` must clamp to `10000`
- one normal skill execution must perform one `searchObjects(...)` call

Capability-level paging rule:

- one execution returns one search page determined by `limit` and `offset`
- when the caller explicitly asks for all matching objects or all current values, the skill workflow must repeat executions with increasing `offset` until the answer covers the requested scope or a caller stop condition is reached

## Output Contract

The refactor must preserve the public artifact family:

```ts
interface ScopeEntry {
  path: string;
  name?: string;
  pattern?: string;
  fields?: Record<string, unknown>;
}

interface ScopeBlock {
  block_kind: 'scope';
  objects: ScopeEntry[];
  total: number;
  type_summary?: Record<string, number>;
}

interface ScopeViewModel {
  kind: 'scope_view';
  blocks: [ScopeBlock];
  warnings: Array<{
    severity: 'info' | 'warning' | 'error';
    message: string;
    code?: string;
    context?: Record<string, unknown>;
  }>;
  provenance: {
    source_skill: 'scada-object-explore';
    scope: string;
    period_from: number;
    period_to: number;
    timezone: string;
    produced_at: number;
  };
  completeness: {
    status: 'complete' | 'partial';
    reason?: string;
    total_available?: number;
    total_returned?: number;
    continuation_hint?: string;
  };
  metadata?: {
    search_total: number;
    search_returned: number;
  };
}
```

`objects[].fields` must contain every non-core projected field that came back from the search row:

- include selected config fields
- include selected runtime fields
- exclude the core fields already surfaced as top-level entry properties:
  - `.fp_path`
  - `.name`
  - `.pattern`

Keep the current behavior of leaving `.folder` and any other projected non-core fields inside `fields`.

## Contract Conformance

Compatibility requirements:

- keep `kind: "scope_view"`
- keep one `scope` block
- keep `type_summary`
- keep `metadata.search_total` and `metadata.search_returned`
- keep `missing_fp_path` warning semantics unchanged
- keep forwarded search warnings, wrapped as `search_warning`
- keep `limit_clamped` warning semantics unchanged

Behavior that must be removed:

- `enrichment_skipped`
- `enrichment_missing`
- completeness partiality caused only by read-enrichment limits
- `include_pattern_indexes`
- `includePatternsSummary`
- `metadata.pattern_indexes`

## Warning, Partiality, And Audit Contract

Warnings that may remain:

- forwarded search warnings as `code: "search_warning"`
- `limit_clamped`
- `missing_fp_path`

Warnings that must not appear after the refactor:

- `enrichment_skipped`
- `enrichment_missing`

Partiality rules:

- `partial` is valid when `searchResult.total > objects.length`
- `partial` is not valid merely because projected fields are broad or runtime-oriented
- `metadata.search_total`, `metadata.search_returned`, and `completeness.total_available` must remain sufficient to drive follow-up page requests for exhaustive scope reads
- broad scope reads must not redirect to `ecomet_read` merely because more than one page is required

Audit/provenance rules:

- preserve `source_skill: "scada-object-explore"`
- preserve same-timestamp `period_from`, `period_to`, and `produced_at`
- preserve timezone behavior unless another task changes the shared contract

## Error Contract

Examples of validation failures that must remain clear and side-effect free:

- missing search conditions
- noncanonical public search forms such as `search` or `text`
- malformed canonical `searchIn`
- legacy aliases such as `scope_folder` or `includeChildren`
- removed params such as `read_fields`, `include_pattern_indexes`, or `includePatternsSummary`
- unexpected top-level keys

Example failure text requirements:

- mention the invalid parameter
- stay generic about field names
- keep the retry/help style already used by the current implementation where practical

Tool validation requirements:

- `types_info` must reject params that are neither the exact string `'*'` nor an object
- `types_info` must reject non-string / non-array values for a type key
- `types_info` must reject arrays containing empty or non-string field names
- `types_info` must reject wildcard forms other than the exact string `'*'`

## Example Input

```json
{
  "folder": "/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220",
  "pattern": "/root/FP/prototypes/telemetry/fields",
  "searchText": "L2831",
  "searchIn": [".fp_path", "title"],
  "select": [".name", "title", "state", "position"],
  "limit": 250
}
```

Expected effective projection:

```json
[
  ".name",
  "title",
  "state",
  "position",
  ".fp_path",
  ".pattern"
]
```

Order does not need to match this literal example as long as the set is deduped and contains all required fields.

## Example Output

```json
{
  "kind": "scope_view",
  "blocks": [
    {
      "block_kind": "scope",
      "objects": [
        {
          "path": "/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L2831/cb",
          "name": "cb",
          "pattern": "/root/FP/prototypes/circuit_breaker/fields",
          "fields": {
            "title": "Breaker L2831",
            "state": 1,
            "position": "closed"
          }
        }
      ],
      "total": 1,
      "type_summary": {
        "/root/FP/prototypes/circuit_breaker/fields": 1
      }
    }
  ],
  "warnings": [],
  "provenance": {
    "source_skill": "scada-object-explore",
    "scope": "/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220",
    "period_from": 1760000000000,
    "period_to": 1760000000000,
    "timezone": "UTC",
    "produced_at": 1760000000000
  },
  "completeness": {
    "status": "complete"
  },
  "metadata": {
    "search_total": 1,
    "search_returned": 1
  }
}
```

## Example `types_info` Input

```json
"*"
```

## Example `types_info` Output

```json
{
  "/root/FP/prototypes/type-a/fields": {
    ".fp_path": ["simple", "3gram"],
    ".name": ["simple", "3gram"],
    ".pattern": ["simple"],
    ".folder": ["simple"],
    "title": ["simple", "3gram"]
  }
}
```
