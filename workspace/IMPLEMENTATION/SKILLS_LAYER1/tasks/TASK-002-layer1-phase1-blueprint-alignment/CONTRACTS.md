## Input Contract

The developer works from the current implemented repo state and must use:

- `IMPLEMENTATION/SKILLS_LAYER1/LAYER1-SKILLS-VISION.md`
- `IMPLEMENTATION/SKILLS_LAYER1/LAYER1-SKILLS-IMPLEMENTATION-PLAN.md`
- installed skills under `workspace/skills/`
- eval catalogs under `workspace/libs/ecomet-core/src/skills/__eval__/`
- `workspace/AGENTS.md`
- `workspace/PROJECT_KB/INDEX.md`

## Output Contract

For each in-scope skill step, the output must explicitly cover four things:

1. what is already done
2. what needs refactoring
3. what to do
4. what not to do

The package itself already defines those four parts skill by skill in `SKILL.md`. Implementation must follow that shape.

## Skill-By-Skill Deliverable Contract

| Skill | Files | Must do | Must not do |
| --- | --- | --- | --- |
| `scada-object-explore` | `SKILL.md`, `SEARCH-PATTERNS.md` | preserve benchmark, add `Contents` if needed, fix only residual drift | no redesign, no new params |
| `scada-point-history` | `SKILL.md`, `TAG-PATTERNS.md` | clarify routing, time contract, invalid or unresolved outcomes, checklist | no new param shapes, no raw-tool-first framing |
| `scada-point-snapshot` | `SKILL.md`, `TAG-PATTERNS.md` | clarify exact-time boundary, timezone, invalid or unresolved outcomes, checklist | no broadening into history or current-value reads |
| `scada-period-aggregates` | `SKILL.md`, `AGGREGATE-PATTERNS.md` | clarify aggregate boundary, semantics, chaining, checklist | no new functions, no behavior drift into history |
| `scada-archive-coverage` | `SKILL.md` | clarify archive-coverage ownership and outcomes, checklist | no expansion into data retrieval |
| `scada-alarm-list` | `SKILL.md`, `ALARM-PATTERNS.md` | clarify row boundary, paging, partiality, 30-day split, checklist | no KPI or summary behavior |
| `scada-data-quality` | `SKILL.md` | clarify conservative fact-first boundary and composition, checklist | no speculative diagnosis |
| `scada-alarm-summary` | `SKILL.md`, `SUMMARY-PATTERNS.md` | clarify current standalone surface, later-phase context, add `Contents` if needed, checklist | no pretending delegated artifact path already exists |
| `report-spreadsheet-export` | `SKILL.md`, `EXPORT-PATTERNS.md` | keep downstream-only export boundary explicit, checklist | no data fetching, no fake renderer role |

## Non-Skill Deliverable Contract

| Surface | Must do | Must not do |
| --- | --- | --- |
| eval catalogs | remove `scada-current-scope`, remove `report-chat-markdown`, keep current surfaces explicit | do not keep stale names for convenience |
| `PROJECT_KB/INDEX.md` | point to repo-root `KNOWLEDGE_BASE/...` | do not leave `workspace/KNOWLEDGE_BASE/...` |
| `AGENTS.md` | document `main` as current implementation of blueprint `main-supervisor` | do not rename runtime `main` |

## Verification Contract

- run fixture unit tests
- run focused changed tests
- run representative runtime verification for the four selected skills
- record `pass`, `fail`, or `not runtime-verified`

Do not claim success from documentation edits alone.

## Error Contract

These are non-pass outcomes:

- any in-scope skill doc is updated without making the requested boundary clearer
- active eval catalogs still mention `scada-current-scope`
- active eval catalogs still mention `report-chat-markdown`
- `PROJECT_KB/INDEX.md` still points to `workspace/KNOWLEDGE_BASE/...`
- `AGENTS.md` still leaves `main` vs `main-supervisor` implicit
- later-phase work is pulled into this task
