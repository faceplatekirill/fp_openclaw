# Ecomet Field Indexes Reference (ELECTRICITY-GRID)

**Created:** 2026-03-05  
**Layer:** ELECTRICITY-GRID  
**Purpose:** Grid-specific field index behavior for telemetry, topology, and equipment queries

---

## Scope

This document covers index behavior tied to electricity-grid object families.

Use this file for:
- Grid prototype index maps (telemetry, substation, line/terminal)
- Non-indexed runtime field handling (`out_value`, `state_*`, etc.)
- Query composition for grid operational workflows

Generic index semantics are in `../CORE/ecomet-field-indexes.md`.

---

## 1. Grid Prototype Index Map

### Telemetry (`/root/FP/prototypes/telemetry/fields`)

### Typical `simple`
- `.fp_path`, `.name`, `.pattern`, `.folder`
- `prototype`, `database`, `disabled`
- `op_manual`, `se_manual`, `remote_manual`
- `groups`, `title`, `comment`

### Typical `3gram`
- `.fp_path`, `.name`, `.dependencies`
- `groups`, `title`, `comment`
- LIKE fragments must be >= 3 characters

### Commonly non-indexed runtime fields
- `out_value`, `out_qds`, `out_ts`
- `in_value`, `in_qds`, `in_ts`
- `se_value`, `se_qds`
- `state_connection`, `state_graph`

---

### Substation (`/root/FP/prototypes/substation/fields`)

### Typical `simple`
- `.fp_path`, `.name`, `.pattern`, `.folder`
- `prototype`, `database`, `disabled`
- `groups`, `title`, `comment`

### Typical `3gram`
- `.fp_path`, `.name`, `.dependencies`
- `groups`, `title`, `comment`
- LIKE fragments must be >= 3 characters

---

### Line / Terminal topology fields

### `line` (`/root/FP/prototypes/line/fields`)
- `pole_i`, `pole_j`: typically `simple` (exact OID/path equality)
- `vclass`: typically `simple`
- `.fp_path`, `.name`, `.pattern`: indexed system fields

### `line terminal` (`/root/FP/prototypes/line terminal/fields`)
- `.fp_path`, `.name`, `.pattern`: indexed and used for candidate collection

Important:
- Treat link fields (`pole_i`, `pole_j`) as exact-match fields.
- Prefer `pole_i = $oid(...)` / `pole_j = $oid(...)` over `LIKE`.

---

## 2. Query Strategy for Non-Indexed Grid Runtime Fields

Fields like `out_value`, `out_qds`, `state_connection`, `state_graph` often require strict operators if used in filters.

Recommended pattern:
1. Narrow object set using indexed fields (`.pattern`, `.fp_path`, `LIKE` on indexed text).
2. If field has no `3gram`, use strict `:LIKE` for substring matching.
3. Apply strict filters only after narrowing.

Example:

```javascript
get .fp_path, out_value from 'project' where
  and(
    .pattern = $oid('/root/FP/prototypes/telemetry/fields'),
    .fp_path LIKE '/COUNTRY_A/REGION_1/STATION_X/',
    out_value := 123.45
  )
  page 1:100
  format $to_json
```

---

## 3. Topology Query Patterns

### Pattern A: Collect terminals by station scope

```javascript
get .fp_path, .name from 'project' where
  and(
    .pattern = $oid('/root/FP/prototypes/line terminal/fields'),
    .fp_path LIKE '/COUNTRY_A/REGION_1/STATION_X/'
  )
  page 1:200
  format $to_json
```

### Pattern B: Resolve connected lines via link fields

```javascript
get .fp_path, .name, pole_i, pole_j from 'project' where
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

---

## 4. Grid Index Checklist

- Use `.pattern` + `.fp_path` as first-stage filters.
- Use `LIKE` only on confirmed `3gram` fields with fragments >=3 chars.
- If no `3gram` exists, use strict `:LIKE` only after indexed narrowing.
- Use `pole_i` / `pole_j` exact OID equality for connectivity.
- Use strict operators on runtime fields only after indexed narrowing.
- Add pagination for broad station/region scans.

---

## 5. Quick Chart

| Grid Field | Typical Index | Preferred Operator |
|---|---|---|
| `.fp_path` | `simple`, `3gram` | `=` / `LIKE` |
| `.pattern` | `simple` | `=` |
| `pole_i`, `pole_j` | `simple` | `= $oid(...)` |
| `vclass` | `simple` | `=` |
| `out_value` | often none | `:=` (after filter) |
| `out_qds` | often none | `:=` (after filter) |
| `state_connection` | often none | `:=` (after filter) |
| `state_graph` | often none | `:=` (after filter) |
| non-`3gram` text field | none / non-`3gram` | `:LIKE` (after filter) |

---

## See Also

- `ecomet-api-reference.md`
- `ecomet-advanced-query-patterns.md`
- `query-workflow.md`
- `project-structure.md`
- `../CORE/ecomet-field-indexes.md`
