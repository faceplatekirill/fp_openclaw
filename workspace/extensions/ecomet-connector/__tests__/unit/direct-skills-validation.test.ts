import assert from 'assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type SkillModule = (context: {
  client: unknown;
  params: Record<string, unknown>;
  indexRegistry?: unknown;
}) => Promise<Record<string, unknown>>;

const runScadaPointHistory = require('../../../../skills/scada-point-history/index.js') as SkillModule;
const runScadaPointSnapshot = require('../../../../skills/scada-point-snapshot/index.js') as SkillModule;
const runScadaPeriodAggregates = require('../../../../skills/scada-period-aggregates/index.js') as SkillModule;
const runScadaArchiveCoverage = require('../../../../skills/scada-archive-coverage/index.js') as SkillModule;
const runScadaDataQuality = require('../../../../skills/scada-data-quality/index.js') as SkillModule;
const runScadaAlarmList = require('../../../../skills/scada-alarm-list/index.js') as SkillModule;
const runScadaObjectExplore = require('../../../../skills/scada-object-explore/index.js') as SkillModule;

type RecordedCall =
  | { kind: 'application'; module: string; method: string; params: unknown }
  | { kind: 'queryObjects'; query: string };

type MockHandlers = {
  application?: (
    module: string,
    method: string,
    params: unknown,
    calls: RecordedCall[],
  ) => Promise<unknown>;
  queryObjects?: (
    query: string,
    calls: RecordedCall[],
  ) => Promise<{ total?: number; objects: Record<string, unknown>[] }>;
};

function utcMs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number {
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
}

function createIndexRegistry() {
  return {
    hasPattern() {
      return true;
    },
    async loadPattern() {},
    getFieldIndex(_pattern: string, fieldName: string) {
      if (fieldName === '.fp_path' || fieldName === '.name') {
        return { simple: true, trigram: true, datetime: false };
      }

      if (fieldName === '.pattern' || fieldName === '.folder') {
        return { simple: true, trigram: false, datetime: false };
      }

      return undefined;
    },
  };
}

function createMockClient(handlers: MockHandlers = {}) {
  const calls: RecordedCall[] = [];

  return {
    calls,
    client: {
      async application(module: string, method: string, params: unknown) {
        calls.push({ kind: 'application', module, method, params });

        if (handlers.application) {
          return handlers.application(module, method, params, calls);
        }

        return null;
      },
      async queryObjects(query: string) {
        calls.push({ kind: 'queryObjects', query });

        if (handlers.queryObjects) {
          return handlers.queryObjects(query, calls);
        }

        return {
          total: 0,
          objects: [],
        };
      },
    },
  };
}

async function withFixedNow<T>(nowMs: number | undefined, run: () => Promise<T>): Promise<T> {
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

async function expectError(
  run: () => Promise<unknown>,
  expectedFragments: string | string[],
): Promise<Error> {
  const fragments = Array.isArray(expectedFragments)
    ? expectedFragments
    : [expectedFragments];

  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof Error, 'Expected an Error instance to be thrown');
    for (const fragment of fragments) {
      assert.ok(
        error.message.includes(fragment),
        `Expected error message to include "${fragment}", got: ${error.message}`,
      );
    }
    return error;
  }

  assert.fail(`Expected error containing: ${fragments.join(', ')}`);
}

async function runSkillModule(
  skillModule: SkillModule,
  params: Record<string, unknown>,
  options: {
    handlers?: MockHandlers;
    indexRegistry?: unknown;
    nowMs?: number;
  } = {},
): Promise<{ payload: Record<string, unknown>; calls: RecordedCall[] }> {
  const runtime = createMockClient(options.handlers);
  const payload = await withFixedNow(options.nowMs, () =>
    skillModule({
      client: runtime.client,
      params,
      indexRegistry: options.indexRegistry ?? createIndexRegistry(),
    }),
  );

  return {
    payload,
    calls: runtime.calls,
  };
}

async function expectValidationFailure(
  skillModule: SkillModule,
  params: Record<string, unknown>,
  expectedFragments: string | string[],
  options: {
    indexRegistry?: unknown;
    nowMs?: number;
  } = {},
): Promise<void> {
  const runtime = createMockClient();

  await expectError(
    () =>
      withFixedNow(options.nowMs, () =>
        skillModule({
          client: runtime.client,
          params,
          indexRegistry: options.indexRegistry ?? createIndexRegistry(),
        }),
      ),
    expectedFragments,
  );

  assert.deepStrictEqual(
    runtime.calls,
    [],
    'Validation failures must happen before any client side effect',
  );
}

function findApplicationCall(calls: RecordedCall[], method: string) {
  return calls.find(
    (call): call is Extract<RecordedCall, { kind: 'application' }> =>
      call.kind === 'application' && call.method === method,
  );
}

function getOnlyQuery(calls: RecordedCall[]) {
  const queryCalls = calls.filter(
    (call): call is Extract<RecordedCall, { kind: 'queryObjects' }> =>
      call.kind === 'queryObjects',
  );

  assert.strictEqual(queryCalls.length, 1, 'Expected exactly one queryObjects call');
  return queryCalls[0].query;
}

