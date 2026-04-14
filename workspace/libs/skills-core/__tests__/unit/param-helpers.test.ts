import assert from 'assert';

import {
  extractTags,
  extractTimePoint,
  extractTimeRange,
  rejectUnexpectedKeys,
  TAG_KEYS,
  TAG_KEYS_WITH_FUNCTIONS,
  TIME_POINT_KEYS,
  TIME_RANGE_KEYS,
} from '../../dist/index.js';

function expectError(
  run: () => void,
  expectedFragments: string | string[],
): Error {
  const fragments = Array.isArray(expectedFragments)
    ? expectedFragments
    : [expectedFragments];

  try {
    run();
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

const tests = [
  {
    name: 'Helper barrel exports expose the expected key sets',
    run: () => {
      assert.deepStrictEqual([...TIME_RANGE_KEYS], [
        'time',
        'timeRange',
        'from',
        'to',
        'until',
        'time_from',
        'time_to',
        'time_range',
        'time_window',
        'time_preset',
        'timezone',
        'preset',
        'period',
        'range',
      ]);
      assert.deepStrictEqual([...TIME_POINT_KEYS], [
        'time',
        'at',
        'timestamp',
        'timestamp_text',
        'timestamp_local',
        'timezone',
        'timestamp_timezone',
        'ago',
        'offset',
      ]);
      assert.deepStrictEqual([...TAG_KEYS], [
        'tags',
        'tag',
        'tag_paths',
        'object',
        'objects',
        'field',
        'label',
        'unit',
      ]);
      assert.deepStrictEqual([...TAG_KEYS_WITH_FUNCTIONS], [
        'tags',
        'tag',
        'tag_paths',
        'object',
        'objects',
        'field',
        'label',
        'unit',
        'functions',
      ]);
    },
  },
  {
    name: 'rejectUnexpectedKeys accepts exact allow-lists',
    run: () => {
      rejectUnexpectedKeys(
        {
          object: '/root/FP/PROJECT/POINT_A',
          field: 'out_value',
          label: 'Pressure',
          unit: 'bar',
        },
        TAG_KEYS,
      );
    },
  },
  {
    name: 'rejectUnexpectedKeys names offending keys and supported keys',
    run: () => {
      expectError(
        () =>
          rejectUnexpectedKeys(
            {
              object: '/root/FP/PROJECT/POINT_A',
              field: 'out_value',
              bogus: true,
              extra: 42,
            },
            TAG_KEYS,
            'Use tags instead.',
          ),
        [
          'Unexpected parameters: bogus, extra',
          'Supported keys: tags, tag, tag_paths, object, objects, field, label, unit.',
          'Use tags instead.',
        ],
      );
    },
  },
  {
    name: 'extractTimeRange accepts nested time objects',
    run: () => {
      assert.deepStrictEqual(
        extractTimeRange({
          time: {
            from: '2026-03-18 09:37',
            to: '2026-03-18 10:37',
            timezone: 'UTC',
          },
        }),
        {
          from: '2026-03-18 09:37',
          to: '2026-03-18 10:37',
          timezone: 'UTC',
        },
      );
    },
  },
  {
    name: 'extractTimeRange accepts nested time.range aliases and strips to-now suffixes',
    run: () => {
      assert.deepStrictEqual(
        extractTimeRange({
          time: {
            range: 'last_24h_to_now',
            timezone: 'UTC',
          },
        }),
        {
          preset: 'last_24_hours',
          timezone: 'UTC',
        },
      );
    },
  },
  {
    name: 'extractTimeRange accepts flat from/to and normalizes offset-free ISO strings',
    run: () => {
      assert.deepStrictEqual(
        extractTimeRange({
          from: '2026-03-18T09:37',
          to: '2026-03-18T10:37',
          timezone: 'UTC',
        }),
        {
          from: '2026-03-18 09:37',
          to: '2026-03-18 10:37',
          timezone: 'UTC',
        },
      );

      assert.deepStrictEqual(
        extractTimeRange({
          from: '2026-03-18 09:37',
          until: '2026-03-18 10:37',
          timezone: 'UTC',
        }),
        {
          from: '2026-03-18 09:37',
          to: '2026-03-18 10:37',
          timezone: 'UTC',
        },
      );
    },
  },
  {
    name: 'extractTimeRange maps flat period aliases to presets',
    run: () => {
      assert.deepStrictEqual(extractTimeRange({ period: '24h' }), {
        preset: 'last_24_hours',
      });
    },
  },
  {
    name: 'extractTimeRange accepts string aliases via time and range',
    run: () => {
      assert.deepStrictEqual(extractTimeRange({ time: 'last_24_hours' }), {
        preset: 'last_24_hours',
      });
      assert.deepStrictEqual(extractTimeRange({ range: 'last-1h' }), {
        preset: 'last_1_hour',
      });
      assert.deepStrictEqual(extractTimeRange({ range: 'last_24h_to_now' }), {
        preset: 'last_24_hours',
      });
      assert.deepStrictEqual(extractTimeRange({ time_window: 'last_24h_ending_now' }), {
        preset: 'last_24_hours',
      });
      assert.deepStrictEqual(extractTimeRange({ time_range: 'last_24h_to_now' }), {
        preset: 'last_24_hours',
      });
      assert.deepStrictEqual(extractTimeRange({ time_preset: 'last_60_min' } as Record<string, unknown>), {
        preset: 'last_1_hour',
      });
      assert.deepStrictEqual(extractTimeRange({ range: 'last_hour' }), {
        preset: 'last_1_hour',
      });
    },
  },
  {
    name: 'extractTimeRange accepts structured period objects',
    run: () => {
      assert.deepStrictEqual(
        extractTimeRange({
          period: { kind: 'last', value: 24, unit: 'hours' },
        }),
        {
          preset: 'last_24_hours',
        },
      );

      assert.deepStrictEqual(
        extractTimeRange({
          period: { kind: 'last', amount: 24, unit: 'hours' },
        }),
        {
          preset: 'last_24_hours',
        },
      );
    },
  },
  {
    name: 'extractTimeRange accepts flat relative object aliases from live retries',
    run: () => {
      assert.deepStrictEqual(
        extractTimeRange({
          time_range: {
            kind: 'relative',
            unit: 'minute',
            from: -60,
            to: 0,
          },
        }),
        {
          preset: 'last_1_hour',
        },
      );

      assert.deepStrictEqual(
        extractTimeRange({
          time_range: {
            kind: 'relative',
            from: '-24h',
            to: 'now',
          },
        }),
        {
          preset: 'last_24_hours',
        },
      );
    },
  },
  {
    name: 'extractTimeRange accepts relative now aliases via time_from and time_to',
    run: () => {
      assert.deepStrictEqual(
        extractTimeRange({
          time_from: 'now-24h',
          time_to: 'now',
          timezone: 'UTC',
        }),
        {
          preset: 'last_24_hours',
          timezone: 'UTC',
        },
      );
    },
  },
  {
    name: 'extractTimeRange accepts timeRange camelCase aliases from live retries',
    run: () => {
      assert.deepStrictEqual(
        extractTimeRange({
          timeRange: {
            kind: 'last',
            value: 24,
            unit: 'hours',
          },
        }),
        {
          preset: 'last_24_hours',
        },
      );

      assert.deepStrictEqual(
        extractTimeRange({
          timeRange: {
            kind: 'relative',
            from: { unit: 'hour', value: 24 },
            to: 'now',
          },
        }),
        {
          preset: 'last_24_hours',
        },
      );

      assert.deepStrictEqual(
        extractTimeRange({
          time_range: {
            kind: 'last',
            amount: 24,
            unit: 'hours',
          },
        }),
        {
          preset: 'last_24_hours',
        },
      );
    },
  },
  {
    name: 'extractTimeRange accepts nested time.period aliases from live retries',
    run: () => {
      assert.deepStrictEqual(
        extractTimeRange({
          time: {
            period: '24h',
            timezone: 'UTC',
          },
        }),
        {
          preset: 'last_24_hours',
          timezone: 'UTC',
        },
      );
    },
  },
  {
    name: 'extractTimeRange rejects unrecognized periods',
    run: () => {
      expectError(
        () => extractTimeRange({ period: '2w' }),
        'Unrecognized period "2w"',
      );
    },
  },
  {
    name: 'extractTimeRange rejects mixed nested and flat aliases',
    run: () => {
      expectError(
        () =>
          extractTimeRange({
            time: { preset: 'last_1_hour' },
            period: '24h',
            timezone: 'UTC',
          }),
        ['Conflicting params', 'period', 'timezone'],
      );
    },
  },
  {
    name: 'extractTimeRange rejects malformed recognized stray shapes',
    run: () => {
      const cases: Array<{
        params: Record<string, unknown>;
        expectedKey: string;
      }> = [
        { params: { from: '2026-03-18 09:37' }, expectedKey: 'from' },
        { params: { to: '2026-03-18 10:37' }, expectedKey: 'to' },
        { params: { timezone: 'UTC' }, expectedKey: 'timezone' },
        { params: { range: true }, expectedKey: 'range' },
      ];

      for (const testCase of cases) {
        expectError(
          () => extractTimeRange(testCase.params),
          ['Malformed time params', testCase.expectedKey],
        );
      }
    },
  },
  {
    name: 'extractTimeRange rejects unknown keys inside nested time',
    run: () => {
      expectError(
        () =>
          extractTimeRange({
            time: {
              from: '2026-03-18 09:37',
              to: '2026-03-18 10:37',
              timezone: 'UTC',
              bogus: true,
            },
          }),
        ['Unexpected key inside time: bogus', 'Known time keys'],
      );
    },
  },
  {
    name: 'extractTimeRange rejects conflicting nested time.range shapes',
    run: () => {
      expectError(
        () =>
          extractTimeRange({
            time: {
              range: 'last_24_hours',
              preset: 'last_1_hour',
            },
          }),
        ['Conflicting nested time params', 'range', 'preset'],
      );
    },
  },
  {
    name: 'extractTimeRange rejects offset-bearing ISO timestamps',
    run: () => {
      for (const value of [
        '2026-03-18T09:37:00Z',
        '2026-03-18T09:37:00+05:00',
      ]) {
        expectError(
          () =>
            extractTimeRange({
              from: value,
              to: '2026-03-18 10:37',
              timezone: 'UTC',
            }),
          [
            'Do not pass offset-bearing ISO timestamps',
            value,
          ],
        );
      }
    },
  },
  {
    name: 'extractTimeRange rejects numeric epoch-style range params',
    run: () => {
      expectError(
        () =>
          extractTimeRange({
            time_from: 1773826620000,
            time_to: 1773830220000,
          }),
        'Do not pre-compute epoch timestamps',
      );
    },
  },
  {
    name: 'extractTimePoint accepts nested time objects',
    run: () => {
      assert.deepStrictEqual(
        extractTimePoint({
          time: {
            at: '2026-03-18 09:37',
            timezone: 'UTC',
          },
        }),
        {
          at: '2026-03-18 09:37',
          timezone: 'UTC',
        },
      );
    },
  },
  {
    name: 'extractTimePoint accepts flat timestamp aliases and normalizes offset-free ISO strings',
    run: () => {
      assert.deepStrictEqual(
        extractTimePoint({
          timestamp: '2026-03-18T09:37',
          timezone: 'UTC',
        }),
        {
          at: '2026-03-18 09:37',
          timezone: 'UTC',
        },
      );
    },
  },
  {
    name: 'extractTimePoint accepts string time shorthands and relative aliases from live retries',
    run: () => {
      assert.deepStrictEqual(
        extractTimePoint({
          time: '2026-03-18 09:37',
          timezone: 'UTC',
        }),
        {
          at: '2026-03-18 09:37',
          timezone: 'UTC',
        },
      );

      assert.deepStrictEqual(
        extractTimePoint({
          timestamp: 'now-30m',
          timezone: 'UTC',
        }),
        {
          ago: { amount: 30, unit: 'minute' },
          timezone: 'UTC',
        },
      );

      assert.deepStrictEqual(
        extractTimePoint({
          offset: '-1h',
          timezone: 'UTC',
        }),
        {
          ago: { amount: 1, unit: 'hour' },
          timezone: 'UTC',
        },
      );

      assert.deepStrictEqual(
        extractTimePoint({
          timestamp_text: '2026-03-18 06:00',
          timestamp_timezone: 'Asia/Almaty',
        }),
        {
          at: '2026-03-18 06:00',
          timezone: 'Asia/Almaty',
        },
      );

      assert.deepStrictEqual(
        extractTimePoint({
          timestamp_local: '2026-03-18 06:00',
          timezone: 'Asia/Almaty',
        }),
        {
          at: '2026-03-18 06:00',
          timezone: 'Asia/Almaty',
        },
      );
    },
  },
  {
    name: 'extractTimePoint accepts nested preset aliases by converting rolling windows to ago offsets',
    run: () => {
      assert.deepStrictEqual(
        extractTimePoint({
          time: {
            preset: 'last_1_hour',
            timezone: 'UTC',
          },
        }),
        {
          ago: { amount: 1, unit: 'hour' },
          timezone: 'UTC',
        },
      );
    },
  },
  {
    name: 'extractTimePoint accepts ago objects',
    run: () => {
      assert.deepStrictEqual(
        extractTimePoint({
          ago: { amount: 1, unit: 'hour' },
          timezone: 'UTC',
        }),
        {
          ago: { amount: 1, unit: 'hour' },
          timezone: 'UTC',
        },
      );
    },
  },
  {
    name: 'extractTimePoint rejects numeric at and timestamp aliases',
    run: () => {
      for (const params of [
        { at: 1773826620000, timezone: 'UTC' },
        { timestamp: 1773826620000, timezone: 'UTC' },
      ]) {
        expectError(
          () => extractTimePoint(params),
          'Do not pre-compute epoch timestamps',
        );
      }
    },
  },
  {
    name: 'extractTimePoint rejects mixed nested and flat aliases',
    run: () => {
      expectError(
        () =>
          extractTimePoint({
            time: { at: '2026-03-18 09:37', timezone: 'UTC' },
            timestamp: '2026-03-18 10:00',
          }),
        ['Conflicting params', 'timestamp'],
      );
    },
  },
  {
    name: 'extractTimePoint rejects malformed recognized point shapes',
    run: () => {
      const cases: Array<{
        params: Record<string, unknown>;
        expectedKey: string;
      }> = [
        { params: { time: true }, expectedKey: 'time' },
        { params: { timezone: 'UTC' }, expectedKey: 'timezone' },
        { params: { ago: '1h' }, expectedKey: 'ago' },
      ];

      for (const testCase of cases) {
        expectError(
          () => extractTimePoint(testCase.params),
          ['Malformed time params', testCase.expectedKey],
        );
      }
    },
  },
  {
    name: 'extractTimePoint rejects malformed ago objects',
    run: () => {
      for (const ago of [
        {},
        { amount: 0, unit: 'hour' },
        { amount: 1, unit: 'weeks' },
      ]) {
        expectError(
          () =>
            extractTimePoint({
              ago,
              timezone: 'UTC',
            }),
          'Malformed time params',
        );
      }
    },
  },
  {
    name: 'extractTimePoint rejects unknown keys inside nested time',
    run: () => {
      expectError(
        () =>
          extractTimePoint({
            time: {
              at: '2026-03-18 09:37',
              timezone: 'UTC',
              bogus: true,
            },
          }),
        ['Unexpected key inside time: bogus', 'Known time keys'],
      );
    },
  },
  {
    name: 'extractTags accepts nested tags arrays',
    run: () => {
      const tags = [
        {
          object: '/root/FP/PROJECT/POINT_A',
          field: 'out_value',
          label: 'Pressure',
        },
      ];

      assert.deepStrictEqual(extractTags({ tags }), tags);
    },
  },
  {
    name: 'extractTags accepts tag-path strings inside tags arrays',
    run: () => {
      assert.deepStrictEqual(
        extractTags({
          tags: [
            '/root/FP/PROJECT/POINT_A:out_value',
            '/root/FP/PROJECT/POINT_B:out_qds',
          ],
        }),
        [
          {
            object: '/root/FP/PROJECT/POINT_A',
            field: 'out_value',
          },
          {
            object: '/root/FP/PROJECT/POINT_B',
            field: 'out_qds',
          },
        ],
      );
    },
  },
  {
    name: 'extractTags accepts tag_paths arrays',
    run: () => {
      assert.deepStrictEqual(
        extractTags({
          tag_paths: [
            '/root/FP/PROJECT/POINT_A:out_value',
            '/root/FP/PROJECT/POINT_B:out_qds',
          ],
        }),
        [
          {
            object: '/root/FP/PROJECT/POINT_A',
            field: 'out_value',
          },
          {
            object: '/root/FP/PROJECT/POINT_B',
            field: 'out_qds',
          },
        ],
      );
    },
  },
  {
    name: 'extractTags accepts flat shorthand and preserves label and unit',
    run: () => {
      assert.deepStrictEqual(
        extractTags({
          object: '/root/FP/PROJECT/POINT_A',
          field: 'out_value',
          label: 'Pressure',
          unit: 'bar',
        }),
        [
          {
            object: '/root/FP/PROJECT/POINT_A',
            field: 'out_value',
            label: 'Pressure',
            unit: 'bar',
          },
        ],
      );
    },
  },
  {
    name: 'extractTags accepts shared-field objects arrays',
    run: () => {
      assert.deepStrictEqual(
        extractTags({
          objects: [
            '/root/FP/PROJECT/POINT_A',
            '/root/FP/PROJECT/POINT_B',
          ],
          field: 'out_value',
          label: 'Pressure',
        }),
        [
          {
            object: '/root/FP/PROJECT/POINT_A',
            field: 'out_value',
            label: 'Pressure',
          },
          {
            object: '/root/FP/PROJECT/POINT_B',
            field: 'out_value',
            label: 'Pressure',
          },
        ],
      );
    },
  },
  {
    name: 'extractTags only keeps flat functions when includeFunctions is enabled',
    run: () => {
      assert.deepStrictEqual(
        extractTags({
          object: '/root/FP/PROJECT/POINT_A',
          field: 'out_value',
          functions: ['avg', 'max'],
        }),
        [
          {
            object: '/root/FP/PROJECT/POINT_A',
            field: 'out_value',
          },
        ],
      );

      assert.deepStrictEqual(
        extractTags(
          {
            object: '/root/FP/PROJECT/POINT_A',
            field: 'out_value',
            functions: ['avg', 'max'],
          },
          { includeFunctions: true },
        ),
        [
          {
            object: '/root/FP/PROJECT/POINT_A',
            field: 'out_value',
            functions: ['avg', 'max'],
          },
        ],
      );
    },
  },
  {
    name: 'extractTags rejects nested tags mixed with flat aliases',
    run: () => {
      expectError(
        () =>
          extractTags({
            tags: [{ object: '/root/FP/PROJECT/POINT_A', field: 'out_value' }],
            object: '/root/FP/PROJECT/POINT_B',
            field: 'ignored_field',
            label: 'Ignored',
            unit: 'bar',
            functions: ['avg'],
          }),
        ['Conflicting params', 'object', 'field', 'label', 'unit', 'functions'],
      );
    },
  },
  {
    name: 'extractTags rejects tag_paths mixed with flat aliases and malformed entries',
    run: () => {
      expectError(
        () =>
          extractTags({
            tag_paths: ['/root/FP/PROJECT/POINT_A:out_value'],
            field: 'out_value',
          }),
        ['Conflicting params', 'tag_paths', 'field'],
      );

      expectError(
        () =>
          extractTags({
            tag_paths: ['/root/FP/PROJECT/POINT_A'],
          }),
        ['tag_paths[0]', '"/full/object/path:field"'],
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
