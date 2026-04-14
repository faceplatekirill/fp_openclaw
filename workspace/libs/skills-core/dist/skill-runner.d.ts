import type { EcometClient, IndexRegistry } from '../../ecomet-core/dist/index.js';
export type SkillRunFormat = 'json' | 'chat';
export interface SkillRunRequest {
    skill: string;
    params?: Record<string, unknown>;
    format?: SkillRunFormat;
}
export interface SkillModuleContext {
    client: EcometClient;
    indexRegistry: IndexRegistry;
    params: Record<string, unknown>;
}
export interface SkillRunnerOptions {
    apiConfig?: unknown;
    workspaceDir?: string;
    client: EcometClient;
    indexRegistry: IndexRegistry;
}
export declare function runSkill(request: SkillRunRequest, options: SkillRunnerOptions): Promise<string>;
//# sourceMappingURL=skill-runner.d.ts.map