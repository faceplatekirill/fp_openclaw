# Skill: layer1-phase1-blueprint-alignment

**Status:** Draft
**Capability Type:** other
**Execution Model:** orchestrated
**Owner:** Existing Layer 1 skill surface
**Delegates To:** none
**Dependencies:** `IMPLEMENTATION/SKILLS_LAYER1/LAYER1-SKILLS-VISION.md`, `IMPLEMENTATION/SKILLS_LAYER1/LAYER1-SKILLS-IMPLEMENTATION-PLAN.md`, existing installed skills under `workspace/skills/`, eval catalogs under `workspace/libs/ecomet-core/src/skills/__eval__/`, and control docs under `workspace/AGENTS.md` and `workspace/PROJECT_KB/INDEX.md`

## Purpose

This package is for Phase 1 only: tighten the already-implemented Layer 1 skills so the docs, fixtures, and control docs match the real current surface. Keep it narrow. Do not expand into later phases.

## In Scope

- existing installed skill docs that still need cleanup
- small companion-doc cleanup
- eval-catalog cleanup
- control-doc cleanup for `PROJECT_KB` paths and `main` vs `main-supervisor`
- representative verification of the existing skill surface

## Out Of Scope

- `project_kb_query`
- new specialist agents
- new workflow skills
- artifact-family redesign
- runtime workspace-boundary changes
- renaming runtime id `main`

## Global Rules

- Preserve the implemented skills and their names.
- Prefer doc and fixture alignment over runtime-code changes.
- Only change runtime behavior if a doc fix exposes a real mismatch that blocks Phase 1.
- Use `scada-object-explore` as the benchmark, not as the main rewrite target.
- Keep each skill task small and explicit.

## Step 1: `scada-object-explore`

**Files:** `workspace/skills/scada-object-explore/SKILL.md`, `workspace/skills/scada-object-explore/SEARCH-PATTERNS.md`

**Already done**

- This is the strongest current skill doc.
- It already has routing logic, KB boundary guidance, feedback loops, a checklist, and companion patterns.

**Needs refactoring**

- Only small cleanup should happen here.
- `SEARCH-PATTERNS.md` is long and should get a short `Contents` section if it stays over 100 lines.
- Fix wording only if it still drifts from the current runtime.

**Do**

- Keep this file as the benchmark for the other skills.
- Add `Contents` to `SEARCH-PATTERNS.md` if needed.
- Keep the current workflow shape and current-scope ownership.

**Do not do**

- Do not redesign this skill again.
- Do not add new parameters.
- Do not turn this step into a new feature task.

## Step 2: `scada-point-history`

**Files:** `workspace/skills/scada-point-history/SKILL.md`, `workspace/skills/scada-point-history/TAG-PATTERNS.md`

**Already done**

- The skill is implemented.
- Basic routing, one call example, and tag patterns already exist.

**Needs refactoring**

- The doc is thinner than `scada-object-explore`.
- Shared time-contract expectations are not explicit enough.
- Invalid and unresolved outcomes should be easier to notice.
- Final review discipline is missing.

**Do**

- Make route-here and route-elsewhere boundaries explicit.
- Add the shared time-contract guidance in concise form.
- Make invalid and unresolved outcomes explicit in the doc.
- Keep `format: "json"` for chaining and `chat` for final output.
- Add a short final checklist.

**Do not do**

- Do not add new parameter shapes.
- Do not push raw-tool fallback as the main path.
- Do not change the implemented contract unless a real mismatch is found.

## Step 3: `scada-point-snapshot`

**Files:** `workspace/skills/scada-point-snapshot/SKILL.md`, `workspace/skills/scada-point-snapshot/TAG-PATTERNS.md`

**Already done**

- The skill is implemented.
- The doc already separates snapshot from current-value and trend usage.

**Needs refactoring**

- The doc is still thin.
- Exact-time contract, invalid or unresolved outcomes, and final review discipline should be clearer.

**Do**

