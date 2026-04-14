# UC2 Implementation Specification: Cascade Failure Prediction

**File Location:** `/home/node/.openclaw/workspace/extensions/grid-graph-builder/UC2-IMPLEMENTATION-SPEC.md`

**Purpose:** Complete specification for implementing UC2 - predicts cascade failures when a line trips

---

## 1. Requirements

### User Question
**"If L2811 fails, which other lines are at risk of cascade failure?"**

### Expected Answer Components
1. **Failed Line Impact:** Current loading on the line that will fail
2. **Load Redistribution:** How much MW will shift to alternative paths
3. **Cascade Risk Lines:** Which specific lines will become overloaded
4. **Cascade Depth:** How many cascade levels could occur (1st order, 2nd order, etc.)
5. **Total Impact:** Number of stations at risk if cascade occurs
6. **Quantitative Risk:** Probability score (0-100) and MW at risk
7. **Prevention Actions:** Specific load shedding or switching operations to prevent cascade

### Success Criteria
- ✅ Identifies ALL alternative paths (multi-hop, not just direct)
- ✅ Calculates load redistribution with physics (not equal split - proportional to impedance/capacity)
- ✅ Detects multi-level cascades (failure → overload → failure → ...)
- ✅ Quantifies risk (not just "high/low")
- ✅ Provides actionable prevention steps (specific MW to shed, where)
- ✅ Response time < 10 seconds (complex graph traversal)

---

## 2. Current State Analysis

### What Exists (from UC1)
✅ **Nodes:**
- Station
- VoltageLevel
- LineTerminal
- Line
- CircuitBreaker (from UC1)
- State (from UC1)
- Telemetry (from UC1)

✅ **Relationships:**
- `(Station)-[:HAS_VOLTAGE_LEVEL]->(VoltageLevel)`
- `(VoltageLevel)-[:HAS_TERMINAL]->(LineTerminal)`
- `(Line)-[:CONNECTS_AT_POLE_I]->(LineTerminal)`
- `(Line)-[:CONNECTS_AT_POLE_J]->(LineTerminal)`
- `(LineTerminal)-[:HAS_TELEMETRY]->(Telemetry)` (from UC1)

### What's Missing for UC2
❌ **Properties on Line node:**
- `rated_capacity_mw` - Thermal limit (MW)
- `impedance_ohm` - Electrical impedance (for load distribution calculation)
- `length_km` - Physical length (affects impedance)

❌ **Properties on Station node:**
- `is_generation` - Boolean flag (generation sources)
- `generation_mw` - Current generation output

❌ **Computed properties (need algorithm):**
- Load distribution coefficients (based on impedance)
- Cascade propagation graph

---

## 3. Graph Data Requirements

### Enhanced Line Properties

**Source:** Need to extract from SOURCE files or use engineering defaults

**Properties to Add:**
```javascript
{
  // Existing from Phase 1:
  type: 'Line',
  name: 'L2811',
  vclass: 220,
  poleI: '/root/FP/PROJECT/KAZ/AKMOLA/KOKSHETAU/220/L2811',
  poleJ: '/root/FP/PROJECT/KAZ/CENTER/BALKHASH/220/L2811',
  
  // NEW for UC2:
  rated_capacity_mw: 120,      // Thermal limit (from line design specs)
  impedance_ohm: 8.5,          // Total line impedance (R + jX)
  length_km: 45.3,             // Physical length
  
  // OPTIONAL (engineering defaults if not in SOURCE):
  reactance_ohm: 8.0,          // Inductive reactance
  resistance_ohm: 2.5,         // Resistive component
  susceptance_siemens: 0.002   // Capacitive susceptance
}
```

**Detection Pattern:**
```javascript
// Check if design parameters exist in SOURCE
const lineConfigPath = `${SOURCES}/fields/@lines/${lineName}/line/.properties.json`;

// If not found, use engineering defaults based on voltage:
const defaults = {
  220: { capacity_mw: 120, impedance_per_km: 0.19 },
  110: { capacity_mw: 60, impedance_per_km: 0.38 },
  500: { capacity_mw: 500, impedance_per_km: 0.08 }
};
```

---

### Enhanced Station Properties

