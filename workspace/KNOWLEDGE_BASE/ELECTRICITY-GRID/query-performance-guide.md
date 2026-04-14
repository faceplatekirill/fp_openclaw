# Ecomet Query Performance Guide (ELECTRICITY-GRID)

**Created:** 2026-03-05  
**Layer:** ELECTRICITY-GRID  
**Purpose:** Grid-specific performance patterns for topology, telemetry, and alarm analysis

---

## Scope

This guide applies CORE performance rules to electricity-grid workflows.

Use this file for:
- station/region scoped telemetry queries
- topology-oriented staged query design
- alarm-window query performance
- grid-specific anti-patterns

Generic operator/index mechanics remain in `../CORE/query-performance-guide.md`.

---

## 1. Grid Performance Principle

Use staged retrieval:

1. Get topology scope using indexed path/pattern queries.
2. Query runtime fields (telemetry/state) only for narrowed objects.
3. Avoid broad strict filtering on runtime fields.

---

## 2. Grid-Specific Cost Hotspots

Expensive fields in grid workflows are often runtime and non-indexed:
- `out_value`, `out_qds`, `out_ts`
- `state_connection`, `state_graph`
- frequently changing calculated fields

Cheap selectors are typically indexed:
- `.pattern`
- `.fp_path` (`=` or `LIKE` with 3+ chars)
- datetime ranges in archive (`dt_on[...]` etc.)

---

## 3. Fast Grid Patterns

### Pattern A: Station-scoped telemetry listing

```javascript
get .fp_path, out_value, out_qds from 'project' where
  and(
    .pattern = $oid('/root/FP/prototypes/telemetry/fields'),
    .fp_path LIKE '/COUNTRY_A/REGION_1/STATION_X/'
  )
  page 1:100
  format $to_json
```

### Pattern B: Terminal-to-line staged lookup

```javascript
// Stage 1: collect terminals by indexed scope
get .fp_path from 'project' where
  and(
    .pattern = $oid('/root/FP/prototypes/line terminal/fields'),
    .fp_path LIKE '/COUNTRY_A/REGION_1/STATION_X/'
  )
  page 1:200
  format $to_json

// Stage 2: resolve connected lines via exact link equality
get .fp_path, pole_i, pole_j from 'project' where
  and(
    .pattern = $oid('/root/FP/prototypes/line/fields'),
    OR(
      pole_i = $oid('/root/FP/PROJECT/.../TERM_1'),
      pole_j = $oid('/root/FP/PROJECT/.../TERM_1')
    )
  )
  page 1:200
  format $to_json
```

### Pattern C: Archive alarm window

```javascript
get text, point, dt_on from 'archive' where
  and(
    .pattern = $oid('/root/.patterns/alarm'),
    dt_on[1708430000000:1708433600000]
  )
  page 1:200
  format $to_json
```

### Pattern D: Strict runtime filter only after narrowing

```javascript
get .fp_path, out_value from 'project' where
  and(
    .pattern = $oid('/root/FP/prototypes/telemetry/fields'),
    .fp_path LIKE '/COUNTRY_A/REGION_1/STATION_X/220/',
    out_value :>= 100
  )
  page 1:100
  format $to_json
```

---

## 4. Grid Anti-Patterns

### Anti-pattern A: Broad station scan without type filter

```javascript
.fp_path LIKE '/STATION_X/'
```

Use `.pattern = ...` with it.

### Anti-pattern B: Link-field LIKE for connectivity

```javascript
pole_i LIKE '/STATION_X/'
```

Use exact link equality (`pole_i = $oid(...)`, `pole_j = $oid(...)`).

### Anti-pattern C: Unsupported regular comparison operators

```javascript
out_value > 100
```

Use strict variants after narrowing (`out_value :> 100`).

### Anti-pattern D: Strict runtime filter on full project scope

```javascript
out_value := 100
```

Never do this without indexed pre-filtering.

---

## 5. Grid Performance Checklist

- [ ] Query starts with indexed scope (`.pattern`, `.fp_path`, datetime range)
- [ ] LIKE fragments are 3+ chars and paginated
- [ ] Link fields resolved by exact OID equality (not LIKE)
- [ ] Strict runtime filtering only after strong narrowing
- [ ] Regular comparison operators are not used

---

## 6. Diagnostic Flow

1. Validate scope query result count first.
2. Validate pattern-specific subset next.
3. Add runtime fields and strict filters last.
4. If latency spikes, split into two stages (scope -> runtime).

---

## See Also

- `query-workflow.md`
- `ecomet-api-reference.md`
- `ecomet-field-indexes.md`
- `ecomet-like-operator.md`
- `architecture/static-vs-dynamic-fields.md`
- `../CORE/query-performance-guide.md`
