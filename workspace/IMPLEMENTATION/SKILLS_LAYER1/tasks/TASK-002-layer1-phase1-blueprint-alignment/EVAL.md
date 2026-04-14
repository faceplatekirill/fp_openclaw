## Per-Skill Acceptance Checks

### AC-1: `scada-object-explore`

- benchmark structure is preserved
- `SEARCH-PATTERNS.md` has `Contents` if it remains over 100 lines
- no redesign or feature expansion

### AC-2: `scada-point-history`

- route-here and route-elsewhere boundaries are clearer
- shared time contract is stated
- invalid or unresolved outcomes are explicit
- final checklist exists

### AC-3: `scada-point-snapshot`

- exact-time boundary is clearer
- timezone expectation is explicit
- invalid or unresolved outcomes are explicit
- final checklist exists

### AC-4: `scada-period-aggregates`

- aggregate boundary is clearer
- semantics and chaining guidance are explicit
- final checklist exists

### AC-5: `scada-archive-coverage`

- archive-coverage ownership is clearer
- archived, unarchived, and invalid outcomes are explicit
- final checklist exists

### AC-6: `scada-alarm-list`

- row-versus-analytics boundary is clearer
- pagination and partiality rules are explicit
- 30-day split behavior is explicit
- final checklist exists

### AC-7: `scada-data-quality`

- conservative fact-first wording is explicit
- boundary versus plain history and coverage is clearer
- final checklist exists

### AC-8: `scada-alarm-summary`

- current standalone surface is explicit
- later-phase delegated context is not described as current behavior
- `SUMMARY-PATTERNS.md` has `Contents` if it remains over 100 lines
- final checklist exists

### AC-9: `report-spreadsheet-export`

- downstream-only export boundary is explicit
- JSON handoff requirement is explicit
- final checklist exists

## Global Acceptance Checks

### AC-10: Eval catalogs

- no `scada-current-scope` in active eval catalogs
- no `report-chat-markdown` in active eval catalogs

### AC-11: Control docs

- `workspace/PROJECT_KB/INDEX.md` points to repo-root `KNOWLEDGE_BASE/...`
- `workspace/AGENTS.md` explicitly maps `main` to blueprint `main-supervisor`

### AC-12: Tests

- fixture unit tests pass
- focused changed tests pass

### AC-13: Runtime verification

- representative verification is recorded for:
  - `scada-object-explore`
  - `scada-point-history`
  - `scada-alarm-list`
  - `scada-alarm-summary`
- verdicts are explicit: `pass`, `fail`, or `not runtime-verified`
