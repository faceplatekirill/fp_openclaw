import type { ViewModelBlock, ViewModelContract, ViewModelKind } from '../../index.js';

function renderKindHeading(kind: ViewModelKind): string {
  switch (kind) {
    case 'history_view':
      return '# History View';
    case 'snapshot_view':
      return '# Snapshot View';
    case 'aggregate_table':
      return '# Aggregate Table';
    case 'alarm_list':
      return '# Alarm List';
    case 'alarm_summary':
      return '# Alarm Summary';
    case 'scope_view':
      return '# Scope View';
    case 'coverage_view':
      return '# Coverage View';
  }
}

function renderBlock(block: ViewModelBlock): string {
  switch (block.block_kind) {
    case 'history':
      return `- History ${block.tag}: ${block.data.length} points`;
    case 'snapshot':
      return `- Snapshot at ${block.timestamp}: ${Object.keys(block.values).length} values`;
    case 'aggregate_table':
      return `- Aggregate ${block.tag}: ${block.rows.length} rows`;
    case 'alarm_list':
      return `- Alarm list: ${block.alarms.length}/${block.total} alarms shown`;
    case 'alarm_summary':
      return `- Alarm summary: ${block.metrics.total_alarms} total alarms`;
    case 'scope':
      return `- Scope: ${block.objects.length}/${block.total} objects shown`;
    case 'coverage':
      return `- Coverage: ${block.summary.archived}/${block.summary.total} archived`;
  }
}

export function renderStubToMarkdown(vm: ViewModelContract): string {
  const completenessLine = vm.completeness.reason
    ? `Completeness: ${vm.completeness.status} (${vm.completeness.reason})`
    : `Completeness: ${vm.completeness.status}`;
  const warningLines =
    vm.warnings.length > 0
      ? vm.warnings.map((warning) => `- [${warning.severity}] ${warning.message}`)
      : ['- none'];
  const blockLines = vm.blocks.map(renderBlock);

  return [
    renderKindHeading(vm.kind),
    '',
    `Source skill: ${vm.provenance.source_skill}`,
    `Scope: ${vm.provenance.scope}`,
    `Period: ${vm.provenance.period_from} -> ${vm.provenance.period_to} (${vm.provenance.timezone})`,
    completenessLine,
    '',
    'Blocks:',
    ...blockLines,
    '',
    'Warnings:',
    ...warningLines,
  ].join('\n');
}
