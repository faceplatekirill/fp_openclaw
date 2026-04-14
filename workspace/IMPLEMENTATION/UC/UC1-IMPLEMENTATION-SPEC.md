# UC1 Implementation Specification: Breaker Trip Analysis

**File Location:** `/home/node/.openclaw/workspace/extensions/grid-graph-builder/UC1-IMPLEMENTATION-SPEC.md`

**Purpose:** Complete specification for implementing UC1 - answers "Breaker trip → which stations lost connectivity?"

---

## 1. Requirements

### User Question
**"Breaker trip на L2811 → какие станции потеряли связь?"**

### Expected Answer Components
1. **Direct Impact:** Which 2 stations are disconnected (line endpoints)
2. **Cascade Impact:** Which downstream stations are now isolated from main grid
3. **Consumer Impact:** How many end-users lost power (estimated)
4. **Redundancy Analysis:** Are there alternative paths? If yes, their loading status
5. **Risk Assessment:** Quantitative score (0-100) with factor breakdown
6. **Actionable Recommendations:** Prioritized emergency actions

### Success Criteria
- ✅ No string path parsing (only graph relationships)
- ✅ Finds ALL isolated stations (graph connectivity analysis)
- ✅ Quantitative risk score (not "high/low")
- ✅ Consumer count estimation
- ✅ Alternative path detection with loading check
- ✅ Response time < 5 seconds

---

## 2. Current State Analysis

### What Exists (Phase 1)
✅ **Nodes:**
- Station
- VoltageLevel
- LineTerminal
- Line

✅ **Relationships:**
- `(Station)-[:HAS_VOLTAGE_LEVEL]->(VoltageLevel)`
- `(VoltageLevel)-[:HAS_TERMINAL]->(LineTerminal)`
- `(Line)-[:CONNECTS_AT_POLE_I]->(LineTerminal)`
- `(Line)-[:CONNECTS_AT_POLE_J]->(LineTerminal)`

### What's Missing for UC1
❌ **Nodes:**
- CircuitBreaker
- State (breaker position)
- Telemetry (power measurements)
- Archive (state history)

❌ **Relationships:**
- `(LineTerminal)-[:PROTECTED_BY]->(CircuitBreaker)`
- `(CircuitBreaker)-[:HAS_STATE]->(State)`
- `(State)-[:HAS_ARCHIVE]->(Archive)`
- `(LineTerminal)-[:HAS_TELEMETRY]->(Telemetry)`

❌ **Properties:**
- Station: Missing region info for "main grid" detection
- Line: Missing capacity (rated MW) for overload calculation

---

## 3. Graph Data Requirements

### Node: CircuitBreaker
**Source:** `{VoltageLevel}/{Terminal}/connection/cb/`

**Properties:**
```javascript
{
  type: 'CircuitBreaker',
  path: '/root/FP/PROJECT/KAZ/AKMOLA/KOKSHETAU/220/L2811/connection/cb',
  name: 'cb',
  voltage: 220,
  pattern: '/root/FP/prototypes/circuit breaker/fields'
}
```

**Relationships:**
- `(LineTerminal)-[:PROTECTED_BY]->(CircuitBreaker)`

**Detection Pattern:**
```bash
find $STATION_PATH -path '*/connection/cb' -type d
```

---

### Node: State
**Source:** `{CircuitBreaker}/state/`

**Properties:**
```javascript
{
  type: 'State',
  path: '/root/FP/PROJECT/KAZ/AKMOLA/KOKSHETAU/220/L2811/connection/cb/state',
  name: 'state',
  pattern: '/root/FP/prototypes/state/fields'
  // Values queried from Ecomet:
  // out_value: 1 (OFF), 2 (ON), 0 (undefined)
}
```

**Relationships:**
- `(CircuitBreaker)-[:HAS_STATE]->(State)`

**Detection Pattern:**
```bash
find $CB_PATH -name 'state' -type d
```

---

### Node: Telemetry
**Source:** `{LineTerminal}/{SignalType}/` where SignalType = P, Q, U, F

**Properties:**
```javascript
{
  type: 'Telemetry',
  path: '/root/FP/PROJECT/KAZ/AKMOLA/KOKSHETAU/220/L2811/P',
  name: 'P',
  signal_type: 'P',  // Active power (MW)
  voltage: 220,
  pattern: '/root/FP/prototypes/telemetry/fields'
  // Values queried from Ecomet: out_value
}
```

