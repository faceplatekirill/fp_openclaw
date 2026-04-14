import { type EcometClient } from '../client/ecomet-client.js';
export interface ReadObjectsParams {
    objects: string[];
    fields: string[];
}
export type ReadObjectsResult = Record<string, Record<string, unknown> | null>;
export declare function readObjects(client: EcometClient, params: ReadObjectsParams): Promise<ReadObjectsResult>;
//# sourceMappingURL=object-reader.d.ts.map