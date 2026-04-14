import assert from 'assert';

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
  description?: string;
  execute: (id: string, params: unknown) => Promise<{
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

function filterRelevantCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter(
    (call) => call.kind !== 'queryObjects' || !isPatternRegistryQuery(call.query),
  );
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
      if (handlers.queryObjects) {
        return handlers.queryObjects(query, calls);
      }

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

async function withFixedNow<T>(
  nowMs: number | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (nowMs === undefined) {
    return run();
  }

  const originalDateNow = Date.now;
  Date.now = () => nowMs;

  try {
    return await run();
  } finally {
    Date.now = originalDateNow;
  }
}

async function runToolRequest(
  request: Record<string, unknown>,
  handlers: MockRuntimeHandlers = {},
  nowMs?: number,
): Promise<{ text: string; calls: RecordedCall[] }> {
  return withMockedRuntime(handlers, async (calls) =>
    withFixedNow(nowMs, async () => {
      const api = createApi();
      register(api as any);
      const tool = api.tools.get('skill_run');

      assert.ok(tool, 'skill_run tool should be registered');

      const response = await tool!.execute('validation-test', request);
      return {
        text: response.content[0].text,
        calls: filterRelevantCalls(calls),
      };
    }),
  );
}

async function runRegisteredToolRequest(
  toolName: string,
  request: unknown,
  handlers: MockRuntimeHandlers = {},
  options: { waitForInit?: boolean } = {},
): Promise<{ text: string; calls: RecordedCall[]; tool: RegisteredTool }> {
  return withMockedRuntime(handlers, async (calls) => {
    const api = createApi();
    register(api as any);

    if (options.waitForInit) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();
      await Promise.resolve();
    }

    const tool = api.tools.get(toolName);
    assert.ok(tool, `${toolName} tool should be registered`);

    const response = await tool!.execute('validation-test', request);
    return {
      text: response.content[0].text,
      calls: filterRelevantCalls(calls),
      tool: tool!,
    };
  });
}

function assertErrorText(
  text: string,
  expectedFragments: string | string[],
): void {
  const fragments = Array.isArray(expectedFragments)
    ? expectedFragments
    : [expectedFragments];

  for (const fragment of fragments) {
    assert.ok(
      text.includes(fragment),
      `Expected error text to include "${fragment}", got: ${text}`,
    );
  }

  assert.throws(() => JSON.parse(text));
}

