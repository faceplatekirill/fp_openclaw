/// <reference path="./node-shim.d.ts" />
import assert from 'assert';
import { EcometClient } from '../../dist/client/ecomet-client.js';
import { Ecomet } from '../../dist/vendor/ecomet.js';
import { EcometError, ErrorCode } from '../../dist/utils/errors.js';

const originalMethods = {
  connect: Ecomet.prototype.connect,
  login: Ecomet.prototype.login,
  query: Ecomet.prototype.query,
  application: Ecomet.prototype.application,
  is_ok: Ecomet.prototype.is_ok,
  close: Ecomet.prototype.close,
};

const connectionState = new WeakMap();

function createMockController() {
  return {
    calls: {
      connect: [],
      login: [],
      query: [],
      application: [],
      close: 0,
    },
    behavior: {
      connect(ctx) {
        ctx.onConnect();
      },
      login(ctx) {
        ctx.onSuccess();
      },
      query(ctx) {
        ctx.onSuccess([]);
        return 1;
      },
      application(ctx) {
        ctx.onSuccess({});
        return 1;
      },
    },
  };
}

let mock = createMockController();

function installMock() {
  Ecomet.prototype.connect = function (host, port, protocol, onConnect, onError, onClose) {
    const state = {
      isConnected: false,
      onClose: typeof onClose === 'function' ? onClose : undefined,
    };
    connectionState.set(this, state);
    mock.calls.connect.push({ host, port, protocol, instance: this });

    return mock.behavior.connect({
      host,
      port,
      protocol,
      onConnect: () => {
        state.isConnected = true;
        onConnect();
      },
      onError,
      onClose: () => {
        state.isConnected = false;
        if (state.onClose) {
          state.onClose();
        }
      },
      instance: this,
      state,
    });
  };

  Ecomet.prototype.login = function (user, password, onSuccess, onError, timeout) {
    const state = connectionState.get(this);
    mock.calls.login.push({ user, password, timeout, instance: this });
    return mock.behavior.login({
      user,
      password,
      timeout,
      onSuccess: () => {
        if (state) {
          state.isConnected = true;
        }
        onSuccess();
      },
      onError,
      instance: this,
      state,
    });
  };

  Ecomet.prototype.query = function (statement, onSuccess, onError, timeout) {
    const state = connectionState.get(this);
    if (!state || !state.isConnected) {
      throw new Error('No connection');
    }

    mock.calls.query.push({ statement, timeout, instance: this });
    return mock.behavior.query({
      statement,
      timeout,
      onSuccess,
      onError,
      instance: this,
      state,
      triggerClose: () => {
        state.isConnected = false;
        if (state.onClose) {
          state.onClose();
        }
      },
    });
  };

  Ecomet.prototype.application = function (module, method, params, onSuccess, onError, timeout) {
    const state = connectionState.get(this);
    if (!state || !state.isConnected) {
      throw new Error('No connection');
    }

    mock.calls.application.push({ module, method, params, timeout, instance: this });
    return mock.behavior.application({
      module,
      method,
      params,
      timeout,
      onSuccess,
      onError,
      instance: this,
      state,
      triggerClose: () => {
        state.isConnected = false;
        if (state.onClose) {
          state.onClose();
        }
      },
    });
  };

  Ecomet.prototype.is_ok = function () {
    const state = connectionState.get(this);
    return Boolean(state?.isConnected);
  };

  Ecomet.prototype.close = function () {
    mock.calls.close += 1;
    const state = connectionState.get(this);
    if (state) {
      state.isConnected = false;
    }
  };
}

function restoreMock() {
  Ecomet.prototype.connect = originalMethods.connect;
  Ecomet.prototype.login = originalMethods.login;
  Ecomet.prototype.query = originalMethods.query;
  Ecomet.prototype.application = originalMethods.application;
  Ecomet.prototype.is_ok = originalMethods.is_ok;
  Ecomet.prototype.close = originalMethods.close;
}

function resetMock() {
  mock = createMockController();
}

