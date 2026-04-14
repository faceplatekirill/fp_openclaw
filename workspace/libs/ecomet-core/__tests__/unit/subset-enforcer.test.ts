/// <reference path="./node-shim.d.ts" />
import assert from 'assert';
import {
  createEnforcer,
  EcometError,
  ErrorCode,
  SubsetEnforcer,
} from '../../dist/index.js';

const tests = [
  {
    name: 'Allowed skill passes validation',
    run: () => {
      const enforcer = createEnforcer({
        skill_subset: ['scada-alarm-summary'],
        tool_subset: [],
      });

      assert.doesNotThrow(() => enforcer.validateSkillCall('scada-alarm-summary'));
    },
  },
  {
    name: 'Disallowed skill throws INVALID_PARAMS with allowed subset in message',
    run: () => {
      const enforcer = new SubsetEnforcer({
        skill_subset: ['scada-alarm-summary', 'scada-alarm-list'],
        tool_subset: [],
      });

      assert.throws(
        () => enforcer.validateSkillCall('scada-point-history'),
        (error: unknown) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message.includes("Skill 'scada-point-history'") &&
          error.message.includes('scada-alarm-summary, scada-alarm-list'),
      );
    },
  },
  {
    name: 'Allowed tool passes validation',
    run: () => {
      const enforcer = createEnforcer({
        skill_subset: [],
        tool_subset: ['alarm_query'],
      });

      assert.doesNotThrow(() => enforcer.validateToolCall('alarm_query'));
    },
  },
  {
    name: 'Disallowed tool throws INVALID_PARAMS with allowed subset in message',
    run: () => {
      const enforcer = createEnforcer({
        skill_subset: [],
        tool_subset: ['alarm_query'],
      });

      assert.throws(
        () => enforcer.validateToolCall('field_read_history'),
        (error: unknown) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message.includes("Tool 'field_read_history'") &&
          error.message.includes('alarm_query'),
      );
    },
  },
  {
    name: 'Empty subsets reject every skill and tool',
    run: () => {
      const enforcer = createEnforcer({
        skill_subset: [],
        tool_subset: [],
      });

      assert.strictEqual(enforcer.isSkillAllowed('scada-alarm-summary'), false);
      assert.strictEqual(enforcer.isToolAllowed('alarm_query'), false);
      assert.throws(
        () => enforcer.validateSkillCall('scada-alarm-summary'),
        (error: unknown) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message.includes('[(empty)]'),
      );
      assert.throws(
        () => enforcer.validateToolCall('alarm_query'),
        (error: unknown) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message.includes('[(empty)]'),
      );
    },
  },
  {
    name: 'Boolean helpers reflect the configured subsets',
    run: () => {
      const enforcer = createEnforcer({
        skill_subset: ['scada-alarm-summary'],
        tool_subset: ['alarm_query'],
      });

      assert.strictEqual(enforcer.isSkillAllowed('scada-alarm-summary'), true);
      assert.strictEqual(enforcer.isSkillAllowed('scada-point-history'), false);
      assert.strictEqual(enforcer.isToolAllowed('alarm_query'), true);
      assert.strictEqual(enforcer.isToolAllowed('field_read_history'), false);
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
