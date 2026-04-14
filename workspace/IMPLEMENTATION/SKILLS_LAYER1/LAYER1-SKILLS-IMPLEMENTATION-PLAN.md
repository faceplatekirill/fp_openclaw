# Layer 1 Skills Implementation Plan

**Date:** 2026-03-30  
**Source blueprint:** `IMPLEMENTATION/SKILLS_LAYER1/LAYER1-SKILLS-VISION.md`  
**Basis of this plan:** direct inspection of `openclaw.json`, workspace control docs, installed skills, shared libraries, specialist workspaces, KB files, automated tests, and official OpenClaw docs for Agent Runtime, Multi-Agent Routing, and the `AGENTS.md` / `TOOLS.md` templates on 2026-03-30.

## 1. Goal

Move the repository from its current strong M0-M2 direct-skill foundation into the full Layer 1 target state described by the blueprint without rewriting or destabilizing the working deterministic core.

That means:

- keep the implemented direct skills as the base Layer 1 surface
- remove blueprint drift from docs, fixtures, and runtime assumptions
- add the missing shared semantics tool and delegated artifact family
- turn the specialist model from one prototype workspace into a complete, enforced supervisor-worker architecture
- build the missing delegated, orchestrated, and report workflow skills on top of those contracts

## 2. Current Repository Reality

## 2.1 What is already implemented

The repository is not greenfield. The following pieces already exist in code and are backed by tests:

- `workspace/extensions/ecomet-connector/index.ts`
  - registers `skill_run`
  - registers the raw SCADA tool surface already used by Layer 1:
    - `ecomet_api`
    - `ecomet_search`
    - `ecomet_indexes`
    - `types_info`
    - `ecomet_read`
    - `archive_resolve`
    - `field_read_history`
    - `field_snapshot`
    - `field_aggregates`
    - `alarm_query`
- `workspace/libs/skills-core/src/*`
  - `skill-runner.ts`
  - `chat-renderer.ts`
  - `time-resolver.ts`
  - `param-helpers.ts`
- `workspace/libs/ecomet-core/src/*`
  - narrow deterministic wrappers for search, read, archive resolution, history, snapshot, aggregates, alarms, and index discovery
  - shared `ViewModelContract` types
  - initial execution/delegation scaffolding
  - allowlist scaffolding in `subset-enforcer.ts`
- direct Layer 1 skills already installed under `workspace/skills/`
  - `scada-object-explore`
  - `scada-point-history`
  - `scada-point-snapshot`
  - `scada-period-aggregates`
  - `scada-archive-coverage`
  - `scada-alarm-list`
  - `scada-data-quality`
- additional implemented skills already beyond the direct baseline
  - `scada-alarm-summary`
  - `report-spreadsheet-export`
- one specialist prototype already exists
  - `workspace-alarm-analyst/`
  - runtime agent entry for `alarm-analyst` in `openclaw.json`
  - specialist-local `AGENTS.md`, `TOOLS.md`, and reduced `PROJECT_KB`
- the project knowledge corpus already exists on disk
  - curated runtime-facing KB under `workspace/PROJECT_KB/`
  - broader domain/dev corpus at repo root under `KNOWLEDGE_BASE/`
- automated verification already exists across the stack
  - `workspace/libs/skills-core/__tests__/unit/*`
  - `workspace/libs/ecomet-core/__tests__/unit/*`
  - `workspace/extensions/ecomet-connector/__tests__/unit/*`
  - `workspace/extensions/ecomet-connector/__tests__/integration/*`
  - routing/eval fixture catalogs under `workspace/libs/ecomet-core/src/skills/__eval__/`

## 2.2 Blueprint coverage status