**Properties to Add:**
```javascript
{
  // Existing:
  type: 'Station',
  name: 'EKIBASTUZ',
  path: '/root/FP/PROJECT/KAZ/SEVER/EKIBASTUZ',
  region: 'KAZ/SEVER',
  
  // NEW for UC2:
  is_generation: true,        // True for power plants
  generation_mw: 850,         // Current output (from telemetry sum)
  generation_capacity_mw: 1000 // Maximum output
}
```

**Detection Pattern:**
```javascript
// Stations with generators (search for prototypes/generator)
const generatorCount = await countNodes(`${stationPath}/*/*/generator`);
if (generatorCount > 0) {
  station.is_generation = true;
}
```

---

## 4. Import Script Updates

### File: `extensions/grid-graph-builder/scripts/import-graph.js`

### New Function: enhanceLineProperties()

```javascript
async function enhanceLineProperties(session) {
  console.log('Enhancing line properties with engineering parameters...');
  
  // Engineering defaults by voltage class
  const defaults = {
    500: { capacity_mw: 500, impedance_per_km: 0.08 },
    220: { capacity_mw: 120, impedance_per_km: 0.19 },
    110: { capacity_mw: 60, impedance_per_km: 0.38 },
    35: { capacity_mw: 15, impedance_per_km: 0.85 }
  };
  
  // Get all lines
  const linesResult = await session.run(`
    MATCH (line:Line)
    RETURN line.name as name, line.vclass as vclass, 
           line.poleI as poleI, line.poleJ as poleJ
  `);
  
  for (const record of linesResult.records) {
    const lineName = record.get('name');
    const vclass = record.get('vclass');
    const poleI = record.get('poleI');
    const poleJ = record.get('poleJ');
    
    // Calculate distance (rough estimate from path - could improve with GIS)
    const lengthKm = estimateLineLength(poleI, poleJ) || 50; // Default 50km
    
    // Get defaults for this voltage class
    const params = defaults[vclass] || defaults[220];
    
    // Calculate impedance
    const impedanceOhm = params.impedance_per_km * lengthKm;
    
    // Update line node
    await session.run(`
      MATCH (line:Line {name: $name})
      SET line.rated_capacity_mw = $capacity,
          line.impedance_ohm = $impedance,
          line.length_km = $length
    `, {
      name: lineName,
      capacity: params.capacity_mw,
      impedance: impedanceOhm,
      length: lengthKm
    });
    
    stats.lines_enhanced++;
  }
  
  console.log(`Enhanced ${stats.lines_enhanced} lines with engineering parameters`);
}

function estimateLineLength(poleI, poleJ) {
  // Simple heuristic: count path segments between regions
  const partsI = poleI.split('/');
  const partsJ = poleJ.split('/');
  
  // Same region? ~30km average
  if (partsI[5] === partsJ[5]) return 30;
  
  // Different regions in same country? ~150km
  if (partsI[4] === partsJ[4]) return 150;
  
  // Cross-border? ~300km
  return 300;
}
```

---

### New Function: detectGenerationStations()

```javascript
async function detectGenerationStations(session) {
  console.log('Detecting generation stations...');
  
  // Known generation station patterns
  const generationPatterns = ['_TEC', '_GRES', '_SES', 'EKIBASTUZ', 'Jezkaz'];
  
  // Query all stations
  const stationsResult = await session.run(`
    MATCH (s:Station)
    RETURN s.name as name, s.path as path
  `);
  
  for (const record of stationsResult.records) {
    const name = record.get('name');
    const path = record.get('path');
    
    // Check if name matches generation pattern
    const isGeneration = generationPatterns.some(pattern => name.includes(pattern));
    
    if (isGeneration) {
      // Mark as generation station
      await session.run(`
        MATCH (s:Station {path: $path})
        SET s.is_generation = true,
            s.generation_capacity_mw = 1000
      `, { path });
      
      stats.generation_stations++;
    }
  }
  
  console.log(`Found ${stats.generation_stations} generation stations`);
}
```

---

### Update Main Import Flow

