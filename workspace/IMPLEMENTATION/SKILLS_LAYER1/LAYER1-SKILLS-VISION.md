# Layer 1 Skills Blueprint

**Date:** 2026-03-30  
**Status:** Consolidated blueprint  
**Purpose:** Define the canonical Layer 1 skill system for an OpenClaw SCADA agent: the skill set, agent contexts, execution model, shared contracts, routing rules, and runtime constraints needed to develop skills and delegated workflows without relying on separate planning documents.

---

## 1. Scope

Layer 1 is the deployment-ready SCADA capability layer built on top of Ecomet tools and the OpenClaw skill system.

It covers:

- domain-agnostic data access and transformation skills
- shared typed outputs and rendering boundaries
- supervisor-worker agent architecture for selected specialist workflows
- project-knowledge-gated semantics for workflows that need field meaning, state mappings, or scope-specific field selection

It does **not** cover:

- site-specific domain models that require extra business configuration beyond the project KB
- topology-aware causal reasoning as a required baseline
- operator rosters, compliance thresholds, or other external business metadata not present in the project KB
- implementation planning, milestones, or rollout sequencing

Layer 1 therefore includes both:

- **pure Layer 1 skills** that work on any Ecomet-based SCADA deployment from day one
- **KB-guided Layer 1 skills** that remain in Layer 1 as long as the needed semantics come from the project knowledge RAG / knowledge base or can be explicitly asked from the user

---

## 2. Design Principles

1. Skills map to **user intents**, not raw tools.
2. Narrow data skills are **deterministic building blocks**.
3. Presentation is downstream of typed data artifacts, not mixed into data retrieval.
4. Raw Ecomet tools remain available as **fallback only**.
5. The system follows a **supervisor-worker** pattern, not a flat mesh of peers.
6. One workflow has one **owner agent** responsible for final sufficiency and safe interpretation.
7. Delegated contexts must consume and produce **structured artifacts**, not raw unbounded chat history, whenever the runtime allows it.
8. Different skill visibility across agents requires **separate agent/workspace contexts**.
9. Specialists stay narrow, auditable, and easy to reason about.
10. If semantics are missing, the system must ask for clarification or consult the shared project knowledge RAG; it must not invent field meaning.

---

## 3. Capability Tiers

| Tier | Meaning | Examples |
|---|---|---|
| Pure Layer 1 | No project semantics required beyond object paths, fields, and standard tool behavior | object discovery, point history, snapshots, aggregates, alarm retrieval, alarm frequency analysis, archive coverage, freshness/gap checks |
| KB-guided Layer 1 | Layer 1 skills and tools do the computation, but the workflow needs site semantics from the project knowledge RAG / KB or the user | state-duration analysis, production totals from known counters, scope snapshots with selected fields, incident reconstruction, availability reports |
| Out of scope for Layer 1 | Requires external business models, site policy, or richer domain infrastructure | operator-benchmarked ISA-18.2 KPIs, health scoring from maintenance models, topology-driven root cause engines |

A skill remains in Layer 1 if the missing semantics can be satisfied by:

- project knowledge RAG / KB lookup
- explicit user clarification
- deterministic combination of Layer 1 outputs

---

## 4. Runtime Tool Surface

Layer 1 skills are built against the following agent-callable tool surface.

### 4.1 Registered SCADA tools

| Tool | Role |
|---|---|
| `ecomet_api` | Raw Ecomet query escape hatch |
| `ecomet_search` | Object discovery by folder, pattern, field, or substring |
| `ecomet_indexes` | Pattern/field/index introspection |
| `ecomet_read` | Current-value reads from known object paths |
| `archive_read` | Raw archive series by archive path |
| `archive_snapshot` | Value at or before a timestamp by archive path |
| `archive_aggregates` | Aggregate functions over one or more periods by archive path |
| `archive_resolve` | `{ object, field } -> archive path` resolution |
| `field_read_history` | History read for known `{ object, field }` tags |
| `field_snapshot` | Snapshot for known `{ object, field }` tags |
| `field_aggregates` | Aggregate computation for known `{ object, field }` tags |
| `alarm_query` | Alarm retrieval with time bounds, filters, and pagination |

### 4.2 Project knowledge tool

Layer 1 defines one agent-facing knowledge-retrieval tool:

| Tool | Role |
|---|---|
| `project_kb_query` | Queries the shared project/domain knowledge layer and returns grounded answers with source references |

Tool contract:

- agents do not call the retrieval service directly
- agents call `project_kb_query`
- `project_kb_query` is implemented as an OpenClaw tool/plugin
- the tool proxies requests to the neighboring retrieval service/container
- the tool should accept at least:
  - `question`
  - optional `scope`
  - optional `concepts`
  - optional `kb_group`
  - optional `top_k`
- the tool should return at least:
  - `answer`
  - `sources`
  - `snippets`
  - `confidence`
  - `needs_clarification`

Fallback handling contract:

- if `confidence` is high and `needs_clarification` is `false`, the agent may use the answer directly
- if `confidence` is low, `needs_clarification` is `true`, or the query returns no useful result, the agent should read the cited/local `PROJECT_KB` files directly when the workspace exposes them
- if semantics remain unresolved and the workflow can proceed as a pure Layer 1 path, continue while surfacing the semantics gap
- if semantics remain unresolved and the workflow depends on that meaning, stop and ask the user a focused clarification question

### 4.3 Skill execution tool

Layer 1 also relies on one skill execution tool:

| Tool | Role |
|---|---|
| `skill_run` | Loads a workspace skill module in-process, executes it against the initialized Ecomet client and index registry, and returns either raw typed JSON or rendered chat markdown |

### 4.4 Default tool-choice rules

| Situation | Default interface |
|---|---|
| Known object+field time-series work | `field_read_history`, `field_snapshot`, `field_aggregates` via Layer 1 skills |
| Archive paths already known | `archive_*` tools |
| Object discovery, scope-wide current/config reads, or schema exploration | `ecomet_search`, `ecomet_indexes`, `ecomet_read` via `scada-object-explore` |
| Current reads from known paths | `ecomet_read` directly or through `scada-object-explore` |
| Alarm retrieval | `alarm_query` via `scada-alarm-list` |
| Alarm KPIs and ranking | `scada-alarm-summary` |
| Project/domain semantics lookup | `project_kb_query` |

Raw tools must be described as fallback in their tool descriptions so the model prefers skills first.

---

## 5. Shared Behavioral Contracts

These contracts apply across all Layer 1 skills.

### 5.1 Time contract

The agent should not compute epoch milliseconds itself.

Skills accept structured time specs such as:

```json
{ "preset": "last_2_hours" }
```

```json
{ "from": "2026-03-15 12:00", "to": "2026-03-15 14:00", "timezone": "Europe/Vilnius" }
```

```json
{ "at": "yesterday 14:30", "timezone": "UTC" }
```

The module resolves:

- epoch conversion
- timezone handling
- DST boundaries
- bucket edges
- range splitting

Canonical preset vocabulary comes from `workspace/libs/skills-core/dist/time-resolver.js`:

- rolling presets: `last_15_minutes`, `last_30_minutes`, `last_1_hour`, `last_2_hours`, `last_6_hours`, `last_24_hours`, `last_7_days`
- calendar presets: `today`, `yesterday`

Rules:

- calendar presets require an explicit `timezone`
- phrases such as `this week`, `this month`, and shift-specific windows are not canonical presets
- unsupported calendar phrases must be translated into explicit `{ from, to, timezone }` ranges before skill execution

### 5.2 Field-result contract

Field-level archive workflows use a three-way result model:

- `values`: successful tag results
- `invalid`: object path does not exist
- `unresolved`: object exists but the field is not archived

Skills must surface `invalid` and `unresolved` explicitly. They must never silently drop them.

### 5.3 Pagination and completeness contract

Search and alarm retrieval can paginate. When not all results are included, skills must preserve:

- total available count
- returned count
- whether the output is complete or partial
- any continuation or truncation reason

### 5.4 Change-driven storage contract

Archive history is change-driven:

- gaps mean "value unchanged since the previous point"
- the first point may precede the requested range and still be the effective value at the range start

Skills must explain this when the user could misread gaps as missing data.

### 5.5 Aggregate contract

- period boundaries are `[start, end)`
- `avg`, `integral`, and `stddev` are time-weighted
- `min` and `max` are simple extremes
- integral units are `ms * value`; presentation should convert when the physical unit is known

### 5.6 Alarm contract

- `alarm_query` requires explicit `time_from` and `time_to`
- alarm ranges are capped at 30 days per fetch window
- long alarm summaries must split windows and preserve completeness/warning signals

### 5.7 Warning, provenance, and completeness contract

Every Layer 1 output must preserve:

- warnings
- provenance
- completeness

At minimum, provenance should include:

- source skill
- scope
- period start
- period end
- timezone
- produced-at timestamp

Completeness should distinguish at least:

- `complete`
- `partial`
- `failed`

### 5.8 Failure policy

Skills must:

- surface failures explicitly
- include partial data when available
- avoid silent fallback to a different skill path
- stop and return control when clarification is required

---

## 6. Typed Artifact Contracts

Layer 1 uses two typed artifact families that share one common envelope:

- **ViewModelContract** for renderer/exporter-facing skill outputs
- **SpecialistFindingContract** for bounded analyst findings returned to an owner workflow

### 6.1 Shared envelope

All typed artifacts must preserve:

- `warnings`
- `provenance`
- `completeness`
- optional `metadata`

Common top-level envelope:

```json
{
  "kind": "artifact kind",
  "warnings": [],
  "provenance": {
    "source_skill": "skill or workflow name",
    "scope": "optional scope label or path set",
    "period_from": 0,
    "period_to": 0,
    "timezone": "UTC",
    "produced_at": 0
  },
  "completeness": {
    "status": "complete | partial | failed"
  },
  "metadata": {}
}
```

### 6.2 ViewModelContract

ViewModelContract is the renderer/exporter-facing artifact produced by direct skill modules and by workflow skills that intentionally return a renderable result.

Canonical shape:

