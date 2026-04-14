import { type EcometClient } from '../client/ecomet-client.js';
export interface TagSpec {
    object: string;
    field: string;
}
export interface ResolveArchivesParams {
    tags: TagSpec[];
}
export interface ResolveArchivesResult {
    resolved: Record<string, string>;
    unresolved: string[];
    invalid: string[];
}
export declare function resolveArchives(client: EcometClient, params: ResolveArchivesParams): Promise<ResolveArchivesResult>;
//# sourceMappingURL=archive-resolver.d.ts.map