const tests = [
  {
    name: 'skill_run passes flat scada-object-explore params through the plugin bridge',
    run: async () => {
      const { text } = await runToolRequest(
        {
          skill: 'scada-object-explore',
          format: 'json',
          folder: '/root/FP/PROJECT/UNIT_1',
          searchText: 'L2431',
          searchIn: ['.name'],
          limit: 4,
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'project'"));
            assert.ok(query.includes(".fp_path LIKE '/root/FP/PROJECT/UNIT_1/'"));
            assert.ok(query.includes(".name LIKE 'L2431'"));
            assert.ok(query.includes('page 1:4'));

            return {
              total: 1,
              objects: [
                {
                  '.fp_path': '/root/FP/PROJECT/UNIT_1/L2431/P',
                  '.name': 'P',
                  '.pattern': '/root/FP/prototypes/point/fields',
                  '.folder': '/root/FP/PROJECT/UNIT_1/L2431',
                },
              ],
            };
          },
        },
      );

      const payload = JSON.parse(text);
      assert.strictEqual(payload.kind, 'scope_view');
    },
  },
  {
    name: 'skill_run clamps oversized scada-object-explore limits seen in live retries',
    run: async () => {
      const { text } = await runToolRequest(
        {
          skill: 'scada-object-explore',
          format: 'json',
          folder: '/root/FP/PROJECT/UNIT_1',
          limit: 20000,
          select: ['.pattern'],
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'project'"));
            assert.ok(query.includes('page 1:10000'));
            return {
              total: 1,
              objects: [
                {
                  '.fp_path': '/root/FP/PROJECT/UNIT_1/A',
                  '.name': 'A',
                  '.pattern': '/root/.patterns/FOLDER',
                  '.folder': '/root/FP/PROJECT/UNIT_1',
                },
              ],
            };
          },
        },
      );

      const payload = JSON.parse(text);
      assert.strictEqual(payload.kind, 'scope_view');
      assert.ok(payload.warnings.some((warning: { code?: string }) => warning.code === 'limit_clamped'));
    },
  },
  {
    name: 'skill_run passes flat scada-point-history params through the plugin bridge',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_HISTORY';
      const field = 'out_value';
      const archivePath = '/archive/history/out_value';
      const { text, calls } = await runToolRequest(
        {
          skill: 'scada-point-history',
          format: 'json',
          object,
          field,
          period: '24h',
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [object]: {
                    [field]: archivePath,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'read_archives') {
              return {
                [archivePath]: [[nowMs - 60_000, 11]],
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
        nowMs,
      );

      const payload = JSON.parse(text);
      assert.strictEqual(payload.kind, 'history_view');
      assert.deepStrictEqual(calls, [
        {
          kind: 'application',
          module: 'fp_json',
          method: 'get_tags_archive',
          params: { [object]: [field] },
        },
        {
          kind: 'application',
          module: 'fp_json',
          method: 'read_archives',
          params: {
            archives: [archivePath],
            from: nowMs - 24 * 60 * 60 * 1000,
            to: nowMs,
          },
        },
      ]);
    },
  },
  {
    name: 'skill_run preserves explicit point-history until timestamps seen in newer live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const untilMs = utcMs(2026, 3, 18, 10, 0);
      const object = '/root/FP/PROJECT/POINT_HISTORY_UNTIL';
      const field = 'out_value';
      const archivePath = '/archive/history/until';
      const { text, calls } = await runToolRequest(
        {
          skill: 'scada-point-history',
          format: 'json',
          objects: [object],
          field,
          time: {
            time_window: 'last_1_hour',
            until: '2026-03-18T10:00:00Z',
          },
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [object]: {
                    [field]: archivePath,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'read_archives') {
              return {
                [archivePath]: [[nowMs - 60_000, 11]],
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
        nowMs,
      );

      assert.strictEqual(JSON.parse(text).kind, 'history_view');
      assert.deepStrictEqual(calls, [
        {
          kind: 'application',
          module: 'fp_json',
          method: 'get_tags_archive',
          params: { [object]: [field] },
        },
        {
          kind: 'application',
          module: 'fp_json',
          method: 'read_archives',
          params: {
            archives: [archivePath],
            from: untilMs - 60 * 60 * 1000,
            to: untilMs,
          },
        },
      ]);
    },
  },
  {
    name: 'skill_run passes flat scada-point-snapshot params through the plugin bridge',
    run: async () => {
      const object = '/root/FP/PROJECT/POINT_SNAPSHOT';
      const field = 'out_value';
      const archivePath = '/archive/snapshot/out_value';
      const expectedTimestamp = utcMs(2026, 3, 18, 9, 37);
      const { text, calls } = await runToolRequest(
        {
          skill: 'scada-point-snapshot',
          format: 'json',
          object,
          field,
          timestamp: '2026-03-18T09:37',
          timezone: 'UTC',
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [object]: {
                    [field]: archivePath,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'get_points') {
              return {
                [archivePath]: 12.4,
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
      );

      const payload = JSON.parse(text);
      assert.strictEqual(payload.kind, 'snapshot_view');
      assert.deepStrictEqual(calls, [
        {
          kind: 'application',
          module: 'fp_json',
          method: 'get_tags_archive',
          params: { [object]: [field] },
        },
        {
          kind: 'application',
          module: 'fp_json',
          method: 'get_points',
          params: {
            archives: [archivePath],
            ts: expectedTimestamp,
          },
        },
      ]);
    },
  },
  {
    name: 'skill_run accepts string time and offset-bearing ISO aliases for scada-point-snapshot seen in live retries',
    run: async () => {
      const object = '/root/FP/PROJECT/POINT_SNAPSHOT';
      const field = 'out_value';
      const archivePath = '/archive/snapshot/out_value';
      const { text, calls } = await runToolRequest(
        {
          skill: 'scada-point-snapshot',
          format: 'json',
          object,
          field,
          time: '2026-03-18T06:00:00+06:00',
          timezone: 'Asia/Almaty',
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [object]: {
                    [field]: archivePath,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'get_points') {
              return {
                [archivePath]: 12.4,
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
      );

      const payload = JSON.parse(text);
      assert.strictEqual(payload.kind, 'snapshot_view');
      assert.deepStrictEqual(calls, [
        {
          kind: 'application',
          module: 'fp_json',
          method: 'get_tags_archive',
          params: { [object]: [field] },
        },
        {
          kind: 'application',
          module: 'fp_json',
          method: 'get_points',
          params: {
            archives: [archivePath],
            ts: utcMs(2026, 3, 18, 1, 0),
          },
        },
      ]);
    },
  },
  {
    name: 'skill_run accepts timestamp_text aliases for scada-point-snapshot seen in later live retries',
    run: async () => {
      const object = '/root/FP/PROJECT/POINT_SNAPSHOT';
      const field = 'out_value';
      const archivePath = '/archive/snapshot/out_value';
      const { text, calls } = await runToolRequest(
        {
          skill: 'scada-point-snapshot',
          format: 'json',
          object,
          field,
          timestamp_text: '2026-03-18 06:00',
          timestamp_timezone: 'Asia/Almaty',
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [object]: {
                    [field]: archivePath,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'get_points') {
              return {
                [archivePath]: 12.4,
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
      );

      assert.strictEqual(JSON.parse(text).kind, 'snapshot_view');
      assert.deepStrictEqual(calls, [
        {
          kind: 'application',
          module: 'fp_json',
          method: 'get_tags_archive',
          params: { [object]: [field] },
        },
        {
          kind: 'application',
          module: 'fp_json',
          method: 'get_points',
          params: {
            archives: [archivePath],
            ts: utcMs(2026, 3, 18, 1, 0),
          },
        },
      ]);
    },
  },
  {
    name: 'skill_run accepts timestamp_local aliases for scada-point-snapshot seen in newer live retries',
    run: async () => {
      const object = '/root/FP/PROJECT/POINT_SNAPSHOT';
      const field = 'out_value';
      const archivePath = '/archive/snapshot/out_value';
      const { text, calls } = await runToolRequest(
        {
          skill: 'scada-point-snapshot',
          format: 'json',
          object,
          field,
          timestamp_local: '2026-03-18 06:00',
          timezone: 'Asia/Almaty',
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [object]: {
                    [field]: archivePath,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'get_points') {
              return {
                [archivePath]: 12.4,
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
      );

      assert.strictEqual(JSON.parse(text).kind, 'snapshot_view');
      assert.deepStrictEqual(calls, [
        {
          kind: 'application',
          module: 'fp_json',
          method: 'get_tags_archive',
          params: { [object]: [field] },
        },
        {
          kind: 'application',
          module: 'fp_json',
          method: 'get_points',
          params: {
            archives: [archivePath],
            ts: utcMs(2026, 3, 18, 1, 0),
          },
        },
      ]);
    },
  },
  {
    name: 'skill_run passes flat scada-period-aggregates params through the plugin bridge',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_AGG';
      const field = 'out_value';
      const archivePath = '/archive/aggregates/out_value';
      const { text, calls } = await runToolRequest(
        {
          skill: 'scada-period-aggregates',
          format: 'json',
          object,
          field,
          functions: ['avg', 'max'],
          period: '24h',
          bucket: { preset: '1_hour' },
        },
        {
          application: async (_module, method, params) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [object]: {
                    [field]: archivePath,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'get_aggregates') {
              const aggregateParams = params as { timestamps: number[] };
              const values: Record<string, Record<string, Record<string, number>>> = {};
              for (let index = 1; index < aggregateParams.timestamps.length; index += 1) {
                values[String(aggregateParams.timestamps[index])] = {
                  [archivePath]: {
                    avg: index,
                    max: index + 100,
                  },
                };
              }

              return {
                values,
                invalid: {},
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
        nowMs,
      );

      const payload = JSON.parse(text);
      assert.strictEqual(payload.kind, 'aggregate_table');
      assert.deepStrictEqual(calls, [
        {
          kind: 'application',
          module: 'fp_json',
          method: 'get_tags_archive',
          params: { [object]: [field] },
        },
        {
          kind: 'application',
          module: 'fp_archive',
          method: 'get_aggregates',
          params: {
            aggregates: [
              [archivePath, 'avg'],
              [archivePath, 'max'],
            ],
            timestamps: Array.from(
              { length: 25 },
              (_, index) => nowMs - 24 * 60 * 60 * 1000 + index * 60 * 60 * 1000,
            ),
          },
        },
      ]);
    },
  },
  {
    name: 'skill_run passes flat scada-archive-coverage params through the plugin bridge',
    run: async () => {
      const object = '/root/FP/PROJECT/POINT_COVERAGE';
      const field = 'out_value';
      const archivePath = '/archive/coverage/out_value';
      const { text, calls } = await runToolRequest(
        {
          skill: 'scada-archive-coverage',
          format: 'json',
          object,
          field,
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [object]: {
                    [field]: archivePath,
                  },
                },
                invalid_tags: [],
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
      );

      const payload = JSON.parse(text);
      assert.strictEqual(payload.kind, 'coverage_view');
      assert.deepStrictEqual(calls, [
        {
          kind: 'application',
          module: 'fp_json',
          method: 'get_tags_archive',
          params: { [object]: [field] },
        },
      ]);
    },
  },
  {
    name: 'skill_run passes flat scada-data-quality params through the plugin bridge',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_QUALITY';
      const field = 'out_value';
      const archivePath = '/archive/quality/out_value';
      const { text, calls } = await runToolRequest(
        {
          skill: 'scada-data-quality',
          format: 'json',
          object,
          field,
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [object]: {
                    [field]: archivePath,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'read_archives') {
              return {
                [archivePath]: [[nowMs - 60_000, 5.1]],
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'project'"));
            return {
              total: 1,
              objects: [
                {
                  '.fp_path': object,
                  out_value: 5.1,
                  out_qds: 0,
                  out_ts: nowMs - 60_000,
                },
              ],
            };
          },
        },
        nowMs,
      );

      const payload = JSON.parse(text);
      assert.strictEqual(payload.kind, 'coverage_view');
      assert.deepStrictEqual(
        calls.map((call) =>
          call.kind === 'application' ? call.method : 'queryObjects',
        ),
        ['get_tags_archive', 'queryObjects', 'get_tags_archive', 'read_archives'],
      );
      assert.deepStrictEqual(
        calls.filter(
          (call): call is Extract<RecordedCall, { kind: 'application' }> =>
            call.kind === 'application' && call.method === 'get_tags_archive',
        ).map((call) => call.params),
        [{ [object]: [field] }, { [object]: [field] }],
      );
      const queryCall = calls.find(
        (call): call is Extract<RecordedCall, { kind: 'queryObjects' }> =>
          call.kind === 'queryObjects',
      );
      assert.ok(queryCall);
      assert.ok(queryCall.query.includes("from 'project'"));
      assert.deepStrictEqual(
        calls.find(
          (call): call is Extract<RecordedCall, { kind: 'application' }> =>
            call.kind === 'application' && call.method === 'read_archives',
        )?.params,
        {
          archives: [archivePath],
          from: nowMs - 24 * 60 * 60 * 1000,
          to: nowMs,
        },
      );
    },
  },
  {
    name: 'skill_run passes flat scada-alarm-list params through the plugin bridge',
    run: async () => {
      const { text } = await runToolRequest(
        {
          skill: 'scada-alarm-list',
          format: 'json',
          time: {
            from: '2026-03-18 09:00',
            to: '2026-03-18 10:00',
            timezone: 'UTC',
          },
          scope: {
            folders: ['/root/FP/PROJECT/UNIT_1'],
          },
          filters: {
            active: true,
            acknowledged: false,
            fields: { fact: 'TI' },
            search: {
              text: 'Alarm',
              in: ['text'],
            },
          },
          page: {
            limit: 5,
            offset: 0,
          },
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'archive'"));
            assert.ok(query.includes("point LIKE '/UNIT_1/'"));
            assert.ok(query.includes('active = true'));
            assert.ok(query.includes('acknowledged = false'));
            assert.ok(query.includes("fact = 'TI'"));
            assert.ok(query.includes("text LIKE 'Alarm'"));
            assert.ok(query.includes('page 1:5'));
            return {
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            };
          },
        },
      );

      const payload = JSON.parse(text);
      assert.strictEqual(payload.kind, 'alarm_list');
    },
  },
  {
    name: 'skill_run accepts alarm-list scope/time aliases seen in live retries',
    run: async () => {
      const { text } = await runToolRequest(
        {
          skill: 'scada-alarm-list',
          format: 'json',
          scope: '/root/FP/PROJECT/UNIT_1',
          timeRange: 'last_24h_to_now',
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'archive'"));
            assert.ok(query.includes("point LIKE '/UNIT_1/'"));
            return {
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            };
          },
        },
        utcMs(2026, 3, 18, 10, 0),
      );

      const payload = JSON.parse(text);
      assert.strictEqual(payload.kind, 'alarm_list');
    },
  },
  {
    name: 'skill_run accepts aggregate string-scope aliases and data-quality aliases seen in live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const aggregateObject = '/root/FP/PROJECT/POINT_AGG';
      const qualityObject = '/root/FP/PROJECT/POINT_QUALITY';
      const field = 'out_value';
      const aggregateArchive = '/archive/aggregates/out_value';
      const qualityArchive = '/archive/quality/out_value';

      const aggregate = await runToolRequest(
        {
          skill: 'scada-period-aggregates',
          format: 'json',
          scope: aggregateObject,
          field,
          functions: ['avg'],
          period: '24h',
          bucket: 'all',
        },
        {
          application: async (_module, method, params) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [aggregateObject]: {
                    [field]: aggregateArchive,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'get_aggregates') {
              return {
                values: {
                  [String(nowMs)]: {
                    [aggregateArchive]: { avg: 1 },
                  },
                },
                invalid: {},
                unresolved: [],
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
        nowMs,
      );

      const quality = await runToolRequest(
        {
          skill: 'scada-data-quality',
          format: 'json',
          tag_paths: [`${qualityObject}:${field}`],
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [qualityObject]: {
                    [field]: qualityArchive,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'read_archives') {
              return {
                [qualityArchive]: [[nowMs - 60_000, 5.1]],
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'project'"));
            return {
              total: 1,
              objects: [
                {
                  '.fp_path': qualityObject,
                  out_value: 5.1,
                  out_qds: 0,
                  out_ts: nowMs - 60_000,
                },
              ],
            };
          },
        },
        nowMs,
      );

      assert.strictEqual(JSON.parse(aggregate.text).kind, 'aggregate_table');
      assert.strictEqual(JSON.parse(quality.text).kind, 'coverage_view');
    },
  },
  {
    name: 'skill_run accepts aggregate and data-quality later retry aliases',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const aggregateObject = '/root/FP/PROJECT/POINT_AGG_LATER';
      const qualityObject = '/root/FP/PROJECT/POINT_QUALITY_LATER';
      const field = 'out_value';
      const aggregateArchive = '/archive/aggregates/later';
      const qualityArchive = '/archive/quality/later';

      const aggregate = await runToolRequest(
        {
          skill: 'scada-period-aggregates',
          format: 'json',
          tags: [{ object: aggregateObject, field, functions: ['avg', 'max'] }],
          from: '2026-03-17 12:00',
          to: '2026-03-18 12:00',
          timezone: 'UTC',
          timestampsMode: 'human',
          bucketMinutes: 1440,
        },
        {
          application: async (_module, method, params) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [aggregateObject]: {
                    [field]: aggregateArchive,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'get_aggregates') {
              const aggregateParams = params as { timestamps: number[] };
              return {
                values: {
                  [String(aggregateParams.timestamps[1])]: {
                    [aggregateArchive]: { avg: 1, max: 2 },
                  },
                },
                invalid: {},
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
      );

      const quality = await runToolRequest(
        {
          skill: 'scada-data-quality',
          format: 'json',
          tags: [`${qualityObject}:${field}`],
          timeRange: {
            kind: 'last',
            unit: 'hour',
            value: 24,
          },
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [qualityObject]: {
                    [field]: qualityArchive,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'read_archives') {
              return {
                [qualityArchive]: [[nowMs - 60_000, 5.1]],
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
          queryObjects: async () => ({
            total: 1,
            objects: [
              {
                '.fp_path': qualityObject,
                out_value: 5.1,
                out_qds: 0,
                out_ts: nowMs - 60_000,
              },
            ],
          }),
        },
        nowMs,
      );

      assert.strictEqual(JSON.parse(aggregate.text).kind, 'aggregate_table');
      assert.strictEqual(JSON.parse(quality.text).kind, 'coverage_view');
    },
  },
  {
    name: 'skill_run ignores null aggregate buckets seen in newer live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_AGG_NULL_BUCKET';
      const field = 'out_value';
      const archivePath = '/archive/aggregates/null-bucket';

      const { text, calls } = await runToolRequest(
        {
          skill: 'scada-period-aggregates',
          format: 'json',
          tags: [{ object, field, functions: ['avg', 'max'] }],
          range: 'last_24h',
          bucket: null,
        },
        {
          application: async (_module, method, params) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [object]: {
                    [field]: archivePath,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'get_aggregates') {
              const aggregateParams = params as { timestamps: number[] };
              return {
                values: {
                  [String(aggregateParams.timestamps[1])]: {
                    [archivePath]: { avg: 1, max: 2 },
                  },
                },
                invalid: {},
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
        nowMs,
      );

      assert.strictEqual(JSON.parse(text).kind, 'aggregate_table');
      assert.deepStrictEqual(calls, [
        {
          kind: 'application',
          module: 'fp_json',
          method: 'get_tags_archive',
          params: { [object]: [field] },
        },
        {
          kind: 'application',
          module: 'fp_archive',
          method: 'get_aggregates',
          params: {
            aggregates: [
              [archivePath, 'avg'],
              [archivePath, 'max'],
            ],
            timestamps: [nowMs - 24 * 60 * 60 * 1000, nowMs],
          },
        },
      ]);
    },
  },
  {
    name: 'skill_run accepts entire aggregate buckets seen in newer live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_AGG_ENTIRE';
      const field = 'out_value';
      const archivePath = '/archive/aggregates/entire';

      const { text, calls } = await runToolRequest(
        {
          skill: 'scada-period-aggregates',
          format: 'json',
          object,
          field,
          functions: ['avg'],
          range: 'last_24_hours',
          bucket: 'entire',
        },
        {
          application: async (_module, method, params) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [object]: {
                    [field]: archivePath,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'get_aggregates') {
              const aggregateParams = params as { timestamps: number[] };
              return {
                values: {
                  [String(aggregateParams.timestamps[1])]: {
                    [archivePath]: { avg: 1 },
                  },
                },
                invalid: {},
                unresolved: [],
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
        nowMs,
      );

      assert.strictEqual(JSON.parse(text).kind, 'aggregate_table');
      assert.deepStrictEqual(calls, [
        {
          kind: 'application',
          module: 'fp_json',
          method: 'get_tags_archive',
          params: { [object]: [field] },
        },
        {
          kind: 'application',
          module: 'fp_archive',
          method: 'get_aggregates',
          params: {
            aggregates: [[archivePath, 'avg']],
            timestamps: [nowMs - 24 * 60 * 60 * 1000, nowMs],
          },
        },
      ]);
    },
  },
  {
    name: 'skill_run accepts scope and time_range amount aliases for data-quality from newer live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_QUALITY_TIME_RANGE_ALIAS';
      const field = 'out_value';
      const archivePath = '/archive/quality/time-range-alias';

      const { text } = await runToolRequest(
        {
          skill: 'scada-data-quality',
          format: 'json',
          scope: [{ object, field }],
          time_range: {
            kind: 'last',
            amount: 24,
            unit: 'hours',
          },
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [object]: {
                    [field]: archivePath,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'read_archives') {
              return {
                [archivePath]: [[nowMs - 60_000, 5.1]],
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
          queryObjects: async () => ({
            total: 1,
            objects: [
              {
                '.fp_path': object,
                out_value: 5.1,
                out_qds: 0,
                out_ts: nowMs - 60_000,
              },
            ],
          }),
        },
        nowMs,
      );

      assert.strictEqual(JSON.parse(text).kind, 'coverage_view');
    },
  },
  {
    name: 'skill_run accepts nested time.period aliases for data-quality from newer live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_QUALITY_TIME_PERIOD';
      const field = 'out_value';
      const archivePath = '/archive/quality/time-period';

      const { text } = await runToolRequest(
        {
          skill: 'scada-data-quality',
          format: 'json',
          tags: [{ object, field }],
          time: {
            period: '24h',
          },
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [object]: {
                    [field]: archivePath,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'read_archives') {
              return {
                [archivePath]: [[nowMs - 60_000, 5.1]],
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
          queryObjects: async () => ({
            total: 1,
            objects: [
              {
                '.fp_path': object,
                out_value: 5.1,
                out_qds: 0,
                out_ts: nowMs - 60_000,
              },
            ],
          }),
        },
        nowMs,
      );

      assert.strictEqual(JSON.parse(text).kind, 'coverage_view');
    },
  },
  {
    name: 'skill_run accepts alarm and data-quality retry aliases seen in later live runs',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_QUALITY';
      const field = 'out_value';
      const archivePath = '/archive/quality/out_value';

      const alarm = await runToolRequest(
        {
          skill: 'scada-alarm-list',
          format: 'json',
          scope_folder: '/root/FP/PROJECT/UNIT_1',
          time_range: 'last_24h_ending_now',
          limit: 5,
          offset: 0,
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'archive'"));
            assert.ok(query.includes("point LIKE '/UNIT_1/'"));
            return {
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            };
          },
        },
        nowMs,
      );

      const quality = await runToolRequest(
        {
          skill: 'scada-data-quality',
          format: 'json',
          title: `Data quality for ${object}:${field}`,
          scope: [{ object, field }],
          time_range: {
            kind: 'relative',
            from: '-24h',
            to: 'now',
          },
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  [object]: {
                    [field]: archivePath,
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'read_archives') {
              return {
                [archivePath]: [[nowMs - 60_000, 5.1]],
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
          queryObjects: async () => ({
            total: 1,
            objects: [
              {
                '.fp_path': object,
                out_value: 5.1,
                out_qds: 0,
                out_ts: nowMs - 60_000,
              },
            ],
          }),
        },
        nowMs,
      );

      assert.strictEqual(JSON.parse(alarm.text).kind, 'alarm_list');
      assert.strictEqual(JSON.parse(quality.text).kind, 'coverage_view');
    },
  },
  {
    name: 'skill_run accepts alarm numeric page shorthand seen in later live runs',
    run: async () => {
      const { text } = await runToolRequest(
        {
          skill: 'scada-alarm-list',
          format: 'json',
          scope_folder: '/root/FP/PROJECT/UNIT_1',
          time_range: 'last_24h_to_now',
          page: 2,
          page_size: 100,
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'archive'"));
            assert.ok(query.includes("point LIKE '/UNIT_1/'"));
            assert.ok(query.includes('page 2:100'));
            return {
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            };
          },
        },
        utcMs(2026, 3, 18, 12, 0),
      );

      assert.strictEqual(JSON.parse(text).kind, 'alarm_list');
    },
  },
  {
    name: 'skill_run accepts alarm scopeLabel, null-filter, null search, and time_preset aliases seen in AKTOBE live retries',
    run: async () => {
      const { text } = await runToolRequest(
        {
          skill: 'scada-alarm-list',
          format: 'json',
          scopeLabel: 'UNIT_1',
          folders: ['/root/FP/PROJECT/UNIT_1'],
          time_preset: 'last_60_min',
          active: null,
          acknowledged: null,
          search: null,
          page: 1,
          page_size: 100,
          include_history: true,
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'archive'"));
            assert.ok(query.includes("point LIKE '/UNIT_1/'"));
            assert.ok(query.includes('page 1:100'));
            return {
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            };
          },
        },
        utcMs(2026, 3, 18, 12, 0),
      );

      assert.strictEqual(JSON.parse(text).kind, 'alarm_list');
    },
  },
  {
    name: 'skill_run accepts alarm camelCase filter and paging aliases seen in later live runs',
    run: async () => {
      const { text } = await runToolRequest(
        {
          skill: 'scada-alarm-list',
          format: 'json',
          scope: '/root/FP/PROJECT/UNIT_1',
          timeRange: 'last_24h_to_now',
          activeOnly: false,
          ackFilter: 'both',
          page: 1,
          pageSize: 100,
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'archive'"));
            assert.ok(query.includes("point LIKE '/UNIT_1/'"));
            assert.ok(query.includes('page 1:100'));
            return {
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            };
          },
        },
        utcMs(2026, 3, 18, 12, 0),
      );

      assert.strictEqual(JSON.parse(text).kind, 'alarm_list');
    },
  },
  {
    name: 'skill_run accepts alarm scope_path active_only and ack_filter aliases seen in newer AKTOBE live retries',
    run: async () => {
      const { text } = await runToolRequest(
        {
          skill: 'scada-alarm-list',
          format: 'json',
          scope_path: '/KAZ/AKTOBE',
          time_range: 'last 1 hour',
          active_only: false,
          ack_filter: 'all',
          page: 1,
          page_size: 50,
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'archive'"));
            assert.ok(query.includes('AKTOBE'));
            assert.ok(query.includes('page 1:50'));
            assert.ok(!query.includes('active = false'));
            assert.ok(!query.includes('acknowledged = false'));
            assert.ok(!query.includes('acknowledged = true'));
            return {
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/KAZ/AKTOBE/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            };
          },
        },
        utcMs(2026, 3, 18, 12, 0),
      );

      assert.strictEqual(JSON.parse(text).kind, 'alarm_list');
    },
  },
  {
    name: 'skill_run accepts alarm scope_folders aliases seen in later live runs',
    run: async () => {
      const { text } = await runToolRequest(
        {
          skill: 'scada-alarm-list',
          format: 'json',
          scope_folders: ['/root/FP/PROJECT/UNIT_1'],
          range: 'last_24h_ending_now',
          page: 1,
          page_size: 50,
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'archive'"));
            assert.ok(query.includes("point LIKE '/UNIT_1/'"));
            assert.ok(query.includes('page 1:50'));
            return {
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            };
          },
        },
        utcMs(2026, 3, 18, 12, 0),
      );

      assert.strictEqual(JSON.parse(text).kind, 'alarm_list');
    },
  },
  {
    name: 'skill_run accepts alarm end-duration and search/select aliases seen in later live runs',
    run: async () => {
      const { text } = await runToolRequest(
        {
          skill: 'scada-alarm-list',
          format: 'json',
          scope: '/root/FP/PROJECT/UNIT_1',
          time_range_end: '2026-03-18T14:45:00Z',
          time_range_duration: 'PT24H',
          active: null,
          acknowledged: null,
          search_text: 'Alarm',
          search_fields: ['text'],
          page: 1,
          page_size: 50,
          select_fields: ['text', 'point', 'fact', 'active', 'acknowledged', 'dt_off'],
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'archive'"));
            assert.ok(query.includes("point LIKE '/UNIT_1/'"));
            assert.ok(query.includes("text LIKE 'Alarm'"));
            assert.ok(query.includes('dt_off'));
            assert.ok(query.includes('page 1:50'));
            return {
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            };
          },
        },
        utcMs(2026, 3, 18, 14, 45),
      );

      assert.strictEqual(JSON.parse(text).kind, 'alarm_list');
    },
  },
  {
    name: 'skill_run accepts structured alarm timeRange end aliases and ignores include_values/include_stats from AKTOBE live retries',
    run: async () => {
      const { text } = await runToolRequest(
        {
          skill: 'scada-alarm-list',
          format: 'json',
          scope: '/KAZ/AKMOLA',
          timeRange: {
            kind: 'last',
            amount: 24,
            unit: 'hours',
            end: '2026-03-18T14:45:00Z',
          },
          filters: {},
          include_values: true,
          include_stats: true,
          paging: {
            page: 1,
            page_size: 50,
          },
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'archive'"));
            assert.ok(query.includes("point LIKE '/KAZ/AKMOLA/'"));
            assert.ok(query.includes('page 1:50'));
            return {
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/KAZ/AKMOLA/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            };
          },
        },
        utcMs(2026, 3, 18, 14, 45),
      );

      assert.strictEqual(JSON.parse(text).kind, 'alarm_list');
    },
  },
  {
    name: 'skill_run accepts alarm paging and relative time_range object aliases from later live runs',
    run: async () => {
      const { text } = await runToolRequest(
        {
          skill: 'scada-alarm-list',
          format: 'json',
          scope: ['/root/FP/PROJECT/UNIT_1'],
          time_range: {
            kind: 'relative',
            from: { unit: 'hour', value: 24 },
            to: 'now',
          },
          filters: {},
          paging: {
            page: 1,
            page_size: 50,
          },
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'archive'"));
            assert.ok(query.includes("point LIKE '/UNIT_1/'"));
            assert.ok(query.includes('page 1:50'));
            return {
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            };
          },
        },
        utcMs(2026, 3, 18, 14, 45),
      );

      assert.strictEqual(JSON.parse(text).kind, 'alarm_list');
    },
  },
  {
    name: 'skill_run returns a clear error for mixed nested and flat history params',
    run: async () => {
      const { text, calls } = await runToolRequest({
        skill: 'scada-point-history',
        format: 'json',
        tags: [{ object: '/root/FP/PROJECT/POINT_HISTORY', field: 'out_value' }],
        time: { preset: 'last_1_hour' },
        period: '24h',
      });

      assertErrorText(text, ['Conflicting params', 'period']);
      assert.deepStrictEqual(calls, []);
    },
  },
  {
    name: 'skill_run returns a clear error for numeric snapshot timestamps',
    run: async () => {
      const { text, calls } = await runToolRequest({
        skill: 'scada-point-snapshot',
        format: 'json',
        object: '/root/FP/PROJECT/POINT_SNAPSHOT',
        field: 'out_value',
        timestamp: 1773826620000,
        timezone: 'UTC',
      });

      assertErrorText(text, 'Do not pre-compute epoch timestamps');
      assert.deepStrictEqual(calls, []);
    },
  },
  {
    name: 'skill_run returns a clear error for malformed aggregate bucket objects',
    run: async () => {
      const { text, calls } = await runToolRequest({
        skill: 'scada-period-aggregates',
        format: 'json',
        object: '/root/FP/PROJECT/POINT_AGG',
        field: 'out_value',
        functions: ['avg'],
        period: '24h',
        bucket: { preset: '1_hour', extra: true },
      });

      assertErrorText(text, ['Unexpected key', 'bucket', 'extra']);
      assert.deepStrictEqual(calls, []);
    },
  },
  {
    name: 'skill_run returns a clear error for unrelated archive-coverage params',
    run: async () => {
      const { text, calls } = await runToolRequest({
        skill: 'scada-archive-coverage',
        format: 'json',
        object: '/root/FP/PROJECT/POINT_COVERAGE',
        field: 'out_value',
        time: { preset: 'last_1_hour' },
      });

      assertErrorText(text, ['Unexpected parameter', 'time']);
      assert.deepStrictEqual(calls, []);
    },
  },
  {
    name: 'skill_run returns a clear error for top-level functions on data-quality',
    run: async () => {
      const { text, calls } = await runToolRequest({
        skill: 'scada-data-quality',
        format: 'json',
        object: '/root/FP/PROJECT/POINT_QUALITY',
        field: 'out_value',
        functions: ['avg'],
      });

      assertErrorText(text, ['Unexpected parameter', 'functions']);
      assert.deepStrictEqual(calls, []);
    },
  },
  {
    name: 'skill_run accepts flat top-level alarm aliases',
    run: async () => {
      const { text, calls } = await runToolRequest({
        skill: 'scada-alarm-list',
        format: 'json',
        active: true,
        acknowledged: false,
        folders: ['/root/FP/PROJECT/UNIT_1'],
        limit: 5,
        offset: 0,
      });

      const payload = JSON.parse(text);
      assert.strictEqual(payload.kind, 'alarm_list');
      assert.ok(calls.length > 0);
    },
  },
  {
    name: 'skill_run returns a clear error for removed legacy object-explore search config',
    run: async () => {
      const { text, calls } = await runToolRequest({
        skill: 'scada-object-explore',
        format: 'json',
        search: {
          folder: '/root/FP/PROJECT/UNIT_1',
        },
      });

      assertErrorText(text, ['Unexpected parameter', 'search', 'searchText', 'searchIn']);
      assert.deepStrictEqual(calls, []);
    },
  },
  {
    name: 'skill_run rejects removed object-explore alias params before side effects',
    run: async () => {
      const cases = [
        {
          request: {
            skill: 'scada-object-explore',
            format: 'json',
            scope_folder: '/root/FP/PROJECT/UNIT_1',
          },
          expected: ['Unexpected parameter', 'scope_folder', 'folder'],
        },
        {
          request: {
            skill: 'scada-object-explore',
            format: 'json',
            folder: '/root/FP/PROJECT/UNIT_1',
            includeChildren: true,
          },
          expected: ['Unexpected parameter', 'includeChildren', 'recursive'],
        },
        {
          request: {
            skill: 'scada-object-explore',
            format: 'json',
            folder: '/root/FP/PROJECT/UNIT_1',
            read_fields: ['state'],
          },
          expected: ['Unexpected parameter', 'read_fields', 'select'],
        },
        {
          request: {
            skill: 'scada-object-explore',
            format: 'json',
            folder: '/root/FP/PROJECT/UNIT_1',
            include_pattern_indexes: true,
          },
          expected: ['Unexpected parameter', 'include_pattern_indexes'],
        },
      ];

      for (const testCase of cases) {
        const { text, calls } = await runToolRequest(testCase.request);
        assertErrorText(text, testCase.expected);
        assert.deepStrictEqual(calls, []);
      }
    },
  },
  {
    name: 'skill_run clamps oversized object-explore limits to the new maximum',
    run: async () => {
      const { text } = await runToolRequest(
        {
          skill: 'scada-object-explore',
          format: 'json',
          folder: '/root/FP/PROJECT/UNIT_1',
          limit: 20000,
          select: ['.pattern'],
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'project'"));
            assert.ok(query.includes('page 1:10000'));
            return {
              total: 1,
              objects: [
                {
                  '.fp_path': '/root/FP/PROJECT/UNIT_1/A',
                  '.name': 'A',
                  '.pattern': '/root/.patterns/FOLDER',
                },
              ],
            };
          },
        },
      );

      const payload = JSON.parse(text);
      assert.strictEqual(payload.kind, 'scope_view');
      assert.ok(payload.warnings.some((warning: { code?: string }) => warning.code === 'limit_clamped'));
    },
  },
  {
    name: 'skill_run defaults object-explore searchText to .name search when searchIn is omitted',
    run: async () => {
      const { text } = await runToolRequest(
        {
          skill: 'scada-object-explore',
          format: 'json',
          folder: '/root/FP/PROJECT/UNIT_1',
          searchText: 'L2431',
          limit: 4,
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'project'"));
            assert.ok(query.includes(".fp_path LIKE '/root/FP/PROJECT/UNIT_1/'"));
            assert.ok(query.includes(".name LIKE 'L2431'"));
            return {
              total: 0,
              objects: [],
            };
          },
        },
      );

      assert.strictEqual(JSON.parse(text).kind, 'scope_view');
    },
  },
  {
    name: 'types_info returns full registry data from the loaded IndexRegistry snapshot',
    run: async () => {
      const { text, calls, tool } = await runRegisteredToolRequest(
        'types_info',
        '*',
        {
          queryObjects: async (query) => {
            if (query.includes("/root/.patterns/.field")) {
              return {
                total: 3,
                objects: [
                  {
                    '.folder': '/root/FP/prototypes/type-a/fields',
                    '.name': 'state',
                    index: ['simple'],
                  },
                  {
                    '.folder': '/root/FP/prototypes/type-a/fields',
                    '.name': 'quality',
                    index: ['simple', '3gram'],
                  },
                  {
                    '.folder': '/root/FP/prototypes/type-b/fields',
                    '.name': 'timestamp',
                    index: [],
                  },
                ],
              };
            }

            return { total: 0, objects: [] };
          },
        },
        { waitForInit: true },
      );

      const payload = JSON.parse(text);
      assert.strictEqual(tool.description?.includes('FALLBACK TOOL'), false);
      assert.strictEqual(tool.parameters?.oneOf?.[1]?.minProperties, 1);
      assert.ok(
        String(tool.parameters?.oneOf?.[1]?.description ?? '').includes(
          '/root/FP/prototypes/point/fields',
        ),
      );
      assert.deepStrictEqual(payload, {
        '/root/FP/prototypes/type-a/fields': {
          '.folder': ['simple'],
          '.fp_path': ['simple', '3gram'],
          '.name': ['simple', '3gram'],
          '.pattern': ['simple'],
          quality: ['simple', '3gram'],
          state: ['simple'],
        },
        '/root/FP/prototypes/type-b/fields': {
          '.folder': ['simple'],
          '.fp_path': ['simple', '3gram'],
          '.name': ['simple', '3gram'],
          '.pattern': ['simple'],
          timestamp: [],
        },
      });
      assert.deepStrictEqual(calls, []);
    },
  },
  {
    name: 'types_info treats empty-object runtime fallbacks like full registry requests',
    run: async () => {
      const { text, calls } = await runRegisteredToolRequest(
        'types_info',
        {},
        {
          queryObjects: async (query) => {
            if (query.includes("/root/.patterns/.field")) {
              return {
                total: 1,
                objects: [
                  {
                    '.folder': '/root/FP/prototypes/type-a/fields',
                    '.name': 'state',
                    index: ['simple'],
                  },
                ],
              };
            }

            return { total: 0, objects: [] };
          },
        },
        { waitForInit: true },
      );

      assert.deepStrictEqual(JSON.parse(text), {
        '/root/FP/prototypes/type-a/fields': {
          '.folder': ['simple'],
          '.fp_path': ['simple', '3gram'],
          '.name': ['simple', '3gram'],
          '.pattern': ['simple'],
          state: ['simple'],
        },
      });
      assert.deepStrictEqual(calls, []);
    },
  },
  {
    name: 'ecomet_indexes stays registered without fallback-only framing',
    run: async () => {
      const { text, tool } = await runRegisteredToolRequest(
        'ecomet_indexes',
        {
          pattern: '/root/.patterns/alarm',
        },
        {
          queryObjects: async (query) => {
            if (query.includes("/root/.patterns/.field")) {
              return { total: 0, objects: [] };
            }

            assert.ok(query.includes("/root/.patterns/alarm"));
            return {
              total: 1,
              objects: [
                {
                  '.name': 'text',
                  index: ['simple', '3gram'],
                },
              ],
            };
          },
        },
        { waitForInit: true },
      );

      const payload = JSON.parse(text);
      assert.strictEqual(tool.description?.includes('FALLBACK TOOL'), false);
      assert.deepStrictEqual(payload, {
        pattern: '/root/.patterns/alarm',
        fields: {
          '.folder': { simple: true, trigram: false, datetime: false },
          '.fp_path': { simple: true, trigram: true, datetime: false },
          '.name': { simple: true, trigram: true, datetime: false },
          '.pattern': { simple: true, trigram: false, datetime: false },
          text: { simple: true, trigram: true, datetime: false },
        },
      });
    },
  },
  {
    name: 'types_info returns explicit invalid markers for unknown fields and types',
    run: async () => {
      const { text } = await runRegisteredToolRequest(
        'types_info',
        {
          '/root/FP/prototypes/type-a/fields': ['state', 'missing_field'],
          '/root/FP/prototypes/missing/fields': '*',
        },
        {
          queryObjects: async (query) => {
            if (query.includes("/root/.patterns/.field")) {
              return {
                total: 1,
                objects: [
                  {
                    '.folder': '/root/FP/prototypes/type-a/fields',
                    '.name': 'state',
                    index: ['simple'],
                  },
                ],
              };
            }

            if (query.includes("/root/FP/prototypes/missing/fields")) {
              return { total: 0, objects: [] };
            }

            return { total: 0, objects: [] };
          },
        },
        { waitForInit: true },
      );

      const payload = JSON.parse(text);
      assert.deepStrictEqual(payload, {
        '/root/FP/prototypes/type-a/fields': {
          state: ['simple'],
          missing_field: 'invalid field',
        },
        '/root/FP/prototypes/missing/fields': 'invalid type',
      });
    },
  },
  {
    name: 'types_info rejects malformed request values before side effects',
    run: async () => {
      const { text, calls } = await runRegisteredToolRequest(
        'types_info',
        {
          '/root/FP/prototypes/type-a/fields': 123,
        },
        {},
        { waitForInit: true },
      );

      assertErrorText(text, ['types_info value for /root/FP/prototypes/type-a/fields must be "*" or a non-empty array of field names']);
      assert.deepStrictEqual(calls, []);
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
