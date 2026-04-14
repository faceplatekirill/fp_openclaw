import { EcometClient, queryAlarms } from '../../dist/index.js';

const ECOMET_HOSTS = (process.env.ECOMET_HOSTS ?? '10.210.2.20:9000,10.210.2.19:9000').split(',');
const ECOMET_LOGIN = process.env.ECOMET_LOGIN ?? 'ai_assistant';
const ECOMET_PASSWORD = process.env.ECOMET_PASSWORD ?? 'ai_assistant';

const DAY_MS = 24 * 60 * 60 * 1000;

function isSortedByDtOnAsc(alarms: Record<string, unknown>[]): boolean {
  for (let index = 1; index < alarms.length; index += 1) {
    const prev = alarms[index - 1]?.dt_on;
    const current = alarms[index]?.dt_on;
    if (typeof prev !== 'number' || typeof current !== 'number') {
      continue;
    }
    if (current < prev) {
      return false;
    }
  }
  return true;
}

async function runIntegrationTests() {
  console.log('\nAlarm Query Integration Tests\n');

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

  const now = Date.now();
  const last24hFrom = now - DAY_MS;
  const last7dFrom = now - 7 * DAY_MS;

  console.log('Test 1: Recent alarms in last 24 hours');
  try {
    const result = await queryAlarms(client, {
      time_from: last24hFrom,
      time_to: now,
      select: ['dt_on', 'text', 'active', 'acknowledged', 'point'],
      limit: 20,
    });

    if (
      typeof result.total === 'number' &&
      Array.isArray(result.alarms) &&
      isSortedByDtOnAsc(result.alarms)
    ) {
      console.log(`PASS Test 1: total=${result.total}, alarms=${result.alarms.length}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 1: invalid result shape or ordering\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 1: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 2: Active alarms filter');
  try {
    const result = await queryAlarms(client, {
      time_from: last7dFrom,
      time_to: now,
      active: true,
      select: ['dt_on', 'active', 'text'],
      limit: 50,
    });

    const allActive = result.alarms.every((alarm) => alarm.active === true);
    if (allActive) {
      console.log(`PASS Test 2: total=${result.total}, alarms=${result.alarms.length}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 2: found non-active alarms in active=true query\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 2: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 3: Text search on alarm text');
  try {
    const result = await queryAlarms(client, {
      time_from: last7dFrom,
      time_to: now,
      search: { text: 'trip', in: ['text'] },
      select: ['dt_on', 'text'],
      limit: 20,
    });

    const allMatch = result.alarms.every((alarm) => {
      const text = alarm.text;
      return typeof text === 'string' ? text.toLowerCase().includes('trip') : false;
    });

    if (allMatch) {
      console.log(`PASS Test 3: total=${result.total}, alarms=${result.alarms.length}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 3: search result contains non-matching text values\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 3: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 4: Pagination limit');
  try {
    const result = await queryAlarms(client, {
      time_from: last24hFrom,
      time_to: now,
      select: ['dt_on', 'text'],
      limit: 5,
      offset: 0,
    });

    if (result.alarms.length <= 5 && result.total >= result.alarms.length) {
      console.log(`PASS Test 4: total=${result.total}, page_size=${result.alarms.length}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 4: pagination size/total invariants violated\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 4: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 5: Empty result with impossible filter');
  try {
    const result = await queryAlarms(client, {
      time_from: last7dFrom,
      time_to: now,
      fields: { fact: 'NONEXISTENT_999' },
      select: ['dt_on', 'fact', 'text'],
      limit: 20,
    });

    if (result.total === 0 && result.alarms.length === 0) {
      console.log('PASS Test 5\n');
      passed += 1;
    } else {
      console.log('FAIL Test 5: expected empty result for impossible filter\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 5: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 6: Unacknowledged alarms filter');
  try {
    const result = await queryAlarms(client, {
      time_from: last7dFrom,
      time_to: now,
      acknowledged: false,
      select: ['dt_on', 'acknowledged', 'text'],
      limit: 50,
    });

    const allUnacknowledged = result.alarms.every((alarm) => alarm.acknowledged === false);
    if (allUnacknowledged) {
      console.log(`PASS Test 6: total=${result.total}, alarms=${result.alarms.length}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 6: found acknowledged alarms in acknowledged=false query\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 6: ${String(error)}\n`);
    failed += 1;
  }

  console.log('Test 7: Ordering by dt_on ascending');
  try {
    const result = await queryAlarms(client, {
      time_from: last24hFrom,
      time_to: now,
      select: ['dt_on', 'text'],
      limit: 100,
    });

    if (isSortedByDtOnAsc(result.alarms)) {
      console.log(`PASS Test 7: alarms=${result.alarms.length}\n`);
      passed += 1;
    } else {
      console.log('FAIL Test 7: alarms are not sorted by dt_on ascending\n');
      failed += 1;
    }
  } catch (error) {
    console.log(`FAIL Test 7: ${String(error)}\n`);
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