| Area | Blueprint target | Current repo status | Notes |
|---|---|---|---|
| Raw SCADA tool surface | required | implemented | `ecomet-connector` already exposes the narrow raw tools and `skill_run` |
| Direct Layer 1 baseline | required | implemented | the blueprint direct catalog is already covered by `scada-object-explore`, history, snapshot, aggregates, coverage, alarm list, and data quality |
| `scada-alarm-summary` | delegated workflow skill with standalone path | partially implemented | deterministic summary core exists, but not the delegated `alarm_findings` return path |
| Presentation boundary | required | partially implemented | `skill_run(format: "chat")` and `report-spreadsheet-export` exist; artifact family is still ViewModel-only |
| Shared ViewModel contract | required | partially aligned | warnings/provenance/completeness exist, but completeness still uses `unknown` instead of blueprint `failed` |
| Specialist finding contract | required | missing | no `SpecialistFindingContract` family yet |
| Main supervisor control docs | required | covers current direct operation, multi-agent incomplete | `workspace/AGENTS.md` covers the main workspace role and direct-skill operating guidance; `workspace/TOOLS.md` matches the OpenClaw local-tool-notes role. The remaining gap is multi-agent delegation/routing guidance in `AGENTS.md` and any agent-local caveats that need to be documented in `TOOLS.md` |
| Specialist architecture | required | prototype only | only `alarm-analyst` exists today |
| Shared project knowledge tool | required | missing | no `project_kb_query` plugin or neighboring retrieval service |
| Delegated workflow layer | required | mostly missing | only alarm summary computation exists; structure/history delegated workflows are absent |
| Orchestrated workflow layer | required | missing | incident/snapshot/situation workflows do not exist |
| Report workflow layer | required | missing | alarm/production/availability/period-summary workflow skills do not exist |
| Shared-skill topology | preferred native sharing | prototype only | alarm specialist uses mirrored copies of shared skills |
| Runtime delegation policy | required | partially expressed | no explicit in-repo proof of specialist allowlists, depth policy, or sessions guidance |
| Runtime verification discipline | required | partially implemented | strong M0-M2 verification exists, but catalogs and docs are now partly behind the blueprint |

## 2.3 Control-Doc Direction For Multi-Agent Rollout

The current control-doc split already solves part of the blueprint target and should be extended for multi-agent use:

- `workspace/AGENTS.md` already carries the main workspace operating guidance
- `workspace/TOOLS.md` already matches the OpenClaw role of local tool notes rather than tool authority
- OpenClaw docs treat:
  - `AGENTS.md` as the operating-instructions file
  - `TOOLS.md` as user-maintained local tool notes
  - `TOOLS.md` as guidance only, not as the authority for which tools exist
- to meet the blueprint:
  - `AGENTS.md` must add the specialist roster, delegation rules, and artifact-return guidance needed for multi-agent operation
  - `TOOLS.md` should only capture workspace-local aliases, caveats, or environment-specific notes that are actually useful
- because delegated runs use reduced bootstrap context and specialist workspaces should remain understandable as standalone worker contexts, stable workspace-level role/boundary/output rules should live in `AGENTS.md` or the relevant `SKILL.md`

## 3. Blueprint Drift That Must Be Fixed Before Workflow Expansion

## 3.1 Runtime control plane and workspace boundaries are not explicit enough yet

Observed repository state:

- `openclaw.json` defines only `main` and `alarm-analyst`
- there are no `project-structure-specialist` or `history-analyst` agent entries
- there is no `project_kb_query` plugin loaded in `plugins.entries`
- the in-repo config does not express blueprint-level delegation policy such as:
  - intended specialist roster
  - allowed child targets
  - leaf-worker depth expectations
  - per-agent access to the future `project_kb_query` tool
- `workspace/libs/skills-core/src/skill-runner.ts` resolves skills from `agents.defaults.workspace` unless an explicit `workspaceDir` is passed
- `workspace/extensions/ecomet-connector/index.ts` calls `runSkill(...)` without an explicit per-agent workspace override

Impact:

- the code in this repo does not yet prove that separate agent workspaces actually resolve separate skill trees
- the current alarm specialist may be working because of runtime behavior outside the inspected in-repo code path, but that is not explicit enough for expansion
- more specialists should not be added until active-agent workspace resolution is explicit in code and covered by tests

## 3.2 Shared skills are still organized as a prototype, not as the blueprint steady state

Observed repository state:

- the main direct skills live under `workspace/skills/`
- the alarm specialist keeps mirrored copies of `scada-alarm-list` and `scada-alarm-summary`
- there is no `~/.openclaw/skills` or `skills.load.extraDirs` strategy encoded in `openclaw.json`
- there is no sync/generation step protecting mirrored copies from drift

Impact:

- the current duplication is acceptable for one prototype specialist
- it is not an acceptable default for two more specialists and a larger shared-skill catalog
- the shared-skill topology must be normalized to the blueprint default before specialist expansion