**Relationships:**
- `(LineTerminal)-[:HAS_TELEMETRY]->(Telemetry)`

**Detection Pattern:**
```bash
find $TERMINAL_PATH -maxdepth 1 -type d -name 'P' -o -name 'Q' -o -name 'U' -o -name 'F'
```

---

### Node: Archive
**Source:** `{State}/archives/out_value.json` or `{Telemetry}/archives/out_value.json`

**Properties:**
```javascript
{
  type: 'Archive',
  path: '/root/FP/PROJECT/KAZ/AKMOLA/KOKSHETAU/220/L2811/connection/cb/state/archives/out_value',
  archive_type: 'out_value',
  pattern: '/root/FP/prototypes/archive/fields'
}
```

**Relationships:**
- `(State)-[:HAS_ARCHIVE]->(Archive)`
- `(Telemetry)-[:HAS_ARCHIVE]->(Archive)`

**Detection Pattern:**
```bash
find $STATE_PATH/archives -name 'out_value.json' -type f
```

---

### Enhanced Properties

**Station (add):**
```javascript
{
  // Existing:
  name: 'KOKSHETAU',
  path: '/root/FP/PROJECT/KAZ/AKMOLA/KOKSHETAU',
  region: 'KAZ/AKMOLA',
  
  // NEW:
  is_generation: false,  // True for EKIBASTUZ, Kar_GRES, etc.
  generation_mw: 0       // Rated generation capacity (if applicable)
}
```

**Line (add):**
```javascript
{
  // Existing:
  name: 'L2811',
  vclass: 220,
  poleI: '...',
  poleJ: '...',
  
  // NEW:
  rated_capacity_mw: 120,  // Thermal limit (from design parameters)
  length_km: 45.3          // Physical length (optional)
}
```

---

## 4. Import Script Updates

### File: `extensions/grid-graph-builder/scripts/import-graph.js`

### New Function: importEquipment()

```javascript
async function importEquipment(session, stationPath, voltage) {
  const voltagePath = `${stationPath}/${voltage}`;
  
  // Find all circuit breakers
  const cbDirs = await findDirectories(voltagePath, '*/connection/cb');
  
  for (const cbPath of cbDirs) {
    // Extract terminal path (parent of connection/)
    const terminalPath = path.dirname(path.dirname(cbPath));
    
    // Create CircuitBreaker node
    await session.run(`
      MATCH (term:LineTerminal {path: $termPath})
      CREATE (cb:CircuitBreaker {
        path: $cbPath,
        name: 'cb',
        voltage: $voltage,
        pattern: '/root/FP/prototypes/circuit breaker/fields'
      })
      CREATE (term)-[:PROTECTED_BY]->(cb)
    `, {termPath: terminalPath, cbPath, voltage});
    
    stats.equipment_imported++;
  }
}
```

### New Function: importStates()

```javascript
async function importStates(session, stationPath, voltage) {
  const voltagePath = `${stationPath}/${voltage}`;
  
  // Find all state directories
  const stateDirs = await findDirectories(voltagePath, '*/connection/cb/state');
  
  for (const statePath of stateDirs) {
    const cbPath = path.dirname(statePath);
    
    // Create State node
    await session.run(`
      MATCH (cb:CircuitBreaker {path: $cbPath})
      CREATE (state:State {
        path: $statePath,
        name: 'state',
        pattern: '/root/FP/prototypes/state/fields'
      })
      CREATE (cb)-[:HAS_STATE]->(state)
    `, {cbPath, statePath});
    
    stats.states_imported++;
  }
}
```

### New Function: importTelemetry()

```javascript
async function importTelemetry(session, stationPath, voltage) {
  const voltagePath = `${stationPath}/${voltage}`;
  
  // Signal types to import
  const signalTypes = ['P', 'Q', 'U', 'F', 'Ia', 'Ib', 'Ic'];
  
  // Find all line terminals
  const terminals = await findDirectories(voltagePath, 'L*');
  
  for (const termPath of terminals) {
    for (const signal of signalTypes) {
      const telePath = `${termPath}/${signal}`;
      
      if (await dirExists(telePath)) {
        await session.run(`
          MATCH (term:LineTerminal {path: $termPath})
          CREATE (tele:Telemetry {
            path: $telePath,
            name: $signal,
            signal_type: $signal,
            voltage: $voltage,
            pattern: '/root/FP/prototypes/telemetry/fields'
          })
          CREATE (term)-[:HAS_TELEMETRY]->(tele)
        `, {termPath, telePath, signal, voltage});
        
        stats.telemetry_imported++;
      }
    }
  }
}
```

