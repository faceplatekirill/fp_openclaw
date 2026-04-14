# Connection Templates

This file describes the reusable connection templates used in the live project.

## Connection Block Purpose

Connection blocks standardize switching assemblies for equipment connections. They typically model:

- circuit breakers (`cb`)
- isolators (`iso-*`)
- earth isolators (`earth_iso-*`)
- terminals (`term-*`)
- composite connection-state logic (`_script/state`)

These blocks appear repeatedly in line terminals, transformers, generators, and bus-coupling structures.

## Typical Template Shape

```text
connection/
|- cb/
|  |- position
|  |- control/
|  `- acknowledge/
|- iso-1/
|- iso-2/
|- iso-3/
|- iso-4/
|- earth_iso-1/
|- earth_iso-2/
|- term-1/
|- term-2/
`- _script/
   `- state.json
```

The exact number of isolators and terminals depends on the block variant, but the structural pattern stays consistent.

## Template Layers

Each concrete object should be interpreted through three layers:

1. pattern family: object type such as `circuit_breaker`, `isolator`, or `connection_state`
2. prototype/template: reusable connection block definition
3. instance path: the live equipment object in the project tree

Example inheritance pattern:

```json
{
  ".pattern": "/root/FP/prototypes/earth_isolator/fields",
  "prototype": "/root/FP/prototypes/connection block-1/content/earth_iso-2"
}
```

## Common Connection-State Fields

Common fields found on connection-state objects:

- `state`
- `state_qds`
- `cb`
- `iso_1`
- `iso_2`
- `term_1`
- `term_2`
- `prototype`
- `disabled`

These fields link the composite connection object to the individual switching members that determine the final state.

## How Template Logic Works

Connection templates typically calculate a composite state from underlying switch positions.

Practical interpretation rule:

- individual breaker and isolator positions feed one connection-state output
- the exact numeric meaning comes from project semantics and prototype logic
- variant numbering such as `connection block-1`, `connection block-2`, and so on is deployment-specific and must not be hardcoded as universal meaning

## Where To Expect These Templates

Common locations:

1. line terminal connections
2. transformer winding connections
3. generator connections
4. bus coupler or bus tie connections

## Equipment Wiring Patterns

The live project uses a few recurring equipment-shape patterns:

### Single-pole equipment

Examples:

- reactor
- load
- generator or external-source interfaces

Typical pattern:

- one terminal pole such as `pole_i`
- optional virtual companion such as `_earth` or `_energy`

### Two-pole equipment

Examples:

- circuit breaker
- isolator
- line
- two-winding transformer families

Typical pattern:

- `pole_i` plus `pole_j`
- optional nested switch-position source under a child state object

### Three-winding or shared-pole equipment

Examples:

- coupled reactor
- three-winding transformer families

Typical pattern:

- multiple pole pairs sharing one common pole
- interpret as several explicit connections rather than one ambiguous lumped connection

## State And Position Source Patterns

Project templates use a few recurring field-location patterns:

### Direct field on the current object

Examples:

- `state_graph`
- `state_graph_in`

### Nested child object

Common pattern:

- child path `state`
- expected family `state`
- target field `out_value`

This is a common way to represent breaker or isolator position.

### Optional external source

Common pattern:

- child path `external_state`
- expected family `state`
- target field `in_value`

Use this as optional mirrored remote-end state, especially for inter-region line-terminal structures.

If `external_state` is absent, treat it as optional project structure rather than as an error.

## Virtual Node Conventions

Two virtual connection roles appear in the project's structural conventions:

- `_earth`: common grounding node
- `_energy`: common generation-source node

Interpretation rules:

- `_earth` should be treated consistently across grounding-switch structures
- `_energy` indicates a generated or injected energy source side rather than a normal equipment terminal

## Operational Interpretation Notes

Use these templates when the agent needs to answer questions such as:

- which switching members belong to this terminal
- whether a composite connection state is consistent with breaker and isolator positions
- which subtree should be inspected for connection-related interpretation

The `connection/` subtree is a structural template, not a query recipe.
