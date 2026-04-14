# Ecomet API Reference (CORE)

**Updated:** 2026-03-05  
**Layer:** CORE  
**Purpose:** Canonical Ecomet API syntax and cross-domain query usage rules

---

## Scope

This document covers API behaviors that apply to any Ecomet-based deployment.

Use this file for:
- Valid request structure
- Query statement patterns
- Pagination and batching rules
- Generic error handling protocol

---

## 1. Request Structure (Must Follow)

### Never use

```javascript
// Invalid patterns
{ action: 'get', oid: '/path', params: ['field1', 'field2'] }
{ action: 'find', oid: '/path', params: ['field1'] }
{ action: 'query', statement: "get field from * where ..." }
{ action: 'query', statement: "get field from $oid where $oid = ..." }
```

### Use

```javascript
{
  action: 'query',
  statement: "get field1, field2 from 'project' where .fp_path = '/root/FP/PROJECT/SOME_FOLDER/OBJECT' format $to_json"
}
```

---

## 2. Pagination Rule (Mandatory for Broad Queries)

Use `page <from>:<to>` whenever a query may return many rows.

Typical broad-query cases:
- `.pattern = ...` over large prototypes
- `.fp_path LIKE ...` subtree scans (fragment length >= 3)
- Archive time windows (`dt_*[...]`) with active events

Safe default:
- Start with `page 1:100` (or `1:200` for archive reads).
- Continue with the next page only if needed.

Exact-path queries (`.fp_path = '...'`) usually target one object and can omit pagination.

---

## 3. Core Query Patterns

### Pattern A: Query by `.pattern`

```javascript
ecomet_api({
  action: 'query',
  statement: "get .fp_path, .name from 'project' where .pattern = $oid('/root/FP/prototypes/telemetry/fields') page 1:100 format $to_json"
});
```

### Pattern B: Query by exact path

```javascript
ecomet_api({
  action: 'query',
  statement: "get field1, field2 from 'project' where .fp_path = '/root/FP/PROJECT/AREA_A/DEVICE_X' format $to_json"
});
```

### Pattern C: Substring search with pagination

```javascript
ecomet_api({
  action: 'query',
  statement: "get .name, .fp_path from 'project' where .fp_path LIKE '/AREA_A/' page 1:50 format $to_json"
});
```

Note:
- Regular `LIKE` requires `3gram` index and fragment length >= 3.
- LIKE matching is case-insensitive.
- If a field has no `3gram`, use strict `:LIKE` only after indexed narrowing.
- Regular comparison operators `>`, `<`, `>=`, `<=`, `<>` are currently unsupported.
- Strict comparison variants are supported (`:>`, `:<`, `:>=`, `:<=`, `:<>`) but are scan-based.

### Pattern D: Date/time range query

```javascript
const endTs = Date.now();
const startTs = endTs - 10 * 60 * 1000;

const res = await ecomet_api({
  action: 'query',
  statement: `get text, dt_on from 'archive'
              where AND(
                .pattern = $oid('/root/.patterns/alarm'),
                dt_on[${startTs}:${endTs}]
              )
              page 1:100
              format $to_json`
});
```

### Pattern E: Batch OR for known objects

```javascript
const paths = [
  '/root/FP/PROJECT/AREA_A/NODE_1',
  '/root/FP/PROJECT/AREA_A/NODE_2',
  '/root/FP/PROJECT/AREA_A/NODE_3'
];

const whereOr = paths.map(p => `.fp_path = '${p}'`).join(', ');

const res = await ecomet_api({
  action: 'query',
  statement: `get .fp_path, .name from 'project' where OR(${whereOr}) format $to_json`
});
```

### Pattern F: Pagination loop template

```javascript
async function queryAllPages(baseStatement, pageSize = 100) {
  let page = 1;
  const all = [];

  while (true) {
    const from = (page - 1) * pageSize + 1;
    const to = page * pageSize;

    const res = await ecomet_api({
      action: 'query',
      statement: `${baseStatement} page ${from}:${to} format $to_json`
    });

    if (!Array.isArray(res) || res.length === 0) break;
    all.push(...res);
    if (res.length < pageSize) break;

    page++;
  }

  return all;
}
```

---

## 4. Field Naming Rules

System fields always start with `.`

- Valid system fields: `.fp_path`, `.name`, `.pattern`, `.folder`
- User-defined fields do not use dot prefix.

Example:

```javascript
// System field
get .name from 'project' where .fp_path = '/root/FP/PROJECT/...'

// User field
get out_value from 'project' where .pattern = $oid('/root/FP/prototypes/telemetry/fields')
```

---

## 5. Error Handling Protocol

When a query fails:

1. Validate request shape (`action: 'query'`, `statement` present).
2. Validate statement syntax (`get ... from ... where ...`).
3. Validate path/pattern exists (start with a minimal query).
4. Retry once with a simpler statement (fewer fields/conditions).
5. Return explicit limitation if still failing.

Never:
- invent field values;
- report stale cached data as current runtime values;
- keep trying random syntax variations without narrowing the issue.

---

## 6. Query Quality Checklist

- Prefer indexed filters first (`.fp_path =`, `.pattern =`, indexed `LIKE`).
- Keep LIKE fragments at 3+ characters.
- Add `page` for broad queries (`.pattern`, `LIKE`, archive ranges).
- Use strict `:LIKE` only when no `3gram` index exists and dataset is already narrowed.
- Batch known objects with `OR(...)` instead of N single requests.
- Use `format $to_json` for machine-readable downstream processing.

---

## See Also

- `ecomet-field-indexes.md`
- `query-performance-guide.md`
- `ecomet-like-operator.md`
- `ecomet-advanced-query-patterns.md`
