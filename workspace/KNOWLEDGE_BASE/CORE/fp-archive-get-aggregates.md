# fp_archive/get_aggregates API

**Updated:** 2026-03-06

---

## Purpose

Calculates aggregated values (avg, min, max, integral, etc.) over archive time-series data for one or more time periods. Unlike `fp_json/read_archives` which returns raw data points, this endpoint returns computed statistical summaries.

---

## How To Call

Use Ecomet `application` call:

```javascript
ecomet_api({
  action: "application",
  module: "fp_archive",
  method: "get_aggregates",
  params: {
    aggregates: [
      ["/root/FP/PROJECT/.../ARCHIVE_PATH", "avg"],
      ["/root/FP/PROJECT/.../ARCHIVE_PATH", "max"],
      ["/root/FP/PROJECT/.../ARCHIVE_PATH", "integral"],
      ["/root/FP/PROJECT/.../OTHER_ARCHIVE",  "fp_aggregates:integral_pos"]
    ],
    timestamps: [T0, T1, T2, T3]
  }
})
```

---

## Parameters

### `aggregates` (required)

Array of `[archive, aggregate_function]` pairs:

- **archive** — full path of the archive object
- **aggregate_function** — one of:
  - **Short name** (string): `"avg"`, `"min"`, `"max"`, `"integral"`, `"standard_deviation"` — resolved from built-in defaults
  - **Module:Function** (string): `"fp_aggregates:integral_pos"` — calls a custom aggregate function

The same archive can appear multiple times with different aggregate functions.

### `timestamps` (required)

Array of integer timestamps (milliseconds since epoch, UTC). Consecutive pairs define time periods:

```
[T0, T1, T2, T3]  →  periods: [T0..T1), [T1..T2), [T2..T3)
```

- Minimum 2 timestamps (= 1 period)
- Timestamps must be monotonically increasing
- This design allows querying multiple consecutive periods in one call (e.g., hourly buckets for a day = 25 timestamps)

---

## Response Shape

```json
{
  "values": {
    "<T1>": {
      "<archive_path>": {
        "avg": 42.5,
        "max": 100.0
      }
    },
    "<T2>": {
      "<archive_path>": {
        "avg": 38.1,
        "max": 95.0
      },
      "<other_archive>": {
        "fp_aggregates:integral_pos": 12345.0
      }
    }
  },
  "invalid": {
    "<bad_archive_path>": true
  }
}
```

- **Keys in `values`** are the *end timestamps* of each period (T1, T2, T3...)
- **Archive keys** match the paths from the request
- **Aggregate keys** match the function names from the request
- **Values** are numbers or `null` (`undefined`) if no valid data exists for the period
- **`invalid`** contains archives that could not be resolved (bad OID/path)

---

## Available Aggregate Functions

### Built-in (short name)

| Function | Description |
|---|---|
| `integral` | Time-weighted integral. `Σ(value × Δt)` in millisecond-units. Useful for energy from power: `integral / 3600000` = Wh if archive stores watts |
| `avg` | Time-weighted average. `integral / total_time`. Represents the mean value weighted by how long each value persisted |
| `max` | Maximum value observed in the period |
| `min` | Minimum value observed in the period |
| `standard_deviation` | Time-weighted standard deviation |

### Custom (module:function)

Custom aggregates are defined in the `fp_aggregates` module, editable at `/root/FP/ENV/aggregates` in the database. Example:

| Function | Description |
|---|---|
| `fp_aggregates:integral_pos` | Like `integral`, but only counts positive values (negative and zero are skipped) |

### Discovering Available Functions

Use the companion endpoint:

```javascript
ecomet_api({
  action: "application",
  module: "fp_archive",
  method: "get_available_aggregates",
  params: {}
})
```

Returns a flat list of all available function names (both built-in and custom).

---

## Time-Weighted vs Simple Aggregates

All built-in aggregates except `min`/`max` are **time-weighted**. This means:
- A value that persisted for 50 minutes contributes more to `avg` than one that lasted 10 minutes
- `integral` is a true area-under-curve calculation, not a simple sum of values
- The first data point in each period establishes the initial value but does not contribute to the result by itself (it needs a subsequent point to define a time interval)

---

## Practical Examples

### Single period, one archive, multiple aggregates

Query average and maximum voltage for the last hour:

```javascript
const now = Date.now();
const hourAgo = now - 3600000;

ecomet_api({
  action: "application",
  module: "fp_archive",
  method: "get_aggregates",
  params: {
    aggregates: [
      ["/root/FP/PROJECT/GE/REGION1/SUB01/BAY1/U/archive", "avg"],
      ["/root/FP/PROJECT/GE/REGION1/SUB01/BAY1/U/archive", "max"],
      ["/root/FP/PROJECT/GE/REGION1/SUB01/BAY1/U/archive", "min"]
    ],
    timestamps: [hourAgo, now]
  }
})
```

### Multiple periods (hourly buckets for a day)

Generate 25 timestamps for 24 one-hour periods:

```javascript
const dayStart = new Date("2026-03-05T00:00:00Z").getTime();
const timestamps = Array.from({length: 25}, (_, i) => dayStart + i * 3600000);

ecomet_api({
  action: "application",
  module: "fp_archive",
  method: "get_aggregates",
  params: {
    aggregates: [
      [archivePath, "avg"],
      [archivePath, "max"]
    ],
    timestamps: timestamps
  }
})
// Response will have 24 entries in "values", keyed by each hour's end timestamp
```

### Energy calculation from power archive

To get energy (kWh) from an active power archive (stores kW):

```javascript
ecomet_api({
  action: "application",
  module: "fp_archive",
  method: "get_aggregates",
  params: {
    aggregates: [[powerArchive, "integral"]],
    timestamps: [periodStart, periodEnd]
  }
})
// integral returns kW × ms
// To convert to kWh: result / 3600000
```

---

## Important Notes

- **Caching**: The system caches aggregate results for complete past hours. Queries spanning full hours are faster on subsequent calls.
- **undefined values**: Data points with `undefined`/`null` values are skipped in all aggregate calculations. If an entire period has no valid data, the aggregate returns `null`.
- **Performance**: Group multiple archives and aggregates into a single call rather than making separate calls — the system groups by storage internally for efficiency.
- **Period boundaries**: The start timestamp is inclusive, the end timestamp is exclusive — `[T0, T1)`.
