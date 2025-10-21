import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Monitoring script for Vetra stablecoin system
 *
 * Monitors:
 * - Reserve backing invariant (totalSupply <= reserveBalance)
 * - Reserve data staleness (TTL enforcement)
 * - Nonce progression
 */

interface MonitoringMetrics {
  timestamp: string;
  totalSupply: string;
  reserveBalance: string;
  backingRatio: number;
  isFullyBacked: boolean;
  isDataValid: boolean;
  dataAge: number;
  lastNonce: number;
  paused: boolean;
}

function loadDeployment(network: string, chainId: bigint): any {
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const filename = `${network}-${chainId}.json`;
  const filepath = path.join(deploymentsDir, filename);

  if (!fs.existsSync(filepath)) {
    throw new Error(`Deployment file not found: ${filepath}`);
  }

  return JSON.parse(fs.readFileSync(filepath, "utf8"));
}

async function checkInvariants(): Promise<MonitoringMetrics> {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const deployment = loadDeployment(network.name, chainId);

  const vetra = await ethers.getContractAt("Vetra", deployment.vetra);
  const oracle = await ethers.getContractAt("ReserveOracle", deployment.reserveOracle);

  // Get current state
  const totalSupply = await vetra.totalSupply();
  const paused = await vetra.paused();

  const [reserveBalance, timestamp, nonce, isValid] = await oracle.getReserveData();
  const dataAge = await oracle.getDataAge();
  const [isFullyBacked, ratio] = await oracle.checkReserveBacking(totalSupply);

  return {
    timestamp: new Date().toISOString(),
    totalSupply: ethers.formatEther(totalSupply),
    reserveBalance: ethers.formatEther(reserveBalance),
    backingRatio: Number(ratio) / 100,
    isFullyBacked,
    isDataValid: isValid,
    dataAge: Number(dataAge),
    lastNonce: Number(nonce),
    paused,
  };
}

async function main() {
  console.log("\n==================================================");
  console.log("🔍 Vetra System Monitoring");
  console.log("==================================================\n");

  console.log(`Network: ${network.name}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const metrics = await checkInvariants();

  // Display metrics
  console.log("📊 Current Metrics:");
  console.log(`  Total Supply:    ${metrics.totalSupply} VTR`);
  console.log(`  Reserve Balance: $${metrics.reserveBalance} USD`);
  console.log(`  Backing Ratio:   ${metrics.backingRatio.toFixed(2)}%`);
  console.log(`  Fully Backed:    ${metrics.isFullyBacked ? "✅ Yes" : "❌ No"}`);
  console.log(`  Contract Paused: ${metrics.paused ? "⚠️  Yes" : "No"}\n`);

  console.log("🕐 Reserve Data Freshness:");
  console.log(`  Data Valid:      ${metrics.isDataValid ? "✅ Yes" : "❌ No (stale)"}`);
  console.log(`  Data Age:        ${metrics.dataAge} seconds`);
  console.log(`  Last Nonce:      ${metrics.lastNonce}\n`);

  // Check invariants
  console.log("✅ Invariant Checks:");

  const checks = [];

  // Check 1: Full backing
  if (metrics.isFullyBacked) {
    console.log(`  ✅ Backing Invariant: Reserves >= Supply`);
    checks.push(true);
  } else {
    console.log(`  ❌ Backing Invariant: VIOLATION! Reserves < Supply`);
    console.log(`     Reserve deficit: $${(parseFloat(metrics.totalSupply) - parseFloat(metrics.reserveBalance)).toFixed(2)}`);
    checks.push(false);
  }

  // Check 2: Data freshness
  if (metrics.isDataValid) {
    console.log(`  ✅ Freshness Invariant: Reserve data is valid`);
    checks.push(true);
  } else {
    console.log(`  ❌ Freshness Invariant: VIOLATION! Reserve data is stale`);
    console.log(`     Data age: ${metrics.dataAge} seconds`);
    checks.push(false);
  }

  // Check 3: Nonce progression
  if (metrics.lastNonce > 0) {
    console.log(`  ✅ Nonce Progression: ${metrics.lastNonce} updates received`);
    checks.push(true);
  } else {
    console.log(`  ⚠️  No updates received yet`);
    checks.push(true); // Not a failure, just informational
  }

  const allPassed = checks.every((c) => c);

  console.log("\n==================================================");
  if (allPassed) {
    console.log("✅ All invariants satisfied");
  } else {
    console.log("❌ CRITICAL: Invariant violations detected!");
    console.log("   Review system state immediately.");
  }
  console.log("==================================================\n");

  // Save metrics to file
  const metricsDir = path.join(__dirname, "..", "metrics");
  if (!fs.existsSync(metricsDir)) {
    fs.mkdirSync(metricsDir, { recursive: true });
  }

  const metricsFile = path.join(metricsDir, `${network.name}-latest.json`);
  fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));

  console.log(`Metrics saved to: ${metricsFile}`);

  // Exit with error code if invariants violated
  if (!allPassed) {
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
