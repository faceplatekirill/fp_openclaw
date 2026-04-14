const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TIMEZONE = 'UTC';
const TIMESTAMP_FORMATTERS = new Map();

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getFormatter(timezone) {
  const key = timezone || DEFAULT_TIMEZONE;
  if (!TIMESTAMP_FORMATTERS.has(key)) {
    TIMESTAMP_FORMATTERS.set(
      key,
      new Intl.DateTimeFormat('en-CA', {
        timeZone: key,
        calendar: 'iso8601',
        numberingSystem: 'latn',
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    );
  }

  return TIMESTAMP_FORMATTERS.get(key);
}

function formatTimestamp(timestamp, timezone) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return '';
  }

  const parts = getFormatter(timezone).formatToParts(new Date(timestamp));
  const values = {};
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

function formatFilenameTimestamp(timestamp, timezone) {
  return formatTimestamp(timestamp, timezone).replace(/[-:\s]/g, '').replace(/(\d{8})(\d{6})/, '$1T$2');
}

function csvCell(value) {
  const normalized =
    value === null
      ? 'null'
      : value === undefined
        ? ''
        : typeof value === 'boolean'
          ? (value ? 'true' : 'false')
          : String(value);

  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function csvRow(values) {
  return values.map((value) => csvCell(value)).join(',');
}

function createSection(title, headers, rows) {
  return { title, headers, rows };
}

function serializeAlarmListBlock(block, timezone) {
  return [
    createSection(null, ['Timestamp', 'Object', 'Type', 'Message', 'State'], block.alarms.map((alarm) => [
      formatTimestamp(alarm.timestamp, timezone),
      alarm.path ?? '',
      alarm.source ?? '',
      alarm.message ?? '',
      alarm.state ?? '',
    ])),
  ];
}

function serializeAlarmSummaryBlock(block, timezone) {
  return [
    createSection('Overview', ['Metric', 'Value'], [
      ['Total Alarms', block.metrics.total_alarms],
      ['Alarms/Hour', block.metrics.alarms_per_hour],
    ]),
    createSection(
      'Top Offenders',
      ['Source', 'Count', 'Percentage'],
      block.metrics.top_offenders.map((entry) => [entry.source, entry.count, entry.percentage]),
    ),
    createSection(
      'Flood Periods',
      ['From', 'To', 'Rate Per Hour'],
      block.metrics.flood_periods.map((entry) => [
        formatTimestamp(entry.from, timezone),
        formatTimestamp(entry.to, timezone),
        entry.rate_per_hour,
      ]),
    ),
    createSection(
      'Standing Alarms',
      ['Source', 'Message', 'Since'],
      block.metrics.standing_alarms.map((entry) => [
        entry.source,
        entry.message ?? '',
        formatTimestamp(entry.since, timezone),
      ]),
    ),
    createSection(
      'Chattering Alarms',
      ['Source', 'Count', 'Avg Duration Ms'],
      block.metrics.chattering_alarms.map((entry) => [
        entry.source,
        entry.count,
        entry.avg_duration_ms ?? '',
      ]),
    ),
    createSection(
      'Priority Distribution',
      ['Category', 'Count'],
      Object.entries(block.priority_distribution ?? {}).map(([name, count]) => [name, count]),
    ),
    createSection(
      'Category Distribution',
      ['Category', 'Count'],
      Object.entries(block.category_distribution ?? {}).map(([name, count]) => [name, count]),
    ),
  ];
}

function serializeHistoryBlock(block, timezone) {
  const headers = ['Timestamp', 'Value'];
  if (block.unit) {
    headers.push('Unit');
  }

  return [
    createSection(
      null,
      headers,
      block.data.map(([timestamp, value]) => {
        const row = [formatTimestamp(timestamp, timezone), value];
        if (block.unit) {
          row.push(block.unit);
        }
        return row;
      }),
    ),
  ];
}

function serializeAggregateTableBlock(block, timezone) {
  return [
    createSection(
      null,
      ['Period From', 'Period To', ...block.functions],
      block.rows.map((row) => [
        formatTimestamp(row.period_from, timezone),
        formatTimestamp(row.period_to, timezone),
        ...block.functions.map((name) => row.values?.[name] ?? ''),
      ]),
    ),
  ];
}

function serializeSnapshotBlock(block, timezone) {
  return [
    createSection(
      null,
      ['Tag', 'Value', 'Timestamp'],
      Object.entries(block.values ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([tag, value]) => [tag, value, formatTimestamp(block.timestamp, timezone)]),
    ),
  ];
}

function serializeScopeBlock(block) {
  return [
    createSection(
      null,
      ['Name', 'Pattern', 'Path'],
      block.objects.map((object) => [object.name ?? '', object.pattern ?? '', object.path ?? '']),
    ),
  ];
}

function serializeCoverageBlock(block) {
  return [
    createSection(
      null,
      ['Tag', 'Archived', 'Archive Path'],
      block.entries.map((entry) => [entry.tag ?? '', entry.archived, entry.archive_path ?? '']),
    ),
  ];
}

function serializeBlock(block, timezone) {
  switch (block.block_kind) {
    case 'alarm_list':
      return serializeAlarmListBlock(block, timezone);
    case 'alarm_summary':
      return serializeAlarmSummaryBlock(block, timezone);
    case 'history':
      return serializeHistoryBlock(block, timezone);
    case 'aggregate_table':
      return serializeAggregateTableBlock(block, timezone);
    case 'snapshot':
      return serializeSnapshotBlock(block, timezone);
    case 'scope':
      return serializeScopeBlock(block);
    case 'coverage':
      return serializeCoverageBlock(block);
    default:
      throw new Error(`Unsupported block kind: ${String(block.block_kind)}. Cannot serialize.`);
  }
}

function validateViewModel(value) {
  if (!isRecord(value)) {
    throw new Error('params.data is required and must be a ViewModelContract object');
  }

  if (
    typeof value.kind !== 'string' ||
    !Array.isArray(value.blocks) ||
    !Array.isArray(value.warnings) ||
    !isRecord(value.provenance) ||
    !isRecord(value.completeness)
  ) {
    throw new Error('params.data must have kind, blocks, warnings, provenance, and completeness fields');
  }

  return value;
}

function validateFilename(filename) {
  if (filename === undefined) {
    return undefined;
  }

  if (typeof filename !== 'string' || !filename.endsWith('.csv')) {
    throw new Error('filename must end in .csv when provided');
  }

  return path.basename(filename);
}

function generateDefaultFilename(viewModel) {
  const timezone =
    typeof viewModel.provenance.timezone === 'string' && viewModel.provenance.timezone.length > 0
      ? viewModel.provenance.timezone
      : DEFAULT_TIMEZONE;
  return `${viewModel.kind}_${formatFilenameTimestamp(Date.now(), timezone)}.csv`;
}

function buildFooterRows(viewModel, warnings) {
  const footerRows = [
    [],
    ['# Warnings'],
    ['severity', 'message'],
  ];

  for (const warning of warnings) {
    footerRows.push([warning.severity ?? '', warning.message ?? '']);
  }

  footerRows.push([]);
  footerRows.push(['# Provenance']);
  footerRows.push(['Source', viewModel.provenance.source_skill ?? '']);
  footerRows.push(['Scope', viewModel.provenance.scope ?? '']);
  footerRows.push([
    'Period',
    `${formatTimestamp(viewModel.provenance.period_from, viewModel.provenance.timezone ?? DEFAULT_TIMEZONE)} - ${formatTimestamp(viewModel.provenance.period_to, viewModel.provenance.timezone ?? DEFAULT_TIMEZONE)}`,
  ]);
  footerRows.push(['Timezone', viewModel.provenance.timezone ?? DEFAULT_TIMEZONE]);

  return footerRows;
}

function renderCsv(viewModel, warnings) {
  const timezone =
    typeof viewModel.provenance.timezone === 'string' && viewModel.provenance.timezone.length > 0
      ? viewModel.provenance.timezone
      : DEFAULT_TIMEZONE;
  const rows = [];
  const multiBlock = viewModel.blocks.length > 1;

  for (const block of viewModel.blocks) {
    if (rows.length > 0) {
      rows.push([]);
    }

    if (multiBlock) {
      rows.push([`# Block: ${block.block_kind}`]);
      rows.push([]);
    }

    for (const section of serializeBlock(block, timezone)) {
      if (section.title) {
        rows.push([section.title]);
      }
      rows.push(section.headers);
      if (section.rows.length > 0) {
        rows.push(...section.rows);
      }

      rows.push([]);
    }
  }

  while (rows.length > 0 && rows[rows.length - 1].length === 0) {
    rows.pop();
  }

  rows.push(...buildFooterRows(viewModel, warnings));

  return `\uFEFF${rows.map((row) => csvRow(row)).join('\r\n')}\r\n`;
}

module.exports = async function runReportSpreadsheetExport({ params }) {
  if (!isRecord(params)) {
    throw new Error('params.data is required and must be a ViewModelContract object');
  }

  const viewModel = validateViewModel(params.data);
  const filename = validateFilename(params.filename) ?? generateDefaultFilename(viewModel);
  const outputWarnings = [...viewModel.warnings];

  if (viewModel.completeness?.status && viewModel.completeness.status !== 'complete') {
    outputWarnings.push({
      severity: 'warning',
      message: 'Source data was partial; exported subset only.',
      code: 'partial_source_export',
    });
  }

  const csvContent = renderCsv(viewModel, outputWarnings);
  const exportDir = path.resolve(__dirname, '..', '..', 'exports');
  const exportPath = path.join(exportDir, filename);

  try {
    fs.mkdirSync(exportDir, { recursive: true });
    fs.writeFileSync(exportPath, csvContent, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write export file: ${message}`);
  }

  const stat = fs.statSync(exportPath);

  return {
    kind: 'scope_view',
    blocks: [
      {
        block_kind: 'scope',
        objects: [
          {
            path: exportPath,
            name: filename,
            pattern: 'csv_export',
          },
        ],
        total: 1,
      },
    ],
    warnings: outputWarnings,
    provenance: {
      source_skill: 'report-spreadsheet-export',
      scope: viewModel.provenance.scope ?? 'export',
      period_from:
        typeof viewModel.provenance.period_from === 'number'
          ? viewModel.provenance.period_from
          : Date.now(),
      period_to:
        typeof viewModel.provenance.period_to === 'number'
          ? viewModel.provenance.period_to
          : Date.now(),
      timezone:
        typeof viewModel.provenance.timezone === 'string'
          ? viewModel.provenance.timezone
          : DEFAULT_TIMEZONE,
      produced_at: Date.now(),
    },
    completeness: { status: 'complete' },
    metadata: {
      export_path: exportPath,
      format: 'csv',
      size_bytes: stat.size,
      source_kind: viewModel.kind,
    },
  };
};