```json
{
  "kind": "history_view | snapshot_view | aggregate_table | alarm_list | alarm_summary | scope_view | coverage_view",
  "blocks": [],
  "warnings": [],
  "provenance": {
    "source_skill": "scada-point-history",
    "scope": "optional scope label or path set",
    "period_from": 0,
    "period_to": 0,
    "timezone": "UTC",
    "produced_at": 0
  },
  "completeness": {
    "status": "complete | partial | failed"
  },
  "metadata": {}
}
```

Current direct-skill mapping in this repository:

- `scada-object-explore` -> `scope_view`
- `scada-point-history` -> `history_view`
- `scada-point-snapshot` -> `snapshot_view`
- `scada-period-aggregates` -> `aggregate_table`
- `scada-archive-coverage` -> `coverage_view`
- `scada-alarm-list` -> `alarm_list`
- `scada-data-quality` -> `coverage_view`
- `scada-alarm-summary` -> `alarm_summary`

Rules:

- data skills produce ViewModelContract JSON
- `skill_run(format: "json")` returns the raw serialized ViewModelContract
- `skill_run(format: "chat")` renders the ViewModelContract through the shared chat renderer
- intermediate chaining between machine-consumed steps must use `format: "json"`
- `format: "chat"` is for the final presentation boundary only

### 6.3 SpecialistFindingContract

SpecialistFindingContract is the compact analyst artifact returned by delegated specialists to an owner workflow.

It is **not** a separate renderer-facing view model family. It reuses the same envelope as ViewModelContract but carries synthesized findings rather than render blocks.

Canonical shape:

```json
{
  "kind": "alarm_findings | scope_findings | history_findings",
  "question": "What the specialist was asked to answer",
  "scope_examined": [],
  "key_findings": [],
  "source_artifacts": [
    {
      "kind": "alarm_summary",
      "source_skill": "scada-alarm-summary"
    }
  ],
  "warnings": [],
  "confidence": "low | medium | high",
  "recommended_followups": [],
  "provenance": {
    "source_skill": "scada-history-analysis",
    "scope": "optional scope label or path set",
    "period_from": 0,
    "period_to": 0,
    "timezone": "UTC",
    "produced_at": 0
  },
  "completeness": {
    "status": "complete | partial | failed"
  },
  "metadata": {}
}
```

Relationship rules:

- findings share the same `warnings` / `provenance` / `completeness` envelope as ViewModelContract
- findings may cite supporting ViewModelContract artifacts through `source_artifacts`
- owner workflows pass ViewModelContract between deterministic skill stages and SpecialistFindingContract between analyst stages
- findings should stay compact; raw tables, long series, and full object trees belong in the supporting ViewModelContract inputs rather than in `key_findings`

---

## 7. Skill Architecture

### 7.1 What a skill is

A skill is a workspace folder containing:

| File | Purpose |
|---|---|
| `SKILL.md` | The authoritative behavioral document for selection, steps, edge cases, and checklist |
| `index.js` | Optional in-process deterministic module called through `skill_run` |
| `kb/` | Optional skill-local reference material |

The `SKILL.md` is the skill definition. The module and KB support it.

### 7.2 Folder layout

Simple skill:

```text
skills/scada-object-explore/
  SKILL.md
```

Skill with module:

```text
skills/scada-point-history/
  SKILL.md
  index.js
```

Skill with module and KB:

```text
skills/scada-data-quality/
  SKILL.md
  index.js
  kb/
```

### 7.3 `SKILL.md` authoring rules

`SKILL.md` should be concise, specific, and easy for the model to navigate on demand.

Authoring rules:

- assume the model is already smart; include only task-specific guidance
- keep the main `SKILL.md` focused on routing, workflow, guardrails, and references
- use consistent terminology throughout the skill
- do not offer many equivalent options; provide a default path and only add an escape hatch when necessary
- if output structure matters, provide a template
- if output quality depends on style or transformation examples, provide a small set of input/output examples
- if the main `SKILL.md` grows beyond roughly 150 lines or contains more than one substantial decision tree, keep `SKILL.md` as the entrypoint and move examples/patterns/algorithms into directly linked sibling files

Current repository benchmark:

- `scada-object-explore` is the strongest current example of a successful Layer 1 `SKILL.md`
- what makes it stronger than the other implemented skills is not just length; it combines:
  - clear live-vs-KB guardrails
  - explicit routing and decision logic
  - retry/recovery loops
  - canonical parameter definitions
  - a final workflow checklist
  - representative calls
  - one clear hop to a sibling pattern/reference file
- other implemented skills are useful, but many are currently thinner wrappers with routing pseudocode plus one call example; they should be revised toward the `scada-object-explore` pattern where that extra guidance materially improves correctness

Required frontmatter:

```yaml
---
name: scada-point-history
description: Retrieves trend/history data for known object+field tags. Use when the user asks for time-series history, trends, last-change checks, or point comparison over a period.
---
```

Frontmatter rules:

- `name` uses lowercase letters, numbers, and hyphens only
- `name` should be specific and action-oriented, not vague
- `description` must state both **what the skill does** and **when to use it**
- `description` should be written in third person because it is injected into the model's routing context

Required content responsibilities:

- selection boundary:
  - when to use the skill
  - when not to use it
  - what adjacent skill/tool paths should be preferred instead
- core workflow:
  - the main routing/decision logic
  - enough step structure to execute the skill correctly
- guardrails:
  - what must be verified live
  - what may come from KB/reference material
  - what the skill must not guess or silently assume
- recovery behavior:
  - what to do when params are invalid, discovery is incomplete, paging is partial, or the first attempt fails
- output quality check:
  - a final checklist or equivalent review step before answering

Recommended sections for complex skills:

- `## Must Read First`
- `## Routing Pseudocode`
- `## Feedback Loops`
- `## Canonical Params`
- `## Workflow Checklist`
- `## Representative Calls`
- linked sibling files such as `SEARCH-PATTERNS.md` when examples or long patterns would otherwise bloat the main entrypoint

Recommended sections for narrower deterministic skills:

- `## When to use`
- `## NOT this skill`
- `## Call`
- `## Algorithm pseudocode`
- `## On failure`

Heading names do not need to be identical across all skills. What matters is that the content responsibilities above are covered clearly and that complex skills follow the stronger `scada-object-explore` pattern instead of a minimal wrapper style.

### 7.4 Workflow expression patterns

Use the level of instruction strictness that matches the fragility of the task.

| Pattern | Use when | Preferred form |
|---|---|---|
| High freedom | Multiple approaches are acceptable and judgment depends on context | short text steps |
| Medium freedom | A preferred pattern exists, but parameters or branches vary by context | pseudocode or conditional workflow blocks |
| Low freedom | The sequence is fragile, safety-critical, or must be exact | explicit script, exact command, or deterministic module |

For Layer 1, the default rule is:

- use plain prose for simple routing and high-level selection
- use **pseudocode** for branching logic, decision points, retry handling, and algorithmic workflows
- use exact commands or modules for brittle operations that must not drift

For complex skills, pseudocode is preferred over descriptive prose because it makes:

- branch conditions explicit
- sequencing explicit
- retry paths explicit
- stop conditions explicit
- required intermediate artifacts explicit

Recommended pattern for complex branching:

```text
if (full object path is missing)
    -> use scada-object-explore first

if (user asked for raw alarm rows)
    -> scada-alarm-list

if (user asked for alarm KPIs or ranking)
    -> scada-alarm-summary

if (workflow needs multiple data sources and final synthesis)
    -> keep owner context and use format: "json" for intermediate steps
```

Recommended pattern for conditional workflows:

```text
1. Determine request type
   - Known tag history? -> follow History workflow
   - Aggregate/statistics? -> follow Aggregates workflow
   - Incident reconstruction? -> follow Incident workflow

2. History workflow
   - Resolve object path
   - Build time spec
   - Call skill_run

3. Incident workflow
   - Retrieve alarm rows
   - Resolve relevant fields through KB or clarification
   - Pull history and snapshots
   - Assemble typed timeline
```

If a workflow grows large or has many branches:

- move the detailed algorithm into a directly linked sibling file such as `PATTERNS.md`, `WORKFLOWS.md`, or `ALGORITHM.md`
- tell the model exactly when to read that file
- avoid deep reference chains; one clear hop from `SKILL.md` is preferred

### 7.5 `skill_run` execution model

Canonical call shape:

```javascript
skill_run({
  skill: "scada-point-history",
  params: {
    tags: [{ object: "/root/FP/PROJECT/.../POINT", field: "out_value" }],
    time: { preset: "last_1_hour" }
  },
  format: "json"
})
```

Current plugin bridge behavior also accepts flat top-level skill parameters:

```javascript
skill_run({
  skill: "scada-point-history",
  tags: [{ object: "/root/FP/PROJECT/.../POINT", field: "out_value" }],
  time: { preset: "last_1_hour" },
  format: "json"
})
```

Execution model:

- validates `skill`
- collects skill params from the explicit `params` object when present; otherwise the plugin bridge promotes extra top-level fields into `params`
- validates `format`; default is `chat`
- resolves the active agent workspace
- resolves `<workspace>/skills/<skill>/index.js`
- validates the path stays under the workspace skill tree
- purges the selected skill's `require.cache`
- loads the module in-process
- passes `{ client, indexRegistry, params }` to the module
- if `format` is `json`, returns `JSON.stringify(viewModel, null, 2)`
- if `format` is `chat`, renders the returned ViewModelContract through the shared chat renderer

Important contract rule:

- `format` is a `skill_run` tool argument, not part of the skill module's `params`
- modules should not branch on `format`; they always return typed artifacts and let `skill_run` decide serialization/rendering

This is path-scoped execution, not a sandbox.

### 7.6 Skill module contract

Each module exports one async function:

```javascript
module.exports = async function({ client, indexRegistry, params }) {
  // validate params
  // resolve time or ranges
  // call ecomet-core functions
  // assemble ViewModelContract
  return viewModel;
};
```

Module responsibilities:

