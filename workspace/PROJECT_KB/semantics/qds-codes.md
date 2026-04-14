# QDS Codes

This file defines the live project's quality interpretation for telemetry and state fields.

## Core Mapping

| Code | Name | Meaning | Agent interpretation |
|---|---|---|---|
| 0 | Valid | Current and healthy | safe to use normally |
| 1 | Overflow | Outside configured range | use carefully, possible limit breach or sensor issue |
| 2-4 | Reserved | Application-specific | context-dependent |
| 16 | Blocked | Intentionally suppressed or locked | not normal live signal usage |
| 32 | Substituted | Forced or manual value | not raw measurement |
| 64 | Not Topical | Stale or timeout | outdated for real-time judgment |
| 128 | Invalid | Unreliable or discarded | do not use as ground truth |

## QDS Is Bit-Flag Based

Multiple flags can be combined:

- `65` = `64 + 1` = stale plus overflow
- `33` = `32 + 1` = substituted plus overflow

The agent should not assume QDS is always one simple category.

## Where These Codes Appear

Common quality fields in this project:

- `in_qds`
- `op_qds`
- `out_qds`
- `se_qds`
- `remote_qds`
- `state_connection_qds`
- `P_i_qds`, `P_j_qds`
- `Q_i_qds`, `Q_j_qds`

## Operational Meaning

- `0`: use as a normal live value
- `32`: substituted or manual source, explain that it is not a raw measurement
- `64`: stale, explain that the signal is outdated
- `128`: invalid, do not present as a trustworthy current value

## Important Project Rule

Quality must be interpreted together with:

- the active value source (`in_value`, `op_value`, `calculated_value`, `remote_value`, `se_value`)
- the relevant timestamp such as `out_ts`

For example:

- `out_qds = 32` often aligns with manual substitution
- `out_qds = 64` means "last known value" rather than current live confidence

## Confidence Ordering

From highest to lowest default confidence:

1. valid live measurement or validated estimate
2. overflow but still current
3. substituted or blocked
4. stale
5. invalid
