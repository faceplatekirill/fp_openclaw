# Value Source Selection

**Source:** Roman V (2026-02-19)  
**Context:** How `out_value` is selected from multiple value sources

---

## Overview

Telemetry objects have **multiple value sources**, and the published `out_value` is selected from one of them based on **control flags**.

---

## Value Source Fields

| Field              | Source Description                           |
|--------------------|----------------------------------------------|
| `in_value`         | Input from SCADA/PLC (raw measurement)       |
| `op_value`         | Operational value (manual operator input)    |
| `calculated_value` | Calculated from script/formula               |
| `remote_value`     | From remote monitoring system                |
| `se_value`         | From State Estimation subsystem              |

---

## Source Selection Control Fields

| Control Field  | When `true`              | Source Used         |
|----------------|--------------------------|---------------------|
| `op_manual`    | Operator override active | `op_value`          |
| `calc_manual`  | Calculation active       | `calculated_value`  |
| `remote_manual`| Remote source active     | `remote_value`      |
| `se_manual`    | SE override active       | `se_value`          |
| *(default)*    | No manual flags set      | `in_value`          |

---

## Selection Logic

```javascript
function getActiveSource(telemetry) {
  if (telemetry.op_manual === true) {
    return {
      source: "op_value",
      value: telemetry.op_value,
      reason: "Operator manual override"
    };
  }
  
  if (telemetry.calc_manual === true) {
    return {
      source: "calculated_value",
      value: telemetry.calculated_value,
      reason: "Calculated value (script/formula)"
    };
  }
  
  if (telemetry.remote_manual === true) {
    return {
      source: "remote_value",
      value: telemetry.remote_value,
      reason: "Remote monitoring system"
    };
  }
  
  if (telemetry.se_manual === true) {
    return {
      source: "se_value",
      value: telemetry.se_value,
      reason: "State Estimation override"
    };
  }
  
  // Default: use SCADA input
  return {
    source: "in_value",
    value: telemetry.in_value,
    reason: "SCADA/PLC input (default)"
  };
}
```

**Result:** The selected value becomes `out_value`.

---

## Example Scenarios

### Scenario 1: Normal Operation (SCADA Input)
```json
{
  "in_value": 7.75,
  "in_qds": 0,
  "op_manual": false,
  "calc_manual": false,
  "remote_manual": false,
  "se_manual": false,
  "out_value": 7.75,
  "out_qds": 0
}
```
**Source:** `in_value` (default)  
**Reason:** No manual overrides active  
**Quality:** Good (`qds: 0`)

---

### Scenario 2: Operator Manual Override
```json
{
  "in_value": 7.75,
  "in_qds": 0,
  "op_value": 10.0,
  "op_qds": 0,
  "op_manual": true,
  "calc_manual": false,
  "out_value": 10.0,
  "out_qds": 32
}
```
**Source:** `op_value` (operator set to 10.0)  
**Reason:** `op_manual = true`  
**Quality:** Substituted (`qds: 32` - manual value)  
**Use case:** Operator testing, simulation, or sensor failure workaround

---

### Scenario 3: Calculated Value (Formula/Script)
```json
{
  "in_value": null,
  "calculated_value": 145.6,
  "calculated_qds": 0,
  "calc_manual": true,
  "op_manual": false,
  "out_value": 145.6,
  "out_qds": 0
}
```
**Source:** `calculated_value`  
**Reason:** `calc_manual = true`  
**Use case:** Virtual telemetry (sum of other points, power balance, etc.)

**Example calculation:**
```javascript
// Virtual point: Total generation = Gen1 + Gen2 + Gen3
calculated_value = telemetry.Gen1.out_value + 
                   telemetry.Gen2.out_value + 
                   telemetry.Gen3.out_value;
```

---

### Scenario 4: State Estimation Override
```json
{
  "in_value": 7.75,
  "in_qds": 0,
  "se_value": 7.82,
  "se_qds": 0,
  "se_manual": true,
  "op_manual": false,
  "out_value": 7.82,
  "out_qds": 0
}
```
**Source:** `se_value` (validated by State Estimation)  
**Reason:** `se_manual = true`  
**Use case:** SE detected measurement error and corrected it

---

### Scenario 5: Remote Monitoring
```json
{
  "in_value": null,
  "remote_value": 220.5,
  "remote_qds": 0,
  "remote_manual": true,
  "op_manual": false,
  "out_value": 220.5,
  "out_qds": 0
}
```
**Source:** `remote_value`  
**Reason:** `remote_manual = true`  
**Use case:** Data from external system (neighboring grid, weather service, etc.)

---

## Operational Significance

### For Dispatchers

**Visual indicators needed:**
- Show which source is active (SCADA / Manual / Calculated / SE)
- Warning icon when `op_manual = true` (non-real data)
- Different color for calculated vs. measured values

**Example UI:**
```
P: 145.6 MW [CALC]     ← calculated_value active
Q: 23.4 MVAr [SCADA]   ← in_value active (default)
U: 220.0 kV [MANUAL]   ← op_value active (operator override)
```

---

### For Analysis

**Data quality assessment:**

