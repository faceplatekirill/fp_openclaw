/// <reference path="./node-shim.d.ts" />
import assert from 'assert';
import { getAggregates } from '../../dist/archive/archive-aggregates.js';
import { EcometError, ErrorCode } from '../../dist/utils/errors.js';

class MockEcometClient {
  lastApplicationCall = null;
  mockResult = {};

  async application(module, method, params) {
    this.lastApplicationCall = { module, method, params };
    return this.mockResult;
  }
}

const T0 = 1741219200000;
const T1 = 1741222800000;
const T2 = 1741226400000;

const AGGREGATES_ERROR = 'aggregates must be a non-empty array of [archivePath, functionName] pairs';

function validParams() {
  return {
    aggregates: [['/root/FP/PROJECT/A', 'avg']],
    timestamps: [T0, T1],
  };
}

const tests = [
  {
    name: 'Valid request calls fp_archive/get_aggregates with correct params',
    run: async () => {
      const client = new MockEcometClient();
      const params = validParams();
      client.mockResult = {
        values: {
          [String(T1)]: {
            '/root/FP/PROJECT/A': {
              avg: 220.5,
            },
          },
        },
        invalid: {},
      };

      const result = await getAggregates(client, params);

      assert.deepStrictEqual(client.lastApplicationCall, {
        module: 'fp_archive',
        method: 'get_aggregates',
        params,
      });
      assert.deepStrictEqual(result, client.mockResult);
    },
  },
  {
    name: 'Multiple archives and functions are passed through in a single request',
    run: async () => {
      const client = new MockEcometClient();
      const aggregates = [
        ['/root/FP/PROJECT/A', 'avg'],
        ['/root/FP/PROJECT/A', 'max'],
        ['/root/FP/PROJECT/B', 'min'],
      ];
      const timestamps = [T0, T1, T2];
      client.mockResult = { values: {}, invalid: {} };

      await getAggregates(client, { aggregates, timestamps });

      assert.deepStrictEqual(client.lastApplicationCall, {
        module: 'fp_archive',
        method: 'get_aggregates',
        params: { aggregates, timestamps },
      });
    },
  },
  {
    name: 'Response with values and invalid is passed through unchanged',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        values: {
          [String(T1)]: {
            '/root/FP/PROJECT/A': {
              avg: 221.1,
              max: 229.7,
            },
          },
          [String(T2)]: {
            '/root/FP/PROJECT/A': {
              avg: 219.9,
              max: 228.3,
            },
          },
        },
        invalid: {
          '/root/FP/PROJECT/BAD': true,
        },
      };

      const result = await getAggregates(client, {
        aggregates: [
          ['/root/FP/PROJECT/A', 'avg'],
          ['/root/FP/PROJECT/A', 'max'],
        ],
        timestamps: [T0, T1, T2],
      });

      assert.deepStrictEqual(result, client.mockResult);
    },
  },
  {
    name: 'Response with null and undefined aggregate values is passed through unchanged',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        values: {
          [String(T1)]: {
            '/root/FP/PROJECT/A': {
              avg: null,
              max: undefined,
            },
          },
        },
        invalid: {},
      };

      const result = await getAggregates(client, validParams());
      assert.deepStrictEqual(result, client.mockResult);
    },
  },
  {
    name: 'Null response returns empty values and invalid objects',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = null;

      const result = await getAggregates(client, validParams());
      assert.deepStrictEqual(result, { values: {}, invalid: {} });
    },
  },
  {
    name: 'Undefined response returns empty values and invalid objects',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = undefined;

      const result = await getAggregates(client, validParams());
      assert.deepStrictEqual(result, { values: {}, invalid: {} });
    },
  },
  {
    name: 'Empty aggregates array throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getAggregates(client, { aggregates: [], timestamps: [T0, T1] }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === AGGREGATES_ERROR,
      );
    },
  },
  {
    name: 'Non-array aggregates throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getAggregates(client, { aggregates: {} as never, timestamps: [T0, T1] }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === AGGREGATES_ERROR,
      );
    },
  },
  {
    name: 'Aggregate element that is not a 2-element array throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getAggregates(client, {
          aggregates: [['/root/FP/PROJECT/A', 'avg'], ['/root/FP/PROJECT/B'] as never],
          timestamps: [T0, T1],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            'each aggregate must be a [archivePath, functionName] pair (element at index 1 is invalid)',
      );
    },
  },
  {
    name: 'Aggregate with non-string archive path throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getAggregates(client, {
          aggregates: [[123 as never, 'avg']],
          timestamps: [T0, T1],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            'each aggregate must be a [archivePath, functionName] pair (element at index 0 is invalid)',
      );
    },
  },
  {
    name: 'Aggregate with non-string function name throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getAggregates(client, {
          aggregates: [['/root/FP/PROJECT/A', 123 as never]],
          timestamps: [T0, T1],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            'each aggregate must be a [archivePath, functionName] pair (element at index 0 is invalid)',
      );
    },
  },
  {
    name: 'Archive path whitespace is trimmed before sending',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = { values: {}, invalid: {} };

      await getAggregates(client, {
        aggregates: [[' /root/FP/PROJECT/A ', 'avg']],
        timestamps: [T0, T1],
      });

      assert.deepStrictEqual(client.lastApplicationCall, {
        module: 'fp_archive',
        method: 'get_aggregates',
        params: {
          aggregates: [['/root/FP/PROJECT/A', 'avg']],
          timestamps: [T0, T1],
        },
      });
    },
  },
  {
    name: 'All built-in function names are accepted',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = { values: {}, invalid: {} };
      const aggregates = [
        ['/root/FP/PROJECT/A', 'avg'],
        ['/root/FP/PROJECT/A', 'min'],
        ['/root/FP/PROJECT/A', 'max'],
        ['/root/FP/PROJECT/A', 'integral'],
        ['/root/FP/PROJECT/A', 'standard_deviation'],
      ];

      await getAggregates(client, { aggregates, timestamps: [T0, T1] });
      assert.deepStrictEqual(client.lastApplicationCall?.params?.aggregates, aggregates);
    },
  },
  {
    name: 'Custom function in module:function format is accepted',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = { values: {}, invalid: {} };

      await getAggregates(client, {
        aggregates: [['/root/FP/PROJECT/A', 'fp_aggregates:integral_pos']],
        timestamps: [T0, T1],
      });

      assert.deepStrictEqual(client.lastApplicationCall?.params?.aggregates, [
        ['/root/FP/PROJECT/A', 'fp_aggregates:integral_pos'],
      ]);
    },
  },
  {
    name: "Invalid function format throws INVALID_PARAMS for 'bad_func'",
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getAggregates(client, {
          aggregates: [['/root/FP/PROJECT/A', 'bad_func']],
          timestamps: [T0, T1],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "invalid aggregate function 'bad_func' at index 0: must be a built-in (avg, min, max, integral, standard_deviation) or 'module:function' format",
      );
    },
  },
  {
    name: "Function with multiple colons throws INVALID_PARAMS for 'a:b:c'",
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getAggregates(client, {
          aggregates: [['/root/FP/PROJECT/A', 'a:b:c']],
          timestamps: [T0, T1],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "invalid aggregate function 'a:b:c' at index 0: must be a built-in (avg, min, max, integral, standard_deviation) or 'module:function' format",
      );
    },
  },
  {
    name: 'Empty function name throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getAggregates(client, {
          aggregates: [['/root/FP/PROJECT/A', '']],
          timestamps: [T0, T1],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            'each aggregate must be a [archivePath, functionName] pair (element at index 0 is invalid)',
      );
    },
  },
  {
    name: 'Whitespace-only archive path throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getAggregates(client, {
          aggregates: [[' ', 'avg']],
          timestamps: [T0, T1],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            'each aggregate must be a [archivePath, functionName] pair (element at index 0 is invalid)',
      );
    },
  },
  {
    name: 'Single timestamp throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getAggregates(client, {
          aggregates: [['/root/FP/PROJECT/A', 'avg']],
          timestamps: [T0],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            'timestamps must be an array of at least 2 integer millisecond timestamps',
      );
    },
  },
  {
    name: 'Empty timestamps array throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getAggregates(client, {
          aggregates: [['/root/FP/PROJECT/A', 'avg']],
          timestamps: [],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            'timestamps must be an array of at least 2 integer millisecond timestamps',
      );
    },
  },
  {
    name: 'Decreasing timestamps throw INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getAggregates(client, {
          aggregates: [['/root/FP/PROJECT/A', 'avg']],
          timestamps: [T2, T1],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            `timestamps must be monotonically increasing, but timestamps[1] (${T1}) <= timestamps[0] (${T2})`,
      );
    },
  },
  {
    name: 'Equal timestamps throw INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getAggregates(client, {
          aggregates: [['/root/FP/PROJECT/A', 'avg']],
          timestamps: [T1, T1],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            `timestamps must be monotonically increasing, but timestamps[1] (${T1}) <= timestamps[0] (${T1})`,
      );
    },
  },
  {
    name: 'Timestamp in seconds is rejected with helpful message',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getAggregates(client, {
          aggregates: [['/root/FP/PROJECT/A', 'avg']],
          timestamps: [1709596800, T1],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "'timestamps[0]' appears to be in seconds (got 1709596800), expected milliseconds — multiply by 1000",
      );
    },
  },
  {
    name: 'Array response throws QUERY_FAILED',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = [];

      await assert.rejects(
        getAggregates(client, validParams()),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.QUERY_FAILED &&
          error.message === 'get_aggregates returned unexpected response type: object',
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
