# Static vs Dynamic Fields

**Context:** Graph model vs Ecomet runtime reads in electricity-grid systems.

---

## Core Principle

- Graph database stores static topology/configuration.
- Ecomet API returns current operational values/states.

The graph is a structural model, not a realtime source.

---

## Static Fields (Store/Read from Graph)

### Topology and identity
- `.pattern`, `prototype`, `path`
- `pole_i`, `pole_j`
- `vclass`, `line_length`
- `title`, `comment`, `description`

### Configuration and limits
- `configuration`, `settings`, `database`, `groups`
- `op_Hi`, `op_Lo`, `op_Hi_A`, `op_Lo_A`, `op_Hi_W`, `op_Lo_W`
- `percent_min`, `percent_max`, `digits`, `hyst_value`

### Calculation metadata
- `script`, `vars`, `cycle`

### Alarm configuration
- `compare`, `delay`, `delay_type`, `negative`, `no_ack`
- `alarm_sound`, `text`, `type`, `notify`, `send_http`, `category_1..5`

### Static identifiers
- `maintenance_id`, `id`, `version`

---

## Dynamic Fields (Query via Ecomet API)

### Values
- `in_value`, `op_value`, `out_value`, `calculated_value`, `remote_value`, `se_value`

### Quality
- `in_qds`, `op_qds`, `out_qds`, `se_qds`, `calculated_qds`, `remote_qds`

### Timestamps
- `in_ts`, `op_ts`, `out_ts`, `se_ts`, `remote_ts`, `state_connection_update_ts`

### Current states
- `state_connection`, `state_graph`
- `state_connection_i`, `state_connection_j`
- `state_graph_i`, `state_graph_j`, `state_graph_in`
- `position`, `state`

### State-estimation runtime outputs
- `u_in_value`, `u_out_value`
- `p_in_balance`, `p_out_balance`, `q_in_balance`, `q_out_balance`
- `state_out_value`, `state_out_flag`, `du_value`, `fu_out_value`

### Runtime mode flags
- `op_manual`, `calc_manual`, `remote_manual`, `se_manual`

### Flow runtime values
- `P_i_value`, `P_j_value`, `Q_i_value`, `Q_j_value`
- `P_i_qds`, `P_j_qds`, `Q_i_qds`, `Q_j_qds`

### Runtime maintenance/alarm state
- `maintenance_data`
- alarm runtime fields such as `state`, `value`, `input`, `fact`, `error`

Never treat graph snapshots of dynamic fields as current operational truth.

---

## Architecture Responsibilities

### Graph answers
- Which objects are connected?

Example:
```cypher
MATCH (station:Node {path: '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X'})-[:REL*]->(n:Node)
RETURN n.path, n['.pattern']
```

### Ecomet answers
- Is equipment currently connected/powered?
- What is current telemetry value and quality?
- When was value/state last updated?
- Which voltage classes/equipment exist in this station?

Example:
```javascript
ecomet_api({
  action: 'get',
  oid: '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/T1/P',
  params: ['out_value', 'out_qds', 'out_ts']
});
```

---

## Query Pattern: Topology + Runtime

### Step 1: Graph scope
```cypher
MATCH (station:Node {path: '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X'})-[:REL*]->(t:Node)
WHERE t['.pattern'] = '/root/FP/prototypes/telemetry/fields'
RETURN t.path
```

### Step 2: Ecomet runtime
```javascript
ecomet_api({
  action: 'query',
  statement: "get .fp_path, out_value, out_qds, out_ts from 'project' where and(.pattern=$oid('/root/FP/prototypes/telemetry/fields'), .fp_path LIKE '/STATION_X/') page 1:100 format $to_json"
});
```

---

## Loader Guidance

Include static fields in graph export/import.
Exclude dynamic runtime fields from graph refresh logic.

This keeps topology storage stable and avoids false "current state" assumptions.

---

## See Also

- `../project-structure.md`
- `../semantics/state-codes.md`
- `../semantics/qds-codes.md`
- `../semantics/value-source-selection.md`
- `../query-workflow.md`
- `../ecomet-api-reference.md`
