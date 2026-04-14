import { type EcometClient } from '../client/ecomet-client.js';
type IndexType = 'simple' | '3gram' | 'datetime';
export type IndexName = IndexType;
export interface IndexEntry {
    /** Field has a simple (exact-match) index */
    simple: boolean;
    /** Field has a 3gram (substring) index */
    trigram: boolean;
    /** Field has a datetime (range) index */
    datetime: boolean;
}
export interface PatternIndexesResult {
    pattern: string;
    fields: Record<string, IndexEntry>;
}
export type TypesInfoFieldResult = IndexName[] | 'invalid field';
export type TypesInfoTypeResult = Record<string, TypesInfoFieldResult> | 'invalid type';
export type TypesInfoResult = Record<string, TypesInfoTypeResult>;
export declare class IndexRegistry {
    private readonly client;
    private patterns;
    private missingPatterns;
    constructor(client: EcometClient);
    init(): Promise<void>;
    update(): Promise<void>;
    loadPattern(patternPath: string): Promise<boolean>;
    hasPattern(patternPath: string): boolean;
    getFieldIndex(patternPath: string, fieldName: string): IndexEntry | null;
    private fetchAllPatterns;
    private replacePatterns;
}
export declare function listKnownTypes(registry: IndexRegistry): string[];
export declare function listFieldsForType(registry: IndexRegistry, patternPath: string): Promise<Record<string, IndexName[]> | null>;
export declare function listFieldsForTypes(registry: IndexRegistry, patternPaths: string[]): Promise<Record<string, Record<string, IndexName[]> | 'invalid type'>>;
export declare function getTypeFieldIndexes(registry: IndexRegistry, patternPath: string, fieldNames: string[]): Promise<Record<string, TypesInfoFieldResult> | 'invalid type'>;
export declare function getPatternIndexes(registry: IndexRegistry, patternPath: string): Promise<PatternIndexesResult>;
export {};
//# sourceMappingURL=index-registry.d.ts.map