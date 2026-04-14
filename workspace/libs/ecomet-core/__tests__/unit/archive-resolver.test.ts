/// <reference path="./node-shim.d.ts" />
import assert from 'assert';
import { resolveArchives } from '../../dist/archive/archive-resolver.js';
import { EcometError, ErrorCode } from '../../dist/utils/errors.js';

class MockEcometClient {
  lastApplicationCall = null;
  mockResult = {};

  async application(module, method, params) {
    this.lastApplicationCall = { module, method, params };
    return this.mockResult;
  }
}

const TAGS_ERROR = 'tags must be a non-empty array of { object, field } entries';
const RESPONSE_ERROR =
  "get_tags_archive returned unexpected response type: expected object with 'tags' and 'invalid_tags'";

const tests = [
  {
    name: 'Valid single tag calls fp_json/get_tags_archive with grouped request map',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: '/root/FP/PROJECT/A/archives/value_archive',
          },
        },
        invalid_tags: [],
      };

      await resolveArchives(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
      });

      assert.deepStrictEqual(client.lastApplicationCall, {
        module: 'fp_json',
        method: 'get_tags_archive',
        params: {
          '/root/FP/PROJECT/A': ['value'],
        },
      });
    },
  },
  {
    name: 'Multiple tags for same object are grouped under one object key',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: '/root/FP/PROJECT/A/archives/value_archive',
            quality: '/root/FP/PROJECT/A/archives/quality_archive',
          },
        },
        invalid_tags: [],
      };

      await resolveArchives(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/A', field: 'quality' },
        ],
      });

      assert.deepStrictEqual(client.lastApplicationCall, {
        module: 'fp_json',
        method: 'get_tags_archive',
        params: {
          '/root/FP/PROJECT/A': ['value', 'quality'],
        },
      });
    },
  },
  {
    name: 'Multiple tags for different objects are split by object keys',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
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

      await resolveArchives(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/B', field: 'quality' },
        ],
      });

      assert.deepStrictEqual(client.lastApplicationCall, {
        module: 'fp_json',
        method: 'get_tags_archive',
        params: {
          '/root/FP/PROJECT/A': ['value'],
          '/root/FP/PROJECT/B': ['quality'],
        },
      });
    },
  },
  {
    name: 'Duplicate tags are deduplicated before application call',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: '/root/FP/PROJECT/A/archives/value_archive',
          },
        },
        invalid_tags: [],
      };

      await resolveArchives(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/A', field: 'value' },
        ],
      });

      assert.deepStrictEqual(client.lastApplicationCall, {
        module: 'fp_json',
        method: 'get_tags_archive',
        params: {
          '/root/FP/PROJECT/A': ['value'],
        },
      });
    },
  },
  {
    name: 'Fully resolved response maps all tags to composite keys',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: '/root/FP/PROJECT/A/archives/value_archive',
            quality: '/root/FP/PROJECT/A/archives/quality_archive',
          },
          '/root/FP/PROJECT/B': {
            value: '/root/FP/PROJECT/B/archives/value_archive',
          },
        },
        invalid_tags: [],
      };

      const result = await resolveArchives(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/A', field: 'quality' },
          { object: '/root/FP/PROJECT/B', field: 'value' },
        ],
      });

      assert.deepStrictEqual(result, {
        resolved: {
          '/root/FP/PROJECT/A:value': '/root/FP/PROJECT/A/archives/value_archive',
          '/root/FP/PROJECT/A:quality': '/root/FP/PROJECT/A/archives/quality_archive',
          '/root/FP/PROJECT/B:value': '/root/FP/PROJECT/B/archives/value_archive',
        },
        unresolved: [],
        invalid: [],
      });
    },
  },
  {
    name: 'Object present but field missing is reported in unresolved',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: '/root/FP/PROJECT/A/archives/value_archive',
          },
        },
        invalid_tags: [],
      };

      const result = await resolveArchives(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/A', field: 'quality' },
        ],
      });

      assert.deepStrictEqual(result, {
        resolved: {
          '/root/FP/PROJECT/A:value': '/root/FP/PROJECT/A/archives/value_archive',
        },
        unresolved: ['/root/FP/PROJECT/A:quality'],
        invalid: [],
      });
    },
  },
  {
    name: 'Mixed response populates resolved, unresolved, and invalid together',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: '/root/FP/PROJECT/A/archives/value_archive',
          },
          '/root/FP/PROJECT/B': {},
        },
        invalid_tags: ['/root/FP/PROJECT/MISSING'],
      };

      const result = await resolveArchives(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value' },
          { object: '/root/FP/PROJECT/B', field: 'quality' },
          { object: '/root/FP/PROJECT/MISSING', field: 'value' },
        ],
      });

      assert.deepStrictEqual(result, {
        resolved: {
          '/root/FP/PROJECT/A:value': '/root/FP/PROJECT/A/archives/value_archive',
        },
        unresolved: ['/root/FP/PROJECT/B:quality'],
        invalid: ['/root/FP/PROJECT/MISSING'],
      });
    },
  },
  {
    name: 'Invalid object path is reported in invalid',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        tags: {},
        invalid_tags: ['/root/FP/PROJECT/MISSING'],
      };

      const result = await resolveArchives(client, {
        tags: [{ object: '/root/FP/PROJECT/MISSING', field: 'value' }],
      });

      assert.deepStrictEqual(result, {
        resolved: {},
        unresolved: [],
        invalid: ['/root/FP/PROJECT/MISSING'],
      });
    },
  },
  {
    name: 'Multiple invalid object paths are deduplicated',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        tags: {},
        invalid_tags: [
          '/root/FP/PROJECT/MISSING_A',
          '/root/FP/PROJECT/MISSING_A',
          '/root/FP/PROJECT/MISSING_B',
        ],
      };

      const result = await resolveArchives(client, {
        tags: [
          { object: '/root/FP/PROJECT/MISSING_A', field: 'value' },
          { object: '/root/FP/PROJECT/MISSING_B', field: 'quality' },
        ],
      });

      assert.deepStrictEqual(result, {
        resolved: {},
        unresolved: [],
        invalid: ['/root/FP/PROJECT/MISSING_A', '/root/FP/PROJECT/MISSING_B'],
      });
    },
  },
  {
    name: 'Null response returns empty resolved/unresolved/invalid',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = null;

      const result = await resolveArchives(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
      });

      assert.deepStrictEqual(result, { resolved: {}, unresolved: [], invalid: [] });
    },
  },
  {
    name: 'Undefined response returns empty resolved/unresolved/invalid',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = undefined;

      const result = await resolveArchives(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
      });

      assert.deepStrictEqual(result, { resolved: {}, unresolved: [], invalid: [] });
    },
  },
  {
    name: 'Empty tags array throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        resolveArchives(client, { tags: [] }),
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
        resolveArchives(client, { tags: {} as never }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === TAGS_ERROR,
      );
    },
  },
  {
    name: "Tag without object property throws INVALID_PARAMS",
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        resolveArchives(client, { tags: [{ field: 'value' } as never] }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "each tag must have 'object' (string) and 'field' (string) properties (element at index 0 is invalid)",
      );
    },
  },
  {
    name: "Tag without field property throws INVALID_PARAMS",
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        resolveArchives(client, { tags: [{ object: '/root/FP/PROJECT/A' } as never] }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "each tag must have 'object' (string) and 'field' (string) properties (element at index 0 is invalid)",
      );
    },
  },
  {
    name: 'Tag with non-string object throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        resolveArchives(client, { tags: [{ object: 123 as never, field: 'value' }] }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "each tag must have 'object' (string) and 'field' (string) properties (element at index 0 is invalid)",
      );
    },
  },
  {
    name: 'Tag with non-string field throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        resolveArchives(client, {
          tags: [{ object: '/root/FP/PROJECT/A', field: 123 as never }],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "each tag must have 'object' (string) and 'field' (string) properties (element at index 0 is invalid)",
      );
    },
  },
  {
    name: 'Object path whitespace is trimmed before sending',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: '/root/FP/PROJECT/A/archives/value_archive',
          },
        },
        invalid_tags: [],
      };

      await resolveArchives(client, {
        tags: [{ object: ' /root/FP/PROJECT/A ', field: 'value' }],
      });

      assert.deepStrictEqual(client.lastApplicationCall, {
        module: 'fp_json',
        method: 'get_tags_archive',
        params: {
          '/root/FP/PROJECT/A': ['value'],
        },
      });
    },
  },
  {
    name: 'Field name whitespace is trimmed before sending',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        tags: {
          '/root/FP/PROJECT/A': {
            value: '/root/FP/PROJECT/A/archives/value_archive',
          },
        },
        invalid_tags: [],
      };

      await resolveArchives(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: ' value ' }],
      });

      assert.deepStrictEqual(client.lastApplicationCall, {
        module: 'fp_json',
        method: 'get_tags_archive',
        params: {
          '/root/FP/PROJECT/A': ['value'],
        },
      });
    },
  },
  {
    name: 'Whitespace-only object path throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        resolveArchives(client, { tags: [{ object: ' ', field: 'value' }] }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "each tag must have 'object' (string) and 'field' (string) properties (element at index 0 is invalid)",
      );
    },
  },
  {
    name: 'Whitespace-only field name throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        resolveArchives(client, { tags: [{ object: '/root/FP/PROJECT/A', field: ' ' }] }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "each tag must have 'object' (string) and 'field' (string) properties (element at index 0 is invalid)",
      );
    },
  },
  {
    name: 'Array response type throws QUERY_FAILED',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = [] as never;

      await assert.rejects(
        resolveArchives(client, {
          tags: [{ object: '/root/FP/PROJECT/A', field: 'value' }],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.QUERY_FAILED &&
          error.message === RESPONSE_ERROR,
      );
    },
  },
  {
    name: 'Composite key format uses colon separator',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        tags: {
          '/root/FP/A': {
            value: '/root/FP/A/archives/value_archive',
          },
        },
        invalid_tags: [],
      };

      const result = await resolveArchives(client, {
        tags: [{ object: '/root/FP/A', field: 'value' }],
      });

      assert.deepStrictEqual(result, {
        resolved: {
          '/root/FP/A:value': '/root/FP/A/archives/value_archive',
        },
        unresolved: [],
        invalid: [],
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
