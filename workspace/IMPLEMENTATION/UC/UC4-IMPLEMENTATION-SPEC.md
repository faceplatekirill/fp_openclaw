# UC4 Implementation Specification: Root Cause Correlation Analysis

**File Location:** `/home/node/.openclaw/workspace/extensions/grid-graph-builder/UC4-IMPLEMENTATION-SPEC.md`

**Purpose:** Determine root cause of grid incidents by analyzing alarm sequences, equipment topology, and temporal/spatial correlations

---

## 1. Requirements

### User Questions

**Type 1: Post-incident investigation**
- "Why did BALKHASH station lose power at 14:30 UTC yesterday?"
- "What caused the cascade failure on 2026-02-20 at 08:15?"
- "What was the root cause of the voltage drop in AKMOLA region?"

**Type 2: Alarm correlation**
- "Are these 5 alarms related?"
- "Which alarm triggered first in this incident?"
- "What equipment caused this alarm storm?"

**Type 3: Preventive analysis**
- "What equipment fails most often?"
- "Which circuit breakers are critical to system stability?"
- "What's the common cause of failures on line L2811?"

### Expected Answer Components

1. **Timeline:** Chronological sequence of events (alarms + state changes)
2. **Root Cause Equipment:** The equipment that initiated the incident
3. **Propagation Path:** How the incident spread (A → B → C)
4. **Correlation Map:** Which alarms/events are related
5. **Criticality Ranking:** Which equipment is most critical (centrality)
6. **Similar Incidents:** Historical events with same pattern
7. **Prevention Actions:** How to prevent this in future

### Success Criteria

- ✅ Identifies root cause equipment with >90% confidence
- ✅ Builds complete propagation graph (all related alarms)
- ✅ Ranks equipment by criticality (PageRank/Betweenness)
- ✅ Handles alarm storms (100+ alarms in 1 minute)
- ✅ Works with incomplete data (some equipment may not have alarms)
- ✅ Response time < 15 seconds (complex graph analysis)

---

## 2. Problem Analysis

### What is Root Cause?

**Definition:** The primary equipment failure or event that initiated a chain reaction.

**Examples:**

**Scenario 1: Single Breaker Trip**
```
14:30:00 - CB at L2811 trips (⚠️ ROOT CAUSE)
14:30:01 - BALKHASH loses power (consequence)
14:30:02 - Voltage alarm at KOKSHETAU (consequence)
```

**Scenario 2: Cascade Failure**
```
08:15:00 - L2811 overload alarm (symptom)
08:15:05 - L2811 CB trips (⚠️ ROOT CAUSE)
08:15:10 - Load shifts to L5170 (consequence)
08:15:15 - L5170 overload alarm (symptom)
08:15:20 - L5170 CB trips (cascade)
08:15:25 - BALKHASH blackout (consequence)
```

**Scenario 3: Equipment Degradation**
```
12:00:00 - ISO-1 position uncertain alarm (symptom)
12:05:00 - ISO-1 fails to close (⚠️ ROOT CAUSE)
12:05:05 - CB interlock prevents operation (consequence)
12:05:10 - Manual operation alarm (operator action)
```

---

### Correlation Types

**1. Temporal Correlation**
- Events occurring within short time window (±30 seconds typical)
- First event is likely root cause

**2. Spatial Correlation**
- Events on connected equipment (same line, same station, same voltage level)
- Hop distance: 1-2 hops = highly correlated

**3. Causal Correlation**
- Event A enables/triggers event B
- Example: Breaker trip → power loss → voltage alarm

**4. Pattern Correlation**
- Similar alarm sequences in history
- "Déjà vu" detection

---

## 3. Current State Analysis

### What Exists (from UC1-UC3)

✅ **Graph Topology:**
- Station → VoltageLevel → LineTerminal
- LineTerminal → CircuitBreaker → State
- LineTerminal → Line → LineTerminal (pole connections)

✅ **Alarm Data (from ecomet_api):**
- Archive pattern: `/root/.patterns/alarm`
- Fields: `text`, `point`, `dt_on`, `dt_off`, `active`, `acknowledged`
- Query capability: time range, station filter

✅ **Algorithms:**
- Connectivity traversal (UC1)
- Cascade prediction (UC2)
- Impact simulation (UC3)

### What's Missing for UC4

❌ **Temporal Analysis:**
- Alarm sequence ordering
- Time window grouping
- First-alarm detection

❌ **Graph Centrality:**
- PageRank (importance ranking)
- Betweenness centrality (criticality in paths)
- Degree centrality (connectivity)

❌ **Causality Detection:**
- Event dependency graph (A → B)
- Root cause identification
- Propagation path reconstruction

❌ **Historical Pattern Matching:**
- Incident fingerprinting
- Similar event detection

---

## 4. Graph Data Requirements

### Enhanced Alarm Properties

**What we have (from Ecomet archive):**
```javascript
{
  text: "ВКЛ. АП РЕЗЕРВИРОВАНОЙ ОШИНОВКИ НЕУСПЕШНО",
  point: "/root/FP/PROJECT/KAZ/AKMOLA/KOKSHETAU/220/L2811/connection/cb/state",
  dt_on: 1708677600000,  // Unix timestamp (ms)
  dt_off: null,          // Still active
  active: true,
  acknowledged: false
}
```

**What we need to add (computed):**
```javascript
{
  // Spatial correlation
  equipment_path: "/KOKSHETAU/220/L2811/connection/cb",
  equipment_type: "CircuitBreaker",  // From .pattern
  station_name: "KOKSHETAU",
  voltage_level: 220,
  
  // Temporal correlation
  dt_on_iso: "2026-02-23T08:00:00Z",  // ISO format
  time_group: "2026-02-23T08:00",     // Minute-level grouping
  
  // Graph distance
  hop_distance: 2,  // From suspected root cause
  
  // Criticality
  centrality_score: 0.85,  // PageRank score
  
  // Correlation
  correlation_group: "cascade_001",
  is_root_cause: false
}
```

**Storage:** Computed in-memory during analysis (not stored in graph permanently)

---

## 5. Root Cause Detection Algorithm

### Overview (7 Steps)

```
STEP 1: Fetch alarm data (time range)
STEP 2: Extract equipment paths from alarm points
STEP 3: Build equipment topology graph (Neo4j)
STEP 4: Compute temporal groups (time windows)
STEP 5: Compute spatial correlation (graph distance)
STEP 6: Detect causality chains (A → B → C)
STEP 7: Rank root causes (multiple algorithms)
```