- structured time resolution
- deterministic math
- chunking and pagination loops
- validation and defaults
- three-way result handling
- completeness/warning/provenance assembly

Module non-responsibilities:

- routing
- user interaction
- final narrative framing
- arbitrary multi-step workflow ownership

### 7.7 When a module is required

Use a module when the skill needs:

- any time input
- deterministic math
- pagination loops
- multi-step internal orchestration
- typed output assembly
- behavior that would otherwise require large or brittle prompt-side pseudocode
- exact validation or retry loops that must not drift

When logic is deterministic enough to live in code, prefer moving it into the module rather than expanding `SKILL.md` indefinitely.

No module is required only for simple search/discovery flows that accept strings and do not compute time or pagination behavior beyond direct tool semantics.

### 7.8 Utility-script and validation pattern

If a skill benefits from executable helpers in addition to `index.js`:

- prefer pre-made scripts over asking the model to generate ad hoc code
- make it explicit whether the model should **run** the script or **read** it as reference
- scripts should solve error conditions rather than punting failures back to the model
- validation loops should be explicit: run validator -> fix -> validate again -> proceed only when validation passes

### 7.9 Object-path resolution rule

Most SCADA skills require full object paths.

Resolution order:

1. prior conversation context
2. project knowledge RAG / knowledge base
3. `scada-object-explore`

If a full path is missing, the workflow should route through `scada-object-explore` before calling a point or aggregate skill.

---

## 8. Agent Architecture

Layer 1 uses a supervisor-worker model with one main user-facing supervisor and a small number of bounded analyst specialists.

The default pattern is:

- `main-supervisor` owns the user request
- analyst specialists inspect specific evidence domains
- analysts return compact findings
- `main-supervisor` synthesizes the overall answer

### 8.1 `main-supervisor`

The main supervisor always owns:

- user interaction
- clarification questions
- skill routing
- workflow selection
- final sufficiency judgment
- final synthesis for multi-step situation assessment and reports
- final presentation through `skill_run(format: "chat")` or installed export/presentation skills when a formatted artifact is needed

The main supervisor can directly invoke:

- `scada-object-explore`
- `scada-point-history`
- `scada-point-snapshot`
- `scada-period-aggregates`
- `scada-archive-coverage`
- `scada-alarm-list`
- `scada-data-quality`
- `report-spreadsheet-export`
- any additional installed presentation/export skills that follow the typed-artifact contract

Direct-invocation rule:

- `main-supervisor` should call potentially data-heavy skills directly only when the user's request is narrow, direct, and answerable inside one evidence domain.
- If the request requires combining multiple heavy evidence streams such as structure, alarms, and history, `main-supervisor` should route into an orchestrated workflow and delegate bounded analyses to specialists.

The main supervisor is also responsible for coordinating analyst workflows such as:

- structure reconstruction
- alarm assessment
- targeted history analysis
- whole-scope situation assessment

### 8.2 `alarm-analyst`

Purpose:

- alarm-heavy evidence analysis
- flood analysis
- top offenders
- standing/chattering analysis
- recent disturbance patterns
- standalone alarm summary requests

Allowed skill surface:

- `scada-alarm-list`
- `scada-alarm-summary`

Allowed raw tools:

- none in the target design

Expected output:

- `alarm_findings` SpecialistFindingContract for delegated analysis
- or `alarm_summary` ViewModelContract for standalone alarm-summary execution
- or, for explicitly asynchronous leaf delivery, a user-safe final answer that preserves warnings, provenance, and completeness

### 8.3 `project-structure-specialist`

Purpose:

- reconstruct scope structure for a requested site, area, unit, or asset family
- identify critical equipment groups and structural neighbors
- nominate operationally important measurement, status, and control points
- provide a compact operational map of the scope

Allowed skill surface:

- `scada-object-explore` for both structural discovery and bounded current-state checks that help nominate important points

Allowed raw tools:

- none in the target design

Expected output:

- `scope_findings` SpecialistFindingContract
- supported by `scope_view` ViewModelContract inputs/derivations when discovery evidence needs to be preserved
- key-equipment and key-signal nominations for downstream checks

### 8.4 `history-analyst`

Purpose:

- targeted time-series inspection for selected signals
- stability and anomaly assessment
- trend explanation
- stuck-signal suspicion checks
- focused follow-up after alarms or structure analysis nominate interesting points

Allowed skill surface:

- `scada-point-history`
- `scada-point-snapshot`
- `scada-period-aggregates`
- `scada-data-quality`

Allowed raw tools:

- none in the target design

Expected output:

- `history_findings` SpecialistFindingContract
- supported by `history_view`, `snapshot_view`, `aggregate_table`, or `coverage_view` ViewModelContract inputs when needed
- compact judgments such as stable / unstable, trending / flat / oscillating, likely healthy / likely stuck, or unusual changes in period

### 8.5 Shared project/domain knowledge RAG

Agents do not call the retrieval service directly. They reach this capability through the `project_kb_query` tool. The tool is the only agent-facing entrypoint; the retrieval service sits behind it.

It is a shared retrieval capability for both:

- project-specific knowledge
- domain knowledge relevant to the deployment vertical

It should cover the knowledge curated in `PROJECT_KB`, including:

- field and value semantics
- which fields exist, which are authoritative, and what data they keep
- field-selection rules
- how totals, KPIs, or reports should choose authoritative signals
- expected signal behavior
- project-specific naming and status conventions
- project structure, modeling conventions, and neighboring-object relationships

Example corpus for this repository:

- `workspace/PROJECT_KB/INDEX.md`
- `workspace/PROJECT_KB/structure/*.md`
- `workspace/PROJECT_KB/semantics/*.md`

RAG ingestion contract:

- for this example PROJECT_KB ingest only the curated `workspace/PROJECT_KB/**.md` corpus for project semantics
- treat each heading section as a retrieval chunk rather than embedding whole files as one block
- attach metadata at ingest time:
  - `source_file`
  - `section_path`
  - `kb_group` such as `structure` or `semantics`
  - `concepts` such as `status_codes`, `alarm_taxonomy`, `structure_templates`
- return source references with every answer so the caller can cite or verify them
- do not ingest generic query-syntax or tool-reference docs into this project RAG; those belong to OpenClaw docs or Layer 1 developer docs

The `project_kb_query` tool should be available to:

- `main-supervisor`
- `alarm-analyst`
- `project-structure-specialist`
- `history-analyst`
- other future analyst workflows that need project-specific interpretation

Deployment contract:

- the RAG capability is served by a neighboring local service or container
- the neighboring service is wrapped by the `project_kb_query` OpenClaw tool/plugin
- agents use the tool; the tool calls the service
- the retrieval backend/service is an implementation choice, not a blueprint requirement
- whatever backend is chosen must support semantic retrieval, metadata filtering by source file / section / KB group, and incremental re-indexing when `PROJECT_KB` files change

Runtime binding rule:

- loading the plugin once under `plugins.entries` is not enough by itself
- each agent that should call `project_kb_query` must also be allowed to use it by that agent's `tools` policy in `openclaw.json`
- specialist workspaces do not inherit tool access automatically just because the plugin exists globally

The agent-facing tool outputs are:

- retrieved project/domain context
- resolved field mappings
- field-selection hints
- source references into `PROJECT_KB` or the retrieval corpus
- clarification prompts when semantics remain missing

Example RAG questions and expected answers:

- Question:
  "What does status code `3` mean for this asset family in this deployment?"
  Expected answer:
  "Status code `3` means the asset is in its normal active state for this deployment. The KB should also explain what nearby state fields represent and whether this code should be interpreted together with quality or timestamp fields. Source: the relevant section under `workspace/PROJECT_KB/semantics/`."
- Question:
  "Which subtree should I inspect to understand structural members and composite state for this asset type?"
  Expected answer:
  "Inspect the deployment's canonical structure template for that asset family, especially the subtree used to group member devices and derive composite state. The answer should name the expected child roles and cite the relevant `workspace/PROJECT_KB/structure/` sections."
- Question:
  "How should I interpret the deployment's primary alarm category fields?"
  Expected answer:
  "The KB should explain which alarm classification field is primary, what its values usually mean, which secondary fields are enrichment-only, and how sparse or unreliable those fields may be. Source: the relevant section under `workspace/PROJECT_KB/semantics/`."
- Question:
  "What structural clues identify important neighboring scopes or adjacent assets?"
  Expected answer:
  "Use the canonical hierarchy and reusable structure templates defined in `workspace/PROJECT_KB/structure/`. Neighbor relationships should be inferred from the deployment model and template rules, not guessed from names alone."

### 8.6 Future contexts

The architecture leaves room for future dedicated contexts such as:

- `incident-investigator`
- `report-reviewer`
- other bounded analysts with clear evidence domains

They are not part of the required Layer 1 baseline and should not be assumed by current skills.

---

## 9. Execution Modes and Delegation Contract

OpenClaw routing has three implementation layers:

1. runtime registry: which agents exist and what each agent is allowed to use
2. workspace bootstrap docs: what the model sees automatically on each turn
3. skill docs and workspace control docs: the concrete skill folders and control files the model reads when acting

In OpenClaw terms:

- the runtime registry lives in `openclaw.json`
- the main workspace behavior lives primarily in `workspace/AGENTS.md`, installed `SKILL.md` files, and `PROJECT_KB`; `TOOLS.md` is a lightweight local-notes supplement, not the main policy surface
- each specialist has its own workspace, its own `AGENTS.md`, an optional/lean `TOOLS.md` for local tool notes, and its own `skills/` folder

Important prompt behavior:

- main sessions receive the normal workspace bootstrap and the compact available-skills list
- in current OpenClaw runtime code, sub-agent sessions are assigned `promptMode = "minimal"`, but the run still resolves the skills prompt and injects a reduced workspace bootstrap subset rather than relying on `AGENTS.md` alone
- OpenClaw treats `AGENTS.md` as the operating-instructions file and `TOOLS.md` as user-maintained tool notes; `TOOLS.md` does not control which tools actually exist
- therefore specialist `AGENTS.md` should act as a stable workspace charter: role, scope boundaries, default output contract, stop rules, and other rules that should apply across delegated tasks
- capability boundaries come from runtime policy and workspace visibility; `AGENTS.md` may mention typical local skills for discoverability, but it should not duplicate the full skill catalog or runtime allowlist
- `TOOLS.md` should stay concise and only capture local aliases, caveats, or environment-specific notes

