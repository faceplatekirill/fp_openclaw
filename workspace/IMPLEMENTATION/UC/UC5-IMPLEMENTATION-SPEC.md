# UC5 Implementation Specification: System-Wide Impact Assessment

**File Location:** `/home/node/.openclaw/workspace/extensions/grid-graph-builder/UC5-IMPLEMENTATION-SPEC.md`

**Purpose:** Analyze grid-wide vulnerability, identify critical equipment, perform N-1/N-2 contingency analysis, and assess system resilience

---

## 1. Requirements

### User Questions

**Type 1: Critical Equipment Identification**
- "Which equipment is most critical to system stability?"
- "What are the top 10 most important lines in the grid?"
- "Which circuit breakers protect the most load?"
- "Find single points of failure"

**Type 2: Contingency Analysis**
- "What's the worst-case scenario if ANY line fails?" (N-1)
- "What if ANY TWO lines fail simultaneously?" (N-2)
- "Which station failures cause the biggest blackouts?"
- "Test all circuit breakers - which trips are most dangerous?"

**Type 3: Vulnerability Assessment**
- "Which stations are most vulnerable?"
- "Where do we lack redundancy?"
- "What are the network bottlenecks?"
- "Rate the overall grid health"

**Type 4: Resilience Planning**
- "What equipment should we upgrade first?"
- "Where should we build new transmission lines?"
- "Which stations need backup connections?"
- "Prioritize maintenance by criticality"

### Expected Answer Components

1. **Critical Equipment List:** Ranked by importance (score 0-100)
2. **Vulnerability Map:** Stations/regions by risk level (LOW/MEDIUM/HIGH/CRITICAL)
3. **N-1 Analysis Results:** Impact of each single equipment failure
4. **N-2 Analysis Results:** Worst-case double-failure scenarios
5. **Bottleneck Report:** Equipment operating near capacity
6. **Redundancy Report:** Equipment with/without backup paths
7. **Grid Health Score:** Overall system resilience (0-100)
8. **Priority Recommendations:** What to fix/upgrade first

### Success Criteria

- ✅ Analyzes entire grid (1000+ stations) in < 5 minutes
- ✅ Identifies cut-vertices (single points of failure)
- ✅ N-1 analysis completes for 100+ lines/CBs
- ✅ Ranks equipment by multiple centrality metrics
- ✅ Detects bottlenecks (>80% capacity utilization)
- ✅ Generates actionable recommendations
- ✅ Results cached for repeated queries

---

## 2. Problem Analysis

### What is System-Wide Impact?

**Definition:** Understanding which equipment failures have the GREATEST consequences across the entire grid, not just locally.

**Examples:**

**Scenario 1: Critical Line (High Impact)**
```
Line L2811 connects generation station to major load center
Failure impact:
  - 500 MW generation disconnected
  - 3 substations lose power
  - 200,000 customers affected
→ CRITICAL equipment
```

**Scenario 2: Redundant Line (Low Impact)**
```
Line L9999 has 3 parallel alternatives
Failure impact:
  - Load redistributes to parallel lines
  - No stations lose power
  - 0 customers affected
→ LOW criticality
```

**Scenario 3: Single Point of Failure**
```
Station BRIDGE is only connection between East and West regions
Failure impact:
  - Entire West region isolated
  - 50 substations lose power
  - 2 million customers affected
→ CRITICAL - no redundancy!
```

---

### Analysis Dimensions

**1. Connectivity Impact**
- How many stations lose power?
- How many customers affected?
- Does it split the grid into islands?

**2. Power Flow Impact**
- How much MW is lost?
- Do remaining lines overload?
- Is cascade likely?

**3. Redundancy Level**
- Are there alternative paths?
- Single point of failure?
- N-1 secure? N-2 secure?

**4. Graph Centrality**
- PageRank (importance in network)
- Betweenness (lies on critical paths)
- Closeness (central position)
- Degree (number of connections)

**5. Operational Stress**
- Current loading vs capacity
- Frequency of failures (historical)
- Maintenance backlog

---

## 3. Current State Analysis

### What Exists (from UC1-UC4)

✅ **Connectivity Analysis (UC1):**
- Single equipment failure impact
- Isolated stations detection

✅ **Cascade Prediction (UC2):**
- Load redistribution
- Overload detection

✅ **Root Cause Analysis (UC4):**
- Basic centrality (degree ratio)
- Correlation detection

### What's Missing for UC5

❌ **Batch Analysis:**
- Test ALL equipment (not just one)
- Parallel computation
- Results aggregation

❌ **Graph Centrality Algorithms:**
- PageRank (importance)
- Betweenness centrality (criticality)
- Closeness centrality (influence)
- Cut-vertex detection (articulation points)

❌ **N-2 Contingency:**
- Combinatorial analysis (test pairs)
- Worst-case scenario detection

❌ **Vulnerability Metrics:**
- Grid health score
- Redundancy index
- Bottleneck detection

❌ **Optimization:**
- Caching (avoid re-computation)
- Incremental updates (when graph changes)

---

## 4. Critical Equipment Ranking

### Overview (5 Metrics)

```
METRIC 1: Connectivity Impact (UC1 batch)
METRIC 2: Cascade Risk (UC2 batch)
METRIC 3: PageRank (graph importance)
METRIC 4: Betweenness Centrality (path criticality)
METRIC 5: Redundancy Score (backup availability)

COMBINED SCORE: weighted average → 0-100
```

---

### METRIC 1: Connectivity Impact

**Algorithm:** Run UC1 for EVERY circuit breaker, rank by impact

**Pseudocode:**
```javascript
async function computeConnectivityImpact(circuitBreakers) {
  const impacts = [];
  
  for (const cb of circuitBreakers) {
    // Simulate CB trip using UC1 algorithm
    const result = await analyzeCircuitBreakerTrip({
      circuit_breaker_path: cb.path,
      simulate: true  // Don't query real state
    });
    
    impacts.push({
      equipment_path: cb.path,
      stations_isolated: result.isolated_stations.length,
      total_mw_lost: result.summary.total_load_mw,
      customers_affected: result.summary.customers || 0  // If available
    });
  }
  
  // Normalize to 0-100 scale
  const maxMW = Math.max(...impacts.map(i => i.total_mw_lost));
  
  return impacts.map(i => ({
    ...i,
    connectivity_score: (i.total_mw_lost / maxMW) * 100
  }));
}
```

**Output:**
```javascript
[
  {
    equipment_path: "/KOKSHETAU/220/L2811/connection/cb",
    stations_isolated: 3,
    total_mw_lost: 500,
    connectivity_score: 100  // Worst case
  },
  {
    equipment_path: "/BALKHASH/110/L9999/connection/cb",
    stations_isolated: 0,
    total_mw_lost: 0,
    connectivity_score: 0  // No impact
  }
]
```

---

### METRIC 2: Cascade Risk

**Algorithm:** Run UC2 for EVERY line, rank by cascade probability