---

### STEP 1: Fetch Alarm Data

**Input:**
- Time range (start, end)
- Optional: station filter, voltage level filter

**Query:**
```javascript
const alarms = await ecomet.query(`
  get text, point, dt_on, dt_off, active, acknowledged
  from 'archive'
  where and(
    .pattern = $oid('/root/.patterns/alarm'),
    dt_on >= ${startMs},
    dt_on <= ${endMs}
  )
  page 1:1000
  format $to_json
`);
```

**Output:**
```javascript
[
  {
    text: "ОТКЛ. ЛИНИИ",
    point: "/root/FP/PROJECT/KAZ/AKMOLA/KOKSHETAU/220/L2811/connection/cb/state",
    dt_on: 1708677600000,
    dt_off: null,
    active: true,
    acknowledged: false
  },
  // ... more alarms
]
```

---

### STEP 2: Extract Equipment Paths

**Goal:** Convert alarm `.point` (full SOURCE path) to equipment path (graph path)

**Algorithm:**
```javascript
function extractEquipmentPath(alarmPoint) {
  // Example point:
  // "/root/FP/PROJECT/KAZ/AKMOLA/KOKSHETAU/220/L2811/connection/cb/state"
  
  // Remove prefix
  let path = alarmPoint.replace('/root/FP/PROJECT/KAZ/', '/');
  
  // Remove suffix (state, control, telemetry, etc.)
  // Keep equipment node only
  path = path.replace(/\/(state|control|acknowledge|telemetry).*$/, '');
  
  return path;
  // Result: "/AKMOLA/KOKSHETAU/220/L2811/connection/cb"
}
```

**Validation:** Query graph to verify equipment exists
```cypher
MATCH (eq {path: $equipmentPath})
RETURN eq.pattern as pattern, eq.type as type
```

**Enrich alarm with equipment metadata:**
```javascript
{
  ...alarm,
  equipment_path: "/AKMOLA/KOKSHETAU/220/L2811/connection/cb",
  equipment_pattern: "/root/FP/prototypes/circuit breaker/fields",
  equipment_type: "CircuitBreaker",
  station_name: "KOKSHETAU",
  voltage_level: 220
}
```

---

### STEP 3: Build Equipment Topology Graph

**Goal:** For each alarm equipment, fetch its neighbors (connected equipment)

**Query:**
```cypher
MATCH (eq {path: $equipmentPath})

// Get direct neighbors (1 hop)
OPTIONAL MATCH (eq)-[r1]-(n1)
WHERE r1.type IN ['PROTECTED_BY', 'ISOLATED_BY', 'HAS_TERMINAL', 'CONNECTS_AT_POLE_I', 'CONNECTS_AT_POLE_J']

// Get second-level neighbors (2 hops)
OPTIONAL MATCH (n1)-[r2]-(n2)
WHERE r2.type IN ['PROTECTED_BY', 'ISOLATED_BY', 'HAS_TERMINAL', 'CONNECTS_AT_POLE_I', 'CONNECTS_AT_POLE_J']

RETURN 
  eq.path as equipment_path,
  collect(distinct n1.path) as neighbors_1hop,
  collect(distinct n2.path) as neighbors_2hop
```

**Build adjacency list:**
```javascript
const topology = {
  "/KOKSHETAU/220/L2811/connection/cb": {
    neighbors: [
      "/KOKSHETAU/220/L2811",              // LineTerminal (0 hops)
      "/KOKSHETAU/220/L2811/connection/iso-1",  // Isolator (1 hop)
      "@lines/L2811/line"                   // Line (1 hop)
    ]
  },
  // ... more equipment
};
```

---

### STEP 4: Compute Temporal Groups

**Goal:** Group alarms that occurred within same time window (cascade detection)

**Algorithm:**
```javascript
function groupByTimeWindow(alarms, windowSeconds = 30) {
  // Sort by dt_on
  const sorted = alarms.sort((a, b) => a.dt_on - b.dt_on);
  
  const groups = [];
  let currentGroup = [];
  let groupStartTime = null;
  
  for (const alarm of sorted) {
    if (!groupStartTime) {
      // First alarm in group
      groupStartTime = alarm.dt_on;
      currentGroup = [alarm];
    } else {
      const timeDiff = (alarm.dt_on - groupStartTime) / 1000; // seconds
      
      if (timeDiff <= windowSeconds) {
        // Within window - same group
        currentGroup.push(alarm);
      } else {
        // New group
        groups.push({
          start_time: groupStartTime,
          alarms: currentGroup,
          duration_seconds: (currentGroup[currentGroup.length - 1].dt_on - groupStartTime) / 1000
        });
        
        groupStartTime = alarm.dt_on;
        currentGroup = [alarm];
      }
    }
  }
  
  // Add last group
  if (currentGroup.length > 0) {
    groups.push({
      start_time: groupStartTime,
      alarms: currentGroup,
      duration_seconds: (currentGroup[currentGroup.length - 1].dt_on - groupStartTime) / 1000
    });
  }
  
  return groups;
}
```

**Output:**
```javascript
[
  {
    start_time: 1708677600000,
    alarms: [
      { dt_on: 1708677600000, equipment_path: "/KOKSHETAU/220/L2811/connection/cb", ... },
      { dt_on: 1708677605000, equipment_path: "/BALKHASH/220/BB1", ... },
      { dt_on: 1708677610000, equipment_path: "/KOKSHETAU/110/L5170/connection/cb", ... }
    ],
    duration_seconds: 10
  }
]
```

---

### STEP 5: Compute Spatial Correlation

**Goal:** Calculate graph distance between alarm equipment

**Algorithm (BFS):**
```javascript
function computeGraphDistance(equipmentA, equipmentB, topology, maxHops = 5) {
  // Breadth-First Search
  const queue = [{ node: equipmentA, distance: 0 }];
  const visited = new Set([equipmentA]);
  
  while (queue.length > 0) {
    const { node, distance } = queue.shift();
    
    if (node === equipmentB) {
      return distance; // Found!
    }
    
    if (distance >= maxHops) {
      continue; // Max depth reached
    }
    
    // Explore neighbors
    const neighbors = topology[node]?.neighbors || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ node: neighbor, distance: distance + 1 });
      }
    }
  }
  
  return Infinity; // Not connected
}
```