```javascript
async function runImport() {
  // ... existing imports ...
  
  // NEW: Enhance properties for UC2
  await enhanceLineProperties(session);
  await detectGenerationStations(session);
  
  console.log('Import complete!');
}
```

---

## 5. Tool Integration

### File: `extensions/grid-analysis-v2/src/operations/cascade-prediction.ts`

### Tool Configuration

**In `openclaw.plugin.json`:**
```json
{
  "tools": [
    {
      "name": "predict_cascade_failure",
      "description": "Predict cascade failure risk when a line trips: which lines will overload, cascade depth, total impact, prevention actions",
      "parameters": {
        "type": "object",
        "properties": {
          "lineName": {
            "type": "string",
            "description": "Name of the line that will fail (e.g., L2811)"
          },
          "assumeTrip": {
            "type": "boolean",
            "description": "If true, assumes line is already tripped. If false, predicts what would happen if it trips",
            "default": false
          },
          "maxCascadeDepth": {
            "type": "number",
            "description": "Maximum cascade levels to simulate (1-5)",
            "default": 3
          }
        },
        "required": ["lineName"]
      }
    }
  ]
}
```

### Tool Invocation Example

**User asks:**
> "What happens if L2811 between KOKSHETAU and BALKHASH fails? Will other lines cascade?"

**Agent calls:**
```javascript
await tools.predict_cascade_failure({
  lineName: "L2811",
  assumeTrip: false,
  maxCascadeDepth: 3
});
```

---

## 6. Complete Algorithm Implementation

### File: `extensions/grid-analysis-v2/src/operations/cascade-prediction.ts`

