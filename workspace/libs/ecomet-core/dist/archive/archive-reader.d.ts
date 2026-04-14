import { type EcometClient } from '../client/ecomet-client.js';
export interface ReadArchivesParams {
    archives: string[];
    from: number;
    to: number;
}
export type ArchiveDataPoint = [number, number | null];
export type ArchiveSeries = ArchiveDataPoint[];
export type ReadArchivesResult = Record<string, ArchiveSeries>;
export declare function readArchives(client: EcometClient, params: ReadArchivesParams): Promise<ReadArchivesResult>;
//# sourceMappingURL=archive-reader.d.ts.map