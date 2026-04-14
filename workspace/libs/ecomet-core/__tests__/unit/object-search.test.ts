/// <reference path="./node-shim.d.ts" />
import assert from 'assert';
import { searchObjects } from '../../dist/search/object-search.js';
import { EcometError, ErrorCode } from '../../dist/utils/errors.js';

class MockEcometClient {
  lastQuery = '';
  mockResult = { total: 0, objects: [] };

  async queryObjects(statement) {
    this.lastQuery = statement;
    return this.mockResult;
  }
}

class MockIndexRegistry {
  patterns = new Map();
  loadedPatterns = [];
  systemFields = new Map([
    ['.fp_path', { simple: true, trigram: true, datetime: false }],
    ['.name', { simple: true, trigram: true, datetime: false }],
    ['.pattern', { simple: true, trigram: false, datetime: false }],
    ['.folder', { simple: true, trigram: false, datetime: false }],
  ]);

  addPattern(patternPath, fields) {
    this.patterns.set(patternPath, new Map(Object.entries(fields)));
  }

  getFieldIndex(patternPath, fieldName) {
    if (this.systemFields.has(fieldName)) {
      return this.systemFields.get(fieldName);
    }
    const pattern = this.patterns.get(patternPath);
    return pattern?.get(fieldName) ?? null;
  }

  hasPattern(patternPath) {
    return this.patterns.has(patternPath);
  }

  async loadPattern(patternPath) {
    this.loadedPatterns.push(patternPath);
    if (!this.patterns.has(patternPath)) {
      this.patterns.set(patternPath, new Map());
    }
  }
}

