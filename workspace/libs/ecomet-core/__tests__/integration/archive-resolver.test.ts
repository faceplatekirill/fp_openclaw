import { EcometClient, readArchives, resolveArchives } from '../../dist/index.js';

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
  const probes = ['.name', '.pattern', '.folder', '__TASK_007_UNRESOLVED_FIELD__'];

  for (const field of probes) {
    const result = await resolveArchives(client, {
      tags: [{ object: objectPath, field }],
    });
    const key = `${objectPath}:${field}`;
    if (!result.resolved[key] && result.unresolved.includes(key) && !result.invalid.includes(objectPath)) {
      return field;
    }
  }

  throw new Error(`Could not find a reliably unresolved field for object '${objectPath}'.`);
}

function selectDistinctObjectCandidates(candidates: ArchiveCandidate[]): ArchiveCandidate[] {
  const selected: ArchiveCandidate[] = [];
  const seenObjects = new Set<string>();

  for (const candidate of candidates) {
    if (seenObjects.has(candidate.object)) {
      continue;
    }

    selected.push(candidate);
    seenObjects.add(candidate.object);
    if (selected.length === REQUIRED_OBJECTS) {
      break;
    }
  }

  return selected;
}

async function runIntegrationTests() {
  console.log('\nArchive Resolver Integration Tests\n');

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

  console.log('Test 1: Single object+field with archive resolves to non-empty archive path');
  try {
    const result = await resolveArchives(client, {
      tags: [{ object: primary.object, field: primary.field }],
    });
    const key = `${primary.object}:${primary.field}`;
    const path = result.resolved[key];

    if (typeof path === 'string' && path.length > 0) {
      console.log('PASS Test 1\n');
      passed += 1;
    } else {
      console.log('FAIL Test 1: expected resolved key with non-empty archive path\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 1: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 2: Single object with one resolved and one unresolved field');
  try {
    const result = await resolveArchives(client, {
      tags: [
        { object: primary.object, field: primary.field },
        { object: primary.object, field: unresolvedField },
      ],
    });

    const resolvedKey = `${primary.object}:${primary.field}`;
    const unresolvedKey = `${primary.object}:${unresolvedField}`;
    const hasResolved =
      typeof result.resolved[resolvedKey] === 'string' && result.resolved[resolvedKey].length > 0;
    const hasUnresolved = result.unresolved.includes(unresolvedKey);
    const hasNoInvalid = !result.invalid.includes(primary.object);

    if (hasResolved && hasUnresolved && hasNoInvalid) {
      console.log('PASS Test 2\n');
      passed += 1;
    } else {
      console.log('FAIL Test 2: expected resolved/unresolved split for one object\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 2: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 3: Multiple objects batch resolution');
  try {
    const batch = selectDistinctObjectCandidates(candidates);
    if (batch.length < 2) {
      throw new Error('Need at least two distinct objects for batch test.');
    }

    const tags = batch.map((candidate) => ({ object: candidate.object, field: candidate.field }));
    const result = await resolveArchives(client, { tags });
    const allResolved = batch.every((candidate) => {
      const key = `${candidate.object}:${candidate.field}`;
      return typeof result.resolved[key] === 'string' && result.resolved[key].length > 0;
    });

    if (allResolved) {
      console.log(`PASS Test 3: resolved ${batch.length} object(s)\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 3: expected all batch tags to resolve\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 3: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 4: Invalid object path is reported in invalid');
  try {
    const invalidObject = `/root/FP/PROJECT/__TASK_007_INVALID_${Date.now()}__`;
    const result = await resolveArchives(client, {
      tags: [{ object: invalidObject, field: 'value' }],
    });
    const isInvalid = result.invalid.includes(invalidObject);
    const emptyResolved = Object.keys(result.resolved).length === 0;
    const emptyUnresolved = result.unresolved.length === 0;

    if (isInvalid && emptyResolved && emptyUnresolved) {
      console.log('PASS Test 4\n');
      passed += 1;
    } else {
      console.log('FAIL Test 4: expected invalid path in invalid list only\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 4: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 5: Valid object with no archive field appears in unresolved');
  try {
    const result = await resolveArchives(client, {
      tags: [{ object: primary.object, field: unresolvedField }],
    });
    const key = `${primary.object}:${unresolvedField}`;
    const isUnresolved = result.unresolved.includes(key);
    const isResolved = hasOwnProperty(result.resolved, key);
    const isInvalid = result.invalid.includes(primary.object);

    if (isUnresolved && !isResolved && !isInvalid) {
      console.log('PASS Test 5\n');
      passed += 1;
    } else {
      console.log('FAIL Test 5: expected unresolved only for valid object field without archive\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 5: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 6: Round-trip resolve -> readArchives uses valid archive path');
  try {
    const resolved = await resolveArchives(client, {
      tags: [{ object: primary.object, field: primary.field }],
    });
    const key = `${primary.object}:${primary.field}`;
    const archivePath = resolved.resolved[key];
    if (typeof archivePath !== 'string' || archivePath.length === 0) {
      throw new Error('Resolver did not return an archive path for round-trip test.');
    }

    const to = Date.now();
    const from = to - PROBE_WINDOW_MS;
    const readResult = await readArchives(client, {
      archives: [archivePath],
      from,
      to,
    });
    const hasSeries = hasOwnProperty(readResult, archivePath) && Array.isArray(readResult[archivePath]);

    if (hasSeries) {
      console.log('PASS Test 6\n');
      passed += 1;
    } else {
      console.log('FAIL Test 6: resolved archive path was not readable via readArchives\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 6: ${String(error)}\n`);
    failed += 1;
  }

  await client.close();

  console.log(`Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

runIntegrationTests().catch(async (error) => {
  console.error('Integration test suite error:', error);
  process.exit(1);
});
