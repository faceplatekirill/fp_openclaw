import { type EcometClient } from '../client/ecomet-client.js';
import { type TagSpec } from './archive-resolver.js';
export interface FieldAggregateTag extends TagSpec {
    functions: string[];
}
export interface FieldAggregatesParams {
    tags: FieldAggregateTag[];
    timestamps: number[];
}
export interface FieldAggregatesResult {
    values: Record<string, Record<string, Record<string, number | null | undefined>>>;
    invalid: string[];
    unresolved: string[];
}
export declare function fieldAggregates(client: EcometClient, params: FieldAggregatesParams): Promise<FieldAggregatesResult>;
//# sourceMappingURL=field-aggregates.d.ts.map