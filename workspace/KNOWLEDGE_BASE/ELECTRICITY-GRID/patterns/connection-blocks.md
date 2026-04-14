# Connection Blocks

**Context:** Standard switching assemblies used in substation equipment connections.

---

## Overview

Connection blocks are reusable prototype templates describing typical switching structures:
- circuit breaker (`cb`)
- isolators (`iso-*`)
- earth isolators (`earth_iso-*`)
- terminals (`term-*`)
- state calculation scripts (`_script/state`)

They standardize how line terminals, transformers, generators, and bus couplers are represented.

---

## Typical Structure

Illustrative example:

```text
connection/
├── cb/
│   ├── position
│   ├── control/
│   └── acknowledge/
├── iso-1/
├── iso-2/
├── iso-3/
├── iso-4/
├── earth_iso-1/
├── earth_iso-2/
├── term-1/
├── term-2/
└── _script/
    └── state.json
```

Exact equipment count per block variant depends on deployment standards.

---

## Purpose

Benefits of connection blocks:
- standardization of switching topology
- reusable template inheritance
- consistent state-calculation behavior
- easier validation and automation

---

## State Calculation

Connection blocks usually include script logic for composite state.

```erlang
fun(VARS,_State)->
    CB=maps:get("input-1",VARS),
    I1=maps:get("input-2",VARS),
    I2=maps:get("input-3",VARS),
    State = if
        CB andalso I1 andalso I2 -> 1;
        true -> -1
    end,
    { #{"out_value" => State}, none }
end.
```

Interpretation is deployment-defined, but the pattern is consistent: individual switch positions feed one connection-state output.

---

## Inheritance Pattern

```json
{
  ".pattern": "/root/FP/prototypes/earth_isolator/fields",
  "prototype": "/root/FP/prototypes/connection block-1/content/earth_iso-2"
}
```

Three layers:
1. Pattern: object family/type
2. Prototype: block template
3. Instance: concrete equipment object path

---

## Where Blocks Commonly Appear

1. Line terminal connections
2. Transformer winding connections
3. Generator connections
4. Bus coupler/tie connections

---

## Common Fields

```json
{
  ".pattern": "/root/FP/prototypes/connection_state/fields",
  "state": 1,
  "state_qds": 0,
  "cb": "/path/to/circuit_breaker",
  "iso_1": "/path/to/isolator_1",
  "iso_2": "/path/to/isolator_2",
  "term_1": "/path/to/terminal_1",
  "term_2": "/path/to/terminal_2",
  "prototype": "/root/FP/prototypes/connection block-2/content",
  "disabled": false
}
```

---

## Operational Use

For dispatch and analysis, connection blocks support:
- quick connected/disconnected checks
- isolation-path verification before switching
- root-cause tracing when connection state is inconsistent

Typical logic:
- if `state_connection` indicates disconnected, inspect CB/isolator positions and their quality/timestamps.

---

## Modeling Notes

- Block variant naming (`connection block-1`, `...-2`, etc.) is deployment-specific.
- Do not hardcode assumptions about variant index meaning.
- Determine actual semantics from prototype content and scripts.

---

## See Also

- `../semantics/state-codes.md`
- `../project-structure.md`
- `../architecture/static-vs-dynamic-fields.md`
- `../ecomet-api-reference.md`