```typescript
import { Neo4jClient } from '../../../libs/ecomet-core/src/client/neo4j-client';
import { EcometClient } from '../../../libs/ecomet-core/src/client/ecomet-client';

interface CascadeInput {
  lineName: string;
  assumeTrip?: boolean;
  maxCascadeDepth?: number;
}

interface LineRiskInfo {
  line_name: string;
  current_loading_mw: number;
  current_loading_percent: number;
  predicted_loading_mw: number;
  predicted_loading_percent: number;
  overload_mw: number;
  cascade_level: number;
  trip_probability: number;
}

interface CascadeResult {
  initial_failure: {
    line: string;
    current_loading_mw: number;
    endpoints: string[];
  };
  load_redistribution: {
    total_mw_redistributed: number;
    alternative_paths: number;
    distribution_method: string;
  };
  cascade_risk_lines: LineRiskInfo[];
  cascade_depth: number;
  total_impact: {
    lines_at_risk: number;
    stations_affected: number;
    estimated_blackout_mw: number;
  };
  risk_score: {
    score: number;
    level: string;
    cascade_probability_percent: number;
  };
  prevention_actions: {
    priority: string;
    actions: Array<{
      action_type: string;
      target: string;
      magnitude_mw: number;
      description: string;
    }>;
  };
}

export class CascadePredictionAnalyzer {
  constructor(
    private neo4j: Neo4jClient,
    private ecomet: EcometClient
  ) {}

  async predict(input: CascadeInput): Promise<CascadeResult> {
    const maxDepth = input.maxCascadeDepth || 3;
    
    // STEP 1: Get initial line info and current loading
    const initialLine = await this.getLineInfo(input.lineName);
    
    // STEP 2: Find alternative paths between endpoints
    const alternatives = await this.findAlternativePaths(
      initialLine.station_i,
      initialLine.station_j,
      input.lineName
    );
    
    // STEP 3: Get current loading on all lines in alternative paths
    const lineLoadings = await this.getCurrentLoadings(alternatives.all_lines);
    
    // STEP 4: Calculate load redistribution
    const redistribution = this.calculateLoadRedistribution(
      initialLine.current_loading_mw,
      alternatives.paths,
      lineLoadings
    );
    
    // STEP 5: Simulate cascade (recursive)
    const cascadeLines = await this.simulateCascade(
      redistribution,
      lineLoadings,
      maxDepth,
      1,
      [input.lineName]
    );
    
    // STEP 6: Calculate total impact
    const totalImpact = await this.calculateTotalImpact(cascadeLines);
    
    // STEP 7: Calculate risk score
    const riskScore = this.calculateCascadeRisk(cascadeLines, totalImpact);
    
    // STEP 8: Generate prevention actions
    const preventionActions = this.generatePreventionActions(
      cascadeLines,
      redistribution,
      riskScore
    );
    
    return {
      initial_failure: {
        line: input.lineName,
        current_loading_mw: initialLine.current_loading_mw,
        endpoints: [initialLine.station_i, initialLine.station_j]
      },
      load_redistribution: {
        total_mw_redistributed: initialLine.current_loading_mw,
        alternative_paths: alternatives.paths.length,
        distribution_method: 'impedance_weighted'
      },
      cascade_risk_lines: cascadeLines,
      cascade_depth: Math.max(...cascadeLines.map(l => l.cascade_level)),
      total_impact: totalImpact,
      risk_score: riskScore,
      prevention_actions: preventionActions
    };
  }

  private async getLineInfo(lineName: string) {
    const query = `
      MATCH (line:Line {name: $lineName})
      
      OPTIONAL MATCH (line)-[:CONNECTS_AT_POLE_I]->(termI:LineTerminal)
                     <-[:HAS_TERMINAL]-(vlI:VoltageLevel)
                     <-[:HAS_VOLTAGE_LEVEL]-(stationI:Station)
      
      OPTIONAL MATCH (line)-[:CONNECTS_AT_POLE_J]->(termJ:LineTerminal)
                     <-[:HAS_TERMINAL]-(vlJ:VoltageLevel)
                     <-[:HAS_VOLTAGE_LEVEL]-(stationJ:Station)
      
      OPTIONAL MATCH (termI)-[:HAS_TELEMETRY]->(teleP:Telemetry {signal_type: 'P'})
      
      RETURN 
        line.rated_capacity_mw as capacity,
        line.impedance_ohm as impedance,
        stationI.name as station_i,
        stationJ.name as station_j,
        teleP.path as telemetry_path
    `;
    
    const result = await this.neo4j.run(query, { lineName });
    const record = result.records[0].toObject();
    
    // Get current loading from Ecomet
    let currentLoading = 0;
    if (record.telemetry_path) {
      const ecometResult = await this.ecomet.query(
        `get out_value from 'project' where .fp_path = '${record.telemetry_path}'`
      );
      currentLoading = ecometResult.result[1][0];
    }
    
    return {
      capacity_mw: record.capacity,
      impedance_ohm: record.impedance,
      station_i: record.station_i,
      station_j: record.station_j,
      current_loading_mw: currentLoading,
      telemetry_path: record.telemetry_path
    };
  }

  private async findAlternativePaths(stationI: string, stationJ: string, excludeLine: string) {
    const query = `
      MATCH (s1:Station {name: $stationI})
      MATCH (s2:Station {name: $stationJ})
      
      // Find all paths up to 10 hops
      MATCH path = shortestPath((s1)-[:HAS_VOLTAGE_LEVEL|HAS_TERMINAL|CONNECTS_AT_POLE_I|CONNECTS_AT_POLE_J*1..20]-(s2))
      
      // Extract lines from path
      WITH path, 
           [rel IN relationships(path) WHERE type(rel) IN ['CONNECTS_AT_POLE_I', 'CONNECTS_AT_POLE_J'] | 
            startNode(rel).name] as line_nodes
      
      // Exclude failed line
      WHERE NONE(line IN line_nodes WHERE line = $excludeLine)
      
      // Return up to 5 alternative paths
      WITH path, line_nodes
      LIMIT 5
      
      RETURN 
        [n IN nodes(path) WHERE n:Line | n.name] as path_lines,
        length(path) as path_length
    `;
    
    const result = await this.neo4j.run(query, { stationI, stationJ, excludeLine });
    
    const paths = result.records.map(r => ({
      lines: r.get('path_lines'),
      length: r.get('path_length')
    }));
    
    // Collect all unique lines
    const allLines = new Set<string>();
    paths.forEach(p => p.lines.forEach(l => allLines.add(l)));
    
    return {
      paths,
      all_lines: Array.from(allLines)
    };
  }

  private async getCurrentLoadings(lineNames: string[]) {
    const loadings: Record<string, { 
      current_mw: number, 
      capacity_mw: number, 
      impedance_ohm: number 
    }> = {};
    
    for (const lineName of lineNames) {
      const query = `
        MATCH (line:Line {name: $lineName})
        OPTIONAL MATCH (line)-[:CONNECTS_AT_POLE_I|CONNECTS_AT_POLE_J]-(term:LineTerminal)
                       -[:HAS_TELEMETRY]->(tele:Telemetry {signal_type: 'P'})
        
        RETURN 
          line.rated_capacity_mw as capacity,
          line.impedance_ohm as impedance,
          tele.path as telemetry_path
        LIMIT 1
      `;
      
      const result = await this.neo4j.run(query, { lineName });
      if (result.records.length === 0) continue;
      
      const record = result.records[0].toObject();
      
      // Get current power from Ecomet
      let currentMW = 0;
      if (record.telemetry_path) {
        const ecometResult = await this.ecomet.query(
          `get out_value from 'project' where .fp_path = '${record.telemetry_path}'`
        );
        currentMW = ecometResult.result[1][0] || 0;
      }
      
      loadings[lineName] = {
        current_mw: currentMW,
        capacity_mw: record.capacity || 120,
        impedance_ohm: record.impedance || 10
      };
    }
    
    return loadings;
  }

  private calculateLoadRedistribution(
    failedLineMW: number,
    paths: Array<{ lines: string[], length: number }>,
    lineLoadings: Record<string, any>
  ) {
    // Calculate impedance-weighted distribution
    // Lower impedance = more current flows through that path
    
    const pathImpedances = paths.map(path => {
      // Total path impedance = sum of line impedances
      const totalZ = path.lines.reduce((sum, line) => {
        return sum + (lineLoadings[line]?.impedance_ohm || 10);
      }, 0);
      
      return { path, impedance: totalZ };
    });
    
    // Calculate conductance (inverse of impedance)
    const totalConductance = pathImpedances.reduce((sum, p) => sum + (1 / p.impedance), 0);
    
    // Distribute load proportionally to conductance
    const distribution = pathImpedances.map(p => {
      const conductance = 1 / p.impedance;
      const fraction = conductance / totalConductance;
      const additionalMW = failedLineMW * fraction;
      
      return {
        path: p.path,
        additional_mw_per_line: additionalMW / p.path.lines.length, // Simplification
        lines_affected: p.path.lines
      };
    });
    
    return distribution;
  }

  private async simulateCascade(
    redistribution: any[],
    lineLoadings: Record<string, any>,
    maxDepth: number,
    currentLevel: number,
    trippedLines: string[]
  ): Promise<LineRiskInfo[]> {
    
    if (currentLevel > maxDepth) {
      return [];
    }
    
    const riskyLines: LineRiskInfo[] = [];
    
    // For each alternative path
    for (const dist of redistribution) {
      for (const lineName of dist.lines_affected) {
        if (trippedLines.includes(lineName)) continue; // Already tripped
        
        const currentLoading = lineLoadings[lineName];
        if (!currentLoading) continue;
        
        const predictedMW = currentLoading.current_mw + dist.additional_mw_per_line;
        const predictedPercent = (predictedMW / currentLoading.capacity_mw) * 100;
        
        // Check if overloaded
        if (predictedPercent > 100) {
          const overloadMW = predictedMW - currentLoading.capacity_mw;
          
          // Calculate trip probability (simple model)
          // 100-110%: 20% probability
          // 110-120%: 50%
          // 120-130%: 80%
          // >130%: 95%
          const tripProb = predictedPercent > 130 ? 95 :
                          predictedPercent > 120 ? 80 :
                          predictedPercent > 110 ? 50 : 20;
          
          riskyLines.push({
            line_name: lineName,
            current_loading_mw: currentLoading.current_mw,
            current_loading_percent: (currentLoading.current_mw / currentLoading.capacity_mw) * 100,
            predicted_loading_mw: predictedMW,
            predicted_loading_percent: predictedPercent,
            overload_mw: overloadMW,
            cascade_level: currentLevel,
            trip_probability: tripProb
          });
          
          // Recurse: simulate this line failing too
          if (tripProb > 50 && currentLevel < maxDepth) {
            // This line will likely trip
            const lineInfo = await this.getLineInfo(lineName);
            
            const nextAlternatives = await this.findAlternativePaths(
              lineInfo.station_i,
              lineInfo.station_j,
              lineName
            );
            
            const nextLoadings = await this.getCurrentLoadings(nextAlternatives.all_lines);
            
            const nextRedistribution = this.calculateLoadRedistribution(
              predictedMW,
              nextAlternatives.paths,
              nextLoadings
            );
            
            const nestedCascade = await this.simulateCascade(
              nextRedistribution,
              nextLoadings,
              maxDepth,
              currentLevel + 1,
              [...trippedLines, lineName]
            );
            
            riskyLines.push(...nestedCascade);
          }
        }
      }
    }
    
    return riskyLines;
  }

  private async calculateTotalImpact(cascadeLines: LineRiskInfo[]) {
    // Count unique lines at risk
    const linesAtRisk = new Set(cascadeLines.map(l => l.line_name)).size;
    
    // Find all stations affected by these lines
    const affectedStations = new Set<string>();
    let totalBlackoutMW = 0;
    
    for (const riskyLine of cascadeLines) {
      const query = `
        MATCH (line:Line {name: $lineName})
        MATCH (line)-[:CONNECTS_AT_POLE_I|CONNECTS_AT_POLE_J]-(term:LineTerminal)
              <-[:HAS_TERMINAL]-(vl:VoltageLevel)
              <-[:HAS_VOLTAGE_LEVEL]-(station:Station)
        
        RETURN DISTINCT station.name as station_name
      `;
      
      const result = await this.neo4j.run(query, { lineName: riskyLine.line_name });
      result.records.forEach(r => affectedStations.add(r.get('station_name')));
      
      // Accumulate blackout risk
      if (riskyLine.trip_probability > 50) {
        totalBlackoutMW += riskyLine.predicted_loading_mw;
      }
    }
    
    return {
      lines_at_risk: linesAtRisk,
      stations_affected: affectedStations.size,
      estimated_blackout_mw: totalBlackoutMW
    };
  }

  private calculateCascadeRisk(cascadeLines: LineRiskInfo[], totalImpact: any) {
    let score = 0;
    
    // Factor 1: Number of lines at risk (30 points)
    const lineRiskScore = Math.min(30, totalImpact.lines_at_risk * 10);
    score += lineRiskScore;
    
    // Factor 2: Cascade depth (25 points)
    const maxLevel = Math.max(...cascadeLines.map(l => l.cascade_level), 0);
    const depthScore = Math.min(25, maxLevel * 8);
    score += depthScore;
    
    // Factor 3: Trip probability (25 points)
    const avgTripProb = cascadeLines.reduce((sum, l) => sum + l.trip_probability, 0) / 
                        (cascadeLines.length || 1);
    const probScore = (avgTripProb / 100) * 25;
    score += probScore;
    
    // Factor 4: Stations affected (20 points)
    const stationScore = Math.min(20, totalImpact.stations_affected * 4);
    score += stationScore;
    
    const finalScore = Math.min(100, score);
    
    return {
      score: finalScore,
      level: finalScore >= 70 ? 'CRITICAL' :
             finalScore >= 40 ? 'HIGH' :
             finalScore >= 20 ? 'MEDIUM' : 'LOW',
      cascade_probability_percent: avgTripProb
    };
  }

  private generatePreventionActions(
    cascadeLines: LineRiskInfo[],
    redistribution: any[],
    riskScore: any
  ) {
    if (cascadeLines.length === 0) {
      return {
        priority: 'LOW',
        actions: [
          {
            action_type: 'MONITOR',
            target: 'all_lines',
            magnitude_mw: 0,
            description: 'No cascade risk detected. Continue normal monitoring.'
          }
        ]
      };
    }
    
    // Sort by overload magnitude
    const sorted = cascadeLines.sort((a, b) => b.overload_mw - a.overload_mw);
    
    const actions = [];
    
    // Action 1: Load shedding to prevent first-order cascades
    const firstOrderLines = sorted.filter(l => l.cascade_level === 1);
    if (firstOrderLines.length > 0) {
      const totalShedNeeded = firstOrderLines.reduce((sum, l) => sum + l.overload_mw, 0);
      
      actions.push({
        action_type: 'LOAD_SHEDDING',
        target: 'non_critical_loads',
        magnitude_mw: Math.ceil(totalShedNeeded * 1.2), // 20% safety margin
        description: `Shed ${Math.ceil(totalShedNeeded * 1.2)} MW of non-critical loads to prevent first-order cascades on ${firstOrderLines.length} line(s)`
      });
    }
    
    // Action 2: Switching operations to redistribute
    if (redistribution.length > 1) {
      actions.push({
        action_type: 'SWITCHING',
        target: 'reconfigure_topology',
        magnitude_mw: 0,
        description: `Open sectionalizers to isolate overloaded segments and redistribute load more evenly across ${redistribution.length} alternative paths`
      });
    }
    
    // Action 3: Preventive maintenance cancellation
    const criticalLines = sorted.filter(l => l.trip_probability > 70);
    if (criticalLines.length > 0) {
      actions.push({
        action_type: 'MAINTENANCE_PRIORITY',
        target: criticalLines.map(l => l.line_name).join(', '),
        magnitude_mw: 0,
        description: `Cancel any planned maintenance on ${criticalLines.length} critical line(s) to keep them in service`
      });
    }
    
    // Action 4: Emergency generation dispatch
    actions.push({
      action_type: 'GENERATION_DISPATCH',
      target: 'local_generation',
      magnitude_mw: Math.ceil(sorted[0]?.overload_mw || 0),
      description: 'Increase local generation to reduce transmission loading'
    });
    
    return {
      priority: riskScore.level === 'CRITICAL' ? 'EMERGENCY' :
                riskScore.level === 'HIGH' ? 'HIGH' : 'MEDIUM',
      actions
    };
  }
}
```