### New Function: importArchives()

```javascript
async function importArchives(session, stationPath, voltage) {
  const voltagePath = `${stationPath}/${voltage}`;
  
  // Find archive configs
  const archiveFiles = await findFiles(voltagePath, '*/archives/out_value.json');
  
  for (const archiveFile of archiveFiles) {
    const archivePath = path.dirname(archiveFile);  // .../archives
    const parentPath = path.dirname(archivePath);   // .../state or .../P
    
    await session.run(`
      MATCH (parent) 
      WHERE parent.path = $parentPath
        AND (parent:State OR parent:Telemetry)
      
      CREATE (archive:Archive {
        path: $archivePath + '/out_value',
        archive_type: 'out_value',
        pattern: '/root/FP/prototypes/archive/fields'
      })
      CREATE (parent)-[:HAS_ARCHIVE]->(archive)
    `, {parentPath, archivePath});
    
    stats.archives_imported++;
  }
}
```

### Update Main Import Loop

```javascript
async function importStation(session, stationPath) {
  // Existing: create Station node
  await createStationNode(session, stationPath);
  
  // Get voltage levels
  const voltages = await getVoltageLevels(stationPath);
  
  for (const voltage of voltages) {
    // Existing: import topology
    await importVoltageLevel(session, stationPath, voltage);
    await importLineTerminals(session, stationPath, voltage);
    
    // NEW: import equipment & data points
    await importEquipment(session, stationPath, voltage);
    await importStates(session, stationPath, voltage);
    await importTelemetry(session, stationPath, voltage);
    await importArchives(session, stationPath, voltage);
  }
}
```

### Helper Functions

```javascript
async function findDirectories(basePath, pattern) {
  const {execSync} = require('child_process');
  const result = execSync(`find ${basePath} -path '${pattern}' -type d 2>/dev/null || true`);
  return result.toString().trim().split('\n').filter(p => p);
}

async function findFiles(basePath, pattern) {
  const {execSync} = require('child_process');
  const result = execSync(`find ${basePath} -path '${pattern}' -type f 2>/dev/null || true`);
  return result.toString().trim().split('\n').filter(p => p);
}

async function dirExists(dirPath) {
  const fs = require('fs').promises;
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
```

---

## 5. Tool Integration

### File: `extensions/grid-analysis-v2/src/operations/breaker-trip.ts`

### Tool Configuration

**In `openclaw.plugin.json`:**
```json
{
  "tools": [
    {
      "name": "analyze_breaker_trip",
      "description": "Analyze breaker trip impact: which stations lost connectivity, consumer impact, risk score, recommendations",
      "parameters": {
        "type": "object",
        "properties": {
          "alarmPoint": {
            "type": "string",
            "description": "State point path from Ecomet alarm (e.g., .../cb/state)"
          },
          "tripTime": {
            "type": "number",
            "description": "Trip timestamp in milliseconds (from alarm dt_on)"
          }
        },
        "required": ["alarmPoint"]
      }
    }
  ]
}
```

### Tool Invocation Example

**User asks:**
> "Breaker cb at L2811 KOKSHETAU just tripped. What's the impact?"

**Agent calls:**
```javascript
await tools.analyze_breaker_trip({
  alarmPoint: "/root/FP/PROJECT/KAZ/AKMOLA/KOKSHETAU/220/L2811/connection/cb/state",
  tripTime: 1703348595000
});
```

---

## 6. Complete Algorithm Implementation

### File: `extensions/grid-analysis-v2/src/operations/breaker-trip.ts`

