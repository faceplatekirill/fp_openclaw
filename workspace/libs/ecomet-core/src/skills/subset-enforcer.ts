import { EcometError, ErrorCode } from '../utils/errors.js';

export interface SubsetPolicy {
  skill_subset: string[];
  tool_subset: string[];
}

function formatAllowedSubset(values: Set<string>): string {
  return [...values].join(', ') || '(empty)';
}

export class SubsetEnforcer {
  private readonly allowedSkills: Set<string>;
  private readonly allowedTools: Set<string>;

  constructor(policy: SubsetPolicy) {
    this.allowedSkills = new Set(policy.skill_subset);
    this.allowedTools = new Set(policy.tool_subset);
  }

  isSkillAllowed(skillId: string): boolean {
    return this.allowedSkills.has(skillId);
  }

  isToolAllowed(toolId: string): boolean {
    return this.allowedTools.has(toolId);
  }

  validateSkillCall(skillId: string): void {
    if (!this.isSkillAllowed(skillId)) {
      throw new EcometError(
        `Skill '${skillId}' is not in the allowed subset: [${formatAllowedSubset(this.allowedSkills)}]`,
        ErrorCode.INVALID_PARAMS,
        {
          rejected_skill: skillId,
          allowed_skill_subset: [...this.allowedSkills],
        },
      );
    }
  }

  validateToolCall(toolId: string): void {
    if (!this.isToolAllowed(toolId)) {
      throw new EcometError(
        `Tool '${toolId}' is not in the allowed subset: [${formatAllowedSubset(this.allowedTools)}]`,
        ErrorCode.INVALID_PARAMS,
        {
          rejected_tool: toolId,
          allowed_tool_subset: [...this.allowedTools],
        },
      );
    }
  }
}

export function createEnforcer(policy: SubsetPolicy): SubsetEnforcer {
  return new SubsetEnforcer(policy);
}