---

## 7. Test Cases

### Test Case 1: Single Line Cascade (HIGH Risk)

**Input:**
```javascript
{
  lineName: "L2811",
  assumeTrip: false,
  maxCascadeDepth: 3
}
```

**Scenario:**
- L2811 carries 85 MW (capacity 120 MW)
- 1 alternative path via L2821
- L2821 currently at 70 MW (58% loaded)
- After redistribution: L2821 will carry 70 + 85 = 155 MW (129% - OVERLOAD!)

**Expected Output:**
```json
{
  "initial_failure": {
    "line": "L2811",
    "current_loading_mw": 85,
    "endpoints": ["KOKSHETAU", "BALKHASH"]
  },
  "load_redistribution": {
    "total_mw_redistributed": 85,
    "alternative_paths": 1,
    "distribution_method": "impedance_weighted"
  },
  "cascade_risk_lines": [
    {
      "line_name": "L2821",
      "current_loading_mw": 70,
      "current_loading_percent": 58.3,
      "predicted_loading_mw": 155,
      "predicted_loading_percent": 129.2,
      "overload_mw": 35,
      "cascade_level": 1,
      "trip_probability": 95
    }
  ],
  "cascade_depth": 1,
  "total_impact": {
    "lines_at_risk": 1,
    "stations_affected": 2,
    "estimated_blackout_mw": 155
  },
  "risk_score": {
    "score": 78,
    "level": "HIGH",
    "cascade_probability_percent": 95
  },
  "prevention_actions": {
    "priority": "HIGH",
    "actions": [
      {
        "action_type": "LOAD_SHEDDING",
        "magnitude_mw": 42,
        "description": "Shed 42 MW of non-critical loads to prevent first-order cascades on 1 line(s)"
      }
    ]
  }
}
```

