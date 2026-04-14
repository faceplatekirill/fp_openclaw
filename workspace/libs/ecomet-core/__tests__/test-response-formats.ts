/**
 * Test Ecomet Response Formats
 * 
 * Check difference between paginated and non-paginated queries
 */

import { EcometClient } from '../dist/index.js';

async function testResponseFormats() {
  console.log('\n🔍 Testing Ecomet Response Formats\n');
  
  const client = new EcometClient({
    hosts: ['10.210.2.20:9000'],
    login: 'ai_assistant',
    password: 'ai_assistant'
  }, {
    info: (msg: string) => console.log(`  ℹ️  ${msg}`)
  });
  
  await client.connect();
  
  // Test 1: Non-paginated query (lightweight - get single object)
  console.log('Test 1: Non-paginated query (single object by OID)');
  try {
    const statement1 = "get .name, .oid from 'project' where .oid = $oid('/root/.patterns/alarm') format $to_json";
    const result1 = await client.query(statement1);
    
    console.log('  Response type:', typeof result1);
    console.log('  Is array:', Array.isArray(result1));
    console.log('  Response:', JSON.stringify(result1, null, 2).substring(0, 500));
    console.log('');
  } catch (error) {
    console.log('  Error:', error);
    console.log('');
  }
  
  // Test 2: Paginated query
  console.log('Test 2: Paginated query');
  try {
    const statement2 = "get text, point from 'archive' where .pattern = $oid('/root/.patterns/alarm') page 1:3 format $to_json";
    const result2 = await client.query(statement2);
    
    console.log('  Response type:', typeof result2);
    console.log('  Is array:', Array.isArray(result2));
    if (typeof result2 === 'object' && result2 !== null) {
      console.log('  Has count:', 'count' in result2);
      console.log('  Has result:', 'result' in result2);
    }
    console.log('  Response:', JSON.stringify(result2, null, 2).substring(0, 500));
    console.log('');
  } catch (error) {
    console.log('  Error:', error);
    console.log('');
  }
  
  // Test 3: Non-paginated query with multiple results (careful - use limit in WHERE)
  console.log('Test 3: Non-paginated query with and() limit');
  try {
    const now = Date.now();
    const tenMinAgo = now - 10 * 60 * 1000;
    const statement3 = `get text, point from 'archive' where and(.pattern = $oid('/root/.patterns/alarm'), dt_on[${tenMinAgo}:${now}]) format $to_json`;
    const result3 = await client.query(statement3);
    
    console.log('  Response type:', typeof result3);
    console.log('  Is array:', Array.isArray(result3));
    if (Array.isArray(result3)) {
      console.log('  Array length:', result3.length);
      console.log('  First element type:', typeof result3[0]);
    }
    console.log('  Response preview:', JSON.stringify(result3, null, 2).substring(0, 500));
    console.log('');
  } catch (error) {
    console.log('  Error:', error);
    console.log('');
  }
  
  await client.close();
}

testResponseFormats()
  .then(() => {
    console.log('✅ Tests complete\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
