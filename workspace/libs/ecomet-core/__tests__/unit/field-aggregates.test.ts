/// <reference path="./node-shim.d.ts" />
import assert from 'assert';
import { fieldAggregates, EcometError, ErrorCode } from '../../dist/index.js';

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

const VALID_TIMESTAMPS = [1741219200000, 1741222800000, 1741226400000];

const TAGS_ERROR = 'tags must be a non-empty array of { object, field, functions } entries';
const TAG_FUNCTIONS_ERROR =
  "each tag must have 'functions' (non-empty string array) property (element at index 0 is invalid)";
const TAG_ENTRY_ERROR =
  "each tag must have 'object' (string) and 'field' (string) properties (element at index 0 is invalid)";

const tests = [
  {
    name: 'Single tag with one function returns object:field aggregate values per timestamp',
    run: async () => {
      const client = new MockEcometClient();
      const archivePath = '/root/FP/PROJECT/A/archives/value_archive';

      client.responses.get_tags_archive = {
        tags: { '/root/FP/PROJECT/A': { value: archivePath } },
        invalid_tags: [],
      };
      client.responses.get_aggregates = {
        values: {
          '1741222800000': {
            [archivePath]: { avg: 220.5 },
          },
          '1741226400000': {
            [archivePath]: { avg: 218.3 },
          },
        },
        invalid: {},
      };

      const result = await fieldAggregates(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg'] }],
        timestamps: VALID_TIMESTAMPS,
      });

      assert.deepStrictEqual(result, {
        values: {
          '1741222800000': {
            '/root/FP/PROJECT/A:value': { avg: 220.5 },
          },
          '1741226400000': {
            '/root/FP/PROJECT/A:value': { avg: 218.3 },
          },
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Single tag with multiple functions returns all function results',
    run: async () => {
      const client = new MockEcometClient();
      const archivePath = '/root/FP/PROJECT/A/archives/value_archive';

      client.responses.get_tags_archive = {
        tags: { '/root/FP/PROJECT/A': { value: archivePath } },
        invalid_tags: [],
      };
      client.responses.get_aggregates = {
        values: {
          '1741222800000': {
            [archivePath]: { avg: 220.5, min: 210.1, max: 235.9 },
          },
        },
        invalid: {},
      };

      const result = await fieldAggregates(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg', 'min', 'max'] }],
        timestamps: [1741219200000, 1741222800000],
      });

      assert.deepStrictEqual(result, {
        values: {
          '1741222800000': {
            '/root/FP/PROJECT/A:value': { avg: 220.5, min: 210.1, max: 235.9 },
          },
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Multiple tags across different objects return all composite keys',
    run: async () => {
      const client = new MockEcometClient();
      const archiveA = '/root/FP/PROJECT/A/archives/value_archive';
      const archiveB = '/root/FP/PROJECT/B/archives/quality_archive';

      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': { value: archiveA },
          '/root/FP/PROJECT/B': { quality: archiveB },
        },
        invalid_tags: [],
      };
      client.responses.get_aggregates = {
        values: {
          '1741222800000': {
            [archiveA]: { avg: 1 },
            [archiveB]: { max: 2 },
          },
        },
        invalid: {},
      };

      const result = await fieldAggregates(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg'] },
          { object: '/root/FP/PROJECT/B', field: 'quality', functions: ['max'] },
        ],
        timestamps: [1741219200000, 1741222800000],
      });

      assert.deepStrictEqual(result, {
        values: {
          '1741222800000': {
            '/root/FP/PROJECT/A:value': { avg: 1 },
            '/root/FP/PROJECT/B:quality': { max: 2 },
          },
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
      client.responses.get_aggregates = {
        values: {
          '1741222800000': {
            [valueArchive]: { avg: 220.5 },
            [qualityArchive]: { min: 1 },
          },
        },
        invalid: {},
      };

      const result = await fieldAggregates(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg'] },
          { object: '/root/FP/PROJECT/A', field: 'quality', functions: ['min'] },
        ],
        timestamps: [1741219200000, 1741222800000],
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
          '1741222800000': {
            '/root/FP/PROJECT/A:value': { avg: 220.5 },
            '/root/FP/PROJECT/A:quality': { min: 1 },
          },
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Call order is resolve first then aggregates',
    run: async () => {
      const client = new MockEcometClient();
      const archivePath = '/root/FP/PROJECT/A/archives/value_archive';

      client.responses.get_tags_archive = {
        tags: { '/root/FP/PROJECT/A': { value: archivePath } },
        invalid_tags: [],
      };
      client.responses.get_aggregates = {
        values: { '1741222800000': { [archivePath]: { avg: 220.5 } } },
        invalid: {},
      };

      await fieldAggregates(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg'] }],
        timestamps: [1741219200000, 1741222800000],
      });

      assert.deepStrictEqual(
        client.calls.map((call) => call.method),
        ['get_tags_archive', 'get_aggregates'],
      );
    },
  },
  {
    name: 'get_aggregates receives only resolved archive paths in aggregates list',
    run: async () => {
      const client = new MockEcometClient();
      const archivePath = '/root/FP/PROJECT/A/archives/value_archive';

      client.responses.get_tags_archive = {
        tags: { '/root/FP/PROJECT/A': { value: archivePath } },
        invalid_tags: [],
      };
      client.responses.get_aggregates = {
        values: { '1741222800000': { [archivePath]: { avg: 220.5 } } },
        invalid: {},
      };

      const result = await fieldAggregates(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg'] },
          { object: '/root/FP/PROJECT/A', field: '.name', functions: ['avg'] },
        ],
        timestamps: [1741219200000, 1741222800000],
      });

      assert.deepStrictEqual(client.calls[1], {
        module: 'fp_archive',
        method: 'get_aggregates',
        params: {
          aggregates: [[archivePath, 'avg']],
          timestamps: [1741219200000, 1741222800000],
        },
      });
      assert.deepStrictEqual(result, {
        values: {
          '1741222800000': {
            '/root/FP/PROJECT/A:value': { avg: 220.5 },
          },
        },
        invalid: [],
        unresolved: ['/root/FP/PROJECT/A:.name'],
      });
    },
  },
  {
    name: 'get_aggregates receives validated timestamps',
    run: async () => {
      const client = new MockEcometClient();
      const archivePath = '/root/FP/PROJECT/A/archives/value_archive';
      const timestamps = [1741305600000, 1741309200000, 1741312800000];

      client.responses.get_tags_archive = {
        tags: { '/root/FP/PROJECT/A': { value: archivePath } },
        invalid_tags: [],
      };
      client.responses.get_aggregates = {
        values: { '1741309200000': { [archivePath]: { avg: 220.5 } } },
        invalid: {},
      };

      await fieldAggregates(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg'] }],
        timestamps,
      });

      assert.deepStrictEqual(client.calls[1].params.timestamps, timestamps);
    },
  },
  {
    name: 'get_aggregates receives all [archivePath, functionName] pairs for resolved tags',
    run: async () => {
      const client = new MockEcometClient();
      const archiveA = '/root/FP/PROJECT/A/archives/value_archive';
      const archiveB = '/root/FP/PROJECT/B/archives/power_archive';

      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': { value: archiveA },
          '/root/FP/PROJECT/B': { power: archiveB },
        },
        invalid_tags: [],
      };
      client.responses.get_aggregates = {
        values: {
          '1741222800000': {
            [archiveA]: { avg: 220.5, max: 235.9 },
            [archiveB]: { integral: 180000000 },
          },
        },
        invalid: {},
      };

      await fieldAggregates(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg', 'max'] },
          { object: '/root/FP/PROJECT/B', field: 'power', functions: ['integral'] },
        ],
        timestamps: [1741219200000, 1741222800000],
      });

      assert.deepStrictEqual(client.calls[1].params.aggregates, [
        [archiveA, 'avg'],
        [archiveA, 'max'],
        [archiveB, 'integral'],
      ]);
    },
  },
  {
    name: 'Unresolved tag appears in unresolved and not in values or invalid',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: { '/root/FP/PROJECT/A': {} },
        invalid_tags: [],
      };

      const result = await fieldAggregates(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: '.name', functions: ['avg'] }],
        timestamps: [1741219200000, 1741222800000],
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
    name: 'Invalid object appears in invalid and not in values or unresolved',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {},
        invalid_tags: ['/root/FP/PROJECT/MISSING'],
      };

      const result = await fieldAggregates(client, {
        tags: [{ object: '/root/FP/PROJECT/MISSING', field: 'value', functions: ['avg'] }],
        timestamps: [1741219200000, 1741222800000],
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
    name: 'Mixed resolved, unresolved, and invalid tags split across values/unresolved/invalid',
    run: async () => {
      const client = new MockEcometClient();
      const archivePath = '/root/FP/PROJECT/A/archives/value_archive';
      const invalidObject = '/root/FP/PROJECT/MISSING';

      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': { value: archivePath },
          '/root/FP/PROJECT/B': {},
        },
        invalid_tags: [invalidObject],
      };
      client.responses.get_aggregates = {
        values: {
          '1741222800000': {
            [archivePath]: { avg: 220.5 },
          },
        },
        invalid: {},
      };

      const result = await fieldAggregates(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg'] },
          { object: '/root/FP/PROJECT/B', field: '.name', functions: ['avg'] },
          { object: invalidObject, field: 'value', functions: ['avg'] },
        ],
        timestamps: [1741219200000, 1741222800000],
      });

      assert.deepStrictEqual(result, {
        values: {
          '1741222800000': {
            '/root/FP/PROJECT/A:value': { avg: 220.5 },
          },
        },
        invalid: [`${invalidObject}:value`],
        unresolved: ['/root/FP/PROJECT/B:.name'],
      });
    },
  },
  {
    name: 'All unresolved tags skip get_aggregates and return empty values',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {
          '/root/FP/PROJECT/A': {},
          '/root/FP/PROJECT/B': {},
        },
        invalid_tags: [],
      };

      const result = await fieldAggregates(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: '.name', functions: ['avg'] },
          { object: '/root/FP/PROJECT/B', field: '.folder', functions: ['max'] },
        ],
        timestamps: [1741219200000, 1741222800000],
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
    name: 'All invalid tags skip get_aggregates and return empty values',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = {
        tags: {},
        invalid_tags: ['/root/FP/PROJECT/MISSING_A', '/root/FP/PROJECT/MISSING_B'],
      };

      const result = await fieldAggregates(client, {
        tags: [
          { object: '/root/FP/PROJECT/MISSING_A', field: 'value', functions: ['avg'] },
          { object: '/root/FP/PROJECT/MISSING_B', field: 'quality', functions: ['max'] },
        ],
        timestamps: [1741219200000, 1741222800000],
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
    name: 'Resolved aggregate null result is preserved as null',
    run: async () => {
      const client = new MockEcometClient();
      const archivePath = '/root/FP/PROJECT/A/archives/value_archive';

      client.responses.get_tags_archive = {
        tags: { '/root/FP/PROJECT/A': { value: archivePath } },
        invalid_tags: [],
      };
      client.responses.get_aggregates = {
        values: {
          '1741222800000': {
            [archivePath]: { avg: null },
          },
        },
        invalid: {},
      };

      const result = await fieldAggregates(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg'] }],
        timestamps: [1741219200000, 1741222800000],
      });

      assert.deepStrictEqual(result, {
        values: {
          '1741222800000': {
            '/root/FP/PROJECT/A:value': { avg: null },
          },
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Resolved aggregate undefined result is preserved as undefined',
    run: async () => {
      const client = new MockEcometClient();
      const archivePath = '/root/FP/PROJECT/A/archives/value_archive';

      client.responses.get_tags_archive = {
        tags: { '/root/FP/PROJECT/A': { value: archivePath } },
        invalid_tags: [],
      };
      client.responses.get_aggregates = {
        values: {
          '1741222800000': {
            [archivePath]: { avg: undefined },
          },
        },
        invalid: {},
      };

      const result = await fieldAggregates(client, {
        tags: [{ object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg'] }],
        timestamps: [1741219200000, 1741222800000],
      });

      assert.deepStrictEqual(result, {
        values: {
          '1741222800000': {
            '/root/FP/PROJECT/A:value': { avg: undefined },
          },
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
        fieldAggregates(client, {
          tags: [],
          timestamps: [1741219200000, 1741222800000],
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
        fieldAggregates(client, {
          tags: {} as never,
          timestamps: [1741219200000, 1741222800000],
        } as never),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === TAGS_ERROR,
      );
    },
  },
  {
    name: 'Tag missing functions throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldAggregates(client, {
          tags: [{ object: '/root/FP/PROJECT/A', field: 'value' } as never],
          timestamps: [1741219200000, 1741222800000],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === TAG_FUNCTIONS_ERROR,
      );
      assert.strictEqual(client.calls.length, 0);
    },
  },
  {
    name: 'Tag with empty functions array throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldAggregates(client, {
          tags: [{ object: '/root/FP/PROJECT/A', field: 'value', functions: [] }],
          timestamps: [1741219200000, 1741222800000],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === TAG_FUNCTIONS_ERROR,
      );
      assert.strictEqual(client.calls.length, 0);
    },
  },
  {
    name: 'Tag with invalid aggregate function throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldAggregates(client, {
          tags: [{ object: '/root/FP/PROJECT/A', field: 'value', functions: ['bad:function:extra'] }],
          timestamps: [1741219200000, 1741222800000],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "invalid aggregate function 'bad:function:extra' at tags[0].functions[0]: must be a built-in (avg, min, max, integral, standard_deviation) or 'module:function' format",
      );
      assert.strictEqual(client.calls.length, 0);
    },
  },
  {
    name: 'Timestamps with fewer than 2 elements throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldAggregates(client, {
          tags: [{ object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg'] }],
          timestamps: [1741219200000],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            'timestamps must be an array of at least 2 integer millisecond timestamps',
      );
      assert.strictEqual(client.calls.length, 0);
    },
  },
  {
    name: 'Non-monotonic timestamps throws INVALID_PARAMS',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldAggregates(client, {
          tags: [{ object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg'] }],
          timestamps: [1741219200000, 1741219200000],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            'timestamps must be monotonically increasing, but timestamps[1] (1741219200000) <= timestamps[0] (1741219200000)',
      );
      assert.strictEqual(client.calls.length, 0);
    },
  },
  {
    name: 'Timestamp in seconds throws INVALID_PARAMS with multiply-by-1000 hint',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldAggregates(client, {
          tags: [{ object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg'] }],
          timestamps: [1709596800, 1709600400000],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message ===
            "'timestamps[0]' appears to be in seconds (got 1709596800), expected milliseconds — multiply by 1000",
      );
      assert.strictEqual(client.calls.length, 0);
    },
  },
  {
    name: 'Tag missing object throws INVALID_PARAMS propagated from resolveArchives',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldAggregates(client, {
          tags: [{ field: 'value', functions: ['avg'] } as never],
          timestamps: [1741219200000, 1741222800000],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === TAG_ENTRY_ERROR,
      );
      assert.strictEqual(client.calls.length, 0);
    },
  },
  {
    name: 'Tag missing field throws INVALID_PARAMS propagated from resolveArchives',
    run: async () => {
      const client = new MockEcometClient();
      await assert.rejects(
        fieldAggregates(client, {
          tags: [{ object: '/root/FP/PROJECT/A', functions: ['avg'] } as never],
          timestamps: [1741219200000, 1741222800000],
        }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.INVALID_PARAMS &&
          error.message === TAG_ENTRY_ERROR,
      );
      assert.strictEqual(client.calls.length, 0);
    },
  },
  {
    name: 'Duplicate tags with same functions are resolved once and returned once',
    run: async () => {
      const client = new MockEcometClient();
      const archivePath = '/root/FP/PROJECT/A/archives/value_archive';

      client.responses.get_tags_archive = {
        tags: { '/root/FP/PROJECT/A': { value: archivePath } },
        invalid_tags: [],
      };
      client.responses.get_aggregates = {
        values: {
          '1741222800000': {
            [archivePath]: { avg: 220.5 },
          },
        },
        invalid: {},
      };

      const result = await fieldAggregates(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg'] },
          { object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg'] },
        ],
        timestamps: [1741219200000, 1741222800000],
      });

      assert.deepStrictEqual(client.calls[0], {
        module: 'fp_json',
        method: 'get_tags_archive',
        params: {
          '/root/FP/PROJECT/A': ['value'],
        },
      });
      assert.deepStrictEqual(client.calls[1].params.aggregates, [[archivePath, 'avg']]);
      assert.deepStrictEqual(result, {
        values: {
          '1741222800000': {
            '/root/FP/PROJECT/A:value': { avg: 220.5 },
          },
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Duplicate tags with different functions merge function union',
    run: async () => {
      const client = new MockEcometClient();
      const archivePath = '/root/FP/PROJECT/A/archives/value_archive';

      client.responses.get_tags_archive = {
        tags: { '/root/FP/PROJECT/A': { value: archivePath } },
        invalid_tags: [],
      };
      client.responses.get_aggregates = {
        values: {
          '1741222800000': {
            [archivePath]: { avg: 220.5, max: 235.9 },
          },
        },
        invalid: {},
      };

      const result = await fieldAggregates(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg'] },
          { object: '/root/FP/PROJECT/A', field: 'value', functions: ['max'] },
        ],
        timestamps: [1741219200000, 1741222800000],
      });

      assert.deepStrictEqual(client.calls[0], {
        module: 'fp_json',
        method: 'get_tags_archive',
        params: {
          '/root/FP/PROJECT/A': ['value'],
        },
      });
      assert.deepStrictEqual(client.calls[1].params.aggregates, [
        [archivePath, 'avg'],
        [archivePath, 'max'],
      ]);
      assert.deepStrictEqual(result, {
        values: {
          '1741222800000': {
            '/root/FP/PROJECT/A:value': { avg: 220.5, max: 235.9 },
          },
        },
        invalid: [],
        unresolved: [],
      });
    },
  },
  {
    name: 'Null resolve response treats tags as unresolved and skips get_aggregates',
    run: async () => {
      const client = new MockEcometClient();
      client.responses.get_tags_archive = null;

      const result = await fieldAggregates(client, {
        tags: [
          { object: '/root/FP/PROJECT/A', field: 'value', functions: ['avg'] },
          { object: '/root/FP/PROJECT/B', field: 'quality', functions: ['max'] },
        ],
        timestamps: [1741219200000, 1741222800000],
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
