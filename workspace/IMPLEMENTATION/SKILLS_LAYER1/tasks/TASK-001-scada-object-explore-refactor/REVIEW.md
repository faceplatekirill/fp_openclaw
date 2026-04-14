# Review: scada-object-explore refactor

**Verdict:** Needs Changes

## Checklist

- [ ] Input/output contracts match `CONTRACTS.md`
- [x] Output conforms to the canonical contract on successful direct-module executions
- [x] Required output sections, metadata, and signals are present on successful direct-module executions
- [ ] All atomic steps completed
- [x] Static routing or boundary review completed
- [ ] Routing or selection fixtures pass
- [ ] Runtime selection verification completed
- [ ] Runtime application verification completed
- [x] Runtime verification evidence captured
- [ ] Output fixtures pass
- [ ] Edge case fixtures pass
- [ ] All unit tests executed by Architect: not all passing
- [ ] All integration or system tests executed by Architect: not all passing
- [ ] Zero skipped required tests
- [ ] Architecture and dependency boundaries respected
- [x] No hardcoded configuration or secrets
- [ ] Required warnings, partiality signals, and audit metadata handled correctly
- [ ] Definition of Done satisfied

## Issues
### Issue 1: Default `searchText` targeting is aligned to `.fp_path`, not `.name`
**Severity:** Blocker
**File:** `workspace/skills/scada-object-explore/index.js:5`, `workspace/skills/scada-object-explore/SKILL.md:74`, `workspace/skills/scada-object-explore/SEARCH-PATTERNS.md:83`
**Problem:** Roman clarified that omitted `searchIn` should default to `.name`, not `.fp_path`. The current implementation and docs still default to `.fp_path`, and the changed validation coverage also reflects that older behavior.
**Fix:** Change the default search target to `[".name"]` and update the docs and validation expectations so the canonical behavior is consistent across runtime, skill docs, and tests.

### Issue 2: The changed validation suite is still red on the field-filter branch
**Severity:** Blocker
**File:** `workspace/extensions/ecomet-connector/__tests__/unit/direct-skills-validation.test.ts:2551`
**Problem:** With Roman's accepted decision on generic removed-param errors, the remaining task-specific direct-module failure is the non-recursive field-filter case. The changed test still expects `vclass = '220'`, while the preserved `searchObjects(...)` path currently emits `vclass := '220'` strict comparison.
**Fix:** Decide which behavior is canonical for this refactor and make the code and changed tests agree. If strict comparison from `searchObjects(...)` is the intended preserved behavior, update the changed test accordingly; otherwise adjust the wrapper so the query semantics match the documented expectation.

### Issue 3: `types_info` still exposes an underspecified tool schema to the real runtime
**Severity:** Blocker
**File:** `workspace/extensions/ecomet-connector/index.ts:928`
**Problem:** The object branch of the `types_info` schema allows `{}`. In architect runtime fixture `skill-verify-scada-object-explore-rv3-run-1`, the agent called `types_info({})`, received `types_info object request must contain at least one type path`, and then stopped without completing the schema-first answer. This is a task-level failure in the required runtime verification path.
**Fix:** Tighten the tool schema so the object form requires at least one type-path key and include an explicit example such as `{ "/root/FP/prototypes/point/fields": "*" }`. The runtime should not be able to choose an empty object that the contract rejects immediately.

### Issue 4: The runtime-facing KB references do not resolve in the gateway workspace
**Severity:** Blocker
**File:** `workspace/skills/scada-object-explore/SKILL.md:10`, `workspace/skills/scada-object-explore/SKILL.md:23`
**Problem:** Architect runtime fixtures `skill-verify-scada-object-explore-rv1-run-1` and `skill-verify-scada-object-explore-rv4-run-1` both attempted to read `PROJECT_KB/structure/project-model.md` and `PROJECT_KB/structure/field-boundaries.md`, and both reads failed with `ENOENT` inside the real gateway workspace. The workflow therefore points the agent at references it cannot open during runtime validation.
**Fix:** Resolve these references with runtime-accessible links or mirrored workspace paths instead of bare unresolved `PROJECT_KB/...` paths, and keep the `Must Read First` section plus routing pseudocode aligned to those resolvable targets.

