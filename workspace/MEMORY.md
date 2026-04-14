# MEMORY.md — Long-Term Memory

## Coding Lessons Learned (2026-02-22)

### Critical Bugs Fixed in Grid Analysis V2

**1. Cypher Syntax Error** (CRITICAL)
- ❌ Wrong: `` WHERE vl[`.pattern`] = '...' `` (backtick escaping)
- ✅ Fixed: `WHERE vl['.pattern'] = '...'` (single quotes)
- **Impact:** Query returned 0 results
- **Lesson:** Cypher uses single quotes for property names with special chars

**2. Wrong Field Name** (CRITICAL)
- ❌ Wrong: `vl.vclass IS NOT NULL` (voltage class nodes don't have vclass)
- ✅ Fixed: `vl.title IS NOT NULL` (voltage value stored in title)
- **Impact:** WHERE filter excluded all voltage levels
- **Lesson:** Always verify field names in actual graph data, not assumptions

**3. Neo4j Single-Host Connection** (CRITICAL)
- ❌ Wrong: Single URI, fails in Docker/multi-environment
- ✅ Fixed: Multi-host retry (localhost, host.docker.internal, openclaw-neo4j, 172.17.0.1, 172.18.0.1)
- **Impact:** Connection refused in Docker environment
- **Lesson:** Network environments vary - always implement fallback hosts

**4. Node.js require() Cache Issue** (BLOCKING)
- **Problem:** OpenClaw Gateway doesn't clear require.cache on plugin reload
- **Evidence:** Standalone scripts work ✅, plugin returns stale code ❌
- **Workaround:** Direct Node.js scripts bypass plugin system
- **Solution:** Requires Docker container restart OR OpenClaw core modification
- **Lesson:** Module cache is persistent - plugin reload ≠ code reload

**Full report:** `/workspace/GRID-ANALYSIS-V2-FIXES-REPORT.md`

### Ecomet Advanced Query Patterns (2026-02-23)

**Critical knowledge for Ecomet-only architecture:**

1. **ANDNOT Operator** - No != operator exists
   ```javascript
   // Negation syntax:
   ANDNOT(condition_must_match, condition_must_not_match)
   // Example: All lines except specific one
   ANDNOT(.pattern = line_pattern, .fp_path = '/excluded/line')
   ```

2. **Link Fields - Reverse Lookup**
   - ✅ `pole_i = $oid('/path')` - indexed (simple), FAST
   - ❌ `pole_i LIKE '/path'` - NO 3gram index, FAILS
   - **Pattern:** Two-step (find terminals via LIKE, then batch OR for lines)

3. **Batch OR Queries - No Limit**
   - Hundreds of OR conditions OK if using indexed fields
   - Example: 500 terminals × 2 (pole_i/pole_j) = 1000 conditions ✅
   - Critical: ALL conditions must use indexed fields

4. **Hierarchy Traversal**
   - ❌ String parsing brittle (depth varies: /REGION/STATION or /STATION)
   - ✅ Build all parent paths, OR query with pattern filter
   - Example: 10 parent paths → find station via OR + pattern in ONE query

5. **System Field Naming**
   - System fields: `.name`, `.fp_path`, `.pattern` (WITH dot)
   - User fields: `title`, `vclass`, `pole_i` (NO dot)
   - Mistake: `name = 'L2811'` fails → use `.name = 'L2811'`

6. **Alarm Correlation Strategy**
   - Build hierarchy for ALL alarms (collect parent paths)
   - One batch query with 50-100 OR conditions
   - Classify by `.pattern` in code
   - Find common objects = root cause candidates

**Performance Impact:**
- UC1 (Breaker Trip): 2-3 queries, <500ms (vs Neo4j: 1 query, <100ms)
- UC2 (Cascade): 1+N queries, <2s (vs Neo4j: 1 query, <500ms)
- UC3 (What-If): 4-5 queries, <1s (vs Neo4j: 2-3 queries, <500ms)
- UC4 (Root Cause): Heuristics only (vs Neo4j: shortest path, centrality)
- UC5 (Impact 2-hop): 1+N queries, <5s (vs Neo4j: 1 query, <1s)

**Documentation:** `KNOWLEDGE_BASE/CORE/ecomet-advanced-query-patterns.md`

**Decision:** Start Ecomet-only (90% use cases), add Neo4j if graph algorithms needed.

---

### UC3 Design Mistake - Pattern-Based Detection (2026-02-23)

**Mistake:** Initial UC3 implementation used path-based equipment type detection:
```typescript
// ❌ WRONG:
if (path.includes('earth_iso')) return 'EarthIsolator';
if (path.includes('iso')) return 'Isolator';
```

**Problems:**
- Fragile (naming conventions vary)
- Collision risk (`earth_iso-1` matches both "iso" and "earth_iso")
- Not portable (project-specific naming)
- Ignores existing metadata

**Correct solution:** Use `.pattern` field (canonical type from SOURCE):
```typescript
// ✅ CORRECT:
if (equipment.pattern.includes('/earth isolator/')) return 'EarthIsolator';
if (equipment.pattern.includes('/isolator/')) return 'Isolator';
```

**Why `.pattern` is authoritative:**
- Defined in SOURCE: `/root/SOURCES/fields/prototypes/circuit breaker/fields`
- Imported to graph during Phase 1
- Universal across ALL Ecomet projects (power, oil, water, etc.)
- No ambiguity (pattern paths are unique)

**Golden rule:** NEVER use path/name for type detection. ALWAYS use `.pattern`.

**Report:** `/workspace/extensions/grid-graph-builder/UC3-CRITICAL-FIX.md`

---

### Architecture V2 Mistakes - What I Did Wrong

**Context:** Building universal libs (ecomet-core, neo4j-core) for multi-project reuse

**Mistakes made:**

1. **TelemetryFieldsParser in ecomet-core**
   - ❌ Added without checking if `prototypes/telemetry` is universal
   - ✅ Should've read: `SOURCES/fields/prototypes/` (changeable) vs `.patterns/` (unchangeable)
   - **Lesson:** Prototypes are domain-specific, patterns are universal

2. **Station filter in AlarmHandler**
   - ❌ Added `station` parameter to universal alarm handler
   - ✅ "Station" is power grid entity (oil has "refineries", water has "plants")
   - **Lesson:** Question every entity - is it universal across ALL projects?

3. **`.fp_path` on alarm objects**
   - ❌ Used `.fp_path like '/STATION/'` without verifying field exists
   - ✅ Alarm objects are archive entries, not project nodes - they have `point` field, not `.fp_path`
   - **Lesson:** Query sample data BEFORE using fields - don't guess structure

**Root cause:** Coded before understanding. Guessed instead of verified.

**Process fix:**
1. Read source files (`SOURCES/fields/`)
2. Query sample data (actual structure)
3. Check universal vs domain (`.patterns` vs `prototypes`)
4. Test before claiming "ready"

---

## Grid Domain Knowledge

## Station Naming Conventions
- **Agadyr_SES** = Agadyr Solar Energy Station (generation)
- **AGADYR** = Agadyr main substation (distribution hub)
- **Jezkaz_TEC** = Jezkazgan Thermal Electric Central
- **Kar_GRES** = Karaganda Hydro-Electric Station
- **Naming pattern:** `{Location}_{Type}` where Type = SES (solar), TEC (thermal), GRES (hydro), etc.

## Telemetry Signal Types
- **P** = active power (MW)
- **Q** = reactive power (MVAr)
- **U** = voltage (kV)
- **F** = frequency (Hz)
- **Ia, Ib, Ic** = three-phase currents (A)
- **Uab, Ubc, Uca** = line-to-line voltages (kV)

## Archive Types
- **out_value** = operational measurements (SCADA telemetry stream)
- **se_value** = state estimation results (processed/validated values)
- **state_graph** = topology/connectivity state snapshots
- **day/month/year** = time-aggregated archives (models, financials, energy totals)

## Voltage Classes (kV)
Standard grid levels: **220**, **110**, **35**, **20**, **10**, **6**

## Graph Node Types & Hierarchy
```
substation
  └─ voltage_level (e.g., /220, /110)
       ├─ bus (busbar/switchgear)
       ├─ line_terminal (connection point for transmission lines)
       ├─ transformer
       └─ telemetry points (attached via "monitors" relationship)
```

- **Line objects** stored separately under `@lines/{LineID}/line`
- Lines connect substations via `connects_pole_i` / `connects_pole_j` relationships
- **Archive nodes** attached to telemetry via `records` relationship

## Common Query Patterns
- **Find connections:** `MATCH (line)-[:REL {type:'connects_pole_i'}]->(term) WHERE term.path CONTAINS $station`
- **List telemetry:** `MATCH (station)-[:REL*]->(t:Node {type:'telemetry'}) RETURN t.path`
- **Count archives:** `MATCH (t {path: $tele})<-[:REL {type:'records'}]-(a) RETURN count(a)`

## ⚠️ CRITICAL: Ecomet QL LIKE Operator (2026-02-22)

**LIKE = Substring Search (NO Wildcards!)**

```javascript
// ❌ WRONG - SQL wildcards DON'T work:
.fp_path like '/root/FP/PROJECT/KAZ/UZHNIY/Kentau/%'

// ✅ CORRECT - substring matching:
.fp_path like '/Kentau/'  // Matches all paths containing this substring
```

**Impact:** 0 results → 370 telemetry points found after fix!

**Documentation:** `KNOWLEDGE_BASE/CORE/ecomet-like-operator.md`

**Use case - Station telemetry batch query:**
```javascript
// Get all telemetry for station (all voltage levels):
ecomet_api({
  action: "query",
  statement: `get .fp_path, out_value, out_qds from 'project' 
              where and(.pattern=$oid('/root/FP/prototypes/telemetry/fields'), 
                        .fp_path like '/StationName/') 
              page 1:100 format $to_json`
})
```

**See:** `skills/grid-station-status/` for complete implementation

---

## Ecomet API Essentials
- **Alarm query template:**
  ```
  get text, point, dt_on from * where 
    and(.pattern=$oid('/root/.patterns/alarm'), 
        or(active=true, acknowledged=false))
  ```
- **dt_on** values are Unix timestamps in milliseconds (convert to local time for readability)
- **Default window:** 10 minutes for recent alarms

## Sub-Agent Delegation Triggers (Semi-Automatic)

### When to suggest sub-agent spawn:
- User asks for **root-cause analysis** (e.g., "why did X fail?")
- **Multi-station correlation** (e.g., "compare behavior across 5 substations")
- **Anomaly detection** in historical data (e.g., "find unusual patterns last week")
- **Complex reports** requiring multiple data sources
- **Optimization recommendations** (e.g., "suggest switching strategy for load balancing")

### How to suggest:
Detect keywords: "analyze", "root cause", "anomaly", "correlation", "compare", "why", "optimize", "recommend"

**Response template:**
```
"This requires [complex analysis type]. Should I spawn an Opus sub-agent to handle it? 
(Takes ~X minutes, delivers results back via Telegram. You can keep working in the meantime.)"
```

If user confirms, spawn with:
```javascript
sessions_spawn({
  task: "[Detailed task description with context]",
  cleanup: "delete",  // or "keep" if user wants to review session logs
  timeoutSeconds: 1800  // 30 min default, adjust based on scope
})
```

### When NOT to delegate (handle in main session):
- Simple lookups: "show telemetry at station X"
- Translation requests
- Status checks
- Graph topology queries (even if multi-hop)
- Archive listings (unless user asks for correlation analysis across them)

---

## Grid Automation Tools - Architecture V2 (2026-02-22)

**Status:** Code Fixed ✅, Deployment Blocked ⚠️ (require.cache issue)  
**Architecture:** 3-layer design (Core → Domain → Plugin) + Skills  
**Workaround:** Direct Node.js scripts at `skills/grid-station-topology-direct/`

**Reports:**
- Technical: `GRID-ANALYSIS-V2-FIXES-REPORT.md` (English, detailed)
- User-facing: `ИТОГОВЫЙ-ОТЧЕТ-ТЕСТИРОВАНИЕ.md` (Russian, comprehensive)

**Test Results:**
- ✅ Standalone scripts: WORKING (2 voltage levels, 9 line terminals, 4 busbars)
- ❌ Plugin tool: BLOCKED (Node.js require.cache not cleared on restart)
- ✅ Workaround skill: WORKING (bypasses plugin system)

**Next Action:** Docker container restart required to clear module cache

### Key Technical Decisions

**Alarm Queries:** MUST use `from 'archive'` not `from 'project'` (alarms are archive entries)

**Station Extraction:** Detects station as "part before voltage level (numeric)" - handles paths with/without REGION level

**Injectable Architecture:** All modules accept clients via constructor (testable, flexible, no singletons)

**Unified Tool:** Single `grid_analysis` tool with operation parameter vs 5 separate tools (cleaner interface, shared context)

**Coexistence Model:** V1 skills + V2 skills work together (no breaking changes, gradual migration)

### Reusability Model

| Project | Core Layer | Domain Layer | Plugin Layer |
|---------|-----------|--------------|--------------|
| Power Grid | ecomet-core (reuse) | grid-domain ✅ | grid-analysis-v2 ✅ |
| Oil Refining | ecomet-core (reuse) | oil-domain (new) | oil-analysis-v2 (new) |
| Water Treatment | ecomet-core (reuse) | water-domain (new) | water-analysis-v2 (new) |

**Core layer unchanged across projects.** Only domain logic changes.

### Installation (Phase 5)

**Build stack:**
```bash
cd /workspace/libs/ecomet-core && npm install && npm run build
cd /workspace/grid-utils/domains/power-grid && npm install && npm run build
cd /workspace/extensions/grid-analysis-v2 && npm install && npm run build
```

**Configure openclaw.json:**
```json
{
  "plugins": {
    "load": { "paths": ["/workspace/extensions/grid-analysis-v2"] },
    "entries": { "grid-analysis-v2": { "enabled": true } }
  },
  "agents": {
    "list": [{ "id": "main", "tools": { "allow": ["grid_analysis"] } }]
  }
}
```

**Restart:** `openclaw gateway restart`

### Old Tools (V1 - Coexisting)

Old plugin at `extensions/grid-utils-tools/` remains functional.
V1 and V2 coexist - no forced migration.
V1 skills still valid for simple queries.

---

## Grid Knowledge Base

**Index (read first for all grid questions):** `KNOWLEDGE_BASE/INDEX.md`  
**Grid structure reference:** `KNOWLEDGE_BASE/ELECTRICITY-GRID/project-structure.md`

### ⚡ Critical Architecture (2026-02-20 updated)
**Graph (Neo4j) = Topology/Configuration (static)**
**Ecomet API = Realtime Values/States (dynamic)**

- Graph stores: .pattern, pole_i/j, vclass, scripts, limits, config, maintenance_id
- Graph DOES NOT store: out_value, state_connection, out_qds, out_ts, op_manual, pf_* fields
- **Ignore pf_* fields** - PowerFactory model integration (NOT operational state!)
- **SE fields are DYNAMIC:** u_in_value, u_out_value, p_in_balance, etc. - MUST query via Ecomet!
- **Never quote SE values from Graph** - they are stale snapshots from JSON source files
- Always query Ecomet for current values/states
- See: `KNOWLEDGE_BASE/ELECTRICITY-GRID/architecture/static-vs-dynamic-fields.md`

### Quick Reference

**Scale:** ~3.9M JSON files across 6-country interconnected grid (KAZ, KGZ, RUS, TJK, TKM, UZB)

**Top object types:**
- 124k telemetry points (P, Q, U, F, I)
- 86k state fields
- 49k earth isolators  
- 25k isolators
- 10k circuit breakers
- 3k lines
- 1.4k substations

**Path structure:**
```
/root/FP/PROJECT/{Country}/{Region}/{Substation}/{VoltageLevel}/{Equipment}/{Component}
```

**Key folders:**
- `@lines/` - Global transmission line objects
- `@subjects/` - Operators/companies
- `@DTS/` - Dispatcher training simulator
- `@SE/` - State estimation subsystem

**Typical hierarchy:**
```
Substation/
└── VoltageLevel/ (220, 110, 35, etc.)
    ├── Busbars (BB1, BB2)
    ├── LineTerminals (L2428, etc.)
    └── Transformers (T1, T2)
        ├── Telemetry (P, Q, Ia, Ib, Ic)
        └── connection/
            ├── cb (circuit breaker)
            ├── iso-1..4 (isolators)
            └── earth_iso-1..2
```

**Connection state:** Computed by Erlang scripts monitoring equipment positions  
**Cross-border lines:** Stored in @lines/, referenced by substations  
**Prototypes:** Pattern defines type, prototype provides template

---

## Recent Context (Curated)

### Active Projects
- **Grid operator assistant:** SCADA/EMS knowledge base using Neo4j graph + Ecomet real-time API
- **Graph RAG service:** manually running at `http://127.0.0.1:4123` (auto-start plugin pending debug)
- **Telegram integration:** operational via `@vzroman_myown_bot` (pairing mode)

### Key Infrastructure
- **Neo4j:** bolt://localhost:7687 (credentials: neo4j/faceplate_assistant)
- **Ecomet hosts:** 10.210.2.20, 10.210.2.19, 10.210.2.21 (port 9000, ws:)
- **Workspace:** /home/node/.openclaw/workspace

### Ongoing Issues
- **kaz-graph-rag plugin won't auto-load** — debugLog instrumentation shows it never executes on gateway restart despite correct manifest + config. Workaround: manual service via nohup.

---

## Token Optimization Status

**Applied (2026-02-19 07:16 UTC):**
- Default model: Claude Sonnet 4.5 ✓ (upgraded from 3.5)
- Compaction: active ✓
- Skills: limited to grid-ops only (ecomet-actual-alarms, kaz-graph-rag) ✓

**Still Pending:**
- Thinking level: Set to "standard" (currently "off")
- Telegram: Switch to complete streaming mode (encountering config validation errors)
- Sub-agents: Configure for Opus 4 + high thinking

**Status:** Core optimizations working. Remaining changes blocked by config validation - may need manual config file editing or schema investigation.

## OpenClaw Plugin Setup (Critical Knowledge - 2026-02-22)

**REQUIRED for every plugin:**
1. `openclaw.plugin.json` manifest in plugin directory
2. Config update: `plugins.load.paths` (add path)
3. Config update: `plugins.entries.{plugin-id}` (enable)
4. Config update: `agents.list[].tools.allow` (add tools)
5. Gateway restart

**⚠️ JSON Editing Rule:** NEVER use JavaScript comments (`//`) in JSON files - use Python/Node scripts instead

**Recovery:** Backup at `/home/node/.openclaw/openclaw.json.bak`

**Reference:** `grid-utils/PLUGIN-SETUP.md`

---

## Grid Operations - Critical Infrastructure Standards

**Context:** National electricity grids - millions depend on accurate information

**Quality standards for grid analysis:**

- ✅ Check ALL voltage levels (220, 110, 10 kV) - not just first one found
- ✅ Verify against source files - not just first search result  
- ✅ Query both Graph (structure) AND Ecomet (realtime) - not just one
- ✅ Cross-check findings - if seems incomplete, probably is
- ❌ Never assume "close enough" is good enough
- ❌ Never stop at partial data when complete data exists
- ❌ Never report based on ignored data (@DSF objects, pf_* PowerFactory fields)

**Accuracy > Speed:** A complete answer in 2 minutes beats wrong answer in 30 seconds.

**When wrong:** Own it immediately. Don't defend incomplete work. Fix and learn.

---

## ⚠️ CRITICAL: Neo4j Graph Incomplete - Use Ecomet API! (2026-02-23)

**Discovery:** Neo4j graph database is **NOT synchronized** with Ecomet project structure.

**Example - Kentau Station:**
- **Neo4j shows:** 110 kV, 10 kV (2 voltage levels)
- **Ecomet API shows:** 220 kV, 110 kV, 10 kV, 6 kV (4 voltage levels) ✅

**Impact:** Any tool using Neo4j as primary source returns **INCOMPLETE** topology.

**Solution:** Always use **Ecomet API as primary source** for grid topology queries.

**New Collector:** `StationTopologyCollectorEcomet` - uses Ecomet API, finds all voltage levels.

**Blocking Issue:** OpenClaw Gateway restart (SIGUSR1) does NOT clear Node.js require() cache.
- Plugin returns old code even after rebuild + restart
- Workaround: Direct script at `skills/grid-station-topology-ecomet/run.js`
- Permanent fix: Docker container restart required

**Verification Query:**
```javascript
ecomet_api({ action: "query", statement: "get .fp_path, title from 'project' where and(.pattern=$oid('/root/FP/prototypes/voltage class/fields'), .fp_path like '/StationName/') format $to_json" })
```

**See:** `memory/2026-02-23.md` for complete investigation.

---

## Grid Automation Tools Status (2026-02-22)

**Production:** v1.1.0 (Phase 2 complete)
- `grid_station_analyze` - comprehensive station topology + validation
- `grid_line_directions` - resolve incoming/outgoing lines
- `grid_alarms_analyze` - alarm correlation + cascade detection

**Quality improvements:**
- Automated quality checklists (JSON-based, 8 checks)
- QDS code validation (IEC 60870-5-101)
- +25% completeness (70% → 95%)

**Locations:**
- Plugin: `/home/node/.openclaw/workspace/extensions/grid-utils-tools/`
- Library: `/home/node/.openclaw/workspace/grid-utils/`
- Skill: `/home/node/.openclaw/workspace/skills/grid-station-analysis/`
