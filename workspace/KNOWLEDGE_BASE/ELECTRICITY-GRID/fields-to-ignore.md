- Which voltage classes/equipment exist in this station?# Fields to Ignore for Grid Analysis

**Context:** Non-operational fields that should not drive dispatcher decisions.

---

## UI/Display Fields

Usually presentation-only:
- `view1` ... `view15`
- `screen`, `settings`, `icon`, `favorite`, `alias`, `title`
- `remote_source`, `remote_target`, `remote_target_list`

---

## PowerFactory (`pf_*`) Fields

`pf_*` fields describe offline model configuration/results, not realtime operations.

Examples:
- `pf_active`, `pf_outserv`, `pf_attr`, `pf_on_off`
- `pf_c_loading`, `pf_nntap`
- `pf_m_P_bushv`, `pf_m_P_buslv`, `pf_m_Q_bushv`, `pf_m_Q_buslv`

Do not treat these as current grid state.

---

## Other Non-Operational or Auxiliary Fields

- `mode` in deployments where it is only configuration metadata
- `percent_min`, `percent_max`, `percent_value` when used only for UI scaling
- `type_screen`, `nodes` (runtime infrastructure metadata)
- auxiliary/test folders like `_GRIDS/`, `test/`, or tenant-specific utility folders

---

## Focus On Instead

### Operational runtime fields (Ecomet)
- values: `in_value`, `op_value`, `out_value`
- quality: `in_qds`, `op_qds`, `out_qds`
- time: `in_ts`, `op_ts`, `out_ts`
- state: `state_connection`, `state_graph`, `position`

### Topology/config fields (Graph)
- `.pattern`, `prototype`, `.fp_path`
- `pole_i`, `pole_j`, `vclass`, `line_length`
- limits and scripts (`op_Hi/op_Lo`, `script`)

---

## Critical Distinction

| Field Class | Use |
|---|---|
| `pf_*` | offline model context |
| `P_*_value`, `Q_*_value`, `state_*`, `out_*` | operational runtime analysis |

Always query Ecomet for live operational state.

---

## See Also

- `architecture/static-vs-dynamic-fields.md`
- `semantics/state-codes.md`
- `integrations/powerfactory.md`
