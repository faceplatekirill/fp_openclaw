# Ecomet Tag → Archive Resolution API

**Updated:** 2026-03-05

---

## Purpose

Use `fp_json/get_tags_archive` to find which archive stores history for a given object-field.

Read this document to understand:
- how to query
- response format
- what behavior to expect
- common pitfalls

---

## API Call

```javascript
ecomet_api({
  action: "application",
  module: "fp_json",
  method: "get_tags_archive",
  params: {
    "/root/FP/PROJECT/.../OBJECT_A": ["value", "quality"],
    "/root/FP/PROJECT/.../OBJECT_B": ["value"]
  }
});
```

---

## Request Format

```javascript
{
  [objectPath: string]: string[]
}
```

Rules:
- keys are object paths
- values are requested fields for that object
- use path strings (not OIDs)

---

## Response Format

```javascript
{
  tags: {
    [objectPath: string]: {
      [field: string]: archivePath
    }
  },
  invalid_tags: string[]
}
```

Example:

```javascript
{
  "tags": {
    "/root/.../U": {
      "value": "/root/.../ARCHIVES/U_value_archive"
    },
    "/root/.../some_state_object": {}
  },
  "invalid_tags": [
    "/root/.../MISSING_OBJECT"
  ]
}
```

---

## What To Expect

1. Input is not limited to TAG-pattern objects.
Any valid object path can be used.

2. One resolved archive per field.
If multiple archives match, endpoint returns one deterministic winner.

3. If object path is valid but field cannot be resolved:
- object appears in `tags`
- unresolved field is simply absent

4. Invalid object paths are listed in `invalid_tags`.

5. `invalid_tags` has no duplicates.
Order is not guaranteed.

6. Malformed payload fails the request.

---

## Common Pitfalls

1. Sending OID values instead of object paths.
2. Expecting every requested field to resolve.
3. Treating absence of field mapping as endpoint error.
4. Relying on map key order.
5. Expecting detailed per-field diagnostics in response.

---

## Corner Cases

1. Empty request map:
- handle as empty result or endpoint-level failure depending on transport validation.

2. Valid object with no archive for requested fields:
- object is present in `tags` with empty/partial mapping.

3. At least one invalid object path:
- listed in `invalid_tags` (request may still succeed if no internal error occurs).

4. Multiple candidate archives for same field:
- endpoint chooses one (do not assume all candidates are returned).

---

## Typical Follow-up

After archive paths are resolved:
1. call `fp_json/get_points` for timestamp snapshots
2. call `fp_json/read_archives` for time ranges

---

## Related

- `/home/roman/.openclaw/workspace/KNOWLEDGE_BASE/ecomet-archives.md`
- `/home/roman/.openclaw/workspace/KNOWLEDGE_BASE/CORE/ecomet-api-reference.md`
- `/home/roman/.openclaw/workspace/KNOWLEDGE_BASE/CORE/ecomet-get-tags-archive-open-questions.md`
