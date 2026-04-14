# @workspace/ecomet-core

**Universal Ecomet client and pattern handlers**  
Reusable across ALL Ecomet-based projects (power grid, oil refining, water treatment, etc.)

## Installation

```bash
cd /home/node/.openclaw/workspace
npm install
```

## Features

✅ **Multi-host failover** - Automatic retry across configured hosts  
✅ **Auto-reconnection** - Handles connection loss gracefully  
✅ **Type-safe** - Full TypeScript support with type definitions  
✅ **Universal patterns** - `.patterns/alarm` handler works for any project  
✅ **Proper error handling** - Structured errors with codes  
✅ **Injectable logger** - Compatible with `api.logger`  
✅ **Tested** - Unit tests + integration tests with real Ecomet

## Quick Start

### Ecomet Client

```typescript
import { EcometClient, AlarmHandler } from '@workspace/ecomet-core';

// Create client
const client = new EcometClient({
  hosts: ['10.210.2.20:9000', '10.210.2.19:9000'],
  login: 'ai_assistant',
  password: 'ai_assistant'
});

// Connect
await client.connect();

// Query alarms
const alarmHandler = new AlarmHandler(client);
const activeAlarms = await alarmHandler.getActive();
const recentAlarms = await alarmHandler.getRecent(10); // Last 10 minutes

// Close
await client.close();
```

### Neo4j Client

```typescript
import { Neo4jClient } from '@workspace/ecomet-core';

// Create client
const neo4j = new Neo4jClient({
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'neo4jneo4j'
});

// Connect
await neo4j.connect();

// Search for nodes
const paths = await neo4j.searchPath('AKMOLA');

// Get node by path
const node = await neo4j.getNodeByPath('/root/FP/PROJECT/KAZ/AKMOLA');

// Custom Cypher query
const results = await neo4j.run(
  'MATCH (n:Node) WHERE n.path CONTAINS $text RETURN n LIMIT 10',
  { text: 'AKMOLA' }
);

// Close
await neo4j.close();
```

## API Reference

### EcometClient

**Constructor:**
```typescript
new EcometClient(config?: EcometConfig, logger?: Logger)
```

**Config options:**
- `hosts` - Array of Ecomet hosts (format: "host:port")
- `login` - Login username
- `password` - Login password  
- `timeoutMs` - Query timeout (default: 5000ms)
- `reconnectDelayMs` - Reconnect delay (default: 1000ms)
- `protocol` - WebSocket protocol: 'ws:' or 'wss:' (default: 'ws:')

**Methods:**
- `connect()` - Connect to Ecomet (auto-retry all hosts)
- `isConnected()` - Check connection status
- `query<T>(statement, options?)` - Execute Ecomet QL query
- `get(oid, fields?)` - Get object by OID
- `find(pattern, conditions?, limit?)` - Find objects by pattern
- `close()` - Close connection

**Example:**
```typescript
const client = new EcometClient({
  hosts: ['10.210.2.20:9000']
}, api.logger);

await client.connect();

const response = await client.query<{ count: number; result: any[][] }>(
  "get text, point from 'archive' where .pattern = $oid('/root/.patterns/alarm') page 1:100 format $to_json"
);

// Ecomet response format:
// {
//   count: 12345,
//   result: [
//     ["text", "point"],           // Headers
//     ["Alarm 1", "/path/1"],      // Row 1
//     ["Alarm 2", "/path/2"]       // Row 2
//   ]
// }
```

### Neo4jClient

**Constructor:**
```typescript
new Neo4jClient(config?: Neo4jConfig, logger?: Logger)
```

**Config options:**
- `uri` - Neo4j bolt URI (default: "bolt://localhost:7687")
- `username` - Username (default: "neo4j")
- `password` - Password (default: "neo4jneo4j")
- `database` - Database name (default: "neo4j")
- `timeoutMs` - Connection timeout (default: 30000ms)

**Methods:**
- `connect()` - Connect to Neo4j
- `isConnected()` - Check connection status
- `run<T>(cypher, params?)` - Execute Cypher query
- `write<T>(cypher, params?)` - Execute write transaction
- `searchPath(text, limit?)` - Search nodes by path/name
- `getNodeByPath(path)` - Get node by exact path
- `findNodesByPattern(pattern, limit?)` - Find nodes matching pattern
- `getRelationships(path, type?, direction?, limit?)` - Get node relationships
- `count(pattern?)` - Count nodes
- `close()` - Close connection

**Example:**
```typescript
const neo4j = new Neo4jClient({
  uri: 'bolt://openclaw-neo4j:7687'
}, api.logger);

await neo4j.connect();

// Search for station
const stations = await neo4j.searchPath('AKMOLA', 10);

// Get voltage levels
const voltageLevels = await neo4j.findNodesByPattern('/AKMOLA/', 100);

// Get equipment relationships
const equipment = await neo4j.getRelationships(
  '/root/FP/PROJECT/KAZ/AKMOLA/220',
  'contains',  // relationship type
  'out',       // outgoing only
  50
);

// Custom query
const telemetry = await neo4j.run<{ path: string; type: string }>(
  `MATCH (station)-[:REL*]->(t:Node {type: 'telemetry'})
   WHERE station.path = $stationPath
   RETURN t.path as path, t.type as type`,
  { stationPath: '/root/FP/PROJECT/KAZ/AKMOLA' }
);
```