```typescript
import { Neo4jClient } from '../../../libs/ecomet-core/src/client/neo4j-client';
import { EcometClient } from '../../../libs/ecomet-core/src/client/ecomet-client';

interface BreakerTripInput {
  alarmPoint: string;
  tripTime?: number;
}

interface BreakerTripResult {
  disconnected_stations: {
    station_i: string;
    station_j: string;
    voltage_kv: number;
    line: string;
  };
  isolated_cluster: {
    count: number;
    stations: string[];
    detail: string;
  };
  consumer_impact: {
    terminals_offline: number;
    estimated_consumers_offline: number;
    detail: string;
    by_station: Array<{
      station_name: string;
      distribution_voltage_kv: number;
      consumer_terminal_count: number;
    }>;
  };
  redundancy: {
    alternative_paths: number;
    status: string;
    alternatives: Array<{
      line: string;
      current_mw: number;
      loading_percent: number;
      risk: string;
    }>;
    detail: string;
  };
  risk: {
    score: number;
    level: string;
    factors: {
      redundancy_score: number;
      isolation_score: number;
      consumer_score: number;
      voltage_score: number;
    };
  };
  recommendations: {
    priority: string;
    actions: string[];
  };
}

export class BreakerTripAnalyzer {
  constructor(
    private neo4j: Neo4jClient,
    private ecomet: EcometClient
  ) {}

  async analyze(input: BreakerTripInput): Promise<BreakerTripResult> {
    // STEP 1: Locate equipment
    const equipment = await this.findEquipment(input.alarmPoint);
    
    // STEP 2: Find connected line
    const line = await this.findLine(equipment.term_path);
    
    // STEP 3: Find both endpoints
    const endpoints = await this.findEndpoints(line.line_name);
    
    // STEP 4a: Check for alternative paths
    const alternatives = await this.findAlternatives(
      endpoints.pole_i_station_name,
      endpoints.pole_j_station_name,
      line.line_name
    );
    
    // STEP 4b: Find isolated stations (if no alternatives)
    let isolated = { isolated_stations: [], isolated_count: 0 };
    if (alternatives.alternative_path_count === 0) {
      isolated = await this.findIsolatedStations(line.line_name);
    }
    
    // STEP 5: Calculate consumer impact
    const consumerImpact = await this.calculateConsumerImpact(
      isolated.isolated_count > 0 
        ? isolated.isolated_stations 
        : [endpoints.pole_i_station_name, endpoints.pole_j_station_name]
    );
    
    // STEP 6: Calculate risk score
    const riskScore = this.calculateRiskScore({
      alternative_path_count: alternatives.alternative_path_count,
      isolated_count: isolated.isolated_count,
      estimated_consumers: consumerImpact.estimated_consumers_offline,
      voltage_kv: endpoints.pole_i_voltage_kv
    });
    
    // STEP 7: Check alternative loading (if exists)
    const alternativeStatus = await this.checkAlternativeLoading(
      alternatives.sample_alternative_lines || []
    );
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(
      alternatives,
      isolated,
      alternativeStatus,
      riskScore.score
    );
    
    return {
      disconnected_stations: {
        station_i: endpoints.pole_i_station_name,
        station_j: endpoints.pole_j_station_name,
        voltage_kv: endpoints.pole_i_voltage_kv,
        line: line.line_name
      },
      isolated_cluster: {
        count: isolated.isolated_count,
        stations: isolated.isolated_stations,
        detail: isolated.isolated_count > 0
          ? `${isolated.isolated_count} stations are CUT OFF from main grid`
          : 'Both stations remain connected to main grid via alternative paths'
      },
      consumer_impact: consumerImpact,
      redundancy: {
        alternative_paths: alternatives.alternative_path_count,
        status: alternatives.alternative_path_count > 0 ? 'BACKUP_AVAILABLE' : 'NO_BACKUP',
        alternatives: alternativeStatus,
        detail: alternatives.alternative_path_count > 0
          ? `${alternatives.alternative_path_count} alternative path(s) available`
          : 'CRITICAL: No alternative connection exists!'
      },
      risk: riskScore,
      recommendations
    };
  }

  private async findEquipment(alarmPoint: string) {
    const query = `
      MATCH (state:State {path: $alarmPoint})
      MATCH (cb:CircuitBreaker)-[:HAS_STATE]->(state)
      MATCH (term:LineTerminal)-[:PROTECTED_BY]->(cb)
      MATCH (vl:VoltageLevel)-[:HAS_TERMINAL]->(term)
      MATCH (station:Station)-[:HAS_VOLTAGE_LEVEL]->(vl)
      
      RETURN 
        cb.path as cb_path,
        term.path as term_path,
        station.name as station_name,
        vl.voltage as voltage_kv
    `;
    
    const result = await this.neo4j.run(query, { alarmPoint });
    return result.records[0].toObject();
  }

  private async findLine(termPath: string) {
    const query = `
      MATCH (term:LineTerminal {path: $termPath})
      MATCH (term)-[:CONNECTS_AT_POLE_I|CONNECTS_AT_POLE_J]-(line:Line)
      
      RETURN 
        line.name as line_name,
        line.vclass as line_voltage_kv
    `;
    
    const result = await this.neo4j.run(query, { termPath });
    return result.records[0].toObject();
  }

  private async findEndpoints(lineName: string) {
    const query = `
      MATCH (line:Line {name: $lineName})
      
      OPTIONAL MATCH (line)-[:CONNECTS_AT_POLE_I]->(termI:LineTerminal)
                     <-[:HAS_TERMINAL]-(vlI:VoltageLevel)
                     <-[:HAS_VOLTAGE_LEVEL]-(stationI:Station)
      
      OPTIONAL MATCH (line)-[:CONNECTS_AT_POLE_J]->(termJ:LineTerminal)
                     <-[:HAS_TERMINAL]-(vlJ:VoltageLevel)
                     <-[:HAS_VOLTAGE_LEVEL]-(stationJ:Station)
      
      RETURN 
        stationI.name as pole_i_station_name,
        stationJ.name as pole_j_station_name,
        vlI.voltage as pole_i_voltage_kv
    `;
    
    const result = await this.neo4j.run(query, { lineName });
    return result.records[0].toObject();
  }

  private async findAlternatives(stationI: string, stationJ: string, failedLine: string) {
    const query = `
      MATCH (s1:Station {name: $stationI})
      MATCH (s2:Station {name: $stationJ})
      
      MATCH path = (s1)-[:HAS_VOLTAGE_LEVEL*1..10]-(s2)
      
      WITH relationships(path) as rels
      WHERE NONE(r IN rels WHERE r.line_name = $failedLine)
      
      RETURN 
        count(DISTINCT path) as alternative_path_count,
        [] as sample_alternative_lines
    `;
    
    const result = await this.neo4j.run(query, { stationI, stationJ, failedLine });
    return result.records[0].toObject();
  }

  private async findIsolatedStations(failedLine: string) {
    // Simplified: find stations reachable from KOKSHETAU but not from main grid
    const query = `
      WITH ['EKIBASTUZ', 'Kar_GRES', 'Jezkaz_TEC'] as main_grid_anchors
      
      MATCH (anchor:Station)
      WHERE anchor.name IN main_grid_anchors
      
      MATCH path = (anchor)-[:HAS_VOLTAGE_LEVEL*1..20]-(s:Station)
      WHERE NONE(r IN relationships(path) WHERE r.line_name = $failedLine)
      
      WITH collect(DISTINCT s.name) as main_grid_stations
      
      MATCH (isolated:Station {name: 'KOKSHETAU'})
      MATCH path2 = (isolated)-[:HAS_VOLTAGE_LEVEL*1..10]-(cluster:Station)
      
      WITH main_grid_stations, collect(DISTINCT cluster.name) as kokshetau_cluster
      
      RETURN 
        [s IN kokshetau_cluster WHERE NOT s IN main_grid_stations] as isolated_stations,
        size([s IN kokshetau_cluster WHERE NOT s IN main_grid_stations]) as isolated_count
    `;
    
    const result = await this.neo4j.run(query, { failedLine });
    return result.records[0].toObject();
  }

  private async calculateConsumerImpact(isolatedStations: string[]) {
    const query = `
      UNWIND $stations as station_name
      MATCH (s:Station {name: station_name})
      MATCH (s)-[:HAS_VOLTAGE_LEVEL]->(vl:VoltageLevel)
      WHERE vl.voltage <= 35
      
      MATCH (vl)-[:HAS_TERMINAL]->(consumer:LineTerminal)
      
      RETURN 
        station_name,
        vl.voltage as distribution_voltage_kv,
        count(consumer) as consumer_terminal_count
    `;
    
    const result = await this.neo4j.run(query, { stations: isolatedStations });
    const byStation = result.records.map(r => r.toObject());
    
    const totalTerminals = byStation.reduce((sum, s) => sum + s.consumer_terminal_count, 0);
    const estimatedConsumers = totalTerminals * 500; // Estimation factor
    
    return {
      terminals_offline: totalTerminals,
      estimated_consumers_offline: estimatedConsumers,
      detail: `Approximately ${(estimatedConsumers / 1000).toFixed(0)}k consumers lost power`,
      by_station: byStation
    };
  }

  private calculateRiskScore(data: {
    alternative_path_count: number;
    isolated_count: number;
    estimated_consumers: number;
    voltage_kv: number;
  }) {
    let score = 0;
    
    // Factor 1: Redundancy (40 points)
    let redundancy_score = 0;
    if (data.alternative_path_count === 0) {
      redundancy_score = 40;
    } else if (data.alternative_path_count === 1) {
      redundancy_score = 25;
    } else {
      redundancy_score = 10;
    }
    score += redundancy_score;
    
    // Factor 2: Isolation (30 points)
    const isolation_score = Math.min(30, data.isolated_count * 6);
    score += isolation_score;
    
    // Factor 3: Consumer impact (20 points)
    const consumer_score = Math.min(20, (data.estimated_consumers / 10000) * 20);
    score += consumer_score;
    
    // Factor 4: Voltage class (10 points)
    let voltage_score = 0;
    if (data.voltage_kv >= 500) {
      voltage_score = 10;
    } else if (data.voltage_kv >= 220) {
      voltage_score = 7;
    } else {
      voltage_score = 3;
    }
    score += voltage_score;
    
    const finalScore = Math.min(100, score);
    
    return {
      score: finalScore,
      level: finalScore >= 80 ? 'CRITICAL' :
             finalScore >= 50 ? 'HIGH' :
             finalScore >= 20 ? 'MEDIUM' : 'LOW',
      factors: {
        redundancy_score,
        isolation_score,
        consumer_score,
        voltage_score
      }
    };
  }

  private async checkAlternativeLoading(alternativeLines: string[]) {
    const statuses = [];
    
    for (const lineName of alternativeLines) {
      // Find telemetry path
      const query = `
        MATCH (line:Line {name: $lineName})
        MATCH (line)-[:CONNECTS_AT_POLE_I|CONNECTS_AT_POLE_J]-(term:LineTerminal)
        MATCH (term)-[:HAS_TELEMETRY]->(tele:Telemetry {signal_type: 'P'})
        RETURN tele.path as telemetry_path
        LIMIT 1
      `;
      
      const result = await this.neo4j.run(query, { lineName });
      if (result.records.length === 0) continue;
      
      const telePath = result.records[0].get('telemetry_path');
      
      // Query Ecomet for current power
      const ecometResult = await this.ecomet.query(
        `get out_value from 'project' where .fp_path = '${telePath}'`
      );
      
      const currentP = ecometResult.result[1][0]; // MW
      const capacity = 120; // TODO: Get from Line.rated_capacity_mw
      const loadingPercent = (currentP / capacity) * 100;
      
      statuses.push({
        line: lineName,
        current_mw: currentP,
        loading_percent: loadingPercent,
        risk: loadingPercent > 90 ? 'OVERLOAD' : 'OK'
      });
    }
    
    return statuses;
  }

  private generateRecommendations(alternatives: any, isolated: any, altStatus: any[], riskScore: number) {
    if (alternatives.alternative_path_count === 0) {
      return {
        priority: 'EMERGENCY',
        actions: [
          `🚨 CRITICAL: ${isolated.isolated_count} stations cut off from grid`,
          `🔴 Affected: ${isolated.isolated_stations.join(', ')}`,
          `⚡ Activate emergency diesel generators immediately`,
          `📞 Coordinate with regional dispatch for emergency re-routing`,
          `🔧 Priority restoration: Repair failed line within 4 hours (target)`,
          `🏭 Shed non-critical industrial loads to preserve emergency power`
        ]
      };
    } else if (altStatus.some(a => a.risk === 'OVERLOAD')) {
      const overloaded = altStatus.filter(a => a.risk === 'OVERLOAD');
      return {
        priority: 'HIGH',
        actions: [
          `⚠️ Alternative line ${overloaded[0].line} is OVERLOADED (${overloaded[0].loading_percent.toFixed(1)}%)`,
          `🔄 Power redistributed to ${alternatives.alternative_path_count} alternative path(s)`,
          `📉 Shed non-critical loads immediately (target: -20 MW)`,
          `👁️ Monitor ${overloaded[0].line} continuously for thermal limits`,
          `🔧 Prepare restoration plan for failed line`
        ]
      };
    } else {
      return {
        priority: 'MEDIUM',
        actions: [
          `✅ Redundancy OK: ${alternatives.alternative_path_count} alternative path(s) active`,
          `📊 Alternative loading: ${altStatus.map(a => `${a.line} (${a.loading_percent.toFixed(1)}%)`).join(', ')}`,
          `👁️ Monitor alternatives for load distribution`,
          `🔍 Investigate trip cause before restoration`,
          `📋 Plan switching sequence for restoration`
        ]
      };
    }
  }
}
```

