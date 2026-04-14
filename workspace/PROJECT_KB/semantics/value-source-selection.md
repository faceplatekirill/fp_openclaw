# Value Source Selection

This file explains how the live project chooses `out_value`.

## Core Idea

Telemetry objects can expose several value sources. The published `out_value` is selected from one of them according to control flags.

## Value Sources

| Field | Meaning |
|---|---|
| `in_value` | raw SCADA or PLC input |
| `op_value` | operator-entered manual value |
| `calculated_value` | formula or script result |
| `remote_value` | external-system value |
| `se_value` | state-estimation value |

## Control Flags

| Flag | When true | Selected source |
|---|---|---|
| `op_manual` | operator override active | `op_value` |
| `calc_manual` | calculated source active | `calculated_value` |
| `remote_manual` | external source active | `remote_value` |
| `se_manual` | state-estimation override active | `se_value` |
| default | no override flag active | `in_value` |

## Practical Selection Order

Typical priority in this project:

1. `op_manual`
2. `se_manual`
3. `calc_manual`
4. `remote_manual`
5. default `in_value`

Best practice is only one override flag at a time, but the agent should not assume the data always follows best practice.

## What `out_value` Means In Practice

`out_value` is not automatically a raw measurement.

It can represent:

- real SCADA input
- manual operator substitution
- calculated aggregate or virtual point
- state-estimation correction
- external-system feed

That means the agent should describe both:

- the current visible value
- the active source behind it, when the source is not the default live measurement

## Common Project Patterns

### Calculated aggregate points

Examples:

- `Pgen_sum`
- `Pload_sum`

Typical interpretation:

- the visible value may come from `calculated_value`
- it should be treated as a derived project signal rather than a direct sensor read

### Manual substitution after sensor failure

Typical pattern:

- `in_qds = 128`
- `op_manual = true`
- `op_value` contains an estimated or forced value
- `out_qds = 32`

Interpretation:

- the system still publishes a usable operational placeholder
- but it is not real measurement truth

### State-estimation correction

Typical pattern:

- `se_manual = true`
- `se_value` differs from `in_value`

Interpretation:

- the project is publishing a validated estimate instead of raw measurement

## Confidence Guidance

| Active source | Typical confidence |
|---|---|
| `in_value` with healthy QDS | high |
| `se_value` | high |
| `calculated_value` | medium |
| `remote_value` | medium |
| `op_value` | low |

## Agent Rule

Before treating `out_value` as the live truth for analysis, check:

1. which source is active
2. what the QDS says
3. when the value was last updated
