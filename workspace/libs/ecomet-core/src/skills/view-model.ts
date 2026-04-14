export type ViewModelKind =
  | 'history_view'
  | 'snapshot_view'
  | 'aggregate_table'
  | 'alarm_list'
  | 'alarm_summary'
  | 'scope_view'
  | 'coverage_view';

export type WarningSeverity = 'info' | 'warning' | 'error';

export interface ViewModelWarning {
  severity: WarningSeverity;
  message: string;
  code?: string;
  context?: Record<string, unknown>;
}

export interface ViewModelProvenance {
  source_skill: string;
  scope: string;
  period_from: number;
  period_to: number;
  timezone: string;
  produced_at: number;
}

export type CompletenessStatus = 'complete' | 'partial' | 'unknown';

export interface ViewModelCompleteness {
  status: CompletenessStatus;
  reason?: string;
  total_available?: number;
  total_returned?: number;
  continuation_hint?: string;
}

export interface HistoryBlock {
  block_kind: 'history';
  tag: string;
  label?: string;
  unit?: string;
  data: Array<[number, number | null]>;
  last_change?: number;
  notes?: string[];
}

export interface SnapshotBlock {
  block_kind: 'snapshot';
  timestamp: number;
  values: Record<string, number | null>;
  unresolved?: string[];
  invalid?: string[];
}

export interface AggregateRow {
  period_from: number;
  period_to: number;
  values: Record<string, number | null | undefined>;
}

export interface AggregateTableBlock {
  block_kind: 'aggregate_table';
  tag: string;
  label?: string;
  unit?: string;
  functions: string[];
  rows: AggregateRow[];
  bucket_description?: string;
  caveats?: string[];
}

export interface AlarmEntry {
  path: string;
  source?: string;
  message?: string;
  timestamp: number;
  state?: string;
  priority?: string | number;
  extra?: Record<string, unknown>;
}

export interface AlarmListBlock {
  block_kind: 'alarm_list';
  alarms: AlarmEntry[];
  total: number;
}

export interface AlarmSummaryMetrics {
  total_alarms: number;
  alarms_per_hour: number;
  top_offenders: Array<{ source: string; count: number; percentage: number }>;
  flood_periods: Array<{ from: number; to: number; rate_per_hour: number }>;
  standing_alarms: Array<{ source: string; message?: string; since: number }>;
  chattering_alarms: Array<{ source: string; count: number; avg_duration_ms?: number }>;
}

export interface AlarmSummaryBlock {
  block_kind: 'alarm_summary';
  metrics: AlarmSummaryMetrics;
  priority_distribution?: Record<string, number>;
  category_distribution?: Record<string, number>;
}

export interface ScopeEntry {
  path: string;
  name?: string;
  pattern?: string;
  fields?: Record<string, unknown>;
}

export interface ScopeBlock {
  block_kind: 'scope';
  objects: ScopeEntry[];
  total: number;
  type_summary?: Record<string, number>;
}

export interface CoverageEntry {
  tag: string;
  archived: boolean;
  archive_path?: string;
  notes?: string[];
}

export interface CoverageBlock {
  block_kind: 'coverage';
  entries: CoverageEntry[];
  summary: {
    total: number;
    archived: number;
    not_archived: number;
    invalid: number;
  };
}

export type ViewModelBlock =
  | HistoryBlock
  | SnapshotBlock
  | AggregateTableBlock
  | AlarmListBlock
  | AlarmSummaryBlock
  | ScopeBlock
  | CoverageBlock;

export interface ViewModelContract {
  kind: ViewModelKind;
  blocks: ViewModelBlock[];
  warnings: ViewModelWarning[];
  provenance: ViewModelProvenance;
  completeness: ViewModelCompleteness;
  metadata?: Record<string, unknown>;
}
