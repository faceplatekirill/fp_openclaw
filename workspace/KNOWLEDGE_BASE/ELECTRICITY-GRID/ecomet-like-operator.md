# Ecomet QL LIKE Operator (ELECTRICITY-GRID)

**Updated:** 2026-03-05  
**Layer:** ELECTRICITY-GRID  
**Purpose:** Grid-specific LIKE usage patterns for station hierarchy and topology workflows

---

## Scope

This document extends CORE LIKE rules with electricity-grid-specific practices.

Use this file for:
- station/region/voltage path scoping with LIKE
- grid query composition with `.pattern` + LIKE
- fallback rules when `3gram` is missing
- link-field caveats (`pole_i`, `pole_j`)

Generic LIKE semantics are in `../CORE/ecomet-like-operator.md`.

---

## 1. Grid LIKE Principles

1. LIKE fragments must be at least **3 characters**.
2. Regular LIKE works only on fields with `3gram` index.
3. If a field has no `3gram`, use strict `:LIKE` only after indexed narrowing.
4. LIKE matching is case-insensitive.
5. Keep path fragments folder-bounded (`'/STATION_X/'`, not `'STATION_X'`).
6. Always paginate broad LIKE queries.

---

## 2. Common Grid Scoping Patterns

### Station scope

```javascript
.fp_path LIKE '/COUNTRY_A/REGION_1/STATION_X/'
```

### Voltage class scope

```javascript
.fp_path LIKE '/STATION_X/220/'
```

### Region scope

```javascript
.fp_path LIKE '/COUNTRY_A/REGION_1/'
```

### Multiple stations

```javascript
OR(
  .fp_path LIKE '/STATION_X/',
  .fp_path LIKE '/STATION_Y/'
)
```

---

## 3. LIKE + Pattern Filter (Recommended)

Use LIKE as scope filter and `.pattern` as object-type filter.

```javascript
get .fp_path, out_value, out_qds from 'project' where
  and(
    .pattern = $oid('/root/FP/prototypes/telemetry/fields'),
    .fp_path LIKE '/COUNTRY_A/REGION_1/STATION_X/'
  )
  page 1:100
  format $to_json
```

Without `.pattern`, broad station queries may return heterogeneous objects.

---

## 4. Strict `:LIKE` Fallback

When a field has no `3gram`, regular LIKE will not work.
Use `:LIKE` only after indexed narrowing.

```javascript
get .fp_path, alarm_text from 'archive' where
  and(
    .pattern = $oid('/root/.patterns/alarm'),
    dt_on[1708430000000:1708433600000],
    text :LIKE 'trip'
  )
  page 1:200
  format $to_json
```

---

## 5. Critical Caveat: Link Fields

For topology links (`pole_i`, `pole_j`), use exact OID equality:

```javascript
pole_i = $oid('/root/FP/PROJECT/.../TERM_1')
pole_j = $oid('/root/FP/PROJECT/.../TERM_1')
```

Do not use LIKE or `:LIKE` for connectivity resolution on link fields.

Recommended two-step approach:
1. Find terminal candidates with `.fp_path LIKE ...` and terminal `.pattern`.
2. Resolve connected lines with `pole_i = $oid(...) OR pole_j = $oid(...)`.

---

## 6. Grid Troubleshooting Checklist

If LIKE query returns nothing or too much:

1. Confirm canonical station path before query composition.
2. Verify script consistency and substring spelling.
3. Ensure LIKE fragment length >=3 characters.
4. Check whether field has `3gram` index.
5. Add `.pattern` filter and reduce scope.
6. If needed, switch to `:LIKE` after indexed narrowing.

---

## 7. Query Templates

### Telemetry listing under station

```javascript
get .fp_path, out_value, out_qds from 'project' where
  and(
    .pattern = $oid('/root/FP/prototypes/telemetry/fields'),
    .fp_path LIKE '/COUNTRY_A/REGION_1/STATION_X/'
  )
  page 1:100
  format $to_json
```

### Terminal listing under station

```javascript
get .fp_path, .name from 'project' where
  and(
    .pattern = $oid('/root/FP/prototypes/line terminal/fields'),
    .fp_path LIKE '/COUNTRY_A/REGION_1/STATION_X/'
  )
  page 1:200
  format $to_json
```

---

## See Also

- `ecomet-api-reference.md`
- `ecomet-field-indexes.md`
- `ecomet-advanced-query-patterns.md`
- `query-workflow.md`
- `../CORE/ecomet-like-operator.md`
