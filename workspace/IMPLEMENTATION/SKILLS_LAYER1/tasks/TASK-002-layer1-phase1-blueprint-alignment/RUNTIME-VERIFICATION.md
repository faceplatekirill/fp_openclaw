# Runtime Verification: Layer 1 Phase 1 blueprint alignment

Use this task-specific file together with:

- `IMPLEMENTATION/SKILLS_LAYER1/OPENCLAW-RUNTIME-VERIFICATION.md`

## Scope

This Phase 1 task verifies the representative existing implemented surface. It does not attempt to verify later-phase runtime behavior such as:

- `project_kb_query`
- additional specialist workspaces
- delegated finding artifacts
- missing orchestrated or report workflows

Representative runtime targets for this phase:

- `scada-object-explore`
- `scada-point-history`
- `scada-alarm-list`
- `scada-alarm-summary`

## Static Readiness

Before runtime prompting, verify:

- each representative skill is eligible in the current runtime
- the visible descriptions for those skills reflect the aligned current-surface wording
- the runtime still exposes agent id `main`
- the current docs explicitly describe `main` as the implementation of blueprint role `main-supervisor`

Suggested commands:

```bash
docker exec openclaw-openclaw-gateway-1 sh -lc 'openclaw skills list --json --eligible'
docker exec openclaw-openclaw-gateway-1 sh -lc 'openclaw skills info scada-object-explore --json'
docker exec openclaw-openclaw-gateway-1 sh -lc 'openclaw skills info scada-point-history --json'
docker exec openclaw-openclaw-gateway-1 sh -lc 'openclaw skills info scada-alarm-list --json'
docker exec openclaw-openclaw-gateway-1 sh -lc 'openclaw skills info scada-alarm-summary --json'
docker exec openclaw-openclaw-gateway-1 sh -lc 'openclaw skills check --json'
```

## Runtime Fixtures

### RV-1: Object Explore Current-Scope Path

**Prompt:** `Show the current state of matching breaker-like objects under AKMOLA 220.`

**Selection proof target:**

- preferred: a `skill_run` trace naming `scada-object-explore`
- fallback: the first observable execution path is clearly the object-discovery or current-scope path unique to `scada-object-explore`

**Application proof target:**

- a search-driven scope-read path is observed before the final answer
- the final output is consistent with an object-explore answer rather than a raw-tool improvisation

**Wrong-path check:**

- no first-path raw-tool-only improvisation
- no retired `scada-current-scope` expectation

### RV-2: Point History Remains Distinct

**Prompt:** `Show the history for <real known archived tag> over the last hour.`

**Precondition:** If a real archived tag is not already known, discover one first and record the chosen object path and field in `REPORT.md` before replaying this fixture.

**Selection proof target:**

- preferred: a `skill_run` trace naming `scada-point-history`
- fallback: the first observable execution path is clearly the history path

**Application proof target:**

- history-specific execution is observed
- the response preserves the requested one-hour window

**Wrong-path check:**

- snapshot is not the first observed path
- aggregates are not the first observed path

### RV-3: Alarm Rows Stay On Alarm List

**Prompt:** `Show alarms in AKMOLA 220 for the last 24 hours.`

**Selection proof target:**

- preferred: a `skill_run` trace naming `scada-alarm-list`
- fallback: the first observable execution path is clearly row-oriented alarm retrieval

**Application proof target:**

- row-oriented alarm retrieval occurs before any summary framing
- if the response is partial, the result surfaces pagination or completeness behavior rather than pretending completeness

**Wrong-path check:**

- `scada-alarm-summary` is not the first observed path

### RV-4: Alarm Analytics Stay On Alarm Summary

**Prompt:** `Give me an alarm summary for AKMOLA 220 for the last 24 hours.`

**Selection proof target:**

- preferred: a `skill_run` trace naming `scada-alarm-summary`
- fallback: the first observable execution path is clearly alarm analytics rather than raw rows

**Application proof target:**

- analytics-oriented alarm-summary behavior is observed before final answer text
- the answer behaves like summary output rather than plain row listing

**Wrong-path check:**

- `scada-alarm-list` is not the first observed path

## Reporting Requirements

For each runtime fixture capture:

- exact prompt
- any substituted real path or scope if a substitution was necessary
- session id
- command used
- selection evidence
- application evidence
- wrong-path result
- final contract check
- verdict: `pass`, `fail`, or `not runtime-verified`

## Phase 1 Pass Rule

This task passes runtime verification only when:

- static readiness is confirmed for the representative skills
- each representative fixture has a recorded verdict
- any non-pass result is explicitly recorded instead of hand-waved
- the evidence supports the aligned current-surface docs rather than a retired intermediate surface
