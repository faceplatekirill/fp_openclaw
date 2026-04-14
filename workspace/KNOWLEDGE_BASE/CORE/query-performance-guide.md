# Ecomet Query Performance Guide (CORE)

**Updated:** 2026-03-05  
**Layer:** CORE  
**Purpose:** Generic performance rules for Ecomet queries across domains

---

## Scope

This guide covers domain-agnostic performance behavior.

Use this file for:
- index-first query design
- regular vs strict operator cost model
- pagination and batching strategy
- generic slow-query diagnostics

---

## 1. Performance Model

Fast queries are index-driven. Slow queries are scan-driven.

### Index-backed path (preferred)
- Use indexed fields early (`.fp_path`, `.pattern`, `.name`, datetime ranges)
- Keep candidate set small before any strict operator

### Scan path (expensive)
- Strict operators (`:=`, `:>`, `:<`, `:>=`, `:<=`, `:<>`, `:LIKE`)
- Non-indexed field filtering without pre-filtering

---

## 2. Operator Support and Cost

### Regular operators
- `=`
- `LIKE` (requires `3gram`, fragment length >= 3)
- `field[from:to]` for datetime index

Regular comparison operators `>`, `<`, `>=`, `<=`, `<>` are currently unsupported.

### Strict operators
- `:=`, `:>`, `:<`, `:>=`, `:<=`, `:<>`, `:LIKE`

Strict operators are supported, but scan-based. Use only after indexed narrowing.

---

## 3. Core Indexed Fields

Common high-value indexed fields:
- `.fp_path` (`simple`, `3gram`)
- `.name` (`simple`, `3gram`)
- `.pattern` (`simple`)
- `.folder` (`simple`)
- alarm datetime fields such as `dt_on` (`datetime`, often `simple`)

For field-specific details, see `ecomet-field-indexes.md`.

---

## 4. Fast Query Patterns

### Pattern A: Exact path lookup

```javascript
get .fp_path, .name from 'project' where
  .fp_path = '/root/FP/PROJECT/AREA_A/DEVICE_X'
  format $to_json
```

### Pattern B: Pattern-constrained listing (paginated)

```javascript
get .fp_path, .name from 'project' where
  .pattern = $oid('/root/FP/prototypes/telemetry/fields')
  page 1:100
  format $to_json
```

### Pattern C: Scoped LIKE with pagination

```javascript
get .fp_path, .name from 'project' where
  .fp_path LIKE '/AREA_A/STATION_X/'
  page 1:100
  format $to_json
```

### Pattern D: Datetime range query

```javascript
get text, dt_on from 'archive' where
  and(
    .pattern = $oid('/root/.patterns/alarm'),
    dt_on[1708430000000:1708433600000]
  )
  page 1:200
  format $to_json
```

### Pattern E: Batch OR for known paths

```javascript
get .fp_path, .name from 'project' where
  OR(
    .fp_path = '/root/FP/PROJECT/AREA_A/NODE_1',
    .fp_path = '/root/FP/PROJECT/AREA_A/NODE_2',
    .fp_path = '/root/FP/PROJECT/AREA_A/NODE_3'
  )
  format $to_json
```

---

## 5. Strict-Operator Usage Pattern

Use strict filters only after indexed narrowing.

```javascript
get .fp_path, custom_metric from 'project' where
  and(
    .pattern = $oid('/root/FP/prototypes/custom/fields'),
    .fp_path LIKE '/AREA_A/STATION_X/',
    custom_metric :>= 10
  )
  page 1:100
  format $to_json
```

For substring filtering on non-`3gram` fields:

```javascript
and(
  .pattern = $oid('/root/.patterns/alarm'),
  dt_on[1708430000000:1708433600000],
  text :LIKE 'trip'
)
```

---

## 6. Anti-Patterns

### Anti-pattern A: strict filter first

```javascript
get .fp_path from 'project' where out_value := 100.0
```

### Anti-pattern B: LIKE on non-`3gram` field

```javascript
text LIKE 'tru'
```

### Anti-pattern C: unsupported regular comparison operators

```javascript
dt_on > 1740096000000
```

Use datetime range syntax instead:

```javascript
dt_on[1740096000000:${Date.now()}]
```

---

## 7. Performance Checklist

- [ ] Primary filter is indexed (`.fp_path`, `.pattern`, `.name`, datetime range)
- [ ] LIKE fragment length is >= 3
- [ ] Broad queries are paginated (`page X:Y`)
- [ ] Strict operators used only after narrowing
- [ ] No unsupported regular comparisons (`>`, `<`, `>=`, `<=`, `<>`)

---

## 8. Debugging Slow Queries

1. Reduce query to indexed path/pattern probe.
2. Check returned count using small page window.
3. Reintroduce conditions one by one.
4. Move strict filters to the final stage.
5. Split one large query into staged queries if needed.

---

## See Also

- `ecomet-field-indexes.md`
- `ecomet-api-reference.md`
- `ecomet-like-operator.md`
- `./semantics/datetime-handling.md`
