import assert from 'assert';
import fs from 'node:fs';

import register from '../../index.js';
import { EcometClient } from '../../../../libs/ecomet-core/dist/index.js';

type RecordedCall =
  | { kind: 'queryObjects'; query: string }
  | { kind: 'application'; module: string; method: string; params: unknown };

type QueryObjectsHandler = (
  query: string,
  calls: RecordedCall[],
) => Promise<{ total?: number; objects: Record<string, unknown>[] }>;

type ApplicationHandler = (
  module: string,
  method: string,
  params: unknown,
  calls: RecordedCall[],
) => Promise<unknown>;

type MockRuntimeHandlers = {
  queryObjects?: QueryObjectsHandler;
  application?: ApplicationHandler;
};

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

function utcMs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number {
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
}

function isPatternRegistryQuery(query: string): boolean {
  return query.includes("/root/.patterns/.field");
}

async function withMockedRuntime<T>(
  handlers: MockRuntimeHandlers,
  run: (calls: RecordedCall[]) => Promise<T>,
): Promise<T> {
  const originalSetInterval = globalThis.setInterval;
  const originalQueryObjects = EcometClient.prototype.queryObjects;
  const originalApplication = EcometClient.prototype.application;
  const calls: RecordedCall[] = [];

  globalThis.setInterval = ((handler: TimerHandler, _timeout?: number) => {
    void handler;
    return 0 as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval;

  EcometClient.prototype.queryObjects = async function queryObjects(query: string) {
    calls.push({ kind: 'queryObjects', query });

    if (isPatternRegistryQuery(query)) {
      return { total: 0, objects: [] };
    }

    if (handlers.queryObjects) {
      return handlers.queryObjects(query, calls);
    }

    return { total: 0, objects: [] };
  } as typeof EcometClient.prototype.queryObjects;

  EcometClient.prototype.application = async function application(
    module: string,
    method: string,
    params: unknown,
  ) {
    calls.push({ kind: 'application', module, method, params });

    if (handlers.application) {
      return handlers.application(module, method, params, calls);
    }

    return {};
  } as typeof EcometClient.prototype.application;

  try {
    return await run(calls);
  } finally {
    globalThis.setInterval = originalSetInterval;
    EcometClient.prototype.queryObjects = originalQueryObjects;
    EcometClient.prototype.application = originalApplication;
  }
}

async function runToolRequest(
  request: Record<string, unknown>,
  handlers: MockRuntimeHandlers,
  nowMs?: number,
): Promise<{ text: string; calls: RecordedCall[] }> {
  return withMockedRuntime(handlers, async (calls) => {
    const api = createApi();
    register(api as any);
    const tool = api.tools.get('skill_run');
    assert.ok(tool);

    const originalDateNow = Date.now;
    if (nowMs !== undefined) {
      Date.now = () => nowMs;
    }

    try {
      const response = await tool!.execute('m2-direct-test', request);
      return {
        text: response.content[0].text,
        calls,
      };
    } finally {
      Date.now = originalDateNow;
    }
  });
}

const tests = [
  {
    name: 'skill_run renders scada-alarm-summary chat output',
    run: async () => {
      const nowMs = utcMs(2026, 3, 19, 12, 0);
      const { text } = await runToolRequest(
        {
          skill: 'scada-alarm-summary',
          format: 'chat',
          range: 'last_24_hours',
          scope_folder: '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220',
        },
        {
          queryObjects: async (query) => {
            if (query.includes('active = true')) {
              return {
                total: 1,
                objects: [
                  {
                    dt_on: nowMs - 3 * 24 * 60 * 60 * 1000,
                    point: '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L-123',
                    text: 'Long standing',
                    fact: 'KA',
                    relevant: 'protection',
                    active: true,
                    acknowledged: false,
                  },
                ],
              };
            }

            return {
              total: 1,
              objects: [
                {
                  dt_on: nowMs - 60_000,
                  dt_off: nowMs - 30_000,
                  point: '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L-100',
                  text: 'Alarm 1',
                  fact: 'TI',
                  relevant: 'analog',
                  active: false,
                  acknowledged: true,
                },
              ],
            };
          },
        },
        nowMs,
      );

      assert.ok(text.includes('### Alarm Summary'));
      assert.ok(text.includes('**Total alarms:**'));
      assert.ok(text.includes('**Standing alarms:**'));
      assert.ok(text.includes('Source: scada-alarm-summary'));
    },
  },
  {
    name: 'skill_run exports an alarm list to CSV through report-spreadsheet-export',
    run: async () => {
      const filename = 'integration-export.csv';
      const exportPath = '/home/roman/.openclaw/workspace/exports/integration-export.csv';
      if (fs.existsSync(exportPath)) {
        fs.unlinkSync(exportPath);
      }

      try {
        const { text } = await runToolRequest(
          {
            skill: 'report-spreadsheet-export',
            format: 'json',
            params: {
              filename,
              data: {
                kind: 'alarm_list',
                blocks: [
                  {
                    block_kind: 'alarm_list',
                    alarms: [
                      {
                        path: '/root/test/obj1',
                        timestamp: utcMs(2026, 3, 19, 10, 0),
                        message: 'Test alarm',
                        source: 'TI',
                        state: 'active, unacknowledged',
                      },
                    ],
                    total: 1,
                  },
                ],
                warnings: [],
                provenance: {
                  source_skill: 'scada-alarm-list',
                  scope: 'test',
                  period_from: utcMs(2026, 3, 19, 9, 0),
                  period_to: utcMs(2026, 3, 19, 10, 0),
                  timezone: 'UTC',
                  produced_at: utcMs(2026, 3, 19, 10, 0),
                },
                completeness: { status: 'complete' },
              },
            },
          },
          {},
        );

        const payload = JSON.parse(text);
        assert.strictEqual(payload.kind, 'scope_view');
        assert.strictEqual(payload.metadata.export_path, exportPath);
        assert.ok(fs.existsSync(exportPath));

        const csv = fs.readFileSync(exportPath, 'utf8');
        assert.ok(csv.includes('Timestamp,Object,Type,Message,State'));
        assert.ok(csv.includes('/root/test/obj1'));
        assert.ok(csv.includes('# Provenance'));
      } finally {
        if (fs.existsSync(exportPath)) {
          fs.unlinkSync(exportPath);
        }
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
