# State Codes

This file defines the live project's meanings for `state_connection` and `state_graph`.

## `state_connection`

`state_connection` describes physical connectivity to the network.

| Value | Meaning | Description |
|---|---|---|
| -1 | Default | Initial or default state |
| 0 | Undefined | Connection state not determined |
| 1 | Disconnected | Physically disconnected |
| 2 | Connected | Physically connected |
| 3 | N/A | Usually not used for this field |

Related fields:

- `state_connection_i`
- `state_connection_j`
- `state_connection_qds`
- `state_connection_update_ts`

## `state_graph`

`state_graph` describes electrical-energy presence.

| Value | Meaning | Description |
|---|---|---|
| -1 | Undefined | State not determined |
| 0 | Undefined | State not determined |
| 1 | Grounded | Intentionally grounded |
| 2 | No Power | De-energized or isolated |
| 3 | Powered | Energized |

Related fields:

- `state_graph_i`
- `state_graph_j`
- `state_graph_in`

## Difference At A Glance

| Aspect | `state_connection` | `state_graph` |
|---|---|---|
| Describes | physical connectivity | electrical energization |
| Typical question | "is it connected?" | "is it powered?" |
| Common positive state | `2` | `3` |

## Typical Interpretations

- `state_connection = 2` and `state_graph = 3`: connected and energized
- `state_connection = 1` and `state_graph = 3`: disconnected locally while power still exists nearby
- `state_graph = 1`: grounded for safety
- `state_graph = 2`: de-energized but not necessarily physically disconnected everywhere

## Practical Use

When both fields are present:

1. read `state_connection` as the physical-path status
2. read `state_graph` as the energy-presence status
3. keep them separate in explanation instead of collapsing them into one label

## Notes

- `state_connection = 3` is usually not meaningful in this project
- these fields should be interpreted together with QDS and timestamps when confidence matters