## 3.3 Artifact and delegation contracts are still below the blueprint target

Implemented now:

- `ViewModelContract`
- shared warnings/provenance/completeness envelope
- chat rendering and CSV export for renderable view models

Important gaps:

- `workspace/libs/ecomet-core/src/skills/view-model.ts` still defines completeness as:
  - `complete`
  - `partial`
  - `unknown`
- the blueprint requires:
  - `complete`
  - `partial`
  - `failed`
- there is no `SpecialistFindingContract`
- `ViewModelKind` and `SkillRegistration.output_kind` still assume a ViewModel-only world
- `workspace/libs/ecomet-core/src/skills/execution-contract.ts` is missing blueprint-level fields such as:
  - `task_brief.question`
  - `task_brief.constraints`
  - `task_brief.expected_output`
  - `delivery_mode`
  - `input_artifacts`
  - `raw_tool_subset`

Impact:

- delegated analyst workflows would currently have to invent ad hoc reply payloads
- owner-worker handoff rules are not yet representable in the shared types
- the current contract layer is strong enough for direct skills, but not yet for the blueprint delegated/orchestrated phases

## 3.4 Main workspace control docs, specialist docs, and skill docs are behind the blueprint

Observed repository state:

- `workspace/AGENTS.md` currently covers the main workspace role and direct-skill operating guidance, but it still needs the blueprint's multi-agent specialist roster, delegation contract, and artifact-return guidance
- `workspace/TOOLS.md` currently serves the OpenClaw local-notes role; if workspace-local aliases, caveats, or environment-specific notes become necessary, they should be added there instead of turning it into the authoritative tool surface
- the real multi-agent gap is therefore:
  - expanding `AGENTS.md` into the primary supervisor-worker control document
  - using `TOOLS.md` only for agent-local tool notes that are actually needed
- `workspace-alarm-analyst/AGENTS.md` and `workspace-alarm-analyst/TOOLS.md` are useful, but the specialist doc still needs to become the blueprint workspace charter for role, scope boundaries, default output contract, and stop behavior rather than a prototype note set
- implemented `SKILL.md` files are uneven
  - `scada-object-explore` is the strongest current exemplar because it combines live-vs-KB guardrails, explicit routing logic, recovery loops, canonical params, a workflow checklist, and linked sibling patterns
  - several other implemented skills are thinner wrappers with routing pseudocode plus a call example, but without the same level of guardrails, recovery behavior, or final review discipline
  - the blueprint should therefore align skills around the successful `scada-object-explore` pattern rather than around rigid heading uniformity alone
- the eval fixture catalogs still reference retired or non-blueprint surfaces such as:
  - `scada-current-scope`
  - `report-chat-markdown`

Impact:

- the prompt/control plane is no longer aligned with the real implementation target
- if left unchanged, the docs and fixtures will keep pulling development away from the blueprint

## 3.5 The KB corpus exists, but the runtime semantics interface does not

Observed repository state:

- `workspace/PROJECT_KB/**` is already curated and suitable as the primary project semantics corpus
- the broader domain/dev corpus exists at repo root under `KNOWLEDGE_BASE/**`
- `workspace/PROJECT_KB/INDEX.md` still points to `workspace/KNOWLEDGE_BASE/...` source paths even though the broader corpus currently lives at repo root
- there is still no `project_kb_query` tool or retrieval service

Impact:

- the content mostly exists already
- the missing work is packaging, retrieval, runtime tooling, metadata/citation discipline, and per-agent access policy

## 4. What Still Needs To Be Implemented From Scratch

These blueprint items are still genuinely absent from the runtime surface:

- `project_kb_query` plugin/tool
- neighboring retrieval service for the project KB
- `SpecialistFindingContract` family plus validators/helpers
- `project-structure-specialist`
- `history-analyst`
- `scada-structure-summary`
- `scada-history-analysis`
- `scada-incident-review`
- `scada-scope-snapshot`
- `scada-scope-situation`
- `scada-alarm-report`
- `scada-production-report`
- `scada-availability-report`
- `scada-period-summary`

## 5. Revised Implementation Strategy

## 5.1 Guiding decisions

The next implementation steps should follow these rules:

1. Keep the current deterministic direct skills as the stable base.
2. Fix control-plane drift and artifact-contract drift before multiplying workflow surfaces.
3. Treat skill names as the stable routing surface. Specialist personas are internal execution contexts, not the public capability names.
4. Make `project_kb_query` the steady-state semantics interface, while preserving direct KB file reads as an explicit fallback path.
5. Use the native OpenClaw multi-agent workspace model: per-agent `workspace` in `agents.list[]`, shared reusable skills in `~/.openclaw/skills`, and workspace-local `skills/` only for private workflow/orchestration behavior or deliberate overrides.
6. Extend the existing `scada-alarm-summary` computation core for delegated use instead of rewriting it.
7. Keep `AGENTS.md` as the primary multi-agent control plane and use `TOOLS.md` only for workspace-local tool notes; do not rebuild `TOOLS.md` into a second tool registry.
8. Update fixtures and workspace docs early so future work is measured against the blueprint, not against stale intermediate assumptions.

## 5.2 Phase order

Verification rule for all runtime-facing phases:

- each phase must include automated verification at the right layer
- each runtime-facing capability must pass static readiness checks in the real OpenClaw runtime
- each runtime-facing capability must meet the selection/application proof discipline in `IMPLEMENTATION/SKILLS_LAYER1/OPENCLAW-RUNTIME-VERIFICATION.md`
- completion requires observable execution evidence, not only a plausible final answer

## Phase 1: Align Existing Skills And Fixtures To The Blueprint

**Why first**

The repository already has real capability, but the implemented skill docs and eval fixtures are uneven. The existing skill surface should be aligned to the blueprint benchmark before new workflow layers are added.

**Deliverables**

- audit the existing implemented skills against that benchmark
- align the existing `SKILL.md` files toward the stronger pattern where needed:
  - clearer live-vs-KB guardrails
  - clearer routing/decision logic
  - clearer retry/recovery loops
  - clearer final checklist/review step
  - linked sibling pattern files where that keeps the entrypoint concise
- add or update automated tests for the existing implemented direct skills where alignment work changes expected routing, prompts, fixtures, or artifact shape
- run representative live verification for the aligned existing skills against the production SCADA system, following `IMPLEMENTATION/SKILLS_LAYER1/OPENCLAW-RUNTIME-VERIFICATION.md`
  - confirm static readiness
  - confirm runtime selection
  - confirm runtime application
  - prioritize `scada-object-explore` as the benchmark path, then cover other representative existing direct skills
- refresh eval fixtures under `workspace/libs/ecomet-core/src/skills/__eval__/` so they no longer reference:
  - `scada-current-scope`
  - `report-chat-markdown`
- replace those old references with blueprint-aligned expectations:
  - current scope summary through `scada-object-explore`
  - chat rendering through `skill_run(format: "chat")`
  - export through `report-spreadsheet-export`
- fix stale source-path references in `workspace/PROJECT_KB/INDEX.md`
- explicitly document whether runtime id `main` remains the implementation name for the blueprint role `main-supervisor`, or whether a safe rename is actually required later

**Exit criteria**

- the existing implemented skill docs align materially better with the blueprint benchmark
- automated verification covers the revised existing-skill expectations
- representative live verification has been run against the production system for the aligned existing skills
- no eval fixture contradicts the blueprint
- no plan document still targets `scada-current-scope`
- the prompt-facing skill docs describe the real current surface instead of an older intermediate design

## Phase 2: Prove And Enforce Runtime Workspace Boundaries And Shared-Skill Topology

**Why now**

The blueprint depends on different agents seeing different skill surfaces. That cannot remain implicit before more specialists are added.

**Deliverables**

- make `skill_run` resolve against the active agent's native `agents.list[].workspace`
- add automated tests that demonstrate different agents resolve different skill sets safely
- move or canonize shared reusable Layer 1 skills under `~/.openclaw/skills`
- reserve `<workspace>/skills` for workspace-private workflow/orchestration skills and deliberate overrides
- if mirrored specialist copies remain temporarily, generate/synchronize them from the canonical shared skill source and add drift checks
- update `openclaw.json` so the runtime registry expresses the intended supervisor-worker model clearly enough for future phases
- encode:
  - per-agent `workspace` and `agentDir`
  - specialist descriptions
  - intended child-target policy
  - leaf-worker expectations
  - future per-agent tool access for `project_kb_query`

**Exit criteria**

