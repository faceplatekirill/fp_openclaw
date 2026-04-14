# UC3 Implementation Specification: What-If Scenario Analysis

**File Location:** `/home/node/.openclaw/workspace/extensions/grid-graph-builder/UC3-IMPLEMENTATION-SPEC.md`

**Purpose:** Complete specification for implementing UC3 - simulates topology changes before execution to predict impact

---

## 1. Requirements

### User Questions

**Type 1: Single equipment switching**
- "What if we open isolator ISO-1 at KOKSHETAU/220/L2811?"
- "What if we close circuit breaker CB-5 at BALKHASH/110/BB1?"
- "What if we open earth isolator EI-2 on transformer T1?"

**Type 2: Sequence of operations**
- "What if we transfer BB1 from CB-1 to CB-2?"
- "What if we take line L2811 out of service?"
- "What if we restore station AGADYR after blackout?"

**Type 3: Safety verification**
- "Is it safe to open ISO-3?"
- "Will opening CB-7 cause cascade?"
- "What's the impact of closing this breaker?"

### Expected Answer Components

1. **Current State:** Equipment positions BEFORE changes
2. **Predicted State:** Equipment positions AFTER changes
3. **Impact Analysis:**
   - Stations that will lose power
   - Lines that will become overloaded
   - Voltage violations
   - Protection violations (safety interlocks)
4. **Safety Assessment:**
   - Green: Safe to execute
   - Yellow: Caution (minor impact)
   - Red: Dangerous (blackout/cascade risk)
5. **Step-by-Step Plan:** Sequence of operations to execute safely
6. **Rollback Plan:** How to undo changes if needed

### Success Criteria

