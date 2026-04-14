# Timestamp Format

**Source:** Roman V (2026-02-19)  
**Context:** Ecomet telemetry and state timestamps

---

## Format

**All timestamps in Ecomet are Unix time in milliseconds**

```
Format: Unix epoch milliseconds
Example: 1771411160998
```

---

## Conversion

### To Human-Readable (JavaScript)
```javascript
const ts = 1771411160998;
const date = new Date(ts);
console.log(date.toISOString());
// Output: "2026-02-19T09:52:40.998Z"
```

### To Human-Readable (Python)
```python
import datetime

ts = 1771411160998
dt = datetime.datetime.fromtimestamp(ts / 1000.0, tz=datetime.timezone.utc)
print(dt.isoformat())
# Output: "2026-02-19T09:52:40.998+00:00"
```

### From Human-Readable
```javascript
const date = new Date("2026-02-19T09:52:40.998Z");
const ts = date.getTime();
// ts = 1771411160998
```

---

## Common Timestamp Fields

### Telemetry Timestamps
```json
{
  "in_ts": 1771411160998,     // Input value timestamp (from SCADA)
  "op_ts": 1771411160998,     // Operational value timestamp
  "out_ts": 1771411160998,    // Output/published value timestamp
  "remote_ts": null,          // Remote monitoring timestamp
  "se_ts": null               // State estimation timestamp
}
```

### State Timestamps
```json
{
  "state_connection_update_ts": 1771411160998,  // Last connection state update
  "se_state_ts": null                           // State estimation timestamp
}
```

---

## Precision

- **Millisecond precision** (3 decimal places for seconds)
- Useful for:
  - Event sequencing (cascade analysis)
  - Communication timeout detection
  - Data freshness validation
  - Alarm correlation

---

## Age Calculation

### Check Data Freshness
```javascript
function isStale(ts, maxAgeMs = 10000) {
  const now = Date.now();
  const age = now - ts;
  return age > maxAgeMs;
}

// Example: Check if telemetry is older than 10 seconds
const telemetry = {
  "out_value": 7.75,
  "out_qds": 0,
  "out_ts": 1771411160998
};

if (isStale(telemetry.out_ts)) {
  console.log("Data is stale!");
}
```

### Human-Friendly Age
```javascript
function formatAge(ts) {
  const now = Date.now();
  const ageMs = now - ts;
  const ageSec = Math.floor(ageMs / 1000);
  const ageMin = Math.floor(ageSec / 60);
  const ageHr = Math.floor(ageMin / 60);
  
  if (ageHr > 0) return `${ageHr}h ago`;
  if (ageMin > 0) return `${ageMin}m ago`;
  return `${ageSec}s ago`;
}

// Example: "3h ago", "15m ago", "45s ago"
```

---

## Timezone Handling

**Important:** Unix timestamps are **timezone-agnostic** (always UTC-based).

When displaying to users:
- Convert to local timezone for readability
- Always show timezone indicator (UTC, local, etc.)

```javascript
// Display in UTC
date.toISOString()  // "2026-02-19T09:52:40.998Z"

// Display in local time
date.toLocaleString('en-US', { timeZone: 'Asia/Almaty' })
// "2/19/2026, 3:52:40 PM" (Almaty is UTC+6)
```

---

## Null Timestamps

`null` timestamp indicates:
- Value has never been set
- Field not applicable
- Data not yet computed (e.g., `se_ts: null` if SE hasn't run)

```json
{
  "in_ts": 1771411160998,    // Has input data
  "se_ts": null              // SE not yet computed
}
```

---

## Use Cases

### 1. Communication Loss Detection
```javascript
function checkCommunication(telemetry, timeoutMs = 30000) {
  if (telemetry.out_qds === 64) {  // Not Topical
    const ageMs = Date.now() - telemetry.out_ts;
    return {
      status: "TIMEOUT",
      message: `No data for ${formatAge(telemetry.out_ts)}`,
      age: ageMs
    };
  }
  return { status: "OK" };
}
```

### 2. Cascade/Sequence Analysis
```javascript
// Find events that happened within 1 second of each other
function findCascade(alarms, windowMs = 1000) {
  const sorted = alarms.sort((a, b) => a.dt_on - b.dt_on);
  const cascades = [];
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const delta = sorted[i+1].dt_on - sorted[i].dt_on;
    if (delta <= windowMs) {
      cascades.push({
        first: sorted[i],
        second: sorted[i+1],
        deltaMs: delta
      });
    }
  }
  
  return cascades;
}
```

### 3. Data Staleness Warning
```javascript
function getDataQuality(ts) {
  const ageMs = Date.now() - ts;
  
  if (ageMs < 5000) return "FRESH";      // < 5 sec
  if (ageMs < 30000) return "RECENT";    // < 30 sec
  if (ageMs < 300000) return "STALE";    // < 5 min
  return "VERY_STALE";                   // > 5 min
}
```

---

## Best Practices

1. **Always check timestamp with QDS**
   ```javascript
   if (telemetry.out_qds === 0 && !isStale(telemetry.out_ts)) {
     // Safe to use value
   }
   ```

2. **Display timestamps in user context**
   - Use local timezone for operator displays
   - Include "X minutes ago" for recent events
   - Show full ISO timestamp for historical analysis

3. **Log timestamp deltas for debugging**
   ```javascript
   console.log(`Input delay: ${telemetry.op_ts - telemetry.in_ts}ms`);
   ```

4. **Handle null gracefully**
   ```javascript
   const age = ts ? formatAge(ts) : "Never";
   ```

---

## See Also

- `qds-codes.md` - Quality descriptors (includes stale data detection)
- `state-codes.md` - State value mappings
- `../../ELECTRICITY-GRID/patterns/telemetry-fields.md` - Telemetry field reference

---

**Note:** Millisecond precision is critical for:
- **Sequence analysis** (which alarm triggered first?)
- **Cascade detection** (events within 1 second = likely related)
- **Communication monitoring** (detect timeouts accurately)
