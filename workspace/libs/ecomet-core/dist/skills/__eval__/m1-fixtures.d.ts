export type M1EvalFixtureType = 'routing' | 'output_contract' | 'edge_case';
export interface M1EvalFixtureNotSkill {
    skill: string;
    reason: string;
}
export interface M1EvalFixture {
    id: string;
    type: M1EvalFixtureType;
    title: string;
    user_intent: string;
    expected_skill: string;
    not_skills: M1EvalFixtureNotSkill[];
    expected_behavior: string;
    anti_pattern: string;
}
export declare const M1_EVAL_FIXTURES: M1EvalFixture[];
//# sourceMappingURL=m1-fixtures.d.ts.map