---

### Test Case 2: Multi-Level Cascade (CRITICAL)

**Scenario:**
- L2811 fails (85 MW)
- Load redistributes to L2821 and L5191
- L2821 overloads → trips
- L5191 now takes entire load → also overloads
- 3 levels of cascade

**Expected Output:**
```json
{
  "cascade_risk_lines": [
    {
      "line_name": "L2821",
      "cascade_level": 1,
      "trip_probability": 95
    },
    {
      "line_name": "L5191",
      "cascade_level": 2,
      "trip_probability": 80
    },
    {
      "line_name": "L5220",
      "cascade_level": 3,
      "trip_probability": 50
    }
  ],
  "cascade_depth": 3,
  "risk_score": {
    "score": 92,
    "level": "CRITICAL"
  },
  "prevention_actions": {
    "priority": "EMERGENCY"
  }
}
```

---

### Test Case 3: No Cascade (LOW Risk)

**Scenario:**
- L5170 fails (45 MW)
- 3 alternative paths
- Each can absorb additional 15 MW easily
- No lines exceed 80% after redistribution

**Expected Output:**
```json
{
  "cascade_risk_lines": [],
  "cascade_depth": 0,
  "risk_score": {
    "score": 12,
    "level": "LOW",
    "cascade_probability_percent": 0
  },
  "prevention_actions": {
    "priority": "LOW",
    "actions": [
      {
        "action_type": "MONITOR",
        "description": "No cascade risk detected"
      }
    ]
  }
}
```