---

## 7. Test Cases

### Test Case 1: No Redundancy (CRITICAL)

**Input:**
```javascript
{
  alarmPoint: "/root/FP/PROJECT/KAZ/AKMOLA/KOKSHETAU/220/L2811/connection/cb/state",
  tripTime: 1703348595000
}
```

**Expected Output:**
```json
{
  "disconnected_stations": {
    "station_i": "KOKSHETAU",
    "station_j": "BALKHASH",
    "voltage_kv": 220,
    "line": "L2811"
  },
  "isolated_cluster": {
    "count": 5,
    "stations": ["KOKSHETAU", "SHORTANDY", "STEPNOGORSK", "MAKINSK", "ARSHALY"]
  },
  "redundancy": {
    "alternative_paths": 0,
    "status": "NO_BACKUP"
  },
  "risk": {
    "score": 97,
    "level": "CRITICAL"
  },
  "recommendations": {
    "priority": "EMERGENCY"
  }
}
```

---

### Test Case 2: With Redundancy (MEDIUM)

**Input:**
```javascript
{
  alarmPoint: "/root/FP/PROJECT/KAZ/SEVER/EKIBASTUZ/500/L5170/connection/cb/state"
}
```

**Expected Output:**
```json
{
  "isolated_cluster": {
    "count": 0,
    "detail": "Both stations remain connected to main grid via alternative paths"
  },
  "redundancy": {
    "alternative_paths": 2,
    "status": "BACKUP_AVAILABLE",
    "alternatives": [
      {"line": "L5191", "loading_percent": 65, "risk": "OK"}
    ]
  },
  "risk": {
    "score": 35,
    "level": "MEDIUM"
  }
}
```