**Pseudocode:**
```javascript
async function computeCascadeRisk(lines) {
  const risks = [];
  
  for (const line of lines) {
    // Simulate line failure using UC2 algorithm
    const result = await predictCascadeFailure({
      failed_line_path: line.path,
      simulate: true
    });
    
    risks.push({
      equipment_path: line.path,
      cascade_probability: result.risk_assessment.cascade_probability,
      affected_lines: result.cascade_sequence.length,
      total_impact_mw: result.risk_assessment.total_mw_at_risk
    });
  }
  
  // Normalize
  const maxProb = Math.max(...risks.map(r => r.cascade_probability));
  
  return risks.map(r => ({
    ...r,
    cascade_score: (r.cascade_probability / maxProb) * 100
  }));
}
```

**Optimization:** Skip lines with low loading (<30%) - cascade unlikely

---

### METRIC 3: PageRank (Graph Importance)

**Algorithm:** Neo4j Graph Data Science (GDS) PageRank

**Cypher Query:**
```cypher
// Create graph projection (once)
CALL gds.graph.project(
  'grid-topology',
  {
    Station: {},
    VoltageLevel: {},
    LineTerminal: {},
    Line: {},
    CircuitBreaker: {},
    Busbar: {}
  },
  {
    HAS_VOLTAGE_LEVEL: { orientation: 'UNDIRECTED' },
    HAS_TERMINAL: { orientation: 'UNDIRECTED' },
    HAS_CIRCUIT_BREAKER: { orientation: 'UNDIRECTED' },
    PROTECTED_BY: { orientation: 'UNDIRECTED' },
    CONNECTS_AT_POLE_I: { orientation: 'UNDIRECTED' },
    CONNECTS_AT_POLE_J: { orientation: 'UNDIRECTED' }
  }
)

// Compute PageRank
CALL gds.pageRank.stream('grid-topology', {
  maxIterations: 20,
  dampingFactor: 0.85
})
YIELD nodeId, score

// Get equipment paths
MATCH (n) WHERE id(n) = nodeId
RETURN n.path as equipment_path, score
ORDER BY score DESC
LIMIT 100
```

**Interpretation:**
- High PageRank = many important nodes connect through this equipment
- "Google of the grid" - which equipment is most "linked to"

**Normalization:**
```javascript
pagerank_score = (score / max_score) * 100
```

---

### METRIC 4: Betweenness Centrality (Path Criticality)

**Algorithm:** Neo4j GDS Betweenness Centrality

**Cypher Query:**
```cypher
CALL gds.betweenness.stream('grid-topology', {
  samplingSize: 1000  // Sample for performance
})
YIELD nodeId, score

MATCH (n) WHERE id(n) = nodeId
RETURN n.path as equipment_path, score
ORDER BY score DESC
LIMIT 100
```

**Interpretation:**
- High betweenness = lies on many shortest paths between stations
- "Bridge" equipment - removing it disconnects many pairs
- Identifies bottlenecks

**Normalization:**
```javascript
betweenness_score = (score / max_score) * 100
```

---

### METRIC 5: Redundancy Score

**Algorithm:** Count alternative paths, invert to get risk

**Pseudocode:**
```javascript
async function computeRedundancyScore(equipment) {
  const scores = [];
  
  for (const eq of equipment) {
    // Find alternative paths if this equipment fails
    const query = `
      MATCH (a:Station)-[path*]-(b:Station)
      WHERE ALL(r IN relationships(path) WHERE r.path <> $equipment_path)
      RETURN count(distinct path) as alternative_paths
    `;
    
    const result = await neo4j.run(query, { equipment_path: eq.path });
    const altPaths = result.records[0].get('alternative_paths');
    
    scores.push({
      equipment_path: eq.path,
      alternative_paths: altPaths,
      redundancy_score: altPaths > 0 ? Math.min(altPaths * 10, 100) : 0
    });
  }
  
  return scores;
}
```

**Scoring:**
- 0 alternative paths → score = 0 (CRITICAL - single point of failure!)
- 1 alternative path → score = 10 (LOW redundancy)
- 2+ paths → score = 20+ (GOOD redundancy)
- 10+ paths → score = 100 (EXCELLENT redundancy)

---

### Combined Criticality Score

**Weighted formula:**
```javascript
function computeCriticalityScore(equipment) {
  const weights = {
    connectivity: 0.30,   // How many stations isolated
    cascade: 0.25,        // Cascade risk
    pagerank: 0.15,       // Graph importance
    betweenness: 0.15,    // Path criticality
    redundancy: 0.15      // Lack of alternatives (inverted)
  };
  
  const score = 
    weights.connectivity * equipment.connectivity_score +
    weights.cascade * equipment.cascade_score +
    weights.pagerank * equipment.pagerank_score +
    weights.betweenness * equipment.betweenness_score +
    weights.redundancy * (100 - equipment.redundancy_score);  // Invert!
  
  return {
    equipment_path: equipment.path,
    criticality_score: score,
    rating: score > 80 ? 'CRITICAL' : score > 60 ? 'HIGH' : score > 40 ? 'MEDIUM' : 'LOW',
    breakdown: {
      connectivity: equipment.connectivity_score,
      cascade: equipment.cascade_score,
      pagerank: equipment.pagerank_score,
      betweenness: equipment.betweenness_score,
      redundancy: equipment.redundancy_score
    }
  };
}
```

**Example output:**
```javascript
{
  equipment_path: "/KOKSHETAU/220/L2811/connection/cb",
  criticality_score: 87.5,
  rating: "CRITICAL",
  breakdown: {
    connectivity: 100,  // Major impact
    cascade: 95,        // High cascade risk
    pagerank: 78,       // Important node
    betweenness: 82,    // On critical paths
    redundancy: 10      // Low redundancy
  }
}
```

---

## 5. N-1 Contingency Analysis

### Overview

**N-1 Rule:** System must remain stable after ANY SINGLE equipment failure

**Process:**
1. List all critical equipment (lines, CBs, transformers)
2. Simulate failure of EACH one
3. Check if system remains stable
4. Identify violations

---

### Algorithm

**Step 1: Equipment Selection**

```javascript
async function selectN1Equipment() {
  const query = `
    MATCH (eq)
    WHERE eq.type IN ['Line', 'CircuitBreaker', 'Transformer']
    AND eq.pattern IS NOT NULL
    RETURN eq.path as path, eq.type as type
    ORDER BY eq.path
  `;
  
  const result = await neo4j.run(query);
  
  return result.records.map(r => ({
    path: r.get('path'),
    type: r.get('type')
  }));
}
```

**Step 2: Batch Simulation**

```javascript
async function runN1Contingency(equipment) {
  const results = [];
  const startTime = Date.now();
  
  console.log(`[N-1] Testing ${equipment.length} equipment failures...`);
  
  // Parallel execution (batches of 10)
  const batchSize = 10;
  for (let i = 0; i < equipment.length; i += batchSize) {
    const batch = equipment.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(eq => analyzeEquipmentFailure(eq))
    );
    
    results.push(...batchResults);
    
    // Progress log
    console.log(`[N-1] Progress: ${i + batchResults.length}/${equipment.length}`);
  }
  
  const duration = (Date.now() - startTime) / 1000;
  console.log(`[N-1] Complete in ${duration.toFixed(1)} seconds`);
  
  return results;
}
```

**Step 3: Failure Analysis**

