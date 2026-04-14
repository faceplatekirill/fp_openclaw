export { EcometClient, type EcometConfig, type Logger, type ConnectionState, type QueryResult, } from './client/ecomet-client.js';
export { readObjects, type ReadObjectsParams, type ReadObjectsResult, } from './read/object-reader.js';
export { IndexRegistry, type IndexName, type IndexEntry, getPatternIndexes, type PatternIndexesResult, listKnownTypes, listFieldsForType, listFieldsForTypes, getTypeFieldIndexes, type TypesInfoFieldResult, type TypesInfoTypeResult, type TypesInfoResult, } from './query/index-registry.js';
export { searchObjects, type SearchParams, type SearchResult, } from './search/object-search.js';
export { queryAlarms, type AlarmQueryParams, type AlarmQueryResult, } from './alarm/alarm-query.js';
export { readArchives, type ReadArchivesParams, type ReadArchivesResult, type ArchiveDataPoint, type ArchiveSeries, } from './archive/archive-reader.js';
export { getSnapshot, type GetSnapshotParams, type GetSnapshotResult, } from './archive/archive-snapshot.js';
export { getAggregates, type GetAggregatesParams, type GetAggregatesResult, type AggregateSpec, type AggregateValues, } from './archive/archive-aggregates.js';
export { resolveArchives, type ResolveArchivesParams, type ResolveArchivesResult, type TagSpec, } from './archive/archive-resolver.js';
export { fieldReadHistory, type FieldReadHistoryParams, type FieldReadHistoryResult, } from './archive/field-history.js';
export { fieldSnapshot, type FieldSnapshotParams, type FieldSnapshotResult, } from './archive/field-snapshot.js';
export { fieldAggregates, type FieldAggregatesParams, type FieldAggregatesResult, type FieldAggregateTag, } from './archive/field-aggregates.js';
export { validateArchives, validateTimestampMs, validateTimestamps, } from './utils/validators.js';
export { escapeLiteral, dedupePreserveOrder, } from './utils/query-utils.js';
export { EcometError, ErrorCode, wrapError, formatError, formatErrorForLog, } from './utils/errors.js';
export { type ViewModelKind, type WarningSeverity, type ViewModelWarning, type ViewModelProvenance, type CompletenessStatus, type ViewModelCompleteness, type HistoryBlock, type SnapshotBlock, type AggregateRow, type AggregateTableBlock, type AlarmEntry, type AlarmListBlock, type AlarmSummaryMetrics, type AlarmSummaryBlock, type ScopeEntry, type ScopeBlock, type CoverageEntry, type CoverageBlock, type ViewModelBlock, type ViewModelContract, } from './skills/view-model.js';
export { DEFAULT_FAILURE_POLICY, type ExecutionMode, type CompletionPolicy, type FailurePolicy, type TaskBrief, type BootstrapCutover, type DelegationContract, type SkillRegistration, } from './skills/execution-contract.js';
export { SubsetEnforcer, createEnforcer, type SubsetPolicy, } from './skills/subset-enforcer.js';
//# sourceMappingURL=index.d.ts.map