Following subagent best practices, each specialist must have a clear description of when to use it. In this blueprint, that description must exist in two places:

- the runtime registry, so the agent id exists and is targetable
- the main workspace control docs, so `main-supervisor` knows when and why to delegate

### 9.1 Routing knowledge sources

`main-supervisor` decides how to route work from these sources, in this order:

1. the user's request and requested outcome
2. installed skill descriptions and workflow contracts in the main workspace
3. workspace control docs, with `AGENTS.md` primary and `TOOLS.md` secondary for local tool notes/caveats
4. `PROJECT_KB` / project-domain knowledge RAG
5. specialist ids allowed by the runtime registry, discoverable via `agents_list`

Practical rule:

- skills are the primary routing surface and describe what user intents they cover
- the main workspace `AGENTS.md` must include a concise specialist roster that describes when each specialist should be used
- each specialist workspace `AGENTS.md` must describe what that specialist does, what it normally returns, when it must stop, and the stable scope/evidence rules that apply across its delegated tasks
- specialist `AGENTS.md` may mention typical local skills when that helps discoverability, but it should not duplicate the full visible skill surface or runtime allowlist
- `TOOLS.md` should stay short and environment-specific; it should not duplicate the full tool registry, routing tree, or runtime allowlist unless a local caveat truly needs to live there
- the runtime registry is the authority for which specialist ids exist; the workspace docs are the authority for the human-readable delegation descriptions the model should follow
- `main-supervisor` should first route by matching skill description; `AGENTS.md` is the fallback policy layer for requests that are not yet cleanly covered by one skill or that require composition across several skills

Runtime delegation flow:

1. `main-supervisor` calls `agents_list` to discover which agent ids it is currently allowed to target.
2. `main-supervisor` starts a child run with `sessions_spawn`, passing:
   - `agentId`
   - `task`
   - optional `label`
   - optional `model`
   - optional `runTimeoutSeconds`
   - optional `cleanup`
3. `sessions_spawn` returns immediately with `{ status: "accepted", runId, childSessionKey }`.
4. The child runs in its own session `agent:<agentId>:subagent:<uuid>`.
5. When the run finishes, OpenClaw performs an announce step back to the requester chat.

Important behavior:

- `sessions_spawn` is always asynchronous and non-blocking
- a spawned child does not block the parent run by itself
- the owner must choose between an async announce pattern and an explicit session-to-session wait pattern
- `sessions_spawn` runs on the dedicated `subagent` lane and returns `{ status: "accepted", runId, childSessionKey }`

Two coordination patterns are supported:

- **Async leaf delegation**
  - use `sessions_spawn`
  - let the child complete independently
  - consume the runtime announce back in the requester chat
  - best for standalone bounded tasks where `announce_final` is acceptable
- **Owner-managed coordination**
  - use `sessions_spawn` to create the child session
  - keep the returned `childSessionKey`
  - use `sessions_send(childSessionKey, message, timeoutSeconds > 0)` when the owner needs a waited reply from that child session
  - if the wait times out, use `sessions_history(childSessionKey)` later to inspect the transcript and continue
  - this is the required pattern for `return_artifact` / owner-synthesized workflows
  - `sessions_send(timeoutSeconds > 0)` waits server-side and returns `{ runId, status: "ok", reply }` on completion
  - `status: "ok"` confirms the child run finished; it does not guarantee that any final announce delivery succeeded
  - `sessions_send(timeoutSeconds = 0)` is fire-and-forget

Status / inspection tools:

- use `sessions_history(childSessionKey, includeTools?)` to inspect what the child actually did
- use `sessions_list` to enumerate active or recent sessions the owner is allowed to see
- use `session_status(sessionKey)` when the owner needs the current session status or override info for a specific child
- session browsing is controlled by `tools.sessions.visibility`; the default documented visibility is `tree` (current session plus spawned subagent sessions)

Parallelism rules:

- `main-supervisor` may spawn several independent specialists in parallel when their evidence domains do not depend on each other
- OpenClaw runs spawned children on the dedicated `subagent` lane
- lane concurrency is controlled by `agents.defaults.subagents.maxConcurrent`
- fan-out per parent session is capped by `maxChildrenPerAgent`
- parallel spawning should therefore be used for independent checks such as structure analysis plus alarm analysis, but not for tightly sequential follow-ups that depend on the previous child result
- by default, nested child management is not available to leaf sub-agents; nested orchestration requires `maxSpawnDepth >= 2`

Channel/thread note:

- one-shot owner-to-worker delegation is channel-agnostic
- persistent thread-bound sub-agent sessions are channel-dependent and require `sessions_spawn` with `thread: true` and `mode: "session"`
- thread-bound persistence should be treated as an optional UX layer, not the core Layer 1 orchestration mechanism

Native support vs project contract:

- the delegation transport described above is native OpenClaw behavior; no custom runtime implementation is required for spawning, waiting, inspecting child sessions, or parallel child execution
- what still requires project design is the **decision policy** and the **payload contract**
- OpenClaw gives the owner agent the tools to contact another agent and optionally wait for its reply
- OpenClaw does **not** define a Layer 1-specific `alarm_findings` / `scope_findings` / `history_findings` schema for us
- OpenClaw does **not** decide on its own when a workflow should use `announce_final` versus `owner_synthesizes`
- therefore the transport is native, while the typed artifact protocol and delegation rules in this blueprint remain project-defined instructions the agents must follow

Minimum implementation locations:

- `openclaw.json`: declares agent ids, workspaces, models, tools, and skills
- `workspace/AGENTS.md`: concise specialist roster, delegation guidance, and routing priorities for `main-supervisor`
- `workspace/TOOLS.md`: optional local tool notes for this workspace, such as aliases, caveats, or non-portable environment details; not the canonical tool allowlist
- `workspace/skills/<name>/SKILL.md`: skill definition; for complex workflows this file is also the primary orchestration document
- `workspace-<specialist>/AGENTS.md`: specialist workspace charter covering role, scope boundaries, default output contract, stop rules, and any stable evidence/quality rules
- `workspace-<specialist>/TOOLS.md`: optional specialist-local tool notes or caveats only

Skill-sharing model across workspaces:

- OpenClaw loads skills from three native locations:
  - bundled skills shipped with OpenClaw
  - managed/local shared skills in `~/.openclaw/skills`
  - workspace skills in `<workspace>/skills`
- if the same skill name exists in several places, precedence is:
  - `<workspace>/skills`
  - `~/.openclaw/skills`
  - bundled skills
- additional common skill directories can also be mounted through `skills.load.extraDirs` at the lowest precedence
- if several agents need the same skill, OpenClaw-native sharing should prefer `~/.openclaw/skills` or an extra shared skill dir before copying the same skill into many workspaces

Placement policy for this blueprint:

| Location | What belongs there | Layer 1 examples |
|---|---|---|
| `~/.openclaw/skills/<skill>/` | Shared reusable skills with the same behavior across several agents | `scada-object-explore`, `scada-point-history`, `scada-point-snapshot`, `scada-period-aggregates`, `scada-archive-coverage`, `scada-alarm-list`, `scada-alarm-summary`, `scada-data-quality`, `report-spreadsheet-export` |
| `<main-workspace>/skills/<skill>/` | Owner-facing workflow skills and main-agent-only orchestration policy | `scada-scope-situation`, `scada-incident-review`, `scada-scope-snapshot`, `scada-alarm-report`, `scada-production-report`, `scada-availability-report`, `scada-period-summary` |
| `<specialist-workspace>/skills/<skill>/` | Specialist-private helper skills or explicit local overrides that should not be shared globally | specialist-only helper/adaptor skills, or a local override of a shared skill when one specialist truly needs different behavior |

Lock-in rule:

- `~/.openclaw/skills` is the default home for shared Layer 1 reusable skills
- `<workspace>/skills` is the default home for agent-specific workflow/orchestration skills
- a skill should move into a workspace-local `skills/` folder only when that agent owns the behavior or needs a deliberate override

Active-workspace rule:

- the accepted multi-agent implementation uses native per-agent workspaces declared under `agents.list[].workspace` in `openclaw.json`
- `skill_run` must resolve `<active agent workspace>/skills/<skill>/index.js`
- `agents.defaults.workspace` is only the default workspace for the default/main agent, not the effective skill root for every agent session

Recommended strategy:

- use `<workspace>/skills` for agent-specific workflow skills that are intentionally private to one workspace
- use `~/.openclaw/skills` for cross-agent shared skills that should be visible to several agents on the same machine
- use workspace-local overrides only when one agent truly needs different behavior or instructions under the same skill name
- if the project chooses to vendor copies into specialist workspaces anyway, materialize them by an explicit sync/build step and treat them as generated artifacts, not independent hand-edited forks

Why this is the preferred default:

- it uses OpenClaw’s native shared-skill mechanism instead of inventing a project-only convention
- one shared copy reduces drift and duplicated review effort
- workspace-local overrides still remain available when a specialist truly needs a narrower or different version

Symlink rule:

- symlinks may be acceptable for local development when the deployment environment preserves them correctly
- symlinks are not the blueprint default because they are easier to break across host/container boundaries and packaging steps

Anti-pattern:

- manual drifting copies of the same skill in several workspaces
- if a specialist truly needs different behavior, give it a specialist-owned skill with a different skill name rather than silently diverging a shared copy

### 9.2 Required execution fields

Every workflow must define the following fields.