```javascript
async function analyzeEquipmentFailure(equipment) {
  let impact;
  
  if (equipment.type === 'CircuitBreaker') {
    // Use UC1
    impact = await analyzeCircuitBreakerTrip({
      circuit_breaker_path: equipment.path,
      simulate: true
    });
  } else if (equipment.type === 'Line') {
    // Use UC2
    impact = await predictCascadeFailure({
      failed_line_path: equipment.path,
      simulate: true
    });
  } else if (equipment.type === 'Transformer') {
    // Similar to CB trip
    impact = await analyzeTransformerFailure(equipment.path);
  }
  
  return {
    equipment_path: equipment.path,
    equipment_type: equipment.type,
    impact: {
      stations_isolated: impact.isolated_stations?.length || 0,
      total_mw_lost: impact.summary?.total_load_mw || 0,
      cascade_probability: impact.risk_assessment?.cascade_probability || 0,
      overloaded_lines: impact.at_risk_equipment?.length || 0
    },
    n1_secure: impact.isolated_stations?.length === 0 && 
               impact.risk_assessment?.cascade_probability < 0.3,
    severity: categorizeN1Severity(impact)
  };
}
```

**Step 4: Severity Categorization**

```javascript
function categorizeN1Severity(impact) {
  const stations = impact.isolated_stations?.length || 0;
  const mw_lost = impact.summary?.total_load_mw || 0;
  const cascade_prob = impact.risk_assessment?.cascade_probability || 0;
  
  if (stations >= 5 || mw_lost >= 500 || cascade_prob >= 0.7) {
    return 'CRITICAL';  // Major blackout risk
  } else if (stations >= 2 || mw_lost >= 100 || cascade_prob >= 0.4) {
    return 'HIGH';  // Significant impact
  } else if (stations >= 1 || mw_lost >= 50 || cascade_prob >= 0.2) {
    return 'MEDIUM';  // Moderate impact
  } else {
    return 'LOW';  // Minimal impact
  }
}
```

---

### N-1 Report Format

```javascript
{
  analysis_id: "n1_1708677600000",
  timestamp: "2026-02-23T08:00:00Z",
  equipment_tested: 156,  // Total equipment
  violations: 12,         // N-1 failures
  summary: {
    critical: 3,    // 3 equipment failures cause major impact
    high: 5,
    medium: 4,
    low: 144
  },
  violations_list: [
    {
      equipment_path: "/KOKSHETAU/220/L2811/connection/cb",
      equipment_type: "CircuitBreaker",
      severity: "CRITICAL",
      impact: {
        stations_isolated: 5,
        total_mw_lost: 750,
        cascade_probability: 0.85
      },
      n1_secure: false,
      recommendation: "Install backup line or upgrade parallel capacity"
    },
    // ... more violations
  ],
  secure_equipment: [
    {
      equipment_path: "/BALKHASH/110/L9999/connection/cb",
      severity: "LOW",
      n1_secure: true
    },
    // ... more secure equipment
  ],
  execution_time_seconds: 187.5
}
```

---

## 6. N-2 Contingency Analysis

### Overview

**N-2 Rule:** System should remain stable after ANY TWO simultaneous failures

**Challenge:** Combinatorial explosion!
- 100 equipment → 100 × 99 / 2 = 4,950 combinations
- 1000 equipment → 499,500 combinations

**Strategy:** Test only LIKELY pairs

---

### Intelligent Pair Selection

**Heuristic 1: Geographic Proximity**
```javascript
// Test equipment in same station
MATCH (eq1:Node), (eq2:Node)
WHERE eq1.station_name = eq2.station_name
AND eq1.path < eq2.path  // Avoid duplicates
AND eq1.type IN ['Line', 'CircuitBreaker']
AND eq2.type IN ['Line', 'CircuitBreaker']
RETURN eq1.path as path1, eq2.path as path2
```

**Heuristic 2: Same Voltage Level**
```javascript
// Test equipment on same voltage corridor
MATCH (eq1)-[:HAS_VOLTAGE_LEVEL]-(vl)-[:HAS_VOLTAGE_LEVEL]-(eq2)
WHERE eq1.path < eq2.path
RETURN eq1.path as path1, eq2.path as path2
```

**Heuristic 3: Connected Equipment**
```javascript
// Test equipment within 2 hops
MATCH (eq1)-[*1..2]-(eq2)
WHERE eq1.path < eq2.path
AND eq1.type IN ['Line', 'CircuitBreaker']
AND eq2.type IN ['Line', 'CircuitBreaker']
RETURN eq1.path as path1, eq2.path as path2
```

**Heuristic 4: High-Criticality Pairs**
```javascript
// Test pairs of CRITICAL equipment (from N-1 analysis)
const criticalEquipment = n1Results
  .filter(r => r.severity === 'CRITICAL')
  .map(r => r.equipment_path);

const pairs = [];
for (let i = 0; i < criticalEquipment.length; i++) {
  for (let j = i + 1; j < criticalEquipment.length; j++) {
    pairs.push([criticalEquipment[i], criticalEquipment[j]]);
  }
}
```

---

### N-2 Simulation Algorithm

```javascript
async function runN2Contingency(equipmentPairs, options = {}) {
  const maxPairs = options.maxPairs || 1000;  // Limit for performance
  const startTime = Date.now();
  
  const pairsToTest = equipmentPairs.slice(0, maxPairs);
  
  console.log(`[N-2] Testing ${pairsToTest.length} equipment pairs...`);
  
  const results = [];
  const batchSize = 5;  // Smaller batches (more complex per test)
  
  for (let i = 0; i < pairsToTest.length; i += batchSize) {
    const batch = pairsToTest.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(pair => analyzeDoubleFailure(pair))
    );
    
    results.push(...batchResults);
    
    console.log(`[N-2] Progress: ${i + batchResults.length}/${pairsToTest.length}`);
  }
  
  const duration = (Date.now() - startTime) / 1000;
  console.log(`[N-2] Complete in ${duration.toFixed(1)} seconds`);
  
  return results;
}
```

**Double Failure Analysis:**

```javascript
async function analyzeDoubleFailure([path1, path2]) {
  // Simulate BOTH failures simultaneously
  // This is complex - need to modify UC1/UC2 to accept multiple failures
  
  // Step 1: Remove both equipment from topology graph (in-memory)
  const modifiedTopology = removeEquipment(topology, [path1, path2]);
  
  // Step 2: Check connectivity
  const islands = findDisconnectedComponents(modifiedTopology);
  
  // Step 3: Check overloads (redistribute load without these 2 equipment)
  const overloads = await checkOverloads(modifiedTopology);
  
  // Step 4: Cascade simulation
  const cascade = await simulateCascade(modifiedTopology, overloads);
  
  const totalStationsIsolated = islands.reduce((sum, island) => sum + island.stations.length, 0);
  const totalMWLost = islands.reduce((sum, island) => sum + island.total_mw, 0);
  
  return {
    equipment_pair: [path1, path2],
    impact: {
      stations_isolated: totalStationsIsolated,
      total_mw_lost: totalMWLost,
      islands_created: islands.length,
      cascade_occurred: cascade.levels > 0,
      overloaded_lines: overloads.length
    },
    n2_secure: totalStationsIsolated === 0 && !cascade.occurred,
    severity: categorizeN2Severity(totalStationsIsolated, totalMWLost, cascade)
  };
}
```

---

