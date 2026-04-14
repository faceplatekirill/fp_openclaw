export type EvalFixtureType = 'routing' | 'delegation_boundary' | 'edge_case';
export interface EvalFixtureNotSkill {
    skill: string;
    reason: string;
}
export interface EvalFixture {
    id: string;
    type: EvalFixtureType;
    title: string;
    user_intent: string;
    expected_skill: string;
    not_skills: EvalFixtureNotSkill[];
    expected_behavior: string;
    anti_pattern: string;
}
export declare const M0_EVAL_FIXTURES: EvalFixture[];
//# sourceMappingURL=m0-fixtures.d.ts.map