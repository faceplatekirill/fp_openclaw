# State Code Mappings

**Context:** Meanings of `state_connection` and `state_graph` in electricity-grid models.

---

## `state_connection`

Describes physical connectivity of equipment to network terminals/bus.

| Value | Meaning | Description |
|---|---|---|
| -1 | Default | Initial/default state |
| 0 | Undefined | Connection state not determined |
| 1 | Disconnected | Physically disconnected |
| 2 | Connected | Physically connected |
| 3 | N/A | Normally not used for this field |

Related fields:
- `state_connection_i`, `state_connection_j`
- `state_connection_qds`
- `state_connection_update_ts`

---

## `state_graph`

Describes electrical-energy presence at a node/terminal.

| Value | Meaning | Description |
|---|---|---|
| -1 | Undefined | State not determined |
| 0 | Undefined | State not determined |
| 1 | Grounded | Node intentionally grounded |
| 2 | No Power | De-energized / isolated |
| 3 | Powered | Energized |

Related fields:
- `state_graph_i`, `state_graph_j`, `state_graph_in`

---

## Difference at a Glance

| Aspect | `state_connection` | `state_graph` |
|---|---|---|
| Describes | physical topology status | electrical energy presence |
| Typical scope | equipment-to-bus relation | node/terminal energization |
| Common values | -1, 0, 1, 2 | -1, 0, 1, 2, 3 |

---

## Example Scenarios

### Transformer terminal

```text
state_connection: 2
state_graph: 3
```

Interpretation: connected and energized.

### Inter-region line

```text
state_connection_i: 1
state_connection_j: 2
state_graph_i: 3
state_graph_j: 3
```

Interpretation: disconnected on one side while both endpoints remain energized.

### Grounding switch engaged

```text
state_graph_in: 1
```

Interpretation: grounded for safety.

---

## Typical Transition Patterns

### Energization
1. undefined/default
2. `state_connection -> 2`
3. `state_graph -> 3`

### De-energization
1. open switching path (`state_connection -> 1`)
2. de-energize (`state_graph -> 2`)
3. optional grounding (`state_graph -> 1`)

---

## Analysis Usage

For outage or switching analysis:
1. check `state_connection` first (physical path)
2. check `state_graph` second (energy presence)
3. trace upstream/downstream to locate first de-energized boundary

Common filters:
- powered and connected: `state_connection = 2 AND state_graph = 3`
- disconnected but energized vicinity: `state_connection = 1 AND state_graph = 3`
- grounded nodes: `state_graph = 1`

---

## Notes

- `state_connection=3` is usually not used.
- Both fields can coexist on the same object family.
- Interpret with QDS/timestamp for runtime confidence.

See also: `qds-codes.md`, `value-source-selection.md`.
