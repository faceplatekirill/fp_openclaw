# Ecomet QL LIKE Operator (CORE)

**Updated:** 2026-03-05  
**Layer:** CORE  
**Purpose:** Generic LIKE semantics and usage rules for Ecomet QL

---

## Scope

This document covers LIKE behavior that applies to any Ecomet deployment.

Use this file for:
- LIKE syntax and matching behavior
- wildcard limitations
- minimum substring length
- index requirements
- strict `:LIKE` fallback behavior

---

## 1. Critical Rules

1. Ecomet LIKE is substring search, not SQL wildcard matching.
2. LIKE works only for substring fragments with length **>= 3** characters.
3. LIKE requires a `3gram` index on the target field.
4. LIKE matching is case-insensitive.

If a field has no `3gram` index, regular `LIKE` will not work.
Use strict `:LIKE` only after strong indexed pre-filtering.

---

## 2. Syntax and Semantics

### Wrong

```javascript
.fp_path LIKE '/root/FP/PROJECT/AREA_A/%'
.fp_path LIKE '%STATION_X%'
.fp_path LIKE 'ab'              // < 3 chars
```

### Correct

```javascript
.fp_path LIKE '/AREA_A/STATION_X/'
```

Interpretation: returns rows where the field contains the exact substring.

---

## 3. LIKE vs :LIKE

### `LIKE` (regular)
- Uses `3gram` index
- Fast on indexed fields
- Requires substring length >= 3

### `:LIKE` (strict)
- Does not use `3gram` index
- Scan-oriented and potentially expensive
- Use only after indexed narrowing (`.pattern =`, `.fp_path =`, scoped `LIKE`, etc.)

Example fallback:

```javascript
get .fp_path, custom_text from 'project' where
  and(
    .pattern = $oid('/root/FP/prototypes/custom/fields'),
    .folder = '/root/FP/PROJECT/AREA_A',
    custom_text :LIKE 'trip'
  )
  page 1:100
  format $to_json
```

---

## 4. Core Usage Patterns

### Pattern A: Subtree search

```javascript
get .fp_path, .name from 'project' where
  .fp_path LIKE '/AREA_A/STATION_X/'
  page 1:100
  format $to_json
```

### Pattern B: Combined with exact type filter

```javascript
get .fp_path from 'project' where
  and(
    .pattern = $oid('/root/FP/prototypes/telemetry/fields'),
    .fp_path LIKE '/AREA_A/STATION_X/'
  )
  page 1:100
  format $to_json
```

### Pattern C: Multiple scopes via OR

```javascript
where or(
  .fp_path LIKE '/AREA_A/STATION_X/',
  .fp_path LIKE '/AREA_A/STATION_Y/'
)
```

---

## 5. String Boundary Guidance

Prefer folder-bounded fragments (with slashes) to reduce false matches.

- Better: `'/STATION_X/'`
- Riskier: `'STATION_X'`

---

## 6. Troubleshooting

If result is empty:

1. Check character script/encoding consistency.
2. Verify substring spelling and delimiters.
3. Confirm substring length is at least 3 chars.
4. Confirm field has `3gram` index (for regular LIKE).
5. Run a broader probe query, then narrow.

Probe example:

```javascript
get .fp_path from 'project' where
  .fp_path LIKE '/STATION_X/'
  page 1:20
  format $to_json
```

---

## 7. Performance Guidance

- Prefer exact `=` when exact value is known.
- Use LIKE only on `3gram` fields with fragments >=3 chars.
- Add pagination for broad LIKE queries.
- Use `:LIKE` only after indexed narrowing.

---

## 8. Operator Comparison

| Operator | Meaning | Index Path | Notes |
|---|---|---|---|
| `=` | exact equality | fast on indexed fields | best for known values |
| `LIKE` | substring contains | fast with `3gram` | requires fragment length >=3 |
| `:LIKE` | strict substring search | scan-oriented | fallback if no `3gram` |
| `:=` | strict equality | scan-oriented | use after narrowing |

---

## See Also

- `ecomet-field-indexes.md`
- `ecomet-api-reference.md`
- `query-performance-guide.md`
