import assert from 'assert';
import { resolveTimePoint, resolveTimeRange } from '../../dist/index.js';

const tests = [
  {
    name: 'Rolling presets resolve relative to injected nowMs and preserve timezone',
    run: () => {
      const nowMs = Date.UTC(2026, 2, 30, 10, 0, 0);
      const resolved = resolveTimeRange(
        { preset: 'last_2_hours', timezone: 'Asia/Almaty' },
        { nowMs },
      );

      assert.strictEqual(resolved.from, nowMs - 2 * 60 * 60 * 1000);
      assert.strictEqual(resolved.to, nowMs);
      assert.strictEqual(resolved.timezone, 'Asia/Almaty');
      assert.strictEqual(resolved.label, 'Last 2 hours');
    },
  },
  {
    name: 'Additional rolling presets including last_6_hours resolve correctly',
    run: () => {
      const nowMs = Date.UTC(2026, 2, 30, 10, 0, 0);
      const resolved = resolveTimeRange(
        { preset: 'last_6_hours', timezone: 'UTC' } as any,
        { nowMs },
      );

      assert.strictEqual(resolved.from, nowMs - 6 * 60 * 60 * 1000);
      assert.strictEqual(resolved.to, nowMs);
      assert.strictEqual(resolved.label, 'Last 6 hours');
    },
  },
  {
    name: 'Explicit local ranges preserve DST-aware day boundaries',
    run: () => {
      const resolved = resolveTimeRange({
        from: '2026-03-29 00:00',
        to: '2026-03-30 00:00',
        timezone: 'Europe/Vilnius',
      });

      assert.strictEqual(resolved.from, Date.UTC(2026, 2, 28, 22, 0, 0));
      assert.strictEqual(resolved.to, Date.UTC(2026, 2, 29, 21, 0, 0));
      assert.strictEqual(resolved.to - resolved.from, 23 * 60 * 60 * 1000);
      assert.strictEqual(resolved.timezone, 'Europe/Vilnius');
    },
  },
  {
    name: 'Calendar preset yesterday uses local midnight boundaries',
    run: () => {
      const nowMs = Date.UTC(2026, 2, 30, 9, 30, 0);
      const resolved = resolveTimeRange(
        { preset: 'yesterday', timezone: 'Europe/Vilnius' },
        { nowMs },
      );

      assert.strictEqual(resolved.from, Date.UTC(2026, 2, 28, 22, 0, 0));
      assert.strictEqual(resolved.to, Date.UTC(2026, 2, 29, 21, 0, 0));
      assert.strictEqual(resolved.label, 'Yesterday');
    },
  },
  {
    name: 'Exact local instants resolve into epoch milliseconds',
    run: () => {
      const resolved = resolveTimePoint({
        at: '2026-03-17 14:30',
        timezone: 'Asia/Almaty',
      });

      assert.strictEqual(resolved.timestamp, Date.UTC(2026, 2, 17, 9, 30, 0));
      assert.strictEqual(resolved.timezone, 'Asia/Almaty');
      assert.ok(resolved.label.includes('2026-03-17 14:30'));
    },
  },
  {
    name: 'Relative point specs resolve against injected nowMs',
    run: () => {
      const nowMs = Date.UTC(2026, 2, 18, 8, 0, 0);
      const resolved = resolveTimePoint(
        {
          ago: { amount: 1, unit: 'hour' },
          timezone: 'UTC',
        },
        { nowMs },
      );

      assert.strictEqual(resolved.timestamp, nowMs - 60 * 60 * 1000);
      assert.strictEqual(resolved.timezone, 'UTC');
      assert.strictEqual(resolved.label, '1 hour ago (UTC)');
    },
  },
  {
    name: 'Invalid explicit ranges are rejected',
    run: async () => {
      await assert.rejects(async () =>
        resolveTimeRange({
          from: '2026-03-17 14:30',
          to: '2026-03-17 14:30',
          timezone: 'Asia/Almaty',
        }),
      );
    },
  },
  {
    name: 'Calendar presets reject missing timezone',
    run: async () => {
      await assert.rejects(async () =>
        resolveTimeRange({ preset: 'today' } as any, {
          nowMs: Date.UTC(2026, 2, 30, 9, 30, 0),
        }),
      );
    },
  },
  {
    name: 'Unknown presets are rejected instead of falling back to yesterday',
    run: async () => {
      await assert.rejects(async () =>
        resolveTimeRange({ preset: 'last_99_hours', timezone: 'UTC' } as any),
      );
    },
  },
  {
    name: 'Explicit local ranges reject missing timezone',
    run: async () => {
      await assert.rejects(async () =>
        resolveTimeRange({
          from: '2026-03-17 14:30',
          to: '2026-03-17 15:30',
        } as any),
      );
    },
  },
  {
    name: 'Exact local instants reject missing timezone',
    run: async () => {
      await assert.rejects(async () =>
        resolveTimePoint({
          at: '2026-03-17 14:30',
        } as any),
      );
    },
  },
  {
    name: 'Relative point specs reject non-positive amounts',
    run: async () => {
      await assert.rejects(async () =>
        resolveTimePoint({
          ago: { amount: 0, unit: 'hour' },
          timezone: 'UTC',
        } as any),
      );
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