- Tighten route-here vs history vs current-read boundaries.
- Clarify exact-time and timezone expectations.
- Make invalid and unresolved outcomes explicit.
- Keep chaining guidance explicit.
- Add a short final checklist.

**Do not do**

- Do not broaden this into history or current-value behavior.
- Do not add new public params.
- Do not rewrite the tag companion unnecessarily.

## Step 4: `scada-period-aggregates`

**Files:** `workspace/skills/scada-period-aggregates/SKILL.md`, `workspace/skills/scada-period-aggregates/AGGREGATE-PATTERNS.md`

**Already done**

- The skill is implemented.
- Aggregate routing and bucket examples already exist.

**Needs refactoring**

- Aggregate semantics should be more explicit.
- Shared time-contract and chaining boundaries should be clearer.
- Final review discipline is missing.

**Do**

- Clarify route-here vs history vs snapshot boundaries.
- State aggregate semantics in concise form: bucketing, functions, and chaining for "peak and when".
- Keep `format: "json"` chaining guidance explicit.
- Add a short final checklist.

**Do not do**

- Do not add new aggregate functions.
- Do not move bucket logic into prose-only reasoning.
- Do not change runtime behavior unless needed to match the documented current surface.

## Step 5: `scada-archive-coverage`

**Files:** `workspace/skills/scada-archive-coverage/SKILL.md`

**Already done**

- The skill is implemented.
- The doc already positions it as the archive-existence check.

**Needs refactoring**

- The doc is thin.
- Boundary versus history, snapshot, and aggregates can be clearer.
- Final review discipline is missing.

**Do**

- Make archive-coverage ownership explicit.
- Clarify how archived, unarchived, and invalid outcomes are surfaced.
- Add a short final checklist.

**Do not do**

- Do not turn this into a data-retrieval skill.
- Do not add unrelated archive-analysis features.

## Step 6: `scada-alarm-list`

**Files:** `workspace/skills/scada-alarm-list/SKILL.md`, `workspace/skills/scada-alarm-list/ALARM-PATTERNS.md`

**Already done**

- The skill is implemented.
- Raw alarm-row retrieval, filtering, and paging are already in place.

**Needs refactoring**

- The row-versus-analytics boundary should be clearer.
- Pagination and completeness rules should be more explicit.
- Long-range 30-day split behavior should be documented more clearly.
- Final review discipline is missing.

**Do**

- Tighten route-here vs `scada-alarm-summary` boundary.
- State pagination, partiality, and continuation rules clearly.
- Document long-range split behavior clearly.
- Add a short final checklist.

**Do not do**

- Do not blur this into KPI or summary behavior.
- Do not document stale renderer surfaces.
- Do not add new analytics behavior here.

## Step 7: `scada-data-quality`

**Files:** `workspace/skills/scada-data-quality/SKILL.md`

**Already done**

- The skill is implemented.
- It already frames the capability as freshness, gaps, and suspicious-signal checks.

**Needs refactoring**

- The conservative fact-first boundary should be sharper.
- The doc is thinner than the benchmark.
- Final review discipline is missing.

**Do**

- Keep the doc conservative: facts first, interpretation second.
- Clarify route-here vs plain history and archive-coverage boundaries.
- Keep current-read plus archive plus recent-history composition explicit.
- Add a short final checklist.

**Do not do**

- Do not turn this into speculative fault diagnosis.
- Do not imply project semantics are invented if KB support is missing.

## Step 8: `scada-alarm-summary`

**Files:** `workspace/skills/scada-alarm-summary/SKILL.md`, `workspace/skills/scada-alarm-summary/SUMMARY-PATTERNS.md`

**Already done**

- The skill is implemented.
- The doc is stronger than most of the direct skills.
- Companion patterns already exist.

**Needs refactoring**

- The current standalone surface should be stated clearly.
- The doc should not drift into later-phase delegated-artifact behavior as if it already exists.
- `SUMMARY-PATTERNS.md` is long and should get `Contents` if it stays over 100 lines.

**Do**