const tests = [
  {
    name: 'scada-point-history accepts flat object/field/period shorthand and reaches archive reads',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_HISTORY';
      const field = 'out_value';
      const archivePath = '/archive/history/out_value';
      const { payload, calls } = await runSkillModule(
        runScadaPointHistory,
        {
          object,
          field,
          period: '24h',
        },
        {
          nowMs,
          handlers: {
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
                  [archivePath]: [[nowMs - 3_600_000, 42]],
                };
              }

              throw new Error(`Unexpected method: ${method}`);
            },
          },
        },
      );

      assert.strictEqual(payload.kind, 'history_view');
      assert.deepStrictEqual(findApplicationCall(calls, 'get_tags_archive')?.params, {
        [object]: [field],
      });
      assert.deepStrictEqual(findApplicationCall(calls, 'read_archives')?.params, {
        archives: [archivePath],
        from: nowMs - 24 * 60 * 60 * 1000,
        to: nowMs,
      });
    },
  },
  {
    name: 'scada-point-history accepts range alias shorthand',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_HISTORY_RANGE';
      const field = 'out_value';
      const archivePath = '/archive/history/range';
      const { calls } = await runSkillModule(
        runScadaPointHistory,
        {
          object,
          field,
          range: 'last-1h',
        },
        {
          nowMs,
          handlers: {
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
                  [archivePath]: [[nowMs - 60_000, 42]],
                };
              }

              throw new Error(`Unexpected method: ${method}`);
            },
          },
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'read_archives')?.params, {
        archives: [archivePath],
        from: nowMs - 60 * 60 * 1000,
        to: nowMs,
      });
    },
  },
  {
    name: 'scada-point-history preserves explicit until timestamps from newer live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const untilMs = utcMs(2026, 3, 18, 10, 0);
      const object = '/root/FP/PROJECT/POINT_HISTORY_UNTIL';
      const field = 'out_value';
      const archivePath = '/archive/history/until';
      const { calls } = await runSkillModule(
        runScadaPointHistory,
        {
          objects: [object],
          field,
          range: {
            kind: 'last',
            amount: 1,
            unit: 'hour',
          },
          until: '2026-03-18T10:00:00Z',
        },
        {
          nowMs,
          handlers: {
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
                  [archivePath]: [[nowMs - 60 * 60 * 1000, 42]],
                };
              }

              throw new Error(`Unexpected method: ${method}`);
            },
          },
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'read_archives')?.params, {
        archives: [archivePath],
        from: untilMs - 60 * 60 * 1000,
        to: untilMs,
      });
    },
  },
  {
    name: 'scada-point-history rejects nested tags with wrong-level keys before side effects',
    run: async () => {
      await expectValidationFailure(
        runScadaPointHistory,
        {
          tags: [
            {
              object: '/root/FP/PROJECT/POINT_HISTORY',
              field: 'out_value',
              time: { preset: 'last_1_hour' },
            },
          ],
        },
        ['has unexpected keys', 'time'],
      );
    },
  },
  {
    name: 'scada-point-history rejects mixed nested time with flat aliases before side effects',
    run: async () => {
      await expectValidationFailure(
        runScadaPointHistory,
        {
          object: '/root/FP/PROJECT/POINT_HISTORY',
          field: 'out_value',
          time: { preset: 'last_1_hour' },
          period: '24h',
        },
        ['Conflicting params', 'period'],
      );
    },
  },
  {
    name: 'scada-point-snapshot accepts flat timestamp shorthand',
    run: async () => {
      const object = '/root/FP/PROJECT/POINT_SNAPSHOT';
      const field = 'out_value';
      const archivePath = '/archive/snapshot/out_value';
      const expectedTimestamp = utcMs(2026, 3, 18, 9, 37);
      const { payload, calls } = await runSkillModule(
        runScadaPointSnapshot,
        {
          object,
          field,
          timestamp: '2026-03-18T09:37',
          timezone: 'UTC',
        },
        {
          handlers: {
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
        },
      );

      assert.strictEqual(payload.kind, 'snapshot_view');
      assert.deepStrictEqual(findApplicationCall(calls, 'get_tags_archive')?.params, {
        [object]: [field],
      });
      assert.deepStrictEqual(findApplicationCall(calls, 'get_points')?.params, {
        archives: [archivePath],
        ts: expectedTimestamp,
      });
    },
  },
  {
    name: 'scada-point-snapshot accepts string time and offset aliases seen in live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_SNAPSHOT';
      const field = 'out_value';
      const archivePath = '/archive/snapshot/out_value';

      const exactTime = await runSkillModule(
        runScadaPointSnapshot,
        {
          object,
          field,
          time: '2026-03-18T06:00:00+06:00',
          timezone: 'Asia/Almaty',
        },
        {
          handlers: {
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
        },
      );

      const relativeTime = await runSkillModule(
        runScadaPointSnapshot,
        {
          objects: [object],
          field,
          offset: '-1h',
          timezone: 'UTC',
        },
        {
          nowMs,
          handlers: {
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
                  [archivePath]: 15.7,
                };
              }

              throw new Error(`Unexpected method: ${method}`);
            },
          },
        },
      );

      assert.strictEqual(exactTime.payload.kind, 'snapshot_view');
      assert.deepStrictEqual(findApplicationCall(exactTime.calls, 'get_points')?.params, {
        archives: [archivePath],
        ts: utcMs(2026, 3, 18, 1, 0),
      });

      assert.strictEqual(relativeTime.payload.kind, 'snapshot_view');
      assert.deepStrictEqual(findApplicationCall(relativeTime.calls, 'get_points')?.params, {
        archives: [archivePath],
        ts: nowMs - 60 * 60 * 1000,
      });
    },
  },
  {
    name: 'scada-point-snapshot accepts timestamp_text aliases from later live retries',
    run: async () => {
      const object = '/root/FP/PROJECT/POINT_SNAPSHOT';
      const field = 'out_value';
      const archivePath = '/archive/snapshot/out_value';
      const { calls } = await runSkillModule(
        runScadaPointSnapshot,
        {
          object,
          field,
          timestamp_text: '2026-03-18 06:00',
          timestamp_timezone: 'Asia/Almaty',
        },
        {
          handlers: {
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
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'get_points')?.params, {
        archives: [archivePath],
        ts: utcMs(2026, 3, 18, 1, 0),
      });
    },
  },
  {
    name: 'scada-point-snapshot accepts timestamp_local aliases from newer live retries',
    run: async () => {
      const object = '/root/FP/PROJECT/POINT_SNAPSHOT';
      const field = 'out_value';
      const archivePath = '/archive/snapshot/out_value';
      const { calls } = await runSkillModule(
        runScadaPointSnapshot,
        {
          object,
          field,
          timestamp_local: '2026-03-18 06:00',
          timezone: 'Asia/Almaty',
        },
        {
          handlers: {
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
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'get_points')?.params, {
        archives: [archivePath],
        ts: utcMs(2026, 3, 18, 1, 0),
      });
    },
  },
  {
    name: 'scada-point-snapshot rejects numeric timestamps before side effects',
    run: async () => {
      await expectValidationFailure(
        runScadaPointSnapshot,
        {
          object: '/root/FP/PROJECT/POINT_SNAPSHOT',
          field: 'out_value',
          timestamp: 1773826620000,
          timezone: 'UTC',
        },
        'Do not pre-compute epoch timestamps',
      );
    },
  },
  {
    name: 'scada-point-snapshot rejects nested tags with wrong-level keys before side effects',
    run: async () => {
      await expectValidationFailure(
        runScadaPointSnapshot,
        {
          tags: [
            {
              object: '/root/FP/PROJECT/POINT_SNAPSHOT',
              field: 'out_value',
              functions: ['avg'],
            },
          ],
          time: {
            at: '2026-03-18 09:37',
            timezone: 'UTC',
          },
        },
        ['has unexpected keys', 'functions'],
      );
    },
  },
  {
    name: 'scada-period-aggregates accepts flat shorthand with top-level functions, period, and bucket',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_AGG';
      const field = 'out_value';
      const archivePath = '/archive/aggregates/out_value';
      const { payload, calls } = await runSkillModule(
        runScadaPeriodAggregates,
        {
          object,
          field,
          functions: ['avg', 'max', 'avg'],
          period: '24h',
          bucket: { preset: '1_hour' },
        },
        {
          nowMs,
          handlers: {
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
                const aggregateParams = params as {
                  timestamps: number[];
                };
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
        },
      );

      assert.strictEqual(payload.kind, 'aggregate_table');
      assert.deepStrictEqual(findApplicationCall(calls, 'get_tags_archive')?.params, {
        [object]: [field],
      });
      assert.deepStrictEqual(findApplicationCall(calls, 'get_aggregates')?.params, {
        aggregates: [
          [archivePath, 'avg'],
          [archivePath, 'max'],
        ],
        timestamps: Array.from({ length: 25 }, (_, index) => nowMs - 24 * 60 * 60 * 1000 + index * 60 * 60 * 1000),
      });
    },
  },
  {
    name: 'scada-period-aggregates accepts shared-field objects shorthand',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_AGG_OBJECTS';
      const field = 'out_value';
      const archivePath = '/archive/aggregates/objects';
      const { calls } = await runSkillModule(
        runScadaPeriodAggregates,
        {
          objects: [object],
          field,
          functions: ['avg'],
          period: '24h',
        },
        {
          nowMs,
          handlers: {
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
                };
              }

              throw new Error(`Unexpected method: ${method}`);
            },
          },
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'get_tags_archive')?.params, {
        [object]: [field],
      });
    },
  },
  {
    name: 'scada-period-aggregates accepts string scope aliases and structured period objects',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_AGG_SCOPE';
      const field = 'out_value';
      const archivePath = '/archive/aggregates/scope';
      const { calls } = await runSkillModule(
        runScadaPeriodAggregates,
        {
          scope: object,
          field,
          functions: ['avg', 'max'],
          period: { kind: 'last', value: 24, unit: 'hours' },
        },
        {
          nowMs,
          handlers: {
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
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'get_tags_archive')?.params, {
        [object]: [field],
      });
    },
  },
  {
    name: 'scada-period-aggregates accepts string bucket aliases for whole-range summaries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_AGG_BUCKET_ALIAS';
      const field = 'out_value';
      const archivePath = '/archive/aggregates/bucket-alias';
      const { calls } = await runSkillModule(
        runScadaPeriodAggregates,
        {
          object,
          field,
          functions: ['avg'],
          period: '24h',
          bucket: 'all',
        },
        {
          nowMs,
          handlers: {
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
                return {
                  values: {
                    [String(nowMs)]: {
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
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'get_aggregates')?.params, {
        aggregates: [[archivePath, 'avg']],
        timestamps: [nowMs - 24 * 60 * 60 * 1000, nowMs],
      });
    },
  },
  {
    name: 'scada-period-aggregates accepts entire bucket aliases from newer live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_AGG_ENTIRE';
      const field = 'out_value';
      const archivePath = '/archive/aggregates/entire';
      const { calls } = await runSkillModule(
        runScadaPeriodAggregates,
        {
          object,
          field,
          functions: ['avg'],
          range: 'last_24_hours',
          bucket: 'entire',
        },
        {
          nowMs,
          handlers: {
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

              if (method === 'get_aggregates') {
                return {
                  values: {
                    [String(nowMs)]: {
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
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'get_aggregates')?.params, {
        aggregates: [[archivePath, 'avg']],
        timestamps: [nowMs - 24 * 60 * 60 * 1000, nowMs],
      });
    },
  },
  {
    name: 'scada-period-aggregates accepts timestampsMode and bucketMinutes aliases from live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_AGG_MINUTES';
      const field = 'out_value';
      const archivePath = '/archive/aggregates/minutes';
      const { calls } = await runSkillModule(
        runScadaPeriodAggregates,
        {
          tags: [{ object, field, functions: ['avg', 'max'] }],
          from: '2026-03-17 12:00',
          to: '2026-03-18 12:00',
          timezone: 'UTC',
          timestampsMode: 'human',
          bucketMinutes: 1440,
        },
        {
          nowMs,
          handlers: {
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
                return {
                  values: {
                    [String(nowMs)]: {
                      [archivePath]: { avg: 1, max: 2 },
                    },
                  },
                  invalid: {},
                };
              }

              throw new Error(`Unexpected method: ${method}`);
            },
          },
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'get_aggregates')?.params, {
        aggregates: [
          [archivePath, 'avg'],
          [archivePath, 'max'],
        ],
        timestamps: [utcMs(2026, 3, 17, 12, 0), utcMs(2026, 3, 18, 12, 0)],
      });
    },
  },
  {
    name: 'scada-period-aggregates ignores null bucket values from newer live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_AGG_NULL_BUCKET';
      const field = 'out_value';
      const archivePath = '/archive/aggregates/null-bucket';
      const { calls } = await runSkillModule(
        runScadaPeriodAggregates,
        {
          tags: [{ object, field, functions: ['avg', 'max'] }],
          range: 'last_24h',
          bucket: null,
        },
        {
          nowMs,
          handlers: {
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

              if (method === 'get_aggregates') {
                return {
                  values: {
                    [String(nowMs)]: {
                      [archivePath]: { avg: 1, max: 2 },
                    },
                  },
                  invalid: {},
                };
              }

              throw new Error(`Unexpected method: ${method}`);
            },
          },
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'get_aggregates')?.params, {
        aggregates: [
          [archivePath, 'avg'],
          [archivePath, 'max'],
        ],
        timestamps: [nowMs - 24 * 60 * 60 * 1000, nowMs],
      });
    },
  },
  {
    name: 'scada-period-aggregates rejects bucket objects with extra keys before side effects',
    run: async () => {
      await expectValidationFailure(
        runScadaPeriodAggregates,
        {
          object: '/root/FP/PROJECT/POINT_AGG',
          field: 'out_value',
          functions: ['avg'],
          period: '24h',
          bucket: { preset: '1_hour', extra: true },
        },
        ['Unexpected key', 'bucket', 'extra'],
      );
    },
  },
  {
    name: 'scada-period-aggregates rejects nested aggregate tags with wrong-level keys before side effects',
    run: async () => {
      await expectValidationFailure(
        runScadaPeriodAggregates,
        {
          tags: [
            {
              object: '/root/FP/PROJECT/POINT_AGG',
              field: 'out_value',
              functions: ['avg'],
              limit: 99,
            },
          ],
        },
        ['has unexpected keys', 'limit'],
      );
    },
  },
  {
    name: 'scada-archive-coverage accepts flat object and field shorthand',
    run: async () => {
      const object = '/root/FP/PROJECT/POINT_COVERAGE';
      const field = 'out_value';
      const archivePath = '/archive/coverage/out_value';
      const { payload, calls } = await runSkillModule(
        runScadaArchiveCoverage,
        {
          object,
          field,
        },
        {
          handlers: {
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
        },
      );

      assert.strictEqual(payload.kind, 'coverage_view');
      assert.deepStrictEqual(findApplicationCall(calls, 'get_tags_archive')?.params, {
        [object]: [field],
      });
    },
  },
  {
    name: 'scada-archive-coverage rejects unrelated top-level keys before side effects',
    run: async () => {
      await expectValidationFailure(
        runScadaArchiveCoverage,
        {
          object: '/root/FP/PROJECT/POINT_COVERAGE',
          field: 'out_value',
          time: { preset: 'last_1_hour' },
        },
        ['Unexpected parameter', 'time'],
      );
    },
  },
  {
    name: 'scada-archive-coverage rejects nested tags with extra keys before side effects',
    run: async () => {
      await expectValidationFailure(
        runScadaArchiveCoverage,
        {
          tags: [
            {
              object: '/root/FP/PROJECT/POINT_COVERAGE',
              field: 'out_value',
              limit: 99,
            },
          ],
        },
        ['has unexpected keys', 'limit'],
      );
    },
  },
  {
    name: 'scada-data-quality defaults omitted time to the last 24 hours for flat shorthand',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_QUALITY';
      const field = 'out_value';
      const archivePath = '/archive/quality/out_value';
      const { payload, calls } = await runSkillModule(
        runScadaDataQuality,
        {
          object,
          field,
        },
        {
          nowMs,
          handlers: {
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
        },
      );

      assert.strictEqual(payload.kind, 'coverage_view');
      assert.deepStrictEqual(findApplicationCall(calls, 'get_tags_archive')?.params, {
        [object]: [field],
      });
      assert.deepStrictEqual(findApplicationCall(calls, 'read_archives')?.params, {
        archives: [archivePath],
        from: nowMs - 24 * 60 * 60 * 1000,
        to: nowMs,
      });

      const objectReadQuery = getOnlyQuery(calls);
      assert.ok(objectReadQuery.includes("from 'project'"));
      assert.ok(objectReadQuery.includes(object));
    },
  },
  {
    name: 'scada-data-quality accepts scope alias and string time preset',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_QUALITY_SCOPE';
      const field = 'out_value';
      const archivePath = '/archive/quality/scope';
      const { calls } = await runSkillModule(
        runScadaDataQuality,
        {
          scope: [
            {
              object,
              field,
            },
          ],
          time: 'last_24_hours',
        },
        {
          nowMs,
          handlers: {
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
                },
              ],
            }),
          },
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'read_archives')?.params, {
        archives: [archivePath],
        from: nowMs - 24 * 60 * 60 * 1000,
        to: nowMs,
      });
    },
  },
  {
    name: 'scada-data-quality accepts tag_objects and tag_fields aliases',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_QUALITY_TAG_ARRAYS';
      const field = 'out_value';
      const archivePath = '/archive/quality/tag-arrays';
      const { calls } = await runSkillModule(
        runScadaDataQuality,
        {
          tag_objects: [object],
          tag_fields: [field],
          range: 'last_24_hours',
        },
        {
          nowMs,
          handlers: {
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
                },
              ],
            }),
          },
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'read_archives')?.params, {
        archives: [archivePath],
        from: nowMs - 24 * 60 * 60 * 1000,
        to: nowMs,
      });
    },
  },
  {
    name: 'scada-data-quality accepts tag_paths aliases',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_QUALITY_TAG_PATHS';
      const field = 'out_value';
      const archivePath = '/archive/quality/tag-paths';
      const { calls } = await runSkillModule(
        runScadaDataQuality,
        {
          tag_paths: [`${object}:${field}`],
          time: 'last_24_hours',
        },
        {
          nowMs,
          handlers: {
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
                },
              ],
            }),
          },
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'read_archives')?.params, {
        archives: [archivePath],
        from: nowMs - 24 * 60 * 60 * 1000,
        to: nowMs,
      });
    },
  },
  {
    name: 'scada-data-quality accepts time_window aliases',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_QUALITY_TIME_WINDOW';
      const field = 'out_value';
      const archivePath = '/archive/quality/time-window';
      const { calls } = await runSkillModule(
        runScadaDataQuality,
        {
          scope: [
            {
              object,
              field,
            },
          ],
          time_window: 'last_24h',
        },
        {
          nowMs,
          handlers: {
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
                },
              ],
            }),
          },
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'read_archives')?.params, {
        archives: [archivePath],
        from: nowMs - 24 * 60 * 60 * 1000,
        to: nowMs,
      });
    },
  },
  {
    name: 'scada-data-quality accepts title and relative string time_range aliases from live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_QUALITY_TIMERANGE';
      const field = 'out_value';
      const archivePath = '/archive/quality/timerange';
      const { calls } = await runSkillModule(
        runScadaDataQuality,
        {
          title: `Data quality for ${object}:${field}`,
          tags: [`${object}:${field}`],
          time_range: {
            kind: 'relative',
            from: '-24h',
            to: 'now',
          },
        },
        {
          nowMs,
          handlers: {
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
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'read_archives')?.params, {
        archives: [archivePath],
        from: nowMs - 24 * 60 * 60 * 1000,
        to: nowMs,
      });
    },
  },
  {
    name: 'scada-data-quality accepts scope and time_range amount aliases from newer live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_QUALITY_TIME_RANGE_ALIAS';
      const field = 'out_value';
      const archivePath = '/archive/quality/time-range-alias';
      const { calls } = await runSkillModule(
        runScadaDataQuality,
        {
          scope: [{ object, field }],
          time_range: {
            kind: 'last',
            amount: 24,
            unit: 'hours',
          },
        },
        {
          nowMs,
          handlers: {
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
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'read_archives')?.params, {
        archives: [archivePath],
        from: nowMs - 24 * 60 * 60 * 1000,
        to: nowMs,
      });
    },
  },
  {
    name: 'scada-data-quality accepts nested time.period aliases from newer live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 12, 0);
      const object = '/root/FP/PROJECT/POINT_QUALITY_TIME_PERIOD';
      const field = 'out_value';
      const archivePath = '/archive/quality/time-period';
      const { calls } = await runSkillModule(
        runScadaDataQuality,
        {
          tags: [{ object, field }],
          time: {
            period: '24h',
          },
        },
        {
          nowMs,
          handlers: {
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
        },
      );

      assert.deepStrictEqual(findApplicationCall(calls, 'read_archives')?.params, {
        archives: [archivePath],
        from: nowMs - 24 * 60 * 60 * 1000,
        to: nowMs,
      });
    },
  },
  {
    name: 'scada-data-quality rejects top-level functions before side effects',
    run: async () => {
      await expectValidationFailure(
        runScadaDataQuality,
        {
          object: '/root/FP/PROJECT/POINT_QUALITY',
          field: 'out_value',
          functions: ['avg'],
        },
        ['Unexpected parameter', 'functions'],
      );
    },
  },
  {
    name: 'scada-data-quality rejects nested tags with wrong-level keys before side effects',
    run: async () => {
      await expectValidationFailure(
        runScadaDataQuality,
        {
          tags: [
            {
              object: '/root/FP/PROJECT/POINT_QUALITY',
              field: 'out_value',
              time: { preset: 'last_24_hours' },
            },
          ],
        },
        ['has unexpected keys', 'time'],
      );
    },
  },
  {
    name: 'scada-alarm-list accepts valid time, scope, filters, and page params',
    run: async () => {
      const { payload, calls } = await runSkillModule(
        runScadaAlarmList,
        {
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
            fields: {
              fact: 'TI',
            },
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
          handlers: {
            queryObjects: async () => ({
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/root/FP/PROJECT/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            }),
          },
        },
      );

      assert.strictEqual(payload.kind, 'alarm_list');
      const query = getOnlyQuery(calls);
      assert.ok(query.includes("from 'archive'"));
      assert.ok(query.includes("point LIKE '/UNIT_1/'"));
      assert.ok(query.includes('active = true'));
      assert.ok(query.includes('acknowledged = false'));
      assert.ok(query.includes("fact = 'TI'"));
      assert.ok(query.includes("text LIKE 'Alarm'"));
      assert.ok(query.includes('page 1:5'));
    },
  },
  {
    name: 'scada-alarm-list accepts flat alarm aliases and relative time_from/time_to',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 10, 0);
      const { calls } = await runSkillModule(
        runScadaAlarmList,
        {
          time_from: 'now-1h',
          time_to: 'now',
          folders: ['/root/FP/PROJECT/UNIT_1'],
          active: true,
          acknowledged: false,
          fields: {
            fact: 'TI',
          },
          search: {
            text: 'Alarm',
            in: ['text'],
          },
          limit: 5,
          offset: 0,
        },
        {
          nowMs,
          handlers: {
            queryObjects: async () => ({
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/root/FP/PROJECT/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            }),
          },
        },
      );

      const query = getOnlyQuery(calls);
      assert.ok(query.includes("point LIKE '/UNIT_1/'"));
      assert.ok(query.includes('active = true'));
      assert.ok(query.includes('acknowledged = false'));
      assert.ok(query.includes("fact = 'TI'"));
      assert.ok(query.includes("text LIKE 'Alarm'"));
      assert.ok(query.includes('page 1:5'));
    },
  },
  {
    name: 'scada-alarm-list accepts scope arrays and timeRange aliases',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 10, 0);
      const { calls } = await runSkillModule(
        runScadaAlarmList,
        {
          scope: ['/root/FP/PROJECT/UNIT_1'],
          timeRange: {
            kind: 'relative',
            from: {
              unit: 'hours',
              value: 24,
            },
            to: {
              kind: 'now',
            },
          },
        },
        {
          nowMs,
          handlers: {
            queryObjects: async () => ({
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/root/FP/PROJECT/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            }),
          },
        },
      );

      const query = getOnlyQuery(calls);
      assert.ok(query.includes("point LIKE '/UNIT_1/'"));
      assert.ok(query.includes('page 1:200'));
    },
  },
  {
    name: 'scada-alarm-list accepts scope strings, timeRange strings, and nested time.range aliases',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 10, 0);

      const first = await runSkillModule(
        runScadaAlarmList,
        {
          scope: '/root/FP/PROJECT/UNIT_1',
          timeRange: 'last_24h_to_now',
        },
        {
          nowMs,
          handlers: {
            queryObjects: async () => ({
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/root/FP/PROJECT/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            }),
          },
        },
      );

      const second = await runSkillModule(
        runScadaAlarmList,
        {
          time: {
            range: 'last_24_hours',
            timezone: 'UTC',
          },
          scope: '/root/FP/PROJECT/UNIT_1',
        },
        {
          nowMs,
          handlers: {
            queryObjects: async () => ({
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/root/FP/PROJECT/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            }),
          },
        },
      );

      assert.ok(getOnlyQuery(first.calls).includes("point LIKE '/UNIT_1/'"));
      assert.ok(getOnlyQuery(second.calls).includes("point LIKE '/UNIT_1/'"));
    },
  },
  {
    name: 'scada-alarm-list accepts scope_folder and time_range aliases',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 10, 0);
      const { calls } = await runSkillModule(
        runScadaAlarmList,
        {
          scope_folder: '/root/FP/PROJECT/UNIT_1',
          time_range: 'last_24h_ending_now',
          limit: 5,
          offset: 0,
        },
        {
          nowMs,
          handlers: {
            queryObjects: async () => ({
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/root/FP/PROJECT/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            }),
          },
        },
      );

      const query = getOnlyQuery(calls);
      assert.ok(query.includes("point LIKE '/UNIT_1/'"));
      assert.ok(query.includes('page 1:5'));
    },
  },
  {
    name: 'scada-alarm-list accepts numeric page and page_size aliases',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 10, 0);
      const { calls } = await runSkillModule(
        runScadaAlarmList,
        {
          scope_folder: '/root/FP/PROJECT/UNIT_1',
          time_range: 'last_24h_to_now',
          page: 2,
          page_size: 100,
        },
        {
          nowMs,
          handlers: {
            queryObjects: async () => ({
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/root/FP/PROJECT/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            }),
          },
        },
      );

      const query = getOnlyQuery(calls);
      assert.ok(query.includes("point LIKE '/UNIT_1/'"));
      assert.ok(query.includes('page 2:100'));
    },
  },
  {
    name: 'scada-alarm-list accepts scopeLabel, null flat filters, null search, and time_preset aliases from live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 10, 0);
      const { calls } = await runSkillModule(
        runScadaAlarmList,
        {
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
          nowMs,
          handlers: {
            queryObjects: async () => ({
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/root/FP/PROJECT/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            }),
          },
        },
      );

      const query = getOnlyQuery(calls);
      assert.ok(query.includes("point LIKE '/UNIT_1/'"));
      assert.ok(query.includes('page 1:100'));
    },
  },
  {
    name: 'scada-alarm-list accepts activeOnly, ackFilter, pageSize, and object time_range aliases',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 10, 0);
      const { calls } = await runSkillModule(
        runScadaAlarmList,
        {
          scope: '/root/FP/PROJECT/UNIT_1',
          timeRange: 'last_24h_to_now',
          activeOnly: false,
          ackFilter: 'both',
          page: 1,
          pageSize: 100,
        },
        {
          nowMs,
          handlers: {
            queryObjects: async () => ({
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/root/FP/PROJECT/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            }),
          },
        },
      );

      const query = getOnlyQuery(calls);
      assert.ok(query.includes("point LIKE '/UNIT_1/'"));
      assert.ok(query.includes('page 1:100'));
    },
  },
  {
    name: 'scada-alarm-list accepts scope_folders aliases',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 10, 0);
      const { calls } = await runSkillModule(
        runScadaAlarmList,
        {
          scope_folders: ['/root/FP/PROJECT/UNIT_1'],
          range: 'last_24h_ending_now',
          page: 1,
          page_size: 50,
        },
        {
          nowMs,
          handlers: {
            queryObjects: async () => ({
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/root/FP/PROJECT/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            }),
          },
        },
      );

      const query = getOnlyQuery(calls);
      assert.ok(query.includes("point LIKE '/UNIT_1/'"));
      assert.ok(query.includes('page 1:50'));
    },
  },
  {
    name: 'scada-alarm-list accepts string scope with last_hour and object time_range aliases',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 10, 0);
      const { calls } = await runSkillModule(
        runScadaAlarmList,
        {
          scope: '/KAZ/AKTOBE',
          time_range: {
            preset: 'last_hour',
          },
          page: 1,
          page_size: 50,
        },
        {
          nowMs,
          handlers: {
            queryObjects: async () => ({
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
            }),
          },
        },
      );

      const query = getOnlyQuery(calls);
      assert.ok(query.includes('AKTOBE'));
      assert.ok(query.includes('page 1:50'));
    },
  },
  {
    name: 'scada-alarm-list accepts scope_path active_only and ack_filter aliases from newer live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 10, 0);
      const { calls } = await runSkillModule(
        runScadaAlarmList,
        {
          scope_path: '/KAZ/AKTOBE',
          time_range: 'last 1 hour',
          active_only: false,
          ack_filter: 'all',
          page: 1,
          page_size: 50,
        },
        {
          nowMs,
          handlers: {
            queryObjects: async () => ({
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
            }),
          },
        },
      );

      const query = getOnlyQuery(calls);
      assert.ok(query.includes('AKTOBE'));
      assert.ok(query.includes('page 1:50'));
      assert.ok(!query.includes('active = false'));
      assert.ok(!query.includes('acknowledged ='));
    },
  },
  {
    name: 'scada-alarm-list accepts end-duration and search/select aliases from later live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 14, 45);
      const { calls } = await runSkillModule(
        runScadaAlarmList,
        {
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
          nowMs,
          handlers: {
            queryObjects: async () => ({
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/root/FP/PROJECT/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            }),
          },
        },
      );

      const query = getOnlyQuery(calls);
      assert.ok(query.includes("point LIKE '/UNIT_1/'"));
      assert.ok(query.includes("text LIKE 'Alarm'"));
      assert.ok(query.includes('page 1:50'));
      assert.ok(query.includes('dt_off'));
    },
  },
  {
    name: 'scada-alarm-list accepts structured timeRange end aliases and ignores include_values/include_stats from AKTOBE live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 14, 45);
      const { calls } = await runSkillModule(
        runScadaAlarmList,
        {
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
          nowMs,
          handlers: {
            queryObjects: async () => ({
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
            }),
          },
        },
      );

      const query = getOnlyQuery(calls);
      assert.ok(query.includes("point LIKE '/KAZ/AKMOLA/'"));
      assert.ok(query.includes('page 1:50'));
    },
  },
  {
    name: 'scada-alarm-list accepts paging and relative time_range object aliases from later live retries',
    run: async () => {
      const nowMs = utcMs(2026, 3, 18, 14, 45);
      const { calls } = await runSkillModule(
        runScadaAlarmList,
        {
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
          nowMs,
          handlers: {
            queryObjects: async () => ({
              total: 1,
              objects: [
                {
                  dt_on: utcMs(2026, 3, 18, 9, 15),
                  point: '/root/FP/PROJECT/UNIT_1/POINT_A',
                  text: 'Alarm A',
                  fact: 'TI',
                  relevant: true,
                  active: true,
                  acknowledged: false,
                },
              ],
            }),
          },
        },
      );

      const query = getOnlyQuery(calls);
      assert.ok(query.includes("point LIKE '/UNIT_1/'"));
      assert.ok(query.includes('page 1:50'));
    },
  },
  {
    name: 'scada-alarm-list rejects conflicting nested and flat aliases before side effects',
    run: async () => {
      await expectValidationFailure(
        runScadaAlarmList,
        {
          scope: {
            folders: ['/root/FP/PROJECT/UNIT_1'],
          },
          folders: ['/root/FP/PROJECT/UNIT_1'],
        },
        ['Conflicting params', 'scope', 'folders'],
      );
    },
  },
  {
    name: 'scada-alarm-list rejects nested scope, filters, and page extra keys before side effects',
    run: async () => {
      const cases = [
        {
          params: {
            scope: {
              folders: ['/root/FP/PROJECT/UNIT_1'],
              bogus: true,
            },
          },
          expected: ['Unexpected key', 'scope', 'bogus'],
        },
        {
          params: {
            filters: {
              active: true,
              bogus: true,
            },
          },
          expected: ['Unexpected key', 'filters', 'bogus'],
        },
        {
          params: {
            page: {
              limit: 5,
              bogus: true,
            },
          },
          expected: ['Unexpected key', 'page', 'bogus'],
        },
      ];

      for (const testCase of cases) {
        await expectValidationFailure(
          runScadaAlarmList,
          testCase.params,
          testCase.expected,
        );
      }
    },
  },
  {
    name: 'scada-object-explore accepts flat folder/searchText/searchIn/limit params',
    run: async () => {
      const { payload, calls } = await runSkillModule(
        runScadaObjectExplore,
        {
          folder: '/root/FP/PROJECT/UNIT_1',
          searchText: 'L2431',
          searchIn: ['.name'],
          limit: 4,
        },
        {
          indexRegistry: createIndexRegistry(),
          handlers: {
            queryObjects: async () => ({
              total: 0,
              objects: [],
            }),
          },
        },
      );

      assert.strictEqual(payload.kind, 'scope_view');
      const query = getOnlyQuery(calls);
      assert.ok(query.includes("from 'project'"));
      assert.ok(query.includes(".fp_path LIKE '/root/FP/PROJECT/UNIT_1/'"));
      assert.ok(query.includes(".name LIKE 'L2431'"));
      assert.ok(query.includes('page 1:4'));
    },
  },
  {
    name: 'scada-object-explore defaults searchText to .name when searchIn is omitted',
    run: async () => {
      const { payload, calls } = await runSkillModule(
        runScadaObjectExplore,
        {
          folder: '/root/FP/PROJECT/UNIT_1',
          searchText: 'L2431',
          limit: 4,
        },
        {
          indexRegistry: createIndexRegistry(),
          handlers: {
            queryObjects: async () => ({
              total: 0,
              objects: [],
            }),
          },
        },
      );

      assert.strictEqual(payload.kind, 'scope_view');
      const query = getOnlyQuery(calls);
      assert.ok(query.includes(".fp_path LIKE '/root/FP/PROJECT/UNIT_1/'"));
      assert.ok(query.includes(".name LIKE 'L2431'"));
      assert.ok(query.includes('page 1:4'));
    },
  },
  {
    name: 'scada-object-explore clamps oversized limits and returns a warning',
    run: async () => {
      const { payload, calls } = await runSkillModule(
        runScadaObjectExplore,
        {
          folder: '/root/FP/PROJECT/UNIT_1',
          limit: 20000,
          select: ['.pattern'],
        },
        {
          indexRegistry: createIndexRegistry(),
          handlers: {
            queryObjects: async () => ({
              total: 1,
              objects: [
                {
                  '.fp_path': '/root/FP/PROJECT/UNIT_1/AAA',
                  '.name': 'AAA',
                  '.pattern': '/root/.patterns/FOLDER',
                  '.folder': '/root/FP/PROJECT/UNIT_1',
                },
              ],
            }),
          },
        },
      );

      assert.strictEqual(payload.kind, 'scope_view');
      assert.ok(payload.warnings.some((warning: { code?: string }) => warning.code === 'limit_clamped'));
      const query = getOnlyQuery(calls);
      assert.ok(query.includes(".fp_path LIKE '/root/FP/PROJECT/UNIT_1/'"));
      assert.ok(query.includes('page 1:10000'));
    },
  },
  {
    name: 'scada-object-explore keeps broad projected-field requests on one search path',
    run: async () => {
      const { payload, calls } = await runSkillModule(
        runScadaObjectExplore,
        {
          folder: '/root/FP/PROJECT/UNIT_1',
          limit: 18,
          select: ['.name', 'state'],
        },
        {
          indexRegistry: createIndexRegistry(),
          handlers: {
            queryObjects: async () => ({
              total: 18,
              objects: Array.from({ length: 18 }, (_, index) => ({
                '.fp_path': `/root/FP/PROJECT/UNIT_1/P${index}`,
                '.name': `P${index}`,
                '.pattern': '/root/.patterns/FOLDER',
                state: index % 2 === 0 ? 'on' : 'off',
              })),
            }),
          },
        },
      );

      assert.strictEqual(payload.kind, 'scope_view');
      assert.strictEqual(
        calls.filter((call) => call.kind === 'queryObjects').length,
        1,
      );
      assert.ok(payload.warnings.every((warning: { code?: string }) => warning.code !== 'enrichment_skipped'));
      assert.strictEqual(payload.completeness.status, 'complete');
      assert.strictEqual(payload.blocks[0].objects.length, 18);
      assert.strictEqual(payload.blocks[0].objects[0].fields.state, 'on');
      assert.strictEqual(payload.blocks[0].objects[1].fields.state, 'off');
    },
  },
  {
    name: 'scada-object-explore supports fields filters with non-recursive folder search',
    run: async () => {
      const { payload, calls } = await runSkillModule(
        runScadaObjectExplore,
        {
          folder: '/root/FP/PROJECT/UNIT_1',
          recursive: false,
          fields: {
            vclass: '220',
          },
          select: ['.name'],
        },
        {
          indexRegistry: createIndexRegistry(),
          handlers: {
            queryObjects: async () => ({
              total: 1,
              objects: [
                {
                  '.fp_path': '/root/FP/PROJECT/UNIT_1/A',
                  '.name': 'A',
                  '.pattern': '/root/.patterns/FOLDER',
                },
              ],
            }),
          },
        },
      );

      assert.strictEqual(payload.kind, 'scope_view');
      const query = getOnlyQuery(calls);
      assert.ok(query.includes(".folder = $oid('/root/FP/PROJECT/UNIT_1')"));
      assert.ok(query.includes("vclass := '220'"));
    },
  },
  {
    name: 'scada-object-explore rejects malformed flat searchIn before side effects',
    run: async () => {
      await expectValidationFailure(
        runScadaObjectExplore,
        {
          folder: '/root/FP/PROJECT/UNIT_1',
          searchText: 'L2431',
          searchIn: '.name',
        },
        'searchIn must be a non-empty array',
        {
          indexRegistry: createIndexRegistry(),
        },
      );
    },
  },
  {
    name: 'scada-object-explore rejects removed structured search objects before side effects',
    run: async () => {
      await expectValidationFailure(
        runScadaObjectExplore,
        {
          search: {
            text: 'L2431',
            in: ['.name'],
            bogus: true,
          },
        },
        ['Unexpected parameter', 'search', 'searchText', 'searchIn'],
        {
          indexRegistry: createIndexRegistry(),
        },
      );
    },
  },
  {
    name: 'scada-object-explore rejects removed read_fields before side effects',
    run: async () => {
      await expectValidationFailure(
        runScadaObjectExplore,
        {
          folder: '/root/FP/PROJECT/UNIT_1',
          read_fields: ['state'],
        },
        ['Unexpected parameter', 'read_fields', 'select'],
        {
          indexRegistry: createIndexRegistry(),
        },
      );
    },
  },
  {
    name: 'scada-object-explore rejects removed alias params before side effects',
    run: async () => {
      const cases = [
        {
          params: {
            scope_folder: '/root/FP/PROJECT/UNIT_1',
          },
          expected: ['Unexpected parameter', 'scope_folder', 'folder'],
        },
        {
          params: {
            folder: '/root/FP/PROJECT/UNIT_1',
            includeChildren: true,
          },
          expected: ['Unexpected parameter', 'includeChildren', 'recursive'],
        },
        {
          params: {
            folder: '/root/FP/PROJECT/UNIT_1',
            include_pattern_indexes: true,
          },
          expected: ['Unexpected parameter', 'include_pattern_indexes'],
        },
      ];

      for (const testCase of cases) {
        await expectValidationFailure(
          runScadaObjectExplore,
          testCase.params,
          testCase.expected,
          {
            indexRegistry: createIndexRegistry(),
          },
        );
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
