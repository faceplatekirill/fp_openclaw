import { EcometError, ErrorCode } from '../utils/errors.js';
function formatAllowedSubset(values) {
    return [...values].join(', ') || '(empty)';
}
export class SubsetEnforcer {
    allowedSkills;
    allowedTools;
    constructor(policy) {
        this.allowedSkills = new Set(policy.skill_subset);
        this.allowedTools = new Set(policy.tool_subset);
    }
    isSkillAllowed(skillId) {
        return this.allowedSkills.has(skillId);
    }
    isToolAllowed(toolId) {
        return this.allowedTools.has(toolId);
    }
    validateSkillCall(skillId) {
        if (!this.isSkillAllowed(skillId)) {
            throw new EcometError(`Skill '${skillId}' is not in the allowed subset: [${formatAllowedSubset(this.allowedSkills)}]`, ErrorCode.INVALID_PARAMS, {
                rejected_skill: skillId,
                allowed_skill_subset: [...this.allowedSkills],
            });
        }
    }
    validateToolCall(toolId) {
        if (!this.isToolAllowed(toolId)) {
            throw new EcometError(`Tool '${toolId}' is not in the allowed subset: [${formatAllowedSubset(this.allowedTools)}]`, ErrorCode.INVALID_PARAMS, {
                rejected_tool: toolId,
                allowed_tool_subset: [...this.allowedTools],
            });
        }
    }
}
export function createEnforcer(policy) {
    return new SubsetEnforcer(policy);
}
//# sourceMappingURL=subset-enforcer.js.map