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

async function runJsonSkill(
  request: Record<string, unknown>,
  handlers: MockRuntimeHandlers,
): Promise<{ payload: any; calls: RecordedCall[] }> {
  return withMockedRuntime(handlers, async (calls) => {
    const api = createApi();
    register(api as any);
    const tool = api.tools.get('skill_run');

    assert.ok(tool);

    const response = await tool!.execute('m1-direct-test', request);
    return {
      payload: JSON.parse(response.content[0].text),
      calls,
    };
  });
}

function utcMs(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
}

function buildAlarmRows(total: number, startMs: number): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];

  for (let index = 0; index < total; index += 1) {
    rows.push({
      dt_on: startMs + index * 60_000,
      point: `/root/FP/PROJECT/POINT_${index}`,
      text: `Alarm ${index}`,
      fact: index % 2 === 0 ? 'TI' : 'TS',
      relevant: index % 3 === 0,
      active: index % 2 === 0,
      acknowledged: index % 2 === 1,
    });
  }

  return rows;
}

const tests = [
  {
    name: 'Object explore returns canonical scope_view with pagination partiality',
    run: async () => {
      const { payload } = await runJsonSkill(
        {
          skill: 'scada-object-explore',
          format: 'json',
          params: {
            folder: '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220',
            recursive: true,
            select: ['.name', '.pattern'],
            limit: 2,
          },
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'project'"));
            return {
              total: 5,
              objects: [
                {
                  '.fp_path': '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L2831/P',
                  '.name': 'P',
                  '.pattern': '/root/FP/prototypes/point/fields',
                  '.folder': '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L2831',
                },
                {
                  '.fp_path': '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L2832/P',
                  '.name': 'P',
                  '.pattern': '/root/FP/prototypes/point/fields',
                  '.folder': '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L2832',
                },
              ],
            };
          },
        },
      );

      assert.strictEqual(payload.kind, 'scope_view');
      assert.strictEqual(payload.blocks.length, 1);
      assert.strictEqual(payload.blocks[0].objects[0].path, '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L2831/P');
      assert.strictEqual(payload.blocks[0].total, 5);
      assert.deepStrictEqual(payload.blocks[0].type_summary, {
        '/root/FP/prototypes/point/fields': 2,
      });
      assert.strictEqual(payload.completeness.status, 'partial');
      assert.ok(payload.completeness.continuation_hint.includes('offset 2'));
    },
  },
  {
    name: 'Object explore keeps broad projected-field reads on the search path',
    run: async () => {
      const { payload, calls } = await runJsonSkill(
        {
          skill: 'scada-object-explore',
          format: 'json',
          params: {
            folder: '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220',
            recursive: true,
            select: ['.name', 'state'],
            limit: 18,
          },
        },
        {
          queryObjects: async () => ({
            total: 18,
            objects: Array.from({ length: 18 }, (_, index) => ({
              '.fp_path': `/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L${index}/P`,
              '.name': `P${index}`,
              '.pattern': '/root/FP/prototypes/point/fields',
              state: index % 2 === 0 ? 'closed' : 'open',
            })),
          }),
        },
      );

      assert.strictEqual(payload.kind, 'scope_view');
      assert.ok(payload.warnings.every((warning: any) => warning.code !== 'enrichment_skipped'));
      assert.strictEqual(payload.completeness.status, 'complete');
      assert.strictEqual(payload.blocks[0].objects.length, 18);
      assert.strictEqual(payload.blocks[0].objects[0].fields.state, 'closed');
      assert.strictEqual(payload.blocks[0].objects[1].fields.state, 'open');
      assert.strictEqual(
        calls.filter(
          (call) => call.kind === 'queryObjects' && call.query.includes("from 'project'"),
        ).length,
        1,
      );
    },
  },
  {
    name: 'Point history preserves warnings provenance and carry-forward notes',
    run: async () => {
      const from = utcMs(2026, 3, 16, 11, 0);
      const to = utcMs(2026, 3, 16, 12, 0);
      const { payload } = await runJsonSkill(
        {
          skill: 'scada-point-history',
          format: 'json',
          params: {
            tags: [
              { object: '/root/FP/PROJECT/POINT_OK', field: 'out_value', label: 'Pressure' },
              { object: '/root/FP/PROJECT/POINT_INVALID', field: 'out_value' },
            ],
            time: {
              from: '2026-03-16 11:00',
              to: '2026-03-16 12:00',
              timezone: 'UTC',
            },
          },
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  '/root/FP/PROJECT/POINT_OK': {
                    out_value: '/root/archive/point_ok/out_value',
                  },
                },
                invalid_tags: ['/root/FP/PROJECT/POINT_INVALID'],
              };
            }

            if (method === 'read_archives') {
              return {
                '/root/archive/point_ok/out_value': [
                  [from - 60_000, 10],
                  [from + 60_000, 11],
                ],
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
      );

      assert.strictEqual(payload.kind, 'history_view');
      assert.strictEqual(payload.blocks.length, 1);
      assert.strictEqual(payload.warnings.length, 1);
      assert.strictEqual(payload.completeness.status, 'partial');
      assert.strictEqual(payload.provenance.period_from, from);
      assert.strictEqual(payload.provenance.period_to, to);
      assert.ok(
        payload.blocks[0].notes.some((note: string) => note.includes('change-driven')),
      );
    },
  },
  {
    name: 'Point history no-data case still returns an empty block',
    run: async () => {
      const { payload } = await runJsonSkill(
        {
          skill: 'scada-point-history',
          format: 'json',
          params: {
            tags: [{ object: '/root/FP/PROJECT/POINT_OK', field: 'out_value' }],
            time: {
              from: '2026-03-16 11:00',
              to: '2026-03-16 12:00',
              timezone: 'UTC',
            },
          },
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  '/root/FP/PROJECT/POINT_OK': {
                    out_value: '/root/archive/point_ok/out_value',
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'read_archives') {
              return {
                '/root/archive/point_ok/out_value': [],
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
      );

      assert.strictEqual(payload.blocks.length, 1);
      assert.deepStrictEqual(payload.blocks[0].data, []);
      assert.ok(
        payload.blocks[0].notes.some((note: string) =>
          note.includes('No data points were recorded'),
        ),
      );
    },
  },
  {
    name: 'Point snapshot keeps null invalid and unresolved distinct',
    run: async () => {
      const { payload } = await runJsonSkill(
        {
          skill: 'scada-point-snapshot',
          format: 'json',
          params: {
            tags: [
              { object: '/root/FP/PROJECT/POINT_NUM', field: 'out_value' },
              { object: '/root/FP/PROJECT/POINT_NULL', field: 'out_value' },
              { object: '/root/FP/PROJECT/POINT_UNRESOLVED', field: 'out_value' },
              { object: '/root/FP/PROJECT/POINT_INVALID', field: 'out_value' },
            ],
            time: {
              at: '2026-03-16 12:00',
              timezone: 'UTC',
            },
          },
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  '/root/FP/PROJECT/POINT_NUM': {
                    out_value: '/root/archive/point_num/out_value',
                  },
                  '/root/FP/PROJECT/POINT_NULL': {
                    out_value: '/root/archive/point_null/out_value',
                  },
                  '/root/FP/PROJECT/POINT_UNRESOLVED': {},
                },
                invalid_tags: ['/root/FP/PROJECT/POINT_INVALID'],
              };
            }

            if (method === 'get_points') {
              return {
                '/root/archive/point_num/out_value': 12.4,
                '/root/archive/point_null/out_value': null,
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
      );

      assert.strictEqual(payload.kind, 'snapshot_view');
      assert.strictEqual(payload.blocks.length, 1);
      assert.strictEqual(
        payload.blocks[0].values['/root/FP/PROJECT/POINT_NUM:out_value'],
        12.4,
      );
      assert.strictEqual(
        payload.blocks[0].values['/root/FP/PROJECT/POINT_NULL:out_value'],
        null,
      );
      assert.deepStrictEqual(payload.blocks[0].unresolved, [
        '/root/FP/PROJECT/POINT_UNRESOLVED:out_value',
      ]);
      assert.deepStrictEqual(payload.blocks[0].invalid, [
        '/root/FP/PROJECT/POINT_INVALID:out_value',
      ]);
      assert.strictEqual(payload.completeness.status, 'partial');
    },
  },
  {
    name: 'Point snapshot resolves relative ago times in code before get_points',
    run: async () => {
      const fixedNow = utcMs(2026, 3, 16, 13, 0);
      const originalDateNow = Date.now;
      Date.now = () => fixedNow;

      try {
        const { payload } = await runJsonSkill(
          {
            skill: 'scada-point-snapshot',
            format: 'json',
            params: {
              tags: [{ object: '/root/FP/PROJECT/POINT_NUM', field: 'out_value' }],
              time: {
                ago: { amount: 1, unit: 'hour' },
                timezone: 'UTC',
              },
            },
          },
          {
            application: async (_module, method, params: any) => {
              if (method === 'get_tags_archive') {
                return {
                  tags: {
                    '/root/FP/PROJECT/POINT_NUM': {
                      out_value: '/root/archive/point_num/out_value',
                    },
                  },
                  invalid_tags: [],
                };
              }

              if (method === 'get_points') {
                assert.strictEqual(params.ts, fixedNow - 60 * 60 * 1000);
                return {
                  '/root/archive/point_num/out_value': 12.4,
                };
              }

              throw new Error(`Unexpected method: ${method}`);
            },
          },
        );

        assert.strictEqual(payload.blocks[0].timestamp, fixedNow - 60 * 60 * 1000);
        assert.strictEqual(payload.metadata.time_label, '1 hour ago (UTC)');
      } finally {
        Date.now = originalDateNow;
      }
    },
  },
  {
    name: 'Period aggregates include bucket description and caveats',
    run: async () => {
      const start = utcMs(2026, 3, 15, 0, 0);
      const middle = utcMs(2026, 3, 15, 1, 0);
      const end = utcMs(2026, 3, 15, 2, 0);
      const { payload } = await runJsonSkill(
        {
          skill: 'scada-period-aggregates',
          format: 'json',
          params: {
            tags: [
              {
                object: '/root/FP/PROJECT/POINT_OK',
                field: 'out_value',
                functions: ['avg', 'integral'],
                label: 'Pressure',
              },
            ],
            time: {
              from: '2026-03-15 00:00',
              to: '2026-03-15 02:00',
              timezone: 'UTC',
            },
            bucket: {
              preset: '1_hour',
            },
          },
        },
        {
          application: async (_module, method, params: any) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  '/root/FP/PROJECT/POINT_OK': {
                    out_value: '/root/archive/point_ok/out_value',
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'get_aggregates') {
              assert.deepStrictEqual(params.timestamps, [start, middle, end]);
              return {
                values: {
                  [String(middle)]: {
                    '/root/archive/point_ok/out_value': { avg: 10, integral: 600 },
                  },
                  [String(end)]: {
                    '/root/archive/point_ok/out_value': { avg: 11, integral: 660 },
                  },
                },
                invalid: {},
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
      );

      assert.strictEqual(payload.kind, 'aggregate_table');
      assert.strictEqual(payload.blocks.length, 1);
      assert.strictEqual(payload.blocks[0].bucket_description, '1 hour buckets in UTC');
      assert.deepStrictEqual(
        payload.blocks[0].rows.map((row: any) => row.period_from),
        [start, middle],
      );
      assert.ok(
        payload.blocks[0].caveats.some((caveat: string) => caveat.includes('time-weighted')),
      );
      assert.ok(
        payload.blocks[0].caveats.some((caveat: string) => caveat.includes('unit conversion')),
      );
    },
  },
  {
    name: 'Period aggregates preserve DST-aware day buckets',
    run: async () => {
      const { payload } = await runJsonSkill(
        {
          skill: 'scada-period-aggregates',
          format: 'json',
          params: {
            tags: [
              {
                object: '/root/FP/PROJECT/POINT_OK',
                field: 'out_value',
                functions: ['max'],
              },
            ],
            time: {
              from: '2026-03-08 00:00',
              to: '2026-03-10 00:00',
              timezone: 'America/New_York',
            },
            bucket: {
              preset: '1_day',
            },
          },
        },
        {
          application: async (_module, method, params: any) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  '/root/FP/PROJECT/POINT_OK': {
                    out_value: '/root/archive/point_ok/out_value',
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'get_aggregates') {
              const values: Record<string, Record<string, Record<string, number>>> = {};
              for (let index = 1; index < params.timestamps.length; index += 1) {
                values[String(params.timestamps[index])] = {
                  '/root/archive/point_ok/out_value': { max: 10 + index },
                };
              }
              return { values, invalid: {} };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
      );

      assert.strictEqual(payload.provenance.timezone, 'America/New_York');
      assert.ok(
        payload.blocks[0].caveats.some((caveat: string) => caveat.includes('DST-aware')),
      );
      assert.ok(
        payload.blocks[0].rows.some(
          (row: any) => row.period_to - row.period_from !== 24 * 60 * 60 * 1000,
        ),
      );
    },
  },
  {
    name: 'Archive coverage reports archived and unarchived fields explicitly',
    run: async () => {
      const { payload } = await runJsonSkill(
        {
          skill: 'scada-archive-coverage',
          format: 'json',
          params: {
            tags: [
              { object: '/root/FP/PROJECT/POINT_OK', field: 'out_value' },
              { object: '/root/FP/PROJECT/POINT_OK', field: 'state_graph' },
            ],
          },
        },
        {
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  '/root/FP/PROJECT/POINT_OK': {
                    out_value: '/root/archive/point_ok/out_value',
                  },
                },
                invalid_tags: [],
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
      );

      assert.strictEqual(payload.kind, 'coverage_view');
      assert.strictEqual(payload.blocks[0].entries.length, 2);
      assert.strictEqual(payload.blocks[0].entries[0].archive_path, '/root/archive/point_ok/out_value');
      assert.strictEqual(payload.blocks[0].entries[1].archived, false);
      assert.strictEqual(payload.blocks[0].summary.archived, 1);
      assert.strictEqual(payload.blocks[0].summary.not_archived, 1);
      assert.strictEqual(payload.blocks[0].summary.invalid, 0);
    },
  },
  {
    name: 'Archive coverage batches large requests and preserves input order',
    run: async () => {
      const tags = Array.from({ length: 65 }, (_, index) => ({
        object: `/root/FP/PROJECT/TAG_${index}`,
        field: 'out_value',
      }));
      const { payload, calls } = await runJsonSkill(
        {
          skill: 'scada-archive-coverage',
          format: 'json',
          params: { tags },
        },
        {
          application: async (_module, method, params: any) => {
            if (method === 'get_tags_archive') {
              const responseTags: Record<string, Record<string, string>> = {};
              for (const objectPath of Object.keys(params)) {
                const index = Number(objectPath.split('_').pop());
                responseTags[objectPath] =
                  index % 2 === 0
                    ? { out_value: `${objectPath}/archive/out_value` }
                    : {};
              }
              return {
                tags: responseTags,
                invalid_tags: [],
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
      );

      assert.strictEqual(payload.blocks[0].entries.length, 65);
      assert.strictEqual(payload.blocks[0].entries[0].tag, '/root/FP/PROJECT/TAG_0:out_value');
      assert.strictEqual(payload.blocks[0].entries[64].tag, '/root/FP/PROJECT/TAG_64:out_value');
      assert.strictEqual(
        calls.filter((call) => call.kind === 'application' && call.method === 'get_tags_archive')
          .length,
        2,
      );
    },
  },
  {
    name: 'Alarm list surfaces pagination loss and continuation guidance',
    run: async () => {
      const alarms = buildAlarmRows(20, utcMs(2026, 3, 16, 0, 0));
      const { payload } = await runJsonSkill(
        {
          skill: 'scada-alarm-list',
          format: 'json',
          params: {
            time: {
              from: '2026-03-16 00:00',
              to: '2026-03-17 00:00',
              timezone: 'UTC',
            },
            scope: {
              folders: ['/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220'],
            },
            page: {
              limit: 20,
            },
          },
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'archive'"));
            return {
              total: 35,
              objects: alarms,
            };
          },
        },
      );

      assert.strictEqual(payload.kind, 'alarm_list');
      assert.strictEqual(payload.blocks[0].total, 35);
      assert.strictEqual(payload.blocks[0].alarms.length, 20);
      assert.strictEqual(payload.blocks[0].alarms[0].state, 'active, unacknowledged');
      assert.strictEqual(payload.completeness.status, 'partial');
      assert.ok(payload.completeness.continuation_hint.includes('params.page.limit'));
    },
  },
  {
    name: 'Alarm list splits 45-day requests into compliant windows',
    run: async () => {
      let archiveQueryCount = 0;
      const { payload, calls } = await runJsonSkill(
        {
          skill: 'scada-alarm-list',
          format: 'json',
          params: {
            time: {
              from: '2026-01-01 00:00',
              to: '2026-02-15 00:00',
              timezone: 'UTC',
            },
            page: {
              limit: 5,
            },
          },
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'archive'"));
            archiveQueryCount += 1;
            return {
              total: 3,
              objects: buildAlarmRows(3, utcMs(2026, 1, archiveQueryCount, 0, 0)),
            };
          },
        },
      );

      assert.strictEqual(archiveQueryCount, 2);
      assert.ok(payload.warnings.some((warning: any) => warning.code === 'window_split'));
      assert.strictEqual(payload.completeness.status, 'partial');
      assert.strictEqual(
        calls.filter((call) => call.kind === 'queryObjects' && call.query.includes("from 'archive'"))
          .length,
        2,
      );
    },
  },
  {
    name: 'Data quality returns conservative fact notes without diagnosis',
    run: async () => {
      const start = utcMs(2026, 3, 16, 0, 0);
      const { payload } = await runJsonSkill(
        {
          skill: 'scada-data-quality',
          format: 'json',
          params: {
            tags: [{ object: '/root/FP/PROJECT/POINT_OK', field: 'out_value' }],
            time: {
              from: '2026-03-16 00:00',
              to: '2026-03-17 00:00',
              timezone: 'UTC',
            },
          },
        },
        {
          queryObjects: async (query) => {
            assert.ok(query.includes("from 'project'"));
            return {
              objects: [
                {
                  '.fp_path': '/root/FP/PROJECT/POINT_OK',
                  out_value: 12.4,
                  out_qds: 64,
                  out_ts: start + 3_600_000,
                  in_value: 12.4,
                  op_value: 12.4,
                  calculated_value: 12.4,
                  remote_value: 12.4,
                  se_value: 12.4,
                  op_manual: false,
                  calc_manual: false,
                  remote_manual: false,
                  se_manual: false,
                },
              ],
            };
          },
          application: async (_module, method) => {
            if (method === 'get_tags_archive') {
              return {
                tags: {
                  '/root/FP/PROJECT/POINT_OK': {
                    out_value: '/root/archive/point_ok/out_value',
                  },
                },
                invalid_tags: [],
              };
            }

            if (method === 'read_archives') {
              return {
                '/root/archive/point_ok/out_value': [
                  [start + 1_000, 12.4],
                  [start + 2_000, 12.4],
                  [start + 3_000, 12.4],
                ],
              };
            }

            throw new Error(`Unexpected method: ${method}`);
          },
        },
      );

      const notes = payload.blocks[0].entries[0].notes.join(' ');

      assert.strictEqual(payload.kind, 'coverage_view');
      assert.ok(notes.includes('Archive available: /root/archive/point_ok/out_value'));
      assert.ok(notes.includes('Current quality: out_qds = 64'));
      assert.ok(notes.includes(`Current timestamp: out_ts = ${start + 3_600_000}`));
      assert.ok(notes.includes('Last archive change in requested window'));
      assert.ok(notes.includes('Observed 3 history points in the requested window.'));
      assert.ok(!notes.toLowerCase().includes('frozen'));
      assert.ok(!notes.toLowerCase().includes('failed'));
    },
  },
  {
    name: 'Data quality defaults omitted time to the last 24 hours',
    run: async () => {
      const fixedNow = utcMs(2026, 3, 17, 12, 0);
      const originalDateNow = Date.now;
      Date.now = () => fixedNow;

      try {
        const { payload } = await runJsonSkill(
          {
            skill: 'scada-data-quality',
            format: 'json',
            params: {
              tags: [{ object: '/root/FP/PROJECT/POINT_OK', field: 'out_value' }],
            },
          },
          {
            queryObjects: async () => ({
              objects: [
                {
                  '.fp_path': '/root/FP/PROJECT/POINT_OK',
                  out_value: 12.4,
                  out_qds: 0,
                  out_ts: fixedNow - 60_000,
                },
              ],
            }),
            application: async (_module, method) => {
              if (method === 'get_tags_archive') {
                return {
                  tags: {
                    '/root/FP/PROJECT/POINT_OK': {
                      out_value: '/root/archive/point_ok/out_value',
                    },
                  },
                  invalid_tags: [],
                };
              }

              if (method === 'read_archives') {
                return {
                  '/root/archive/point_ok/out_value': [[fixedNow - 30_000, 12.4]],
                };
              }

              throw new Error(`Unexpected method: ${method}`);
            },
          },
        );

        assert.strictEqual(payload.provenance.period_to, fixedNow);
        assert.strictEqual(payload.provenance.period_from, fixedNow - 24 * 60 * 60 * 1000);
        assert.strictEqual(payload.metadata.time_label, 'Last 24 hours');
      } finally {
        Date.now = originalDateNow;
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
