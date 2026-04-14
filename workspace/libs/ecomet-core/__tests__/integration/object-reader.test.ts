import { EcometClient, readObjects } from '../../dist/index.js';

const UNKNOWN_PATH = '/root/FP/PROJECT/__TASK_002_DOES_NOT_EXIST__';
const ECOMET_HOSTS = (process.env.ECOMET_HOSTS ?? '10.210.2.20:9000,10.210.2.19:9000').split(',');
const ECOMET_LOGIN = process.env.ECOMET_LOGIN ?? 'ai_assistant';
const ECOMET_PASSWORD = process.env.ECOMET_PASSWORD ?? 'ai_assistant';

async function resolveKnownPath(client: EcometClient): Promise<string> {
  const explicitPath = process.env.TEST_OBJECT_PATH?.trim();
  if (explicitPath) {
    return explicitPath;
  }

  const discovery = await client.queryObjects(
    "get .fp_path from 'project' where .pattern = $oid('/root/.patterns/ARCHIVE') page 1:1 format $to_json",
  );
  const discoveredPath = discovery.objects[0]?.['.fp_path'];
  if (typeof discoveredPath !== 'string' || discoveredPath.length === 0) {
    throw new Error(
      'Could not discover a known object in project via /root/.patterns/ARCHIVE. Set TEST_OBJECT_PATH.',
    );
  }
  return discoveredPath;
}

async function runIntegrationTests() {
  console.log('\nObject Reader Integration Tests\n');

  let passed = 0;
  let failed = 0;

  const client = new EcometClient(
    {
      hosts: ECOMET_HOSTS,
      login: ECOMET_LOGIN,
      password: ECOMET_PASSWORD,
      timeoutMs: 5000,
    },
    {
      info: (message: string) => console.log(`INFO  ${message}`),
      warn: (message: string) => console.log(`WARN  ${message}`),
      error: (message: string) => console.log(`ERROR ${message}`),
    },
  );
  let knownPath: string;
  try {
    knownPath = await resolveKnownPath(client);
    console.log(`Using known path: ${knownPath}\n`);
  } catch (error) {
    console.log(`FAIL Setup: ${String(error)}\n`);
    await client.close();
    process.exit(1);
  }

  console.log('Test 1: Read known object');
  try {
    const result = await readObjects(client, {
      objects: [knownPath],
      fields: ['.name', '.fp_path'],
    });

    const value = result[knownPath];
    if (value && value['.fp_path'] === knownPath && typeof value['.name'] === 'string') {
      console.log('PASS Test 1\n');
      passed += 1;
    } else {
      console.log('FAIL Test 1: expected known object fields\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 1: ${error}\n`);
    failed += 1;
  }

  console.log('Test 2: Read non-existent object');
  try {
    const result = await readObjects(client, {
      objects: [UNKNOWN_PATH],
      fields: ['.name'],
    });

    if (result[UNKNOWN_PATH] === null) {
      console.log('PASS Test 2\n');
      passed += 1;
    } else {
      console.log('FAIL Test 2: expected null for unknown path\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 2: ${error}\n`);
    failed += 1;
  }

  console.log('Test 3: Batch read known + unknown');
  try {
    const result = await readObjects(client, {
      objects: [knownPath, UNKNOWN_PATH],
      fields: ['.name'],
    });

    const known = result[knownPath];
    const unknown = result[UNKNOWN_PATH];
    if (known && typeof known['.name'] === 'string' && unknown === null) {
      console.log('PASS Test 3\n');
      passed += 1;
    } else {
      console.log('FAIL Test 3: expected mixed mapping (object + null)\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 3: ${error}\n`);
    failed += 1;
  }

  await client.close();

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
