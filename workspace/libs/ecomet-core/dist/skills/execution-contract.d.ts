import type { ViewModelKind } from './view-model.js';
export type ExecutionMode = 'direct' | 'orchestrated' | 'delegated';
export type CompletionPolicy = 'complete' | 'partial_with_warnings' | 'needs_clarification' | 'failed';
export interface FailurePolicy {
    surface_failure: boolean;
    include_partial_results: boolean;
    auto_retry: boolean;
    max_retries?: number;
    return_to_supervisor: boolean;
}
export declare const DEFAULT_FAILURE_POLICY: FailurePolicy;
export interface TaskBrief {
    skill_id: string;
    intent: string;
    scope: {
        objects?: string[];
        patterns?: string[];
        folders?: string[];
    };
    period?: {
        from: number;
        to: number;
        timezone: string;
    };
    filters?: Record<string, unknown>;
    input_artifacts?: Record<string, unknown>[];
}
export interface BootstrapCutover {
    condition: string;
    bootstrap_tools: string[];
}
export interface DelegationContract {
    task_brief: TaskBrief;
    execution_mode: ExecutionMode;
    owner_agent: string;
    delegate_agent?: string;
    skill_subset: string[];
    tool_subset: string[];
    failure_policy: FailurePolicy;
    completion_policy: CompletionPolicy;
    bootstrap_cutover?: BootstrapCutover;
    output_artifact?: string;
    review_required: boolean;
    escalation_conditions?: string[];
}
export interface SkillRegistration {
    id: string;
    name: string;
    output_kind: ViewModelKind;
    execution_mode: ExecutionMode;
    owner_agent: string;
    delegate_agent?: string;
    dependencies: string[];
    trigger_description: string;
    negative_triggers: string[];
}
//# sourceMappingURL=execution-contract.d.ts.map