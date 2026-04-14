# QDS (Quality Descriptor) Codes

**Source:** Roman V (2026-02-19)  
**Context:** Ecomet telemetry and state quality indicators

---

## QDS Code Mapping

Quality Descriptor System (QDS) indicates data validity and quality status for telemetry values, states, and measurements.

| Code | Name         | Meaning                              | Action                          |
|------|--------------|--------------------------------------|---------------------------------|
| 0    | Valid        | Data is healthy                      | Use value normally              |
| 1    | Overflow     | Value exceeds range limits           | Check limits, possible error    |
| 2-4  | Reserved     | Application-specific                 | Context-dependent               |
| 16   | Blocked      | Source is locked/Suppressed          | Value intentionally blocked     |
| 32   | Substituted  | Forced/Manual value                  | Not from real measurement       |
| 64   | Not Topical  | Communication timeout/Stale data     | Data is outdated                |
| 128  | Invalid      | Value is discarded                   | Do not use this value           |

---

## Severity Hierarchy

From most trustworthy to least:

```
0   (Valid)          ✅ Fully trusted
1   (Overflow)       ⚠️  Use with caution
2-4 (Reserved)       ❓ Context-dependent
16  (Blocked)        🚫 Intentionally suppressed
32  (Substituted)    🔧 Manual override
64  (Not Topical)    ⏰ Stale/timeout
128 (Invalid)        ❌ Discard completely
```

---

## Bit Flag Structure

QDS values are **bit flags** (powers of 2), allowing combinations:

```
Binary:  1000 0000  →  128 (Invalid)
Binary:  0100 0000  →   64 (Not Topical)
Binary:  0010 0000  →   32 (Substituted)
Binary:  0001 0000  →   16 (Blocked)
Binary:  0000 0001  →    1 (Overflow)
Binary:  0000 0000  →    0 (Valid)
```

**Multiple flags possible:**
- `65` (64 + 1) = Not Topical + Overflow
- `33` (32 + 1) = Substituted + Overflow

---

## Field Usage

QDS codes appear in quality descriptor fields:

### Telemetry Quality (`*_qds`)
```json
{
  "in_qds": 0,           // Input quality (from SCADA)
  "op_qds": 0,           // Operational quality
  "out_qds": 64,         // Output quality (stale!)
  "se_qds": null,        // State estimation quality
  "remote_qds": null     // Remote monitoring quality
}
```

### State Quality
```json
{
  "state_connection_qds": 0,     // Connection state quality
  "calculated_qds": null,        // Calculated value quality
  "se_state_qds": null           // State estimation quality
}
```

### Line/Power Flow Quality
```json
{
  "P_i_qds": 0,          // Active power quality at pole i
  "Q_j_qds": 64,         // Reactive power quality at pole j (stale)
}
```

---

## Detailed Descriptions

### 0 - Valid
**Meaning:** Data is current, accurate, and trustworthy  
**Source:** Live real-time measurement from SCADA/PLC  
**Action:** Use value normally in calculations and displays

**Example:**
```json
{
  "out_value": 7.75,
  "out_qds": 0,
  "out_ts": 1771411160998
}
```
Power reading of 7.75 MW is valid and current.

---

### 1 - Overflow
**Meaning:** Value exceeds configured range limits  
**Source:** Measurement outside min/max bounds  
**Action:** 
- Check if limits are correct
- Investigate if equipment is overloaded
- May indicate sensor fault or exceptional condition

**Example:**
```json
{
  "out_value": 250.0,
  "out_qds": 1,
  "percent_min": 0.0,
  "percent_max": 100.0
}
```
Value at 250% of maximum - possible overload or sensor error.

---

### 2-4 - Reserved
**Meaning:** Application-specific codes  
**Source:** Custom/proprietary quality indicators  
**Action:** Consult application documentation or context

**Note:** Exact meanings may vary by subsystem (SE, DTS, etc.)

---

### 16 - Blocked
**Meaning:** Data source is intentionally locked or suppressed  
**Source:** 
- Operator manual block
- Security suppression
- Maintenance mode
**Action:** Value is available but should not be used in automation

**Example:**
```json
{
  "out_value": 145.6,
  "out_qds": 16,
  "op_manual": true
}
```
Telemetry blocked during maintenance - do not trigger alarms.

---

### 32 - Substituted
**Meaning:** Value is forced/manual, not from real measurement  
**Source:**
- Operator manual entry
- Forced test value
- Simulation mode (DTS)
**Action:** Treat as estimated/simulated, not ground truth

**Example:**
```json
{
  "out_value": 100.0,
  "out_qds": 32,
  "calc_manual": true,
  "op_manual": true
}
```
Operator set power flow to 100 MW manually for testing.

