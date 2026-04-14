import { EcometClient, getAggregates, getSnapshot } from '../../dist/index.js';

const HOSTS = ['10.210.2.20:9000', '10.210.2.19:9000'];
const LOGIN = process.env.ECOMET_LOGIN ?? 'ai_assistant';
const PASSWORD = process.env.ECOMET_PASSWORD ?? 'ai_assistant';
const REQUIRED_ARCHIVES = 5;

function isSnapshotValue(value: unknown): boolean {
  return typeof value === 'number' || value === null || value === undefined;
}

function isAggregateValue(value: unknown): boolean {
  return typeof value === 'number' || value === null || value === undefined;
}

function hasOwnProperty(target: unknown, key: string): boolean {
  if (!target || typeof target !== 'object') {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(target, key);
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
  console.log('\nArchive Aggregates Integration Tests\n');

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

  console.log('Test 1: Single archive, single aggregate, single period');
  try {
    const endTs = Date.now();
    const startTs = endTs - 60 * 60 * 1000;
    const result = await getAggregates(client, {
      aggregates: [[primaryArchive, 'avg']],
      timestamps: [startTs, endTs],
    });

    const period = result.values[String(endTs)];
    const archiveValues = period?.[primaryArchive];
    const hasAvg =
      hasOwnProperty(archiveValues, 'avg') && isAggregateValue((archiveValues as Record<string, unknown>).avg);

    if (hasAvg && result.invalid[primaryArchive] !== true) {
      console.log('PASS Test 1\n');
      passed += 1;
    } else {
      console.log('FAIL Test 1: missing avg value for archive in period response\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 1: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 2: Single archive, multiple aggregates');
  try {
    const endTs = Date.now();
    const startTs = endTs - 60 * 60 * 1000;
    const result = await getAggregates(client, {
      aggregates: [
        [primaryArchive, 'avg'],
        [primaryArchive, 'min'],
        [primaryArchive, 'max'],
      ],
      timestamps: [startTs, endTs],
    });

    const period = result.values[String(endTs)];
    const archiveValues = period?.[primaryArchive] as Record<string, unknown> | undefined;
    const hasAll =
      hasOwnProperty(archiveValues, 'avg') &&
      hasOwnProperty(archiveValues, 'min') &&
      hasOwnProperty(archiveValues, 'max') &&
      isAggregateValue(archiveValues?.avg) &&
      isAggregateValue(archiveValues?.min) &&
      isAggregateValue(archiveValues?.max);

    if (hasAll) {
      console.log('PASS Test 2\n');
      passed += 1;
    } else {
      console.log('FAIL Test 2: expected avg/min/max for the archive in one period\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 2: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 3: Multiple periods (3 hourly buckets)');
  try {
    const t0 = Date.now() - 3 * 60 * 60 * 1000;
    const t1 = t0 + 60 * 60 * 1000;
    const t2 = t1 + 60 * 60 * 1000;
    const t3 = t2 + 60 * 60 * 1000;
    const result = await getAggregates(client, {
      aggregates: [[primaryArchive, 'avg']],
      timestamps: [t0, t1, t2, t3],
    });

    const expectedKeys = [String(t1), String(t2), String(t3)];
    const hasAllPeriods = expectedKeys.every((key) => hasOwnProperty(result.values, key));

    if (hasAllPeriods) {
      console.log('PASS Test 3\n');
      passed += 1;
    } else {
      console.log('FAIL Test 3: expected period keys by end timestamps were not returned\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 3: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 4: Multiple archives, multiple aggregates');
  try {
    const requested = archivePaths.slice(0, REQUIRED_ARCHIVES);
    const endTs = Date.now();
    const startTs = endTs - 60 * 60 * 1000;
    const aggregates: [string, string][] = [];
    for (const archivePath of requested) {
      aggregates.push([archivePath, 'avg'], [archivePath, 'max']);
    }

    const result = await getAggregates(client, {
      aggregates,
      timestamps: [startTs, endTs],
    });

    const period = result.values[String(endTs)] as Record<string, Record<string, unknown>> | undefined;
    const hasAllResults = requested.every((archivePath) => {
      const archiveValues = period?.[archivePath];
      return (
        result.invalid[archivePath] !== true &&
        hasOwnProperty(archiveValues, 'avg') &&
        hasOwnProperty(archiveValues, 'max') &&
        isAggregateValue(archiveValues?.avg) &&
        isAggregateValue(archiveValues?.max)
      );
    });

    if (hasAllResults) {
      console.log(`PASS Test 4: archives=${requested.length}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 4: one or more archive aggregate results are missing\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 4: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 5: Invalid archive path appears in invalid with partial success');
  try {
    const invalidArchive = `${primaryArchive}__TASK_006_INVALID__`;
    const endTs = Date.now();
    const startTs = endTs - 60 * 60 * 1000;
    const result = await getAggregates(client, {
      aggregates: [
        [primaryArchive, 'avg'],
        [invalidArchive, 'avg'],
      ],
      timestamps: [startTs, endTs],
    });

    const period = result.values[String(endTs)];
    const archiveValues = period?.[primaryArchive] as Record<string, unknown> | undefined;
    const hasValidResult =
      hasOwnProperty(archiveValues, 'avg') && isAggregateValue(archiveValues?.avg);
    const hasInvalidFlag = result.invalid[invalidArchive] === true;

    if (hasValidResult && hasInvalidFlag) {
      console.log('PASS Test 5\n');
      passed += 1;
    } else {
      console.log('FAIL Test 5: expected valid data plus invalid archive flag\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 5: ${String(error)}\n`);
    failed += 1;
  }

  await client.close();

  console.log(`Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

runIntegrationTests().catch((error) => {
  console.error('Integration test suite error:', error);
  process.exit(1);
});
