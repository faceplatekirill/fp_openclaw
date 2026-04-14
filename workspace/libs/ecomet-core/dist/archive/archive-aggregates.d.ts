import { type EcometClient } from '../client/ecomet-client.js';
export type AggregateSpec = [string, string];
export interface GetAggregatesParams {
    aggregates: AggregateSpec[];
    timestamps: number[];
}
export type AggregateValues = Record<string, Record<string, number | null | undefined>>;
export interface GetAggregatesResult {
    values: Record<string, AggregateValues>;
    invalid: Record<string, boolean>;
}
export declare function getAggregates(client: EcometClient, params: GetAggregatesParams): Promise<GetAggregatesResult>;
//# sourceMappingURL=archive-aggregates.d.ts.map