| Field | Meaning |
|---|---|
| `execution_mode` | `direct`, `orchestrated`, or `delegated` |
| `owner_agent` | The agent responsible for sufficiency and final meaning |
| `delegate_agent` | Named specialist context when delegated |
| `task_brief` | Compact structured work request passed to the delegated context, including the question, expected output, scope/time, and constraints needed for the run |
| `input_artifacts` | Structured artifacts, constraints, and KB/RAG outputs provided to the worker |
| `output_artifact` | Typed result expected from the worker, matching the requested output contract |
| `completion_policy` | `complete`, `partial_with_warnings`, `needs_clarification`, or `failed` |
| `review_required` | Whether a review pass is mandatory before final delivery |
| `escalation_conditions` | When the worker must stop and return control |
| `raw_tool_subset` | Raw tools explicitly allowed inside the worker context, if any |
| `delivery_mode` | `owner_synthesizes`, `announce_final`, or `return_artifact` |

Definitions:

- `owner_synthesizes`: the owner agent builds the final answer from direct work and specialist findings
- `announce_final`: the delegated context may deliver the final user-visible answer directly
- `return_artifact`: the delegated context returns a typed artifact to the owner for further synthesis or review

Contract note:

- `owner_synthesizes` and `announce_final` map directly onto native OpenClaw session behavior
- `return_artifact` is a project-level protocol layered on top of native OpenClaw session tools
- practically, that means the child reply must contain the agreed typed JSON artifact and the owner must parse/use it according to this blueprint
- OpenClaw transports the reply; the artifact schema itself is ours to define and enforce in prompts, skills, and tests

### 9.3 Delegation decision model

The stable routing surface is always the **skill name**, not the specialist persona name.

Where this logic lives:

- the primary routing logic lives in skill descriptions and the selected skill's `SKILL.md`
- `workspace/AGENTS.md` is the fallback routing layer for questions that are not yet well covered by one skill or that need multi-skill composition policy
- detailed branching logic for complex workflows should live in the corresponding workflow skill's `SKILL.md`
- stable specialist behavior lives in each specialist workspace's `AGENTS.md`, while detailed specialist procedure lives in its local skills and selected `SKILL.md`

How `main-supervisor` knows specialists exist:

- the runtime exposes allowed agent ids through `agents_list`
- the main workspace control docs describe what each specialist is for
- the main workflow skills describe when execution should delegate to a specialist versus staying direct

Decision rule:

- if the user's request clearly matches one skill, follow that skill's instructions first
- if the request is not yet cleanly covered by one skill, use `AGENTS.md` as the high-level routing fallback
- use `direct` when the request is narrow, self-contained, and belongs to one evidence domain
- use `delegated` when a bounded specialist can inspect a large or noisy evidence stream and return compact findings
- use `orchestrated` when the answer requires multiple evidence domains, follow-up decisions, or final synthesis across specialist findings

Canonical routing pseudocode:

```text
if (request is narrow and self-contained)
    -> route to a direct skill or a standalone specialist-facing skill

else
    -> choose an owner workflow skill in main-supervisor

if (scope structure is needed)
    -> delegate scada-structure-summary to project-structure-specialist

if (alarm state or recent disturbances are needed)
    -> delegate scada-alarm-summary to alarm-analyst

if (selected signals need trend/stability diagnosis)
    -> delegate scada-history-analysis to history-analyst

if (field meaning or project conventions are unclear)
    -> query project/domain knowledge RAG

after each specialist return
    -> main-supervisor decides whether to synthesize, ask clarification, or delegate another bounded check
```

### 9.4 Handoff contract

Specialist handoff must be explicit and compact.

Because specialists run with isolated context, the task brief must include everything the specialist needs:

- exact question to answer
- expected output contract
- scope and time window
- relevant prior findings
- relevant KB/RAG context
- constraints on output shape
- stop conditions

Recommended `task_brief` shape:

```json
{
  "delivery_mode": "return_artifact",
  "question": "Describe the operationally important structure of the requested scope.",
  "expected_output": "scope_findings",
  "scope": {
    "label": "Requested scope"
  },
  "constraints": [
    "Return compact findings only",
    "Nominate critical equipment groups, adjacent scopes, and key signals",
    "Do not dump the raw object tree"
  ]
}
```

```json
{
  "delivery_mode": "return_artifact",
  "question": "Check whether the selected status and measurement points are stable, stuck, or unusual in the last 24 hours.",
  "expected_output": "history_findings",
  "scope": {
    "points": [
      "scope/.../asset/status",
      "scope/.../sensor/value"
    ]
  },
  "time": {
    "preset": "last_24_hours"
  },
  "input_artifacts": [
    "scope_findings",
    "alarm_findings"
  ],
  "constraints": [
    "Return compact judgments with warnings",
    "Do not return raw traces by default"
  ]
}
```

Delivery-mode rule:

- the owner must set `task_brief.delivery_mode` explicitly for every delegated handoff
- specialists must not guess whether they should announce directly or return an artifact based only on the wording of the question
- if `delivery_mode` is missing because of a caller bug, the specialist must default to `return_artifact` behavior and avoid direct user-visible delivery

### 9.5 Specialist finding contract

Each specialist should return a compact SpecialistFindingContract, not raw bulk data.

At minimum, specialist outputs should include:

- `kind`
- `question`
- `scope_examined`
- `key_findings`
- `source_artifacts`
- `warnings`
- `confidence`
- `recommended_followups`
- `provenance`
- `completeness`

Typical artifact kinds:

- `alarm_findings`
- `scope_findings`
- `history_findings`

Example shape:

```json
{
  "kind": "history_findings",
  "question": "Check whether the selected status and measurement points are stable in the last 24 hours.",
  "scope_examined": ["scope/.../sensor/value"],
  "key_findings": [
    "Signal is stable overall",
    "Two short step changes occurred during the last 24 hours"
  ],
  "source_artifacts": [
    {
      "kind": "history_view",
      "source_skill": "scada-point-history"
    }
  ],
  "warnings": [],
  "confidence": "medium",
  "recommended_followups": [
    "Cross-check step changes against recent alarms or operator actions"
  ],
  "provenance": {
    "source_skill": "scada-history-analysis"
  },
  "completeness": {
    "status": "complete"
  }
}
```

### 9.6 Ownership and delivery rules

- `main-supervisor` is the default owner for multi-step situation assessment and report workflows.
- Analyst specialists are bounded coworkers. They inspect one evidence domain and return findings.
- `return_artifact` is the default delivery mode for analyst specialists.
- `announce_final` is reserved for standalone bounded skill executions whose answer is already user-safe, such as a direct alarm-summary request.
- Presentation is applied by the owner workflow after synthesis unless the workflow explicitly permits `announce_final`.

### 9.7 Platform constraints and best practices

The canonical subagent model follows these rules:

- specialists must be declared explicitly in the agent registry with id, description, workspace, tools, and skills
- the specialist description must clearly say when the specialist should be used
- each specialist starts with fresh context; parent conversation history is not assumed
- the handoff prompt and attached artifacts are the only parent-to-specialist communication channel
- specialists should have narrow tool and skill surfaces
- specialists are leaf workers and should not spawn additional specialists
- the owner receives only the specialist's final artifact or final answer, not its full internal working history

### 9.8 Skill visibility rule

When different specialists need different skill surfaces, use separate agent entries and separate workspaces.

In OpenClaw terms, that means:

- separate `agentId`
- separate workspace
- explicit skills/tools allowlist in the runtime agent registry
- explicit `subagents.allowAgents` policy so `main-supervisor` can target only the intended specialist ids
- `maxSpawnDepth: 1` for this blueprint, because analyst specialists are leaf workers rather than orchestrators

Do not assume one shared workspace with dynamic per-call skill filtering as the primary design.

---

## 10. Layer 1 Skill Catalog

In this blueprint, a **workflow** is implemented as a skill, not as a separate OpenClaw object type.

That means:

- every direct capability is a skill
- every higher-level orchestrated capability is also a skill
- the skill's `SKILL.md` is the primary orchestration document
- optional `index.js` handles deterministic parts of the workflow
- delegated task briefs identify the question, expected output, constraints, and delivery mode; a separate workflow id is not required

Implementation mapping:

| Blueprint concept | OpenClaw implementation |
|---|---|
| direct skill | `workspace/skills/<skill-name>/SKILL.md` plus optional `index.js` |
| delegated analyst workflow | a workflow skill in `workspace/skills/<skill-name>/` + top-level routing rule in `workspace/AGENTS.md` + an explicit handoff contract (`question`, `expected_output`, `constraints`, `delivery_mode`, `input_artifacts`) + specialist workspace skills |
| orchestrated workflow | a workflow skill in `workspace/skills/<skill-name>/` whose `SKILL.md` contains orchestration pseudocode and whose optional `index.js` contains deterministic helpers |
| specialist role | separate agent entry in `openclaw.json` + separate workspace + specialist `AGENTS.md` |
| shared semantics lookup | `PROJECT_KB` + neighboring project-knowledge retrieval service |

Current repository alignment:

- implemented today as deterministic module-backed skills: `scada-object-explore`, `scada-point-history`, `scada-point-snapshot`, `scada-period-aggregates`, `scada-archive-coverage`, `scada-alarm-list`, `scada-data-quality`, `scada-alarm-summary`, and `report-spreadsheet-export`
- not yet implemented in this repository but required by the Layer 1 target catalog: `scada-structure-summary`, `scada-history-analysis`, `scada-incident-review`, `scada-scope-snapshot`, `scada-scope-situation`, `scada-alarm-report`, `scada-production-report`, `scada-availability-report`, and `scada-period-summary`
- when current implementation and target skill behavior disagree, this vision is authoritative and the implementation should be revised toward it

### 10.1 Narrow direct skills

These are used directly when the user request is narrow and self-contained.

Typed-output note:

- `scada-object-explore` is not exempt from the typed artifact contract; it returns `kind: "scope_view"` with a `scope` block and is the canonical typed discovery/scope output used by downstream workflows

