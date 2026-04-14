# Alarm Categories

This file defines the live project's alarm classification fields.

## Alarm Classification Fields

Alarm objects may include:

- `fact`: primary category
- `relevant`: secondary category

These fields support grouping, filtering, and high-level interpretation.

## Primary Categories (`fact`)

### `KA`

Switching and breaker alarms.

Typical meanings:

- breaker trip or failure
- protection-triggered switching
- position mismatch

### `TI`

Telemetry alarms.

Typical meanings:

- value out of range
- bad quality
- stale telemetry
- telemetry communication issues

### `SE`

Station or network-equipment alarms.

Typical meanings:

- station-level status changes
- equipment condition alarms

### `TU`

Telecontrol alarms.

Typical meanings:

- command-execution failures
- control-channel problems

### `earth_isolator`

Grounding-related alarms.

Typical meanings:

- earth-switch operation
- grounding interlock or safety conditions

## Secondary Classification (`relevant`)

`relevant` is optional and often sparse.

Typical refinement patterns:

- `fact = KA`, `relevant = protection`
- `fact = KA`, `relevant = manual`
- `fact = TI`, `relevant = analog`
- `fact = TI`, `relevant = digital`

## Interpretation Notes

- `fact` is the stronger classifier
- `relevant` should be treated as enrichment, not guaranteed data
- analytics should tolerate `null` or low-population `fact` and `relevant` fields

## Common Correlation Pattern

A common sequence in this project is:

1. `KA` alarm
2. `TI` alarm
3. `SE` alarm

This often reflects an equipment-triggered cascade from switching event to telemetry consequence to station-level impact.