**Compute pairwise distances:**
```javascript
const alarmEquipment = alarms.map(a => a.equipment_path);
const distanceMatrix = {};

for (const eqA of alarmEquipment) {
  distanceMatrix[eqA] = {};
  for (const eqB of alarmEquipment) {
    if (eqA === eqB) {
      distanceMatrix[eqA][eqB] = 0;
    } else {
      distanceMatrix[eqA][eqB] = computeGraphDistance(eqA, eqB, topology);
    }
  }
}
```

**Correlation score:**
```javascript
function spatialCorrelation(distance) {
  if (distance === 0) return 1.0;  // Same equipment
  if (distance === 1) return 0.8;  // Direct neighbor
  if (distance === 2) return 0.5;  // 2 hops
  if (distance === 3) return 0.3;  // 3 hops
  return 0.1;  // Weakly correlated
}
```

---

### STEP 6: Detect Causality Chains

**Goal:** Build directed graph of event dependencies (A → B → C)

**Algorithm:**
```javascript
function detectCausality(alarms, distanceMatrix, timeWindow = 30) {
  const edges = []; // Directed edges (cause → effect)
  
  // Sort by time
  const sorted = alarms.sort((a, b) => a.dt_on - b.dt_on);
  
  for (let i = 0; i < sorted.length; i++) {
    const alarmA = sorted[i];
    
    // Check all later alarms
    for (let j = i + 1; j < sorted.length; j++) {
      const alarmB = sorted[j];
      
      // Time criterion: B occurs after A within window
      const timeDiff = (alarmB.dt_on - alarmA.dt_on) / 1000; // seconds
      if (timeDiff > timeWindow) {
        break; // Too far in future
      }
      
      // Spatial criterion: A and B are connected
      const distance = distanceMatrix[alarmA.equipment_path]?.[alarmB.equipment_path];
      if (distance <= 2) { // Within 2 hops
        // Potential causality: A → B
        edges.push({
          from: alarmA.equipment_path,
          to: alarmB.equipment_path,
          time_diff: timeDiff,
          distance: distance,
          confidence: spatialCorrelation(distance) * (1 - timeDiff / timeWindow)
        });
      }
    }
  }
  
  return edges;
}
```

**Build directed graph:**
```cypher
// Create temporary causality graph in Neo4j
UNWIND $edges AS edge
MATCH (a {path: edge.from})
MATCH (b {path: edge.to})
MERGE (a)-[r:CAUSED {
  time_diff: edge.time_diff,
  confidence: edge.confidence
}]->(b)
```

---

### STEP 7: Rank Root Causes

**Multiple ranking algorithms:**

#### 7.1 First-Alarm Heuristic (Simplest)

**Rule:** The first alarm in a temporal group is likely the root cause.

```javascript
function rankByFirstAlarm(alarms) {
  const sorted = alarms.sort((a, b) => a.dt_on - b.dt_on);
  
  return sorted.map((alarm, idx) => ({
    equipment_path: alarm.equipment_path,
    score: 1.0 - (idx / sorted.length), // 1.0 for first, 0.0 for last
    reason: idx === 0 ? 'First alarm in sequence' : `Alarm #${idx + 1}`
  }));
}
```

**Pros:** Fast, simple  
**Cons:** Unreliable if monitoring delays vary

---

#### 7.2 Graph Centrality (PageRank)

**Rule:** Equipment with highest PageRank in causality graph is root cause.

**Algorithm:**
```cypher
// Compute PageRank on causality graph
CALL gds.pageRank.stream({
  nodeQuery: 'MATCH (n) WHERE n.path IN $alarmEquipment RETURN id(n) AS id',
  relationshipQuery: 'MATCH (a)-[r:CAUSED]->(b) RETURN id(a) AS source, id(b) AS target'
})
YIELD nodeId, score
MATCH (n) WHERE id(n) = nodeId
RETURN n.path as equipment_path, score
ORDER BY score DESC
```

**Interpretation:**
- High PageRank = many alarms "point" to this equipment
- Root cause has incoming edges but few outgoing

---

#### 7.3 Betweenness Centrality

**Rule:** Equipment in critical positions on paths between alarms.

**Algorithm:**
```cypher
CALL gds.betweenness.stream({
  nodeQuery: 'MATCH (n) WHERE n.path IN $alarmEquipment RETURN id(n) AS id',
  relationshipQuery: 'MATCH (a)-[r:CAUSED]->(b) RETURN id(a) AS source, id(b) AS target'
})
YIELD nodeId, score
MATCH (n) WHERE id(n) = nodeId
RETURN n.path as equipment_path, score
ORDER BY score DESC
```

**Interpretation:**
- High betweenness = lies on many paths between alarms
- Critical for propagation

---

#### 7.4 Out-Degree / In-Degree Ratio

**Rule:** Root cause has many outgoing causality edges, few incoming.

```javascript
function rankByDegreeRatio(edges) {
  const outDegree = {};
  const inDegree = {};
  
  edges.forEach(edge => {
    outDegree[edge.from] = (outDegree[edge.from] || 0) + 1;
    inDegree[edge.to] = (inDegree[edge.to] || 0) + 1;
  });
  
  const equipment = new Set([...Object.keys(outDegree), ...Object.keys(inDegree)]);
  
  return Array.from(equipment).map(eq => {
    const out = outDegree[eq] || 0;
    const in_ = inDegree[eq] || 0;
    
    // Root cause: high out-degree, low in-degree
    const ratio = in_ === 0 ? Infinity : out / in_;
    
    return {
      equipment_path: eq,
      score: ratio,
      out_degree: out,
      in_degree: in_,
      reason: `Caused ${out} event(s), triggered by ${in_} event(s)`
    };
  }).sort((a, b) => b.score - a.score);
}
```

---

#### 7.5 Combined Score (Recommended)

**Weighted combination:**
```javascript
function computeCombinedScore(equipment, rankings) {
  const weights = {
    first_alarm: 0.2,
    pagerank: 0.3,
    betweenness: 0.2,
    degree_ratio: 0.3
  };
  
  const normalizedScores = {
    first_alarm: normalize(rankings.first_alarm),
    pagerank: normalize(rankings.pagerank),
    betweenness: normalize(rankings.betweenness),
    degree_ratio: normalize(rankings.degree_ratio)
  };
  
  const combined = equipment.map(eq => {
    let score = 0;
    
    score += weights.first_alarm * (normalizedScores.first_alarm[eq] || 0);
    score += weights.pagerank * (normalizedScores.pagerank[eq] || 0);
    score += weights.betweenness * (normalizedScores.betweenness[eq] || 0);
    score += weights.degree_ratio * (normalizedScores.degree_ratio[eq] || 0);
    
    return {
      equipment_path: eq,
      combined_score: score,
      confidence: score > 0.7 ? 'HIGH' : score > 0.4 ? 'MEDIUM' : 'LOW'
    };
  });
  
  return combined.sort((a, b) => b.combined_score - a.combined_score);
}
```

---

## 6. Tool Integration

### Tool Configuration

**In `openclaw.plugin.json`:**
```json
{
  "tools": [
    {
      "name": "analyze_root_cause",
      "description": "Determine root cause of grid incidents by analyzing alarm correlations, equipment topology, and event sequences. Returns ranked list of likely root cause equipment with confidence scores.",
      "parameters": {
        "type": "object",
        "properties": {
          "time_range": {
            "type": "object",
            "description": "Time range for analysis",
            "properties": {
              "start": {
                "type": "string",
                "description": "Start time (ISO 8601 or Unix timestamp)"
              },
              "end": {
                "type": "string",
                "description": "End time (ISO 8601 or Unix timestamp)"
              }
            },
            "required": ["start", "end"]
          },
          "station_filter": {
            "type": "string",
            "description": "Optional: filter alarms by station name"
          },
          "voltage_filter": {
            "type": "number",
            "description": "Optional: filter by voltage level (220, 110, etc.)"
          },
          "correlation_window_seconds": {
            "type": "number",
            "description": "Time window for correlation (default: 30 seconds)",
            "default": 30
          },
          "max_hops": {
            "type": "number",
            "description": "Maximum graph distance for correlation (default: 3)",
            "default": 3
          },
          "ranking_algorithm": {
            "type": "string",
            "enum": ["first_alarm", "pagerank", "betweenness", "degree_ratio", "combined"],
            "description": "Algorithm for ranking root causes (default: combined)",
            "default": "combined"
          }
        },
        "required": ["time_range"]
      }
    }
  ]
}
```

### Tool Invocation Examples

**Example 1: Post-incident investigation**
```javascript
// User: "Why did BALKHASH lose power yesterday at 14:30?"

