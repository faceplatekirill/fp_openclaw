# Maintenance Fields

This file defines the live project's maintenance-related fields and how they should be interpreted.

## Key Fields

### `maintenance_id`

Stable cross-system equipment identifier.

Use cases:

- SCADA object to CMMS asset mapping
- work-order correlation
- identity continuity across migrations

This field is mostly identity/configuration context rather than live state.

### `maintenance_data`

Structured maintenance-order context attached to the object.

Typical contents:

- order id
- order state
- order type
- schedule window
- priority
- description

This field is operationally meaningful because it can explain why equipment is unavailable, disabled, or intentionally disconnected.

## Typical Order States

- `opened`
- `approved`
- `scheduled`
- `in_progress`
- `completed`
- `closed`
- `cancelled`

## Typical Order Types

- `preventive`
- `corrective`
- `emergency`
- `upgrade`

## Common Interpretation Patterns

Planned outage pattern:

- active or scheduled maintenance order
- `state_connection = 1`
- possible `disabled = true`

Emergency repair pattern:

- `maintenance_data` shows `in_progress`
- the object may also appear disconnected or blocked from operation

## Agent Rule

Before labeling a condition as fault, outage, or abnormal behavior, check whether maintenance context explains it.

The agent should distinguish:

- planned maintenance
- emergency repair
- completed historical maintenance

## Important Boundary

- `maintenance_id` tells you what asset this is
- `maintenance_data` tells you what maintenance context is active around it
