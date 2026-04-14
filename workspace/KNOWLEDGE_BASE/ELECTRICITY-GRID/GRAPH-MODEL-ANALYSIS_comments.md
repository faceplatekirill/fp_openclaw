# Graph Model Analysis Comments

**Date:** 2026-03-05
**Status:** Domain-level analysis notes (deployment-neutral)

---

## Executive Summary

The grid graph model uses:
- multiple vertex types (terminal families)
- equipment-as-edge semantics with pole references
- nested property resolution via `_path`, `_proto`, `_field`
- optional external terminal state for inter-region lines

These rules affect graph import, traversal, and state-aware analytics.

---

## 1. Vertex Type Notes

### Terminal

```json
{
  "prototype": "terminal",
  "state_field": "state_graph"
}
```

Observed pattern:
- `state_graph` is usually present on terminal-level objects.
- legacy `source` declarations may exist in some specs and can be ignored if redundant.

### Bus Terminal / Line Terminal

Common pattern in specs:

```json
{
  "source": { "_path": "U", "_proto": "telemetry", "_field": "state_graph_in" }
}
```

Practical guidance:
- treat this as optional/legacy unless verified in deployment data;
- prefer direct validated state fields where available.

### External state

Line-terminal specs may include:

```json
{
  "external_source": { "_path": "external_state", "_proto": "state", "_field": "in_value" }
}
```

Use for inter-region lines where remote endpoint state is mirrored.

---

## 2. Edge Type Notes

### Single-pole equipment
Examples: reactor, load, generator/external source interfaces.

Pattern:
- one terminal pole (`pole_i`) plus optional virtual node (`_earth`, `_energy`).

### Two-pole equipment
Examples: circuit breaker, isolator, line, two-winding transformer.

Pattern:
- `pole_i` + `pole_j`
- optional nested position source (`state/out_value`)

### Three-winding equipment
Examples: coupled reactor, 3-winding transformer families.

Pattern:
- multiple pole pairs from shared/common pole
- represent as multiple typed edges (not one ambiguous edge)

---

## 3. Property Resolution Rules

### Direct field

```json
{ "_field": "state_graph" }
```

Read from current object properties.

### Nested field

```json
{ "_path": "state", "_proto": "state", "_field": "out_value" }
```

Navigate to child object, verify prototype family, read field.

### Optional external source

```json
{ "_path": "external_state", "_proto": "state", "_field": "in_value" }
```

If absent, treat as `null` rather than error.

---

## 4. Virtual Node Guidance

Use shared virtual nodes when required by wiring model:
- `_earth`: common grounding node
- `_energy`: common generation source node

Implementation notes:
- `_energy` edges should be directional from source to network terminal.
- `_earth` handling should remain consistent across all grounding switches.

---

## 5. State Semantics Alignment

Recommended baseline:
- topology/energization state: `state_graph` (`1` grounded, `2` de-energized, `3` energized)
- switch position state: nested `state/out_value` or direct state field depending on prototype

Always align importer mappings with `semantics/state-codes.md`.

---

## 6. Import/Query Impact

Importer requirements:
1. Resolve nested state fields where defined.
2. Add optional `external_state` handling for inter-region terminals.
3. Create/maintain virtual nodes used by wiring model.
4. Preserve edge-level state/position properties for traversal filters.

Query requirements:
- state-aware traversals should filter by connection/position state.
- cross-region analyses should include external-state fallback logic.

---

## 7. Open Validation Checklist

1. Confirm which legacy `source` declarations are still active in current schema.
2. Confirm exact mapping for switch position states per prototype family.
3. Confirm virtual-node cardinality rules (`_earth`, `_energy`) for the target deployment.
4. Confirm coverage of optional `external_state` objects.

---

## 8. Example Generic Paths

Use placeholders in docs and tests:
- `/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/L1001`
- `/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/L1001/connection/cb/state`
- `/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/L1001/external_state`

---

## Related Docs

- `project-structure.md`
- `architecture/static-vs-dynamic-fields.md`
- `semantics/state-codes.md`
- `query-workflow.md`