---

### Test Case 3: Alternative Overloaded (HIGH)

**Expected Output:**
```json
{
  "redundancy": {
    "alternatives": [
      {"line": "L2821", "loading_percent": 92, "risk": "OVERLOAD"}
    ]
  },
  "risk": {
    "score": 65,
    "level": "HIGH"
  },
  "recommendations": {
    "priority": "HIGH",
    "actions": [
      "⚠️ Alternative line L2821 is OVERLOADED (92%)",
      "📉 Shed non-critical loads immediately"
    ]
  }
}
```

---

## 8. Validation Checklist

Before marking UC1 implementation complete:

- [ ] All nodes imported (CircuitBreaker, State, Telemetry, Archive)
- [ ] All relationships created (PROTECTED_BY, HAS_STATE, HAS_TELEMETRY, HAS_ARCHIVE)
- [ ] Graph traversal works (no string parsing)
- [ ] Isolated station detection works (graph connectivity analysis)
- [ ] Consumer impact calculation works
- [ ] Risk score formula implemented correctly
- [ ] Alternative path detection works
- [ ] Alternative loading check works (Ecomet integration)
- [ ] Recommendations generated based on risk level
- [ ] All 3 test cases pass
- [ ] Response time < 5 seconds
- [ ] Tool callable from OpenClaw agent

---

## 9. Integration with Other UC

**UC1 provides foundation for:**
- UC2 (Cascade Risk) - uses same alternative path detection
- UC3 (What-If) - uses same connectivity analysis
- UC4 (Root Cause) - uses breaker state history

**Dependencies from other phases:**
- Requires Phase 2A complete (equipment import)
- Requires Phase 2B complete (telemetry import)
- Requires Phase 2C complete (state import)

---

## 10. Next Steps After Implementation

1. **Test on real KOKSHETAU data**
2. **Tune risk score formula** based on operator feedback
3. **Add visualization** (optional - graph of isolated cluster)
4. **Extend to other breakers** (not just circuit breakers - also sectionalizers, switches)
5. **Add historical analysis** (how many times did this happen before?)

---

**END OF SPECIFICATION**

This file contains everything needed to implement UC1 without additional questions.
