import { EcometClient, readArchives } from '../../dist/index.js';

const HOSTS = ['10.210.2.20:9000', '10.210.2.19:9000'];
const LOGIN = process.env.ECOMET_LOGIN ?? 'ai_assistant';
const PASSWORD = process.env.ECOMET_PASSWORD ?? 'ai_assistant';
const REQUIRED_ARCHIVES = 5;

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

  const probeTo = Date.now();
  const probeFrom = probeTo - 24 * 60 * 60 * 1000;
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
      const result = await client.application<Record<string, unknown>>(
        'fp_json',
        'read_archives',
        {
          archives: [candidate],
          from: probeFrom,
          to: probeTo,
        },
      );

      if (result && typeof result === 'object' && !Array.isArray(result)) {
        const series = result[candidate];
        if (!Array.isArray(series)) {
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
      }
    } catch (_error) {
      // Candidate rejected by API; continue probing.
    }
  }

  if (readable.length > 0) {
    if (readable.length < REQUIRED_ARCHIVES) {
      throw new Error(
        `Could not discover ${REQUIRED_ARCHIVES} readable archive paths. Set TEST_ARCHIVE_PATH with at least ${REQUIRED_ARCHIVES} valid paths.`,
      );
    }
    return readable.slice(0, REQUIRED_ARCHIVES);
  }

  throw new Error(
    `Could not discover ${REQUIRED_ARCHIVES} readable archive paths. Set TEST_ARCHIVE_PATH with at least ${REQUIRED_ARCHIVES} valid paths.`,
  );
}

async function runIntegrationTests() {
  console.log('\nArchive Reader Integration Tests\n');

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

  const to = Date.now();
  const from = to - 24 * 60 * 60 * 1000;

  console.log('Test 1: Read archive range');
  try {
    const result = await readArchives(client, {
      archives: [primaryArchive],
      from,
      to,
    });

    const series = result[primaryArchive];
    if (Array.isArray(series)) {
      console.log(`PASS Test 1: points=${series.length}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 1: expected response map to contain archive key with an array\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 1: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 2: Timestamps are milliseconds and ascending');
  try {
    const result = await readArchives(client, {
      archives: [primaryArchive],
      from,
      to,
    });

    const series = result[primaryArchive] ?? [];
    let isValid = true;
    for (let index = 0; index < series.length; index += 1) {
      const point = series[index];
      const ts = point?.[0];
      if (!Number.isInteger(ts) || ts <= 1_000_000_000_000) {
        isValid = false;
        break;
      }
      if (index > 0 && ts < series[index - 1][0]) {
        isValid = false;
        break;
      }
    }

    if (isValid) {
      console.log(`PASS Test 2: validated ${series.length} points\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 2: series contains invalid or non-ascending timestamps\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 2: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 3: Multi-archive batch read');
  try {
    const requested = archivePaths.slice(0, REQUIRED_ARCHIVES);
    if (requested.length < REQUIRED_ARCHIVES) {
      throw new Error(`Need at least ${REQUIRED_ARCHIVES} readable archives for batch test.`);
    }

    const result = await readArchives(client, {
      archives: requested,
      from,
      to,
    });

    const hasAllKeys = requested.every((path) => Array.isArray(result[path]));
    const hasValidPoints = requested.every((path) =>
      result[path].every(
        (point) =>
          Array.isArray(point) &&
          point.length === 2 &&
          Number.isInteger(point[0]) &&
          point[0] > 1_000_000_000_000,
      ),
    );
    const nonEmptySeriesCount = requested.filter((path) => result[path].length > 0).length;

    if (hasAllKeys && hasValidPoints && nonEmptySeriesCount > 0) {
      console.log(
        `PASS Test 3: archives=${requested.length}, nonEmptySeries=${nonEmptySeriesCount}\n`,
      );
      passed += 1;
    } else {
      console.log(
        'FAIL Test 3: missing archive keys, invalid points, or all series empty in batch response\n',
      );
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 3: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 4: Invalid archive path fails request');
  try {
    await readArchives(client, {
      archives: [`${primaryArchive}__TASK_004_INVALID__`],
      from,
      to,
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