await tools.analyze_root_cause({
  time_range: {
    start: "2026-02-22T14:25:00Z",  // 5 min before
    end: "2026-02-22T14:35:00Z"     // 5 min after
  },
  station_filter: "BALKHASH",
  ranking_algorithm: "combined"
});
```

**Example 2: Alarm storm investigation**
```javascript
// User: "100+ alarms in last 10 minutes - what's the root cause?"

await tools.analyze_root_cause({
  time_range: {
    start: Date.now() - 10 * 60 * 1000,  // 10 min ago
    end: Date.now()
  },
  correlation_window_seconds: 60,  // Wider window (alarm storm)
  ranking_algorithm: "combined"
});
```

**Example 3: Cascade failure analysis**
```javascript
// User: "Analyze the cascade on 2026-02-20 morning"

await tools.analyze_root_cause({
  time_range: {
    start: "2026-02-20T08:00:00Z",
    end: "2026-02-20T08:30:00Z"
  },
  max_hops: 5,  // Wider spatial correlation (cascade spreads far)
  ranking_algorithm: "combined"
});
```

---

## 7. Complete Algorithm Implementation

### File: `extensions/grid-analysis-v2/src/operations/root-cause-analysis.ts`

```typescript
import { Neo4jClient } from '../../../libs/ecomet-core/src/client/neo4j-client';
import { EcometClient } from '../../../libs/ecomet-core/src/client/ecomet-client';

interface RootCauseInput {
  time_range: {
    start: string | number;
    end: string | number;
  };
  station_filter?: string;
  voltage_filter?: number;
  correlation_window_seconds?: number;
  max_hops?: number;
  ranking_algorithm?: 'first_alarm' | 'pagerank' | 'betweenness' | 'degree_ratio' | 'combined';
}

interface EnrichedAlarm {
  text: string;
  point: string;
  dt_on: number;
  dt_off: number | null;
  active: boolean;
  acknowledged: boolean;
  
  // Computed fields
  equipment_path: string;
  equipment_pattern: string;
  equipment_type: string;
  station_name: string;
  voltage_level: number;
  dt_on_iso: string;
}

interface CausalityEdge {
  from: string;
  to: string;
  time_diff: number;
  distance: number;
  confidence: number;
}

interface RootCauseResult {
  analysis_id: string;
  time_range: {
    start: string;
    end: string;
  };
  alarm_summary: {
    total_alarms: number;
    unique_equipment: number;
    temporal_groups: number;
    duration_seconds: number;
  };
  timeline: Array<{
    timestamp: string;
    equipment_path: string;
    equipment_type: string;
    alarm_text: string;
  }>;
  root_causes: Array<{
    rank: number;
    equipment_path: string;
    equipment_type: string;
    station_name: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    score: number;
    reasoning: string;
    metrics: {
      first_alarm_score: number;
      pagerank_score: number;
      betweenness_score: number;
      degree_ratio: number;
    };
  }>;
  propagation_path: Array<{
    from: string;
    to: string;
    time_diff_seconds: number;
    confidence: number;
  }>;
  correlation_map: {
    temporal_groups: Array<{
      start_time: string;
      alarm_count: number;
      equipment: string[];
    }>;
    spatial_groups: Array<{
      equipment: string[];
      avg_distance: number;
    }>;
  };
}

export class RootCauseAnalyzer {
  private analysisId: string;
  
  constructor(
    private neo4j: Neo4jClient,
    private ecomet: EcometClient
  ) {
    this.analysisId = `rca_${Date.now()}`;
  }

