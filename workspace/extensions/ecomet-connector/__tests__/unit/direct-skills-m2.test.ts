import assert from 'assert';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type SkillModule = (context: {
  client: unknown;
  params: Record<string, unknown>;
  indexRegistry?: unknown;
}) => Promise<Record<string, unknown>>;

const runScadaAlarmSummary = require('../../../../skills/scada-alarm-summary/index.js') as SkillModule;
const runReportSpreadsheetExport = require('../../../../skills/report-spreadsheet-export/index.js') as SkillModule;

type RecordedCall = { kind: 'queryObjects'; query: string };

type MockHandlers = {
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

function createMockClient(handlers: MockHandlers = {}) {
  const calls: RecordedCall[] = [];

  return {
    calls,
    client: {
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

async function runSkillModule(
  skillModule: SkillModule,
  params: Record<string, unknown>,
  options: {
    handlers?: MockHandlers;
    nowMs?: number;
  } = {},
): Promise<{ payload: Record<string, unknown>; calls: RecordedCall[] }> {
  const { client, calls } = createMockClient(options.handlers);

  const payload = await withFixedNow(options.nowMs, async () =>
    skillModule({ client, params }),
  );

  return { payload, calls };
}

function buildAlarmRow(index: number, timestamp: number, overrides: Record<string, unknown> = {}) {
  return {
    dt_on: timestamp,
    dt_off: timestamp + 60_000,
    point: `/root/FP/PROJECT/UNIT_${index % 3}`,
    text: `Alarm ${index}`,
    fact: index % 2 === 0 ? 'TI' : 'KA',
    relevant: index % 2 === 0 ? 'protection' : 'analog',
    active: index % 2 === 0,
    acknowledged: index % 2 === 1,
    ...overrides,
  };
}

function parsePageNumber(query: string): number {
  const match = /page (\d+):(\d+)/.exec(query);
  assert.ok(match, `Expected page range in query: ${query}`);
  return Number(match[1]);
}

const tests = [
  {
    name: 'scada-alarm-summary keeps standing alarms on a separate 30-day lookback',
    run: async () => {
      const nowMs = utcMs(2026, 3, 19, 12, 0);
      const mainStart = nowMs - 30 * 60 * 1000;
      const standingStart = nowMs - 3 * 24 * 60 * 60 * 1000;

      const { payload, calls } = await runSkillModule(
        runScadaAlarmSummary,
        {
          time: { preset: 'last_1_hour' },
          scope: { folders: ['/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220'] },
          options: { top_n: 2 },
        },
        {
          nowMs,
          handlers: {
            queryObjects: async (query) => {
              if (query.includes('active = true')) {
                return {
                  total: 1,
                  objects: [
                    buildAlarmRow(99, standingStart, {
                      point: '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L-123',
                      text: 'Long standing alarm',
                      active: true,
                      dt_off: undefined,
                    }),
                  ],
                };
              }

              return {
                total: 2,
                objects: [
                  buildAlarmRow(1, mainStart, {
                    point: '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L-100',
                    active: false,
                  }),
                  buildAlarmRow(2, mainStart + 15 * 60 * 1000, {
                    point: '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L-200',
                    active: true,
                  }),
                ],
              };
            },
          },
        },
      );

      assert.strictEqual(payload.kind, 'alarm_summary');
      const block = (payload.blocks as any[])[0];
      assert.strictEqual(block.metrics.total_alarms, 2);
      assert.strictEqual(block.metrics.alarms_per_hour, 2);
      assert.strictEqual(block.metrics.standing_alarms.length, 1);
      assert.strictEqual(
        block.metrics.standing_alarms[0].source,
        '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L-123',
      );
      assert.strictEqual(block.metrics.standing_alarms[0].since, standingStart);
      assert.strictEqual(block.metrics.top_offenders.length, 2);
      assert.strictEqual(
        calls.filter((call) => call.query.includes('active = true')).length,
        1,
      );
    },
  },
  {
    name: 'scada-alarm-summary accepts range and scope_folder aliases',
    run: async () => {
      const nowMs = utcMs(2026, 3, 19, 12, 0);
      const { payload, calls } = await runSkillModule(
        runScadaAlarmSummary,
        {
          range: 'last_24_hours',
          scope_folder: '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220',
        },
        {
          nowMs,
          handlers: {
            queryObjects: async () => ({
              total: 1,
              objects: [buildAlarmRow(1, nowMs - 60_000)],
            }),
          },
        },
      );

      assert.strictEqual(payload.kind, 'alarm_summary');
      assert.ok(
        calls.some((call) => call.query.includes("point LIKE '/KAZ/AKMOLA/AKMOLA/220/'")),
      );
    },
  },
  {
    name: 'scada-alarm-summary returns a valid zeroed summary when no alarms exist',
    run: async () => {
      const nowMs = utcMs(2026, 3, 19, 12, 0);
      const { payload } = await runSkillModule(
        runScadaAlarmSummary,
        {
          time: {
            from: '2020-01-01 00:00',
            to: '2020-01-01 01:00',
            timezone: 'UTC',
          },
          scope: { folders: ['/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220'] },
        },
        {
          nowMs,
          handlers: {
            queryObjects: async () => ({
              total: 0,
              objects: [],
            }),
          },
        },
      );

      const block = (payload.blocks as any[])[0];
      assert.strictEqual(payload.kind, 'alarm_summary');
      assert.strictEqual(block.metrics.total_alarms, 0);
      assert.strictEqual(block.metrics.alarms_per_hour, 0);
      assert.deepStrictEqual(block.metrics.top_offenders, []);
      assert.deepStrictEqual(block.metrics.flood_periods, []);
      assert.deepStrictEqual(block.metrics.standing_alarms, []);
      assert.deepStrictEqual(block.metrics.chattering_alarms, []);
      assert.strictEqual((payload.completeness as any).status, 'complete');
      assert.ok((payload.warnings as any[]).some((warning) => warning.code === 'empty_result'));
    },
  },
  {
    name: 'scada-alarm-summary handles a single alarm without invalid percentages or chatter',
    run: async () => {
      const nowMs = utcMs(2026, 3, 19, 12, 0);
      const { payload } = await runSkillModule(
        runScadaAlarmSummary,
        {
          time: { preset: 'last_1_hour' },
          scope: { folders: ['/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220'] },
        },
        {
          nowMs,
          handlers: {
            queryObjects: async (query) => {
              if (query.includes('active = true')) {
                return { total: 0, objects: [] };
              }

              return {
                total: 1,
                objects: [
                  buildAlarmRow(1, nowMs - 15 * 60 * 1000, {
                    point: '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L-001',
                    active: false,
                  }),
                ],
              };
            },
          },
        },
      );

      const block = (payload.blocks as any[])[0];
      assert.strictEqual(block.metrics.total_alarms, 1);
      assert.ok(block.metrics.alarms_per_hour > 0);
      assert.strictEqual(block.metrics.top_offenders.length, 1);
      assert.strictEqual(block.metrics.top_offenders[0].count, 1);
      assert.strictEqual(block.metrics.top_offenders[0].percentage, 100);
      assert.deepStrictEqual(block.metrics.flood_periods, []);
      assert.deepStrictEqual(block.metrics.chattering_alarms, []);
    },
  },
  {
    name: 'scada-alarm-summary splits ranges longer than 30 days and reports the split',
    run: async () => {
      let archiveQueryCount = 0;
      const { payload } = await runSkillModule(
        runScadaAlarmSummary,
        {
          time: {
            from: '2026-02-01 00:00',
            to: '2026-03-18 00:00',
            timezone: 'UTC',
          },
        },
        {
          handlers: {
            queryObjects: async () => {
              archiveQueryCount += 1;
              return {
                total: 1,
                objects: [buildAlarmRow(archiveQueryCount, utcMs(2026, 2, archiveQueryCount, 0, 0))],
              };
            },
          },
        },
      );

      assert.strictEqual(archiveQueryCount, 2);
      assert.strictEqual((payload.metadata as any).split_window_count, 2);
      assert.ok((payload.warnings as any[]).some((warning) => warning.code === 'window_split'));
    },
  },
  {
    name: 'scada-alarm-summary preserves explicit timezone provenance across a DST boundary',
    run: async () => {
      const nowMs = utcMs(2026, 3, 30, 12, 0);
      const { payload } = await runSkillModule(
        runScadaAlarmSummary,
        {
          time: {
            from: '2026-03-29 00:30',
            to: '2026-03-29 04:30',
            timezone: 'Europe/Berlin',
          },
          scope: { folders: ['/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220'] },
        },
        {
          nowMs,
          handlers: {
            queryObjects: async (query) => {
              if (query.includes('active = true')) {
                return { total: 0, objects: [] };
              }

              return {
                total: 1,
                objects: [
                  buildAlarmRow(7, utcMs(2026, 3, 29, 1, 30), {
                    point: '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L-777',
                    active: false,
                  }),
                ],
              };
            },
          },
        },
      );

      assert.strictEqual(payload.kind, 'alarm_summary');
      assert.strictEqual((payload.provenance as any).timezone, 'Europe/Berlin');
      assert.ok((payload.provenance as any).period_to > (payload.provenance as any).period_from);
      assert.strictEqual((payload.metadata as any).total_fetched, 1);
    },
  },
  {
    name: 'scada-alarm-summary stops at the 10,000 alarm safety limit',
    run: async () => {
      const nowMs = utcMs(2026, 3, 19, 12, 0);
      let pageRequests = 0;

      const { payload } = await runSkillModule(
        runScadaAlarmSummary,
        {
          time: { preset: 'last_7_days' },
        },
        {
          nowMs,
          handlers: {
            queryObjects: async (query) => {
              if (query.includes('active = true')) {
                return {
                  total: 0,
                  objects: [],
                };
              }

              const pageNumber = parsePageNumber(query);
              pageRequests += 1;
              if (pageNumber > 50) {
                throw new Error('Summary skill should stop before requesting page 51');
              }

              const firstIndex = (pageNumber - 1) * 200;
              return {
                total: 12_345,
                objects: Array.from({ length: 200 }, (_, index) =>
                  buildAlarmRow(firstIndex + index, nowMs - (firstIndex + index) * 1_000),
                ),
              };
            },
          },
        },
      );

      assert.strictEqual((payload.completeness as any).status, 'partial');
      assert.strictEqual((payload.metadata as any).total_fetched, 10_000);
      assert.ok((payload.warnings as any[]).some((warning) => warning.code === 'safety_limit'));
      assert.strictEqual(pageRequests, 50);
    },
  },
  {
    name: 'report-spreadsheet-export creates a headers-only CSV for empty alarm lists',
    run: async () => {
      const filename = 'unit-empty-alarm-list.csv';
      const exportPath = '/home/roman/.openclaw/workspace/exports/unit-empty-alarm-list.csv';
      if (fs.existsSync(exportPath)) {
        fs.unlinkSync(exportPath);
      }

      try {
        const payload = await runReportSpreadsheetExport({
          params: {
            filename,
            data: {
              kind: 'alarm_list',
              blocks: [{ block_kind: 'alarm_list', alarms: [], total: 0 }],
              warnings: [{ severity: 'info', message: 'No alarms found' }],
              provenance: {
                source_skill: 'scada-alarm-list',
                scope: 'test',
                period_from: utcMs(2026, 3, 18, 0, 0),
                period_to: utcMs(2026, 3, 19, 0, 0),
                timezone: 'UTC',
                produced_at: utcMs(2026, 3, 19, 0, 0),
              },
              completeness: { status: 'complete' },
            },
          },
        });

        assert.strictEqual(payload.kind, 'scope_view');
        assert.ok(fs.existsSync(exportPath));

        const csv = fs.readFileSync(exportPath, 'utf8');
        assert.ok(csv.includes('Timestamp,Object,Type,Message,State'));
        assert.ok(csv.includes('# Warnings'));
        assert.ok(csv.includes('No alarms found'));
      } finally {
        if (fs.existsSync(exportPath)) {
          fs.unlinkSync(exportPath);
        }
      }
    },
  },
  {
    name: 'report-spreadsheet-export renders alarm-summary sections into CSV',
    run: async () => {
      const filename = 'unit-alarm-summary.csv';
      const exportPath = '/home/roman/.openclaw/workspace/exports/unit-alarm-summary.csv';
      if (fs.existsSync(exportPath)) {
        fs.unlinkSync(exportPath);
      }

      try {
        const payload = await runReportSpreadsheetExport({
          params: {
            filename,
            data: {
              kind: 'alarm_summary',
              blocks: [
                {
                  block_kind: 'alarm_summary',
                  metrics: {
                    total_alarms: 3,
                    alarms_per_hour: 1.5,
                    top_offenders: [{ source: '/root/A', count: 2, percentage: 66.7 }],
                    flood_periods: [{ from: utcMs(2026, 3, 18, 10, 0), to: utcMs(2026, 3, 18, 10, 15), rate_per_hour: 12 }],
                    standing_alarms: [{ source: '/root/B', message: 'Trip', since: utcMs(2026, 3, 17, 0, 0) }],
                    chattering_alarms: [{ source: '/root/C', count: 3, avg_duration_ms: 3200 }],
                  },
                  category_distribution: { TI: 2, KA: 1 },
                  priority_distribution: { protection: 2, analog: 1 },
                },
              ],
              warnings: [],
              provenance: {
                source_skill: 'scada-alarm-summary',
                scope: 'test',
                period_from: utcMs(2026, 3, 18, 0, 0),
                period_to: utcMs(2026, 3, 19, 0, 0),
                timezone: 'UTC',
                produced_at: utcMs(2026, 3, 19, 0, 0),
              },
              completeness: { status: 'complete' },
            },
          },
        });

        assert.strictEqual(payload.kind, 'scope_view');
        const csv = fs.readFileSync(exportPath, 'utf8');
        assert.ok(csv.includes('Overview'));
        assert.ok(csv.includes('Top Offenders'));
        assert.ok(csv.includes('Flood Periods'));
        assert.ok(csv.includes('Standing Alarms'));
        assert.ok(csv.includes('Chattering Alarms'));
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