### Issue 5: Timeout recovery is missing from the workflow guidance
**Severity:** Major
**File:** `workspace/skills/scada-object-explore/SKILL.md:56`, `workspace/skills/scada-object-explore/SEARCH-PATTERNS.md:114`
**Problem:** Roman requested explicit timeout recovery guidance: if a broad search times out, the workflow should reduce the limit and retry. In architect runtime fixture `skill-verify-scada-object-explore-rv1-run-1`, the run only succeeded after ad hoc retries with a smaller search. The current feedback loops do not teach that recovery path.
**Fix:** Add a feedback-loop rule and a search-pattern note that says: on search timeout, reduce `limit`, narrow the scope or selected fields if needed, and retry before continuing the workflow.

### Issue 6: Required runtime fixtures RV-2, RV-3, and RV-4 are not passing
**Severity:** Blocker
**File:** `workspace/skills/scada-object-explore/SKILL.md:33`
**Problem:** The required runtime verification for this task is still incomplete. RV-2 never reached `ecomet_read` and instead asked for a follow-up field list with no tool usage. RV-3 mis-called `types_info({})`, failed, and then suggested `ecomet_indexes` instead of completing the documented schema-first branch. RV-4 used `skill_run` once, but the final answer admitted the first pass was too broad and asked the user to continue, so the documented exhaustive-scope workflow was not actually completed.
**Fix:** Adjust the runtime-facing instructions and tool schemas so the known-path branch reliably reaches `ecomet_read`, the schema-first branch produces a valid `types_info` call, and the exhaustive-scope branch either continues automatically or clearly proves that one page already covered the requested scope.
## Notes

- Roman comment applied: the generic `Unexpected parameter...` behavior for removed object-explore params is accepted and is no longer treated as a blocking review finding. The related validation expectations should be updated instead of forcing the implementation to emit special-case messages.
- Architect static readiness checks passed:
  - `docker exec openclaw-openclaw-gateway-1 sh -lc 'openclaw skills list --json --eligible'`
  - `docker exec openclaw-openclaw-gateway-1 sh -lc 'openclaw skills info scada-object-explore --json'`
  - `docker exec openclaw-openclaw-gateway-1 sh -lc 'openclaw skills check --json'`
- Architect test runs:
  - `node workspace/libs/ecomet-core/__tests__/unit/index-registry.test.ts` ran 3 times: `10 passed, 0 failed` each run
  - `node workspace/libs/ecomet-core/__tests__/unit/m1-fixtures.test.ts` ran 3 times: `3 passed, 0 failed` each run
  - `node workspace/extensions/ecomet-connector/__tests__/unit/direct-skills-validation.test.ts` ran 3 times: `54 passed, 4 failed` each run
  - `npx --yes tsx workspace/extensions/ecomet-connector/__tests__/integration/direct-skills-validation.test.ts` ran 3 times: `1 passed, 41 failed` each run
  - `npx --yes tsx workspace/extensions/ecomet-connector/__tests__/integration/direct-skills-m1.test.ts` ran 3 times: `0 passed, 14 failed` each run
- In the `54 passed, 4 failed` direct-module suite, 3 failures are the now-accepted removed-param wording expectations; the remaining unresolved task-specific failure is the field-filter branch described above.
- The broad `tsx`-driven connector suites are still failing far outside this task, including pre-existing bridge/loader issues such as `Skill run error: TAG_KEYS is not iterable`, `TIME_RANGE_KEYS is not iterable`, and other non-object-explore failures. Those broader failures do not remove the task-specific blockers above; they are additional reasons approval cannot be granted yet.
- Runtime fixtures attempted by Architect:
  - `RV-1` session `skill-verify-scada-object-explore-rv1-run-1`: selection/application evidence present via `skill_run(scada-object-explore)`, but only after earlier syntax-error and timeout retries
  - `RV-2` session `skill-verify-scada-object-explore-rv2-run-1`: no tool call, so not runtime-verified
  - `RV-3` session `skill-verify-scada-object-explore-rv3-run-1`: `types_info({})` error, so not runtime-verified
  - `RV-4` session `skill-verify-scada-object-explore-rv4-run-1`: one `skill_run(scada-object-explore)` call observed, but no evidence of the required exhaustive-scope completion loop
