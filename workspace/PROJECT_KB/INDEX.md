# Project KB

This folder is the curated agent-facing knowledge base for the live project.

It includes only project-specific knowledge that the OpenClaw agent needs for interpretation:

- project hierarchy and path shapes
- scope layout and voltage-level organization
- prototype families and reusable connection templates
- field-family boundaries
- project field semantics

It intentionally excludes:

- query syntax and operator rules
- raw API reference material
- search/index/performance guidance
- workflow recipes and query examples

Those topics belong to the Layer 1 tools and the development-side references under the repo-root `KNOWLEDGE_BASE/`.

## Start Here

1. `structure/project-model.md`
2. `structure/connection-templates.md`
3. `structure/field-boundaries.md`
4. the relevant file under `semantics/`

## Included Docs

### Structure

- `structure/project-model.md`
- `structure/connection-templates.md`
- `structure/field-boundaries.md`

### Semantics

- `semantics/state-codes.md`
- `semantics/qds-codes.md`
- `semantics/value-source-selection.md`
- `semantics/alarm-categories.md`
- `semantics/maintenance-fields.md`

## Use This Folder For

- resolving what kinds of objects and folders exist in the live project
- understanding prototype and template families in this project
- deciding which fields are live operational meaning versus static/configuration meaning
- interpreting state, quality, source-selection, alarm, and maintenance fields

## Do Not Use This Folder For

- writing raw Ecomet queries
- choosing LIKE operators or index strategy
- query optimization
- generic SCADA platform behavior that is already encoded in tools

## Source Material Compiled Into This Folder

- `KNOWLEDGE_BASE/ELECTRICITY-GRID/project-structure.md`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/patterns/connection-blocks.md`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/architecture/static-vs-dynamic-fields.md`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/fields-to-ignore.md`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/integrations/powerfactory.md`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/GRAPH-MODEL-ANALYSIS_comments.md`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/semantics/state-codes.md`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/semantics/qds-codes.md`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/semantics/value-source-selection.md`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/semantics/alarm-categories.md`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/semantics/maintenance-fields.md`

## Source Material Excluded On Purpose

- `KNOWLEDGE_BASE/CORE/*`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/query-workflow.md`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/query-performance-guide.md`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/ecomet-api-reference.md`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/ecomet-like-operator.md`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/ecomet-field-indexes.md`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/ecomet-advanced-query-patterns.md`
- `KNOWLEDGE_BASE/ELECTRICITY-GRID/query-examples/combined-queries.md`
- raw graph artifacts