---

### AlarmHandler

**Constructor:**
```typescript
new AlarmHandler(ecometClient: EcometClient, alarmPatternOid?: string)
```

**Methods:**
- `query(filters?)` - Query alarms with filters
- `getActive(filters?)` - Get active alarms only
- `getUnacknowledged(filters?)` - Get unacknowledged alarms
- `getRecent(minutes, filters?)` - Get recent alarms (last N minutes)
- `formatAlarm(alarm)` - Format alarm for display

**Filters:**
```typescript
interface AlarmFilters {
  active?: boolean;
  acknowledged?: boolean;
  point?: string;           // Exact point path
  pointPattern?: string;    // LIKE substring match
  fromMs?: number;          // Start time (Unix ms)
  toMs?: number;            // End time (Unix ms)
  limit?: number;           // Max results (default: 100)
}
```

**Example:**
```typescript
const alarms = new AlarmHandler(client);

// Get active alarms
const active = await alarms.getActive();

// Get alarms for specific station
const stationAlarms = await alarms.query({ 
  pointPattern: '/AKMOLA/',
  active: true 
});

// Get last 10 minutes
const recent = await alarms.getRecent(10);

// Format for display
recent.forEach(alarm => {
  console.log(alarms.formatAlarm(alarm));
});
```

## Response Format

Ecomet has **two response formats** depending on pagination:

### Paginated Queries (with `page 1:N`)

```typescript
{
  count: number,        // Total matching items
  result: [
    [header1, header2, ...],    // Row 0: Headers
    [value1, value2, ...],      // Row 1: Data
    [value1, value2, ...]       // Row 2: Data
  ]
}
```

### Non-Paginated Queries (without `page`)

```typescript
[
  [header1, header2, ...],    // Row 0: Headers
  [value1, value2, ...],      // Row 1: Data
  [value1, value2, ...]       // Row 2: Data
]
```

**The library automatically handles both formats** and normalizes them internally.

**Parsed output (same for both):**

```typescript
// Raw Ecomet response (paginated):
{
  count: 2,
  result: [
    ["text", "point"],
    ["Alarm 1", "/path/1"],
    ["Alarm 2", "/path/2"]
  ]
}

// Raw Ecomet response (non-paginated):
[
  ["text", "point"],
  ["Alarm 1", "/path/1"],
  ["Alarm 2", "/path/2"]
]

// Both parsed to:
[
  { text: "Alarm 1", point: "/path/1" },
  { text: "Alarm 2", point: "/path/2" }
]
```

## Testing

**Unit tests:**
```bash
npm test
# or
npx tsx __tests__/unit/alarm-handler.test.ts
npx tsx __tests__/unit/neo4j-client.test.ts
```

**Integration tests:**

Requires live Ecomet and Neo4j servers:

```bash
# Ecomet integration (requires 10.210.2.20:9000)
npx tsx __tests__/integration/ecomet-client.test.ts

# Neo4j integration (requires bolt://localhost:7687 or docker network)
npx tsx __tests__/integration/neo4j-client.test.ts
```

## Architecture

### Vendored Dependencies

Ecomet.js is vendored inside the package (`src/vendor/ecomet.js`).  
This makes the package self-contained and portable.

### TypeScript Compilation

```bash
npm run build
```

Compiles TypeScript to JavaScript in `dist/`:
```
dist/
├── client/ecomet-client.js        # Compiled JS
├── client/ecomet-client.d.ts      # Type definitions
├── patterns/alarm-handler.js
├── patterns/alarm-handler.d.ts
├── utils/errors.js
├── utils/errors.d.ts
├── vendor/ecomet.js               # Vendored (copied)
└── index.js
```

### Import Resolution

```typescript
// From other workspace packages:
import { EcometClient } from '@workspace/ecomet-core';

// From external projects:
import { EcometClient } from './libs/ecomet-core/dist/index.js';
```

## Error Handling

```typescript
import { EcometError, ErrorCode } from '@workspace/ecomet-core';

try {
  await client.connect();
} catch (error) {
  if (error instanceof EcometError) {
    console.error(`[${error.code}] ${error.message}`);
    // error.code: CONNECTION_FAILED, QUERY_FAILED, TIMEOUT, etc.
  }
}
```

## Reusability

This package is **100% project-agnostic**.  
It works with ANY Ecomet system:
- ✅ Power grids
- ✅ Oil refining
- ✅ Water treatment
- ✅ Manufacturing SCADA
- ✅ Any Ecomet-based EMS/SCADA

**Unchangeable across projects:**
- `.patterns/alarm` structure
- `.patterns/archive` structure
- Ecomet QL syntax
- WebSocket protocol

**Project-specific code goes in domain layer** (grid-utils/domains/).

## License

MPL 2.0 (Ecomet.js)

## Version

2.0.0 - Clean refactor, production-ready
