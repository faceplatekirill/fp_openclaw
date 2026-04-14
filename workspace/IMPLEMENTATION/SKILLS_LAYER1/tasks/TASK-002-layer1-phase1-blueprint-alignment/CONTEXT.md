# Context: Layer 1 Phase 1 blueprint alignment

## What Is Already Implemented

The repo already has the core Layer 1 surface:

- direct skills under `workspace/skills/`
- `scada-alarm-summary`
- `report-spreadsheet-export`
- eval catalogs under `workspace/libs/ecomet-core/src/skills/__eval__/`
- fixture unit tests for those catalogs
- control docs under `workspace/AGENTS.md` and `workspace/PROJECT_KB/INDEX.md`

This task is not for building new skills. It is for tightening what already exists.

## Why These Exact Skills Are In Scope

| Skill | Current state | Why it is in scope |
| --- | --- | --- |
| `scada-object-explore` | strongest current doc | keep as benchmark, only small cleanup |
| `scada-point-history` | implemented, doc thin | needs clearer routing and contract wording |
| `scada-point-snapshot` | implemented, doc thin | needs clearer exact-time boundary wording |
| `scada-period-aggregates` | implemented, doc thin | needs clearer aggregate semantics wording |
| `scada-archive-coverage` | implemented, doc thin | needs clearer ownership wording |
| `scada-alarm-list` | implemented | needs clearer row boundary and completeness wording |
| `scada-data-quality` | implemented | needs clearer conservative fact-first wording |
| `scada-alarm-summary` | implemented, doc stronger | needs current-surface vs later-phase wording cleanup |
| `report-spreadsheet-export` | implemented | needs clearer downstream-only wording |

## Non-Skill Surfaces In Scope

| Surface | Current state | Why it is in scope |
| --- | --- | --- |
| eval catalogs | structurally tested, semantically stale | still contain `scada-current-scope` and `report-chat-markdown` |
| `PROJECT_KB/INDEX.md` | usable but stale source paths | still points to `workspace/KNOWLEDGE_BASE/...` |
| `AGENTS.md` | strong general doc | missing explicit `main` vs `main-supervisor` note |

## What This Task Must Not Drift Into

- `project_kb_query`
- new specialist agents
- shared-skill topology changes
- completeness-status redesign
- new workflow skills
- runtime rename of `main`

## Verification Boundary

Keep verification representative, not exhaustive. For this task, verify the current implemented surface:

- `scada-object-explore`
- `scada-point-history`
- `scada-alarm-list`
- `scada-alarm-summary`
