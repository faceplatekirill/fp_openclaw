/// <reference path="./node-shim.d.ts" />
import assert from 'assert';
import { fieldReadHistory } from '../../dist/archive/field-history.js';
import { EcometError, ErrorCode } from '../../dist/utils/errors.js';

class MockEcometClient {
  calls = [];
  responses = {};

  async application(module, method, params) {
    this.calls.push({ module, method, params });
    if (Object.prototype.hasOwnProperty.call(this.responses, method)) {
      return this.responses[method];
    }
    return {};
  }
}

const VALID_FROM = 1741219200000;
const VALID_TO = 1741222800000;

const TAGS_ERROR = 'tags must be a non-empty array of { object, field } entries';
const TAG_ENTRY_ERROR =
  "each tag must have 'object' (string) and 'field' (string) properties (element at index 0 is invalid)";

const tests = [
  {
    name: 'Single resolved tag returns data under object:field key',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: '/root/FP/PROJECT/A/archives/value_archive',
          },
        },
        invalid_tags: [],
      };
      client.responses.read_archives = {
        '/root/FP/PROJECT/A/archives/value_archive': [
          [1741219200000, 220.5],
          [1741220000000, 221.0],
        ],
      };

      const result = await fieldReadHistory(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': [
            [1741219200000, 220.5],
            [1741220000000, 221.0],
          ],
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Multiple resolved tags return all keys with matching data',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: '/root/FP/PROJECT/A/archives/value_archive',
          },
          '/root/FP/PROJECT/B': {
            quality: '/root/FP/PROJECT/B/archives/quality_archive',
          },
        },
        invalid_tags: [],
      };
      client.responses.read_archives = {
        '/root/FP/PROJECT/A/archives/value_archive': [[1741219200000, 1]],
        '/root/FP/PROJECT/B/archives/quality_archive': [[1741219300000, 2]],
      };

      const result = await fieldReadHistory(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/B', field: 'quality' },
        ],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': [[1741219200000, 1]],
          '/root/FP/PROJECT/B:quality': [[1741219300000, 2]],
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Multiple fields on the same object are grouped in resolve call and split in result',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: '/root/FP/PROJECT/A/archives/value_archive',
            quality: '/root/FP/PROJECT/A/archives/quality_archive',
          },
        },
        invalid_tags: [],
      };
      client.responses.read_archives = {
        '/root/FP/PROJECT/A/archives/value_archive': [[1741219200000, 220.5]],
        '/root/FP/PROJECT/A/archives/quality_archive': [[1741219200000, 1]],
      };

      const result = await fieldReadHistory(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/A', field: 'quality' },
        ],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(client.calls[0], {
        module: 'fp_json',
        method: 'get_tags_archive',
        params: {
          '/root/FP/PROJECT/A': ['value', 'quality'],
        },
      });
      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': [[1741219200000, 220.5]],
          '/root/FP/PROJECT/A:quality': [[1741219200000, 1]],
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Call order is resolve first then read',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: '/root/FP/PROJECT/A/archives/value_archive',
          },
        },
        invalid_tags: [],
      };
      client.responses.read_archives = {
        '/root/FP/PROJECT/A/archives/value_archive': [[1741219200000, 220.5]],
      };

      await fieldReadHistory(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(
        client.calls.map((call) => call.method),
        ['get_tags_archive', 'read_archives'],
      );
    },
  },
  {
    name: 'read_archives receives only resolved archive paths',
    run: async () => {
      const client = new MockEcometClient();
      const archivePath = '/root/FP/PROJECT/A/archives/value_archive';

      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: archivePath,
          },
        },
        invalid_tags: [],
      };
      client.responses.read_archives = {
        [archivePath]: [[1741219200000, 220.5]],
      };

      const result = await fieldReadHistory(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/A', field: '.name' },
        ],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(client.calls[1], {
        module: 'fp_json',
        method: 'read_archives',
        params: {
          archives: [archivePath],
          from: VALID_FROM,
          to: VALID_TO,
        },
      });
      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': [[1741219200000, 220.5]],
        },
        invalid: [],
        unresolved: ['/root/FP/PROJECT/A:.name'],
      });
    },
  },
  {
    name: 'read_archives receives validated from/to timestamps',
    run: async () => {
      const client = new MockEcometClient();
      const from = 1741305600000;
      const to = 1741309200000;

      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: '/root/FP/PROJECT/A/archives/value_archive',
          },
        },
        invalid_tags: [],
      };
      client.responses.read_archives = {
        '/root/FP/PROJECT/A/archives/value_archive': [],
      };

      await fieldReadHistory(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
        from,
        to,
      });

      assert.strictEqual(client.calls[1].params.from, from);
      assert.strictEqual(client.calls[1].params.to, to);
    },
  },
  {
    name: 'Unresolved field appears in unresolved list',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {},
        },
        invalid_tags: [],
      };

      const result = await fieldReadHistory(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: '.name' }],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(result, {
        values: {},
        invalid: [],
        unresolved: ['/root/FP/PROJECT/A:.name'],
      });
      assert.deepStrictEqual(
        client.calls.map((call) => call.method),
        ['get_tags_archive'],
      );
    },
  },
  {
    name: 'Invalid object appears in invalid list',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {},
        invalid_tags: ['/root/FP/PROJECT/MISSING'],
      };

      const result = await fieldReadHistory(client, {
        tags: [{ object: '/root/FP/PROJECT/MISSING', field: 'value' }],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(result, {
        values: {},
        invalid: ['/root/FP/PROJECT/MISSING:value'],
        unresolved: [],
      });
      assert.deepStrictEqual(
        client.calls.map((call) => call.method),
        ['get_tags_archive'],
      );
    },
  },
  {
    name: 'Mixed resolved and unresolved tags split values and unresolved',
    run: async () => {
      const client = new MockEcometClient();
      const archivePath = '/root/FP/PROJECT/A/archives/value_archive';
      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: archivePath,
          },
        },
        invalid_tags: [],
      };
      client.responses.read_archives = {
        [archivePath]: [[1741219200000, 220.5]],
      };

      const result = await fieldReadHistory(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/A', field: '.name' },
        ],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': [[1741219200000, 220.5]],
        },
        invalid: [],
        unresolved: ['/root/FP/PROJECT/A:.name'],
      });
    },
  },
  {
    name: 'All unresolved tags skip read_archives and return unresolved list',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {},
          '/root/FP/PROJECT/B': {},
        },
        invalid_tags: [],
      };

      const result = await fieldReadHistory(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: '.name' },
          { object: '/root/FP/PROJECT/B', field: '.folder' },
        ],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(result, {
        values: {},
        invalid: [],
        unresolved: ['/root/FP/PROJECT/A:.name', '/root/FP/PROJECT/B:.folder'],
      });
      assert.deepStrictEqual(
        client.calls.map((call) => call.method),
        ['get_tags_archive'],
      );
    },
  },
  {
    name: 'All invalid tags skip read_archives and return invalid list',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {},
        invalid_tags: ['/root/FP/PROJECT/MISSING_A', '/root/FP/PROJECT/MISSING_B'],
      };

      const result = await fieldReadHistory(client, {
        tags: [
          { object: '/root/FP/PROJECT/MISSING_A', field: 'value' },
          { object: '/root/FP/PROJECT/MISSING_B', field: 'quality' },
        ],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(result, {
        values: {},
        invalid: ['/root/FP/PROJECT/MISSING_A:value', '/root/FP/PROJECT/MISSING_B:quality'],
        unresolved: [],
      });
      assert.deepStrictEqual(
        client.calls.map((call) => call.method),
        ['get_tags_archive'],
      );
    },
  },
  {
    name: 'Missing archive key in read response maps to empty array',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: '/root/FP/PROJECT/A/archives/value_archive',
          },
        },
        invalid_tags: [],
      };
      client.responses.read_archives = {};

      const result = await fieldReadHistory(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': [],
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Explicit empty array in read response remains empty array',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: '/root/FP/PROJECT/A/archives/value_archive',
          },
        },
        invalid_tags: [],
      };
      client.responses.read_archives = {
        '/root/FP/PROJECT/A/archives/value_archive': [],
      };

      const result = await fieldReadHistory(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': [],
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Empty tags array throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldReadHistory(client, {
          tags: [],
          from: VALID_FROM,
          to: VALID_TO,
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === TAGS_ERROR,
      );
    },
  },
  {
    name: 'Non-array tags throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldReadHistory(client, {
          tags: {} as never,
          from: VALID_FROM,
          to: VALID_TO,
        } as never),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === TAGS_ERROR,
      );
    },
  },
  {
    name: 'from in seconds throws INVALID_PARAMS with multiply-by-1000 hint',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldReadHistory(client, {
          tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
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
    name: 'to in seconds throws INVALID_PARAMS with multiply-by-1000 hint',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldReadHistory(client, {
          tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
          from: VALID_FROM,
          to: 1709596800,
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "'to' appears to be in seconds (got 1709596800), expected milliseconds — multiply by 1000",
      );
    },
  },
  {
    name: 'from > to throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldReadHistory(client, {
          tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
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
    name: 'Non-number from throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldReadHistory(client, {
          tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
          from: 'bad' as never,
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
    name: 'Non-integer from throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldReadHistory(client, {
          tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
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
    name: 'Tag missing object throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldReadHistory(client, {
          tags: [{ field: 'value' } as never],
          from: VALID_FROM,
          to: VALID_TO,
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === TAG_ENTRY_ERROR,
      );
    },
  },
  {
    name: 'Tag missing field throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldReadHistory(client, {
          tags: [{ object: '/root/FP/PROJECT/A' } as never],
          from: VALID_FROM,
          to: VALID_TO,
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === TAG_ENTRY_ERROR,
      );
    },
  },
  {
    name: 'Duplicate tags are sent once to resolve and returned once',
    run: async () => {
      const client = new MockEcometClient();
      const archivePath = '/root/FP/PROJECT/A/archives/value_archive';
      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: archivePath,
          },
        },
        invalid_tags: [],
      };
      client.responses.read_archives = {
        [archivePath]: [[1741219200000, 220.5]],
      };

      const result = await fieldReadHistory(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/A', field: 'value' },
        ],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(client.calls[0], {
        module: 'fp_json',
        method: 'get_tags_archive',
        params: {
          '/root/FP/PROJECT/A': ['value'],
        },
      });
      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': [[1741219200000, 220.5]],
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Null resolve response treats all tags as unresolved and skips read',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = null;

      const result = await fieldReadHistory(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/B', field: 'quality' },
        ],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(result, {
        values: {},
        invalid: [],
        unresolved: ['/root/FP/PROJECT/A:value', '/root/FP/PROJECT/B:quality'],
      });
      assert.deepStrictEqual(
        client.calls.map((call) => call.method),
        ['get_tags_archive'],
      );
    },
  },
  {
    name: 'Mixed resolved, unresolved, and invalid tags split across all buckets',
    run: async () => {
      const client = new MockEcometClient();
      const archivePath = '/root/FP/PROJECT/A/archives/value_archive';
      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: archivePath,
          },
        },
        invalid_tags: ['/root/FP/PROJECT/MISSING'],
      };
      client.responses.read_archives = {
        [archivePath]: [[1741219200000, 220.5]],
      };

      const result = await fieldReadHistory(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/A', field: '.name' },
          { object: '/root/FP/PROJECT/MISSING', field: 'quality' },
        ],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': [[1741219200000, 220.5]],
        },
        invalid: ['/root/FP/PROJECT/MISSING:quality'],
        unresolved: ['/root/FP/PROJECT/A:.name'],
      });
    },
  },
  {
    name: 'Mixed invalid and unresolved with no resolved tags skips read_archives',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {},
        },
        invalid_tags: ['/root/FP/PROJECT/MISSING'],
      };

      const result = await fieldReadHistory(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: '.name' },
          { object: '/root/FP/PROJECT/MISSING', field: 'value' },
        ],
        from: VALID_FROM,
        to: VALID_TO,
      });

      assert.deepStrictEqual(result, {
        values: {},
        invalid: ['/root/FP/PROJECT/MISSING:value'],
        unresolved: ['/root/FP/PROJECT/A:.name'],
      });
      assert.deepStrictEqual(
        client.calls.map((call) => call.method),
        ['get_tags_archive'],
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
