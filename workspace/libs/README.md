# Universal Libraries

**Purpose:** Reusable abstractions for ANY project using Ecomet/Neo4j/SCADA

---

## Structure

```
libs/
├── ecomet-core/           Universal Ecomet client + patterns
├── neo4j-core/            Universal Neo4j client
└── scada-validation/      Universal SCADA validation (QDS, etc.)
```

---

## 1. @workspace/ecomet-core

**Universal Ecomet client and pattern handlers**

### What's Inside

```typescript
import { 
  EcometClient,        // Multi-host failover, auto-reconnect
  AlarmHandler,        // .patterns/alarm (universal)
  ToolError            // Standardized error handling
} from '@workspace/ecomet-core';
```

### Example

```typescript
const ecomet = new EcometClient({
  hosts: ['10.210.2.20:9000'],
  login: 'ai_assistant',
  password: 'ai_assistant'
}, logger);

await ecomet.connect();

// Universal alarm handling (.patterns/alarm)
const alarms = new AlarmHandler(ecomet);
const active = await alarms.getActive({ station: 'STATION-1' });
```

### Why Universal?

- ✅ `.patterns/alarm` - unchangeable across ALL Ecomet projects
- ✅ `.patterns/archive` - unchangeable across ALL Ecomet projects
- ✅ Ecomet QL syntax - universal
- ✅ Connection patterns - universal

**Reusable for:** Power grid, oil refining, water treatment, manufacturing - ANY Ecomet project

---

## 2. @workspace/neo4j-core

**Universal Neo4j client**

### What's Inside

```typescript
import { Neo4jClient } from '@workspace/neo4j-core';
```

### Example

```typescript
const neo4j = new Neo4jClient({
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'neo4jneo4j'
}, logger);

const results = await neo4j.searchPath('AKMOLA');
const node = await neo4j.describe('/path/to/node');
const children = await neo4j.getChildren('/path/to/parent');
```

### Why Universal?

- ✅ Neo4j driver patterns - universal
- ✅ Cypher queries - universal
- ✅ Graph operations - universal

**Reusable for:** ANY project using Neo4j for knowledge graphs

---

## 3. @workspace/scada-validation

**Universal SCADA/EMS validation**

### What's Inside

```typescript
import { QDSValidator } from '@workspace/scada-validation';
```

### Example

```typescript
const validator = new QDSValidator();

// Validate QDS code (IEC 60870-5-101)
const qds = validator.validate(0);
console.log(qds.valid);    // true
console.log(qds.meaning);  // "Valid data"

// Check timestamp freshness
const ts = validator.checkTimestamp(Date.now() - 10000);
console.log(ts.fresh); // true

// Validate complete telemetry point
const validation = validator.validateTelemetry(
  '/path', 123.45, 0, Date.now()
);
console.log(validation.usable); // true
```

### Why Universal?

- ✅ IEC 60870-5-101 standard - universal across all SCADA/EMS
- ✅ QDS codes - universal
- ✅ Timestamp validation - universal

**Reusable for:** ANY SCADA/EMS system following IEC standards

---

## NPM Workspace

These libraries are managed as npm workspace packages:

```json
// workspace/package.json
{
  "workspaces": [
    "libs/*",
    "grid-utils"
  ]
}
```

**Import in projects:**

```typescript
// In grid-utils/ or any other workspace package
import { EcometClient } from '@workspace/ecomet-core';
import { Neo4jClient } from '@workspace/neo4j-core';
import { QDSValidator } from '@workspace/scada-validation';
```

---

## Domain vs Universal

### ✅ Universal (belongs in libs/)

- Connection clients (Ecomet, Neo4j, InfluxDB)
- `.patterns/` handlers (alarm, archive - unchangeable)
- Standard field parsers (out_value, out_qds, out_ts)
- IEC standard validators (QDS codes)
- Generic utilities (error handling, logging)

### ❌ Domain-specific (belongs in project folders)

**Power Grid (grid-utils/):**
- Voltage classes (220, 110, 35 kV)
- Equipment types (line_terminal, transformer, busbar)
- Signal types organization (P, Q, U, I, F)
- `prototypes/` queries (changeable)
- Business rules (cascade detection, load flow)

**Oil Refining (hypothetical oil-utils/):**
- Pressure classes
- Equipment types (pipeline, valve, tank)
- Signal types (temperature, pressure, flow)
- Different prototypes
- Business rules (leak detection, flow optimization)

---

## Future Projects

When starting a new project (e.g., oil refining SCADA):

1. ✅ **Reuse libs/** - no changes needed
2. 📦 **Create domain package** - `oil-utils/` with domain logic
3. 🔧 **Import libs** - `import { EcometClient } from '@workspace/ecomet-core'`

**Example:**

```typescript
// oil-utils/collectors/pipeline-collector.ts
import { EcometClient } from '@workspace/ecomet-core';
import { QDSValidator } from '@workspace/scada-validation';

export class PipelineCollector {
  constructor(
    private ecomet: EcometClient,
    private validator: QDSValidator
  ) {}
  
  async collectPressure(pipeline: string) {
    // Oil refining domain logic using universal libs
  }
}
```

---

## Installation

```bash
cd /home/node/.openclaw/workspace

# Install all workspace packages
npm install

# Libs are automatically linked via npm workspace
```

---

**Version:** 1.0.0  
**Created:** 2026-02-22  
**Status:** Production-ready universal abstractions