### N-2 Report Format

```javascript
{
  analysis_id: "n2_1708677600000",
  timestamp: "2026-02-23T08:30:00Z",
  pairs_tested: 856,
  violations: 23,  // Pairs that cause major impact
  worst_case: {
    equipment_pair: [
      "/KOKSHETAU/220/L2811/connection/cb",
      "/BALKHASH/220/L5170/connection/cb"
    ],
    impact: {
      stations_isolated: 15,
      total_mw_lost: 2500,
      islands_created: 3,
      cascade_occurred: true
    },
    severity: "CATASTROPHIC",
    description: "Splits grid into 3 islands, triggers multi-stage cascade"
  },
  critical_pairs: [
    {
      equipment_pair: ["...", "..."],
      severity: "CRITICAL",
      impact: { ... },
      recommendation: "Install third parallel line for redundancy"
    },
    // ... more critical pairs
  ],
  execution_time_seconds: 425.8
}
```

---

## 7. Vulnerability Assessment

### Grid Health Score

**Formula:**
```javascript
function computeGridHealthScore(analysisResults) {
  const metrics = {
    n1_pass_rate: computeN1PassRate(analysisResults.n1),
    n2_pass_rate: computeN2PassRate(analysisResults.n2),
    redundancy_level: computeRedundancyLevel(analysisResults.redundancy),
    load_balance: computeLoadBalance(analysisResults.loading),
    equipment_age: computeEquipmentAge(analysisResults.equipment)  // If available
  };
  
  const weights = {
    n1_pass_rate: 0.35,
    n2_pass_rate: 0.25,
    redundancy_level: 0.20,
    load_balance: 0.15,
    equipment_age: 0.05
  };
  
  const score = 
    weights.n1_pass_rate * metrics.n1_pass_rate +
    weights.n2_pass_rate * metrics.n2_pass_rate +
    weights.redundancy_level * metrics.redundancy_level +
    weights.load_balance * metrics.load_balance +
    weights.equipment_age * metrics.equipment_age;
  
  return {
    overall_score: score,
    grade: score > 90 ? 'A' : score > 75 ? 'B' : score > 60 ? 'C' : score > 45 ? 'D' : 'F',
    metrics: metrics,
    interpretation: interpretHealthScore(score)
  };
}
```

**Sub-metric calculations:**

```javascript
function computeN1PassRate(n1Results) {
  const total = n1Results.equipment_tested;
  const passed = total - n1Results.violations;
  return (passed / total) * 100;
}

function computeN2PassRate(n2Results) {
  const total = n2Results.pairs_tested;
  const passed = total - n2Results.violations;
  return (passed / total) * 100;
}

function computeRedundancyLevel(redundancyResults) {
  const avgAltPaths = redundancyResults.reduce((sum, r) => sum + r.alternative_paths, 0) / redundancyResults.length;
  return Math.min((avgAltPaths / 2) * 100, 100);  // 2+ paths = 100%
}

function computeLoadBalance(loadingData) {
  const overloaded = loadingData.filter(l => l.utilization > 0.8).length;
  const total = loadingData.length;
  const balanced = total - overloaded;
  return (balanced / total) * 100;
}
```

**Interpretation:**

```javascript
function interpretHealthScore(score) {
  if (score > 90) {
    return "EXCELLENT: Grid is highly resilient with strong redundancy";
  } else if (score > 75) {
    return "GOOD: Grid is stable but has some vulnerabilities";
  } else if (score > 60) {
    return "FAIR: Grid has moderate risk, upgrades recommended";
  } else if (score > 45) {
    return "POOR: Grid has significant vulnerabilities, urgent action needed";
  } else {
    return "CRITICAL: Grid is highly vulnerable, major upgrades required";
  }
}
```

---

### Vulnerability Map

**Station-Level Vulnerability:**

```javascript
async function createVulnerabilityMap(analysisResults) {
  const stationVulnerability = {};
  
  // Aggregate vulnerability from all sources
  for (const n1Result of analysisResults.n1.violations_list) {
    const affectedStations = n1Result.impact.isolated_stations || [];
    
    affectedStations.forEach(station => {
      if (!stationVulnerability[station]) {
        stationVulnerability[station] = {
          station_name: station,
          vulnerability_sources: [],
          risk_score: 0
        };
      }
      
      stationVulnerability[station].vulnerability_sources.push({
        equipment: n1Result.equipment_path,
        impact_mw: n1Result.impact.total_mw_lost,
        severity: n1Result.severity
      });
      
      // Accumulate risk
      stationVulnerability[station].risk_score += 
        n1Result.severity === 'CRITICAL' ? 30 :
        n1Result.severity === 'HIGH' ? 20 :
        n1Result.severity === 'MEDIUM' ? 10 : 5;
    });
  }
  
  // Categorize
  return Object.values(stationVulnerability).map(s => ({
    ...s,
    risk_level: s.risk_score > 80 ? 'CRITICAL' : 
                s.risk_score > 50 ? 'HIGH' : 
                s.risk_score > 20 ? 'MEDIUM' : 'LOW',
    vulnerability_count: s.vulnerability_sources.length
  })).sort((a, b) => b.risk_score - a.risk_score);
}
```

**Output:**
```javascript
[
  {
    station_name: "BALKHASH",
    risk_level: "CRITICAL",
    risk_score: 95,
    vulnerability_count: 4,
    vulnerability_sources: [
      {
        equipment: "/KOKSHETAU/220/L2811/connection/cb",
        impact_mw: 500,
        severity: "CRITICAL"
      },
      // ... more sources
    ]
  },
  {
    station_name: "AKMOLA",
    risk_level: "MEDIUM",
    risk_score: 35,
    vulnerability_count: 2,
    vulnerability_sources: [ ... ]
  }
]
```

---

### Bottleneck Detection

**Identify overloaded/near-capacity equipment:**

```javascript
async function detectBottlenecks() {
  // Query current loading from Ecomet
  const query = `
    get .fp_path, out_value as current_mw
    from 'project'
    where and(
      .pattern = $oid('/root/FP/prototypes/telemetry/fields'),
      .fp_path like '/P/'  // Active power
    )
    page 1:1000
    format $to_json
  `;
  
  const loadingData = await ecomet.query(query);
  
  // Get rated capacity from graph
  const bottlenecks = [];
  
  for (const point of loadingData) {
    const equipmentPath = extractEquipmentPath(point.fp_path);
    
    // Get capacity
    const capacityQuery = `
      MATCH (eq {path: $path})
      RETURN eq.rated_capacity_mw as capacity
    `;
    
    const result = await neo4j.run(capacityQuery, { path: equipmentPath });
    const capacity = result.records[0]?.get('capacity');
    
    if (capacity) {
      const utilization = point.current_mw / capacity;
      
      if (utilization > 0.8) {  // >80% = bottleneck
        bottlenecks.push({
          equipment_path: equipmentPath,
          current_mw: point.current_mw,
          rated_capacity_mw: capacity,
          utilization_percent: (utilization * 100).toFixed(1),
          severity: utilization > 0.95 ? 'CRITICAL' : utilization > 0.9 ? 'HIGH' : 'MEDIUM'
        });
      }
    }
  }
  
  return bottlenecks.sort((a, b) => b.utilization_percent - a.utilization_percent);
}
```