| Skill | Purpose | Execution | Owner | Delegate | Semantics dependency |
|---|---|---|---|---|---|
| `scada-object-explore` | Discover objects, read current/config fields across a scope, and collect key metadata | `direct` | `main-supervisor` | none | none |
| `scada-point-history` | Trend/history for known object+field tags | `direct` | `main-supervisor` | none | none |
| `scada-point-snapshot` | Exact-time value lookup for known tags | `direct` | `main-supervisor` | none | none |
| `scada-period-aggregates` | Time-weighted avg/min/max/integral/stddev over periods | `direct` | `main-supervisor` | none | none |
| `scada-archive-coverage` | Archive coverage audit and archive-path resolution checks | `direct` | `main-supervisor` | none | none |
| `scada-alarm-list` | Raw alarm retrieval, filtering, and paging | `direct` | `main-supervisor` | none | none |
| `scada-data-quality` | Freshness, gaps, and archive coverage checks | `direct` | `main-supervisor` | none | optional project/domain knowledge RAG for expected-behavior judgment |

#### `scada-object-explore`

Intended for:

- resolving ambiguous user references into real object paths and scope candidates
- answering "what exists here?" before any point-history, aggregate, or alarm workflow starts
- reading current and configuration fields across a discovered scope, not just locating paths
- handling compact present-state summaries for an explicit scope and explicit field set when the request stays in current-value territory
- acting as the default skill for working with project structure plus actual values when the request is scope-wide rather than tag-specific
- producing a typed discovery artifact that downstream workflows can reuse instead of repeating search

Should be able to:

- search by folder, pattern, name fragment, and exact field constraints
- read requested current fields for the matched objects, including both runtime and configuration-oriented fields when those fields are part of the question
- support fan-out questions such as "show the current values of all matching points under this folder" or "show the states of all objects of this type in this scope"
- support compact current-state summaries for an explicit scope and explicit field set without introducing a separate direct skill surface
- preserve pagination, total counts, and partial-result signals
- optionally enrich small result sets with current field reads without turning into a full report workflow
- return enough structural metadata for the next skill to act on the chosen objects safely

Typical questions:

- "What assets match this name fragment under this area?"
- "Show me all objects of this type under this scope."
- "Show the current values for all matching points under this folder."
- "List the current states of all matching devices in this scope."
- "Show the current key values for this scope."
- "Give me a compact current-state summary for these selected assets."
- "What is the present status of this unit right now?"
- "Which configuration fields or status fields are present on these objects?"
- "Which paths should I use for the current value and history checks?"
- "Read the current values for the first few matches."

#### `scada-point-history`

Intended for:

- time-series retrieval for already-known `{ object, field }` tags
- trend inspection, last-change review, and short multi-signal comparisons over a defined window

Should be able to:

- resolve user-friendly time ranges into safe archive queries
- return raw history points with warnings for invalid or unresolved tags
- preserve change-driven archive caveats so flat periods are not misread as missing data
- support chaining into other workflows through typed JSON rather than markdown

Typical questions:

- "Show the last 2 hours of this signal."
- "Did this value change overnight?"
- "Compare these three tags during the same period."
- "When was the last change for this point?"

#### `scada-point-snapshot`

Intended for:

- exact-time lookups for historical values or states
- "what was it at time T?" questions that do not need a full trend

Should be able to:

- accept explicit timestamps or relative time points
- return one consistent historical instant for all requested tags
- surface invalid objects and non-archived fields explicitly
- stay separate from current-value reads so the caller does not confuse live state with archive-backed state

Typical questions:

- "What was this value at 14:30 yesterday?"
- "What was the state one hour ago?"
- "Give me the historical value at the start of the incident window."

#### `scada-period-aggregates`

Intended for:

- deterministic statistics over a requested period
- totals, averages, minima, maxima, variability, and bucketed summaries

Should be able to:

- compute supported aggregate functions over one or more tags
- bucket a range into fixed periods when the user wants period-by-period comparison
- preserve aggregate caveats such as time-weighting and integral interpretation
- act as the first step in compound workflows such as "peak and when" or comparative reporting

Typical questions:

- "What was the average and maximum during the shift?"
- "Give me hourly totals for yesterday."
- "Which period had the highest value?"
- "Compare the last 24 hours with the previous 24 hours."

#### `scada-archive-coverage`

Intended for:

- checking whether requested fields are historically available before running archive-dependent skills
- separating invalid paths from real-but-not-archived fields

Should be able to:

- resolve archive availability for one or many tags
- return archive paths where they exist
- report invalid objects, unresolved fields, and uncertain coverage distinctly
- serve as a lightweight guard step before history, snapshot, or aggregate workflows

Typical questions:

- "Is this field archived?"
- "Which of these tags have usable history?"
- "Why did the history request return nothing?"

#### `scada-alarm-list`

Intended for:

- row-level alarm and event retrieval
- filtering, paging, and scoped alarm inspection over an explicit time window

Should be able to:

- filter by scope, active/acknowledged state, field values, and free-text search
- handle paging and preserve total-versus-returned counts
- split or reject oversized windows according to alarm tool limits
- return a machine-consumable alarm list that can feed summary or investigation workflows

Typical questions:

- "List the alarms in this scope for the last day."
- "Show only active unacknowledged alarms."
- "Find alarms containing this text."
- "What happened in this area between 09:00 and 11:00?"

#### `scada-data-quality`

Intended for:

- signal-health investigations rather than pure value retrieval
- stale, frozen, substituted, missing, or suspicious-signal checks

Should be able to:

- combine current value read, recent history, archive availability, and companion quality fields
- surface freshness, last-change, and obvious source-selection clues
- distinguish between "no recent change", "not archived", "invalid path", and "possibly stale"
- preserve enough evidence for the owner to explain why a signal is trusted or not trusted

Typical questions:

- "Is this signal stale?"
- "Has this point been frozen all day?"
- "Why does this current value look suspicious?"
- "Is the published value coming from a live source or a substituted source?"

### 10.2 Delegated analyst workflow skills

These skills delegate bounded analysis to specialist analysts and return compact findings to the owner.

Implementation note:

- `scada-alarm-summary` already exists in this repository as a deterministic shared skill
- in the Layer 1 target state, the same skill is commonly executed inside the `alarm-analyst` context for composite workflows, but it remains a skill rather than a persona

| Workflow | Purpose | Execution | Owner | Delegate | Delivery |
|---|---|---|---|---|---|
| `scada-alarm-summary` | Alarm KPIs, top offenders, floods, standing alarms, chattering, rates, and recent disturbance patterns | `delegated` | `main-supervisor` | `alarm-analyst` | `return_artifact` for composite workflows; `announce_final` allowed for standalone alarm-only requests |
| `scada-structure-summary` | Reconstruct scope structure, identify critical equipment groups and neighbors, and nominate important signals | `delegated` | `main-supervisor` | `project-structure-specialist` | `return_artifact` |
| `scada-history-analysis` | Targeted analysis of selected points for stability, trends, oscillation, stuck-signal suspicion, and unusual changes | `delegated` | `main-supervisor` | `history-analyst` | `return_artifact` |

Dual-delivery rule:

- when `scada-alarm-summary` is delegated, the owner chooses `return_artifact` versus `announce_final` by setting `task_brief.delivery_mode`
- the specialist must not infer that mode on its own

#### `scada-alarm-summary`

Intended for:

- alarm analytics rather than row listing
- compact alarm-domain findings that an owner workflow can reuse

Should be able to:

- compute totals, rates, top offenders, flood periods, standing alarms, chattering alarms, and useful distributions
- preserve warning signals when the requested window is too large or the result is partial
- return either a renderable `alarm_summary` artifact or a delegated `alarm_findings` summary depending on workflow mode
- support both standalone alarm questions and alarm evidence inside wider investigations

Typical questions:

- "Summarize alarm activity in this scope for the last 24 hours."
- "Which alarms are the biggest contributors?"
- "Were there any flood periods?"
- "Are there long-standing or chattering alarms I should care about?"

#### `scada-structure-summary`

Intended for:

- bounded structure reconstruction before deeper investigation or reporting
- finding the operationally important parts of a scope without dumping the whole object tree

Should be able to:

- identify the main object groups, recurring templates, and immediately relevant neighbors inside the requested scope
- nominate candidate measurements, states, counters, and control-related points for follow-up
- distinguish structural uncertainty from true absence of data
- return compact `scope_findings` that help the owner decide what to inspect next

Typical questions:

- "What are the important assets in this scope?"
- "How is this area structured operationally?"
- "Which signals should I inspect first here?"
- "What neighboring scopes or linked assets matter for this investigation?"

#### `scada-history-analysis`

Intended for:

- compact expert-style interpretation of selected history rather than raw plot retrieval
- turning trends, snapshots, and aggregates into bounded judgments

Should be able to:

- combine history, snapshot, aggregate, and data-quality inputs for a selected set of signals
- classify behavior such as stable, drifting, oscillating, stepped, frozen, or unusual
- recommend focused follow-up checks instead of returning raw evidence dumps
- preserve confidence and completeness when signal meaning or evidence quality is limited

Typical questions:

- "Are these signals stable or behaving abnormally?"
- "Does this trend look stuck or just unchanged?"
- "Which of these selected points changed meaningfully during the event window?"
- "What should I follow up on after the alarm burst?"

### 10.3 Orchestrated composite workflow skills

These skills stay owned by `main-supervisor`, which combines direct skills, RAG lookups, and specialist findings.

| Workflow | Purpose | Execution | Owner | Delegates | Semantics dependency |
|---|---|---|---|---|---|
| `scada-incident-review` | Alarm -> context -> history -> timeline reconstruction | `orchestrated` | `main-supervisor` | `alarm-analyst`, `history-analyst` as needed | optional project/domain knowledge RAG |
| `scada-scope-snapshot` | Reconstruct the state of a scope at a past time | `orchestrated` | `main-supervisor` | `project-structure-specialist` as needed | usually KB-guided via project/domain knowledge RAG |
| `scada-scope-situation` | Structure + alarms + targeted history + synthesis into a whole-scope situation picture | `orchestrated` | `main-supervisor` | `project-structure-specialist`, `alarm-analyst`, `history-analyst` | optional project/domain knowledge RAG |

#### `scada-incident-review`

Intended for:

- time-bounded investigations where the user wants to understand what happened, in what order, and with what evidence
- reconstructing a usable timeline from alarms, historical signals, and present context

