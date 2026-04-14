# Grid Query Workflow - Step by Step

**Purpose:** Standard procedure for answering electricity-grid questions with topology + realtime separation.

---

## Standard Flow

### Step 1: Classify Request

Identify the question type first:
- Station/equipment structure -> topology first
- Current status/values -> realtime query required
- Alarm investigation -> archive + related topology
- Power flow direction -> line topology + runtime flow fields

---

### Step 2: Resolve Canonical Path

Always resolve user-provided names to canonical paths before querying.

```javascript
// Use your deployment's topology search tool.
// Example generic name: grid_graph_rag (some deployments use project-specific aliases).
grid_graph_rag({
  operation: 'search',
  text: 'station name exactly as user typed',
  limit: 10
});
```

Why:
- Handles script/translation/transliteration variants
- Avoids path-guessing failures
- Produces canonical `.fp_path` for later calls

Skip search only when the user provides a full canonical path.

---

### Step 3: Read Topology (Graph)

```javascript
grid_graph_rag({
  operation: 'describe',
  path: '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X'
});
```

Then describe each discovered voltage level:

```javascript
grid_graph_rag({ operation: 'describe', path: '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220' });
grid_graph_rag({ operation: 'describe', path: '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/110' });
```

Do not stop after the first voltage class.

---

### Step 4: Collect Target Object Paths

Use graph traversal (or indexed Ecomet queries) to collect relevant object paths first.

```javascript
grid_graph_rag({
  operation: 'telemetry',
  path: '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X',
  limit: 500
});
```

---

### Step 5: Read Realtime Values (Ecomet)

Use Ecomet only for dynamic fields (`out_value`, `out_qds`, `out_ts`, `state_*`, `position`, etc.).

```javascript
ecomet_api({
  action: 'query',
  statement: "get .fp_path, out_value, out_qds from 'project' where and(.pattern=$oid('/root/FP/prototypes/telemetry/fields'), .fp_path LIKE '/STATION_X/') page 1:100 format $to_json"
});
```

Important rules:
- `LIKE` is case-insensitive
- `LIKE` fragment must be at least 3 chars
- Regular `LIKE` requires `3gram` index
- If no `3gram`, use `:LIKE` only after indexed narrowing
- Do not use SQL wildcards like `%`
- Add pagination for broad queries

If realtime query fails:
1. Validate syntax against CORE docs
2. Apply one corrected retry
3. If still failing, stop and mark realtime unavailable

---

### Step 6: Build Response

Separate verified structure from realtime status.

```text
Topology (Graph):
- Voltage levels: 220, 110 kV
- 220 kV: 2 transformers, 3 line terminals

Realtime (Ecomet):
- Voltage: 228.5 kV (qds=0)
- Active power on L1001: 145.6 MW
```

If realtime is unavailable, state that explicitly.

---

## Quality Checklist

- [ ] Canonical path resolved before value queries
- [ ] All relevant voltage levels checked
- [ ] Graph (static) and Ecomet (runtime) separated
- [ ] Broad queries paginated
- [ ] LIKE rules applied correctly
- [ ] Query failures reported transparently

---

## Common Mistakes

### 1) Guessing paths
Wrong: hardcoding path spelling from memory.
Fix: resolve via search first.

### 2) Mixing static and runtime data
Wrong: using graph snapshot fields as current values.
Fix: query Ecomet for current values.

### 3) Over-retrying broken queries
Wrong: many random syntax variants.
Fix: one correction retry, then report unavailable.

---

## See Also

- `../CORE/ecomet-api-reference.md`
- `../CORE/ecomet-like-operator.md`
- `ecomet-api-reference.md`
- `ecomet-like-operator.md`
- `query-performance-guide.md`
- `architecture/static-vs-dynamic-fields.md`