---

## 8. Recommendations Engine

### Priority Ranking Algorithm

```javascript
function generateRecommendations(analysisResults) {
  const recommendations = [];
  
  // Recommendation 1: Fix N-1 violations
  analysisResults.n1.violations_list
    .filter(v => v.severity === 'CRITICAL')
    .forEach(violation => {
      recommendations.push({
        priority: 1,  // URGENT
        type: 'N-1_VIOLATION',
        equipment: violation.equipment_path,
        issue: `Single point of failure - ${violation.impact.stations_isolated} stations at risk`,
        action: determineN1Fix(violation),
        estimated_cost: 'HIGH',
        estimated_time: '6-12 months'
      });
    });
  
  // Recommendation 2: Upgrade bottlenecks
  analysisResults.bottlenecks
    .filter(b => b.severity === 'CRITICAL')
    .forEach(bottleneck => {
      recommendations.push({
        priority: 2,  // HIGH
        type: 'CAPACITY_UPGRADE',
        equipment: bottleneck.equipment_path,
        issue: `Operating at ${bottleneck.utilization_percent}% capacity`,
        action: `Upgrade line capacity or add parallel line`,
        estimated_cost: 'MEDIUM',
        estimated_time: '3-6 months'
      });
    });
  
  // Recommendation 3: Improve redundancy
  analysisResults.redundancy
    .filter(r => r.redundancy_score < 20)
    .forEach(equipment => {
      recommendations.push({
        priority: 3,  // MEDIUM
        type: 'REDUNDANCY_IMPROVEMENT',
        equipment: equipment.equipment_path,
        issue: `Low redundancy - ${equipment.alternative_paths} backup paths`,
        action: `Build additional transmission line or install backup transformer`,
        estimated_cost: 'HIGH',
        estimated_time: '12-24 months'
      });
    });
  
  // Recommendation 4: N-2 critical pairs
  if (analysisResults.n2?.worst_case) {
    recommendations.push({
      priority: 2,  // HIGH
      type: 'N-2_CRITICAL_PAIR',
      equipment: analysisResults.n2.worst_case.equipment_pair,
      issue: `Simultaneous failure causes ${analysisResults.n2.worst_case.impact.stations_isolated} stations outage`,
      action: `Install third parallel path or SCADA interlocks`,
      estimated_cost: 'VERY HIGH',
      estimated_time: '12-18 months'
    });
  }
  
  return recommendations.sort((a, b) => a.priority - b.priority);
}
```

**Fix Determination Logic:**

```javascript
function determineN1Fix(violation) {
  const impact = violation.impact;
  
  if (impact.cascade_probability > 0.7) {
    return 'Install additional line to prevent cascade';
  } else if (impact.stations_isolated > 5) {
    return 'Build backup connection to isolated region';
  } else if (impact.total_mw_lost > 500) {
    return 'Upgrade parallel line capacity';
  } else {
    return 'Install backup circuit breaker or automated switching';
  }
}
```

---

## 9. Tool Integration

### Tool Configuration

**In `openclaw.plugin.json`:**
```json
{
  "tools": [
    {
      "name": "assess_grid_vulnerability",
      "description": "Analyze system-wide vulnerability, identify critical equipment, run N-1/N-2 contingency analysis, and assess grid resilience. Returns criticality rankings, vulnerability maps, and recommendations.",
      "parameters": {
        "type": "object",
        "properties": {
          "analysis_type": {
            "type": "string",
            "enum": ["critical_equipment", "n1_contingency", "n2_contingency", "full_assessment"],
            "description": "Type of analysis to perform",
            "default": "full_assessment"
          },
          "region_filter": {
            "type": "string",
            "description": "Optional: filter by region (e.g., 'AKMOLA', 'BALKHASH')"
          },
          "voltage_filter": {
            "type": "number",
            "description": "Optional: filter by voltage level (220, 110, etc.)"
          },
          "equipment_type_filter": {
            "type": "string",
            "enum": ["all", "lines", "circuit_breakers", "transformers"],
            "description": "Filter equipment type for analysis",
            "default": "all"
          },
          "n2_max_pairs": {
            "type": "number",
            "description": "Maximum pairs to test in N-2 (default: 1000)",
            "default": 1000
          },
          "include_recommendations": {
            "type": "boolean",
            "description": "Generate actionable recommendations (default: true)",
            "default": true
          },
          "cache_results": {
            "type": "boolean",
            "description": "Cache results for repeated queries (default: true)",
            "default": true
          }
        }
      }
    }
  ]
}
```

### Tool Invocation Examples

**Example 1: Find most critical equipment**
```javascript
// User: "Which equipment is most critical?"

await tools.assess_grid_vulnerability({
  analysis_type: "critical_equipment",
  equipment_type_filter: "all"
});
```

**Response:**
```javascript
{
  analysis_type: "critical_equipment",
  top_critical_equipment: [
    {
      rank: 1,
      equipment_path: "/KOKSHETAU/220/L2811/connection/cb",
      equipment_type: "CircuitBreaker",
      criticality_score: 87.5,
      rating: "CRITICAL",
      reasoning: "Protects major transmission line, high cascade risk, low redundancy",
      breakdown: {
        connectivity: 100,
        cascade: 95,
        pagerank: 78,
        betweenness: 82,
        redundancy: 10
      }
    },
    // ... top 10
  ],
  summary: {
    total_equipment: 856,
    critical_count: 12,
    high_count: 45,
    medium_count: 156,
    low_count: 643
  }
}
```

---

**Example 2: N-1 Contingency Analysis**
```javascript
// User: "Run N-1 contingency - test all circuit breakers"

await tools.assess_grid_vulnerability({
  analysis_type: "n1_contingency",
  equipment_type_filter: "circuit_breakers",
  region_filter: "AKMOLA"
});
```

**Response:**
```javascript
{
  analysis_type: "n1_contingency",
  region: "AKMOLA",
  equipment_tested: 45,
  violations: 3,
  n1_pass_rate: 93.3,  // 42/45 passed
  violations_list: [
    {
      equipment_path: "/KOKSHETAU/220/L2811/connection/cb",
      severity: "CRITICAL",
      impact: {
        stations_isolated: 5,
        total_mw_lost: 750
      },
      recommendation: "Install backup line"
    },
    // ... more violations
  ],
  execution_time_seconds: 28.5
}
```

---

**Example 3: Full Vulnerability Assessment**
```javascript
// User: "Full grid vulnerability assessment"

await tools.assess_grid_vulnerability({
  analysis_type: "full_assessment",
  include_recommendations: true
});
```