---

### 64 - Not Topical (Stale)
**Meaning:** Communication timeout or data is outdated  
**Source:**
- PLC/RTU communication loss
- Network timeout
- Slow polling
**Action:** 
- Do not use for real-time decisions
- Investigate communication path
- Check `out_ts` to see how old data is

**Example:**
```json
{
  "out_value": 7.75,
  "out_qds": 64,
  "out_ts": 1771400000000    // Unix time in milliseconds (3 hours old)
}
```
Last known value was 7.75 MW but communication lost.

**Critical:** This is a common failure mode - always check QDS before using telemetry!

---

### 128 - Invalid
**Meaning:** Value is completely unreliable and should be discarded  
**Source:**
- Sensor failure
- Data corruption
- Failed validation checks
- Bad data detection (State Estimation)
**Action:** Do not use this value under any circumstances

**Example:**
```json
{
  "out_value": -999.0,
  "out_qds": 128,
  "se_qds": 128
}
```
State estimation rejected this measurement as bad data.

**Display:** Show as `N/A`, `---`, or `INVALID` in UI

---

## Decision Logic

### Safe to Use?
```javascript
function isUsable(qds) {
  if (qds === 0) return true;           // Valid - OK
  if (qds === 1) return "WARNING";      // Overflow - use cautiously
  if (qds >= 16) return false;          // Blocked/Substituted/Stale/Invalid - NO
  return "UNKNOWN";                     // Reserved - context-dependent
}
```

### For Root Cause Analysis
```javascript
function diagnoseQDS(qds) {
  if (qds === 128) return "Sensor/data failure - investigate source";
  if (qds === 64)  return "Communication timeout - check PLC/RTU connection";
  if (qds === 32)  return "Manual override active - check operator actions";
  if (qds === 16)  return "Source blocked - check maintenance status";
  if (qds === 1)   return "Value out of range - check equipment/limits";
  if (qds === 0)   return "Data healthy";
  return "Unknown quality issue";
}
```

### For Alarms
**Critical rule:** Only trigger alarms on `qds: 0` (Valid)

Bad example:
```javascript
if (out_value > limit) {
  triggerAlarm();  // ❌ Wrong! Could be stale/invalid data
}
```

Good example:
```javascript
if (out_qds === 0 && out_value > limit) {
  triggerAlarm();  // ✅ Correct! Only valid data
}
```

---

## Common QDS Patterns

### Healthy Telemetry
```json
{
  "in_qds": 0,
  "op_qds": 0,
  "out_qds": 0,
  "se_qds": null
}
```
All stages valid, SE not yet computed.

---

### Communication Loss
```json
{
  "in_qds": 64,      // Input stale
  "op_qds": 64,
  "out_qds": 64,     // Propagated to output
  "out_ts": 1771400000000
}
```
Check `out_ts` to determine how long communication has been lost.

---

### Manual Override
```json
{
  "in_qds": 0,       // Real value still coming in
  "op_qds": 32,      // But operator substituted
  "out_qds": 32,     // Published as substituted
  "op_manual": true
}
```
Operator forced a value, real measurement ignored.

---

### Bad Data Rejection
```json
{
  "in_qds": 0,       // SCADA says valid
  "se_qds": 128,     // But SE rejected as bad
  "out_qds": 128     // Marked invalid
}
```
State Estimation detected inconsistency and rejected measurement.

---

## Integration with Ecomet Queries

**STATUS:** To be developed in next steps.

---

## Monitoring Recommendations

### Real-Time Dashboard
Display QDS visually:
- **Green** (0): Valid ✅
- **Yellow** (1, 16, 32): Caution ⚠️
- **Orange** (64): Stale ⏰
- **Red** (128): Invalid ❌

### Alarm on Quality Degradation
```javascript
// Alert when critical telemetry goes stale
if (criticalPoint.out_qds === 64) {
  alarm("Communication lost to " + criticalPoint.path);
}

// Alert when SE rejects data
if (point.se_qds === 128) {
  alarm("Bad data detected at " + point.path);
}
```

### Periodic Quality Reports
```
- Count of Invalid points (qds=128)
- Count of Stale points (qds=64)  
- Count of Substituted points (qds=32)
- Avg time-to-recovery from stale state
```

---

## See Also

- `state-codes.md` - State value mappings (state_connection, state_graph)
- `../project-structure.md` - Overall project structure
- `../patterns/telemetry-fields.md` - Telemetry field reference

---

**Note:** When performing root cause analysis or anomaly detection, **always check QDS first** before interpreting values. A stale or invalid reading can lead to false conclusions.
