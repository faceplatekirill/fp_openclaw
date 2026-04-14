# Ecomet Advanced Query Patterns (ELECTRICITY-GRID)

**Created:** 2026-03-05  
**Layer:** ELECTRICITY-GRID  
**Purpose:** Grid-specific advanced query patterns for topology, station hierarchy, and alarm correlation

---

## Scope

This document contains query patterns tied to electricity-grid object semantics.

Use this file for:
- `pole_i` / `pole_j` line-terminal resolution
- Station/equipment hierarchy traversal
- Multi-alarm root-cause candidate discovery
- Grid-specific condition-tree examples

All paths and names below are illustrative placeholders, not deployment inventory.

---

## 1. Reverse Lookup via `pole_i` / `pole_j`

**Context:** `pole_i` and `pole_j` are link fields. Use exact OID comparisons for efficient lookup.

### Two-Step Pattern

```javascript
// Step 1: find line terminals under a station (string search)
const terminals = await ecomet_api({
  action: 'query',
  statement: `get .fp_path from 'project'
              where AND(
                .pattern = $oid('/root/FP/prototypes/line terminal/fields'),
                .fp_path LIKE '/COUNTRY_A/REGION_1/STATION_X/'
              )
              page 1:1000
              format $to_json`
});

// Step 2: find connected lines by exact OID match
const orConditions = [];
for (const t of terminals) {
  orConditions.push(`pole_i = $oid('${t['.fp_path']}')`);
  orConditions.push(`pole_j = $oid('${t['.fp_path']}')`);
}

const lines = await ecomet_api({
  action: 'query',
  statement: `get .fp_path, .name, pole_i, pole_j from 'project'
              where AND(
                .pattern = $oid('/root/FP/prototypes/line/fields'),
                OR(${orConditions.join(', ')})
              )
              format $to_json`
});
```

---

## 2. Find Parent Station from Equipment Path

Use parent-path expansion rather than hardcoded segment positions.

```javascript
function buildParentPaths(path) {
  const parts = path.split('/').filter(Boolean);
  const result = [];
  for (let i = parts.length; i >= 1; i--) {
    result.push('/' + parts.slice(0, i).join('/'));
  }
  return result;
}

async function findParentStation(equipmentPath) {
  const parentPaths = buildParentPaths(equipmentPath);

  return ecomet_api({
    action: 'query',
    statement: `get .fp_path, .name from 'project'
                where AND(
                  .pattern = $oid('/root/FP/prototypes/substation/fields'),
                  OR(${parentPaths.map(p => `.fp_path = '${p}'`).join(', ')})
                )
                format $to_json`
  });
}
```

**Why:** Grid hierarchies vary between regions and object families.

---

## 3. Multi-Alarm Correlation (Hierarchy Batch)

Given several alarm points, query all hierarchy paths at once and rank shared objects.

```javascript
async function correlateAlarms(alarms) {
  const allPaths = new Set();

  for (const alarm of alarms) {
    for (const p of buildParentPaths(alarm.point)) {
      allPaths.add(p);
    }
  }

  const objects = await ecomet_api({
    action: 'query',
    statement: `get .fp_path, .pattern, .name from 'project'
                where OR(${Array.from(allPaths).map(p => `.fp_path = '${p}'`).join(', ')})
                format $to_json`
  });

  return rankSharedObjects(objects, alarms);
}

function rankSharedObjects(objects, alarms) {
  const counts = new Map();

  for (const obj of objects) {
    let hit = 0;
    for (const alarm of alarms) {
      if (alarm.point.includes(obj['.fp_path'])) hit++;
    }
    if (hit > 1) counts.set(obj['.fp_path'], hit);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([path, count]) => ({ path, alarmCount: count }));
}
```

---

## 4. Parallel-Line Candidate Query

Find lines between two station scopes at one voltage class.

```javascript
AND(
  .pattern = $oid('/root/FP/prototypes/line/fields'),
  vclass = 220,
  OR(
    AND(pole_i LIKE '/STATION_A/', pole_j LIKE '/STATION_B/'),
    AND(pole_i LIKE '/STATION_B/', pole_j LIKE '/STATION_A/')
  ),
  ANDNOT(
    .fp_path LIKE '/@lines/',
    .fp_path = '/root/FP/PROJECT/COUNTRY_A/@lines/LINE_EXCLUDED/line'
  )
)
```

Use this as a candidate filter, then validate exact endpoint terminals with OID comparisons.

---

## 5. Grid Query Guardrails

- Do not hardcode country/region/station names into reusable logic.
- Resolve user-provided station names to canonical paths before query composition.
- Treat path structure as data; avoid fixed index parsing like `split('/')[N]`.
- Prefer one batched topology query over many per-object requests.

---

## See Also

- `query-workflow.md`
- `project-structure.md`
- `architecture/static-vs-dynamic-fields.md`
- `patterns/connection-blocks.md`
- `../CORE/ecomet-advanced-query-patterns.md`
