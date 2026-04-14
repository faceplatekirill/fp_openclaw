import { EcometClient, getSnapshot } from '../../dist/index.js';

const HOSTS = ['10.210.2.20:9000', '10.210.2.19:9000'];
const LOGIN = process.env.ECOMET_LOGIN ?? 'ai_assistant';
const PASSWORD = process.env.ECOMET_PASSWORD ?? 'ai_assistant';
const REQUIRED_ARCHIVES = 5;

function isSnapshotValue(value: unknown): boolean {
  return typeof value === 'number' || value === null || value === undefined;
}

async function resolveArchivePaths(client: EcometClient): Promise<string[]> {
  const explicit = process.env.TEST_ARCHIVE_PATH;
  const explicitEntries =
    typeof explicit === 'string' && explicit.trim().length > 0
      ? [...new Set(explicit.split(',').map((value) => value.trim()).filter((value) => value.length > 0))]
      : [];
  if (explicitEntries.length > 0 && explicitEntries.length < REQUIRED_ARCHIVES) {
    throw new Error(
      `TEST_ARCHIVE_PATH must contain at least ${REQUIRED_ARCHIVES} comma-separated archive paths.`,
    );
  }

  const discoveryQueries = [
    "get .fp_path from 'project' where .pattern = $oid('/root/.patterns/ARCHIVE') page 1:500 format $to_json",
    "get .fp_path from 'project' where .fp_path LIKE '/archives/' page 1:500 format $to_json",
  ];
  const candidates = new Set<string>(explicitEntries);

  for (const statement of discoveryQueries) {
    try {
      const result = await client.queryObjects(statement);
      for (const row of result.objects) {
        const path = row['.fp_path'];
        if (typeof path === 'string' && path.length > 0) {
          candidates.add(path);
        }
      }
    } catch (_error) {
      // Ignore discovery query failures and try the next strategy.
    }
  }

  const probeTimestamp = Date.now();
  const queue = [...candidates];
  const probed = new Set<string>();
  const readable: string[] = [];

  while (queue.length > 0 && readable.length < REQUIRED_ARCHIVES) {
    const candidate = queue.shift() as string;
    if (probed.has(candidate)) {
      continue;
    }
    probed.add(candidate);

    try {
      const result = await getSnapshot(client, {
        archives: [candidate],
        timestamp: probeTimestamp,
      });
      const value = result[candidate];
      if (!isSnapshotValue(value)) {
        continue;
      }
      readable.push(candidate);

      const slash = candidate.lastIndexOf('/');
      if (slash > 0) {
        const folder = candidate.slice(0, slash);
        const escapedFolder = folder.replace(/'/g, "''");
        try {
          const siblings = await client.queryObjects(
            `get .fp_path from 'project' where .folder = $oid('${escapedFolder}') page 1:200 format $to_json`,
          );
          for (const row of siblings.objects) {
            const path = row['.fp_path'];
            if (typeof path === 'string' && path.length > 0 && !probed.has(path)) {
              queue.push(path);
            }
          }
        } catch (_error) {
          // Ignore sibling expansion errors and continue probing.
        }
      }
    } catch (_error) {
      // Candidate rejected by API; continue probing.
    }
  }

  if (readable.length < REQUIRED_ARCHIVES) {
    throw new Error(
      `Could not discover ${REQUIRED_ARCHIVES} readable archive paths. Set TEST_ARCHIVE_PATH with at least ${REQUIRED_ARCHIVES} valid paths.`,
    );
  }

  return readable.slice(0, REQUIRED_ARCHIVES);
}

async function runIntegrationTests() {
  console.log('\nArchive Snapshot Integration Tests\n');

  let passed = 0;
  let failed = 0;

  const client = new EcometClient(
    {
      hosts: HOSTS,
      login: LOGIN,
      password: PASSWORD,
      timeoutMs: 10000,
    },
    {
      info: (message: string) => console.log(`INFO  ${message}`),
      warn: (message: string) => console.log(`WARN  ${message}`),
      error: (message: string) => console.log(`ERROR ${message}`),
    },
  );

  let archivePaths: string[] = [];
  try {
    archivePaths = await resolveArchivePaths(client);
    console.log(`Using archive path(s): ${archivePaths.join(', ')}\n`);
  } catch (error) {
    console.log(`FAIL Setup: ${String(error)}\n`);
    await client.close();
    process.exit(1);
  }

  const primaryArchive = archivePaths[0];
  const requested = archivePaths.slice(0, REQUIRED_ARCHIVES);

  console.log('Test 1: Single archive snapshot');
  try {
    const result = await getSnapshot(client, {
      archives: [primaryArchive],
      timestamp: Date.now(),
    });

    const value = result[primaryArchive];
    if (isSnapshotValue(value)) {
      console.log(`PASS Test 1: valueType=${value === null ? 'null' : typeof value}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 1: snapshot value type is invalid\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 1: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 2: Multi-archive batch snapshot');
  try {
    const result = await getSnapshot(client, {
      archives: requested,
      timestamp: Date.now(),
    });

    const allValid = requested.every((path) => isSnapshotValue(result[path]));
    if (allValid) {
      const numericCount = requested.filter((path) => typeof result[path] === 'number').length;
      console.log(`PASS Test 2: archives=${requested.length}, numericValues=${numericCount}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 2: found invalid snapshot value type in batch response\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 2: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 3: Historical snapshot (1 hour ago)');
  try {
    const result = await getSnapshot(client, {
      archives: requested,
      timestamp: Date.now() - 60 * 60 * 1000,
    });

    const allValid = requested.every((path) => isSnapshotValue(result[path]));
    if (allValid) {
      const numericCount = requested.filter((path) => typeof result[path] === 'number').length;
      console.log(`PASS Test 3: archives=${requested.length}, numericValues=${numericCount}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 3: found invalid snapshot value type in historical response\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 3: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 4: Invalid archive path fails request');
  try {
    await getSnapshot(client, {
      archives: [`${primaryArchive}__TASK_005_INVALID__`],
      timestamp: Date.now(),
    });
    console.log('FAIL Test 4: expected request to fail for invalid archive path\n');
    failed += 1;
  } catch (_error) {
    console.log('PASS Test 4\n');
    passed += 1;
  }

  await client.close();

  console.log(`Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

runIntegrationTests().catch((error) => {
  console.error('Integration test suite error:', error);
  process.exit(1);
});
