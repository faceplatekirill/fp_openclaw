import assert from 'assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runSkill } from '../../dist/index.js';

function createWorkspaceDir(): string {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-core-workspace-'));
  fs.mkdirSync(path.join(workspaceDir, 'skills'), { recursive: true });
  return workspaceDir;
}

function writeSkillModule(workspaceDir: string, skill: string, source: string): string {
  const skillDir = path.join(workspaceDir, 'skills', skill);
  fs.mkdirSync(skillDir, { recursive: true });
  const modulePath = path.join(skillDir, 'index.js');
  fs.writeFileSync(modulePath, source, 'utf8');
  return modulePath;
}

function createViewModelSource(message: string): string {
  return `module.exports = async function () {
  return {
    kind: 'history_view',
    blocks: [
      {
        block_kind: 'history',
        tag: '/root/FP/PROJECT/POINT:value',
        label: ${JSON.stringify(message)},
        data: [[1741435200000, 1]],
        notes: ['${message}']
      }
    ],
    warnings: [
      {
        severity: 'warning',
        message: 'test warning'
      }
    ],
    provenance: {
      source_skill: 'scada-point-history',
      scope: '/root/FP/PROJECT/POINT:value',
      period_from: 1741435200000,
      period_to: 1741438800000,
      timezone: 'UTC',
      produced_at: 1741438860000
    },
    completeness: {
      status: 'partial',
      reason: 'test partial'
    }
  };
};`;
}

const runnerOptions = (workspaceDir: string) => ({
  workspaceDir,
  client: {} as any,
  indexRegistry: {} as any,
});

const tests = [
  {
    name: 'Valid skill resolution returns parsable ViewModel JSON',
    run: async () => {
      const workspaceDir = createWorkspaceDir();
      writeSkillModule(workspaceDir, 'scada-point-history', createViewModelSource('json mode'));

      const text = await runSkill(
        {
          skill: 'scada-point-history',
          params: { tags: [] },
          format: 'json',
        },
        runnerOptions(workspaceDir),
      );

      const parsed = JSON.parse(text);
      assert.strictEqual(parsed.kind, 'history_view');
      assert.strictEqual(parsed.blocks[0].label, 'json mode');
    },
  },
  {
    name: 'Path traversal attempts are rejected before module loading',
    run: async () => {
      const workspaceDir = createWorkspaceDir();

      await assert.rejects(async () =>
        runSkill(
          {
            skill: '../outside',
            params: {},
          },
          runnerOptions(workspaceDir),
        ),
      );
    },
  },
  {
    name: 'Unknown skills produce a clear error',
    run: async () => {
      const workspaceDir = createWorkspaceDir();

      await assert.rejects(async () =>
        runSkill(
          {
            skill: 'does-not-exist',
            params: {},
          },
          runnerOptions(workspaceDir),
        ),
      );
    },
  },
  {
    name: 'Chat format returns rendered markdown instead of JSON text',
    run: async () => {
      const workspaceDir = createWorkspaceDir();
      writeSkillModule(workspaceDir, 'scada-point-history', createViewModelSource('chat mode'));

      const text = await runSkill(
        {
          skill: 'scada-point-history',
          params: { tags: [] },
          format: 'chat',
        },
        runnerOptions(workspaceDir),
      );

      assert.ok(text.includes('### chat mode'));
      assert.ok(text.includes('## Warnings'));
      assert.ok(!text.trim().startsWith('"'));
    },
  },
  {
    name: 'Module cache invalidation reloads edited skill code on the next call',
    run: async () => {
      const workspaceDir = createWorkspaceDir();
      const modulePath = writeSkillModule(
        workspaceDir,
        'scada-point-history',
        createViewModelSource('first load'),
      );

      const first = await runSkill(
        {
          skill: 'scada-point-history',
          params: {},
          format: 'json',
        },
        runnerOptions(workspaceDir),
      );

      fs.writeFileSync(modulePath, createViewModelSource('second load'), 'utf8');

      const second = await runSkill(
        {
          skill: 'scada-point-history',
          params: {},
          format: 'json',
        },
        runnerOptions(workspaceDir),
      );

      assert.strictEqual(JSON.parse(first).blocks[0].label, 'first load');
      assert.strictEqual(JSON.parse(second).blocks[0].label, 'second load');
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
