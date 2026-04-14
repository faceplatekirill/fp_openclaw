import assert from 'assert';

import register from '../../index.js';
import { EcometClient } from '../../../../libs/ecomet-core/dist/index.js';

type RegisteredTool = {
  name: string;
  execute: (id: string, params: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
};

function createApi() {
  const tools = new Map<string, RegisteredTool>();

  return {
    tools,
    config: {
      agents: {
        defaults: {
          workspace: '/home/roman/.openclaw/workspace',
        },
      },
      plugins: {
        entries: {
          'ecomet-connector': {
            config: {
              hosts: ['127.0.0.1:9000'],
              protocol: 'ws:',
              login: 'test',
              password: 'test',
            },
          },
        },
      },
    },
    logger: {
      warn() {},
      error() {},
      info() {},
    },
    registerGatewayMethod() {},
    registerCommand() {},
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
  };
}

async function withMockedRuntime(run: () => Promise<void>) {
  const originalSetInterval = globalThis.setInterval;
  const originalQueryObjects = EcometClient.prototype.queryObjects;
  const originalApplication = EcometClient.prototype.application;

  globalThis.setInterval = ((handler: TimerHandler, _timeout?: number) => {
    void handler;
    return 0 as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval;

  EcometClient.prototype.queryObjects = async function queryObjects() {
    return { objects: [] };
  } as typeof EcometClient.prototype.queryObjects;

  EcometClient.prototype.application = async function application(
    _module: string,
    method: string,
  ) {
    if (method === 'get_tags_archive') {
      return {
        tags: {
          '/root/FP/PROJECT/POINT_OK': {
            value: '/root/FP/PROJECT/POINT_OK/archives/value',
          },
          '/root/FP/PROJECT/POINT_NO_ARCHIVE': {},
        },
        invalid_tags: ['/root/FP/PROJECT/POINT_INVALID'],
      };
    }

    if (method === 'read_archives') {
      return {
        '/root/FP/PROJECT/POINT_OK/archives/value': [
          [1741435200000, 101.5],
          [1741435500000, 102.25],
        ],
      };
    }

    throw new Error(`Unexpected method: ${method}`);
  } as typeof EcometClient.prototype.application;

  try {
    await run();
  } finally {
    globalThis.setInterval = originalSetInterval;
    EcometClient.prototype.queryObjects = originalQueryObjects;
    EcometClient.prototype.application = originalApplication;
  }
}

const tests = [
  {
    name: 'Plugin skill_run bridge returns parsable ViewModel JSON for scada-point-history',
    run: async () => {
      await withMockedRuntime(async () => {
        const api = createApi();
        register(api as any);
        const tool = api.tools.get('skill_run');

        assert.ok(tool);

        const response = await tool!.execute('json-smoke', {
          skill: 'scada-point-history',
          format: 'json',
          params: {
            tags: [
              {
                object: '/root/FP/PROJECT/POINT_OK',
                field: 'value',
                label: 'Feedwater Pressure',
                unit: 'bar',
              },
              {
                object: '/root/FP/PROJECT/POINT_INVALID',
                field: 'value',
              },
              {
                object: '/root/FP/PROJECT/POINT_NO_ARCHIVE',
                field: 'value',
              },
            ],
            time: {
              preset: 'last_1_hour',
              timezone: 'UTC',
            },
          },
        });

        const payload = JSON.parse(response.content[0].text);
        assert.strictEqual(payload.kind, 'history_view');
        assert.strictEqual(payload.blocks.length, 1);
        assert.strictEqual(payload.blocks[0].label, 'Feedwater Pressure');
        assert.strictEqual(payload.warnings.length, 2);
        assert.strictEqual(payload.completeness.status, 'partial');
      });
    },
  },
  {
    name: 'Plugin skill_run bridge renders plain chat markdown for scada-point-history',
    run: async () => {
      await withMockedRuntime(async () => {
        const api = createApi();
        register(api as any);
        const tool = api.tools.get('skill_run');

        assert.ok(tool);

        const response = await tool!.execute('chat-smoke', {
          skill: 'scada-point-history',
          format: 'chat',
          params: {
            tags: [
              {
                object: '/root/FP/PROJECT/POINT_OK',
                field: 'value',
                label: 'Feedwater Pressure',
                unit: 'bar',
              },
              {
                object: '/root/FP/PROJECT/POINT_INVALID',
                field: 'value',
              },
              {
                object: '/root/FP/PROJECT/POINT_NO_ARCHIVE',
                field: 'value',
              },
            ],
            time: {
              preset: 'last_1_hour',
              timezone: 'UTC',
            },
          },
        });

        const markdown = response.content[0].text;
        assert.ok(markdown.includes('### Feedwater Pressure'));
        assert.ok(markdown.includes('## Warnings'));
        assert.ok(markdown.includes('## Completeness'));
        assert.ok(markdown.includes('Source: scada-point-history'));
        assert.ok(!markdown.trim().startsWith('"'));
      });
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