---

## 8. Validation Checklist

Before marking UC2 implementation complete:

- [ ] Line properties enhanced (capacity, impedance)
- [ ] Generation stations detected
- [ ] Alternative path detection works (multi-hop)
- [ ] Current loading query works (Ecomet integration)
- [ ] Load redistribution calculation correct (impedance-weighted, not equal split)
- [ ] Cascade simulation works (recursive)
- [ ] Multi-level cascades detected (depth > 1)
- [ ] Trip probability calculation reasonable
- [ ] Total impact calculation accurate
- [ ] Risk score formula implemented
- [ ] Prevention actions generated
- [ ] All 3 test cases pass
- [ ] Response time < 10 seconds
- [ ] Tool callable from OpenClaw agent

---

## 9. Integration with Other UC

**UC2 provides foundation for:**
- UC3 (What-If) - uses same load redistribution algorithm
- UC4 (Root Cause) - cascade history can help identify recurring patterns

**UC2 depends on:**
- UC1 (Breaker Trip) - uses same telemetry infrastructure
- Phase 2B complete (enhanced line properties)

**UC2 enhances:**
- UC5 (System Impact) - cascade analysis is key component of system-wide assessment

---

## 10. Engineering Notes

### Load Redistribution Physics

**Actual behavior (simplified):**
```
I_path = V / Z_path

Where:
- I = current (amps)
- V = voltage (constant across parallel paths)
- Z = total path impedance

Power redistribution:
P_path = V * I_path = V² / Z_path

Lower impedance → more current → more power
```

