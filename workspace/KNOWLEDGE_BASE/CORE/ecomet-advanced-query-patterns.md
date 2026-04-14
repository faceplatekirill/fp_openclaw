# Ecomet Advanced Query Patterns (CORE)

**Updated:** 2026-03-05  
**Layer:** CORE  
**Purpose:** Reusable advanced query techniques for any Ecomet-based system

---

## Scope

This document contains patterns that are valid across domains.

Use this file for:
- Query composition and negation
- Batch query construction
- Parent-path traversal strategy
- System field usage rules
- Condition-tree design

Do not place domain-specific topology logic here (for example, line-terminal semantics).
Use `../ELECTRICITY-GRID/ecomet-advanced-query-patterns.md` for electricity-grid-only patterns.

---

## 1. ANDNOT Operator (Negation)

**Syntax:** `ANDNOT(condition_must_match, condition_must_not_match)`  
**Semantics:** A AND NOT B

### Example

```javascript
ANDNOT(
  AND(
    .pattern = $oid('/root/FP/prototypes/telemetry/fields'),
    .fp_path LIKE '/SUBSYSTEM_A/'
  ),
  .fp_path LIKE '/test/'
)
```

**Use case:** Exclusion filters when `!=` semantics are insufficient.

---

## 2. Batch OR Queries

**Rule:** Prefer one indexed batch query over N small round-trips.

### Good Pattern

```javascript
const paths = [
  '/root/FP/PROJECT/AREA_A/NODE_1/P',
  '/root/FP/PROJECT/AREA_A/NODE_2/P',
  '/root/FP/PROJECT/AREA_A/NODE_3/P'
];

const statement = `get .fp_path, out_value from 'project'
                   where OR(${paths.map(p => `.fp_path = '${p}'`).join(', ')})
                   format $to_json`;
```

### Anti-Pattern

```javascript
for (const path of paths) {
  await ecomet_api({
    action: 'query',
    statement: `get .fp_path, out_value from 'project' where .fp_path = '${path}'`
  });
}
```

**Why:** Batch queries reduce network overhead and improve overall latency.

---

## 3. Parent Path Traversal (Hierarchy-Safe)

**Problem:** Fixed-segment parsing is brittle in variable hierarchies.

### Robust Approach

```javascript
function buildParentPaths(fullPath) {
  const parts = fullPath.split('/').filter(Boolean);
  const paths = [];

  for (let i = parts.length; i >= 1; i--) {
    paths.push('/' + parts.slice(0, i).join('/'));
  }

  return paths;
}

async function findNearestParentByPattern(objectPath, parentPatternOid) {
  const parentPaths = buildParentPaths(objectPath);

  return ecomet_api({
    action: 'query',
    statement: `get .fp_path, .name from 'project'
                where AND(
                  .pattern = $oid('${parentPatternOid}'),
                  OR(${parentPaths.map(p => `.fp_path = '${p}'`).join(', ')})
                )
                format $to_json`
  });
}
```

**Benefits:**
- No hardcoded hierarchy depth
- Works with optional folders
- Uses indexed `.fp_path =` conditions

---

## 4. Link-Field Reverse Lookup (Generic)

For link fields (OID references), avoid substring matching on link values.
Use a two-step strategy:

1. Find candidate objects by indexed string fields (for example, `.fp_path LIKE`).
2. Resolve links via exact `= $oid(...)` matches in one batch query.

### Template

```javascript
// Step 1: candidate source objects
const sources = await ecomet_api({
  action: 'query',
  statement: `get .fp_path from 'project'
              where .fp_path LIKE '/AREA_A/'
              page 1:500
              format $to_json`
});

// Step 2: reverse lookup by exact OID match
const orConditions = sources.map(s => `linked_object = $oid('${s['.fp_path']}')`);

const linked = await ecomet_api({
  action: 'query',
  statement: `get .fp_path, linked_object from 'project'
              where OR(${orConditions.join(', ')})
              format $to_json`
});
```

---

## 5. System Field Naming Rule

System fields always start with `.`

### Correct

```javascript
.fp_path
.name
.pattern
.folder
.readgroups
.writegroups
```

### Incorrect

```javascript
fp_path
name
pattern
```

---

## 6. Complex Condition Trees

Nested logical trees are supported and should be used deliberately.

```javascript
AND(
  condition1,
  OR(condition2, condition3),
  ANDNOT(condition4, condition5)
)
```

**Guideline:** Keep each nested block focused on one concern (scope, type filter, exclusion).

---

## Performance Checklist

- Prefer indexed fields as primary filters.
- Use one batch OR query instead of loops when possible.
- Add pagination for broad `LIKE` queries.
- Apply strict operators only after strong indexed pre-filtering.

---

## See Also

- `ecomet-api-reference.md`
- `ecomet-field-indexes.md`
- `query-performance-guide.md`
- `../ELECTRICITY-GRID/ecomet-advanced-query-patterns.md`