- active-agent workspace resolution is explicit and covered by tests
- the shared-skill topology follows the accepted blueprint default instead of an open design question
- the repo is ready to add more specialists without manual drift

## Phase 3: Normalize Shared Artifact And Delegation Contracts

**Why now**

Direct skills are already working, but the delegated/orchestrated layers need the correct artifact and handoff protocol before they can be built safely.

**Deliverables**

- revise completeness semantics from:
  - `complete`
  - `partial`
  - `unknown`
  to:
  - `complete`
  - `partial`
  - `failed`
- update the chat renderer and exporter for the revised completeness model
- implement `SpecialistFindingContract` for:
  - `alarm_findings`
  - `scope_findings`
  - `history_findings`
- add validators/helpers for both renderable artifacts and finding artifacts
- widen output typing so the shared type layer can represent both ViewModel artifacts and specialist findings
- extend `execution-contract.ts` to include blueprint-required fields such as:
  - `task_brief.question`
  - `task_brief.constraints`
  - `task_brief.expected_output`
  - `delivery_mode`
  - `input_artifacts`
  - `raw_tool_subset`
- update `skill_run`-facing docs and tests so machine-consumed JSON and final presentation boundaries are clearly separated

**Exit criteria**

- both artifact families exist as real code with tests
- no future delegated workflow needs to invent its own local payload schema
- the shared contract layer is blueprint-aligned enough to support owner-worker handoff

## Phase 4: Package The Project Semantics Layer As `project_kb_query`

**Why now**

The project KB content already exists. The missing work is the grounded retrieval tool that turns the corpus into the blueprint semantics interface.

**Deliverables**

- implement a neighboring retrieval service over `workspace/PROJECT_KB/**`
- ingest the KB by heading section with retrieval metadata such as:
  - `source_file`
  - `section_path`
  - `kb_group`
  - `concepts`
- optionally ingest selected repo-root `KNOWLEDGE_BASE/**` material as a secondary domain corpus
- implement the OpenClaw-facing `project_kb_query` tool/plugin returning at least:
  - `answer`
  - `sources`
  - `snippets`
  - `confidence`
  - `needs_clarification`
- update runtime config so `project_kb_query` is allowed for:
  - the main supervisor context
  - `alarm-analyst`
  - `project-structure-specialist`
  - `history-analyst`
- keep direct file reads from `PROJECT_KB` as the documented fallback when retrieval confidence is low or clarification is still required
- add automated tests for:
  - ingestion
  - retrieval behavior
  - plugin/service integration
  - low-confidence fallback behavior

**Exit criteria**

- semantics are available through a grounded tool, not only through manual file reads
- the fallback path is explicit and controlled

## Phase 5: Add The Missing Specialist Workspaces And Delegated Workflow Skills

**Why now**

Once workspace boundaries, contracts, and the semantics tool exist, the specialist architecture can expand from a single alarm prototype into the blueprint shape.

**Deliverables**

- add `workspace-project-structure-specialist/`
- add `workspace-history-analyst/`
- create runtime agent entries for both specialists
- keep specialist surfaces narrow and auditable
- expose `project_kb_query` only where the blueprint expects it
- implement `scada-structure-summary`
- implement `scada-history-analysis`
- extend `scada-alarm-summary` so it supports dual delivery:
  - standalone bounded use may still produce renderable `alarm_summary`
  - delegated composite use may produce `alarm_findings`
- implement explicit handoff/task-brief templates using:
  - `question`
  - `delivery_mode`
  - `constraints`
  - `expected_output`
  - `input_artifacts`
- add automated tests for:
  - specialist isolation
  - delegated artifact validation
  - wrong-path boundaries
  - dual-delivery behavior

**Exit criteria**

- all three specialist contexts exist and are boundary-verified
- delegated analyst workflows can return compact typed findings instead of ad hoc text

## Phase 6: Implement Orchestrated Main-Supervisor Workflow Skills

**Why now**

These workflows depend on the direct baseline, the semantics tool, and the delegated analyst layer.

**Deliverables**

- implement `scada-incident-review`
- implement `scada-scope-snapshot`
- implement `scada-scope-situation`
- keep ownership in the main supervisor context
- preserve:
  - typed artifact chaining
  - warnings
  - provenance
  - completeness
  - semantics stop rules
  - clarification when meaning is still unresolved
