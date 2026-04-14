import assert from 'assert';
import { EcometClient, fieldReadHistory, readArchives, resolveArchives } from '../../dist/index.js';

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
  const probes = ['.name', '.pattern', '.folder', '__TASK_008_UNRESOLVED_FIELD__'];

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

async function runIntegrationTests() {
  console.log('\nField Read History Integration Tests\n');

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
  const to = Date.now();
  const from = to - PROBE_WINDOW_MS;

  let unresolvedField = '';
  try {
    unresolvedField = await findUnresolvedField(client, primary.object);
  } catch (error) {
    console.log(`FAIL Setup: ${String(error)}\n`);
    await client.close();
    process.exit(1);
  }

  console.log('Test 1: Single tag with data returns array in values');
  try {
    const result = await fieldReadHistory(client, {
      tags: [{ object: primary.object, field: primary.field }],
      from,
      to,
    });
    const key = `${primary.object}:${primary.field}`;
    const series = result.values[key];

    if (
      Array.isArray(series) &&
      result.invalid.length === 0 &&
      result.unresolved.length === 0
    ) {
      console.log(`PASS Test 1: points=${series.length}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 1: expected resolved series in values with empty invalid/unresolved\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 1: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 2: Multiple tags return object:field keys under values');
  try {
    const result = await fieldReadHistory(client, {
      tags: candidates.map((candidate) => ({ object: candidate.object, field: candidate.field })),
      from,
      to,
    });

    const allPresent = candidates.every((candidate) => {
      const key = `${candidate.object}:${candidate.field}`;
      return hasOwnProperty(result.values, key) && Array.isArray(result.values[key]);
    });

    if (allPresent && result.invalid.length === 0 && result.unresolved.length === 0) {
      console.log(`PASS Test 2: validated ${candidates.length} key(s)\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 2: expected all keys in values with empty invalid/unresolved\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 2: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 3: Unresolved field appears in unresolved');
  try {
    const result = await fieldReadHistory(client, {
      tags: [{ object: primary.object, field: unresolvedField }],
      from,
      to,
    });
    const key = `${primary.object}:${unresolvedField}`;
    if (
      result.unresolved.includes(key) &&
      !hasOwnProperty(result.values, key) &&
      result.invalid.length === 0
    ) {
      console.log('PASS Test 3\n');
      passed += 1;
    } else {
      console.log('FAIL Test 3: expected key in unresolved only\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 3: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 4: Invalid object appears in invalid');
  try {
    const invalidObject = `/root/FP/PROJECT/__TASK_012_INVALID_${Date.now()}__`;
    const result = await fieldReadHistory(client, {
      tags: [{ object: invalidObject, field: 'value' }],
      from,
      to,
    });
    const key = `${invalidObject}:value`;

    if (
      result.invalid.includes(key) &&
      !hasOwnProperty(result.values, key) &&
      result.unresolved.length === 0
    ) {
      console.log('PASS Test 4\n');
      passed += 1;
    } else {
      console.log('FAIL Test 4: expected key in invalid only\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 4: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 5: Mixed resolved and unresolved tags split values/unresolved');
  try {
    const resolvedKey = `${primary.object}:${primary.field}`;
    const unresolvedKey = `${primary.object}:${unresolvedField}`;

    const result = await fieldReadHistory(client, {
      tags: [
        { object: primary.object, field: primary.field },
        { object: primary.object, field: unresolvedField },
      ],
      from,
      to,
    });

    if (
      Array.isArray(result.values[resolvedKey]) &&
      result.unresolved.includes(unresolvedKey) &&
      result.invalid.length === 0
    ) {
      console.log('PASS Test 5\n');
      passed += 1;
    } else {
      console.log('FAIL Test 5: expected resolved in values and unresolved key in unresolved\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 5: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 6: Round-trip consistency with resolveArchives + readArchives');
  try {
    const key = `${primary.object}:${primary.field}`;

    const historyResult = await fieldReadHistory(client, {
      tags: [{ object: primary.object, field: primary.field }],
      from,
      to,
    });
    const resolveResult = await resolveArchives(client, {
      tags: [{ object: primary.object, field: primary.field }],
    });
    const archivePath = resolveResult.resolved[key];

    if (typeof archivePath !== 'string' || archivePath.length === 0) {
      throw new Error('Primary candidate did not resolve to an archive path.');
    }

    const readResult = await readArchives(client, {
      archives: [archivePath],
      from,
      to,
    });
    const expectedSeries = Array.isArray(readResult[archivePath]) ? readResult[archivePath] : [];
    assert.deepStrictEqual(historyResult.values[key], expectedSeries);

    console.log(`PASS Test 6: points=${expectedSeries.length}\n`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL Test 6: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 7: Mixed resolved, unresolved, and invalid split correctly');
  try {
    const resolvedKey = `${primary.object}:${primary.field}`;
    const unresolvedKey = `${primary.object}:${unresolvedField}`;
    const invalidObject = `/root/FP/PROJECT/__TASK_012_MIXED_INVALID_${Date.now()}__`;
    const invalidKey = `${invalidObject}:value`;

    const result = await fieldReadHistory(client, {
      tags: [
        { object: primary.object, field: primary.field },
        { object: primary.object, field: unresolvedField },
        { object: invalidObject, field: 'value' },
      ],
      from,
      to,
    });

    if (
      Array.isArray(result.values[resolvedKey]) &&
      result.unresolved.includes(unresolvedKey) &&
      result.invalid.includes(invalidKey)
    ) {
      console.log('PASS Test 7\n');
      passed += 1;
    } else {
      console.log('FAIL Test 7: expected keys in values/unresolved/invalid buckets\n');
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
