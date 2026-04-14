/// <reference path="./node-shim.d.ts" />
import assert from 'assert';
import { M1_EVAL_FIXTURES } from '../../dist/skills/__eval__/m1-fixtures.js';

const tests = [
  {
    name: 'Fixture set contains the full Milestone 1 routing output and edge list',
    run: () => {
      assert.strictEqual(M1_EVAL_FIXTURES.length, 25);
      assert.deepStrictEqual(
        M1_EVAL_FIXTURES.map((fixture) => fixture.id),
        [
          'RF-1',
          'RF-2',
          'RF-3',
          'RF-4',
          'RF-5',
          'RF-6',
          'RF-7',
          'RF-8',
          'RF-9',
          'OF-1',
          'OF-2',
          'OF-3',
          'OF-4',
          'OF-5',
          'OF-6',
          'OF-7',
          'EF-1',
          'EF-2',
          'EF-3',
          'EF-4',
          'EF-5',
          'EF-6',
          'EF-7',
          'EF-8',
          'EF-9',
        ],
      );
    },
  },
  {
    name: 'Fixture type coverage matches routing output and edge expectations',
    run: () => {
      const counts = M1_EVAL_FIXTURES.reduce<Record<string, number>>((acc, fixture) => {
        acc[fixture.type] = (acc[fixture.type] ?? 0) + 1;
        return acc;
      }, {});

      assert.deepStrictEqual(counts, {
        routing: 9,
        output_contract: 7,
        edge_case: 9,
      });
    },
  },
  {
    name: 'Every M1 fixture carries guardrails and anti-pattern guidance',
    run: () => {
      for (const fixture of M1_EVAL_FIXTURES) {
        assert.ok(fixture.expected_skill.length > 0);
        assert.ok(fixture.not_skills.length > 0);
        assert.ok(fixture.expected_behavior.length > 0);
        assert.ok(fixture.anti_pattern.length > 0);
      }
    },
  },
];

async function runTests() {
  let passed = 0;
  let failed = 0;

  for (let index = 0; index < tests.length; index += 1) {
    const test = tests[index];
    try {
      await test.run();
      passed += 1;
      console.log(`PASS ${index + 1}: ${test.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${index + 1}: ${test.name}`);
      console.error(error);
    }
  }

  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((error) => {
  console.error('Test suite error:', error);
  process.exit(1);
});
