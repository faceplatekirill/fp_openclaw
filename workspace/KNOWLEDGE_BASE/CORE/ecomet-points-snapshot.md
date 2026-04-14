# Ecomet Snapshot API (`fp_json/get_points`)

**Updated:** 2026-03-06

---

## Purpose

`fp_json/get_points` is the canonical API for getting archive snapshot values at one timestamp.

Use it when you need:
- current/historical state at a specific `ts`
- one value per archive for that timestamp

---

## API Call

```javascript
ecomet_api({
  action: "application",
  module: "fp_json",
  method: "get_points",
  params: {
    archives: [
      "/root/FP/PROJECT/.../ARCHIVE_A",
      "/root/FP/PROJECT/.../ARCHIVE_B"
    ],
    ts: 1741305600000
  }
});
```

---

## Request Contract

```javascript
{
  archives: string[],
  ts: number
}
```

Rules:
- `archives` are archive paths (path-only)
- `ts` is strictly Unix timestamp in milliseconds (integer)

---

## Response Contract

```javascript
{
  "/root/.../ARCHIVE_A": valueA,
  "/root/.../ARCHIVE_B": valueB
}
```

Rules:
- response is a map `archivePath -> value`
- response contains value only (no effective point timestamp)
- response key order is not guaranteed

---

## Snapshot Semantics

For each archive:

1. if point exists exactly at `ts`, return that value
2. otherwise return latest value before `ts` which can be accepted as actual value at the `ts`
3. if no point exists before `ts`, returned value is `undefined`

---

## Expected Behavior

1. Duplicate archive paths in request are silently dropped.
2. Invalid archive path fails the whole request.

---

## Common Pitfalls

1. Sending seconds instead of milliseconds.
2. Sending OIDs instead of archive paths.
3. Assuming exact-point lookup only.
4. Treating `undefined` as numeric zero.
5. Relying on map key order.

---

## Corner Cases

1. Empty `archives` list:
- expect empty result or transport-level validation failure.

2. No history before `ts`:
- value is `undefined`.

3. Mixed valid/invalid archives:
- invalid archive causes whole request failure.

4. Multiple archives requested:
- result is one snapshot value per archive.

---

## Related

- `/home/roman/.openclaw/workspace/KNOWLEDGE_BASE/ecomet-archives.md`
- `/home/roman/.openclaw/workspace/KNOWLEDGE_BASE/ecomet-tag-archive-resolution.md`
- `/home/roman/.openclaw/workspace/KNOWLEDGE_BASE/CORE/ecomet-get-points-open-questions.md`
