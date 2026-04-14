import { type EcometClient } from '../client/ecomet-client.js';
import { type IndexRegistry } from '../query/index-registry.js';
type FieldValue = string | number | boolean;
export interface SearchParams {
    pattern?: string | string[];
    folder?: string;
    recursive?: boolean;
    fields?: Record<string, FieldValue>;
    search?: {
        text: string;
        in: string[];
    };
    select: string[];
    limit?: number;
    offset?: number;
}
export interface SearchResult {
    total: number;
    objects: Record<string, unknown>[];
    warnings: string[];
}
export declare function searchObjects(client: EcometClient, registry: IndexRegistry, params: SearchParams): Promise<SearchResult>;
export {};
//# sourceMappingURL=object-search.d.ts.map