Should be able to:

- identify the relevant window, scope, and candidate signals
- gather alarm rows, supporting history, and snapshots around the event
- assemble a typed timeline with uncertainty notes when causality cannot be proven
- distinguish direct evidence, inferred sequence, and unresolved gaps

Typical questions:

- "Review this incident and summarize what happened."
- "What changed first during the disturbance window?"
- "Can you reconstruct the sequence around this alarm burst?"
- "What evidence supports the likely timeline?"

#### `scada-scope-snapshot`

Intended for:

- past-state reconstruction for a whole scope, not just one tag
- historical "what did this scope look like at that moment?" questions

Should be able to:

- determine which objects and fields belong in the snapshot
- combine structure knowledge with historical point snapshots
- surface missing or non-archived fields instead of silently inventing completeness
- produce a compact, reviewable past-state artifact rather than a raw data dump

Typical questions:

- "What was the state of this area at 08:00?"
- "Reconstruct the scope at the start of the outage window."
- "Show the key historical values and statuses for this scope at a given moment."

#### `scada-scope-situation`

Intended for:

- whole-scope understanding rather than one-domain answers
- combining structure, current state, alarms, and selected history into one operator-facing situation picture

Should be able to:

- decide which direct and delegated checks are needed for the requested scope
- synthesize structure findings, recent alarms, current values, and targeted historical evidence
- separate confirmed facts, plausible interpretations, and open questions
- produce a concise answer that helps the user decide what to inspect next

Typical questions:

- "What is going on in this scope right now?"
- "Summarize the current situation in this area."
- "What changed in this scope over the last few hours?"
- "Give me the important picture without dumping all the raw data."

### 10.4 Orchestrated report workflow skills

These skills remain owned by `main-supervisor`, which gathers findings and then applies the shared chat renderer or installed presentation/export skills.

| Workflow | Purpose | Execution | Owner | Delegates / inputs | Review policy |
|---|---|---|---|---|---|
| `scada-alarm-report` | Formal alarm management report | `orchestrated` | `main-supervisor` | `alarm-analyst` + shared renderer or export/presentation skills | review may be added later; outputs must carry warnings/provenance directly |
| `scada-production-report` | Production, throughput, consumption, or totalization summaries | `orchestrated` | `main-supervisor` | direct skills, optional `project-structure-specialist`, project/domain knowledge RAG, shared renderer or export/presentation skills | same |
| `scada-availability-report` | Running/stopped/fault durations and availability metrics | `orchestrated` | `main-supervisor` | `history-analyst`, optional `project-structure-specialist`, project/domain knowledge RAG, shared renderer or export/presentation skills | same |
| `scada-period-summary` | Shift/day/week/month summary across alarms and key metrics | `orchestrated` | `main-supervisor` | `alarm-analyst`, direct skills, shared renderer or export/presentation skills | no review for lightweight chat recap; formal reports may add review later |

#### `scada-alarm-report`

Intended for:

- formalized alarm review outputs rather than conversational alarm summaries
- recurring alarm reporting for operations, engineering, or management audiences

Should be able to:

- gather the right alarm window, scope, and summary metrics
- present totals, dominant contributors, exceptions, and quality caveats in a stable structure
- feed renderer/export skills without re-querying the data
- support both quick chat output and later export surfaces

Typical questions:

- "Create an alarm report for this period."
- "Prepare a formal alarm summary for the last shift."
- "Export the alarm KPIs and top offenders."

#### `scada-production-report`

Intended for:

- reportable totals derived from authoritative counters, totals, or published summary signals
- throughput, production, consumption, and similar business-adjacent quantity summaries

Should be able to:

- use KB-guided field selection when multiple candidate signals exist
- compute or summarize totals over the requested period
- preserve source selection, quality, and completeness in the report output
- make clear when the result depends on deployment-specific semantics

Typical questions:

- "Prepare the production report for yesterday."
- "Summarize throughput totals for this unit."
- "Which totals should be used for the daily report?"

#### `scada-availability-report`

Intended for:

- duration-based reporting on running, stopped, faulted, idle, or otherwise stateful assets
- availability-style metrics that require agreed state semantics

Should be able to:

- determine the authoritative state field and value mapping for the requested asset family
- compute duration buckets over the requested period
- distinguish planned unavailability from unexplained downtime when maintenance context exists
- return report-ready tables plus caveats about missing semantics or incomplete history

Typical questions:

- "Prepare an availability report for these assets."
- "How long was this unit running, stopped, or faulted?"
- "What was the uptime over the last week?"

#### `scada-period-summary`

Intended for:

- lightweight operational summaries for a bounded reporting period
- combining alarm activity and a selected set of key metrics into one digest

Should be able to:

- gather alarm evidence plus direct metric summaries for the same window
- adapt the amount of detail to chat recap versus formal summary use
- preserve provenance and partiality so a digest is not mistaken for exhaustive evidence
- serve as a reusable input to handover or recurring review workflows

Typical questions:

- "Summarize the last shift."
- "Give me a daily recap for this scope."
- "What were the key alarms and metrics during this period?"

### 10.5 Presentation boundary and export skills

The current repository has two presentation mechanisms:

- the shared chat renderer behind `skill_run(format: "chat")`
- one installed export skill: `report-spreadsheet-export`

Current baseline surface:

| Surface | Consumes | Output | Contract |
|---|---|---|---|
| `skill_run(format: "chat")` | `history_view`, `snapshot_view`, `aggregate_table`, `alarm_list`, `alarm_summary`, `scope_view`, `coverage_view` | plain markdown text | implemented by the shared renderer in `skills-core`; not a separate skill |
| `report-spreadsheet-export` | ViewModelContract kinds whose blocks are supported by `workspace/skills/report-spreadsheet-export/index.js` | CSV file under `workspace/exports/` plus a returned pointer artifact | returns `metadata.export_path`, `metadata.format = "csv"`, and `metadata.source_kind`; rejects unsupported block kinds |

Presentation rules:

- presentation surfaces consume typed artifacts only
- presentation surfaces must not query SCADA tools directly
- unsupported input kinds or block kinds must fail clearly instead of silently dropping content

#### `report-spreadsheet-export`

Intended for:

- exporting an already-produced typed artifact into a file that users can share or review outside chat
- keeping export logic separate from data retrieval logic

Should be able to:

- accept raw ViewModel JSON rather than rendered markdown
- serialize supported block kinds into a stable CSV layout
- return a pointer artifact with export metadata instead of embedding the whole file in chat
- fail clearly when the input kind is unsupported

Typical questions:

- "Export this summary to CSV."
- "Save the alarm list as a spreadsheet."
- "Turn this aggregate result into a downloadable table."

Reserved extension slots:

- if richer presentation skills such as `report-browser-preview`, `report-pdf-export`, or `report-canvas-view` are added later, they must follow the same rule: consume typed artifacts only, declare supported input kinds explicitly, and return a pointer artifact plus metadata rather than querying data themselves

---

## 11. Routing and Ownership Rules

### 11.1 Direct routing rules

Direct routing is appropriate only when the question is narrow enough that `main-supervisor` does not need to combine multiple heavy evidence streams.

- known tag + trend/history -> `scada-point-history`
- known tag + exact time -> `scada-point-snapshot`
- aggregate/statistics question -> `scada-period-aggregates`
- peak + when -> `scada-period-aggregates` in `json`, then `scada-point-history`
- archive coverage question -> `scada-archive-coverage`
- raw alarm retrieval question -> `scada-alarm-list`
- data-freshness/gap question -> `scada-data-quality`
- scope-wide current/config read across matching objects -> `scada-object-explore`
- current scope summary with explicit field set -> `scada-object-explore`
- unknown object or vague asset reference -> `scada-object-explore` first

### 11.2 Delegation and orchestration rules

- standalone alarm KPI/statistics requests -> `scada-alarm-summary`
- structure reconstruction and key-signal nomination -> `scada-structure-summary`
- targeted selected-point behavior analysis -> `scada-history-analysis`
- whole-scope situation questions -> `scada-scope-situation`
- formal report requests -> route to the matching report skill, still owned by `main-supervisor`

Canonical orchestration rule:

```text
if (one domain is sufficient)
    -> direct skill or standalone specialist-facing skill
else
    -> owner workflow skill in main-supervisor
    -> delegate bounded evidence checks to specialists
    -> merge findings
    -> present the final answer
```

### 11.3 Ownership rules

- `main-supervisor` owns user interaction, clarification, and final sufficiency judgment.
- `main-supervisor` routes to skill/workflow names, not specialist persona names.
- `main-supervisor` remains the default user-facing voice.
- analyst specialists should return compact findings, not raw evidence dumps.
- the owner agent preserves warnings, provenance, and completeness in the final answer.

### 11.4 Chaining rules

- data skill first, presentation second
- use typed artifacts between workflow stages
- do not parse markdown as machine input when a typed artifact is available
- delegate to specialists only after the scope and question are specific enough for bounded analysis

### 11.5 Semantics stop rules

Stop and ask for clarification when the workflow depends on missing semantics such as:

- which field represents state
- which values mean running/stopped/fault
- which signals count toward totals or throughput
- which fields define the important state of a scope
- whether a constant signal is normal or suspicious
- vague report requests that omit scope, period, or focus

When project-specific meaning may exist in `PROJECT_KB` or the project/domain knowledge RAG, consult that source before asking the user to restate information that the system should already know.

Fallback sequence:

1. query `project_kb_query` when it is available in the active agent
2. if the tool reports low confidence, `needs_clarification`, or no useful answer, read the cited/local `PROJECT_KB` files directly when the workspace exposes them
3. if the semantics are optional, continue with the pure Layer 1 path while surfacing the semantics gap
4. if the semantics are required for correctness, ask the user a focused clarification question instead of guessing

---

## 12. Skill-to-Agent Routing Matrix

