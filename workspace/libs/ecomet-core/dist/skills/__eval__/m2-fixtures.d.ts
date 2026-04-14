export type M2EvalFixtureType = 'routing' | 'output_contract' | 'edge_case';
export interface M2EvalFixtureNotSkill {
    skill: string;
    reason: string;
}
export interface M2EvalFixture {
    id: string;
    type: M2EvalFixtureType;
    title: string;
    user_intent: string;
    expected_skill: string;
    not_skills: M2EvalFixtureNotSkill[];
    expected_behavior: string;
    anti_pattern: string;
}
export declare const M2_EVAL_FIXTURES: M2EvalFixture[];
//# sourceMappingURL=m2-fixtures.d.ts.map