# DateTime Handling in Ecomet

**Purpose:** Complete reference for working with timestamps in Ecomet QL

---

## Storage Format

**All timestamps:** Unix time in **milliseconds** (not seconds!)

**Timezone:** Always **UTC** (no timezone-aware queries supported)

---

## Query Syntax

### Time Range Queries (indexed)

```javascript
// Syntax: field[from_ms:to_ms]
dt_on[1740096000000:1740182400000]
```

**Works on datetime-indexed fields:**
- `dt_on` (alarm: time appeared)
- `dt_ack` (alarm: time acknowledged)
- `dt_off` (alarm: time disappeared)
- `dt_comment` (alarm: time commented)
- `dt_device` (device: event time)

**Performance:** ⚡ Very fast (uses datetime index)

---

### Example Queries

#### Recent Alarms (last 24 hours)
```javascript
const now = Date.now();
const yesterday = now - 24 * 60 * 60 * 1000;

ecomet_api({
  action: "query",
  statement: `
    get text, dt_on, point from 'archive' where
      and(
        .pattern = $oid('/root/.patterns/alarm'),
        dt_on[${yesterday}:${now}]
      )
    page 1:100
    format $to_json
  `
})
```

#### Alarms in Specific Time Window
```javascript
// 2026-02-20 00:00:00 UTC to 2026-02-20 23:59:59 UTC
const start = new Date('2026-02-20T00:00:00Z').getTime();  // 1740096000000
const end = new Date('2026-02-20T23:59:59Z').getTime();    // 1740182399000

ecomet_api({
  action: "query",
  statement: `
    get text, dt_on from 'archive' where
      and(
        .pattern = $oid('/root/.patterns/alarm'),
        acknowledged = false,
        dt_on[${start}:${end}]
      )
    format $to_json
  `
})
```

#### Alarms Since Specific Timestamp
```javascript
// All alarms since 2026-02-20 12:00:00 UTC
const since = new Date('2026-02-20T12:00:00Z').getTime();
const now = Date.now();

ecomet_api({
  action: "query",
  statement: `
    get text, dt_on from 'archive' where
      and(
        .pattern = $oid('/root/.patterns/alarm'),
        dt_on[${since}:${now}]
      )
    page 1:50
    format $to_json
  `
})
```

---

## Output Format

**Response always contains milliseconds:**
```json
{
  "count": 2,
  "result": [
    ["text", "dt_on"],
    ["Alarm text 1", 1740156789123],
    ["Alarm text 2", 1740167890456]
  ]
}
```

---

## Client-Side Processing

### JavaScript/TypeScript Conversion

```javascript
// Parse response
const response = await ecomet_api({ ... });
const [[headers], ...rows] = response.result || response;

// Convert milliseconds → human-readable
rows.forEach(([text, dt_on]) => {
  const date = new Date(dt_on);
  
  // ISO format (UTC)
  console.log(date.toISOString());
  // → "2026-02-20T13:05:15.791Z"
  
  // Local time
  console.log(date.toLocaleString());
  // → "2/20/2026, 4:05:15 PM" (depends on system locale)
  
  // Custom format
  console.log(date.toISOString().replace('T', ' ').slice(0, 19));
  // → "2026-02-20 13:05:15"
});
```

### Common Time Ranges (helper functions)

```javascript
// Helper: Get time range for common periods
function getTimeRange(period) {
  const now = Date.now();
  const ranges = {
    'last-hour':     now - 60 * 60 * 1000,
    'last-24h':      now - 24 * 60 * 60 * 1000,
    'last-week':     now - 7 * 24 * 60 * 60 * 1000,
    'last-month':    now - 30 * 24 * 60 * 60 * 1000,
  };
  return [ranges[period], now];
}

// Usage
const [from, to] = getTimeRange('last-24h');
const query = `dt_on[${from}:${to}]`;
```

---

## Limitations

### ❌ NOT Supported:

1. **Built-in time functions**
   - No `$now()`, `$datetime()`, `$timestamp()` functions
   - Must calculate timestamps client-side

2. **Timezone-aware queries**
   - All timestamps are UTC
   - No automatic conversion to local time
   - No DST handling in queries

3. **Relative time syntax**
   - No `dt_on > NOW() - INTERVAL 1 DAY`
   - Must calculate exact milliseconds

4. **Date-only comparisons**
   - No `dt_on = '2026-02-20'` (date without time)
   - Must specify full timestamp range

---

## Best Practices

### ✅ DO:

1. **Always use datetime range syntax for indexed fields**
   ```javascript
   dt_on[${start}:${end}]  // Uses index ⚡
   ```

2. **Calculate timestamps before query**
   ```javascript
   const tenMinAgo = Date.now() - 10 * 60 * 1000;
   const query = `dt_on[${tenMinAgo}:${Date.now()}]`;
   ```

3. **Use pagination for large time ranges**
   ```javascript
   // Week of data = potentially thousands of records
   dt_on[${weekAgo}:${now}] page 1:100
   ```

4. **Format output for humans**
   ```javascript
   // Don't show raw ms to users
   const date = new Date(dt_on);
   console.log(date.toLocaleString('en-US', { 
     timeZone: 'Asia/Almaty',
     dateStyle: 'medium',
     timeStyle: 'medium'
   }));
   ```

### ❌ DON'T:

1. **Don't use comparison operators on datetime fields**
   ```javascript
   // BAD: Doesn't use datetime index!
   dt_on > 1740096000000
   
   // GOOD: Uses datetime index
   dt_on[1740096000000:${Date.now()}]
   ```

2. **Don't forget milliseconds vs seconds**
   ```javascript
   // WRONG: This is seconds (1970-01-21)
   dt_on[1740096000:1740182400]
   
   // RIGHT: Milliseconds (2026-02-20)
   dt_on[1740096000000:1740182400000]
   ```

3. **Don't hardcode timestamps** (use dynamic calculations)
   ```javascript
   // BAD: Will be stale immediately
   dt_on[1740096000000:1740182400000]
   
   // GOOD: Always relative to now
   const now = Date.now();
   dt_on[${now - 24*60*60*1000}:${now}]
   ```

---

## Common Millisecond Calculations

```javascript
// Time units in milliseconds
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Examples
const now = Date.now();
const tenMinutesAgo = now - 10 * MS_PER_MINUTE;
const yesterday = now - MS_PER_DAY;
const lastWeek = now - 7 * MS_PER_DAY;

// Specific date/time
const specificTime = new Date('2026-02-20T12:00:00Z').getTime();
```

---

## Related Documentation

- `../ecomet-field-indexes.md` - Which fields have datetime indexes
- `../ecomet-api-reference.md` - Query syntax examples
- `qds-codes.md` - Quality descriptors for telemetry timestamps

---

**Last Updated:** 2026-02-22  
**Key Constraint:** No built-in time functions, all calculations client-side