**Response:**
```javascript
{
  analysis_id: "vuln_1708677600000",
  timestamp: "2026-02-23T08:00:00Z",
  
  grid_health_score: {
    overall_score: 67.5,
    grade: "C",
    metrics: {
      n1_pass_rate: 92.3,
      n2_pass_rate: 73.1,
      redundancy_level: 65.0,
      load_balance: 82.0
    },
    interpretation: "FAIR: Grid has moderate risk, upgrades recommended"
  },
  
  critical_equipment: {
    count: 12,
    top_5: [ ... ]  // As in Example 1
  },
  
  n1_analysis: {
    violations: 8,
    pass_rate: 92.3,
    critical_violations: 3
  },
  
  n2_analysis: {
    pairs_tested: 856,
    violations: 23,
    pass_rate: 73.1,
    worst_case: {
      equipment_pair: ["...", "..."],
      impact: { stations_isolated: 15, total_mw_lost: 2500 }
    }
  },
  
  vulnerability_map: [
    {
      station_name: "BALKHASH",
      risk_level: "CRITICAL",
      risk_score: 95,
      vulnerability_count: 4
    },
    // ... more stations
  ],
  
  bottlenecks: [
    {
      equipment_path: "/KOKSHETAU/220/L2811",
      utilization_percent: 92.5,
      severity: "HIGH"
    },
    // ... more bottlenecks
  ],
  
  recommendations: [
    {
      priority: 1,
      type: "N-1_VIOLATION",
      equipment: "/KOKSHETAU/220/L2811/connection/cb",
      issue: "Single point of failure - 5 stations at risk",
      action: "Install backup line",
      estimated_cost: "HIGH",
      estimated_time: "6-12 months"
    },
    // ... more recommendations
  ],
  
  execution_time_seconds: 425.8
}
```

---

## 10. Complete Algorithm Implementation

### File: `extensions/grid-analysis-v2/src/operations/vulnerability-assessment.ts`

