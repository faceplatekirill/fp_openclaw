import { EcometClient, IndexRegistry, searchObjects } from '../../dist/index.js';

const TEST_PATTERN = '/root/.patterns/ARCHIVE';
const TEST_FOLDER = '/root/FP/PROJECT';
const ECOMET_HOSTS = (process.env.ECOMET_HOSTS ?? '10.210.2.20:9000,10.210.2.19:9000').split(',');
const ECOMET_LOGIN = process.env.ECOMET_LOGIN ?? 'ai_assistant';
const ECOMET_PASSWORD = process.env.ECOMET_PASSWORD ?? 'ai_assistant';

async function runIntegrationTests() {
  console.log('\nObject Search Integration Tests\n');

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
  const registry = new IndexRegistry(client);

  try {
    await registry.init();
  } catch (error) {
    console.log(`WARN IndexRegistry init failed: ${String(error)}`);
  }

  console.log('Test 1: Search by pattern');
  try {
    const result = await searchObjects(client, registry, {
      pattern: TEST_PATTERN,
      select: ['.fp_path', '.name'],
      limit: 10,
    });

    if (result.total > 0 && result.objects.length > 0) {
      console.log(`PASS Test 1: total=${result.total}, objects=${result.objects.length}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 1: expected non-empty result for known pattern\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 1: ${error}\n`);
    failed += 1;
  }

  console.log('Test 2: Search by folder (subtree)');
  try {
    const result = await searchObjects(client, registry, {
      folder: TEST_FOLDER,
      select: ['.fp_path', '.name'],
      limit: 20,
    });

    const allUnderFolder = result.objects.every((object) => {
      const path = object['.fp_path'];
      return typeof path === 'string' && path.startsWith(`${TEST_FOLDER}/`);
    });

    if (result.total >= 0 && allUnderFolder) {
      console.log(`PASS Test 2: total=${result.total}, objects=${result.objects.length}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 2: results are not scoped to the folder subtree\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 2: ${error}\n`);
    failed += 1;
  }

  console.log('Test 3: Search with text filter');
  try {
    const result = await searchObjects(client, registry, {
      search: { text: '/FP/PROJECT/', in: ['.fp_path'] },
      select: ['.fp_path'],
      limit: 10,
    });

    const allMatch = result.objects.every((object) => {
      const path = object['.fp_path'];
      return typeof path === 'string' && path.toLowerCase().includes('/fp/project/');
    });

    if (result.total >= 0 && allMatch) {
      console.log(`PASS Test 3: total=${result.total}, objects=${result.objects.length}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 3: text search returned non-matching rows\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 3: ${error}\n`);
    failed += 1;
  }

  console.log('Test 4: Pagination limit');
  try {
    const result = await searchObjects(client, registry, {
      folder: TEST_FOLDER,
      select: ['.fp_path'],
      limit: 5,
    });

    if (result.objects.length === 5 && result.total >= result.objects.length) {
      console.log(`PASS Test 4: total=${result.total}, page_size=${result.objects.length}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 4: expected exactly 5 objects in page\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 4: ${error}\n`);
    failed += 1;
  }

  console.log('Test 5: Empty result case');
  try {
    const result = await searchObjects(client, registry, {
      pattern: TEST_PATTERN,
      fields: { '.name': '__TASK_003_SEARCH_NO_MATCH__' },
      select: ['.fp_path', '.name'],
      limit: 10,
    });

    if (result.total === 0 && result.objects.length === 0) {
      console.log('PASS Test 5\n');
      passed += 1;
    } else {
      console.log('FAIL Test 5: expected empty search result\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 5: ${error}\n`);
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
