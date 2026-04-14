/// <reference path="./node-shim.d.ts" />
import assert from 'assert';
import { readObjects } from '../../dist/read/object-reader.js';
import { EcometError, ErrorCode } from '../../dist/utils/errors.js';

class MockEcometClient {
  lastQuery = '';
  mockResult = { total: 0, objects: [] };

  async queryObjects(statement) {
    this.lastQuery = statement;
    return this.mockResult;
  }
}

const tests = [
  {
    name: 'Single object read uses simple fp_path clause',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        total: 1,
        objects: [{ '.fp_path': '/root/FP/PROJECT/A', '.name': 'A', out_value: 10 }],
      };

      const result = await readObjects(client, {
        objects: ['/root/FP/PROJECT/A'],
        fields: ['.name', 'out_value'],
      });

      assert.strictEqual(
        client.lastQuery,
        "get .fp_path, .name, out_value from 'project' where .fp_path = '/root/FP/PROJECT/A' format $to_json",
      );
      assert.deepStrictEqual(result, {
        '/root/FP/PROJECT/A': { '.name': 'A', out_value: 10 },
      });
      assert.ok(!client.lastQuery.includes('OR('));
    },
  },
  {
    name: 'Batch read uses OR(...) with all unique paths',
    run: async () => {
      const client = new MockEcometClient();
      await readObjects(client, {
        objects: ['/root/FP/PROJECT/A', '/root/FP/PROJECT/B', '/root/FP/PROJECT/C'],
        fields: ['.name'],
      });

      assert.ok(client.lastQuery.includes("where OR(.fp_path = '/root/FP/PROJECT/A'"));
      assert.ok(client.lastQuery.includes(".fp_path = '/root/FP/PROJECT/B'"));
      assert.ok(client.lastQuery.includes(".fp_path = '/root/FP/PROJECT/C'"));
    },
  },
  {
    name: 'Not-found paths map to null',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        total: 2,
        objects: [
          { '.fp_path': '/root/FP/PROJECT/A', out_value: 1 },
          { '.fp_path': '/root/FP/PROJECT/B', out_value: 2 },
        ],
      };

      const result = await readObjects(client, {
        objects: ['/root/FP/PROJECT/A', '/root/FP/PROJECT/B', '/root/FP/PROJECT/C'],
        fields: ['out_value'],
      });

      assert.deepStrictEqual(result, {
        '/root/FP/PROJECT/A': { out_value: 1 },
        '/root/FP/PROJECT/B': { out_value: 2 },
        '/root/FP/PROJECT/C': null,
      });
    },
  },
  {
    name: '.fp_path is stripped when not requested',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        total: 1,
        objects: [{ '.fp_path': '/root/FP/PROJECT/A', out_value: 3 }],
      };

      const result = await readObjects(client, {
        objects: ['/root/FP/PROJECT/A'],
        fields: ['out_value'],
      });

      assert.deepStrictEqual(result, {
        '/root/FP/PROJECT/A': { out_value: 3 },
      });
      assert.strictEqual('.fp_path' in result['/root/FP/PROJECT/A'], false);
      assert.ok(client.lastQuery.includes('get .fp_path, out_value'));
    },
  },
  {
    name: '.fp_path is retained when requested',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        total: 1,
        objects: [{ '.fp_path': '/root/FP/PROJECT/A', out_value: 3 }],
      };

      const result = await readObjects(client, {
        objects: ['/root/FP/PROJECT/A'],
        fields: ['.fp_path', 'out_value'],
      });

      assert.deepStrictEqual(result, {
        '/root/FP/PROJECT/A': { '.fp_path': '/root/FP/PROJECT/A', out_value: 3 },
      });
    },
  },
  {
    name: 'Single quote in path is escaped',
    run: async () => {
      const client = new MockEcometClient();
      await readObjects(client, {
        objects: ["/root/FP/PROJECT/DEVICE'S_NAME"],
        fields: ['.name'],
      });

      assert.ok(
        client.lastQuery.includes(".fp_path = '/root/FP/PROJECT/DEVICE''S_NAME'"),
      );
    },
  },
  {
    name: 'Validation fails for empty objects',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        readObjects(client, { objects: [], fields: ['.name'] }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === 'objects must be a non-empty array of strings',
      );
    },
  },
  {
    name: 'Validation fails for empty fields',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        readObjects(client, { objects: ['/root/FP/PROJECT/A'], fields: [] }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === 'fields must be a non-empty array of strings',
      );
    },
  },
  {
    name: 'Duplicate paths are deduplicated in query',
    run: async () => {
      const client = new MockEcometClient();
      client.mockResult = {
        total: 1,
        objects: [{ '.fp_path': '/root/FP/PROJECT/A', out_value: 5 }],
      };

      const result = await readObjects(client, {
        objects: ['/root/FP/PROJECT/A', '/root/FP/PROJECT/A'],
        fields: ['out_value'],
      });

      const matchCount =
        client.lastQuery.match(/\.fp_path = '\/root\/FP\/PROJECT\/A'/g)?.length ?? 0;
      assert.strictEqual(matchCount, 1);
      assert.deepStrictEqual(result, {
        '/root/FP/PROJECT/A': { out_value: 5 },
      });
    },
  },
  {
    name: 'Every query includes format $to_json',
    run: async () => {
      const client = new MockEcometClient();
      await readObjects(client, {
        objects: ['/root/FP/PROJECT/A', '/root/FP/PROJECT/B'],
        fields: ['.name'],
      });
      assert.ok(client.lastQuery.endsWith('format $to_json'));
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
