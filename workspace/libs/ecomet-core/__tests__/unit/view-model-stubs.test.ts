/// <reference path="./node-shim.d.ts" />
import assert from 'assert';
import { buildStubHistoryView } from '../../dist/skills/__stubs__/data-skill-stub.js';
import { renderStubToMarkdown } from '../../dist/skills/__stubs__/presentation-skill-stub.js';

const tests = [
  {
    name: 'buildStubHistoryView returns a history_view contract',
    run: () => {
      const viewModel = buildStubHistoryView();

      assert.strictEqual(viewModel.kind, 'history_view');
      assert.ok(Array.isArray(viewModel.blocks));
      assert.ok(viewModel.blocks.length >= 1);
    },
  },
  {
    name: 'Stub view model contains warnings, provenance, and completeness',
    run: () => {
      const viewModel = buildStubHistoryView();

      assert.ok(viewModel.warnings.length >= 1);
      assert.strictEqual(typeof viewModel.provenance.source_skill, 'string');
      assert.strictEqual(typeof viewModel.provenance.timezone, 'string');
      assert.strictEqual(typeof viewModel.completeness.status, 'string');
    },
  },
  {
    name: 'renderStubToMarkdown produces non-empty markdown',
    run: () => {
      const markdown = renderStubToMarkdown(buildStubHistoryView());

      assert.strictEqual(typeof markdown, 'string');
      assert.ok(markdown.trim().length > 0);
      assert.ok(markdown.includes('# History View'));
    },
  },
  {
    name: 'renderStubToMarkdown includes warning text',
    run: () => {
      const warningMessage = buildStubHistoryView().warnings[0].message;
      const markdown = renderStubToMarkdown(buildStubHistoryView());

      assert.ok(markdown.includes(warningMessage));
      assert.ok(markdown.includes('Completeness: complete'));
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
