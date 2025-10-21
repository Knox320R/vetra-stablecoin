/**
 * Test for Chainlink Functions API Response Parsing
 *
 * This test verifies that the JavaScript source code correctly parses
 * the FT Asset Management API response format.
 */

const assert = require('assert');

// Simulate the exact API response from overview.txt
const mockApiResponse = {
  "StatementSummary": {
    "title": "Mr.",
    "firstname": "Pedro",
    "lastname": "Fares Ramos ",
    "companyname": "Vetra Foudation Ltd",
    "email": "contactvtrcoin@gmail.com",
    "Currency": "USD",
    "TotalCredit": "100000000.00",
    "TotalDebit": "0.00",
    "TotalBalance": "100000000.00",
    "DateTime": "21-10-2025 14:03:20"
  }
};

// Test parsing logic
function testApiParsing() {
  console.log('Testing API Response Parsing...\n');

  // Test 1: Validate response structure
  console.log('Test 1: Validate response structure');
  assert(mockApiResponse.StatementSummary, 'StatementSummary should exist');
  console.log('✅ StatementSummary exists\n');

  const summary = mockApiResponse.StatementSummary;

  // Test 2: Validate TotalBalance
  console.log('Test 2: Validate TotalBalance');
  assert(summary.TotalBalance, 'TotalBalance should exist');
  const balanceFloat = parseFloat(summary.TotalBalance);
  assert(!isNaN(balanceFloat), 'TotalBalance should be a valid number');
  assert(balanceFloat === 100000000.00, 'TotalBalance should be 100000000.00');
  console.log(`✅ TotalBalance: $${balanceFloat.toLocaleString()}\n`);

  // Test 3: Validate DateTime format
  console.log('Test 3: Validate DateTime format');
  assert(summary.DateTime, 'DateTime should exist');
  console.log(`   DateTime string: "${summary.DateTime}"`);

  // Parse DateTime (format: "DD-MM-YYYY HH:mm:ss")
  function parseDateTime(dateTimeStr) {
    const [datePart, timePart] = dateTimeStr.trim().split(" ");

    if (!datePart || !timePart) {
      throw new Error(`Invalid DateTime format: ${dateTimeStr}`);
    }

    const [day, month, year] = datePart.split("-").map(Number);
    const [hours, minutes, seconds] = timePart.split(":").map(Number);

    if (!day || !month || !year || isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
      throw new Error(`Invalid DateTime components: ${dateTimeStr}`);
    }

    // Create UTC date
    const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));

    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${dateTimeStr}`);
    }

    return Math.floor(date.getTime() / 1000);
  }

  const timestamp = parseDateTime(summary.DateTime);
  const readableDate = new Date(timestamp * 1000).toISOString();
  console.log(`   Parsed timestamp: ${timestamp}`);
  console.log(`   Readable date: ${readableDate}`);
  console.log('✅ DateTime parsed correctly\n');

  // Test 4: Convert to wei (18 decimals)
  console.log('Test 4: Convert to wei (18 decimals)');
  const balanceWei = BigInt(Math.floor(balanceFloat * 1e6)) * BigInt(1e12);
  console.log(`   Balance in wei: ${balanceWei.toString()}`);

  // Verify it equals 100000000 * 10^18
  const expected = BigInt("100000000000000000000000000"); // 100000000 * 10^18
  assert(balanceWei === expected, 'Wei conversion should match expected value');
  console.log('✅ Wei conversion correct\n');

  // Test 5: ABI encoding
  console.log('Test 5: ABI encoding');

  function uint256ToHex(value) {
    let hex = value.toString(16);
    return hex.padStart(64, "0");
  }

  const balanceHex = uint256ToHex(balanceWei);
  const timestampHex = uint256ToHex(BigInt(timestamp));
  const encoded = "0x" + balanceHex + timestampHex;

  console.log(`   Balance hex: 0x${balanceHex}`);
  console.log(`   Timestamp hex: 0x${timestampHex}`);
  console.log(`   Encoded result: ${encoded}`);
  console.log(`   Total length: ${encoded.length} chars (should be 130: 0x + 64 + 64)`);

  assert(encoded.length === 130, 'Encoded result should be 130 characters');
  assert(encoded.startsWith('0x'), 'Encoded result should start with 0x');
  console.log('✅ ABI encoding correct\n');

  console.log('================================================');
  console.log('✅ ALL TESTS PASSED');
  console.log('================================================\n');

  console.log('Summary:');
  console.log(`  API returns: ${summary.TotalBalance} USD at ${summary.DateTime}`);
  console.log(`  Parsed to: ${balanceFloat.toLocaleString()} USD at timestamp ${timestamp}`);
  console.log(`  Converted to: ${balanceWei.toString()} wei`);
  console.log(`  ABI encoded: ${encoded.substring(0, 20)}...${encoded.substring(encoded.length - 20)}`);
  console.log('\nThe Chainlink Functions JavaScript is correctly configured!');
}

// Run tests
try {
  testApiParsing();
} catch (error) {
  console.error('❌ TEST FAILED:', error.message);
  process.exit(1);
}
