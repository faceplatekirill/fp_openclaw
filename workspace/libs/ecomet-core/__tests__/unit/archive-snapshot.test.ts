/// <reference path="./node-shim.d.ts" />
import assert from 'assert';
import { getSnapshot } from '../../dist/archive/archive-snapshot.js';
import { EcometError, ErrorCode } from '../../dist/utils/errors.js';

class MockEcometClient {
  lastApplicationCall = null;
  mockResult = {};

  async application(module, method, params) {
    this.lastApplicationCall = { module, method, params };
    return this.mockResult;
  }
}

const VALID_TIMESTAMP = 1741219200000;

const tests = [
  {
    name: 'Valid request calls fp_json/get_points with correct params',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        '/root/FP/PROJECT/A': 220.5,
      };

      const result = await getSnapshot(client, {
        archives: ['/root/FP/PROJECT/A'],
        timestamp: VALID_TIMESTAMP,
      });

      assert.deepStrictEqual(client.lastApplicationCall, {
        module: 'fp_json',
        method: 'get_points',
        params: {
          archives: ['/root/FP/PROJECT/A'],
          ts: VALID_TIMESTAMP,
        },
      });
      assert.deepStrictEqual(result, client.mockResult);
    },
  },
  {
    name: 'Response with undefined values is passed through unchanged',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        '/root/FP/PROJECT/A': 220.5,
        '/root/FP/PROJECT/B': null,
        '/root/FP/PROJECT/C': undefined,
      };

      const result = await getSnapshot(client, {
        archives: ['/root/FP/PROJECT/A', '/root/FP/PROJECT/B', '/root/FP/PROJECT/C'],
        timestamp: VALID_TIMESTAMP,
      });

      assert.deepStrictEqual(result, client.mockResult);
    },
  },
  {
    name: 'Empty archives array throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getSnapshot(client, {
          archives: [],
          timestamp: VALID_TIMESTAMP,
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === 'archives must be a non-empty array of strings',
      );
    },
  },
  {
    name: 'Non-string archive path throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getSnapshot(client, {
          archives: ['/root/FP/PROJECT/A', 123],
          timestamp: VALID_TIMESTAMP,
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === 'archives must be a non-empty array of strings',
      );
    },
  },
  {
    name: 'Timestamp in seconds is rejected with helpful message',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getSnapshot(client, {
          archives: ['/root/FP/PROJECT/A'],
          timestamp: 1709596800,
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "'timestamp' appears to be in seconds (got 1709596800), expected milliseconds — multiply by 1000",
      );
    },
  },
  {
    name: 'Non-integer timestamp throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getSnapshot(client, {
          archives: ['/root/FP/PROJECT/A'],
          timestamp: 1741219200000.5,
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "'timestamp' must be an integer timestamp in milliseconds, got: 1741219200000.5",
      );
    },
  },
  {
    name: 'Non-number timestamp throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        getSnapshot(client, {
          archives: ['/root/FP/PROJECT/A'],
          timestamp: 'bad',
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === "'timestamp' must be a timestamp in milliseconds, got: bad",
      );
    },
  },
  {
    name: 'Null response returns empty object',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = null;

      const result = await getSnapshot(client, {
        archives: ['/root/FP/PROJECT/A'],
        timestamp: VALID_TIMESTAMP,
      });

      assert.deepStrictEqual(result, {});
    },
  },
  {
    name: 'Undefined response returns empty object',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = undefined;

      const result = await getSnapshot(client, {
        archives: ['/root/FP/PROJECT/A'],
        timestamp: VALID_TIMESTAMP,
      });

      assert.deepStrictEqual(result, {});
    },
  },
  {
    name: 'Archive path whitespace is trimmed before sending',
    run: async () => {
      const client = new MockEcometClient();

      await getSnapshot(client, {
        archives: [' /root/FP/PROJECT/A '],
        timestamp: VALID_TIMESTAMP,
      });

      assert.deepStrictEqual(client.lastApplicationCall, {
        module: 'fp_json',
        method: 'get_points',
        params: {
          archives: ['/root/FP/PROJECT/A'],
          ts: VALID_TIMESTAMP,
        },
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
