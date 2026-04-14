# Ecomet Archives API

**Updated:** 2026-03-05

---

## Purpose

This document describes how to read archive time-series data using `fp_json/read_archives`:
- how to send requests
- what response shape to expect
- pitfalls
- corner-case handling

---

## How To Query Archives

Use Ecomet `application` call:

```javascript
ecomet_api({
  action: "application",
  module: "fp_json",
  method: "read_archives",
  params: {
    archives: [
      "/root/FP/PROJECT/COUNTRY/REGION/STATION/.../ARCHIVE_A",
      "/root/FP/PROJECT/COUNTRY/REGION/STATION/.../ARCHIVE_B"
    ],
    from: 1741219200000,
    to: 1741222800000
  }
});
```

Required params:

```javascript
{
  archives: string[], // archive paths
  from: number,       // unix timestamp in milliseconds
  to: number          // unix timestamp in milliseconds
}
```

Strict rules:
- use archive paths (not OIDs)
- use milliseconds (not seconds)
- use only `{archives, from, to}` payload shape

---

## What To Expect In Response

Response shape:

```javascript
{
  "/root/.../ARCHIVE_A": [[ts, value], [ts, value], ...],
  "/root/.../ARCHIVE_B": [[ts, value], [ts, value], ...]
}
```

Field types:
- `ts`: integer Unix milliseconds
- `value`: `number | null`

Response guarantees:
- points inside each series are ordered by ascending timestamp
- key order in response map is not guaranteed
- non-numeric values are returned as `null`

`null` meaning:
- value became unknown at that timestamp

---

## Data Semantics

### Change-driven storage

Archive points are written mainly when value changes (to reduce excessive writes).

Example:

```javascript
[[t0, value0], [t1, value1], [t2, value2]]
```

Interpretation:
- from `t0` (inclusive) to `t1` (exclusive), effective value is `value0`
- from `t1` (inclusive) to `t2` (exclusive), effective value is `value1`
- from `t2` onward, effective value is `value2` until next change point

This is step-like time-series behavior and is the main reason the API can return effective value at range boundaries.

### Effective value at range start

Response includes value at `from` even when no raw point exists exactly at `from`.  
This is useful for step-like signals.

### Duplicate archives in request

Duplicate archive paths are effectively dropped.

### Invalid archive path

If at least one archive path is invalid/unreadable, the whole request fails.

### Inverted range (`from > to`)

No data is found.

### Read-after-write note

Immediate strict read-after-write consistency is not guaranteed.

---

## Common Pitfalls

1. Sending seconds instead of milliseconds.
2. Sending OID values instead of archive paths.
3. Treating `null` as numeric zero.
4. Assuming response keys preserve request order.
5. Assuming only exact raw points are returned.
6. Expecting partial success when one archive path is invalid.

---

## Corner Cases and Handling

1. Empty `archives` list.
Handle as empty result.

2. Sparse or single-point data.
Do not assume fixed point count.

3. `null` values in series.
Handle explicitly in math and charting logic.

4. `from > to`.
Validate and reject before sending request.

5. Large request windows or many archives.
Split into smaller requests when needed.

---

## Minimal Validation Checklist

Before request:
- `archives` is a non-empty array
- each archive is a non-empty path string
- `from` and `to` are integers in milliseconds
- `from <= to`

After response:
- treat missing or empty series safely
- handle `null` values explicitly
- do not rely on map key order

---

## Notes

- This endpoint is for raw archive series reads.
- Aggregate queries are separate and not covered in this document.
