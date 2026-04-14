import assert from 'assert';
import { EcometClient, fieldAggregates, getAggregates, readArchives, resolveArchives } from '../../dist/index.js';

const HOSTS = ['10.210.2.20:9000', '10.210.2.19:9000'];
const LOGIN = process.env.ECOMET_LOGIN ?? 'ai_assistant';
const PASSWORD = process.env.ECOMET_PASSWORD ?? 'ai_assistant';

const REQUIRED_CANDIDATES = 3;
const REQUIRED_OBJECTS = 3;
const DISCOVERY_PAGE_SIZE = 200;
const DISCOVERY_MAX_PAGES = 10;
const PROBE_WINDOW_MS = 24 * 60 * 60 * 1000;

interface ArchiveCandidate {
  object: string;
  field: string;
  archivePath: string;
}

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function hasOwnProperty(target: unknown, key: string): boolean {
  if (!target || typeof target !== 'object') {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(target, key);
}

function parseTagSource(source: unknown): { object: string; field: string } | null {
  if (typeof source !== 'string' || source.length === 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (_error) {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const type = (parsed as Record<string, unknown>).type;
  if (type !== 'tag') {
    return null;
  }

  const settings = (parsed as Record<string, unknown>).settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return null;
  }

  const object = (settings as Record<string, unknown>).tag;
  const field = (settings as Record<string, unknown>).field;
  if (typeof object !== 'string' || object.length === 0) {
    return null;
  }
  if (typeof field !== 'string' || field.length === 0) {
    return null;
  }

  return { object, field };
}

async function collectTagCandidates(client: EcometClient): Promise<ArchiveCandidate[]> {
  const candidates: ArchiveCandidate[] = [];
  const seenObjectField = new Set<string>();

  for (let page = 1; page <= DISCOVERY_MAX_PAGES; page += 1) {
    const from = (page - 1) * DISCOVERY_PAGE_SIZE + 1;
    const to = page * DISCOVERY_PAGE_SIZE;
    const query =
      `get .fp_path, source from 'project' ` +
      `where AND(.pattern = $oid('/root/.patterns/ARCHIVE'), is_prototype = false) ` +
      `page ${from}:${to} format $to_json`;
    const response = await client.queryObjects(query);

    if (response.objects.length === 0) {
      break;
    }

    for (const row of response.objects) {
      const archivePath = row['.fp_path'];
      if (typeof archivePath !== 'string' || archivePath.length === 0) {
        continue;
      }

      const parsed = parseTagSource(row.source);
      if (!parsed) {
        continue;
      }

      const key = `${parsed.object}:${parsed.field}`;
      if (seenObjectField.has(key)) {
        continue;
      }

      seenObjectField.add(key);
      candidates.push({
        object: parsed.object,
        field: parsed.field,
        archivePath,
      });
    }

    if (candidates.length >= 100) {
      break;
    }
  }

  return candidates;
}

async function hasUniqueArchiveForObjectField(
  client: EcometClient,
  candidate: ArchiveCandidate,
): Promise<boolean> {
  const query =
    `get .fp_path, source from 'project' ` +
    `where AND(.pattern = $oid('/root/.patterns/ARCHIVE'), .dependencies = '${escapeLiteral(candidate.object)}') ` +
    `page 1:200 format $to_json`;
  const response = await client.queryObjects(query);

  let matches = 0;
  for (const row of response.objects) {
    const parsed = parseTagSource(row.source);
    if (!parsed) {
      continue;
    }

    if (parsed.object === candidate.object && parsed.field === candidate.field) {
      matches += 1;
      if (matches > 1) {
        return false;
      }
    }
  }

  return matches === 1;
}

async function isReadableArchive(
  client: EcometClient,
  archivePath: string,
  from: number,
  to: number,
): Promise<boolean> {
  try {
    const response = await readArchives(client, {
      archives: [archivePath],
      from,
      to,
    });
    return hasOwnProperty(response, archivePath) && Array.isArray(response[archivePath]);
  } catch (_error) {
    return false;
  }
}

async function resolveTestCandidates(client: EcometClient): Promise<ArchiveCandidate[]> {
  const collected = await collectTagCandidates(client);
  if (collected.length === 0) {
    throw new Error('Could not discover tag-type non-prototype archive candidates.');
  }

  const probeTo = Date.now();
  const probeFrom = probeTo - PROBE_WINDOW_MS;
  const selected: ArchiveCandidate[] = [];
  const selectedObjectField = new Set<string>();
  const selectedObjects = new Set<string>();

  for (const candidate of collected) {
    const key = `${candidate.object}:${candidate.field}`;
    if (selectedObjectField.has(key)) {
      continue;
    }

    const unique = await hasUniqueArchiveForObjectField(client, candidate);
    if (!unique) {
      continue;
    }

    const readable = await isReadableArchive(client, candidate.archivePath, probeFrom, probeTo);
    if (!readable) {
      continue;
    }

    selected.push(candidate);
    selectedObjectField.add(key);
    selectedObjects.add(candidate.object);

    if (selected.length >= REQUIRED_CANDIDATES && selectedObjects.size >= REQUIRED_OBJECTS) {
      return selected;
    }
  }

  throw new Error(
    `Could not find ${REQUIRED_CANDIDATES} readable unique archive candidates across ${REQUIRED_OBJECTS} objects. Found ${selected.length} candidate(s) across ${selectedObjects.size} object(s).`,
  );
}

async function findUnresolvedField(client: EcometClient, objectPath: string): Promise<string> {
  const probes = ['.name', '.pattern', '.folder', '__TASK_010_UNRESOLVED_FIELD__'];

  for (const field of probes) {
    const result = await resolveArchives(client, {
      tags: [{ object: objectPath, field }],
    });
    const key = `${objectPath}:${field}`;
    if (
      !result.resolved[key] &&
      result.unresolved.includes(key) &&
      !result.invalid.includes(objectPath)
    ) {
      return field;
    }
  }

  throw new Error(`Could not find a reliably unresolved field for object '${objectPath}'.`);
}

function isAggregateValue(value: unknown): value is number | null | undefined | 'undefined' {
  return (
    typeof value === 'number' ||
    value === null ||
    value === undefined ||
    value === 'undefined'
  );
}

async function runIntegrationTests() {
  console.log('\nField Aggregates Integration Tests\n');

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

  let candidates: ArchiveCandidate[] = [];
  try {
    candidates = await resolveTestCandidates(client);
    const preview = candidates
      .slice(0, REQUIRED_CANDIDATES)
      .map((candidate) => `${candidate.object}:${candidate.field} -> ${candidate.archivePath}`)
      .join(', ');
    console.log(`Using candidates: ${preview}\n`);
  } catch (error) {
    console.log(`FAIL Setup: ${String(error)}\n`);
    await client.close();
    process.exit(1);
  }

  const primary = candidates[0];
  let unresolvedField = '';
  try {
    unresolvedField = await findUnresolvedField(client, primary.object);
  } catch (error) {
    console.log(`FAIL Setup: ${String(error)}\n`);
    await client.close();
    process.exit(1);
  }

  console.log('Test 1: Single tag with avg returns values key and empty unresolved');
  try {
    const to = Date.now();
    const from = to - 60 * 60 * 1000;
    const timestamps = [from, to];
    const timestampKey = String(to);
    const key = `${primary.object}:${primary.field}`;

    const result = await fieldAggregates(client, {
      tags: [{ object: primary.object, field: primary.field, functions: ['avg'] }],
      timestamps,
    });

    const valueByKey = result.values[timestampKey]?.[key];
    if (
      valueByKey &&
      hasOwnProperty(valueByKey, 'avg') &&
      isAggregateValue(valueByKey.avg) &&
      result.unresolved.length === 0
    ) {
      console.log(`PASS Test 1: avg=${String(valueByKey.avg)}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 1: expected values[timestamp][key].avg and unresolved=[]\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 1: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 2: Multiple tags with avg/min/max return all keys and functions');
  try {
    const to = Date.now();
    const from = to - 60 * 60 * 1000;
    const timestamps = [from, to];
    const timestampKey = String(to);

    const result = await fieldAggregates(client, {
      tags: candidates.map((candidate) => ({
        object: candidate.object,
        field: candidate.field,
        functions: ['avg', 'min', 'max'],
      })),
      timestamps,
    });

    const allPresent = candidates.every((candidate) => {
      const key = `${candidate.object}:${candidate.field}`;
      const row = result.values[timestampKey]?.[key];
      if (!row) {
        return false;
      }
      return (
        hasOwnProperty(row, 'avg') &&
        hasOwnProperty(row, 'min') &&
        hasOwnProperty(row, 'max') &&
        isAggregateValue(row.avg) &&
        isAggregateValue(row.min) &&
        isAggregateValue(row.max)
      );
    });

    if (allPresent && result.invalid.length === 0 && result.unresolved.length === 0) {
      console.log(`PASS Test 2: validated ${candidates.length} key(s)\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 2: expected all keys with avg/min/max and no invalid/unresolved\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 2: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 3: Unresolved field appears in unresolved and not in values/invalid');
  try {
    const to = Date.now();
    const from = to - 60 * 60 * 1000;
    const key = `${primary.object}:${unresolvedField}`;

    const result = await fieldAggregates(client, {
      tags: [{ object: primary.object, field: unresolvedField, functions: ['avg'] }],
      timestamps: [from, to],
    });

    const appearsInValues = Object.values(result.values).some((byTag) => hasOwnProperty(byTag, key));
    if (result.unresolved.includes(key) && !result.invalid.includes(key) && !appearsInValues) {
      console.log('PASS Test 3\n');
      passed += 1;
    } else {
      console.log('FAIL Test 3: expected key only in unresolved\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 3: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 4: Invalid object appears in invalid and not in values/unresolved');
  try {
    const invalidObject = `/root/FP/PROJECT/__TASK_010_INVALID_${Date.now()}__`;
    const key = `${invalidObject}:value`;
    const to = Date.now();
    const from = to - 60 * 60 * 1000;

    const result = await fieldAggregates(client, {
      tags: [{ object: invalidObject, field: 'value', functions: ['avg'] }],
      timestamps: [from, to],
    });

    const appearsInValues = Object.values(result.values).some((byTag) => hasOwnProperty(byTag, key));
    if (result.invalid.includes(key) && !result.unresolved.includes(key) && !appearsInValues) {
      console.log('PASS Test 4\n');
      passed += 1;
    } else {
      console.log('FAIL Test 4: expected key only in invalid\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 4: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 5: Mixed resolved, unresolved, and invalid tags split correctly');
  try {
    const invalidObject = `/root/FP/PROJECT/__TASK_010_INVALID_MIX_${Date.now()}__`;
    const resolvedKey = `${primary.object}:${primary.field}`;
    const unresolvedKey = `${primary.object}:${unresolvedField}`;
    const invalidKey = `${invalidObject}:value`;
    const to = Date.now();
    const from = to - 60 * 60 * 1000;
    const timestampKey = String(to);

    const result = await fieldAggregates(client, {
      tags: [
        { object: primary.object, field: primary.field, functions: ['avg'] },
        { object: primary.object, field: unresolvedField, functions: ['avg'] },
        { object: invalidObject, field: 'value', functions: ['avg'] },
      ],
      timestamps: [from, to],
    });

    const resolvedValue = result.values[timestampKey]?.[resolvedKey];
    if (
      resolvedValue &&
      hasOwnProperty(resolvedValue, 'avg') &&
      isAggregateValue(resolvedValue.avg) &&
      result.unresolved.includes(unresolvedKey) &&
      result.invalid.includes(invalidKey)
    ) {
      console.log('PASS Test 5\n');
      passed += 1;
    } else {
      console.log('FAIL Test 5: expected resolved in values + unresolved + invalid splits\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 5: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 6: Round-trip consistency with resolveArchives + getAggregates');
  try {
    const to = Date.now();
    const from = to - 60 * 60 * 1000;
    const timestamps = [from, to];
    const timestampKey = String(to);
    const key = `${primary.object}:${primary.field}`;
    const functions = ['avg', 'min', 'max'] as const;

    const fieldResult = await fieldAggregates(client, {
      tags: [{ object: primary.object, field: primary.field, functions: [...functions] }],
      timestamps,
    });

    const resolveResult = await resolveArchives(client, {
      tags: [{ object: primary.object, field: primary.field }],
    });
    const archivePath = resolveResult.resolved[key];
    if (typeof archivePath !== 'string' || archivePath.length === 0) {
      throw new Error('Primary candidate did not resolve to an archive path.');
    }

    const manualResult = await getAggregates(client, {
      aggregates: functions.map((fn) => [archivePath, fn]),
      timestamps,
    });

    const expected = manualResult.values[timestampKey]?.[archivePath];
    const actual = fieldResult.values[timestampKey]?.[key];
    assert.deepStrictEqual(actual, expected);

    console.log('PASS Test 6\n');
    passed += 1;
  } catch (error) {
    console.log(`FAIL Test 6: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 7: Multiple periods return values for each period end timestamp');
  try {
    const t2 = Date.now();
    const t1 = t2 - 60 * 60 * 1000;
    const t0 = t1 - 60 * 60 * 1000;
    const key = `${primary.object}:${primary.field}`;

    const result = await fieldAggregates(client, {
      tags: [{ object: primary.object, field: primary.field, functions: ['avg'] }],
      timestamps: [t0, t1, t2],
    });

    const firstPeriod = result.values[String(t1)]?.[key];
    const secondPeriod = result.values[String(t2)]?.[key];
    if (
      firstPeriod &&
      secondPeriod &&
      hasOwnProperty(firstPeriod, 'avg') &&
      hasOwnProperty(secondPeriod, 'avg') &&
      isAggregateValue(firstPeriod.avg) &&
      isAggregateValue(secondPeriod.avg)
    ) {
      console.log('PASS Test 7\n');
      passed += 1;
    } else {
      console.log('FAIL Test 7: expected both period-end timestamp keys with avg values\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 7: ${String(error)}\n`);
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