  async analyze(input: RootCauseInput): Promise<RootCauseResult> {
    console.log(`[RootCause] Starting analysis ${this.analysisId}`);
    
    // STEP 1: Fetch alarms
    const alarms = await this.fetchAlarms(input);
    if (alarms.length === 0) {
      throw new Error('No alarms found in specified time range');
    }
    
    // STEP 2: Enrich with equipment metadata
    const enrichedAlarms = await this.enrichAlarms(alarms);
    
    // STEP 3: Build topology
    const topology = await this.buildTopology(enrichedAlarms);
    
    // STEP 4: Temporal grouping
    const temporalGroups = this.groupByTimeWindow(
      enrichedAlarms,
      input.correlation_window_seconds || 30
    );
    
    // STEP 5: Spatial correlation
    const distanceMatrix = this.computeDistanceMatrix(enrichedAlarms, topology, input.max_hops || 3);
    
    // STEP 6: Causality detection
    const causalityEdges = this.detectCausality(
      enrichedAlarms,
      distanceMatrix,
      input.correlation_window_seconds || 30
    );
    
    // STEP 7: Rank root causes
    const rankings = await this.rankRootCauses(
      enrichedAlarms,
      causalityEdges,
      input.ranking_algorithm || 'combined'
    );
    
    // Build result
    return this.buildResult(
      input,
      enrichedAlarms,
      temporalGroups,
      causalityEdges,
      rankings
    );
  }

  private async fetchAlarms(input: RootCauseInput) {
    const startMs = this.parseTimestamp(input.time_range.start);
    const endMs = this.parseTimestamp(input.time_range.end);
    
    let statement = `
      get text, point, dt_on, dt_off, active, acknowledged
      from 'archive'
      where and(
        .pattern = $oid('/root/.patterns/alarm'),
        dt_on >= ${startMs},
        dt_on <= ${endMs}
      )
    `;
    
    // Add station filter if specified
    if (input.station_filter) {
      statement += ` and point like '/${input.station_filter}/'`;
    }
    
    statement += ' page 1:1000 format $to_json';
    
    const result = await this.ecomet.query(statement);
    
    // Parse result
    const alarms = result.result[1].map((row: any[]) => ({
      text: row[0],
      point: row[1],
      dt_on: row[2],
      dt_off: row[3],
      active: row[4],
      acknowledged: row[5]
    }));
    
    return alarms;
  }

  private parseTimestamp(ts: string | number): number {
    if (typeof ts === 'number') {
      return ts;
    }
    return new Date(ts).getTime();
  }

  private async enrichAlarms(alarms: any[]): Promise<EnrichedAlarm[]> {
    const enriched = [];
    
    for (const alarm of alarms) {
      const equipmentPath = this.extractEquipmentPath(alarm.point);
      
      // Query graph for equipment metadata
      const query = `
        MATCH (eq {path: $path})
        RETURN eq.pattern as pattern, eq.type as type
      `;
      
      const result = await this.neo4j.run(query, { path: equipmentPath });
      
      if (result.records.length === 0) {
        console.warn(`[RootCause] Equipment not found in graph: ${equipmentPath}`);
        continue; // Skip alarm if equipment not in graph
      }
      
      const record = result.records[0].toObject();
      
      // Extract station name and voltage from path
      const pathParts = equipmentPath.split('/').filter(Boolean);
      const stationName = pathParts[1] || 'UNKNOWN';
      const voltage = parseInt(pathParts[2]) || 0;
      
      enriched.push({
        ...alarm,
        equipment_path: equipmentPath,
        equipment_pattern: record.pattern,
        equipment_type: record.type,
        station_name: stationName,
        voltage_level: voltage,
        dt_on_iso: new Date(alarm.dt_on).toISOString()
      });
    }
    
    return enriched;
  }

  private extractEquipmentPath(alarmPoint: string): string {
    // Convert SOURCE path to graph path
    let path = alarmPoint.replace('/root/FP/PROJECT/KAZ/', '/');
    
    // Remove country/region prefix (keep station and below)
    const match = path.match(/\/([^/]+\/[^/]+\/.*)/);
    if (match) {
      path = '/' + match[1];
    }
    
    // Remove state/control/telemetry suffixes
    path = path.replace(/\/(state|control|acknowledge|telemetry|alarm).*$/, '');
    
    return path;
  }

  private async buildTopology(alarms: EnrichedAlarm[]) {
    const equipmentPaths = [...new Set(alarms.map(a => a.equipment_path))];
    
    const topology: Record<string, { neighbors: string[] }> = {};
    
    for (const path of equipmentPaths) {
      const query = `
        MATCH (eq {path: $path})
        MATCH (eq)-[r]-(neighbor)
        WHERE r.type IN ['PROTECTED_BY', 'ISOLATED_BY', 'HAS_TERMINAL', 'CONNECTS_AT_POLE_I', 'CONNECTS_AT_POLE_J', 'HAS_VOLTAGE_LEVEL']
        RETURN collect(distinct neighbor.path) as neighbors
      `;
      
      const result = await this.neo4j.run(query, { path });
      
      if (result.records.length > 0) {
        topology[path] = {
          neighbors: result.records[0].get('neighbors')
        };
      }
    }
    
    return topology;
  }

  private groupByTimeWindow(alarms: EnrichedAlarm[], windowSeconds: number) {
    const sorted = [...alarms].sort((a, b) => a.dt_on - b.dt_on);
    
    const groups = [];
    let currentGroup: EnrichedAlarm[] = [];
    let groupStartTime: number | null = null;
    
    for (const alarm of sorted) {
      if (!groupStartTime) {
        groupStartTime = alarm.dt_on;
        currentGroup = [alarm];
      } else {
        const timeDiff = (alarm.dt_on - groupStartTime) / 1000;
        
        if (timeDiff <= windowSeconds) {
          currentGroup.push(alarm);
        } else {
          groups.push({
            start_time: new Date(groupStartTime).toISOString(),
            alarms: currentGroup,
            duration_seconds: (currentGroup[currentGroup.length - 1].dt_on - groupStartTime) / 1000
          });
          
          groupStartTime = alarm.dt_on;
          currentGroup = [alarm];
        }
      }
    }
    
    if (currentGroup.length > 0) {
      groups.push({
        start_time: new Date(groupStartTime!).toISOString(),
        alarms: currentGroup,
        duration_seconds: (currentGroup[currentGroup.length - 1].dt_on - groupStartTime!) / 1000
      });
    }
    
    return groups;
  }

