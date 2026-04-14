# Alarm Categories: `fact` and `relevant`

**Usage:** Alarm categorization for filtering, grouping, and root-cause workflows.

---

## Overview

Alarm objects may include:
- `fact`: primary category (main classifier)
- `relevant`: secondary category (optional refinement)

These fields support grouping by equipment/system type.

---

## Primary Categories (`fact`)

### `KA` - Switching/Breaker Alarms
Typical topics:
- breaker trip/failure
- protection-triggered switching
- position mismatch

Example point:
`/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/L1001/connection/cb`

### `TI` - Telemetry Alarms
Typical topics:
- measurement out-of-range
- bad quality or stale data
- telemetry communication issues

Example point:
`/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/L1001/P`

### `SE` - Station/Network Equipment Alarms
Typical topics:
- station-level status changes
- equipment condition alarms

Example point:
`/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X`

### `TU` - Telecontrol Alarms
Typical topics:
- command execution failures
- control channel issues

### `earth_isolator` - Grounding Alarms
Typical topics:
- earth switch operation
- grounding interlock/safety conditions

Example point:
`/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/L1001/connection/earth_iso-1`

---

## Secondary Classification (`relevant`)

`relevant` is optional and often sparsely populated.

Potential usage patterns:
- `fact: "KA", relevant: "protection"`
- `fact: "KA", relevant: "manual"`
- `fact: "TI", relevant: "analog"`
- `fact: "TI", relevant: "digital"`

---

## Query Example

```javascript
ecomet_api({
  action: 'query',
  statement: `get text, point, dt_on from 'archive'
              where and(
                .pattern = $oid('/root/.patterns/alarm'),
                fact = 'KA',
                active = true
              )
              page 1:100
              format $to_json`
});
```

---

## Correlation Example

Sequence interpretation example:
1. `KA` alarm (breaker trip)
2. `TI` alarm (voltage/power drop)
3. `SE` alarm (station-level consequence)

This often indicates an equipment-triggered cascade.

---

## Data-Quality Note

In some deployments, `fact`/`relevant` may exist in schema but remain null in runtime data.
Always validate actual population before relying on these fields for analytics.

Validation checklist:
1. Query active alarm sample from `archive`
2. Measure non-null rates for `fact` and `relevant`
3. Define fallback classification if population is low

---

## References

- Pattern: `/root/.patterns/alarm_template`
- Archive prototype: `/root/.patterns/alarm`
- `../../CORE/ecomet-api-reference.md`
- `qds-codes.md`

