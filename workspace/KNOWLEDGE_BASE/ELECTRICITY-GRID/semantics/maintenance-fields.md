# Maintenance Fields

**Context:** Equipment maintenance linkage and work-order status in grid operations.

---

## Overview

Maintenance fields connect equipment objects with external maintenance systems and indicate active/planned work.

---

## Key Fields

### `maintenance_id`
Stable cross-system equipment identifier.

```json
{
  "maintenance_id": "EQ-12345"
}
```

Use cases:
- map SCADA object -> CMMS asset
- work-order and spare-part correlation
- long-lived identity across migrations

### `maintenance_data`
Structured maintenance order data (active and historical).

```json
{
  "maintenance_data": {
    "orders": [
      {
        "order_id": "WO-2026-001",
        "state": "opened",
        "type": "preventive",
        "scheduled_start": 1771411160998,
        "scheduled_end": 1771497560998
      }
    ]
  }
}
```

Typical order states:
- `opened`, `approved`, `scheduled`, `in_progress`, `completed`, `closed`, `cancelled`

Typical order types:
- `preventive`, `corrective`, `emergency`, `upgrade`

---

## Operational Meaning

Equipment under maintenance may also show:
- `pf_outserv: true` (model-level out of service)
- `state_connection: 1` (disconnected)
- `disabled: true` (UI/operation restrictions)

These combinations are common during planned outages.

---

## Useful Checks

### Active maintenance guard

```javascript
const hasActiveMaintenance = equipment.maintenance_data?.orders?.some(
  o => o.state === 'in_progress' || o.state === 'scheduled'
);
```

### Maintenance-aware alarm suppression

```javascript
function shouldSuppressAlarm(alarm, equipment) {
  const active = equipment.maintenance_data?.orders?.some(o => o.state === 'in_progress');
  return active && alarm.type === 'equipment_offline';
}
```

---

## Example Scenarios

### Preventive

```json
{
  "maintenance_id": "TR-STATION_X-220-T1",
  "maintenance_data": {
    "orders": [
      {
        "order_id": "PM-2026-001",
        "state": "scheduled",
        "type": "preventive",
        "scheduled_start": 1771497600000,
        "scheduled_end": 1771504800000,
        "description": "Transformer inspection"
      }
    ]
  }
}
```

### Emergency

```json
{
  "maintenance_id": "CB-STATION_X-220-L1001",
  "maintenance_data": {
    "orders": [
      {
        "order_id": "EM-2026-045",
        "state": "in_progress",
        "type": "emergency",
        "priority": "critical",
        "description": "Breaker mechanism fault"
      }
    ]
  },
  "state_connection": 1,
  "disabled": true
}
```

### Completed

```json
{
  "maintenance_id": "ISO-STATION_X-220-L1001-1",
  "maintenance_data": {
    "orders": [
      {
        "order_id": "WO-2026-123",
        "state": "closed",
        "type": "corrective",
        "description": "Isolator contact replacement"
      }
    ]
  }
}
```

---

## Analysis Guidance

1. Check maintenance context before declaring outage/failure.
2. Separate planned maintenance from unplanned trips in reports.
3. Include recent maintenance history in root-cause analysis.

---

## See Also

- `state-codes.md`
- `qds-codes.md`
- `../query-workflow.md`
- `../architecture/static-vs-dynamic-fields.md`

