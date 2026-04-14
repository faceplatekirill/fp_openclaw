import { EcometClient } from '../../dist/index.js';

async function runIntegrationTests() {
  console.log('\nEcometClient Integration Tests\n');

  let passed = 0;
  let failed = 0;

  const client = new EcometClient(
    {
      hosts: ['10.210.2.20:9000', '10.210.2.19:9000'],
      login: 'ai_assistant',
      password: 'ai_assistant',
      timeoutMs: 5000,
      reconnectDelayMs: 1000,
    },
    {
      info: (message: string) => console.log(`INFO  ${message}`),
      warn: (message: string) => console.log(`WARN  ${message}`),
      error: (message: string) => console.log(`ERROR ${message}`),
    },
  );

  console.log('Test 1: Connect');
  try {
    await client.connect();
    if (client.isConnected() && client.getState() === 'connected') {
      console.log('PASS Test 1\n');
      passed += 1;
    } else {
      console.log('FAIL Test 1: client did not report connected state\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 1: ${error}\n`);
    failed += 1;
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('Skipping remaining tests because connection is required.\n');
    return false;
  }

  console.log('Test 2: query() raw response');
  try {
    const statement =
      "get .name, .oid from 'project' where .oid = $oid('/root/.patterns/alarm') format $to_json";
    const result = await client.query(statement);

    if (result !== undefined && result !== null) {
      console.log('PASS Test 2\n');
      passed += 1;
    } else {
      console.log('FAIL Test 2: empty query response\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 2: ${error}\n`);
    failed += 1;
  }

  console.log('Test 3: queryObjects() normalized response');
  try {
    const statement =
      "get text, point from 'archive' where .pattern = $oid('/root/.patterns/alarm') page 1:5 format $to_json";
    const result = await client.queryObjects(statement);

    if (typeof result.total === 'number' && Array.isArray(result.objects)) {
      console.log(`PASS Test 3: total=${result.total}, objects=${result.objects.length}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 3: invalid queryObjects response shape\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 3: ${error}\n`);
    failed += 1;
  }

  console.log('Test 4: close() and state');
  try {
    await client.close();
    if (!client.isConnected() && client.getState() === 'disconnected') {
      console.log('PASS Test 4\n');
      passed += 1;
    } else {
      console.log('FAIL Test 4: client did not report disconnected state\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 4: ${error}\n`);
    failed += 1;
  }

  console.log(`Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

runIntegrationTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Integration test suite error:', error);
    process.exit(1);
  });
