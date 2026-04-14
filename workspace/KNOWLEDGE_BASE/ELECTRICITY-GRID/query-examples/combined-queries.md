# Combined Query Examples (Graph + Ecomet)

**Purpose:** Show how to combine topology context (Graph) with realtime values (Ecomet).

---

## Architecture Recap

- Graph (Neo4j): topology, configuration, scripts, limits (static)
- Ecomet API: values, quality, timestamps, current states (dynamic)

---

## Example 1: Telemetry With Current Values

### Step 1: Graph - discover telemetry points

```cypher
MATCH (equipment:Node {path: '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/T1'})-[:REL*]->(telem:Node)
WHERE telem['.pattern'] = '/root/FP/prototypes/telemetry/fields'
RETURN telem.path, telem['.pattern'], telem.op_Hi, telem.op_Lo
```

### Step 2: Ecomet - read runtime fields

```javascript
ecomet_api({
  action: 'get',
  oid: '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/T1/P',
  params: ['out_value', 'out_qds', 'out_ts', 'op_manual', 'calc_manual']
});
```

### Step 3: combine

```json
{
  "telemetry": {
    "path": "/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/T1/P",
    "pattern": "/root/FP/prototypes/telemetry/fields"
  },
  "current": {
    "value": 145.6,
    "qds": 0,
    "timestamp": 1771411160998
  }
}
```

---

## Example 2: Line Connection + Flow State

### Step 1: Graph - get endpoints

```cypher
MATCH (line:Node {path: '/root/FP/PROJECT/@lines/L1001/line'})
RETURN line.pole_i, line.pole_j, line.vclass
```

### Step 2: Ecomet - get current state and flow

```javascript
ecomet_api({
  action: 'get',
  oid: '/root/FP/PROJECT/@lines/L1001/line',
  params: [
    'state_connection', 'state_connection_i', 'state_connection_j',
    'state_graph', 'state_graph_i', 'state_graph_j',
    'P_i_value', 'P_j_value', 'Q_i_value', 'Q_j_value'
  ]
});
```

### Step 3: interpret

```json
{
  "line": "L1001",
  "connection_status": {
    "overall": "disconnected",
    "side_i": "disconnected",
    "side_j": "connected"
  },
  "power_flow": {
    "i_to_j_mw": 0.0,
    "j_to_i_mw": 145.2
  }
}
```

---

## Example 3: Alarm Root Cause Support

### Scenario
Alarm triggered on `STATION_X/220/L1001`.

### Step 1: Graph - find related switching objects

```cypher
MATCH path = (alarm:Node)-[:REL*1..3]-(equipment:Node)
WHERE alarm.path CONTAINS 'STATION_X/220/L1001'
  AND (
    equipment['.pattern'] CONTAINS 'circuit_breaker'
    OR equipment['.pattern'] CONTAINS 'isolator'
  )
RETURN equipment.path, equipment['.pattern']
LIMIT 20
```

### Step 2: Ecomet - read current positions

```javascript
ecomet_api({
  action: 'get',
  oid: '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/L1001/connection/cb',
  params: ['position', 'out_value', 'out_qds', 'out_ts']
});
```

### Step 3: check connection-state logic

```cypher
MATCH (script:Node {path: '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/L1001/connection/_script/state'})
RETURN script.script, script.vars
```

```javascript
ecomet_api({
  action: 'get',
  oid: '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/L1001/connection',
  params: ['state', 'state_connection', 'out_qds']
});
```

Interpretation example:
- If breaker is closed but `state_connection` says disconnected, check isolator positions.

---

## Example 4: Powered Transformer List

### Step 1: Graph - list transformers

```cypher
MATCH (t:Node)
WHERE t['.pattern'] CONTAINS 'transformer'
RETURN t.path, t.vclass
LIMIT 200
```

### Step 2: Ecomet - check dynamic state

```javascript
ecomet_api({
  action: 'get',
  oid: transformer.path,
  params: ['state_connection', 'state_graph']
});
```

### Step 3: filter

```javascript
const powered = transformers.filter(t => {
  const s = states[t.path];
  return s.state_connection === 2 && s.state_graph === 3;
});
```

---

## Example 5: Station Quality Health

### Step 1: Graph - collect telemetry paths

```cypher
MATCH (station:Node {path: '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X'})-[:REL*]->(telem:Node)
WHERE telem['.pattern'] = '/root/FP/prototypes/telemetry/fields'
RETURN telem.path
```

### Step 2: Ecomet - read `out_qds` and `out_ts`

```javascript
ecomet_api({
  action: 'get',
  oid: telem.path,
  params: ['out_qds', 'out_ts']
});
```

### Step 3: summarize

```javascript
const report = {
  total: telemetry.length,
  valid: qds0,
  stale: qds64,
  invalid: qds128,
  oldest_update: minTs,
  newest_update: maxTs
};
```

---

## Example 6: Inter-Region Line Candidates

### Graph query

```cypher
MATCH (line:Node)
WHERE line['.pattern'] CONTAINS 'line'
  AND line.pole_i CONTAINS '/REGION_1/'
  AND line.pole_j CONTAINS '/REGION_2/'
RETURN line.path, line.pole_i, line.pole_j, line.vclass
```

### Realtime flow query

```javascript
ecomet_api({
  action: 'get',
  oid: '/root/FP/PROJECT/@lines/L1001/line',
  params: ['P_i_value', 'P_j_value', 'state_connection_i', 'state_connection_j']
});
```

---

## Best Practices

1. Start with graph for structure, then query Ecomet for runtime values.
2. Check `out_qds` and `out_ts` before using a value in decisions.
3. Use pagination in broad queries.
4. Use `LIKE` for path scope only; resolve connectivity with exact `pole_i/pole_j` equality.

---

## Common Combined Patterns

### "Show full station status"
1. Graph: collect structure and telemetry paths.
2. Ecomet: batch current values for those paths.

### "Find maintenance impact"
1. Graph: identify affected equipment and dependencies.
2. Ecomet: check `maintenance_data`, `state_connection`, `state_graph`.

### "Trace outage propagation"
1. Graph: upstream/downstream connectivity traversal.
2. Ecomet: state transitions and quality timestamps.

---

## See Also

- `../architecture/static-vs-dynamic-fields.md`
- `../semantics/state-codes.md`
- `../semantics/qds-codes.md`
- `../semantics/value-source-selection.md`
- `../query-workflow.md`