**Implementation:**
```javascript
// Conductance = 1 / Impedance
const G_path = 1 / Z_path;

// Total conductance
const G_total = sum(G_path_1 + G_path_2 + ... G_path_n);

// Fraction of load on this path
const fraction = G_path / G_total;

// Additional MW on this path
const additional_MW = failed_line_MW * fraction;
```

### Cascade Trip Probability Model

**Simplified thermal model:**
```
Trip time = f(overload_percent, ambient_temp, wind, conductor_type)

For simplicity:
- 100-110% overload: can sustain 30+ minutes → 20% trip probability
- 110-120%: can sustain 10 minutes → 50% probability
- 120-130%: can sustain 3 minutes → 80% probability
- >130%: protection relays trip immediately → 95% probability
```

### Limitations & Future Improvements

**Current limitations:**
1. Impedance values estimated (no GIS data)
2. Equal distribution within path (ignores internal topology)
3. No time-domain simulation (instantaneous redistribution)
4. No voltage stability check
5. Generation redispatch not modeled

**Potential improvements:**
1. Import actual impedance from SOURCE or GIS
2. Use real protection relay settings for trip probability
3. Add time-domain dynamics (thermal time constants)
4. Include voltage collapse detection
5. Model automatic generation control (AGC) response

---

## 11. Next Steps After Implementation

1. **Validate physics** with real grid operators
2. **Tune trip probability** thresholds based on historical data
3. **Add visualization** (cascade propagation graph)
4. **Integrate with SCADA** (real-time cascade monitoring)
5. **Machine learning** to improve trip probability model

---

**END OF SPECIFICATION**

This file contains everything needed to implement UC2 without additional questions.
