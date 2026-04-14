# Grid Knowledge Base - Layered Index

Read this file first for any grid-related task.

## Knowledge Layers

### `CORE/` (Common SCADA + Ecomet)
Use for universal querying/access rules and platform behavior.

Key docs:
- `CORE/ecomet-api-reference.md`
- `CORE/ecomet-archives.md`
- `CORE/ecomet-points-snapshot.md`
- `CORE/ecomet-tag-archive-resolution.md`
- `CORE/ecomet-like-operator.md`
- `CORE/ecomet-field-indexes.md`
- `CORE/ecomet-advanced-query-patterns.md`
- `CORE/fp-archive-get-aggregates.md`
- `CORE/query-performance-guide.md`
- `CORE/semantics/datetime-handling.md`
- `CORE/semantics/timestamps.md`

### `ELECTRICITY-GRID/` (Domain-Specific Power Grid)
Use for power-grid semantics, topology behavior, and operational analysis.

Key docs:
- `ELECTRICITY-GRID/ecomet-api-reference.md`
- `ELECTRICITY-GRID/ecomet-like-operator.md`
- `ELECTRICITY-GRID/ecomet-field-indexes.md`
- `ELECTRICITY-GRID/ecomet-advanced-query-patterns.md`
- `ELECTRICITY-GRID/query-performance-guide.md`
- `ELECTRICITY-GRID/project-structure.md`
- `ELECTRICITY-GRID/query-workflow.md`
- `ELECTRICITY-GRID/architecture/static-vs-dynamic-fields.md`
- `ELECTRICITY-GRID/semantics/state-codes.md`
- `ELECTRICITY-GRID/semantics/qds-codes.md`
- `ELECTRICITY-GRID/semantics/value-source-selection.md`
- `ELECTRICITY-GRID/semantics/maintenance-fields.md`
- `ELECTRICITY-GRID/semantics/alarm-categories.md`
- `ELECTRICITY-GRID/patterns/connection-blocks.md`
- `ELECTRICITY-GRID/query-examples/combined-queries.md`
- `ELECTRICITY-GRID/fields-to-ignore.md`
- `ELECTRICITY-GRID/graph.json`
- `ELECTRICITY-GRID/GRAPH-MODEL-ANALYSIS_comments.md`

## Mandatory Reading (Operational Queries)
1. `CORE/ecomet-api-reference.md`
2. `CORE/ecomet-like-operator.md`
3. `CORE/ecomet-field-indexes.md`
4. `ELECTRICITY-GRID/ecomet-api-reference.md`
5. `ELECTRICITY-GRID/ecomet-like-operator.md`
6. `ELECTRICITY-GRID/ecomet-field-indexes.md`
7. `ELECTRICITY-GRID/query-performance-guide.md`
8. `ELECTRICITY-GRID/query-workflow.md`
9. `ELECTRICITY-GRID/architecture/static-vs-dynamic-fields.md`
10. `ELECTRICITY-GRID/semantics/state-codes.md`
11. `ELECTRICITY-GRID/semantics/qds-codes.md`

## Quick Lookup
- How to query Ecomet API correctly: `CORE/ecomet-api-reference.md`
- How to query timeseries archives: `CORE/ecomet-archives.md`
- How to get aggregates (avg/min/max/integral): `CORE/fp-archive-get-aggregates.md`
- How to get timestamp snapshot: `CORE/ecomet-points-snapshot.md`
- How to resolve object-field -> archive: `CORE/ecomet-tag-archive-resolution.md`
- Grid API usage rules: `ELECTRICITY-GRID/ecomet-api-reference.md`
- LIKE behavior: `CORE/ecomet-like-operator.md`
- Grid LIKE patterns: `ELECTRICITY-GRID/ecomet-like-operator.md`
- Indexed fields and operators: `CORE/ecomet-field-indexes.md`
- Grid field indexes: `ELECTRICITY-GRID/ecomet-field-indexes.md`
- General query performance: `CORE/query-performance-guide.md`
- Grid query performance: `ELECTRICITY-GRID/query-performance-guide.md`
- Date/time query patterns: `CORE/semantics/datetime-handling.md`
- Timestamp interpretation: `CORE/semantics/timestamps.md`
- Grid-specific workflow: `ELECTRICITY-GRID/query-workflow.md`
- State interpretation (`state_connection`, `state_graph`): `ELECTRICITY-GRID/semantics/state-codes.md`
- Quality interpretation (QDS): `ELECTRICITY-GRID/semantics/qds-codes.md`
- Value source logic (`out_value`): `ELECTRICITY-GRID/semantics/value-source-selection.md`
- Field exclusions: `ELECTRICITY-GRID/fields-to-ignore.md`

## Decision Rule
- If it applies to any Ecomet-based system: use `CORE/`.
- If it depends on power-grid topology/semantics/prototypes: use `ELECTRICITY-GRID/`.