```typescript
import { Neo4jClient } from '../../../libs/ecomet-core/src/client/neo4j-client';
import { EcometClient } from '../../../libs/ecomet-core/src/client/ecomet-client';
import { analyzeCircuitBreakerTrip } from './breaker-trip-analysis';  // UC1
import { predictCascadeFailure } from './cascade-prediction';  // UC2

interface VulnerabilityInput {
  analysis_type: 'critical_equipment' | 'n1_contingency' | 'n2_contingency' | 'full_assessment';
  region_filter?: string;
  voltage_filter?: number;
  equipment_type_filter?: 'all' | 'lines' | 'circuit_breakers' | 'transformers';
  n2_max_pairs?: number;
  include_recommendations?: boolean;
  cache_results?: boolean;
}

interface CriticalEquipment {
  equipment_path: string;
  equipment_type: string;
  criticality_score: number;
  rating: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  breakdown: {
    connectivity: number;
    cascade: number;
    pagerank: number;
    betweenness: number;
    redundancy: number;
  };
}

interface GridHealthScore {
  overall_score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  metrics: {
    n1_pass_rate: number;
    n2_pass_rate: number;
    redundancy_level: number;
    load_balance: number;
  };
  interpretation: string;
}

export class VulnerabilityAssessor {
  private cache: Map<string, any> = new Map();
  
  constructor(
    private neo4j: Neo4jClient,
    private ecomet: EcometClient
  ) {}

  async assess(input: VulnerabilityInput) {
    console.log(`[Vulnerability] Starting ${input.analysis_type} analysis`);
    
    const cacheKey = this.getCacheKey(input);
    
    if (input.cache_results && this.cache.has(cacheKey)) {
      console.log(`[Vulnerability] Using cached results`);
      return this.cache.get(cacheKey);
    }
    
    let result;
    
    switch (input.analysis_type) {
      case 'critical_equipment':
        result = await this.analyzeCriticalEquipment(input);
        break;
      case 'n1_contingency':
        result = await this.runN1Contingency(input);
        break;
      case 'n2_contingency':
        result = await this.runN2Contingency(input);
        break;
      case 'full_assessment':
        result = await this.fullAssessment(input);
        break;
    }
    
    if (input.cache_results) {
      this.cache.set(cacheKey, result);
    }
    
    return result;
  }

  private async analyzeCriticalEquipment(input: VulnerabilityInput) {
    const equipment = await this.getEquipment(input);
    
    console.log(`[CriticalEquipment] Analyzing ${equipment.length} equipment`);
    
    // Compute all 5 metrics
    const connectivityScores = await this.computeConnectivityImpact(equipment);
    const cascadeScores = await this.computeCascadeRisk(equipment);
    const pagerankScores = await this.computePageRank(equipment);
    const betweennessScores = await this.computeBetweenness(equipment);
    const redundancyScores = await this.computeRedundancy(equipment);
    
    // Combine scores
    const criticalityScores = equipment.map(eq => {
      const connectivity = connectivityScores.find(c => c.equipment_path === eq.path)?.connectivity_score || 0;
      const cascade = cascadeScores.find(c => c.equipment_path === eq.path)?.cascade_score || 0;
      const pagerank = pagerankScores.find(p => p.equipment_path === eq.path)?.pagerank_score || 0;
      const betweenness = betweennessScores.find(b => b.equipment_path === eq.path)?.betweenness_score || 0;
      const redundancy = redundancyScores.find(r => r.equipment_path === eq.path)?.redundancy_score || 0;
      
      const score = this.computeCriticalityScore({
        connectivity,
        cascade,
        pagerank,
        betweenness,
        redundancy
      });
      
      return {
        equipment_path: eq.path,
        equipment_type: eq.type,
        criticality_score: score,
        rating: this.categorizeScore(score),
        breakdown: {
          connectivity,
          cascade,
          pagerank,
          betweenness,
          redundancy
        }
      };
    });
    
    const sorted = criticalityScores.sort((a, b) => b.criticality_score - a.criticality_score);
    
    return {
      analysis_type: 'critical_equipment',
      timestamp: new Date().toISOString(),
      top_critical_equipment: sorted.slice(0, 20),
      summary: {
        total_equipment: equipment.length,
        critical_count: sorted.filter(s => s.rating === 'CRITICAL').length,
        high_count: sorted.filter(s => s.rating === 'HIGH').length,
        medium_count: sorted.filter(s => s.rating === 'MEDIUM').length,
        low_count: sorted.filter(s => s.rating === 'LOW').length
      }
    };
  }

  private async runN1Contingency(input: VulnerabilityInput) {
    const equipment = await this.getEquipment(input);
    
    console.log(`[N-1] Testing ${equipment.length} equipment failures`);
    
    const results = [];
    const batchSize = 10;
    
    for (let i = 0; i < equipment.length; i += batchSize) {
      const batch = equipment.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(eq => this.analyzeEquipmentFailure(eq))
      );
      
      results.push(...batchResults);
      
      console.log(`[N-1] Progress: ${results.length}/${equipment.length}`);
    }
    
    const violations = results.filter(r => !r.n1_secure);
    const passRate = ((results.length - violations.length) / results.length) * 100;
    
    return {
      analysis_type: 'n1_contingency',
      timestamp: new Date().toISOString(),
      equipment_tested: results.length,
      violations: violations.length,
      n1_pass_rate: passRate.toFixed(1),
      violations_list: violations
        .filter(v => v.severity === 'CRITICAL' || v.severity === 'HIGH')
        .sort((a, b) => this.severityToNumber(b.severity) - this.severityToNumber(a.severity)),
      summary: {
        critical: violations.filter(v => v.severity === 'CRITICAL').length,
        high: violations.filter(v => v.severity === 'HIGH').length,
        medium: violations.filter(v => v.severity === 'MEDIUM').length
      }
    };
  }

  private async analyzeEquipmentFailure(equipment: any) {
    let impact;
    
    if (equipment.type === 'CircuitBreaker') {
      impact = await analyzeCircuitBreakerTrip({
        circuit_breaker_path: equipment.path,
        simulate: true
      });
    } else if (equipment.type === 'Line') {
      impact = await predictCascadeFailure({
        failed_line_path: equipment.path,
        simulate: true
      });
    }
    
    const stationsIsolated = impact.isolated_stations?.length || 0;
    const mwLost = impact.summary?.total_load_mw || 0;
    const cascadeProb = impact.risk_assessment?.cascade_probability || 0;
    
    const severity = this.categorizeN1Severity(stationsIsolated, mwLost, cascadeProb);
    
    return {
      equipment_path: equipment.path,
      equipment_type: equipment.type,
      severity,
      impact: {
        stations_isolated: stationsIsolated,
        total_mw_lost: mwLost,
        cascade_probability: cascadeProb
      },
      n1_secure: severity === 'LOW',
      recommendation: this.determineN1Fix(severity, mwLost, cascadeProb)
    };
  }

  private async fullAssessment(input: VulnerabilityInput) {
    const startTime = Date.now();
    
    console.log(`[FullAssessment] Starting comprehensive analysis`);
    
    // Run all analyses
    const criticalEquipment = await this.analyzeCriticalEquipment(input);
    const n1Analysis = await this.runN1Contingency(input);
    
    // N-2 is optional (expensive)
    let n2Analysis = null;
    if (input.n2_max_pairs && input.n2_max_pairs > 0) {
      n2Analysis = await this.runN2Contingency({
        ...input,
        n2_max_pairs: Math.min(input.n2_max_pairs, 1000)
      });
    }
    
    // Vulnerability map
    const vulnerabilityMap = await this.createVulnerabilityMap(n1Analysis, n2Analysis);
    
    // Bottlenecks
    const bottlenecks = await this.detectBottlenecks();
    
    // Grid health score
    const healthScore = this.computeGridHealthScore({
      n1: n1Analysis,
      n2: n2Analysis,
      criticality: criticalEquipment,
      bottlenecks
    });
    
    // Recommendations
    const recommendations = input.include_recommendations
      ? this.generateRecommendations({
          n1: n1Analysis,
          n2: n2Analysis,
          bottlenecks,
          redundancy: criticalEquipment.top_critical_equipment
        })
      : [];
    
    const executionTime = (Date.now() - startTime) / 1000;
    
    return {
      analysis_id: `vuln_${Date.now()}`,
      timestamp: new Date().toISOString(),
      grid_health_score: healthScore,
      critical_equipment: {
        count: criticalEquipment.summary.critical_count,
        top_5: criticalEquipment.top_critical_equipment.slice(0, 5)
      },
      n1_analysis: {
        violations: n1Analysis.violations,
        pass_rate: n1Analysis.n1_pass_rate,
        critical_violations: n1Analysis.summary.critical
      },
      n2_analysis: n2Analysis ? {
        pairs_tested: n2Analysis.pairs_tested,
        violations: n2Analysis.violations,
        pass_rate: n2Analysis.n2_pass_rate,
        worst_case: n2Analysis.worst_case
      } : null,
      vulnerability_map: vulnerabilityMap.slice(0, 10),
      bottlenecks: bottlenecks.slice(0, 10),
      recommendations: recommendations.slice(0, 10),
      execution_time_seconds: executionTime.toFixed(1)
    };
  }

  private computeCriticalityScore(breakdown: any): number {
    const weights = {
      connectivity: 0.30,
      cascade: 0.25,
      pagerank: 0.15,
      betweenness: 0.15,
      redundancy: 0.15
    };
    
    return (
      weights.connectivity * breakdown.connectivity +
      weights.cascade * breakdown.cascade +
      weights.pagerank * breakdown.pagerank +
      weights.betweenness * breakdown.betweenness +
      weights.redundancy * (100 - breakdown.redundancy)  // Invert
    );
  }

  private categorizeScore(score: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    if (score > 80) return 'CRITICAL';
    if (score > 60) return 'HIGH';
    if (score > 40) return 'MEDIUM';
    return 'LOW';
  }

  private categorizeN1Severity(stations: number, mw: number, cascade: number): string {
    if (stations >= 5 || mw >= 500 || cascade >= 0.7) return 'CRITICAL';
    if (stations >= 2 || mw >= 100 || cascade >= 0.4) return 'HIGH';
    if (stations >= 1 || mw >= 50 || cascade >= 0.2) return 'MEDIUM';
    return 'LOW';
  }

  private severityToNumber(severity: string): number {
    const map = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
    return map[severity] || 0;
  }

  private async getEquipment(input: VulnerabilityInput) {
    let typeFilter = '';
    
    if (input.equipment_type_filter === 'lines') {
      typeFilter = "AND eq.type = 'Line'";
    } else if (input.equipment_type_filter === 'circuit_breakers') {
      typeFilter = "AND eq.type = 'CircuitBreaker'";
    } else if (input.equipment_type_filter === 'transformers') {
      typeFilter = "AND eq.type = 'Transformer'";
    }
    
    const query = `
      MATCH (eq)
      WHERE eq.pattern IS NOT NULL ${typeFilter}
      ${input.region_filter ? `AND eq.path CONTAINS '/${input.region_filter}/'` : ''}
      ${input.voltage_filter ? `AND eq.path CONTAINS '/${input.voltage_filter}/'` : ''}
      RETURN eq.path as path, eq.type as type
      ORDER BY eq.path
    `;
    
    const result = await this.neo4j.run(query);
    
    return result.records.map(r => ({
      path: r.get('path'),
      type: r.get('type')
    }));
  }

  private getCacheKey(input: VulnerabilityInput): string {
    return JSON.stringify(input);
  }

  // Stub methods (full implementations in actual code)
  private async computeConnectivityImpact(equipment: any[]) { return []; }
  private async computeCascadeRisk(equipment: any[]) { return []; }
  private async computePageRank(equipment: any[]) { return []; }
  private async computeBetweenness(equipment: any[]) { return []; }
  private async computeRedundancy(equipment: any[]) { return []; }
  private async runN2Contingency(input: any) { return null; }
  private async createVulnerabilityMap(n1: any, n2: any) { return []; }
  private async detectBottlenecks() { return []; }
  private computeGridHealthScore(data: any): GridHealthScore {
    return {
      overall_score: 67.5,
      grade: 'C',
      metrics: {
        n1_pass_rate: 92.3,
        n2_pass_rate: 73.1,
        redundancy_level: 65.0,
        load_balance: 82.0
      },
      interpretation: "FAIR: Grid has moderate risk, upgrades recommended"
    };
  }
  private generateRecommendations(data: any) { return []; }
  private determineN1Fix(severity: string, mw: number, cascade: number): string {
    if (cascade > 0.7) return 'Install additional line to prevent cascade';
    if (mw > 500) return 'Build backup connection';
    return 'Install automated switching';
  }
}
```

---

## 11. Performance Optimization

### Caching Strategy

**Cache results for:**
- PageRank/Betweenness (expensive, graph static)
- N-1/N-2 results (unless topology changes)
- Equipment criticality scores

**Invalidate cache when:**
- New equipment added to graph
- Line capacity/impedance updated
- Manual cache clear

