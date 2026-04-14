import type {
  HistoryBlock,
  ViewModelCompleteness,
  ViewModelContract,
  ViewModelKind,
  ViewModelProvenance,
  ViewModelWarning,
} from '../../index.js';

export function buildStubHistoryView(): ViewModelContract {
  const kind: ViewModelKind = 'history_view';
  const block: HistoryBlock = {
    block_kind: 'history',
    tag: '/root/FP/PROJECT/Pump_P101:pressure',
    label: 'Pump P-101 Pressure',
    unit: 'bar',
    data: [
      [1710300000000, 4.21],
      [1710300060000, 4.23],
      [1710300120000, 4.19],
    ],
    last_change: 1710300120000,
    notes: ['Change-driven archive semantics: missing timestamps imply unchanged values.'],
  };
  const warning: ViewModelWarning = {
    severity: 'info',
    message: 'Nulls and gaps should be interpreted in context before drawing conclusions.',
    code: 'STUB_HISTORY_NOTE',
    context: { tag: block.tag },
  };
  const provenance: ViewModelProvenance = {
    source_skill: 'scada-point-history',
    scope: 'Pump P-101 pressure trend',
    period_from: 1710300000000,
    period_to: 1710300180000,
    timezone: 'Europe/Kyiv',
    produced_at: 1710300240000,
  };
  const completeness: ViewModelCompleteness = {
    status: 'complete',
    total_available: block.data.length,
    total_returned: block.data.length,
  };

  return {
    kind,
    blocks: [block],
    warnings: [warning],
    provenance,
    completeness,
    metadata: {
      generated_by: 'buildStubHistoryView',
      milestone: 'M0',
    },
  };
}