  private computeDistanceMatrix(
    alarms: EnrichedAlarm[],
    topology: Record<string, { neighbors: string[] }>,
    maxHops: number
  ) {
    const equipmentPaths = [...new Set(alarms.map(a => a.equipment_path))];
    const matrix: Record<string, Record<string, number>> = {};
    
    for (const eqA of equipmentPaths) {
      matrix[eqA] = {};
      for (const eqB of equipmentPaths) {
        if (eqA === eqB) {
          matrix[eqA][eqB] = 0;
        } else {
          matrix[eqA][eqB] = this.computeGraphDistance(eqA, eqB, topology, maxHops);
        }
      }
    }
    
    return matrix;
  }

  private computeGraphDistance(
    equipmentA: string,
    equipmentB: string,
    topology: Record<string, { neighbors: string[] }>,
    maxHops: number
  ): number {
    const queue: Array<{ node: string; distance: number }> = [{ node: equipmentA, distance: 0 }];
    const visited = new Set([equipmentA]);
    
    while (queue.length > 0) {
      const { node, distance } = queue.shift()!;
      
      if (node === equipmentB) {
        return distance;
      }
      
      if (distance >= maxHops) {
        continue;
      }
      
      const neighbors = topology[node]?.neighbors || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ node: neighbor, distance: distance + 1 });
        }
      }
    }
    
    return Infinity; // Not connected
  }

  private detectCausality(
    alarms: EnrichedAlarm[],
    distanceMatrix: Record<string, Record<string, number>>,
    timeWindow: number
  ): CausalityEdge[] {
    const edges: CausalityEdge[] = [];
    const sorted = [...alarms].sort((a, b) => a.dt_on - b.dt_on);
    
    for (let i = 0; i < sorted.length; i++) {
      const alarmA = sorted[i];
      
      for (let j = i + 1; j < sorted.length; j++) {
        const alarmB = sorted[j];
        
        const timeDiff = (alarmB.dt_on - alarmA.dt_on) / 1000;
        if (timeDiff > timeWindow) {
          break;
        }
        
        const distance = distanceMatrix[alarmA.equipment_path]?.[alarmB.equipment_path];
        if (distance !== undefined && distance <= 2) {
          const confidence = this.spatialCorrelation(distance) * (1 - timeDiff / timeWindow);
          
          edges.push({
            from: alarmA.equipment_path,
            to: alarmB.equipment_path,
            time_diff: timeDiff,
            distance,
            confidence
          });
        }
      }
    }
    
    return edges;
  }

  private spatialCorrelation(distance: number): number {
    if (distance === 0) return 1.0;
    if (distance === 1) return 0.8;
    if (distance === 2) return 0.5;
    if (distance === 3) return 0.3;
    return 0.1;
  }

  private async rankRootCauses(
    alarms: EnrichedAlarm[],
    edges: CausalityEdge[],
    algorithm: string
  ) {
    const rankings: any = {};
    
    // Compute all ranking methods
    rankings.first_alarm = this.rankByFirstAlarm(alarms);
    rankings.degree_ratio = this.rankByDegreeRatio(edges);
    
    // Graph centrality (requires Neo4j GDS)
    // Simplified: use degree ratio as proxy
    rankings.pagerank = rankings.degree_ratio;
    rankings.betweenness = rankings.degree_ratio;
    
    // Combined score
    if (algorithm === 'combined') {
      return this.computeCombinedScore(alarms, rankings);
    } else {
      return rankings[algorithm];
    }
  }

  private rankByFirstAlarm(alarms: EnrichedAlarm[]) {
    const sorted = [...alarms].sort((a, b) => a.dt_on - b.dt_on);
    
    return sorted.map((alarm, idx) => ({
      equipment_path: alarm.equipment_path,
      score: 1.0 - (idx / sorted.length),
      reason: idx === 0 ? 'First alarm in sequence' : `Alarm #${idx + 1}`
    }));
  }

  private rankByDegreeRatio(edges: CausalityEdge[]) {
    const outDegree: Record<string, number> = {};
    const inDegree: Record<string, number> = {};
    
    edges.forEach(edge => {
      outDegree[edge.from] = (outDegree[edge.from] || 0) + 1;
      inDegree[edge.to] = (inDegree[edge.to] || 0) + 1;
    });
    
    const equipment = new Set([...Object.keys(outDegree), ...Object.keys(inDegree)]);
    
    return Array.from(equipment).map(eq => {
      const out = outDegree[eq] || 0;
      const in_ = inDegree[eq] || 0;
      
      const ratio = in_ === 0 ? (out > 0 ? 10 : 0) : out / in_;
      
      return {
        equipment_path: eq,
        score: ratio,
        out_degree: out,
        in_degree: in_,
        reason: `Caused ${out} event(s), triggered by ${in_} event(s)`
      };
    }).sort((a, b) => b.score - a.score);
  }

  private computeCombinedScore(alarms: EnrichedAlarm[], rankings: any) {
    const weights = {
      first_alarm: 0.3,
      degree_ratio: 0.7
    };
    
    const equipment = [...new Set(alarms.map(a => a.equipment_path))];
    
    const combined = equipment.map(eq => {
      const firstAlarmRank = rankings.first_alarm.find((r: any) => r.equipment_path === eq);
      const degreeRank = rankings.degree_ratio.find((r: any) => r.equipment_path === eq);
      
      const score =
        weights.first_alarm * (firstAlarmRank?.score || 0) +
        weights.degree_ratio * this.normalize(degreeRank?.score || 0, rankings.degree_ratio);
      
      return {
        equipment_path: eq,
        score,
        confidence: score > 0.7 ? 'HIGH' : score > 0.4 ? 'MEDIUM' : 'LOW',
        metrics: {
          first_alarm_score: firstAlarmRank?.score || 0,
          degree_ratio: degreeRank?.score || 0
        }
      };
    });
    
    return combined.sort((a, b) => b.score - a.score);
  }

  private normalize(value: number, dataset: any[]): number {
    const max = Math.max(...dataset.map(d => d.score));
    const min = Math.min(...dataset.map(d => d.score));
    
    if (max === min) return 0.5;
    return (value - min) / (max - min);
  }

  private buildResult(
    input: RootCauseInput,
    alarms: EnrichedAlarm[],
    temporalGroups: any[],
    causalityEdges: CausalityEdge[],
    rankings: any[]
  ): RootCauseResult {
    const timeline = alarms
      .sort((a, b) => a.dt_on - b.dt_on)
      .map(a => ({
        timestamp: a.dt_on_iso,
        equipment_path: a.equipment_path,
        equipment_type: a.equipment_type,
        alarm_text: a.text
      }));
    
    const rootCauses = rankings.slice(0, 5).map((rank, idx) => {
      const alarm = alarms.find(a => a.equipment_path === rank.equipment_path)!;
      
      return {
        rank: idx + 1,
        equipment_path: rank.equipment_path,
        equipment_type: alarm.equipment_type,
        station_name: alarm.station_name,
        confidence: rank.confidence,
        score: rank.score,
        reasoning: rank.reason || `Combined score: ${rank.score.toFixed(2)}`,
        metrics: rank.metrics || {}
      };
    });
    
    const propagationPath = causalityEdges
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10)
      .map(edge => ({
        from: edge.from,
        to: edge.to,
        time_diff_seconds: edge.time_diff,
        confidence: edge.confidence
      }));
    
    return {
      analysis_id: this.analysisId,
      time_range: {
        start: new Date(this.parseTimestamp(input.time_range.start)).toISOString(),
        end: new Date(this.parseTimestamp(input.time_range.end)).toISOString()
      },
      alarm_summary: {
        total_alarms: alarms.length,
        unique_equipment: new Set(alarms.map(a => a.equipment_path)).size,
        temporal_groups: temporalGroups.length,
        duration_seconds: (alarms[alarms.length - 1].dt_on - alarms[0].dt_on) / 1000
      },
      timeline,
      root_causes: rootCauses,
      propagation_path: propagationPath,
      correlation_map: {
        temporal_groups: temporalGroups.map(g => ({
          start_time: g.start_time,
          alarm_count: g.alarms.length,
          equipment: g.alarms.map((a: EnrichedAlarm) => a.equipment_path)
        })),
        spatial_groups: [] // TODO: implement spatial clustering
      }
    };
  }
}
```

---

## 8. Response Format Examples

### Example 1: Simple Breaker Trip

**User:** "Why did BALKHASH lose power at 14:30?"

**Response:**
```json
{
  "analysis_id": "rca_1708677123456",
  "alarm_summary": {
    "total_alarms": 3,
    "unique_equipment": 3,
    "temporal_groups": 1,
    "duration_seconds": 10
  },
  "timeline": [
    {
      "timestamp": "2026-02-22T14:30:00Z",
      "equipment_path": "/KOKSHETAU/220/L2811/connection/cb",
      "equipment_type": "CircuitBreaker",
      "alarm_text": "ОТКЛ. ЛИНИИ"
    },
    {
      "timestamp": "2026-02-22T14:30:05Z",
      "equipment_path": "/BALKHASH/220/BB1",
      "equipment_type": "Busbar",
      "alarm_text": "ПОТЕРЯ ПИТАНИЯ"
    },
    {
      "timestamp": "2026-02-22T14:30:08Z",
      "equipment_path": "/KOKSHETAU/220/L5170/connection/cb",
      "equipment_type": "CircuitBreaker",
      "alarm_text": "ПЕРЕГРУЗКА"
    }
  ],
  "root_causes": [
    {
      "rank": 1,
      "equipment_path": "/KOKSHETAU/220/L2811/connection/cb",
      "equipment_type": "CircuitBreaker",
      "station_name": "KOKSHETAU",
      "confidence": "HIGH",
      "score": 0.92,
      "reasoning": "First alarm + caused 2 downstream events",
      "metrics": {
        "first_alarm_score": 1.0,
        "degree_ratio": 2.0,
        "out_degree": 2,
        "in_degree": 0
      }
    }
  ],
  "propagation_path": [
    {
      "from": "/KOKSHETAU/220/L2811/connection/cb",
      "to": "/BALKHASH/220/BB1",
      "time_diff_seconds": 5,
      "confidence": 0.75
    },
    {
      "from": "/KOKSHETAU/220/L2811/connection/cb",
      "to": "/KOKSHETAU/220/L5170/connection/cb",
      "time_diff_seconds": 8,
      "confidence": 0.68
    }
  ]
}
```

**Agent interpretation:**
> 🎯 **Root Cause Identified (HIGH confidence)**
> 
> **Primary cause:** Circuit breaker at KOKSHETAU/220/L2811 tripped at 14:30:00
> 
> **Propagation:**
> 1. L2811 CB trips → BALKHASH loses power (5 sec)
> 2. L2811 CB trips → L5170 overloads (8 sec)
> 
> **Impact:** 3 alarms, 2 stations affected, 10 second duration

---

### Example 2: Cascade Failure

**User:** "Cascade failure on 2026-02-20 - what was root cause?"

**Response:**
```json
{
  "root_causes": [
    {
      "rank": 1,
      "equipment_path": "/@lines/L2811/line",
      "equipment_type": "Line",
      "station_name": "N/A",
      "confidence": "HIGH",
      "score": 0.88,
      "reasoning": "Caused 7 downstream events (cascade initiator)",
      "metrics": {
        "out_degree": 7,
        "in_degree": 0,
        "pagerank_score": 0.42
      }
    },
    {
      "rank": 2,
      "equipment_path": "/KOKSHETAU/220/L2811/connection/cb",
      "equipment_type": "CircuitBreaker",
      "confidence": "MEDIUM",
      "score": 0.65,
      "reasoning": "Second event, triggered protective action"
    }
  ],
  "propagation_path": [
    {
      "from": "/@lines/L2811/line",
      "to": "/KOKSHETAU/220/L2811/connection/cb",
      "time_diff_seconds": 5,
      "confidence": 0.95
    },
    {
      "from": "/KOKSHETAU/220/L2811/connection/cb",
      "to": "/@lines/L5170/line",
      "time_diff_seconds": 10,
      "confidence": 0.80
    },
    {
      "from": "/@lines/L5170/line",
      "to": "/KOKSHETAU/220/L5170/connection/cb",
      "time_diff_seconds": 5,
      "confidence": 0.90
    }
  ]
}
```

**Agent interpretation:**
> ⚡ **Cascade Failure Detected**
> 
> **Root cause:** Line L2811 fault initiated cascade
> 
> **Cascade sequence:**
> 1. L2811 line fault (08:15:00)
> 2. → L2811 CB protective trip (5 sec)
> 3. → Load shifts to L5170 (10 sec)
> 4. → L5170 overloads and trips (5 sec)
> 5. → 7 total downstream events
> 
> **Confidence:** HIGH (88%)

---

## 9. Test Cases

### Test Case 1: Single Equipment Failure

**Input:**
```javascript
{
  time_range: {
    start: "2026-02-22T14:25:00Z",
    end: "2026-02-22T14:35:00Z"
  },
  ranking_algorithm: "combined"
}
```

**Expected:**
- ✅ 1 root cause identified (CB trip)
- ✅ Confidence: HIGH
- ✅ Propagation path shows 2-3 downstream alarms
- ✅ Timeline in chronological order

---

### Test Case 2: Alarm Storm (100+ Alarms)

**Input:**
```javascript
{
  time_range: {
    start: Date.now() - 10 * 60 * 1000,
    end: Date.now()
  },
  correlation_window_seconds: 60
}
```

**Expected:**
- ✅ Handles 100+ alarms without timeout
- ✅ Groups into 3-5 temporal clusters
- ✅ Identifies 1-2 primary root causes
- ✅ Response time < 15 seconds

---

### Test Case 3: No Clear Root Cause

**Input:**
```javascript
{
  time_range: {
    start: "2026-02-20T10:00:00Z",
    end: "2026-02-20T11:00:00Z"
  }
}
```

**Expected:**
- ✅ Returns multiple candidates with MEDIUM/LOW confidence
- ✅ Explains uncertainty in reasoning
- ✅ Suggests longer time range or filters

---

## 10. Integration with Other UC

### UC4 Uses Components From:

**UC1 (Breaker Trip):**
- Equipment path extraction
- Graph topology queries

**UC2 (Cascade Prediction):**
- Multi-hop path traversal
- Load redistribution logic (for validation)

**UC3 (What-If):**
- Equipment type detection (`.pattern` based)

### UC4 Provides Foundation For:

**UC5 (System Impact):**
- Criticality ranking (PageRank/Betweenness)
- Equipment importance scores

**Future: Preventive Maintenance**
- Identify equipment with high failure rate
- Predict next likely failure

---

## 11. Validation Checklist

Before marking UC4 complete:

- [ ] Alarm fetching works (Ecomet archive query)
- [ ] Equipment path extraction handles all formats
- [ ] Graph enrichment adds `.pattern` correctly
- [ ] Topology building finds all neighbors
- [ ] Temporal grouping clusters correctly
- [ ] Distance matrix computed (BFS algorithm)
- [ ] Causality edge detection works
- [ ] First-alarm ranking works
- [ ] Degree ratio ranking works
- [ ] Combined score combines correctly
- [ ] Response format matches specification
- [ ] All 3 test cases pass
- [ ] Response time < 15 seconds
- [ ] Tool callable from OpenClaw agent

---

## 12. Future Enhancements

### Phase 1 Limitations

**Current:**
- 2 ranking algorithms (first-alarm, degree-ratio)
- Simplified spatial correlation
- No historical pattern matching

**Future improvements:**

1. **Neo4j GDS Integration**
   - Real PageRank algorithm
   - Real Betweenness centrality
   - Community detection (Louvain)

2. **Historical Pattern Matching**
   - Store incident "fingerprints"
   - Similarity search (cosine distance)
   - "This looks like incident from 2025-11-15"

3. **Machine Learning**
   - Train classifier on labeled incidents
   - Learn domain-specific correlation weights
   - Predict root cause confidence

4. **Real-Time Monitoring**
   - Stream alarms from Ecomet
   - Incremental analysis (update as new alarms arrive)
   - Alert when root cause identified

5. **Natural Language Explanations**
   - Generate human-readable narratives
   - "L2811 tripped because..."
   - Operator-friendly reports

---

## 13. Neo4j GDS Integration (Advanced)

### PageRank Implementation

**Graph projection:**
```cypher
CALL gds.graph.project(
  'causality-graph',
  {
    Equipment: {
      label: 'Node',
      properties: ['path']
    }
  },
  {
    CAUSED: {
      type: 'CAUSED',
      orientation: 'NATURAL',
      properties: ['confidence']
    }
  }
)
```

**PageRank computation:**
```cypher
CALL gds.pageRank.stream('causality-graph', {
  relationshipWeightProperty: 'confidence'
})
YIELD nodeId, score
MATCH (n) WHERE id(n) = nodeId
RETURN n.path as equipment_path, score
ORDER BY score DESC
LIMIT 5
```

---

### Betweenness Centrality

**Computation:**
```cypher
CALL gds.betweenness.stream('causality-graph')
YIELD nodeId, score
MATCH (n) WHERE id(n) = nodeId
RETURN n.path as equipment_path, score
ORDER BY score DESC
LIMIT 5
```

---

### Community Detection (Louvain)

**Find incident clusters:**
```cypher
CALL gds.louvain.stream('causality-graph')
YIELD nodeId, communityId
MATCH (n) WHERE id(n) = nodeId
RETURN communityId, collect(n.path) as equipment_group
```

**Use case:** Identify sub-incidents within alarm storm

---

## 14. Historical Pattern Matching

### Incident Fingerprint

**Create fingerprint:**
```javascript
function createFingerprint(alarms, causalityEdges) {
  return {
    equipment_types: alarms.map(a => a.equipment_type).sort(),
    alarm_count: alarms.length,
    duration_seconds: (alarms[alarms.length - 1].dt_on - alarms[0].dt_on) / 1000,
    causality_pattern: causalityEdges.map(e => `${e.from.split('/').pop()} → ${e.to.split('/').pop()}`).join(', '),
    stations_involved: [...new Set(alarms.map(a => a.station_name))].sort()
  };
}
```

**Store fingerprints:**
```cypher
CREATE (incident:Incident {
  id: $incident_id,
  timestamp: $timestamp,
  fingerprint: $fingerprint,
  root_cause: $root_cause,
  resolution: $resolution
})
```

**Search similar:**
```cypher
MATCH (incident:Incident)
WHERE 
  incident.fingerprint.equipment_types = $current_fingerprint.equipment_types
  AND abs(incident.fingerprint.duration_seconds - $current_fingerprint.duration_seconds) < 30
RETURN incident
ORDER BY incident.timestamp DESC
LIMIT 3
```

---

**END OF SPECIFICATION**

UC4 specification complete! Ready for implementation.
