# PowerFactory Integration Fields

**Source:** Roman V (2026-02-19)  
**Context:** PowerFactory is power systems analysis software - fields are for model integration

---

## What is PowerFactory?

**PowerFactory** (by DIgSILENT) is power systems analysis software used for:
- Load flow calculations (power flow studies)
- Fault analysis (short circuit calculations)
- Stability studies
- Grid planning and optimization
- Offline simulation and modeling

**Critical distinction:** PowerFactory is for **offline analysis and planning**, NOT realtime operational monitoring.

---

## Fields Prefixed with `pf_`

All fields starting with `pf_` relate to **PowerFactory model configuration**, not operational grid state.

### Common `pf_*` Fields

| Field | Meaning | NOT Operational State |
|-------|---------|----------------------|
| `pf_active` | Equipment is included in PF model | ≠ "Equipment is currently active" |
| `pf_outserv` | Out of service in PF model | ≠ "Equipment is actually out of service" |
| `pf_attr` | PF model attributes | Model config only |
| `pf_on_off` | Equipment enabled in PF model | Model toggle |
| `pf_c_loading` | PF calculated loading | Model result, not realtime |
| `pf_nntap` | PF transformer tap position | Model setting |
| `pf_m_P_bushv` | PF model power (HV bus) | Model result |
| `pf_m_P_buslv` | PF model power (LV bus) | Model result |
| `pf_m_Q_bushv` | PF model reactive (HV) | Model result |
| `pf_m_Q_buslv` | PF model reactive (LV) | Model result |

---

## Examples of Misinterpretation

### ❌ Wrong Interpretation

**Field:**
```json
{
  "pf_active": true,
  "pf_outserv": false
}
```

**WRONG:** "Equipment is currently active and in service"

---

### ✅ Correct Interpretation

**Field:**
```json
{
  "pf_active": true,
  "pf_outserv": false
}
```

**CORRECT:** "Equipment is included in the PowerFactory model and is not marked as out-of-service in the model"

**To know actual operational status, query Ecomet:**
```javascript
ecomet_api({
  action: "get",
  oid: equipment.path,
  params: ["state_connection", "state_graph", "position"]
})
```

---

## Why These Fields Exist

### Workflow: Offline Analysis

1. **Engineers create PowerFactory model** of the grid
2. **Equipment is marked `pf_active: true`** if it should be included in simulations
3. **PowerFactory runs** load flow calculations, fault studies
4. **Results are stored** in `pf_m_*` fields (model results, not realtime data)
5. **Engineers analyze** grid behavior under various scenarios

### Synchronization

- `pf_active` configuration is **relatively static** (changes when model is updated)
- **Not synchronized** with realtime grid state
- An equipment can be:
  - `pf_active: true` (in model) but `state_connection: 1` (actually disconnected)
  - `pf_active: false` (not in model) but `state_connection: 2` (actually connected)

---

## When to Use `pf_*` Fields

**Use cases (rare for AI assistant):**
- "Which equipment is modeled in PowerFactory?" → Query `pf_active: true`
- "What was the last PF simulation result?" → Check `pf_m_*` fields
- "Is transformer included in load flow studies?" → Check `pf_active`

**But for dispatcher assistance:**
- ❌ Don't use `pf_*` fields for operational analysis
- ❌ Don't report `pf_active` as equipment status
- ❌ Don't use `pf_outserv` to determine if equipment is available
- ✅ Always query Ecomet for actual operational state

---

## Rule for AI Analysis

**Simple rule:**

```javascript
// ❌ Wrong
if (equipment.pf_active) {
  return "Equipment is active";
}

// ✅ Correct
const state = await ecomet_api({
  action: "get",
  oid: equipment.path,
  params: ["state_connection", "state_graph"]
});

if (state.state_connection === 2 && state.graph === 3) {
  return "Equipment is connected and powered";
}
```

---

## Updated Graph Loader

The rebuild script now excludes all `pf_*` fields:

```javascript
// PowerFactory integration fields - ignore
const PF_FIELDS = new Set([
  'pf_active', 'pf_attr', 'pf_on_off', 'pf_outserv', 'pf_c_loading',
  'pf_nntap', 'pf_m_P_bushv', 'pf_m_P_buslv', 'pf_m_Q_bushv', 'pf_m_Q_buslv'
]);

// Plus catch-all: if (key.startsWith('pf_')) continue;
```

---

## See Also

- `../architecture/static-vs-dynamic-fields.md` - Graph vs Ecomet usage
- `../fields-to-ignore.md` - Complete ignore list
- `../semantics/state-codes.md` - Actual operational states (use these!)

---

**Remember: PowerFactory = offline model, Ecomet = realtime reality!**
