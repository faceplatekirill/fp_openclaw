/// <reference path="./node-shim.d.ts" />
import assert from 'assert';
import { queryAlarms } from '../../dist/alarm/alarm-query.js';
import { EcometError, ErrorCode } from '../../dist/utils/errors.js';

const TIME_FROM = 1_709_596_800_000;
const TIME_TO = 1_709_683_200_000;

class MockEcometClient {
  lastQuery = '';
  mockResult = { total: 0, objects: [] };

  async queryObjects(statement) {
    this.lastQuery = statement;
    return this.mockResult;
  }
}

function baseParams() {
  return {
    time_from: TIME_FROM,
    time_to: TIME_TO,
    select: ['text'],
  };
}

async function assertInvalidParams(promise, message) {
  await assert.rejects(
    promise,
    (error) =>
      error instanceof EcometError &&
      error.code === ErrorCode.INVALID_PARAMS &&
      (message ? error.message === message : true),
  );
}

const tests = [
  {
    name: 'Basic query (time range only) uses alarm pattern, datetime filter, archive DB, and ordering',
    run: async () => {
      const client = new MockEcometClient();

      await queryAlarms(client, baseParams());

      assert.ok(client.lastQuery.includes(".pattern = $oid('/root/.patterns/alarm')"));
      assert.ok(client.lastQuery.includes(`dt_on[${TIME_FROM}:${TIME_TO}]`));
      assert.ok(client.lastQuery.includes("from 'archive'"));
      assert.ok(client.lastQuery.includes('order by dt_on asc'));
    },
  },
  {
    name: 'dt_on is auto-included in SELECT',
    run: async () => {
      const client = new MockEcometClient();
      await queryAlarms(client, { ...baseParams(), select: ['text'] });

      assert.ok(client.lastQuery.startsWith("get dt_on, text from 'archive'"));
    },
  },
  {
    name: 'dt_on is not duplicated in SELECT',
    run: async () => {
      const client = new MockEcometClient();
      await queryAlarms(client, { ...baseParams(), select: ['text', 'dt_on'] });

      const selectClause = client.lastQuery.split(" from 'archive'")[0];
      const occurrences = (selectClause.match(/dt_on/g) ?? []).length;
      assert.strictEqual(occurrences, 1);
    },
  },
  {
    name: 'Active filter true uses indexed equals',
    run: async () => {
      const client = new MockEcometClient();
      await queryAlarms(client, { ...baseParams(), active: true });

      assert.ok(client.lastQuery.includes('active = true'));
    },
  },
  {
    name: 'Active filter false uses indexed equals',
    run: async () => {
      const client = new MockEcometClient();
      await queryAlarms(client, { ...baseParams(), active: false });

      assert.ok(client.lastQuery.includes('active = false'));
    },
  },
  {
    name: 'Acknowledged filter uses indexed equals',
    run: async () => {
      const client = new MockEcometClient();
      await queryAlarms(client, { ...baseParams(), acknowledged: false });

      assert.ok(client.lastQuery.includes('acknowledged = false'));
    },
  },
  {
    name: 'Single folder filter normalizes full project path to relevant point LIKE path',
    run: async () => {
      const client = new MockEcometClient();
      await queryAlarms(client, {
        ...baseParams(),
        folders: ['/root/FP/PROJECT/AREA_A'],
      });

      assert.ok(client.lastQuery.includes("point LIKE '/AREA_A/'"));
      assert.strictEqual(client.lastQuery.includes('/root/FP/PROJECT/AREA_A/'), false);
    },
  },
  {
    name: 'Multiple folders filter uses OR(point LIKE ...) with relevant paths',
    run: async () => {
      const client = new MockEcometClient();
      await queryAlarms(client, {
        ...baseParams(),
        folders: ['/root/FP/PROJECT/AREA_A', '/root/FP/PROJECT/AREA_B'],
      });

      assert.ok(
        client.lastQuery.includes(
          "OR(point LIKE '/AREA_A/', point LIKE '/AREA_B/')",
        ),
      );
    },
  },
  {
    name: 'Folder normalization prevents duplicate slash',
    run: async () => {
      const client = new MockEcometClient();
      await queryAlarms(client, {
        ...baseParams(),
        folders: ['/root/FP/PROJECT/AREA_A/'],
      });

      assert.ok(client.lastQuery.includes("point LIKE '/AREA_A/'"));
      assert.strictEqual(client.lastQuery.includes("point LIKE '/AREA_A//'"), false);
    },
  },
  {
    name: 'Already relevant folder paths are preserved and deduped against full paths',
    run: async () => {
      const client = new MockEcometClient();
      await queryAlarms(client, {
        ...baseParams(),
        folders: ['/KAZ/ALMATY/ALMATY', '/root/FP/PROJECT/KAZ/ALMATY/ALMATY/'],
      });

      const match = client.lastQuery.match(/point LIKE '\/KAZ\/ALMATY\/ALMATY\//g) ?? [];
      assert.strictEqual(match.length, 1);
      assert.strictEqual(client.lastQuery.includes('/root/FP/PROJECT/KAZ/ALMATY/ALMATY'), false);
    },
  },
  {
    name: 'Indexed field filter uses = operator',
    run: async () => {
      const client = new MockEcometClient();
      const result = await queryAlarms(client, {
        ...baseParams(),
        fields: { fact: 'KA' },
      });

      assert.ok(client.lastQuery.includes("fact = 'KA'"));
      assert.deepStrictEqual(result.warnings, []);
    },
  },
  {
    name: 'Unknown field filter uses strict := and warning',
    run: async () => {
      const client = new MockEcometClient();
      const result = await queryAlarms(client, {
        ...baseParams(),
        fields: { custom: 'val' },
      });

      assert.ok(client.lastQuery.includes("custom := 'val'"));
      assert.deepStrictEqual(result.warnings, [
        "field 'custom' is not a known alarm field; using strict comparison",
      ]);
    },
  },
  {
    name: 'Search on 3gram indexed field uses LIKE',
    run: async () => {
      const client = new MockEcometClient();
      const result = await queryAlarms(client, {
        ...baseParams(),
        search: { text: 'trip', in: ['text'] },
      });

      assert.ok(client.lastQuery.includes("text LIKE 'trip'"));
      assert.strictEqual(client.lastQuery.includes('text :LIKE'), false);
      assert.deepStrictEqual(result.warnings, []);
    },
  },
  {
    name: 'Search on non-3gram field uses strict :LIKE and warning',
    run: async () => {
      const client = new MockEcometClient();
      const result = await queryAlarms(client, {
        ...baseParams(),
        search: { text: 'trip', in: ['fact'] },
      });

      assert.ok(client.lastQuery.includes("fact :LIKE 'trip'"));
      assert.deepStrictEqual(result.warnings, [
        "field 'fact' has no 3gram index on alarm pattern; using strict LIKE",
      ]);
    },
  },
  {
    name: 'Search across multiple fields builds OR(...)',
    run: async () => {
      const client = new MockEcometClient();
      await queryAlarms(client, {
        ...baseParams(),
        search: { text: 'sub', in: ['text', 'comment'] },
      });

      assert.ok(client.lastQuery.includes("OR(text LIKE 'sub', comment LIKE 'sub')"));
    },
  },
  {
    name: 'Combined filters use AND(...) with required parts',
    run: async () => {
      const client = new MockEcometClient();
      await queryAlarms(client, {
        ...baseParams(),
        active: true,
        folders: ['/root/FP/PROJECT/AREA_A'],
        search: { text: 'trip', in: ['text'] },
      });

      assert.ok(client.lastQuery.includes('where AND('));
      assert.ok(client.lastQuery.includes('active = true'));
      assert.ok(client.lastQuery.includes("point LIKE '/AREA_A/'"));
      assert.ok(client.lastQuery.includes("text LIKE 'trip'"));
    },
  },
  {
    name: 'Pagination maps limit and offset to backend pageNumber:pageSize',
    run: async () => {
      const client = new MockEcometClient();
      await queryAlarms(client, {
        ...baseParams(),
        limit: 50,
        offset: 100,
      });

      assert.ok(client.lastQuery.includes('page 3:50'));
    },
  },
  {
    name: 'Default pagination is page 1:200',
    run: async () => {
      const client = new MockEcometClient();
      await queryAlarms(client, baseParams());

      assert.ok(client.lastQuery.includes('page 1:200'));
    },
  },
  {
    name: 'Condition ordering is pattern -> datetime -> boolean -> folders -> indexed -> search -> strict',
    run: async () => {
      const client = new MockEcometClient();
      await queryAlarms(client, {
        ...baseParams(),
        active: true,
        acknowledged: false,
        folders: ['/root/FP/PROJECT/AREA_A'],
        fields: { fact: 'KA', custom: 'x' },
        search: { text: 'trip', in: ['text'] },
      });

      const query = client.lastQuery;
      const patternIndex = query.indexOf(".pattern = $oid('/root/.patterns/alarm')");
      const datetimeIndex = query.indexOf(`dt_on[${TIME_FROM}:${TIME_TO}]`);
      const activeIndex = query.indexOf('active = true');
      const acknowledgedIndex = query.indexOf('acknowledged = false');
      const foldersIndex = query.indexOf("point LIKE '/AREA_A/'");
      const factIndex = query.indexOf("fact = 'KA'");
      const searchIndex = query.indexOf("text LIKE 'trip'");
      const strictFieldIndex = query.indexOf("custom := 'x'");

      assert.ok(patternIndex > -1);
      assert.ok(patternIndex < datetimeIndex);
      assert.ok(datetimeIndex < activeIndex);
      assert.ok(activeIndex < acknowledgedIndex);
      assert.ok(acknowledgedIndex < foldersIndex);
      assert.ok(foldersIndex < factIndex);
      assert.ok(factIndex < searchIndex);
      assert.ok(searchIndex < strictFieldIndex);
    },
  },
  {
    name: 'Validation errors cover all required paths',
    run: async () => {
      const client = new MockEcometClient();

      await assertInvalidParams(
        queryAlarms(client, { ...baseParams(), select: [] }),
        'select must be a non-empty array of field names',
      );

      await assertInvalidParams(
        queryAlarms(client, { ...baseParams(), time_from: undefined }),
      );

      await assertInvalidParams(
        queryAlarms(client, { ...baseParams(), time_to: undefined }),
      );

      await assertInvalidParams(
        queryAlarms(client, { ...baseParams(), time_from: Math.floor(TIME_FROM / 1000) }),
      );

      await assertInvalidParams(
        queryAlarms(client, { ...baseParams(), time_from: TIME_TO, time_to: TIME_TO }),
        'time_from must be less than time_to',
      );

      await assertInvalidParams(
        queryAlarms(client, {
          ...baseParams(),
          time_from: TIME_FROM,
          time_to: TIME_FROM + 30 * 24 * 60 * 60 * 1000 + 1,
        }),
        'time range must not exceed 30 days',
      );

      await assertInvalidParams(
        queryAlarms(client, {
          ...baseParams(),
          search: { text: 'ab', in: ['text'] },
        }),
        'search.text must be at least 3 characters (LIKE operator requirement)',
      );

      await assertInvalidParams(
        queryAlarms(client, {
          ...baseParams(),
          search: { text: 'trip', in: [] },
        }),
        'search.in must be a non-empty array of field names',
      );

      await assertInvalidParams(
        queryAlarms(client, { ...baseParams(), limit: 0 }),
        'limit must be a positive number',
      );

      await assertInvalidParams(
        queryAlarms(client, { ...baseParams(), folders: [] }),
        'folders must be a non-empty array of paths',
      );
    },
  },
  {
    name: 'String values with quotes are escaped in query',
    run: async () => {
      const client = new MockEcometClient();
      await queryAlarms(client, {
        ...baseParams(),
        fields: { text: "Breaker's trip" },
      });

      assert.ok(client.lastQuery.includes("text = 'Breaker''s trip'"));
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
