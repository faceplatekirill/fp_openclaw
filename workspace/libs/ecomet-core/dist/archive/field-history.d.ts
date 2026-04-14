import { type EcometClient } from '../client/ecomet-client.js';
import { type ArchiveSeries } from './archive-reader.js';
import { type TagSpec } from './archive-resolver.js';
export interface FieldReadHistoryParams {
    tags: TagSpec[];
    from: number;
    to: number;
}
export interface FieldReadHistoryResult {
    values: Record<string, ArchiveSeries>;
    invalid: string[];
    unresolved: string[];
}
export declare function fieldReadHistory(client: EcometClient, params: FieldReadHistoryParams): Promise<FieldReadHistoryResult>;
//# sourceMappingURL=field-history.d.ts.map