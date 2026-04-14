import { type EcometClient } from '../client/ecomet-client.js';
type FieldValue = string | number | boolean;
export interface AlarmQueryParams {
    time_from: number;
    time_to: number;
    active?: boolean;
    acknowledged?: boolean;
    folders?: string[];
    fields?: Record<string, FieldValue>;
    search?: {
        text: string;
        in: string[];
    };
    select: string[];
    limit?: number;
    offset?: number;
}
export interface AlarmQueryResult {
    total: number;
    alarms: Record<string, unknown>[];
    warnings: string[];
}
export declare function queryAlarms(client: EcometClient, params: AlarmQueryParams): Promise<AlarmQueryResult>;
export {};
//# sourceMappingURL=alarm-query.d.ts.map