# Runtime Verification: scada-object-explore refactor

Use this task-specific file together with:

- `IMPLEMENTATION/SKILLS_LAYER1/OPENCLAW-RUNTIME-VERIFICATION.md`

## Static Readiness

Before runtime prompting, verify:

- `scada-object-explore` is eligible
- its visible description reflects the refactored concise routing text
- the skill docs show the workflow branches for:
  - current state of a scope -> stay in `scada-object-explore`
  - schema-first questions -> `PROJECT_KB` + `types_info`
  - known paths -> `ecomet_read`
  - discovery / scope reads -> search-driven path
- the skill docs describe only canonical public params and point detailed recipes to `SEARCH-PATTERNS.md`
- the YAML `description` is the main trigger/discovery text rather than a workflow dump
- the main `SKILL.md` body includes workflow guidance, canonical param explanations, a short checklist, and only a couple of representative examples using `select`, not `read_fields`
- the main `SKILL.md` body includes explicit feedback loops for correction/retry, schema-first continuation, known-path continuation, and paging continuation
- the connector tool surface includes:
  - `ecomet_indexes` without fallback-only framing
  - new `types_info`

Suggested commands:

```bash
docker exec openclaw-openclaw-gateway-1 sh -lc 'openclaw skills info scada-object-explore --json'
docker exec openclaw-openclaw-gateway-1 sh -lc 'openclaw skills check --json'
```

Also statically inspect:

```bash
sed -n '780,920p' workspace/extensions/ecomet-connector/index.ts
```

## Runtime Fixtures

### RV-1

**Prompt:** `Find all breaker-like objects under this station and show their current state fields.`

**Selection proof target:**

- preferred: a `skill_run` trace naming `scada-object-explore`
- fallback: the first observable execution path is the search-driven scope-read path unique to `scada-object-explore`

**Application proof target:**

- observed search-driven execution path
- final output consistent with `scope_view`
- requested fields appear on returned objects

**Wrong-path check:**

- `ecomet_read` must not be the first observed path

### RV-2

**Prompt:** `Read the current fields for these exact object paths: <known paths here>.`

**Selection proof target:**

- runtime follows the known-path branch documented by `scada-object-explore`

**Application proof target:**

- direct `ecomet_read` behavior is observed
- no initial search-driven discovery path is observed

**Wrong-path check:**

- `searchObjects(...)` must not be used first when exact paths are already supplied

### RV-3

**Prompt:** `What fields does this type have, and which of them are indexed?`

**Selection proof target:**

- runtime follows the schema-first branch documented by `scada-object-explore`

**Application proof target:**

- `PROJECT_KB` is part of the documented schema-first guidance for semantics
- `types_info` is called before any search-driven object read
- the response does not rely on KB memory alone

**Wrong-path check:**

- a search-driven object read must not happen before schema discovery when the prompt is schema-first

### RV-4

**Prompt:** `Find all matching objects under this station and show their current state fields.`

**Selection proof target:**

- runtime follows the discovery / scope-read branch documented by `scada-object-explore`

**Application proof target:**

- if the first page is partial, runtime issues follow-up paged calls with increasing `offset`
- the final answer reflects the requested all-match scope rather than the first page only

**Wrong-path check:**

- `ecomet_read` must not be used merely because more than one page is needed
- the run must not stop after the first partial page when the prompt explicitly says `all`

## Reporting Requirements

For each runtime fixture capture:

- exact prompt
- session id
- command used
- selection evidence
- application evidence
- wrong-path result
- final contract check
- verdict: `pass`, `fail`, or `not runtime-verified`
