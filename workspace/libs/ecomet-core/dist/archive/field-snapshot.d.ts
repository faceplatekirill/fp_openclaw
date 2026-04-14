import { type EcometClient } from '../client/ecomet-client.js';
import { type TagSpec } from './archive-resolver.js';
export interface FieldSnapshotParams {
    tags: TagSpec[];
    timestamp: number;
}
export interface FieldSnapshotResult {
    values: Record<string, number | null>;
    invalid: string[];
    unresolved: string[];
}
export declare function fieldSnapshot(client: EcometClient, params: FieldSnapshotParams): Promise<FieldSnapshotResult>;
//# sourceMappingURL=field-snapshot.d.ts.map