**Implementation:**
```javascript
class ResultCache {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private ttl = 3600 * 1000;  // 1 hour
  
  get(key: string) {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  set(key: string, data: any) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  clear() {
    this.cache.clear();
  }
}
```

---

### Parallel Execution

**Batch N-1 analysis:**
```javascript
// Process 10 equipment in parallel
const batchSize = 10;
for (let i = 0; i < equipment.length; i += batchSize) {
  const batch = equipment.slice(i, i + batchSize);
  
  const batchResults = await Promise.all(
    batch.map(eq => analyzeEquipmentFailure(eq))
  );
  
  results.push(...batchResults);
}
```

**Worker threads (advanced):**
```javascript
import { Worker } from 'worker_threads';

function runN1Worker(equipment: any[]) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./n1-worker.js', {
      workerData: equipment
    });
    
    worker.on('message', resolve);
    worker.on('error', reject);
  });
}
```

---

### Sampling for Large Grids

**When testing 1000+ equipment:**

```javascript
function sampleEquipment(equipment: any[], maxSamples: number = 500) {
  if (equipment.length <= maxSamples) {
    return equipment;  // Test all
  }
  
  // Stratified sampling
  const critical = equipment.filter(eq => eq.criticality_score > 80);  // All critical
  const high = equipment.filter(eq => eq.criticality_score > 60 && eq.criticality_score <= 80);
  const rest = equipment.filter(eq => eq.criticality_score <= 60);
  
  // Sample proportionally
  const criticalSample = critical;  // Keep all
  const highSample = high.slice(0, Math.min(high.length, 100));
  const restSample = rest.slice(0, maxSamples - criticalSample.length - highSample.length);
  
  return [...criticalSample, ...highSample, ...restSample];
}
```

---

## 12. Test Cases

### Test Case 1: Critical Equipment Ranking

**Input:**
```javascript
{
  analysis_type: "critical_equipment",
  region_filter: "AKMOLA",
  equipment_type_filter: "all"
}
```

**Expected:**
- ✅ Returns ranked list (top 20)
- ✅ Scores normalized to 0-100
- ✅ All 5 metrics computed
- ✅ Response time < 60 seconds

---

### Test Case 2: N-1 Contingency

**Input:**
```javascript
{
  analysis_type: "n1_contingency",
  equipment_type_filter: "circuit_breakers"
}
```

**Expected:**
- ✅ Tests all CBs (100+)
- ✅ Identifies violations (3-10)
- ✅ Pass rate > 90%
- ✅ Response time < 120 seconds

---

### Test Case 3: Full Assessment

**Input:**
```javascript
{
  analysis_type: "full_assessment",
  n2_max_pairs: 500,
  include_recommendations: true
}
```

**Expected:**
- ✅ Grid health score computed
- ✅ Vulnerability map created
- ✅ Recommendations generated
- ✅ Response time < 300 seconds (5 min)

---

## 13. Integration with Other UC

### UC5 Uses Components From:

**UC1 (Breaker Trip):**
- Connectivity analysis (batch mode)
- Isolated stations detection

**UC2 (Cascade Prediction):**
- Cascade risk scoring
- Load redistribution

**UC4 (Root Cause):**
- Basic centrality (degree)

### UC5 Extends All Previous UC:

**System-wide perspective:**
- UC1: Single failure → Batch all failures
- UC2: One cascade → All possible cascades
- UC4: Single incident → All vulnerability sources

**Provides Foundation For Future:**
- Preventive maintenance scheduling
- Investment prioritization
- Grid expansion planning
- Real-time risk monitoring

---

## 14. Validation Checklist

Before marking UC5 complete:

- [ ] Critical equipment ranking works (5 metrics)
- [ ] N-1 analysis completes for 100+ equipment
- [ ] N-2 analysis handles 500+ pairs
- [ ] PageRank/Betweenness computed (Neo4j GDS)
- [ ] Redundancy scoring works
- [ ] Grid health score formula validated
- [ ] Vulnerability map created
- [ ] Bottleneck detection works
- [ ] Recommendations engine works
- [ ] Caching implemented
- [ ] Parallel execution works
- [ ] All 3 test cases pass
- [ ] Response time < 5 minutes (full assessment)
- [ ] Tool callable from OpenClaw agent

---

## 15. Future Enhancements

### Phase 1 Limitations

**Current:**
- Static analysis (snapshot)
- No probabilistic modeling
- Simplified centrality (if GDS unavailable)

**Future improvements:**

### Phase 2: Advanced Graph Algorithms

**Neo4j GDS integration:**
- Real PageRank (not approximation)
- Real Betweenness (sampling-based)
- Community detection (Louvain)
- Shortest path variants (k-shortest-paths)
- Cut detection algorithms (min-cut, articulation points)

### Phase 3: Probabilistic Analysis

**Monte Carlo simulation:**
- Random failure scenarios (1000+ simulations)
- Probability distributions (equipment reliability)
- Risk heatmaps
- Confidence intervals

**Example:**
```javascript
function monteCarloVulnerability(equipment, simulations = 1000) {
  const results = [];
  
  for (let i = 0; i < simulations; i++) {
    // Randomly select 1-3 failures based on historical probability
    const failures = selectRandomFailures(equipment);
    
    // Simulate impact
    const impact = simulateMultipleFailures(failures);
    
    results.push(impact);
  }
  
  // Aggregate statistics
  return {
    mean_impact: average(results.map(r => r.mw_lost)),
    p95_impact: percentile(results.map(r => r.mw_lost), 0.95),
    probability_blackout: results.filter(r => r.stations_isolated > 10).length / simulations
  };
}
```

### Phase 4: Time-Series Analysis

**Historical vulnerability tracking:**
- Track grid health over time
- Detect degradation trends
- Predict future vulnerabilities

**Example:**
```javascript
{
  grid_health_history: [
    { timestamp: "2024-01-01", score: 72.5 },
    { timestamp: "2024-06-01", score: 69.8 },
    { timestamp: "2025-01-01", score: 67.5 },
    { timestamp: "2025-06-01", score: 67.5 }  // Stable
  ],
  trend: "DECLINING",
  predicted_score_1year: 65.2,
  recommendation: "Trend analysis suggests upgrades needed"
}
```

### Phase 5: Real-Time Monitoring

**Continuous vulnerability assessment:**
- Stream topology changes
- Update rankings incrementally
- Alert on new vulnerabilities

**Example:**
```javascript
// WebSocket stream
vulnerabilityMonitor.on('topology-change', async (change) => {
  // Incremental re-computation
  const affectedEquipment = findAffectedEquipment(change);
  
  const updatedScores = await recomputeCriticality(affectedEquipment);
  
  // Check for new vulnerabilities
  const newVulnerabilities = updatedScores.filter(s => s.rating === 'CRITICAL');
  
  if (newVulnerabilities.length > 0) {
    await alertOperators(newVulnerabilities);
  }
});
```

### Phase 6: Machine Learning

**Predict failures:**
- Train on historical incidents
- Learn vulnerability patterns
- Predict next likely failure

**Features:**
- Equipment age, loading, maintenance history
- Historical failure rate
- Weather correlation
- Seasonal patterns

---

**END OF SPECIFICATION**

UC5 specification complete! 🌐 Ready for implementation.
