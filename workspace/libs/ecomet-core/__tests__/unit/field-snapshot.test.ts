/// <reference path="./node-shim.d.ts" />
import assert from 'assert';
import { fieldSnapshot } from '../../dist/archive/field-snapshot.js';
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

const VALID_TIMESTAMP = 1741219200000;

const TAGS_ERROR = 'tags must be a non-empty array of { object, field } entries';
const TAG_ENTRY_ERROR =
  "each tag must have 'object' (string) and 'field' (string) properties (element at index 0 is invalid)";

const tests = [
  {
    name: 'Single resolved tag returns number under object:field key',
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
      client.responses.get_points = {
        [archivePath]: 220.5,
      };

      const result = await fieldSnapshot(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
        timestamp: VALID_TIMESTAMP,
      });

      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': 220.5,
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Multiple resolved tags return all keys with matching values',
    run: async () => {
      const client = new MockEcometClient();
      const archiveA = '/root/FP/PROJECT/A/archives/value_archive';
      const archiveB = '/root/FP/PROJECT/B/archives/quality_archive';

      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: archiveA,
          },
          '/root/FP/PROJECT/B': {
            quality: archiveB,
          },
        },
        invalid_tags: [],
      };
      client.responses.get_points = {
        [archiveA]: 1,
        [archiveB]: 2,
      };

      const result = await fieldSnapshot(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/B', field: 'quality' },
        ],
        timestamp: VALID_TIMESTAMP,
      });

      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': 1,
          '/root/FP/PROJECT/B:quality': 2,
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Multiple fields on same object are grouped in resolve call and split in result',
    run: async () => {
      const client = new MockEcometClient();
      const valueArchive = '/root/FP/PROJECT/A/archives/value_archive';
      const qualityArchive = '/root/FP/PROJECT/A/archives/quality_archive';

      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: valueArchive,
            quality: qualityArchive,
          },
        },
        invalid_tags: [],
      };
      client.responses.get_points = {
        [valueArchive]: 220.5,
        [qualityArchive]: 1,
      };

      const result = await fieldSnapshot(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/A', field: 'quality' },
        ],
        timestamp: VALID_TIMESTAMP,
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
          '/root/FP/PROJECT/A:value': 220.5,
          '/root/FP/PROJECT/A:quality': 1,
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Call order is resolve first then snapshot',
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
      client.responses.get_points = {
        [archivePath]: 220.5,
      };

      await fieldSnapshot(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
        timestamp: VALID_TIMESTAMP,
      });

      assert.deepStrictEqual(
        client.calls.map((call) => call.method),
        ['get_tags_archive', 'get_points'],
      );
    },
  },
  {
    name: 'get_points receives only resolved archive paths',
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
      client.responses.get_points = {
        [archivePath]: 220.5,
      };

      const result = await fieldSnapshot(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/A', field: '.name' },
        ],
        timestamp: VALID_TIMESTAMP,
      });

      assert.deepStrictEqual(client.calls[1], {
        module: 'fp_json',
        method: 'get_points',
        params: {
          archives: [archivePath],
          ts: VALID_TIMESTAMP,
        },
      });
      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': 220.5,
        },
        invalid: [],
        unresolved: ['/root/FP/PROJECT/A:.name'],
      });
    },
  },
  {
    name: 'get_points receives the validated timestamp',
    run: async () => {
      const client = new MockEcometClient();
      const archivePath = '/root/FP/PROJECT/A/archives/value_archive';
      const timestamp = 1741305600000;

      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: archivePath,
          },
        },
        invalid_tags: [],
      };
      client.responses.get_points = {
        [archivePath]: 10,
      };

      await fieldSnapshot(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
        timestamp,
      });

      assert.strictEqual(client.calls[1].params.ts, timestamp);
    },
  },
  {
    name: 'Unresolved field is listed in unresolved and absent from values',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {},
        },
        invalid_tags: [],
      };

      const result = await fieldSnapshot(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: '.name' }],
        timestamp: VALID_TIMESTAMP,
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
    name: 'Invalid object is listed in invalid and absent from values',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {},
        invalid_tags: ['/root/FP/PROJECT/MISSING'],
      };

      const result = await fieldSnapshot(client, {
        tags: [{ object: '/root/FP/PROJECT/MISSING', field: 'value' }],
        timestamp: VALID_TIMESTAMP,
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
    name: 'Mixed resolved and unresolved tags split between values and unresolved',
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
      client.responses.get_points = {
        [archivePath]: 220.5,
      };

      const result = await fieldSnapshot(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/A', field: '.name' },
        ],
        timestamp: VALID_TIMESTAMP,
      });

      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': 220.5,
        },
        invalid: [],
        unresolved: ['/root/FP/PROJECT/A:.name'],
      });
    },
  },
  {
    name: 'All unresolved tags skip get_points and return empty values',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {},
          '/root/FP/PROJECT/B': {},
        },
        invalid_tags: [],
      };

      const result = await fieldSnapshot(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: '.name' },
          { object: '/root/FP/PROJECT/B', field: '.folder' },
        ],
        timestamp: VALID_TIMESTAMP,
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
    name: 'All invalid tags skip get_points and return empty values',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {},
        invalid_tags: ['/root/FP/PROJECT/MISSING_A', '/root/FP/PROJECT/MISSING_B'],
      };

      const result = await fieldSnapshot(client, {
        tags: [
          { object: '/root/FP/PROJECT/MISSING_A', field: 'value' },
          { object: '/root/FP/PROJECT/MISSING_B', field: 'quality' },
        ],
        timestamp: VALID_TIMESTAMP,
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
    name: 'Explicit null snapshot value maps to null in values',
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
      client.responses.get_points = {
        [archivePath]: null,
      };

      const result = await fieldSnapshot(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
        timestamp: VALID_TIMESTAMP,
      });

      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': null,
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Missing snapshot key maps to null in values',
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
      client.responses.get_points = {};

      const result = await fieldSnapshot(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
        timestamp: VALID_TIMESTAMP,
      });

      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': null,
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Undefined snapshot value maps to null in values',
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
      client.responses.get_points = {
        [archivePath]: undefined,
      };

      const result = await fieldSnapshot(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
        timestamp: VALID_TIMESTAMP,
      });

      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': null,
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
        fieldSnapshot(client, {
          tags: [],
          timestamp: VALID_TIMESTAMP,
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
        fieldSnapshot(client, {
          tags: {} as never,
          timestamp: VALID_TIMESTAMP,
        } as never),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === TAGS_ERROR,
      );
    },
  },
  {
    name: 'timestamp in seconds throws INVALID_PARAMS with multiply-by-1000 hint',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldSnapshot(client, {
          tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
          timestamp: 1709596800,
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "'timestamp' appears to be in seconds (got 1709596800), expected milliseconds — multiply by 1000",
      );
      assert.strictEqual(client.calls.length, 0);
    },
  },
  {
    name: 'Non-number timestamp throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldSnapshot(client, {
          tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
          timestamp: 'bad' as never,
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === "'timestamp' must be a timestamp in milliseconds, got: bad",
      );
      assert.strictEqual(client.calls.length, 0);
    },
  },
  {
    name: 'Non-integer timestamp throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldSnapshot(client, {
          tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
          timestamp: 1741219200000.5,
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "'timestamp' must be an integer timestamp in milliseconds, got: 1741219200000.5",
      );
      assert.strictEqual(client.calls.length, 0);
    },
  },
  {
    name: 'Tag missing object throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldSnapshot(client, {
          tags: [{ field: 'value' } as never],
          timestamp: VALID_TIMESTAMP,
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
        fieldSnapshot(client, {
          tags: [{ object: '/root/FP/PROJECT/A' } as never],
          timestamp: VALID_TIMESTAMP,
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
      client.responses.get_points = {
        [archivePath]: 220.5,
      };

      const result = await fieldSnapshot(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/A', field: 'value' },
        ],
        timestamp: VALID_TIMESTAMP,
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
          '/root/FP/PROJECT/A:value': 220.5,
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Null resolve response treats all tags as unresolved and skips snapshot',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = null;

      const result = await fieldSnapshot(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/B', field: 'quality' },
        ],
        timestamp: VALID_TIMESTAMP,
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
    name: 'Mixed resolved, unresolved, and invalid tags split into all three buckets',
    run: async () => {
      const client = new MockEcometClient();
      const archivePath = '/root/FP/PROJECT/A/archives/value_archive';

      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: archivePath,
          },
          '/root/FP/PROJECT/B': {},
        },
        invalid_tags: ['/root/FP/PROJECT/MISSING'],
      };
      client.responses.get_points = {
        [archivePath]: 220.5,
      };

      const result = await fieldSnapshot(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/B', field: '.name' },
          { object: '/root/FP/PROJECT/MISSING', field: 'quality' },
        ],
        timestamp: VALID_TIMESTAMP,
      });

      assert.deepStrictEqual(result, {
        values: {
          '/root/FP/PROJECT/A:value': 220.5,
        },
        invalid: ['/root/FP/PROJECT/MISSING:quality'],
        unresolved: ['/root/FP/PROJECT/B:.name'],
      });
    },
  },
  {
    name: 'Mix of invalid and unresolved without resolved tags skips get_points',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {},
        },
        invalid_tags: ['/root/FP/PROJECT/MISSING'],
      };

      const result = await fieldSnapshot(client, {
        tags: [
          { object: '/root/FP/PROJECT/MISSING', field: 'value' },
          { object: '/root/FP/PROJECT/A', field: '.name' },
        ],
        timestamp: VALID_TIMESTAMP,
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
