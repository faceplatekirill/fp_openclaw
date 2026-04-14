# Ecomet API Reference (ELECTRICITY-GRID)

**Created:** 2026-03-05  
**Layer:** ELECTRICITY-GRID  
**Purpose:** Grid-specific API usage rules for telemetry, switching states, topology context, and alarm workflows

---

## Scope

This document extends the CORE API reference with electricity-grid-specific conventions.

Use this file for:
- Grid runtime fields to query via Ecomet
- Graph-vs-Ecomet data-source boundaries
- Canonical station/equipment path resolution workflow
- Grid response standards when realtime queries fail

Generic syntax rules remain in `../CORE/ecomet-api-reference.md`.

---

## 1. Grid Runtime Fields (Query via Ecomet)

These values are operational and may change frequently:

- Telemetry: `out_value`, `out_qds`, `out_ts`, `in_value`, `op_value`, `se_value`
- Switching/topology state: `state_connection`, `state_graph`, `position`
- State-estimation outputs: `u_in_value`, `u_out_value`, `p_in_balance`, `p_out_balance`, `q_in_balance`, `q_out_balance`
- Alarm state/time: `active`, `acknowledged`, `dt_on`, `dt_ack`, `dt_off`, `dt_comment`

Do not treat these as static configuration values.

---

## 2. Static vs Runtime Source Rule

- Use graph/config sources for static topology/configuration (`.pattern`, `pole_i`, `pole_j`, `vclass`, `script`, limits).
- Use Ecomet API for current operational values and states.

If realtime query fails, explicitly report that current values are unavailable instead of substituting static snapshots.

Related: `architecture/static-vs-dynamic-fields.md`.

---

## 3. Pagination Rule for Grid Queries

Use `page <from>:<to>` whenever a grid query can return many objects.

Typical broad-query cases:
- alarm/archive windows (`dt_on[...]`, `dt_ack[...]`)
- station/region subtree scans with `.fp_path LIKE ...` (fragment length >= 3)
- prototype-wide queries (`.pattern = ...`) in `project` or `archive`

Safe default:
- `page 1:100` for object listings
- `page 1:200` for alarms/events

Exact-path reads (single object by `.fp_path = ...`) usually do not require pagination.

LIKE rule:
- Regular `LIKE` requires `3gram` index and fragment length >= 3.
- LIKE matching is case-insensitive.
- If `3gram` is missing, use strict `:LIKE` only after indexed narrowing.
- Regular comparison operators `>`, `<`, `>=`, `<=`, `<>` are currently unsupported.
- Strict comparison variants are supported (`:>`, `:<`, `:>=`, `:<=`, `:<>`) but are scan-based.

---

## 4. Grid Query Templates

### SE node values

```javascript
ecomet_api({
  action: 'query',
  statement: "get u_in_value, u_out_value, p_in_balance, p_out_balance, q_in_balance, q_out_balance, state_out_value from 'project' where .fp_path = '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/SE_nod' format $to_json"
});
```

### Telemetry value

```javascript
ecomet_api({
  action: 'query',
  statement: "get out_value, out_qds, out_ts from 'project' where .fp_path = '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/T1/P' format $to_json"
});
```

### Switching state

```javascript
ecomet_api({
  action: 'query',
  statement: "get state_connection, state_graph, position from 'project' where .fp_path = '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/L1001/connection/cb' format $to_json"
});
```

### Recent alarms

```javascript
const endTs = Date.now();
const startTs = endTs - 10 * 60 * 1000;

await ecomet_api({
  action: 'query',
  statement: `get text, point, active, acknowledged, dt_on from 'archive'
              where AND(
                .pattern = $oid('/root/.patterns/alarm'),
                OR(active = true, acknowledged = false),
                dt_on[${startTs}:${endTs}]
              )
              page 1:200
              format $to_json`
});
```

### Substation-scoped terminal listing (broad query, paginated)

```javascript
ecomet_api({
  action: 'query',
  statement: "get .fp_path, .name from 'project' where AND(.pattern = $oid('/root/FP/prototypes/line terminal/fields'), .fp_path LIKE '/COUNTRY_A/REGION_1/STATION_X/') page 1:100 format $to_json"
});
```

### Batch telemetry points

```javascript
ecomet_api({
  action: 'query',
  statement: "get .fp_path, out_value, out_qds, out_ts from 'project' where OR(.fp_path = '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/L1001/P', .fp_path = '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/L1002/P', .fp_path = '/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/L1003/P') format $to_json"
});
```

---

## 5. Canonical Name/Path Resolution

For user-entered station/equipment names, resolve to canonical `.fp_path` before querying values.

Recommended flow:

1. Normalize input name (case, script, spacing).
2. Run search in the available topology/name index service.
3. Select canonical path from search results.
4. Use only canonical path in Ecomet queries.

Why:
- multilingual naming and transliteration variants are common;
- alias forms can differ from folder naming;
- direct path guessing is fragile.

---

## 6. Response Standard for Grid Operations

When realtime read fails, separate clearly:

- What is confirmed from static topology/configuration.
- What is unavailable because runtime query failed.

Example response shape:

```text
Topology/configuration:
- Station X 220 kV: 2 transformers, 3 line terminals

Realtime status:
- Current values unavailable (Ecomet query error)
- Last confirmed alarm query: unavailable
```

Do not present static graph snapshots as current operational state.

---

## See Also

- `ecomet-field-indexes.md`
- `ecomet-like-operator.md`
- `query-performance-guide.md`
- `query-workflow.md`
- `project-structure.md`
- `architecture/static-vs-dynamic-fields.md`
- `semantics/state-codes.md`
- `semantics/qds-codes.md`
- `../CORE/ecomet-api-reference.md`
