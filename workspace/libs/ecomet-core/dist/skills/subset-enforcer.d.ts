export interface SubsetPolicy {
    skill_subset: string[];
    tool_subset: string[];
}
export declare class SubsetEnforcer {
    private readonly allowedSkills;
    private readonly allowedTools;
    constructor(policy: SubsetPolicy);
    isSkillAllowed(skillId: string): boolean;
    isToolAllowed(toolId: string): boolean;
    validateSkillCall(skillId: string): void;
    validateToolCall(toolId: string): void;
}
export declare function createEnforcer(policy: SubsetPolicy): SubsetEnforcer;
//# sourceMappingURL=subset-enforcer.d.ts.map