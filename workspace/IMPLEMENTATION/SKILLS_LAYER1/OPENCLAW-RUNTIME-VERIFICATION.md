# OpenClaw Runtime Verification Guide

Use this companion file together with the generic role docs:

- `workspace/ROLES/skills_architect_role.md`
- `workspace/ROLES/skills_developer_role.md`

This guide is instance-specific. It explains how to verify skill selection and skill application against a real OpenClaw runtime. It does not replace the generic role responsibilities.

---

# Purpose

When a task requires proof against a real OpenClaw agent, verify three different things:

1. **Static readiness**: the skill is installed, eligible, and described as expected.
2. **Runtime selection**: the real agent chooses the expected skill or capability path for the fixture prompt.
3. **Runtime application**: the chosen skill's actual execution path runs, not just a plausible final answer.

Do not treat a correct-looking final answer as sufficient proof by itself.

---

# Who Does What

## Skills Developer

- Run the fixture prompts against the real OpenClaw runtime.
- Collect raw evidence: CLI output, session ids, session JSONL traces, and observable execution records.
- Record the exact commands used and the results in `REPORT.md`.
- If evidence is missing or ambiguous, report that explicitly instead of claiming success.

## Skills Architect

- Define what counts as selection proof and application proof for each task.
- Re-run representative runtime fixtures independently before approval.
- Reject approval if required runtime proof is missing, ambiguous, skipped, or only inferred from the final answer.

---

# Verified Access Path For This Instance

Observed on **March 17, 2026** in this repository:

- The OpenClaw gateway is running locally.
- The practical CLI entrypoint is inside Docker container `openclaw-openclaw-gateway-1`.
- Session traces are written under `/home/node/.openclaw/agents/main/sessions/` inside that container.

If `openclaw` is available directly on the host in a future setup, you can use the same commands without `docker exec`.

---

# Step 1: Static Readiness Checks

Check that the target skill is visible and eligible before running any routing fixture.

```bash
docker exec openclaw-openclaw-gateway-1 sh -lc 'openclaw skills list --json --eligible'
```

Use this to confirm:

- the target skill appears in the eligible list
- the skill description shown to the agent matches the intended routing description

Inspect one skill in detail:

```bash
docker exec openclaw-openclaw-gateway-1 sh -lc 'openclaw skills info <skill-name> --json'
```

Use this to confirm:

- `name`
- `description`
- `eligible`
- `disabled`
- `blockedByAllowlist`
- `filePath`
- missing requirements, if any

Check the whole runtime for missing requirements:

```bash
docker exec openclaw-openclaw-gateway-1 sh -lc 'openclaw skills check --json'
```

Fail static readiness if the skill is not eligible or the visible description is not the one the task expects.

---

# Step 2: Run A Runtime Fixture

Use a fresh session id for every replay. Keep the prompt text exactly the same as the fixture.

```bash
docker exec openclaw-openclaw-gateway-1 sh -lc 'openclaw agent --session-id <session-id> --message "<fixture prompt>" --thinking off --json --timeout 120'
```

Optional:

- add `--verbose on` if you want richer immediate output
- keep `--json` on so the result is easier to preserve in `REPORT.md`

Recommended session id format:

```text
skill-verify-<skill-name>-<fixture-id>-run-<n>
```

Run each important fixture multiple times in fresh sessions when routing is model-driven.

---

# Step 3: Inspect Runtime Evidence

After each run, inspect the session trace:

```bash
docker exec openclaw-openclaw-gateway-1 sh -lc 'sed -n "1,260p" /home/node/.openclaw/agents/main/sessions/<session-id>.jsonl'
```

What to look for:

- the user message event containing the exact fixture prompt
- assistant events that show the first observable execution step
- `toolCall` events, if the skill uses tools
- any capability-specific execution record the task defines as proof

Current limitation observed in this instance:

- session JSONL clearly records `toolCall` events
- I have not observed a default explicit field like `selected_skill`
- I have not observed a default explicit `skill_run` record in the sampled sessions

That means selection proof may need to be inferred from the first observable execution path, but only when the task defines that inference rule in advance.

---

# What Counts As Selection Proof

Use the strongest available evidence in this order:

1. An explicit runtime record that names the selected skill.
2. A skill-specific invocation record such as `skill_run`.
3. The first observable execution path uniquely associated with the expected skill.
4. Only if none of the above exist: a task-approved proxy signal defined before the run.

Do not invent the proof rule after seeing the result.

---

# What Counts As Application Proof

Application proof must show that the expected skill behavior actually ran. Good evidence includes:

- the first expected `toolCall`
- a sequence of tool calls unique to the expected skill path
- a trace record unique to the expected capability
- an expected side effect or artifact defined by the task
- output that matches the contract **plus** execution evidence

Final answer text alone is not enough.

---

# Pass / Fail Rules

Mark a runtime fixture as passing only when all of the following are true:

1. The target skill is eligible in the runtime.
2. The exact fixture prompt was replayed in a fresh session.
3. The observed selection evidence matches the expected skill or capability path.
4. The observed application evidence matches the expected execution path.
5. The nearby wrong path named in the fixture was not the first observed path.
6. The final output is consistent with the task contract.

Mark the fixture as **not runtime-verified** if:

- no observable selection evidence exists
- no observable application evidence exists
- the evidence is ambiguous between adjacent skills
- the run succeeds only by final-answer inspection
- required runtime steps could not be executed

---

# Example Verification Workflow

For one fixture:

1. Confirm the skill is eligible with `skills list` or `skills info`.
2. Run the prompt in a fresh session with `openclaw agent`.
3. Open the session JSONL.
4. Check the first observable path:
   - Did it follow the expected skill behavior?
   - Did it avoid the nearby wrong path first?
5. Check the final output against the contract.
6. Record the session id, commands, and evidence in `REPORT.md` or `REVIEW.md`.

For approval:

- the Developer should collect the raw evidence
- the Architect should rerun representative fixtures independently

---

# Known Limitation In This Instance

In the current OpenClaw runtime for this repository:

- skill visibility is easy to verify
- live agent prompting is possible
- session traces are available
- tool usage is observable through `toolCall` events
- direct skill-selection records are not obviously exposed by default

If a skill does not produce a unique observable execution path, you may not be able to prove runtime selection with the default tracing alone. In that case:

1. mark the result as specified but not fully runtime-verified, or
2. add temporary instrumentation for the task, or
3. use a more controlled test runtime that exposes the needed traces

---

# Reporting Template

When passing this guide to a Developer or Architect, ask them to capture:

- fixture id
- exact prompt
- session id
- command used
- selection evidence
- application evidence
- wrong-path check
- final output check
- verdict: pass | fail | not runtime-verified