- Keep the current KPI and analytics boundary explicit.
- Clarify that the skill is implemented and usable now as a standalone surface.
- Mention delegated artifact-return behavior only as later-phase context, not current behavior.
- Add `Contents` to `SUMMARY-PATTERNS.md` if needed.
- Add a short final checklist.

**Do not do**

- Do not rewrite this as if `alarm-analyst` delegation is already the only execution path.
- Do not blur it into raw alarm-row retrieval.

## Step 9: `report-spreadsheet-export`

**Files:** `workspace/skills/report-spreadsheet-export/SKILL.md`, `workspace/skills/report-spreadsheet-export/EXPORT-PATTERNS.md`

**Already done**

- The skill is implemented.
- The doc already frames it as export of an existing ViewModel.

**Needs refactoring**

- The downstream-only boundary should be even clearer.
- Final review discipline is missing.

**Do**

- Keep the skill strictly presentation or export only.
- Make the required JSON handoff from the upstream data skill explicit.
- Add a short final checklist.

**Do not do**

- Do not document it as a fake chat renderer.
- Do not let it fetch SCADA data directly.

## Step 10: Eval Catalog Cleanup

**Files:** `workspace/libs/ecomet-core/src/skills/__eval__/m0-fixtures.ts`, `workspace/libs/ecomet-core/src/skills/__eval__/m1-fixtures.ts`, `workspace/libs/ecomet-core/src/skills/__eval__/m2-fixtures.ts`, and fixture tests if needed

**Already done**

- The catalogs and fixture tests already exist.
- Structural fixture tests already pass.

**Needs refactoring**

- Active catalogs still reference stale surfaces:
  - `scada-current-scope`
  - `report-chat-markdown`

**Do**

- Replace current-scope references with `scada-object-explore`.
- Remove `report-chat-markdown` from active catalogs.
- Express chat rendering as behavior, not as a fake skill id.
- Update fixture tests if ids or counts must change.

**Do not do**

- Do not invent new fixture families.
- Do not keep stale names just to preserve old wording.

## Step 11: Control-Doc Cleanup

**Files:** `workspace/PROJECT_KB/INDEX.md`, `workspace/AGENTS.md`

**Already done**

- Both docs already exist and are usable.

**Needs refactoring**

- `PROJECT_KB/INDEX.md` still points to `workspace/KNOWLEDGE_BASE/...`
- `AGENTS.md` does not explicitly map runtime `main` to blueprint `main-supervisor`

**Do**

- Fix KB source paths to repo-root `KNOWLEDGE_BASE/...`
- Add the explicit `main` vs `main-supervisor` note

**Do not do**

- Do not rename runtime id `main`
- Do not turn `TOOLS.md` into the authoritative tool registry

## Step 12: Verification

**Files:** `REPORT.md`, `REVIEW.md`, `RUNTIME-VERIFICATION.md`

**Already done**

- The repo already has unit tests for fixture catalogs.
- The repo already has a runtime-verification guide.

**Needs refactoring**

- Verification for this task should stay narrow and representative.

**Do**

- Run fixture unit tests.
- Run focused tests touched by the refactor.
- Run representative runtime verification for:
  - `scada-object-explore`
  - `scada-point-history`
  - `scada-alarm-list`
  - `scada-alarm-summary`
- Record pass, fail, or not runtime-verified explicitly.

**Do not do**

- Do not expand verification to later-phase capabilities.
- Do not claim pass from final answer text alone.

## Definition Of Done

- [ ] Each in-scope skill step is completed with the requested narrow cleanup only
- [ ] `scada-object-explore` remains the benchmark
- [ ] Long companion docs in scope have `Contents`
- [ ] Active eval catalogs contain no `scada-current-scope`
- [ ] Active eval catalogs contain no `report-chat-markdown`
- [ ] `PROJECT_KB/INDEX.md` points to repo-root `KNOWLEDGE_BASE/...`
- [ ] `AGENTS.md` documents `main` vs `main-supervisor`
- [ ] Updated tests pass
- [ ] Representative runtime verification is recorded clearly
- [ ] No later-phase work is pulled into this task