function createClient(config = {}) {
  return new EcometClient({ reconnectDelayMs: 0, ...config });
}

const tests = [
  {
    name: 'Config defaults',
    run: async () => {
      const client = new EcometClient();
      await client.query('get .name from "project"');

      assert.strictEqual(mock.calls.connect[0].host, '127.0.0.1');
      assert.strictEqual(mock.calls.connect[0].port, 9000);
      assert.strictEqual(mock.calls.connect[0].protocol, 'ws:');
      assert.strictEqual(mock.calls.login[0].user, 'ai_assistant');
      assert.strictEqual(mock.calls.login[0].password, 'ai_assistant');
      assert.strictEqual(mock.calls.login[0].timeout, 5000);
      assert.strictEqual(mock.calls.query[0].timeout, 5000);

      await client.close();
      const reconnectStart = Date.now();
      await client.connect();
      assert.ok(Date.now() - reconnectStart >= 900);
    },
  },
  {
    name: 'Connect dedup for simultaneous calls',
    run: async () => {
      mock.behavior.connect = (ctx) => {
        setTimeout(() => ctx.onConnect(), 20);
      };

      const client = createClient({ hosts: ['dedup:9000'] });
      const first = client.connect();
      const second = client.connect();

      assert.strictEqual(first, second);
      await Promise.all([first, second]);
      assert.strictEqual(mock.calls.connect.length, 1);
      assert.strictEqual(client.isConnected(), true);
    },
  },
  {
    name: 'Multi-host failover',
    run: async () => {
      mock.behavior.connect = (ctx) => {
        if (ctx.host === 'first') {
          ctx.onError('connect fail on first');
          return;
        }
        ctx.onConnect();
      };

      const client = createClient({ hosts: ['first:9000', 'second:9001'] });
      await client.connect();

      assert.strictEqual(mock.calls.connect.length, 2);
      assert.strictEqual(mock.calls.connect[0].host, 'first');
      assert.strictEqual(mock.calls.connect[1].host, 'second');
      assert.strictEqual(client.isConnected(), true);
    },
  },
  {
    name: 'Response normalization for paginated result',
    run: async () => {
      mock.behavior.query = (ctx) => {
        ctx.onSuccess({
          count: 5,
          result: [['name'], ['A'], ['B']],
        });
        return 1;
      };

      const client = createClient({ hosts: ['page:9000'] });
      const result = await client.queryObjects('get name from "project" page 1:2');

      assert.strictEqual(result.total, 5);
      assert.deepStrictEqual(result.objects, [{ name: 'A' }, { name: 'B' }]);
    },
  },
  {
    name: 'Response normalization for non-paginated result',
    run: async () => {
      mock.behavior.query = (ctx) => {
        ctx.onSuccess([['name'], ['A'], ['B'], ['C']]);
        return 1;
      };

      const client = createClient({ hosts: ['raw:9000'] });
      const result = await client.queryObjects('get name from "project"');

      assert.strictEqual(result.total, 3);
      assert.deepStrictEqual(result.objects, [{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
    },
  },
  {
    name: 'Table parsing through queryObjects',
    run: async () => {
      mock.behavior.query = (ctx) => {
        ctx.onSuccess([
          ['col_a', 'col_b'],
          [1, 'x'],
          [2, 'y'],
        ]);
        return 1;
      };

      const client = createClient({ hosts: ['table:9000'] });
      const result = await client.queryObjects('get col_a, col_b from "project"');

      assert.strictEqual(result.total, 2);
      assert.deepStrictEqual(result.objects, [
        { col_a: 1, col_b: 'x' },
        { col_a: 2, col_b: 'y' },
      ]);
    },
  },
  {
    name: 'Auto-reconnect and single retry on connection error',
    run: async () => {
      let queryAttempts = 0;

      mock.behavior.query = (ctx) => {
        queryAttempts += 1;
        if (queryAttempts === 1) {
          ctx.triggerClose();
          ctx.onError('connection closed');
          return 1;
        }

        ctx.onSuccess([['id'], [42]]);
        return 2;
      };

      const client = createClient({ hosts: ['reconnect:9000'] });
      const result = await client.queryObjects('get id from "project"');

      assert.strictEqual(queryAttempts, 2);
      assert.strictEqual(mock.calls.connect.length, 2);
      assert.deepStrictEqual(result.objects, [{ id: 42 }]);
    },
  },
  {
    name: 'Application call passthrough',
    run: async () => {
      mock.behavior.application = (ctx) => {
        ctx.onSuccess({ ok: true });
        return 1;
      };

      const client = createClient({ hosts: ['application:9000'] });
      const payload = {
        archives: ['/root/FP/PROJECT/A'],
        from: 1741219200000,
        to: 1741222800000,
      };
      const result = await client.application('fp_json', 'read_archives', payload, {
        timeout: 3210,
      });

      assert.deepStrictEqual(result, { ok: true });
      assert.strictEqual(mock.calls.application.length, 1);
      assert.strictEqual(mock.calls.application[0].module, 'fp_json');
      assert.strictEqual(mock.calls.application[0].method, 'read_archives');
      assert.deepStrictEqual(mock.calls.application[0].params, payload);
      assert.strictEqual(mock.calls.application[0].timeout, 3210);
    },
  },
  {
    name: 'Application reconnect retry on connection error',
    run: async () => {
      let attempts = 0;
      mock.behavior.application = (ctx) => {
        attempts += 1;
        if (attempts === 1) {
          ctx.triggerClose();
          ctx.onError('connection closed');
          return 1;
        }
        ctx.onSuccess({ ok: true, retries: attempts - 1 });
        return 2;
      };

      const client = createClient({ hosts: ['application-retry:9000'] });
      const result = await client.application('fp_json', 'read_archives', {
        archives: ['/root/FP/PROJECT/A'],
        from: 1741219200000,
        to: 1741222800000,
      });

      assert.strictEqual(attempts, 2);
      assert.strictEqual(mock.calls.connect.length, 2);
      assert.deepStrictEqual(result, { ok: true, retries: 1 });
    },
  },
  {
    name: 'Error wrapping with EcometError and ErrorCode',
    run: async () => {
      mock.behavior.query = (ctx) => {
        ctx.onError('syntax error');
        return 1;
      };

      const syntaxClient = createClient({ hosts: ['errors:9000'] });
      await assert.rejects(
        syntaxClient.query('bad query'),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.QUERY_FAILED &&
          error.message === 'Query failed: syntax error',
      );

      let timeoutCalls = 0;
      resetMock();
      mock.behavior.query = (ctx) => {
        timeoutCalls += 1;
        ctx.onError('timeout');
        return timeoutCalls;
      };

      const timeoutClient = createClient({ hosts: ['timeout:9000'] });
      await assert.rejects(
        timeoutClient.query('timeout query', { timeout: 1234 }),
        (error) =>
          error instanceof EcometError &&
          error.code === ErrorCode.TIMEOUT &&
          error.message === 'Query timed out after 1234ms',
      );
      assert.strictEqual(timeoutCalls, 2);
      assert.strictEqual(mock.calls.connect.length, 2);
    },
  },
  {
    name: 'Close resets connection state',
    run: async () => {
      const client = createClient({ hosts: ['close:9000'] });
      await client.connect();

      assert.strictEqual(client.isConnected(), true);
      assert.strictEqual(client.getState(), 'connected');

      await client.close();
      assert.strictEqual(client.isConnected(), false);
      assert.strictEqual(client.getState(), 'disconnected');

      await client.close();
      assert.strictEqual(client.getState(), 'disconnected');
    },
  },
];

async function runTests() {
  installMock();

  let passed = 0;
  let failed = 0;

  for (let index = 0; index < tests.length; index += 1) {
    resetMock();
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

  restoreMock();

  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((error) => {
  restoreMock();
  console.error('Test suite error:', error);
  process.exit(1);
});
