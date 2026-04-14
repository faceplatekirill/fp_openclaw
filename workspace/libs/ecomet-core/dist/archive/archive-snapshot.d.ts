import { type EcometClient } from '../client/ecomet-client.js';
export interface GetSnapshotParams {
    archives: string[];
    timestamp: number;
}
export type GetSnapshotResult = Record<string, number | null | undefined>;
export declare function getSnapshot(client: EcometClient, params: GetSnapshotParams): Promise<GetSnapshotResult>;
//# sourceMappingURL=archive-snapshot.d.ts.map