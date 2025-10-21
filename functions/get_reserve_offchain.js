/**
 * Chainlink Functions - Proof-of-Reserves Offchain Script
 *
 * This script fetches the reserve balance from FT Asset Management's API
 * and returns the data in a format suitable for on-chain validation.
 *
 * API: https://my.ftassetmanagement.com/api/bcl.asp
 * Expected Response:
 * {
 *   "StatementSummary": {
 *     "TotalBalance": "100000000.00",
 *     "DateTime": "21-10-2025 14:03:20",
 *     ...other fields
 *   }
 * }
 *
 * Returns: ABI-encoded (uint256 balanceUSD, uint256 timestamp)
 */

// API endpoint from environment/secrets
// In production, these would be set via Chainlink Functions secrets
const API_URL = "https://my.ftassetmanagement.com/api/bcl.asp";
const API_PARAMS = {
  KeyCodeGUID: "f9132e91-d810-11ef-a3af-00155d010b18",
  AccountGUID: "d2e45a89-7de0-11f0-8b61-00155d010b18",
  AccountNr: "42528"
};

// Build query string
const queryString = Object.keys(API_PARAMS)
  .map(key => `${key}=${API_PARAMS[key]}`)
  .join("&");

const fullURL = `${API_URL}?${queryString}`;

// Make HTTP request
const apiRequest = Functions.makeHttpRequest({
  url: fullURL,
  method: "GET",
  timeout: 9000, // 9 seconds
});

// Wait for response
const apiResponse = await apiRequest;

// Check for errors
if (apiResponse.error) {
  throw new Error(`API request failed: ${apiResponse.error}`);
}

if (!apiResponse.data) {
  throw new Error("No data returned from API");
}

// Parse response
const data = apiResponse.data;

// Validate response structure
if (!data.StatementSummary) {
  throw new Error("Invalid response: missing StatementSummary");
}

const summary = data.StatementSummary;

if (!summary.TotalBalance) {
  throw new Error("Invalid response: missing TotalBalance");
}

if (!summary.DateTime) {
  throw new Error("Invalid response: missing DateTime");
}

// Parse TotalBalance (string like "100000000.00" to wei with 18 decimals)
const balanceFloat = parseFloat(summary.TotalBalance);
if (isNaN(balanceFloat) || balanceFloat < 0) {
  throw new Error(`Invalid TotalBalance: ${summary.TotalBalance}`);
}

// Convert to wei (18 decimals): multiply by 10^18
// JavaScript can't handle numbers this large natively, so we use BigInt
const balanceWei = BigInt(Math.floor(balanceFloat * 1e6)) * BigInt(1e12);

// Parse DateTime (format: "DD-MM-YYYY HH:mm:ss")
// Example: "21-10-2025 14:03:20"
function parseDateTime(dateTimeStr) {
  const [datePart, timePart] = dateTimeStr.trim().split(" ");

  if (!datePart || !timePart) {
    throw new Error(`Invalid DateTime format: ${dateTimeStr}`);
  }

  const [day, month, year] = datePart.split("-").map(Number);
  const [hours, minutes, seconds] = timePart.split(":").map(Number);

  // Validate components
  if (!day || !month || !year || isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
    throw new Error(`Invalid DateTime components: ${dateTimeStr}`);
  }

  // Create UTC date
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateTimeStr}`);
  }

  // Return Unix timestamp (seconds since epoch)
  return Math.floor(date.getTime() / 1000);
}

const timestamp = parseDateTime(summary.DateTime);

// Validate timestamp is not in the future
const now = Math.floor(Date.now() / 1000);
if (timestamp > now + 60) { // Allow 60 seconds clock skew
  throw new Error(`Timestamp is in the future: ${timestamp} > ${now}`);
}

// Validate timestamp is not too old (15 minutes TTL)
const maxAge = 15 * 60; // 15 minutes
if (now - timestamp > maxAge) {
  throw new Error(`Data is too stale: ${now - timestamp} seconds old (max: ${maxAge})`);
}

// Encode response as bytes
// Solidity: abi.encode(uint256 balanceUSD, uint256 timestamp)
// We need to return both values as 32-byte hex strings

function uint256ToHex(value) {
  // Convert BigInt to hex, pad to 32 bytes (64 hex chars)
  let hex = value.toString(16);
  return hex.padStart(64, "0");
}

const balanceHex = uint256ToHex(balanceWei);
const timestampHex = uint256ToHex(BigInt(timestamp));

// Concatenate for ABI encoding (balance first, then timestamp)
const encoded = balanceHex + timestampHex;

// Return as bytes (Chainlink Functions expects hex string with 0x prefix)
return "0x" + encoded;
