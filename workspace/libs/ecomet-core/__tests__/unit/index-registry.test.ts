/// <reference path="./node-shim.d.ts" />
import assert from 'assert';
import {
  IndexRegistry,
  listKnownTypes,
  listFieldsForType,
  listFieldsForTypes,
  getTypeFieldIndexes,
} from '../../dist/query/index-registry.js';

const ALL_PATTERNS_QUERY =
  "get .folder, .name, index from * where .pattern = $oid('/root/.patterns/.field') page 1:10000 format $to_json";

class MockEcometClient {
  queries = [];
  responses = [];

  async queryObjects(statement) {
    this.queries.push(statement);
    if (this.responses.length > 0) {
      return this.responses.shift();
    }
    return { total: 0, objects: [] };
  }
}

const tests = [
  {
    name: 'System fields always available without Ecomet calls',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new IndexRegistry(client);

      assert.deepStrictEqual(registry.getFieldIndex('/any/pattern', '.fp_path'), {
        simple: true,
        trigram: true,
        datetime: false,
      });
      assert.deepStrictEqual(registry.getFieldIndex('/any/pattern', '.name'), {
        simple: true,
        trigram: true,
        datetime: false,
      });
      assert.strictEqual(client.queries.length, 0);
    },
  },
  {
    name: 'Unknown pattern returns null for user fields',
    run: async () => {
      const client = new MockEcometClient();
      const registry = new IndexRegistry(client);

      assert.strictEqual(registry.getFieldIndex('/root/.patterns/unknown', 'user_field'), null);
    },
  },
  {
    name: 'init() populates registry from discovery query',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.push({
        total: 3,
        objects: [
          { '.folder': '/root/.patterns/alarm', '.name': 'text', index: ['simple', '3gram'] },
          { '.folder': '/root/.patterns/alarm', '.name': 'active', index: ['simple'] },
          { '.folder': '/root/.patterns/sensor', '.name': 'out_value', index: null },
        ],
      });

      const registry = new IndexRegistry(client);
      await registry.init();

      assert.strictEqual(client.queries[0], ALL_PATTERNS_QUERY);
      assert.strictEqual(registry.hasPattern('/root/.patterns/alarm'), true);
      assert.strictEqual(registry.hasPattern('/root/.patterns/sensor'), true);
      assert.deepStrictEqual(registry.getFieldIndex('/root/.patterns/alarm', 'text'), {
        simple: true,
        trigram: true,
        datetime: false,
      });
      assert.deepStrictEqual(registry.getFieldIndex('/root/.patterns/alarm', 'active'), {
        simple: true,
        trigram: false,
        datetime: false,
      });
      assert.deepStrictEqual(registry.getFieldIndex('/root/.patterns/sensor', 'out_value'), {
        simple: false,
        trigram: false,
        datetime: false,
      });
    },
  },
  {
    name: 'update() re-queries Ecomet and rebuilds data',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.push(
        {
          total: 1,
          objects: [{ '.folder': '/root/.patterns/alarm', '.name': 'text', index: ['simple'] }],
        },
        {
          total: 1,
          objects: [{ '.folder': '/root/.patterns/alarm', '.name': 'text', index: ['simple', '3gram'] }],
        },
      );

      const registry = new IndexRegistry(client);
      await registry.init();
      assert.deepStrictEqual(registry.getFieldIndex('/root/.patterns/alarm', 'text'), {
        simple: true,
        trigram: false,
        datetime: false,
      });

      await registry.update();
      assert.strictEqual(client.queries.length, 2);
      assert.strictEqual(client.queries[0], ALL_PATTERNS_QUERY);
      assert.strictEqual(client.queries[1], ALL_PATTERNS_QUERY);
      assert.deepStrictEqual(registry.getFieldIndex('/root/.patterns/alarm', 'text'), {
        simple: true,
        trigram: true,
        datetime: false,
      });
    },
  },
  {
    name: 'loadPattern() loads a single pattern on demand',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.push({
        total: 2,
        objects: [
          { '.name': 'text', index: ['simple', '3gram'] },
          { '.name': 'dt_on', index: ['simple', 'datetime'] },
        ],
      });

      const registry = new IndexRegistry(client);
      await registry.loadPattern('/root/.patterns/alarm');

      assert.strictEqual(
        client.queries[0],
        "get .name, index from * where .folder = $oid('/root/.patterns/alarm') page 1:10000 format $to_json",
      );
      assert.strictEqual(registry.hasPattern('/root/.patterns/alarm'), true);
      assert.deepStrictEqual(registry.getFieldIndex('/root/.patterns/alarm', 'text'), {
        simple: true,
        trigram: true,
        datetime: false,
      });
      assert.deepStrictEqual(registry.getFieldIndex('/root/.patterns/alarm', 'dt_on'), {
        simple: true,
        trigram: false,
        datetime: true,
      });

      await registry.loadPattern('/root/.patterns/alarm');
      assert.strictEqual(client.queries.length, 1);
    },
  },
  {
    name: 'hasPattern() reflects loaded state',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.push({
        total: 1,
        objects: [{ '.folder': '/root/.patterns/alarm', '.name': 'text', index: ['simple'] }],
      });

      const registry = new IndexRegistry(client);
      assert.strictEqual(registry.hasPattern('/root/.patterns/alarm'), false);
      assert.strictEqual(registry.hasPattern('/root/.patterns/unknown'), false);

      await registry.init();
      assert.strictEqual(registry.hasPattern('/root/.patterns/alarm'), true);
      assert.strictEqual(registry.hasPattern('/root/.patterns/unknown'), false);
    },
  },
  {
    name: 'listKnownTypes() returns sorted known types',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.push({
        total: 2,
        objects: [
          { '.folder': '/root/.patterns/zeta', '.name': 'state', index: ['simple'] },
          { '.folder': '/root/.patterns/alpha', '.name': 'title', index: ['simple', '3gram'] },
        ],
      });

      const registry = new IndexRegistry(client);
      await registry.init();

      assert.deepStrictEqual(listKnownTypes(registry), [
        '/root/.patterns/alpha',
        '/root/.patterns/zeta',
      ]);
    },
  },
  {
    name: 'listFieldsForType() includes system fields and user fields',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.push({
        total: 2,
        objects: [
          { '.folder': '/root/.patterns/alarm', '.name': 'text', index: ['simple', '3gram'] },
          { '.folder': '/root/.patterns/alarm', '.name': 'dt_on', index: ['datetime'] },
        ],
      });

      const registry = new IndexRegistry(client);
      await registry.init();

      assert.deepStrictEqual(await listFieldsForType(registry, '/root/.patterns/alarm'), {
        '.folder': ['simple'],
        '.fp_path': ['simple', '3gram'],
        '.name': ['simple', '3gram'],
        '.pattern': ['simple'],
        dt_on: ['datetime'],
        text: ['simple', '3gram'],
      });
    },
  },
  {
    name: 'listFieldsForTypes() marks unknown types explicitly',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.push(
        {
          total: 1,
          objects: [
            { '.folder': '/root/.patterns/alarm', '.name': 'text', index: ['simple', '3gram'] },
          ],
        },
        {
          total: 0,
          objects: [],
        },
      );

      const registry = new IndexRegistry(client);
      await registry.init();

      assert.deepStrictEqual(
        await listFieldsForTypes(registry, [
          '/root/.patterns/alarm',
          '/root/.patterns/missing',
        ]),
        {
          '/root/.patterns/alarm': {
            '.folder': ['simple'],
            '.fp_path': ['simple', '3gram'],
            '.name': ['simple', '3gram'],
            '.pattern': ['simple'],
            text: ['simple', '3gram'],
          },
          '/root/.patterns/missing': 'invalid type',
        },
      );
    },
  },
  {
    name: 'getTypeFieldIndexes() returns requested fields with invalid markers',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.push({
        total: 2,
        objects: [
          { '.folder': '/root/.patterns/alarm', '.name': 'text', index: ['simple', '3gram'] },
          { '.folder': '/root/.patterns/alarm', '.name': 'active', index: [] },
        ],
      });

      const registry = new IndexRegistry(client);
      await registry.init();

      assert.deepStrictEqual(
        await getTypeFieldIndexes(registry, '/root/.patterns/alarm', [
          '.name',
          'active',
          'missing_field',
        ]),
        {
          '.name': ['simple', '3gram'],
          active: [],
          missing_field: 'invalid field',
        },
      );

      assert.strictEqual(
        await getTypeFieldIndexes(registry, '/root/.patterns/missing', ['text']),
        'invalid type',
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