const tests = [
  {
    name: 'Pattern-only query (single pattern)',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new MockIndexRegistry();
      registry.addPattern('/root/.patterns/alarm', {});

      await searchObjects(client, registry, {
        pattern: '/root/.patterns/alarm',
        select: ['.name', 'text'],
      });

      assert.strictEqual(
        client.lastQuery,
        "get .fp_path, .name, text from 'project' where .pattern = $oid('/root/.patterns/alarm') page 1:100 format $to_json",
      );
    },
  },
  {
    name: 'Pattern-only query (multiple patterns)',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new MockIndexRegistry();
      registry.addPattern('/root/.patterns/alarm', {});
      registry.addPattern('/root/.patterns/event', {});

      await searchObjects(client, registry, {
        pattern: ['/root/.patterns/alarm', '/root/.patterns/event'],
        select: ['.name'],
      });

      assert.ok(
        client.lastQuery.includes(
          "where OR(.pattern = $oid('/root/.patterns/alarm'), .pattern = $oid('/root/.patterns/event'))",
        ),
      );
    },
  },
  {
    name: 'Folder recursive mode uses .fp_path LIKE',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new MockIndexRegistry();

      await searchObjects(client, registry, {
        folder: '/root/FP/PROJECT/AREA_A',
        select: ['.name'],
      });

      assert.ok(client.lastQuery.includes(".fp_path LIKE '/root/FP/PROJECT/AREA_A/'"));
    },
  },
  {
    name: 'Folder non-recursive mode uses .folder = $oid',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new MockIndexRegistry();

      await searchObjects(client, registry, {
        folder: '/root/FP/PROJECT/AREA_A',
        recursive: false,
        select: ['.name'],
      });

      assert.ok(client.lastQuery.includes(".folder = $oid('/root/FP/PROJECT/AREA_A')"));
    },
  },
  {
    name: 'Folder normalization adds trailing slash in recursive mode',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new MockIndexRegistry();

      await searchObjects(client, registry, {
        folder: '/root/FP/PROJECT/AREA_A',
        select: ['.name'],
      });

      assert.ok(client.lastQuery.includes("LIKE '/root/FP/PROJECT/AREA_A/'"));
      assert.strictEqual(client.lastQuery.includes("LIKE '/root/FP/PROJECT/AREA_A//'"), false);
    },
  },
  {
    name: 'Field filter uses indexed "=" when simple index exists',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new MockIndexRegistry();
      registry.addPattern('/root/.patterns/sensor', {
        out_value: { simple: true, trigram: false, datetime: false },
      });

      const result = await searchObjects(client, registry, {
        pattern: '/root/.patterns/sensor',
        fields: { out_value: 100 },
        select: ['.name', 'out_value'],
      });

      assert.ok(client.lastQuery.includes('out_value = 100'));
      assert.strictEqual(client.lastQuery.includes('out_value := 100'), false);
      assert.deepStrictEqual(result.warnings, []);
    },
  },
  {
    name: 'Field filter without pattern uses strict ":=" and warning',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new MockIndexRegistry();

      const result = await searchObjects(client, registry, {
        fields: { out_value: 100 },
        select: ['.name'],
      });

      assert.ok(client.lastQuery.includes('out_value := 100'));
      assert.deepStrictEqual(result.warnings, [
        "No pattern specified; field 'out_value' uses strict comparison (may be slow)",
      ]);
    },
  },
  {
    name: 'Search uses LIKE for 3gram indexed field',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new MockIndexRegistry();

      const result = await searchObjects(client, registry, {
        search: { text: 'DEVICE_X', in: ['.name'] },
        select: ['.name'],
      });

      assert.ok(client.lastQuery.includes(".name LIKE 'DEVICE_X'"));
      assert.strictEqual(client.lastQuery.includes('.name :LIKE'), false);
      assert.deepStrictEqual(result.warnings, []);
    },
  },
  {
    name: 'Search uses strict :LIKE when no 3gram index exists',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new MockIndexRegistry();
      registry.addPattern('/root/.patterns/alarm', {
        text: { simple: true, trigram: false, datetime: false },
      });

      const result = await searchObjects(client, registry, {
        pattern: '/root/.patterns/alarm',
        search: { text: 'DEVICE_X', in: ['text'] },
        select: ['.name'],
      });

      assert.ok(client.lastQuery.includes("text :LIKE 'DEVICE_X'"));
      assert.deepStrictEqual(result.warnings, [
        "field 'text' on pattern '/root/.patterns/alarm' has no 3gram index; using strict LIKE",
      ]);
    },
  },
  {
    name: 'Search across multiple fields builds OR(...)',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new MockIndexRegistry();

      await searchObjects(client, registry, {
        search: { text: 'DEVICE_X', in: ['.name', 'text'] },
        select: ['.name'],
      });

      assert.ok(client.lastQuery.includes("OR(.name LIKE 'DEVICE_X', text :LIKE 'DEVICE_X')"));
    },
  },
  {
    name: 'Combined conditions use AND(...)',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new MockIndexRegistry();
      registry.addPattern('/root/.patterns/sensor', {
        out_value: { simple: true, trigram: false, datetime: false },
      });

      await searchObjects(client, registry, {
        pattern: '/root/.patterns/sensor',
        folder: '/root/FP/PROJECT/AREA_A',
        fields: { out_value: 100 },
        select: ['.name', 'out_value'],
      });

      assert.ok(client.lastQuery.includes('where AND('));
      assert.ok(
        client.lastQuery.includes(".pattern = $oid('/root/.patterns/sensor')"),
      );
      assert.ok(client.lastQuery.includes(".fp_path LIKE '/root/FP/PROJECT/AREA_A/'"));
      assert.ok(client.lastQuery.includes('out_value = 100'));
    },
  },
  {
    name: 'Pagination maps limit/offset to page from:to',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new MockIndexRegistry();
      registry.addPattern('/root/.patterns/alarm', {});

      await searchObjects(client, registry, {
        pattern: '/root/.patterns/alarm',
        select: ['.name'],
        limit: 50,
        offset: 100,
      });

      assert.ok(client.lastQuery.includes('page 101:150'));
    },
  },
  {
    name: 'Validation fails when no search conditions are provided',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new MockIndexRegistry();

      await assert.rejects(
        searchObjects(client, registry, { select: ['.name'] }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            'at least one search condition is required (pattern, folder, fields, or search)',
      );
    },
  },
  {
    name: 'Validation fails when search text is shorter than 3 chars',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new MockIndexRegistry();

      await assert.rejects(
        searchObjects(client, registry, {
          search: { text: 'ab', in: ['.name'] },
          select: ['.name'],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            'search.text must be at least 3 characters (LIKE operator requirement)',
      );
    },
  },
  {
    name: 'String values with quotes are escaped in WHERE clause',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new MockIndexRegistry();
      registry.addPattern('/root/.patterns/alarm', {
        text: { simple: true, trigram: true, datetime: false },
      });

      await searchObjects(client, registry, {
        pattern: '/root/.patterns/alarm',
        fields: { text: "DEVICE'S_NAME" },
        select: ['.name', 'text'],
      });

      assert.ok(client.lastQuery.includes("text = 'DEVICE''S_NAME'"));
    },
  },
  {
    name: 'Default pagination and format $to_json are always applied',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new MockIndexRegistry();
      registry.addPattern('/root/.patterns/alarm', {});

      await searchObjects(client, registry, {
        pattern: '/root/.patterns/alarm',
        select: ['.name'],
      });

      assert.ok(client.lastQuery.includes('page 1:100'));
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
