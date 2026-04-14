# Project Model

This file captures the live project's structural conventions: folder layout, common object organization, and prototype families.

## Canonical Hierarchy

Typical project layout:

```text
PROJECT/
|- @lines/
|- @forms/
|- @services/
|- @system/
|- COUNTRY_OR_ZONE/
|  |- @lines/
|  |- @forms/
|  |- @regions/
|  |- @sections/
|  |- @subjects/
|  |- @system/
|  `- REGION/
|     `- SUBSTATION/
|        |- VOLTAGE_CLASS/
|        |- RZA_PA/
|        |- subject/
|        `- weather/
`- test/
```

Important notes:

- country, region, and station names are deployment data, not fixed literals
- `VOLTAGE_CLASS` folders usually use values like `10`, `35`, `110`, `220`, `500`
- special folders such as `@lines`, `@subjects`, `@regions`, and `@sections` have project-wide meaning and should not be treated as ordinary equipment folders

## Voltage-Level Organization

Inside a station, voltage folders typically contain:

- bus bars such as `BB1`, `BB2`
- transformers such as `T1`, `T2`
- line terminals such as `L####`
- aggregate telemetry such as `Pgen_sum`, `Pload_sum`, `Qgen_sum`, `Qload_sum`
- state-estimation or node objects such as `SE_nod`

This layout matters when the agent needs to interpret whether a path refers to:

- a station-level object
- a voltage-level aggregate
- a concrete equipment terminal
- an operational helper subtree

## Equipment and Connection Subtrees

Equipment terminals commonly use measurement folders plus a standard connection subtree:

```text
EQUIPMENT_TERMINAL/
|- Ia
|- Ib
|- Ic
|- P
|- Q
|- load
|- iso
|- connection/
|  |- cb/
|  |- iso-1/
|  |- iso-2/
|  |- earth_iso-1/
|  |- earth_iso-2/
|  |- term-1/
|  |- term-2/
|  `- _script/state.json
`- term.json
```

The `connection/` subtree is the main template used for switching-state interpretation in this project.

## Common Prototype Families

Frequently used `.pattern` families in this project:

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

## Terminal Family Notes

Terminal-like objects in this project do not always expose state in exactly the same place.

Common patterns:

- plain `terminal` objects usually carry `state_graph` directly on the object
- `bus terminal` and `line terminal` families may carry terminal-state meaning through a nested telemetry child such as `U/state_graph_in`
- some legacy `source` declarations may still exist in specs; treat them as secondary hints unless the deployment data proves they are the active source

Special case:

- line-terminal structures may include an `external_state` child for mirrored remote-end state on inter-region lines

This matters because the agent should recognize that terminal-state meaning may live:

- on the object itself
- on a nested telemetry child
- on an optional external-state child

## Important Field Families By Role

Common project field families:

- telemetry/value fields: `in_value`, `op_value`, `out_value`, `se_value`
- telemetry quality fields: `in_qds`, `op_qds`, `out_qds`, `se_qds`
- telemetry timestamps: `in_ts`, `op_ts`, `out_ts`
- state fields: `state`, `state_connection`, `state_graph`, `position`
- connectivity fields: `pole_i`, `pole_j`
- static identifiers: `.pattern`, `prototype`, `maintenance_id`

Detailed meaning lives in:

- `../structure/field-boundaries.md`
- `../semantics/state-codes.md`
- `../semantics/qds-codes.md`
- `../semantics/value-source-selection.md`

## Path Discipline

Interpret paths by folder role, not by hardcoded tenant names.

Canonical shape:

```text
/root/FP/PROJECT/<territory>/<region>/<substation>/<voltage>/<object>/...
```

Examples of role-based interpretation:

- station scope: `/root/FP/PROJECT/.../<SUBSTATION>`
- voltage scope: `/root/FP/PROJECT/.../<SUBSTATION>/220`
- transformer telemetry: `/root/FP/PROJECT/.../<SUBSTATION>/220/T1/P`
- switching subtree: `/root/FP/PROJECT/.../<SUBSTATION>/220/L1001/connection/cb`
- optional external-state subtree: `/root/FP/PROJECT/.../<SUBSTATION>/220/L1001/external_state`

## Summary

The live project is organized around:

- geographic hierarchy
- station and voltage-level scopes
- reusable prototype families
- standard connection subtrees for switching logic
- a clear split between measurement, state, aggregate, and helper objects