```javascript
function assessValueQuality(telemetry) {
  const source = getActiveSource(telemetry);
  
  if (source.source === "in_value" && telemetry.in_qds === 0) {
    return "HIGH - Real measurement, good quality";
  }
  
  if (source.source === "se_value") {
    return "HIGH - State estimation validated";
  }
  
  if (source.source === "calculated_value") {
    return "MEDIUM - Calculated from other measurements";
  }
  
  if (source.source === "op_value") {
    return "LOW - Manual operator input (not real measurement)";
  }
  
  if (source.source === "remote_value") {
    return "MEDIUM - External system (verify sync)";
  }
  
  return "UNKNOWN";
}
```

**Root cause analysis:**

When investigating anomalies:
1. **Check source** - Is `out_value` from real SCADA or manual override?
2. **Verify QDS** - Is quality good?
3. **Check timestamps** - When was value last updated?

**Example:**
```javascript
if (telemetry.op_manual === true) {
  console.log("WARNING: Analyzing manual value - not real measurement!");
  console.log("Real SCADA value:", telemetry.in_value);
  console.log("Manual value:", telemetry.op_value);
}
```

---

## Common Patterns

### Virtual/Calculated Points

Aggregate telemetry (sums, totals):
```json
{
  "calculated_value": 456.2,   // Sum of Gen1 + Gen2 + Gen3
  "calc_manual": true,
  "in_value": null,            // No direct SCADA input
  "out_value": 456.2
}
```

**Examples:**
- `Pgen_sum` - Total generation at substation
- `Pload_sum` - Total load
- Power balance calculations

---

### Sensor Failure Workaround

When sensor fails, operator substitutes estimated value:
```json
{
  "in_value": -999.0,    // Sensor error
  "in_qds": 128,         // Invalid
  "op_value": 150.0,     // Operator estimate
  "op_manual": true,
  "out_value": 150.0,
  "out_qds": 32          // Substituted
}
```

**Dispatcher action:**
1. Notice invalid SCADA reading
2. Set `op_manual = true`
3. Enter estimated value in `op_value`
4. System publishes `out_value = 150.0` with `qds: 32` (substituted)

---

### State Estimation Correction

SE detects bad data and provides corrected value:
```json
{
  "in_value": 7.75,      // SCADA measurement
  "in_qds": 0,
  "se_value": 7.82,      // SE corrected value
  "se_manual": true,     // Use SE value
  "out_value": 7.82,
  "out_qds": 0
}
```

**SE process:**
1. Collect all measurements
2. Run network model
3. Detect inconsistencies (bad data)
4. Provide validated estimates
5. Optionally override raw measurements

---

## Priority Order

When multiple manual flags are set (rare), typical priority:

1. `op_manual` (highest - operator has final say)
2. `se_manual` (validated estimate)
3. `calc_manual` (calculated value)
4. `remote_manual` (external source)
5. *(default)* `in_value` (SCADA input)

**Note:** Best practice is only one manual flag active at a time.

---

## Best Practices

### For AI Analysis

1. **Always check source before trusting value:**
   ```javascript
   if (telemetry.op_manual || telemetry.calc_manual) {
     console.warn("Not a real measurement - verify before analysis");
   }
   ```

2. **Report source in explanations:**
   ```
   "Power flow at T1 is 145.6 MW (calculated from sum of loads)"
   vs.
   "Power flow at T1 is 145.6 MW (SCADA measurement)"
   ```

3. **Different confidence levels:**
   - Real SCADA (`in_value` + `qds: 0`) = High confidence
   - Calculated (`calculated_value`) = Medium confidence
   - Manual (`op_value`) = Low confidence (verify)

### For Operators

1. **Document manual overrides:**
   - Why was `op_manual` set?
   - When should it be cleared?
   - What's the real SCADA value?

2. **Clear manual flags after resolution:**
   - Sensor repaired → set `op_manual = false`
   - Return to normal SCADA input

3. **Alarm on long-term manual mode:**
   - If `op_manual` active for >24 hours → investigate

---

## Integration with QDS

Source selection **affects QDS**:

| Source           | Typical QDS | Meaning               |
|------------------|-------------|-----------------------|
| `in_value`       | 0           | Valid SCADA           |
| `in_value`       | 64          | Stale (timeout)       |
| `in_value`       | 128         | Invalid (sensor fail) |
| `op_value`       | 32          | Substituted (manual)  |
| `calculated_value` | 0         | Valid calculation     |
| `se_value`       | 0           | Valid SE estimate     |

**Combined check:**
```javascript
if (telemetry.out_qds === 32) {
  // QDS = 32 (Substituted) suggests manual override
  // Verify: check if op_manual === true
}
```

---

## See Also

- `qds-codes.md` - Quality descriptor meanings
- `state-codes.md` - State value mappings
- `timestamps.md` - Timestamp format and usage
- `../patterns/telemetry-fields.md` - Complete telemetry field reference

---

## Summary

**Key Concept:** `out_value` is **selected** from multiple sources based on control flags.

**Default:** `in_value` (SCADA input)  
**Overrides:** `op_manual`, `calc_manual`, `remote_manual`, `se_manual`  
**Critical:** Always check which source is active before analysis!