| User need / workflow | Skill interface | Execution mode | Runs in context | Skills involved | Raw tools involved |
|---|---|---|---|---|---|
| Known tag trend | `scada-point-history` | `direct` | `main-supervisor` | `scada-point-history` | `field_read_history` |
| Known tag exact-time value | `scada-point-snapshot` | `direct` | `main-supervisor` | `scada-point-snapshot` | `field_snapshot` |
| Aggregates by period | `scada-period-aggregates` | `direct` | `main-supervisor` | `scada-period-aggregates` | `field_aggregates` |
| Scope-wide current/config reads across matching objects | `scada-object-explore` | `direct` | `main-supervisor` | `scada-object-explore` | `ecomet_search`, optional `ecomet_read` |
| Archive coverage audit | `scada-archive-coverage` | `direct` | `main-supervisor` | `scada-archive-coverage` | `archive_resolve`, optional `ecomet_search` |
| Raw alarm retrieval | `scada-alarm-list` | `direct` | `main-supervisor` | `scada-alarm-list` | `alarm_query` |
| Alarm KPIs / flood / top offenders | `scada-alarm-summary` | `delegated` | `alarm-analyst` | `scada-alarm-list`, `scada-alarm-summary`, optional project/domain knowledge RAG | no direct raw tools in target design |
| Structure reconstruction / key signal nomination | `scada-structure-summary` | `delegated` | `project-structure-specialist` | `scada-object-explore`, optional project/domain knowledge RAG | no direct raw tools in target design |
| Targeted history analysis | `scada-history-analysis` | `delegated` | `history-analyst` | `scada-point-history`, `scada-point-snapshot`, `scada-period-aggregates`, `scada-data-quality`, optional project/domain knowledge RAG | no direct raw tools in target design |
| Current scope summary with explicit fields | `scada-object-explore` | `direct` | `main-supervisor` | `scada-object-explore` | `ecomet_search`, optional `ecomet_read` |
| Data freshness / gaps | `scada-data-quality` | `direct` | `main-supervisor` | `scada-data-quality` | `field_read_history`, `archive_resolve`, `ecomet_read` |
| Incident review | `scada-incident-review` | `orchestrated` | `main-supervisor` | direct skills, `alarm-analyst`, `history-analyst`, optional project/domain knowledge RAG | indirect through narrow skills |
| Scope snapshot with KB-selected fields | `scada-scope-snapshot` | `orchestrated` | `main-supervisor` | `scada-object-explore`, `scada-point-snapshot`, optional `project-structure-specialist`, optional project/domain knowledge RAG | indirect through narrow skills |
| Whole-scope situation assessment | `scada-scope-situation` | `orchestrated` | `main-supervisor` | `scada-structure-summary`, `scada-alarm-summary`, `scada-history-analysis`, optional project/domain knowledge RAG | indirect through narrow skills |
| Alarm report | `scada-alarm-report` | `orchestrated` | `main-supervisor` | `alarm-analyst`, shared renderer or export/presentation skills | no direct raw tools in target design |
| Production report | `scada-production-report` | `orchestrated` | `main-supervisor` | direct skills, optional `project-structure-specialist`, project/domain knowledge RAG, shared renderer or export/presentation skills | indirect through narrow skills |
| Availability report | `scada-availability-report` | `orchestrated` | `main-supervisor` | `history-analyst`, optional `project-structure-specialist`, project/domain knowledge RAG, shared renderer or export/presentation skills | indirect through narrow skills |
| Shift/day/month summary | `scada-period-summary` | `orchestrated` | `main-supervisor` | `alarm-analyst`, direct skills, shared renderer or export/presentation skills | indirect through narrow skills |

---

## 13. Deployment and Workspace Model

The canonical deployment model is:

```text
workspace/
  AGENTS.md
  TOOLS.md
  PROJECT_KB/
    ...
  skills/
    <main workspace skills>
workspace-alarm-analyst/
  AGENTS.md
  TOOLS.md
  skills/
    <alarm-only skills>
workspace-project-structure-specialist/
  AGENTS.md
  TOOLS.md
  skills/
    <structure-analysis skills>
workspace-history-analyst/
  AGENTS.md
  TOOLS.md
  skills/
    <history-analysis skills>
extensions/
  ecomet-connector/
    index.ts
    src/chat-renderer.ts
  project-knowledge-tool/
    <OpenClaw tool/plugin exposing `project_kb_query`>
services/
  project-knowledge-service/
    <neighboring retrieval service over PROJECT_KB and domain corpus>
openclaw.json
  <agent registry binding ids, workspaces, models, tools, and skills>
```

Rules:

- `workspace/AGENTS.md` must contain the concise specialist roster and top-level routing policy for `main-supervisor`
- `workspace/AGENTS.md` must also carry any delegation guidance that needs to survive sub-agent handoff, including how `agents_list` and `sessions_spawn` are used in this deployment
- `workspace/TOOLS.md` should remain a concise local-notes file for workspace-specific tool caveats, aliases, or environment details; it is not the authoritative tool inventory
- higher-level workflows such as `scada-scope-situation` and `scada-incident-review` should be implemented as normal skills under `workspace/skills/`
- complex orchestration pseudocode should live in those workflow skills' `SKILL.md` files, not in a separate non-native directory
- skills live in the active agent workspace under `skills/`
- `ecomet-connector` provides the raw SCADA tools plus `skill_run`
- `project-knowledge-tool` provides `project_kb_query`
- `skill_run` executes workspace skills in-process
- plugin loading and per-agent tool access are separate concerns: a plugin may be loaded globally once, but each agent still needs the corresponding tool allowed by its `tools` policy in `openclaw.json`
- analyst specialists use separate workspaces when they need a narrower skill surface
- the runtime agent registry declares which specialist ids exist and what each specialist can use
- the main agent's subagent policy must allow only the intended specialist ids
- specialist agents should remain leaf workers in this blueprint, so nested spawning should stay disabled
- each specialist workspace `AGENTS.md` must explicitly describe the specialist role, scope boundaries, default output kinds, stop rules, and any stable evidence/quality expectations; it may mention typical local skills for discoverability, but it should not duplicate the full visible skill surface or runtime allowlist
- specialist `TOOLS.md` files may stay minimal unless that workspace has local tool notes worth injecting
- project-specific interpretation should come through `project_kb_query`, not from a separate conversational KB specialist
- `project_kb_query` should proxy to the neighboring retrieval service over `PROJECT_KB` and the domain corpus
- use `~/.openclaw/skills` or `skills.load.extraDirs` for skills that should be shared across several agents
- use `<workspace>/skills` for workspace-private workflow skills and workspace-local overrides
- the current repository still uses mirrored copies for some specialist-visible skills; treat that as repository state, not as the preferred OpenClaw-native steady state
- if mirrored copies remain temporarily, they must be generated/synchronized from one canonical source and must not drift

---

## 14. Development Guardrails

When building Layer 1 skills and workflows:

- do not create one sub-agent per narrow skill
- do not let presentation skills query Ecomet directly
- prefer narrow skills over raw tools once a narrow skill exists
- keep delegated contexts narrow and auditable
- do not let analyst specialists return raw evidence dumps when compact findings will do
- do not introduce a separate conversational project-KB specialist when shared RAG retrieval is sufficient
- preserve invalid/unresolved/partial conditions instead of smoothing them over
- use explicit defaults for time windows and limits inside modules, not in free-form agent reasoning
- preserve warning, provenance, and completeness fields all the way to presentation
- evolve contracts additively by default; prefer adding fields over renaming or removing existing ones
- if a breaking typed-artifact change becomes unavoidable, add an explicit `contract_version` field and update the renderers/exporters/workflow skills in the same change

---

## 15. Bottom Line

Layer 1 is a skill-first SCADA architecture built on:

- deterministic narrow data skills
- a shared typed view-model contract
- a separate presentation layer
- a supervisor-worker agent model with a small number of bounded analyst specialists
- shared project knowledge RAG where project-specific meaning is needed
- explicit ownership and delivery rules for delegated workflows

In the canonical design:

- `main-supervisor` owns complex workflows and final synthesis
- specialists are explicit, narrow, registry-declared analyst coworkers
- project and domain semantics come from shared retrieval over `PROJECT_KB`
- specialist findings return as typed artifacts that `main-supervisor` can combine into a larger picture

This blueprint therefore assumes an end-state OpenClaw deployment where:

- specialist delegation transport is provided natively by OpenClaw
- shared project-knowledge retrieval is provided through an OpenClaw tool/plugin
- typed artifact return is enforced by the Layer 1 skill and prompt contract on top of the native OpenClaw session tools

---

## 16. External References

These references informed the blueprint, but the implementation mechanism should be understandable from this document alone:

- OpenClaw Sub-Agents: https://docs.openclaw.ai/tools/subagents
- OpenClaw Multi-Agent Routing: https://docs.openclaw.ai/concepts/multi-agent
- OpenClaw Agent Runtime: https://docs.openclaw.ai/concepts/agent
- OpenClaw AGENTS.md Template: https://docs.openclaw.ai/reference/templates/AGENTS
- OpenClaw TOOLS.md Template: https://docs.openclaw.ai/reference/templates/TOOLS
- OpenClaw System Prompt: https://docs.openclaw.ai/concepts/system-prompt
- Anthropic Agent SDK Subagents: https://platform.claude.com/docs/en/agent-sdk/subagents
- Anthropic, "Writing effective tools for AI agents" (2025-09-11): https://www.anthropic.com/engineering/writing-tools-for-agents
- Siemens, "AI for industry: Schaeffler and Siemens bring Industrial Copilot to shopfloor" (2023-11-14): https://press.siemens.com/global/en/pressrelease/ai-industry-schaeffler-and-siemens-bring-industrial-copilot-shopfloor
- Siemens, "Partnership empowers the shopfloor" (accessed 2026-03-20): https://www.siemens.com/en-us/company/insights/servicenow-it-ot-sinec-security-guard/
- ISA18, Instrument Signals and Alarms committee scope and purpose: https://www.isa.org/standards-and-publications/isa-standards/isa-standards-committees/isa18
- Ericsson, "Explainable AI – how humans can trust AI": https://www.ericsson.com/en/reports-and-papers/white-papers/explainable-ai--how-humans-can-trust-ai
