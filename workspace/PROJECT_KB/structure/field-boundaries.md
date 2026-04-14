# Field Boundaries

This file defines which field families in the live project carry static/config meaning, runtime meaning, or should be ignored for operational interpretation.

## Static and Configuration-Oriented Fields

These fields describe topology, identity, configuration, or limits rather than live operational state:

- `.pattern`, `prototype`, `path`
- `pole_i`, `pole_j`
- `vclass`, `line_length`
- `title`, `comment`, `description`
- `configuration`, `settings`, `database`, `groups`
- `op_Hi`, `op_Lo`, `op_Hi_A`, `op_Lo_A`, `op_Hi_W`, `op_Lo_W`
- `percent_min`, `percent_max`, `digits`, `hyst_value`
- `script`, `vars`, `cycle`
- `compare`, `delay`, `delay_type`, `negative`, `no_ack`
- `alarm_sound`, `text`, `type`, `notify`, `send_http`, `category_1..5`
- `maintenance_id`

These fields explain what the object is and how it is configured, not whether it is currently energized, valid, stale, or disconnected.

## Runtime and Operational Fields

These fields carry live operational meaning in this project:

### Values

- `in_value`
- `op_value`
- `out_value`
- `calculated_value`
- `remote_value`
- `se_value`

### Quality

- `in_qds`
- `op_qds`
- `out_qds`
- `se_qds`
- `remote_qds`
- `state_connection_qds`
- `calculated_qds`

### Timestamps

- `in_ts`
- `op_ts`
- `out_ts`
- `se_ts`
- `remote_ts`
- `state_connection_update_ts`

### Current states

- `state`
- `position`
- `state_connection`
- `state_graph`
- `state_connection_i`
- `state_connection_j`
- `state_graph_i`
- `state_graph_j`
- `state_graph_in`

Project note:

- some state meaning is direct on the object
- some switch-position meaning lives under a nested child such as `state/out_value`
- some terminal-state meaning lives under nested telemetry such as `U/state_graph_in`
- optional remote-end state may live under `external_state/in_value`

### Flow and balance fields

- `P_i_value`, `P_j_value`
- `Q_i_value`, `Q_j_value`
- `P_i_qds`, `P_j_qds`
- `Q_i_qds`, `Q_j_qds`
- `u_in_value`, `u_out_value`
- `p_in_balance`, `p_out_balance`
- `q_in_balance`, `q_out_balance`

### Runtime mode and maintenance context

- `op_manual`
- `calc_manual`
- `remote_manual`
- `se_manual`
- `maintenance_data`
- alarm runtime fields such as `state`, `value`, `input`, `fact`, `error`

## Important Mixed Boundary

These two maintenance fields do not belong to the same category:

- `maintenance_id`: stable cross-system identity, mostly static
- `maintenance_data`: live work-order context, operationally meaningful

## Non-Operational or Ignore Families

Do not use these as live operational truth:

### UI and display fields

- `view1` through `view15`
- `screen`
- `settings`
- `icon`
- `favorite`
- `alias`
- `title`
- `remote_source`
- `remote_target`
- `remote_target_list`

### PowerFactory (`pf_*`) fields

All `pf_*` fields describe offline model configuration or model results, not live grid state.

Common examples:

- `pf_active`
- `pf_outserv`
- `pf_attr`
- `pf_on_off`
- `pf_c_loading`
- `pf_nntap`
- `pf_m_P_bushv`
- `pf_m_P_buslv`
- `pf_m_Q_bushv`
- `pf_m_Q_buslv`

Interpretation boundary:

- `pf_active: true` means the object is active in the PowerFactory model
- it does not mean the object is currently energized, connected, or healthy in live operations

### Other auxiliary fields and folders

- `mode` when used only as configuration metadata
- `percent_value` when used only for UI scaling
- `type_screen`
- `nodes`
- auxiliary or test folders such as `_GRIDS/` and `test/`

## Operational Focus Summary

For operational interpretation in this project, prioritize:

- value source and quality together
- state fields plus their quality and timestamps
- connection/template context for switching equipment
- maintenance context before labeling something as an unplanned outage

Avoid treating offline-model, UI, or helper fields as live truth.
