/// <reference path="./node-shim.d.ts" />
import assert from 'assert';
import { readArchives } from '../../dist/archive/archive-reader.js';
import { EcometError, ErrorCode } from '../../dist/utils/errors.js';

class MockEcometClient {
  lastApplicationCall = null;
  mockResult = {};

  async application(module, method, params) {
    this.lastApplicationCall = { module, method, params };
    return this.mockResult;
  }
}

const VALID_FROM = 1741219200000;
const VALID_TO = 1741222800000;

const tests = [
  {
    name: 'Valid request calls fp_json/read_archives with correct params',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        '/root/FP/PROJECT/A': [
          [1741219200000, 220.5],
          [1741219800000, null],
        ],
      };

      const result = await readArchives(client, {
        archives: [' /root/FP/PROJECT/A '],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(client.lastApplicationCall, {
        module: 'fp_json',
        method: 'read_archives',
        params: {
          archives: ['/root/FP/PROJECT/A'],
          from: VALID_FROM,
          to: VALID_TO,
        },
      });
      assert.deepStrictEqual(result, client.mockResult);
    },
  },
  {
    name: 'Empty archives array throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        readArchives(client, {
          archives: [],
          from: VALID_FROM,
          to: VALID_TO,
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
        readArchives(client, {
          archives: ['/root/FP/PROJECT/A', 123],
          from: VALID_FROM,
          to: VALID_TO,
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
        readArchives(client, {
          archives: ['/root/FP/PROJECT/A'],
          from: 1709596800,
          to: VALID_TO,
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "'from' appears to be in seconds (got 1709596800), expected milliseconds — multiply by 1000",
      );
    },
  },
  {
    name: 'from > to throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        readArchives(client, {
          archives: ['/root/FP/PROJECT/A'],
          from: VALID_TO,
          to: VALID_FROM,
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            `'from' must be <= 'to' (got from=${VALID_TO}, to=${VALID_FROM})`,
      );
    },
  },
  {
    name: 'Non-integer timestamp throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        readArchives(client, {
          archives: ['/root/FP/PROJECT/A'],
          from: 1741219200000.5,
          to: VALID_TO,
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "'from' must be an integer timestamp in milliseconds, got: 1741219200000.5",
      );
    },
  },
  {
    name: 'Non-number timestamp throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        readArchives(client, {
          archives: ['/root/FP/PROJECT/A'],
          from: 'bad',
          to: VALID_TO,
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === "'from' must be a timestamp in milliseconds, got: bad",
      );
    },
  },
  {
    name: 'Null response returns empty object',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = null;

      const result = await readArchives(client, {
        archives: ['/root/FP/PROJECT/A'],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(result, {});
    },
  },
  {
    name: 'Undefined response returns empty object',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = undefined;

      const result = await readArchives(client, {
        archives: ['/root/FP/PROJECT/A'],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(result, {});
    },
  },
  {
    name: 'Valid response is passed through unchanged',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        '/root/FP/PROJECT/A': [
          [1741219100000, 220.5],
          [1741219800000, 221.0],
          [1741220400000, null],
        ],
        '/root/FP/PROJECT/B': [],
      };

      const result = await readArchives(client, {
        archives: ['/root/FP/PROJECT/A', '/root/FP/PROJECT/B'],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(result, client.mockResult);
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
