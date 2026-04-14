# Ecomet Electricity Grid Structure Reference

**Date:** 2026-03-05  
**Layer:** ELECTRICITY-GRID  
**Purpose:** Domain-level structure for electricity-grid deployments on Ecomet

## Scope

This document describes **generic electricity-grid structure patterns** used in Ecomet-based systems.

Use this file for:
- Hierarchy and path conventions in grid projects
- Grid object organization (substations, voltage levels, equipment, connections)
- Common prototype and field families relevant to grid operations

Do not use this file for:
- Deployment-specific inventory (exact countries, stations, counts)
- Tenant-specific naming, ownership, or operations policy

Project-specific details may appear only as clearly marked examples.

## Canonical Hierarchy

Typical deployments follow a geographical and functional hierarchy:

```text
PROJECT/
├── @lines/                  # System-level line objects
├── @forms/                  # UI forms/displays
├── @services/               # Runtime/system services
├── @system/                 # Global config
├── COUNTRY_OR_ZONE/
│   ├── @lines/              # Lines in this territory
│   ├── @forms/
│   ├── @regions/
│   ├── @sections/
│   ├── @subjects/
│   ├── @system/
│   └── REGION/
│       └── SUBSTATION/
│           ├── VOLTAGE_CLASS/ (10, 35, 110, 220, 500, ...)
│           ├── RZA_PA/
│           ├── subject/
│           └── weather/
└── test/
```

Notes:
- Names are deployment-defined; do not hardcode country/region/station names.
- `VOLTAGE_CLASS` folders usually contain terminals, busbars, transformers, line terminals, and aggregate telemetry objects.

## Station and Voltage-Level Organization

Example structure (illustrative only):

```text
SUBSTATION/
├── 110/
├── 220/
├── 500/
├── RZA_PA/
├── subject/
└── weather/

220/
├── BB1, BB2               # Bus bars
├── T1, T2                 # Transformers
├── L####                  # Line terminals
├── Pgen_sum, Pload_sum    # Aggregate active power
├── Qgen_sum, Qload_sum    # Aggregate reactive power
└── SE_nod                 # State-estimation node
```

## Equipment and Connection Pattern

Equipment terminals are usually organized by measurement folders and connection blocks:

```text
EQUIPMENT_TERMINAL/
├── Ia, Ib, Ic
├── P/
├── Q/
├── load/
├── iso/
├── connection/
└── term.json

connection/
├── cb/
├── iso-1/, iso-2/, ...
├── earth_iso-1/, earth_iso-2/, ...
├── term-1/, term-2/, ...
└── _script/state.json
```

This `connection/` subtree is the main source for switching-state interpretation.

## Common Prototypes in Grid Deployments

Frequently used `.pattern` families:

- `/root/.patterns/FOLDER`
- `/root/FP/prototypes/telemetry/fields`
- `/root/FP/prototypes/state/fields`
- `/root/FP/prototypes/connection_state/fields`
- `/root/FP/prototypes/circuit_breaker/fields`
- `/root/FP/prototypes/isolator/fields`
- `/root/FP/prototypes/earth_isolator/fields`
- `/root/FP/prototypes/terminal/fields`
- `/root/FP/prototypes/line terminal/fields`
- `/root/FP/prototypes/bus terminal/fields`
- `/root/FP/prototypes/line/fields`
- `/root/FP/prototypes/substation/fields`
- `/root/FP/prototypes/voltage class/fields`
- `/root/FP/prototypes/load/fields`
- `/root/FP/prototypes/generator/fields`
- `/root/FP/prototypes/transformer-2w2t/fields`
- `/root/FP/prototypes/transformer-3w3t/fields`
- `/root/FP/prototypes/subject/fields`

## Key Field Families

### Telemetry

Telemetry objects typically expose several value channels:

- Input channel: `in_value`, `in_qds`, `in_ts`
- Operational channel: `op_value`, `op_qds`, `op_ts`
- Output channel: `out_value`, `out_qds`, `out_ts`
- State-estimation channel: `se_value`, `se_qds`, `se_manual`

Interpretation details:
- See `semantics/value-source-selection.md`
- See `semantics/qds-codes.md`
- See `../CORE/semantics/timestamps.md`

### State and Switching

For switching devices and connection logic:

- State objects: `state`, `state_*`
- Connection-logic objects: `connection_state`
- Typical derived states used in analytics: `state_connection`, `state_graph`

Interpretation details:
- See `semantics/state-codes.md`
- See `patterns/connection-blocks.md`

### Line Connectivity

Line and branch objects frequently reference terminal poles:

- `pole_i`
- `pole_j`

These are path-like links used to build topological edges.

## Path Convention

Canonical object path format:

```text
/root/FP/PROJECT/<territory>/<region>/<substation>/<voltage>/<object>/...
```

Examples (illustrative only):

```text
/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/T1
/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/T1/P
/root/FP/PROJECT/COUNTRY_A/REGION_1/STATION_X/220/L1001/connection/cb
```

Implementation guidance:
- Parse paths by position and folder role, not by literal names.
- Treat country/region/station identifiers as runtime data.

## Special Functional Folders

Common special folders and their role:

- `@lines`: line registry and cross-station connectivity objects
- `@subjects`: organization/operator metadata
- `@regions`, `@sections`: dispatch/grouping abstractions
- `@DTS`: dispatcher training simulator assets
- `@SE`: state-estimation layer artifacts

## Content Rule for This Knowledge Base

To keep this layer reusable across deployments:

- Keep tenant-specific entities out of main sections.
- If a real deployment path is shown, mark it as **Example only**.
- Store tenant-specific inventories in separate project docs, not here.

## Related Documents

- `query-workflow.md`
- `architecture/static-vs-dynamic-fields.md`
- `patterns/connection-blocks.md`
- `semantics/state-codes.md`
- `semantics/qds-codes.md`
- `semantics/value-source-selection.md`
- `../CORE/ecomet-api-reference.md`
- `ecomet-field-indexes.md`
- `../CORE/ecomet-field-indexes.md`
