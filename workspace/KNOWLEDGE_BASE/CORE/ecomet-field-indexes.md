# Ecomet Field Indexes Reference (CORE)

**Updated:** 2026-03-05  
**Layer:** CORE  
**Purpose:** Generic index behavior and operator rules for any Ecomet deployment

---

## Scope

This document contains index knowledge that is reusable across domains.

Use this file for:
- Index type semantics (`simple`, `3gram`, `datetime`)
- Operator behavior (regular vs strict)
- System-field query strategy
- Alarm archive indexing basics

---

## 1. Index Types and Supported Operators

### `simple` (exact-match index)
- Primary operator: `=`
- Best for exact lookups
- Performance: fast when used as primary filter

### `3gram` (substring index)
- Primary operator: `LIKE`
- Best for partial text/path matching
- Performance: fast for indexed text fields
- Constraint: LIKE fragment length must be >= 3 characters

### `datetime` (time-range index)
- Syntax: `field[<from_ms>:<to_ms>]`
- Best for archive/time-window queries
- Time format: Unix milliseconds (UTC)

---

## 2. Regular vs Strict Operators

### Regular operators (indexed path)
- `=`,
- `LIKE`
- `field[from:to]`
- Regular comparison operators `>`, `<`, `>=`, `<=`, `<>` are currently UNSUPPORTED.
- Strict comparison variants are supported (`:>`, `:<`, `:>=`, `:<=`, `:<>`).

Use these first whenever matching index exists.

### Strict operators (scan path)
- `:=`, `:>`, `:<`, `:>=`, `:<=`, `:<>`, `:LIKE`

Strict operators can evaluate non-indexed fields, but they are expensive.

Use strict operators only when:
1. You already reduced the dataset with indexed filters.
2. You must evaluate a field without a usable index.
3. You need substring matching on a field without `3gram` index (`:LIKE`).
4. You need comparison filtering with supported strict comparison operators.

Never use strict operators as the only high-cardinality filter.

---

## 3. Core Field Index Map

### System fields (common across objects)

### Typical `simple`
- `.fp_path`
- `.name`
- `.pattern`
- `.folder`
- `.readgroups`
- `.writegroups`
- `prototype`
- `database`
- `disabled`

### Typical `3gram`
- `.fp_path`
- `.name`
- `.dependencies`
- `groups`
- `title`
- `comment`

Note: Actual index availability can differ by pattern. Validate in source field definitions when in doubt.

---

## 4. Alarm Archive Fields (`/root/.patterns/alarm`)

### Common `simple`
- `active`
- `acknowledged`
- `text`
- `point`
- `type`
- `dt_on`, `dt_ack`, `dt_off`, `dt_comment`, `dt_device`

### Common `3gram`
- `text`
- `point`
- `comment`
- `category_1`, `category_2`, `category_3`, `category_4`, `category_5`

### Common `datetime`
- `dt_on`
- `dt_ack`
- `dt_off`
- `dt_comment`
- `dt_device`

---

## 5. Query Design Rules

1. Start with indexed filters (`.pattern =`, `.fp_path =`, `LIKE` on indexed fields).
2. For regular LIKE, use fragments with at least 3 characters.
3. If no `3gram` index exists, use strict `:LIKE` only after indexed narrowing.
4. Add pagination for broad queries (`.pattern` scans, broad `LIKE`, archive windows).
5. Prefer one batched query over repeated per-object calls.

---

## 6. Examples

### Good: indexed exact lookup

```javascript
get .fp_path, .name from 'project' where
  .fp_path = '/root/FP/PROJECT/AREA_A/DEVICE_X'
  format $to_json
```

### Good: indexed archive window

```javascript
get text, point, dt_on from 'archive' where
  and(
    .pattern = $oid('/root/.patterns/alarm'),
    dt_on[1708430000000:1708433600000]
  )
  page 1:200
  format $to_json
```

### Risky: strict comparison as primary filter

```javascript
get .fp_path from 'project' where some_unindexed_field := 123
```

Prefer pre-filtering first, then strict comparison.

---

## 7. Quick Chart

| Field/Type | Index | Preferred Operator |
|---|---|---|
| `.fp_path` | `simple`, `3gram` | `=` / `LIKE` |
| `.name` | `simple`, `3gram` | `=` / `LIKE` |
| `.pattern` | `simple` | `=` |
| `.folder` | `simple` | `=` |
| `dt_on` (alarm) | `datetime`, `simple` | `[from:to]` / `=` |
| `active` (alarm) | `simple` | `=` |
| `acknowledged` (alarm) | `simple` | `=` |
| non-`3gram` text field | none / non-`3gram` | `:LIKE` (after filter) |

---

## See Also

- `ecomet-api-reference.md`
- `query-performance-guide.md`
- `ecomet-like-operator.md`