- add automated tests for routing, orchestration, artifact chaining, and failure handling

**Exit criteria**

- the main workspace can execute composite Layer 1 workflows without bypassing the artifact contracts
- orchestration stays skill-first and owner-managed

## Phase 7: Implement Report Workflow Skills On Top Of The Artifact Layer

**Why now**

Report workflows are the top layer and should be built only after delegated findings and owner orchestration are stable.

**Deliverables**

- implement `scada-alarm-report`
- implement `scada-production-report`
- implement `scada-availability-report`
- implement `scada-period-summary`
- ensure report workflows consume typed artifacts rather than querying raw tools as their first path
- reuse the current presentation surfaces:
  - `skill_run(format: "chat")`
  - `report-spreadsheet-export`
- extend export/presentation surfaces only if needed, and only as typed-artifact consumers
- add automated tests for report routing, artifact consumption, and report-specific caveats

**Exit criteria**

- report workflows sit on top of the Layer 1 contract stack instead of bypassing it
- presentation/export logic remains downstream of data and findings artifacts

## Phase 8: Hardening And Full Runtime Verification

**Why last**

Each earlier phase should include verification as it lands, but this final phase closes drift and proves the whole Layer 1 target state in the real runtime.

**Deliverables**

- extend fixture catalogs for delegated, orchestrated, and report workflows
- remove or rewrite remaining obsolete fixture assumptions
- add any missing unit/integration coverage for:
  - `project_kb_query`
  - finding contracts
  - specialist isolation
  - delegated workflows
  - orchestrated workflows
  - report workflows
- complete representative live runtime verification for:
  - static readiness
  - runtime selection
  - runtime application
- add drift checks if mirrored specialist skills remain temporarily during migration

**Exit criteria**

- the blueprint-aligned runtime surface is covered by both automated tests and live runtime evidence
- no major runtime-facing capability remains only partially verified without an explicit blocker

## 6. Priority Order Summary

Recommended execution order:

1. Phase 1: realign docs, fixtures, and terminology to the blueprint
2. Phase 2: prove and enforce runtime workspace boundaries and shared-skill topology
3. Phase 3: normalize shared artifact and delegation contracts
4. Phase 4: package the project semantics layer as `project_kb_query`
5. Phase 5: add the missing specialist workspaces and delegated workflow skills
6. Phase 6: implement orchestrated main-supervisor workflow skills
7. Phase 7: implement report workflow skills on top of the artifact layer
8. Phase 8: hardening and full runtime verification

Parallelism note:

- Phase 3 and Phase 4 can overlap once Phase 2 is complete
- Phase 5 should not start until enough of Phase 3 and Phase 4 exists to support real finding artifacts and KB-guided delegation

## 7. What Should Not Be Done Out Of Order

- Do not implement `scada-current-scope`; update old fixtures/docs to the blueprint `scada-object-explore` model instead.
- Do not add more specialist workspaces before per-agent skill resolution and shared-skill topology are explicit.
- Do not build delegated workflows before the findings contract and `delivery_mode` handoff model exist in shared code.
- Do not implement KB-guided workflows before `project_kb_query` exists or an explicit temporary fallback is documented.
- Do not add report workflows before owner-managed orchestration and delegated findings are available.
- Do not let presentation or export skills query SCADA data directly.
- Do not keep expanding mirrored specialist skill copies by hand.
- Do not let older M0-M2 fixture assumptions overrule the consolidated blueprint.

## 8. Expected End State

When this plan is complete, the repository should have:

- the already-working direct Layer 1 baseline preserved and kept stable
- blueprint-aligned control docs, skill docs, and eval fixtures
- explicit runtime workspace boundaries and shared-skill topology
- a grounded `project_kb_query` tool for project/domain semantics
- two artifact families:
  - renderable ViewModel artifacts
  - compact specialist finding artifacts
- three specialist contexts with enforced narrow surfaces
- delegated workflow skills for alarm, structure, and history analysis
- orchestrated main-supervisor skills for incident review and scope synthesis
- report workflows that consume typed artifacts instead of bypassing them
- runtime verification evidence that proves selection and application, not only plausible final answers

That end state keeps the strong M0-M2 implementation already present in the repo while bringing the remaining control-plane, contract, semantics, and workflow layers into line with the Layer 1 blueprint.
