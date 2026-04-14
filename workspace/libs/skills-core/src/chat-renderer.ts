import type {
  AggregateRow,
  AlarmEntry,
  AlarmListBlock,
  AlarmSummaryBlock,
  CoverageBlock,
  CoverageEntry,
  HistoryBlock,
  ScopeBlock,
  ScopeEntry,
  SnapshotBlock,
  ViewModelBlock,
  ViewModelContract,
} from '../../ecomet-core/dist/index.js';

const HISTORY_TABLE_MAX = 20;
const HISTORY_TABLE_HEAD = 10;
const HISTORY_TABLE_TAIL = 5;
const ALARM_LIST_MAX = 30;
const ALARM_LIST_HEAD = 20;
const SCOPE_GROUP_THRESHOLD = 20;
const SCOPE_SAMPLE_COUNT = 10;
const TIMESTAMP_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = TIMESTAMP_FORMATTERS.get(timezone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      calendar: 'iso8601',
      numberingSystem: 'latn',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    TIMESTAMP_FORMATTERS.set(timezone, formatter);
  }

  return formatter;
}

function formatTimestamp(timestamp: number, timezone: string): string {
  const parts = getFormatter(timezone).formatToParts(new Date(timestamp));
  const values: Partial<Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>> =
    {};

  for (const part of parts) {
    if (
      part.type === 'year' ||
      part.type === 'month' ||
      part.type === 'day' ||
      part.type === 'hour' ||
      part.type === 'minute' ||
      part.type === 'second'
    ) {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function escapeCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function formatValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return '';
  }

  return escapeCell(value);
}

function renderTable(headers: string[], rows: string[][]): string {
  const lines = [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
  ];

  for (const row of rows) {
    lines.push(`| ${row.map(formatValue).join(' | ')} |`);
  }

  return lines.join('\n');
}

function renderHistoryBlock(block: HistoryBlock, timezone: string): string {
  const rows = block.data.map(([timestamp, value]) => {
    const base = [formatTimestamp(timestamp, timezone), value === null ? 'null' : String(value)];
    if (block.unit) {
      base.push(block.unit);
    }
    return base;
  });
  const headers = ['Timestamp', 'Value'];
  if (block.unit) {
    headers.push('Unit');
  }

  const truncated = rows.length > HISTORY_TABLE_MAX;
  const displayRows = truncated
    ? [
        ...rows.slice(0, HISTORY_TABLE_HEAD),
        headers.map(() => '...'),
        ...rows.slice(-HISTORY_TABLE_TAIL),
      ]
    : rows;

  const sections = [`### ${block.label ?? block.tag}`, renderTable(headers, displayRows)];

  if (truncated) {
    sections.push(
      `Showing ${HISTORY_TABLE_HEAD + HISTORY_TABLE_TAIL} of ${rows.length} points. Truncated to first ${HISTORY_TABLE_HEAD} and last ${HISTORY_TABLE_TAIL}.`,
    );
  }

  if (block.last_change !== undefined) {
    sections.push(`Last change: ${formatTimestamp(block.last_change, timezone)}`);
  }

  if (block.notes && block.notes.length > 0) {
    sections.push(['Notes:', ...block.notes.map((note) => `- ${note}`)].join('\n'));
  }

  return sections.join('\n\n');
}

function renderSnapshotBlock(block: SnapshotBlock, timezone: string): string {
  const rows = Object.entries(block.values).map(([tag, value]) => [
    tag,
    value === null ? 'null' : String(value),
    formatTimestamp(block.timestamp, timezone),
  ]);
  const sections = ['### Snapshot', renderTable(['Tag', 'Value', 'Timestamp'], rows)];

  if (block.invalid && block.invalid.length > 0) {
    sections.push(['Invalid tags:', ...block.invalid.map((tag) => `- ${tag}`)].join('\n'));
  }

  if (block.unresolved && block.unresolved.length > 0) {
    sections.push(['Unresolved tags:', ...block.unresolved.map((tag) => `- ${tag}`)].join('\n'));
  }

  return sections.join('\n\n');
}

function renderAggregateRow(
  row: AggregateRow,
  timezone: string,
  functions: string[],
): string[] {
  return [
    `${formatTimestamp(row.period_from, timezone)} - ${formatTimestamp(row.period_to, timezone)}`,
    ...functions.map((fn) => {
      const value = row.values[fn];
      if (value === null) {
        return 'null';
      }
      return value === undefined ? '' : String(value);
    }),
  ];
}

function renderAggregateTableBlock(
  block: Extract<ViewModelBlock, { block_kind: 'aggregate_table' }>,
  timezone: string,
): string {
  const sections = [
    `### ${block.label ?? block.tag}`,
    renderTable(
      ['Period', ...block.functions],
      block.rows.map((row) => renderAggregateRow(row, timezone, block.functions)),
    ),
  ];

  if (block.bucket_description) {
    sections.push(`Bucket: ${block.bucket_description}`);
  }

  if (block.caveats && block.caveats.length > 0) {
    sections.push(['Caveats:', ...block.caveats.map((caveat) => `- ${caveat}`)].join('\n'));
  }

  return sections.join('\n\n');
}

function renderAlarmEntry(entry: AlarmEntry, timezone: string): string[] {
  return [
    formatTimestamp(entry.timestamp, timezone),
    entry.path,
    String(entry.source ?? entry.priority ?? ''),
    entry.message ?? '',
    entry.state ?? '',
  ];
}

function renderAlarmListBlock(block: AlarmListBlock, timezone: string): string {
  const truncated = block.alarms.length > ALARM_LIST_MAX;
  const alarms = truncated ? block.alarms.slice(0, ALARM_LIST_HEAD) : block.alarms;
  const sections = [
    '### Alarms',
    renderTable(
      ['Time', 'Object', 'Type', 'Message', 'State'],
      alarms.map((entry) => renderAlarmEntry(entry, timezone)),
    ),
  ];

  if (truncated) {
    sections.push(`Showing ${alarms.length} of ${block.total} alarms.`);
  }

  return sections.join('\n\n');
}

function renderTopOffenders(block: AlarmSummaryBlock): string {
  if (block.metrics.top_offenders.length === 0) {
    return '- **Top offenders:** none';
  }

  return `- **Top offenders:** ${block.metrics.top_offenders
    .map((offender) => `${offender.source} (${offender.count}, ${offender.percentage}%)`)
    .join(', ')}`;
}

function renderFloodPeriods(block: AlarmSummaryBlock, timezone: string): string {
  if (block.metrics.flood_periods.length === 0) {
    return '- **Flood periods:** none';
  }

  return `- **Flood periods:** ${block.metrics.flood_periods
    .map(
      (period) =>
        `${formatTimestamp(period.from, timezone)} - ${formatTimestamp(period.to, timezone)} (${period.rate_per_hour}/h)`,
    )
    .join(', ')}`;
}

function renderStanding(block: AlarmSummaryBlock, timezone: string): string {
  if (block.metrics.standing_alarms.length === 0) {
    return '- **Standing alarms:** none';
  }

  return `- **Standing alarms:** ${block.metrics.standing_alarms
    .map(
      (alarm) =>
        `${alarm.source}${alarm.message ? ` (${alarm.message})` : ''} since ${formatTimestamp(alarm.since, timezone)}`,
    )
    .join(', ')}`;
}

function renderChattering(block: AlarmSummaryBlock): string {
  if (block.metrics.chattering_alarms.length === 0) {
    return '- **Chattering alarms:** none';
  }

  return `- **Chattering alarms:** ${block.metrics.chattering_alarms
    .map((alarm) =>
      alarm.avg_duration_ms === undefined
        ? `${alarm.source} (${alarm.count})`
        : `${alarm.source} (${alarm.count}, avg ${alarm.avg_duration_ms} ms)`,
    )
    .join(', ')}`;
}

function renderDistribution(
  title: string,
  distribution?: Record<string, number>,
): string[] {
  if (!distribution || Object.keys(distribution).length === 0) {
    return [];
  }

  return [
    `#### ${title}`,
    renderTable(
      ['Category', 'Count'],
      Object.entries(distribution).map(([name, count]) => [name, String(count)]),
    ),
  ];
}

function renderAlarmSummaryBlock(block: AlarmSummaryBlock, timezone: string): string {
  const sections = [
    '### Alarm Summary',
    [
      `- **Total alarms:** ${block.metrics.total_alarms}`,
      `- **Alarms per hour:** ${block.metrics.alarms_per_hour}`,
      renderTopOffenders(block),
      renderFloodPeriods(block, timezone),
      renderStanding(block, timezone),
      renderChattering(block),
    ].join('\n'),
  ];

  const prioritySection = renderDistribution(
    'Priority Distribution',
    block.priority_distribution,
  );
  if (prioritySection.length > 0) {
    sections.push(prioritySection.join('\n\n'));
  }

  const categorySection = renderDistribution(
    'Category Distribution',
    block.category_distribution,
  );
  if (categorySection.length > 0) {
    sections.push(categorySection.join('\n\n'));
  }

  return sections.join('\n\n');
}

function renderScopeSampleRow(entry: ScopeEntry): string[] {
  return [entry.name ?? '', entry.pattern ?? '', entry.path];
}

function renderScopeTypeSummary(block: ScopeBlock): Record<string, number> {
  if (block.type_summary && Object.keys(block.type_summary).length > 0) {
    return block.type_summary;
  }

  return block.objects.reduce<Record<string, number>>((acc, entry) => {
    const key = entry.pattern ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function renderScopeBlock(block: ScopeBlock): string {
  const sections = ['### Scope'];

  if (block.objects.length > SCOPE_GROUP_THRESHOLD) {
    sections.push(
      renderTable(
        ['Type', 'Count'],
        Object.entries(renderScopeTypeSummary(block)).map(([type, count]) => [
          type,
          String(count),
        ]),
      ),
    );
    sections.push(
      `Showing sample objects (${Math.min(block.objects.length, SCOPE_SAMPLE_COUNT)} of ${block.total}):`,
    );
    sections.push(
      renderTable(
        ['Name', 'Type', 'Path'],
        block.objects
          .slice(0, SCOPE_SAMPLE_COUNT)
          .map((entry) => renderScopeSampleRow(entry)),
      ),
    );
    return sections.join('\n\n');
  }

  sections.push(
    renderTable(
      ['Name', 'Type', 'Path'],
      block.objects.map((entry) => renderScopeSampleRow(entry)),
    ),
  );
  return sections.join('\n\n');
}

function splitCoverageTag(tag: string): { objectPath: string; field: string } {
  const separatorIndex = tag.lastIndexOf(':');
  if (separatorIndex === -1) {
    return { objectPath: tag, field: '' };
  }

  return {
    objectPath: tag.slice(0, separatorIndex),
    field: tag.slice(separatorIndex + 1),
  };
}

function renderCoverageEntry(entry: CoverageEntry): string[] {
  const { objectPath, field } = splitCoverageTag(entry.tag);
  return [objectPath, field, entry.archived ? 'archived' : 'not_archived'];
}

function renderCoverageNotes(entry: CoverageEntry): string | null {
  if (!entry.notes || entry.notes.length === 0) {
    return null;
  }

  return [`#### ${entry.tag}`, ...entry.notes.map((note) => `- ${note}`)].join('\n');
}

function renderCoverageBlock(block: CoverageBlock): string {
  const sections = [
    '### Archive Coverage',
    renderTable(
      ['Object', 'Field', 'Status'],
      block.entries.map((entry) => renderCoverageEntry(entry)),
    ),
    `Archived: ${block.summary.archived}/${block.summary.total}. Not archived: ${block.summary.not_archived}. Invalid: ${block.summary.invalid}.`,
  ];

  const noteSections = block.entries
    .map((entry) => renderCoverageNotes(entry))
    .filter((section): section is string => section !== null);

  if (noteSections.length > 0) {
    sections.push(noteSections.join('\n\n'));
  }

  return sections.join('\n\n');
}

function assertNever(value: never): never {
  throw new Error(`Unsupported block kind: ${JSON.stringify(value)}`);
}

function renderBlock(block: ViewModelBlock, timezone: string): string {
  switch (block.block_kind) {
    case 'history':
      return renderHistoryBlock(block, timezone);
    case 'snapshot':
      return renderSnapshotBlock(block, timezone);
    case 'aggregate_table':
      return renderAggregateTableBlock(block, timezone);
    case 'alarm_list':
      return renderAlarmListBlock(block, timezone);
    case 'alarm_summary':
      return renderAlarmSummaryBlock(block, timezone);
    case 'scope':
      return renderScopeBlock(block);
    case 'coverage':
      return renderCoverageBlock(block);
    default:
      return assertNever(block);
  }
}

function renderWarnings(viewModel: ViewModelContract): string | null {
  if (viewModel.warnings.length === 0) {
    return null;
  }

  return [
    '## Warnings',
    ...viewModel.warnings.map((warning) => `> [${warning.severity}] ${warning.message}`),
  ].join('\n\n');
}

function renderCompleteness(viewModel: ViewModelContract): string | null {
  const { completeness } = viewModel;
  if (completeness.status === 'complete') {
    return null;
  }

  const lines = ['## Completeness'];
  if (
    completeness.total_available !== undefined &&
    completeness.total_returned !== undefined
  ) {
    lines.push(
      `Showing ${completeness.total_returned} of ${completeness.total_available} results.`,
    );
  }

  if (completeness.status === 'partial') {
    if (completeness.reason) {
      lines.push(completeness.reason);
    }
  } else {
    lines.push(
      completeness.reason
        ? `Completeness unknown. ${completeness.reason}`
        : 'Completeness unknown.',
    );
  }

  if (completeness.continuation_hint) {
    lines.push(completeness.continuation_hint);
  }

  return lines.join('\n\n');
}

function renderProvenance(viewModel: ViewModelContract): string {
  const { provenance } = viewModel;
  return [
    '---',
    `Source: ${provenance.source_skill} | Scope: ${provenance.scope} | Period: ${formatTimestamp(provenance.period_from, provenance.timezone)} - ${formatTimestamp(provenance.period_to, provenance.timezone)} (${provenance.timezone}) | Produced: ${formatTimestamp(provenance.produced_at, provenance.timezone)}`,
  ].join('\n');
}

export function renderChatMarkdown(viewModel: ViewModelContract): string {
  const sections: string[] = [];

  for (const block of viewModel.blocks) {
    sections.push(renderBlock(block, viewModel.provenance.timezone));
  }

  const warnings = renderWarnings(viewModel);
  if (warnings) {
    sections.push(warnings);
  }

  const completeness = renderCompleteness(viewModel);
  if (completeness) {
    sections.push(completeness);
  }

  sections.push(renderProvenance(viewModel));
  return sections.filter((section) => section.trim().length > 0).join('\n\n');
}
