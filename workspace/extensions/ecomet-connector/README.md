# Ecomet Connector Plugin

OpenClaw plugin for connecting to Ecomet SCADA/EMS systems via WebSocket.

## Features

- WebSocket connection to Ecomet servers
- Auto-reconnect with host failover
- Query, get, find, create/edit/delete operations
- **Alarm query helpers** (query_alarms, summarize_alarms)

## Development

### TypeScript Source

This plugin is written in TypeScript:
- **Source:** `*.ts` files
- **Runtime:** `*.js` files (compiled from TS)

### Build

Compile TypeScript to JavaScript:

```bash
cd /home/node/.openclaw/workspace/extensions/ecomet-connector
tsc
```

Or use the build script:

```bash
./build.sh
```

### Files

- `index.ts` - Main plugin implementation
- `alarm-helpers.ts` - Alarm query utilities
- `openclaw.plugin.json` - Plugin manifest
- `tsconfig.json` - TypeScript configuration
- `.gitignore` - Excludes compiled .js files

**Note:** `.js` files are git-ignored since they're generated. Always edit `.ts` files.

## Configuration

Default credentials: `ai_assistant` / `ai_assistant`

Configure in `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "ecomet-connector": {
        "enabled": true,
        "config": {
          "hosts": ["10.210.2.20", "10.210.2.19", "10.210.2.21"],
          "port": 9000,
          "protocol": "ws:",
          "login": "ai_assistant",
          "password": "ai_assistant",
          "timeoutMs": 5000
        }
      }
    }
  }
}
```

## Actions

### Standard Ecomet Operations

- `query` - Execute Ecomet QL query
- `get` - Get object by OID
- `find` - Find objects by pattern
- `create_object` - Create new object
- `edit_object` - Modify object
- `delete_object` - Delete object
- `application` - Call application method

### Alarm Operations

#### query_alarms

Query alarms with filters:

```javascript
ecomet_api({
  action: "query_alarms",
  alarmFilters: {
    period: "last 1 hour",      // or fromMs/toMs
    active: true,                // optional
    acknowledged: false,         // optional
    type: "alarm",               // or ["alarm", "error"]
    station: "Кокшетау",         // LIKE match
    point: "/KAZ/AKMOLA/...",    // LIKE match
    vclass: "220",               // voltage class
    fields: "text,dt_on,...",    // custom field list
    page: "page 1:100"           // pagination
  },
  analyze: true  // include statistics summary
})
```

#### summarize_alarms

Generate statistics from alarm array:

```javascript
ecomet_api({
  action: "summarize_alarms",
  alarms: [...]  // array of alarm objects
})
```

Returns:
```javascript
{
  total: 47,
  active: 23,
  acknowledged: 31,
  unacknowledged: 16,
  byType: [{ type: "alarm", count: 23 }, ...],
  byStation: [{ station: "Кокшетау", count: 15 }, ...],
  byVClass: [{ vclass: "220", count: 28 }, ...]
}
```

## Security

⚠️ **Never use `system` / `111111` credentials in production!**

Use dedicated service account with minimal required permissions.