- ✅ Simulates topology changes WITHOUT executing them
- ✅ Detects ALL impacts (power loss + overloads + safety)
- ✅ Handles complex sequences (multi-step operations)
- ✅ Validates safety interlocks (e.g., can't open CB under load)
- ✅ Provides executable operation plan
- ✅ Response time < 5 seconds (simpler than UC2)

---

## 2. Current State Analysis

### What Exists (from UC1 + UC2)

✅ **Nodes:**
- CircuitBreaker, Isolator, EarthIsolator
- State (position: on/off/undefined)
- LineTerminal, Busbar
- Telemetry (current loading)
- Line (with capacity, impedance)

✅ **Relationships:**
- `(CB)-[:HAS_STATE]->(State)`
- `(Terminal)-[:PROTECTED_BY]->(CB)`
- `(Line)-[:CONNECTS_AT_POLE_I/J]->(Terminal)`
- `(Terminal)-[:HAS_TELEMETRY]->(Telemetry)`

✅ **Algorithms from UC1 & UC2:**
- Connectivity traversal (isolated stations)
- Load redistribution (cascade prediction)

### What's Missing for UC3

❌ **Safety Interlock Rules:**
- Can't open CB/Isolator under load (>5 MW)
- Can't close CB if busbars have voltage difference
- Must open Isolators before opening CB
- Must open Earth Isolators after opening Isolators

❌ **Topology Diff Algorithm:**
- State A (current) vs State B (after changes)
- Impact delta calculation

❌ **Operation Sequencing:**
- Automatic sequence generation for complex operations
- Validation of operation order

---

## 3. Graph Data Requirements

### Enhanced Equipment Properties

**No new properties needed!** UC1 + UC2 provide all data.

**BUT: Need to track simulated state separately from actual state:**

```javascript
// Actual state (from Ecomet)
{
  type: 'State',
  path: '/KOKSHETAU/220/L2811/connection/cb/state',
  current_value: 'on',  // From Ecomet real-time
  out_qds: 0x00
}

// Simulated state (what-if scenario)
{
  simulated_value: 'off',  // User's hypothetical change
  simulation_id: 'sim_12345'
}
```

**Implementation approach:** Keep simulated state in MEMORY (not graph), overlay during queries.

---

## 4. Safety Interlock Rules

### Rule Database

**File:** `extensions/grid-analysis-v2/src/safety/interlock-rules.ts`

```typescript
interface InterlockRule {
  id: string;
  name: string;
  equipment_type: string[];
  condition: (equipment: any, context: any) => boolean;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
}

export const INTERLOCK_RULES: InterlockRule[] = [
  // RULE 1: Can't switch equipment under load
  {
    id: 'LOAD_SWITCH_FORBIDDEN',
    name: 'Cannot switch equipment under load',
    equipment_type: ['CircuitBreaker', 'Isolator'],
    condition: (equipment, context) => {
      // Check if trying to open
      if (equipment.simulated_value === 'off' && equipment.current_value === 'on') {
        // Check current loading
        const loading = context.telemetry_loading_mw || 0;
        return loading > 5; // Threshold: 5 MW
      }
      return false;
    },
    severity: 'CRITICAL',
    message: 'Cannot open {equipment} - current loading {loading} MW exceeds safe limit (5 MW)'
  },
  
  // RULE 2: Isolator sequence (must open ISO before CB)
  {
    id: 'ISO_BEFORE_CB',
    name: 'Isolators must be opened before circuit breaker',
    equipment_type: ['Isolator'],
    condition: (equipment, context) => {
      // If trying to close isolator
      if (equipment.simulated_value === 'on' && equipment.current_value === 'off') {
        // Check if CB is still closed
        const cbState = context.circuit_breaker_state;
        return cbState === 'on';
      }
      return false;
    },
    severity: 'WARNING',
    message: 'Recommended: Open circuit breaker before closing isolators'
  },
  
  // RULE 3: Earth isolator after main isolators
  {
    id: 'EARTH_ISO_LAST',
    name: 'Earth isolators must be opened after main isolators',
    equipment_type: ['EarthIsolator'],
    condition: (equipment, context) => {
      // If trying to close earth isolator
      if (equipment.simulated_value === 'on' && equipment.current_value === 'off') {
        // Check main isolators state
        const mainIsoStates = context.main_isolator_states || [];
        return mainIsoStates.some(s => s === 'on');
      }
      return false;
    },
    severity: 'CRITICAL',
    message: 'Cannot close earth isolator while main isolators are closed - safety violation'
  },
  
  // RULE 4: No busbar voltage difference on close
  {
    id: 'VOLTAGE_SYNC_REQUIRED',
    name: 'Busbars must be synchronized before closing breaker',
    equipment_type: ['CircuitBreaker'],
    condition: (equipment, context) => {
      // If trying to close CB
      if (equipment.simulated_value === 'on' && equipment.current_value === 'off') {
        const voltage1 = context.busbar1_voltage_kv || 0;
        const voltage2 = context.busbar2_voltage_kv || 0;
        const diff = Math.abs(voltage1 - voltage2);
        return diff > 5; // Threshold: 5 kV difference
      }
      return false;
    },
    severity: 'CRITICAL',
    message: 'Cannot close breaker - busbar voltage difference {diff} kV exceeds limit (5 kV)'
  },
  
  // RULE 5: No parallel with existing connection
  {
    id: 'NO_PARALLEL_CONNECTION',
    name: 'Cannot create parallel connection',
    equipment_type: ['CircuitBreaker'],
    condition: (equipment, context) => {
      // If closing CB, check if alternative path exists
      if (equipment.simulated_value === 'on' && equipment.current_value === 'off') {
        return context.alternative_paths_count > 0;
      }
      return false;
    },
    severity: 'WARNING',
    message: 'Closing this breaker creates parallel path - verify load distribution'
  }
];
```

---

## 5. Tool Integration

### Tool Configuration

**In `openclaw.plugin.json`:**
```json
{
  "tools": [
    {
      "name": "simulate_whatif",
      "description": "Simulate grid topology changes (open/close equipment) and predict impact BEFORE executing. Returns safety assessment, impacted stations/lines, and execution plan.",
      "parameters": {
        "type": "object",
        "properties": {
          "operations": {
            "type": "array",
            "description": "List of equipment operations to simulate",
            "items": {
              "type": "object",
              "properties": {
                "equipment_path": {
                  "type": "string",
                  "description": "Full path to equipment (e.g., /KOKSHETAU/220/L2811/connection/cb)"
                },
                "action": {
                  "type": "string",
                  "enum": ["open", "close"],
                  "description": "Action to perform"
                }
              },
              "required": ["equipment_path", "action"]
            }
          },
          "check_safety": {
            "type": "boolean",
            "description": "Run safety interlock checks",
            "default": true
          },
          "check_cascade": {
            "type": "boolean",
            "description": "Run cascade failure prediction (from UC2)",
            "default": true
          }
        },
        "required": ["operations"]
      }
    }
  ]
}
```

### Tool Invocation Examples

**Example 1: Simple isolator opening**
```javascript
// User: "What if we open ISO-1 at KOKSHETAU/220/L2811?"

await tools.simulate_whatif({
  operations: [
    {
      equipment_path: "/root/FP/PROJECT/KAZ/AKMOLA/KOKSHETAU/220/L2811/connection/iso-1",
      action: "open"
    }
  ],
  check_safety: true,
  check_cascade: false
});
```

**Example 2: Line outage (complex sequence)**
```javascript
// User: "What if we take line L2811 out of service?"

await tools.simulate_whatif({
  operations: [
    {
      equipment_path: "/root/FP/PROJECT/KAZ/AKMOLA/KOKSHETAU/220/L2811/connection/iso-1",
      action: "open"
    },
    {
      equipment_path: "/root/FP/PROJECT/KAZ/AKMOLA/KOKSHETAU/220/L2811/connection/iso-2",
      action: "open"
    },
    {
      equipment_path: "/root/FP/PROJECT/KAZ/AKMOLA/KOKSHETAU/220/L2811/connection/cb",
      action: "open"
    }
  ],
  check_safety: true,
  check_cascade: true  // Check if other lines will cascade!
});
```

**Example 3: Busbar transfer**
```javascript
// User: "Transfer BB1 from CB-1 to CB-2"

await tools.simulate_whatif({
  operations: [
    {
      equipment_path: "/root/FP/PROJECT/KAZ/CENTER/BALKHASH/110/BB1/CB-1",
      action: "open"
    },
    {
      equipment_path: "/root/FP/PROJECT/KAZ/CENTER/BALKHASH/110/BB1/CB-2",
      action: "close"
    }
  ],
  check_safety: true,
  check_cascade: false
});
```

---

## 6. Complete Algorithm Implementation

### File: `extensions/grid-analysis-v2/src/operations/whatif-simulation.ts`

```typescript
import { Neo4jClient } from '../../../libs/ecomet-core/src/client/neo4j-client';
import { EcometClient } from '../../../libs/ecomet-core/src/client/ecomet-client';
import { CascadePredictionAnalyzer } from './cascade-prediction';
import { INTERLOCK_RULES, InterlockRule } from '../safety/interlock-rules';

interface Operation {
  equipment_path: string;
  action: 'open' | 'close';
}

interface WhatIfInput {
  operations: Operation[];
  check_safety?: boolean;
  check_cascade?: boolean;
}

interface InterlockViolation {
  rule_id: string;
  rule_name: string;
  severity: string;
  message: string;
  equipment_path: string;
}

interface ImpactedStation {
  station_name: string;
  voltage_level: string;
  reason: string;
  power_loss_mw: number;
}

interface OverloadedLine {
  line_name: string;
  current_loading_percent: number;
  predicted_loading_percent: number;
  overload_mw: number;
}

interface WhatIfResult {
  simulation_id: string;
  current_state: {
    equipment_states: Array<{
      path: string;
      current_value: string;
    }>;
  };
  predicted_state: {
    equipment_states: Array<{
      path: string;
      predicted_value: string;
    }>;
  };
  safety_assessment: {
    overall_status: 'SAFE' | 'CAUTION' | 'DANGEROUS';
    interlock_violations: InterlockViolation[];
    can_execute: boolean;
  };
  impact_analysis: {
    stations_losing_power: ImpactedStation[];
    lines_overloaded: OverloadedLine[];
    cascade_risk_detected: boolean;
  };
  execution_plan: {
    recommended_sequence: Array<{
      step: number;
      equipment_path: string;
      action: string;
      reason: string;
    }>;
    estimated_duration_minutes: number;
  };
  rollback_plan: {
    operations: Operation[];
    description: string;
  };
}

export class WhatIfSimulator {
  private simulationId: string;
  
  constructor(
    private neo4j: Neo4jClient,
    private ecomet: EcometClient,
    private cascadeAnalyzer: CascadePredictionAnalyzer
  ) {
    this.simulationId = `sim_${Date.now()}`;
  }

  async simulate(input: WhatIfInput): Promise<WhatIfResult> {
    console.log(`[WhatIf] Starting simulation ${this.simulationId}`);
    
    // STEP 1: Get current state of all equipment
    const currentState = await this.getCurrentState(input.operations);
    
    // STEP 2: Validate operations (can equipment be switched?)
    const equipmentValidation = await this.validateEquipment(input.operations);
    if (!equipmentValidation.valid) {
      throw new Error(`Invalid equipment: ${equipmentValidation.error}`);
    }
    
    // STEP 3: Apply simulated changes (in memory)
    const predictedState = this.applySimulatedChanges(currentState, input.operations);
    
    // STEP 4: Safety checks (interlocks)
    let interlockViolations: InterlockViolation[] = [];
    if (input.check_safety !== false) {
      interlockViolations = await this.checkInterlocks(
        input.operations,
        currentState,
        predictedState
      );
    }
    
    // STEP 5: Impact analysis (connectivity + loading)
    const impactAnalysis = await this.analyzeImpact(predictedState);
    
    // STEP 6: Cascade prediction (if requested)
    let cascadeRisk = false;
    if (input.check_cascade && impactAnalysis.lines_affected.length > 0) {
      cascadeRisk = await this.checkCascadeRisk(impactAnalysis.lines_affected);
    }
    
    // STEP 7: Generate safety assessment
    const safetyAssessment = this.assessSafety(
      interlockViolations,
      impactAnalysis,
      cascadeRisk
    );
    
    // STEP 8: Generate execution plan
    const executionPlan = this.generateExecutionPlan(
      input.operations,
      interlockViolations
    );
    
    // STEP 9: Generate rollback plan
    const rollbackPlan = this.generateRollbackPlan(input.operations);
    
    return {
      simulation_id: this.simulationId,
      current_state: {
        equipment_states: currentState.map(eq => ({
          path: eq.path,
          current_value: eq.current_value
        }))
      },
      predicted_state: {
        equipment_states: predictedState.map(eq => ({
          path: eq.path,
          predicted_value: eq.simulated_value
        }))
      },
      safety_assessment: safetyAssessment,
      impact_analysis: {
        stations_losing_power: impactAnalysis.isolated_stations,
        lines_overloaded: impactAnalysis.overloaded_lines,
        cascade_risk_detected: cascadeRisk
      },
      execution_plan: executionPlan,
      rollback_plan: rollbackPlan
    };
  }

  private async getCurrentState(operations: Operation[]) {
    const equipmentPaths = operations.map(op => op.equipment_path);
    
    const states = [];
    for (const path of equipmentPaths) {
      // Query graph for equipment
      const query = `
        MATCH (eq {path: $path})
        OPTIONAL MATCH (eq)-[:HAS_STATE]->(state:State)
        RETURN 
          eq.type as equipment_type,
          eq.path as path,
          state.path as state_path
      `;
      
      const result = await this.neo4j.run(query, { path });
      if (result.records.length === 0) {
        throw new Error(`Equipment not found: ${path}`);
      }
      
      const record = result.records[0].toObject();
      
      // Get current state value from Ecomet
      let currentValue = 'undefined';
      if (record.state_path) {
        const ecometResult = await this.ecomet.query(
          `get out_value from 'project' where .fp_path = '${record.state_path}'`
        );
        currentValue = ecometResult.result[1][0] || 'undefined';
      }
      
      states.push({
        path,
        equipment_type: record.equipment_type,
        state_path: record.state_path,
        current_value: currentValue
      });
    }
    
    return states;
  }

  private async validateEquipment(operations: Operation[]) {
    // Check all equipment exists in graph
    for (const op of operations) {
      const query = `
        MATCH (eq {path: $path})
        RETURN eq.type as type
      `;
      
      const result = await this.neo4j.run(query, { path: op.equipment_path });
      if (result.records.length === 0) {
        return {
          valid: false,
          error: `Equipment not found: ${op.equipment_path}`
        };
      }
      
      const type = result.records[0].get('type');
      if (!['CircuitBreaker', 'Isolator', 'EarthIsolator'].includes(type)) {
        return {
          valid: false,
          error: `Invalid equipment type: ${type} (must be CB/Isolator/EarthIsolator)`
        };
      }
    }
    
    return { valid: true };
  }

  private applySimulatedChanges(currentState: any[], operations: Operation[]) {
    const predictedState = JSON.parse(JSON.stringify(currentState)); // Deep copy
    
    operations.forEach(op => {
      const equipment = predictedState.find(eq => eq.path === op.equipment_path);
      if (equipment) {
        equipment.simulated_value = op.action === 'open' ? 'off' : 'on';
      }
    });
    
    return predictedState;
  }

  private async checkInterlocks(
    operations: Operation[],
    currentState: any[],
    predictedState: any[]
  ): Promise<InterlockViolation[]> {
    
    const violations: InterlockViolation[] = [];
    
    for (const op of operations) {
      const equipment = predictedState.find(eq => eq.path === op.equipment_path);
      if (!equipment) continue;
      
      // Build context for this equipment
      const context = await this.buildInterlockContext(equipment);
      
      // Check all applicable rules
      const applicableRules = INTERLOCK_RULES.filter(rule =>
        rule.equipment_type.includes(equipment.equipment_type)
      );
      
      for (const rule of applicableRules) {
        if (rule.condition(equipment, context)) {
          violations.push({
            rule_id: rule.id,
            rule_name: rule.name,
            severity: rule.severity,
            message: rule.message
              .replace('{equipment}', equipment.path)
              .replace('{loading}', context.telemetry_loading_mw?.toFixed(1) || '0')
              .replace('{diff}', context.voltage_diff?.toFixed(1) || '0'),
            equipment_path: equipment.path
          });
        }
      }
    }
    
    return violations;
  }

  private async buildInterlockContext(equipment: any) {
    const context: any = {};
    
    // Get telemetry loading (if LineTerminal or Busbar nearby)
    const loadingQuery = `
      MATCH (eq {path: $path})
      MATCH (eq)-[*0..2]-(term:LineTerminal|Busbar)
      MATCH (term)-[:HAS_TELEMETRY]->(tele:Telemetry {signal_type: 'P'})
      RETURN tele.path as telemetry_path
      LIMIT 1
    `;
    
    const loadingResult = await this.neo4j.run(loadingQuery, { path: equipment.path });
    if (loadingResult.records.length > 0) {
      const telePath = loadingResult.records[0].get('telemetry_path');
      const ecometResult = await this.ecomet.query(
        `get out_value from 'project' where .fp_path = '${telePath}'`
      );
      context.telemetry_loading_mw = Math.abs(ecometResult.result[1][0] || 0);
    }
    
    // Get circuit breaker state (for isolator rules)
    if (equipment.equipment_type === 'Isolator') {
      const cbQuery = `
        MATCH (iso {path: $path})
        MATCH (iso)-[:PART_OF*]-(connection)
        MATCH (connection)-[:HAS_EQUIPMENT]->(cb:CircuitBreaker)
        MATCH (cb)-[:HAS_STATE]->(state:State)
        RETURN state.path as state_path
      `;
      
      const cbResult = await this.neo4j.run(cbQuery, { path: equipment.path });
      if (cbResult.records.length > 0) {
        const statePath = cbResult.records[0].get('state_path');
        const ecometResult = await this.ecomet.query(
          `get out_value from 'project' where .fp_path = '${statePath}'`
        );
        context.circuit_breaker_state = ecometResult.result[1][0] || 'undefined';
      }
    }
    
    return context;
  }

  private async analyzeImpact(predictedState: any[]) {
    // STEP 1: Find isolated stations (reuse UC1 algorithm)
    const isolatedStations = await this.findIsolatedStations(predictedState);
    
    // STEP 2: Find overloaded lines (simplified - real version uses UC2)
    const overloadedLines = await this.findOverloadedLines(predictedState);
    
    return {
      isolated_stations: isolatedStations,
      overloaded_lines: overloadedLines,
      lines_affected: overloadedLines.map(l => l.line_name)
    };
  }

  private async findIsolatedStations(predictedState: any[]) {
    // Build simulated graph with equipment states
    // For simplicity: assume opening CB disconnects terminals
    
    const openEquipment = predictedState
      .filter(eq => eq.simulated_value === 'off')
      .map(eq => eq.path);
    
    // Query: find stations that lose all connection paths
    const query = `
      MATCH (station:Station)
      MATCH (station)-[:HAS_VOLTAGE_LEVEL]->(vl:VoltageLevel)
      MATCH (vl)-[:HAS_TERMINAL]->(term:LineTerminal)
      
      // Check if terminal has active connection
      WHERE NOT EXISTS {
        MATCH (term)-[:PROTECTED_BY]->(cb:CircuitBreaker)
        WHERE cb.path IN $openEquipment
      }
      
      WITH station, count(term) as active_terminals
      WHERE active_terminals = 0
      
      RETURN station.name as station_name
    `;
    
    const result = await this.neo4j.run(query, { openEquipment });
    
    return result.records.map(r => ({
      station_name: r.get('station_name'),
      voltage_level: 'ALL',
      reason: 'All line terminals disconnected',
      power_loss_mw: 0 // TODO: calculate from telemetry
    }));
  }

  private async findOverloadedLines(predictedState: any[]) {
    // Simplified: just return empty for now
    // Real version would invoke UC2 cascade prediction
    return [];
  }

  private async checkCascadeRisk(affectedLines: string[]): Promise<boolean> {
    // Use UC2 cascade analyzer
    for (const lineName of affectedLines) {
      const cascadeResult = await this.cascadeAnalyzer.predict({
        lineName,
        assumeTrip: true,
        maxCascadeDepth: 2
      });
      
      if (cascadeResult.cascade_risk_lines.length > 0) {
        return true;
      }
    }
    return false;
  }

  private assessSafety(
    violations: InterlockViolation[],
    impact: any,
    cascadeRisk: boolean
  ) {
    const criticalViolations = violations.filter(v => v.severity === 'CRITICAL');
    const hasIsolatedStations = impact.isolated_stations.length > 0;
    const hasOverloads = impact.overloaded_lines.length > 0;
    
    let status: 'SAFE' | 'CAUTION' | 'DANGEROUS';
    let canExecute = true;
    
    if (criticalViolations.length > 0 || cascadeRisk) {
      status = 'DANGEROUS';
      canExecute = false;
    } else if (hasIsolatedStations || hasOverloads || violations.length > 0) {
      status = 'CAUTION';
      canExecute = true; // Can execute but with warnings
    } else {
      status = 'SAFE';
      canExecute = true;
    }
    
    return {
      overall_status: status,
      interlock_violations: violations,
      can_execute: canExecute
    };
  }

  private async generateExecutionPlan(operations: Operation[], violations: InterlockViolation[]) {
    // Sort operations to avoid interlock violations
    // Rule: always open in sequence (ISO first, CB last)
    // Rule: always close in reverse (CB first, ISO last)
    
    // STEP 1: Fetch equipment patterns from graph
    const equipmentData = await this.getEquipmentPatterns(operations);
    
    const openOps = operations.filter(op => op.action === 'open');
    const closeOps = operations.filter(op => op.action === 'close');
    
    // Sort open operations: EarthIso → Iso → CB
    const sortedOpen = openOps.sort((a, b) => {
      const equipA = equipmentData.find(eq => eq.path === a.equipment_path);
      const equipB = equipmentData.find(eq => eq.path === b.equipment_path);
      const priorityA = this.getEquipmentPriority(equipA, 'open');
      const priorityB = this.getEquipmentPriority(equipB, 'open');
      return priorityA - priorityB;
    });
    
    // Sort close operations: CB → Iso → EarthIso
    const sortedClose = closeOps.sort((a, b) => {
      const equipA = equipmentData.find(eq => eq.path === a.equipment_path);
      const equipB = equipmentData.find(eq => eq.path === b.equipment_path);
      const priorityA = this.getEquipmentPriority(equipA, 'close');
      const priorityB = this.getEquipmentPriority(equipB, 'close');
      return priorityA - priorityB;
    });
    
    const sequence = [...sortedOpen, ...sortedClose].map((op, idx) => {
      const equipment = equipmentData.find(eq => eq.path === op.equipment_path);
      return {
        step: idx + 1,
        equipment_path: op.equipment_path,
        action: op.action,
        reason: this.getStepReason(equipment, op.action)
      };
    });
    
    return {
      recommended_sequence: sequence,
      estimated_duration_minutes: sequence.length * 2 // 2 min per operation
    };
  }

  private async getEquipmentPatterns(operations: Operation[]) {
    // Fetch .pattern for all equipment
    const equipmentData = [];
    
    for (const op of operations) {
      const query = `
        MATCH (eq {path: $path})
        RETURN eq.path as path, eq.pattern as pattern, eq.type as type
      `;
      
      const result = await this.neo4j.run(query, { path: op.equipment_path });
      if (result.records.length > 0) {
        const record = result.records[0].toObject();
        equipmentData.push({
          path: record.path,
          pattern: record.pattern,
          type: record.type
        });
      }
    }
    
    return equipmentData;
  }

  private getEquipmentPriority(equipment: any, action: 'open' | 'close'): number {
    // Use .pattern to determine equipment type (RELIABLE!)
    // Pattern examples:
    // - '/root/FP/prototypes/earth isolator/fields'
    // - '/root/FP/prototypes/isolator/fields'
    // - '/root/FP/prototypes/circuit breaker/fields'
    
    const pattern = equipment.pattern || '';
    
    if (action === 'open') {
      // Open order: EarthIso (1) → Iso (2) → CB (3)
      if (pattern.includes('/earth isolator/')) return 1;
      if (pattern.includes('/isolator/')) return 2;
      if (pattern.includes('/circuit breaker/')) return 3;
    } else {
      // Close order: CB (1) → Iso (2) → EarthIso (3)
      if (pattern.includes('/circuit breaker/')) return 1;
      if (pattern.includes('/isolator/')) return 2;
      if (pattern.includes('/earth isolator/')) return 3;
    }
    return 999; // Unknown equipment type
  }

  private getStepReason(equipment: any, action: 'open' | 'close'): string {
    const pattern = equipment?.pattern || '';
    
    if (action === 'open') {
      if (pattern.includes('/earth isolator/')) {
        return 'Open earth isolators first (grounding safety)';
      } else if (pattern.includes('/isolator/')) {
        return 'Open isolators before circuit breaker';
      } else if (pattern.includes('/circuit breaker/')) {
        return 'Open circuit breaker last (load interruption)';
      } else {
        return 'Open equipment (unknown type)';
      }
    } else {
      if (pattern.includes('/circuit breaker/')) {
        return 'Close circuit breaker first (establish connection)';
      } else if (pattern.includes('/isolator/')) {
        return 'Close isolators after circuit breaker';
      } else if (pattern.includes('/earth isolator/')) {
        return 'Remove grounding last';
      } else {
        return 'Close equipment (unknown type)';
      }
    }
  }

  private generateRollbackPlan(operations: Operation[]): {
    operations: Operation[];
    description: string;
  } {
    // Reverse all operations
    const rollbackOps = operations.map(op => ({
      equipment_path: op.equipment_path,
      action: op.action === 'open' ? 'close' as const : 'open' as const
    })).reverse();
    
    return {
      operations: rollbackOps,
      description: `Reverse all ${operations.length} operation(s) in opposite order`
    };
  }
}
```

---

## 7. Response Format Examples

### Example 1: Safe Operation

**User:** "What if we open ISO-1 at KOKSHETAU/220/L2811?"

**Response:**
```json
{
  "simulation_id": "sim_1708677123456",
  "current_state": {
    "equipment_states": [
      { "path": "/KOKSHETAU/220/L2811/connection/iso-1", "current_value": "on" }
    ]
  },
  "predicted_state": {
    "equipment_states": [
      { "path": "/KOKSHETAU/220/L2811/connection/iso-1", "predicted_value": "off" }
    ]
  },
  "safety_assessment": {
    "overall_status": "SAFE",
    "interlock_violations": [],
    "can_execute": true
  },
  "impact_analysis": {
    "stations_losing_power": [],
    "lines_overloaded": [],
    "cascade_risk_detected": false
  },
  "execution_plan": {
    "recommended_sequence": [
      {
        "step": 1,
        "equipment_path": "/KOKSHETAU/220/L2811/connection/iso-1",
        "action": "open",
        "reason": "Open isolators before circuit breaker"
      }
    ],
    "estimated_duration_minutes": 2
  },
  "rollback_plan": {
    "operations": [
      {
        "equipment_path": "/KOKSHETAU/220/L2811/connection/iso-1",
        "action": "close"
      }
    ],
    "description": "Reverse all 1 operation(s) in opposite order"
  }
}
```

**Agent interpretation:**
> ✅ **SAFE to execute**
> 
> Opening ISO-1 will have no impact on grid:
> - No stations lose power
> - No lines become overloaded
> - No safety violations
> 
> **Execution:** Single step, estimated 2 minutes
> **Rollback:** Close ISO-1 if needed

---

### Example 2: Dangerous Operation (Interlock Violation)

**User:** "What if we open CB at KOKSHETAU/220/L2811 while it's carrying 85 MW?"

**Response:**
```json
{
  "safety_assessment": {
    "overall_status": "DANGEROUS",
    "interlock_violations": [
      {
        "rule_id": "LOAD_SWITCH_FORBIDDEN",
        "rule_name": "Cannot switch equipment under load",
        "severity": "CRITICAL",
        "message": "Cannot open /KOKSHETAU/220/L2811/connection/cb - current loading 85.0 MW exceeds safe limit (5 MW)",
        "equipment_path": "/KOKSHETAU/220/L2811/connection/cb"
      }
    ],
    "can_execute": false
  },
  "impact_analysis": {
    "stations_losing_power": [
      {
        "station_name": "BALKHASH",
        "voltage_level": "220",
        "reason": "All line terminals disconnected",
        "power_loss_mw": 85
      }
    ],
    "lines_overloaded": [],
    "cascade_risk_detected": false
  }
}
```

**Agent interpretation:**
> ❌ **DANGEROUS - Cannot execute**
> 
> **Safety violations:**
> - ⛔ Cannot switch under load (85 MW exceeds 5 MW limit)
> 
> **Impact if forced:**
> - BALKHASH station loses power (85 MW)
> 
> **Recommendation:** Reduce load below 5 MW before opening CB

---

### Example 3: Complex Sequence (Line Outage)

**User:** "Take line L2811 out of service safely"

**Response:**
```json
{
  "execution_plan": {
    "recommended_sequence": [
      {
        "step": 1,
        "equipment_path": "/KOKSHETAU/220/L2811/connection/earth_iso-1",
        "action": "open",
        "reason": "Open earth isolators first (grounding safety)"
      },
      {
        "step": 2,
        "equipment_path": "/KOKSHETAU/220/L2811/connection/earth_iso-2",
        "action": "open",
        "reason": "Open earth isolators first (grounding safety)"
      },
      {
        "step": 3,
        "equipment_path": "/KOKSHETAU/220/L2811/connection/iso-1",
        "action": "open",
        "reason": "Open isolators before circuit breaker"
      },
      {
        "step": 4,
        "equipment_path": "/KOKSHETAU/220/L2811/connection/iso-2",
        "action": "open",
        "reason": "Open isolators before circuit breaker"
      },
      {
        "step": 5,
        "equipment_path": "/KOKSHETAU/220/L2811/connection/cb",
        "action": "open",
        "reason": "Open circuit breaker last (load interruption)"
      }
    ],
    "estimated_duration_minutes": 10
  }
}
```

**Agent interpretation:**
> ⚠️ **CAUTION - Review before executing**
> 
> **Sequence to take L2811 out of service:**
> 1. Open earth isolators (EI-1, EI-2) - 4 min
> 2. Open main isolators (ISO-1, ISO-2) - 4 min
> 3. Open circuit breaker (CB) - 2 min
> 
> **Total duration:** ~10 minutes
> 
> **Impact:** [impact details here]

---

## 8. Test Cases

### Test Case 1: Single Isolator Opening (SAFE)

**Input:**
```javascript
{
  operations: [
    { equipment_path: "/KOKSHETAU/220/L2811/connection/iso-1", action: "open" }
  ],
  check_safety: true,
  check_cascade: false
}
```

**Expected:**
- ✅ overall_status: SAFE
- ✅ can_execute: true
- ✅ interlock_violations: []
- ✅ stations_losing_power: []

---

### Test Case 2: CB Under Load (DANGEROUS)

**Input:**
```javascript
{
  operations: [
    { equipment_path: "/KOKSHETAU/220/L2811/connection/cb", action: "open" }
  ],
  check_safety: true
}
```

**Precondition:** L2811 carrying 85 MW

**Expected:**
- ❌ overall_status: DANGEROUS
- ❌ can_execute: false
- ❌ interlock_violations: [{ rule_id: "LOAD_SWITCH_FORBIDDEN", severity: "CRITICAL" }]
- ⚠️ impact_analysis shows station losing power

---

### Test Case 3: Complex Sequence (Line Outage)

**Input:**
```javascript
{
  operations: [
    { equipment_path: "/KOKSHETAU/220/L2811/connection/cb", action: "open" },
    { equipment_path: "/KOKSHETAU/220/L2811/connection/iso-1", action: "open" },
    { equipment_path: "/KOKSHETAU/220/L2811/connection/iso-2", action: "open" }
  ],
  check_safety: true,
  check_cascade: true
}
```

**Expected:**
- ✅ execution_plan reorders to: EarthIso → Iso → CB
- ✅ estimated_duration_minutes: 6+
- ⚠️ cascade_risk_detected: true (if alternative path overloads)

---

## 9. Integration with Other UC

### UC3 Uses Components From:

**UC1 (Breaker Trip):**
- Connectivity traversal algorithm
- Isolated station detection

**UC2 (Cascade Prediction):**
- Load redistribution algorithm
- Cascade simulation
- Risk scoring

### UC3 Provides Foundation For:

**UC4 (Root Cause):**
- Historical "what-if" replay
- "What if we hadn't opened this breaker?"

**UC5 (System Impact):**
- Multi-station scenario testing
- System-wide stability assessment

---

## 10. Validation Checklist

Before marking UC3 complete:

- [ ] Equipment state query works (current vs simulated)
- [ ] All 5 interlock rules implemented
- [ ] Interlock context building works (loading, CB state)
- [ ] Impact analysis detects isolated stations
- [ ] Impact analysis detects overloaded lines
- [ ] Cascade risk integration works (calls UC2)
- [ ] Safety assessment categorizes correctly (SAFE/CAUTION/DANGEROUS)
- [ ] Execution plan sorts operations correctly
- [ ] Rollback plan reverses operations
- [ ] All 3 test cases pass
- [ ] Response time < 5 seconds
- [ ] Tool callable from OpenClaw agent

---

## 11. Equipment Type Detection (CRITICAL!)

### ❌ WRONG Approach: Path-based detection
```javascript
// DON'T DO THIS:
if (path.includes('earth_iso')) return 'EarthIsolator';
if (path.includes('iso')) return 'Isolator';
if (path.includes('cb')) return 'CircuitBreaker';
```

**Problems:**
- Naming conventions can vary (iso vs ISO vs isolator)
- Name collisions (iso-1 matches both "iso" and "earth_iso")
- Not portable to other projects
- Ignores existing metadata

---

### ✅ CORRECT Approach: Pattern-based detection

```javascript
// Use .pattern property from graph (SOURCE metadata)
const pattern = equipment.pattern;

if (pattern.includes('/earth isolator/')) return 'EarthIsolator';
if (pattern.includes('/isolator/')) return 'Isolator';
if (pattern.includes('/circuit breaker/')) return 'CircuitBreaker';
```

**Why this works:**
- `.pattern` is canonical type identifier from SOURCE
- Stored in graph during Phase 1 import
- Universal across all projects
- Matches SOURCE file structure exactly

---

### Pattern Examples (from SOURCE)

```javascript
// Circuit Breaker
equipment.pattern = '/root/FP/prototypes/circuit breaker/fields'

// Isolator  
equipment.pattern = '/root/FP/prototypes/isolator/fields'

// Earth Isolator
equipment.pattern = '/root/FP/prototypes/earth isolator/fields'

// Telemetry
equipment.pattern = '/root/FP/prototypes/telemetry/fields'

// State
equipment.pattern = '/root/FP/prototypes/state/fields'
```

---

### Implementation Fix

**Before (WRONG):**
```typescript
private getEquipmentPriority(path: string, action: string) {
  if (path.includes('earth_iso')) return 1;  // ❌ Fragile!
}
```

**After (CORRECT):**
```typescript
private getEquipmentPriority(equipment: any, action: string) {
  const pattern = equipment.pattern || '';
  if (pattern.includes('/earth isolator/')) return 1;  // ✅ Reliable!
}
```

**Query to fetch pattern:**
```cypher
MATCH (eq {path: $equipmentPath})
RETURN eq.path, eq.pattern, eq.type
```

---

### Why .pattern is Authoritative

**SOURCE structure:**
```
/root/SOURCES/fields/prototypes/
├── circuit breaker/
│   └── fields/
│       └── .properties.json  ← defines prototype
├── isolator/
│   └── fields/
├── earth isolator/
│   └── fields/
└── telemetry/
    └── fields/
```

**Each equipment references its prototype via `.pattern`:**
```json
{
  ".name": "CB-1",
  ".pattern": "/root/FP/prototypes/circuit breaker/fields",
  ".fp_path": "/root/FP/PROJECT/KAZ/AKMOLA/KOKSHETAU/220/L2811/connection/cb"
}
```

**Graph import preserves this:**
```cypher
CREATE (cb:CircuitBreaker {
  path: '/KOKSHETAU/220/L2811/connection/cb',
  pattern: '/root/FP/prototypes/circuit breaker/fields',  // ← Canonical type
  type: 'CircuitBreaker'
})
```

---

### Universal Pattern Matching

**For any project (not just power grid):**

```typescript
function getEquipmentType(pattern: string): string {
  // Extract type from pattern path
  const match = pattern.match(/\/prototypes\/([^/]+)\//);
  if (match) {
    return match[1]; // "circuit breaker", "isolator", etc.
  }
  return 'unknown';
}

// Usage:
const type = getEquipmentType(equipment.pattern);
// → "circuit breaker"
```

**This works for ANY Ecomet project:**
- Power grid: circuit breaker, isolator, transformer
- Oil refinery: valve, pump, tank
- Water treatment: gate, filter, sensor

---

### Validation Rule

**Before using ANY equipment metadata:**

```typescript
// ❌ NEVER trust path/name for type detection
if (equipment.path.includes('cb')) { ... }

// ✅ ALWAYS use .pattern
if (equipment.pattern.includes('/circuit breaker/')) { ... }
```

**Exception:** `.pattern` itself can be used for type detection, but prefer explicit `equipment.type` if available (set during import based on pattern).

---

## 12. Future Enhancements

### Phase 1 Limitations

**Current:**
- 5 basic interlock rules (hardcoded)
- Simplified impact analysis (no voltage/stability)
- Manual operation definitions

**Future improvements:**
1. **Load actual interlock rules from Ecomet** (stored in SOURCE)
2. **Voltage stability check** (prevent voltage collapse)
3. **Transient stability** (generator synchronization)
4. **Auto-generate operation sequences** from high-level commands
   - "Take line L2811 out" → automatically generates 5-step sequence
5. **Real-time monitoring during execution**
   - Track each step, update simulation after each operation
6. **Machine learning for operation optimization**
   - Learn optimal sequences from historical operations

---

## 12. Safety Interlock Database

### Future: Load from SOURCE

**Pattern detection:**
```bash
# Interlocks stored in SOURCE
/root/SOURCES/fields/prototypes/*/interlock/*
```

**Example interlock JSON:**
```json
{
  ".name": "CB_LOAD_LIMIT",
  ".pattern": "/root/.patterns/interlock",
  "equipment_type": "CircuitBreaker",
  "condition": "P > 5",
  "severity": "CRITICAL",
  "message": "Cannot switch CB under load > 5 MW"
}
```

**Import interlocks to graph:**
```cypher
CREATE (rule:InterlockRule {
  id: 'CB_LOAD_LIMIT',
  equipment_type: 'CircuitBreaker',
  condition: 'P > 5',
  severity: 'CRITICAL'
})
```

---

## 13. Operation Templates

### High-Level Commands → Operation Sequences

**Template: "Take line out of service"**
```javascript
const OPERATION_TEMPLATES = {
  'LINE_OUTAGE': {
    description: 'Take transmission line out of service',
    generates: (linePath) => [
      { path: `${linePath}/connection/earth_iso-1`, action: 'open' },
      { path: `${linePath}/connection/earth_iso-2`, action: 'open' },
      { path: `${linePath}/connection/iso-1`, action: 'open' },
      { path: `${linePath}/connection/iso-2`, action: 'open' },
      { path: `${linePath}/connection/cb`, action: 'open' }
    ]
  },
  
  'BUSBAR_TRANSFER': {
    description: 'Transfer load from one busbar to another',
    generates: (fromBB, toBB) => [
      { path: `${toBB}/sectionalizer`, action: 'close' },  // Connect busbars
      { path: `${fromBB}/CB-1`, action: 'open' },          // Open old CB
      { path: `${toBB}/CB-2`, action: 'close' },           // Close new CB
      { path: `${toBB}/sectionalizer`, action: 'open' }    // Separate busbars
    ]
  }
};
```

**Usage:**
```javascript
// User: "Take line L2811 out of service"

const template = OPERATION_TEMPLATES['LINE_OUTAGE'];
const operations = template.generates('/KOKSHETAU/220/L2811');

await simulate_whatif({ operations, check_safety: true });
```

---

**END OF SPECIFICATION**

UC3 specification complete! Ready for implementation.
