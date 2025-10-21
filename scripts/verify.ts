import { run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Verification script for Vetra contracts on Polygonscan
 *
 * Reads deployment addresses from deployments/{network}.json
 * and verifies all contracts on Polygonscan
 */

async function main() {
  console.log("\n==================================================");
  console.log("🔍 Verifying Contracts on Polygonscan");
  console.log("==================================================\n");

  const chainId = (await require("hardhat").ethers.provider.getNetwork()).chainId;

  // Load deployment addresses
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const filename = `${network.name}-${chainId}.json`;
  const filepath = path.join(deploymentsDir, filename);

  if (!fs.existsSync(filepath)) {
    throw new Error(`Deployment file not found: ${filepath}`);
  }

  const deployment = JSON.parse(fs.readFileSync(filepath, "utf8"));

  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${chainId}`);
  console.log(`Loaded deployment from: ${filepath}\n`);

  // Verify Vetra Implementation
  console.log("📝 Verifying Vetra implementation...");
  try {
    await run("verify:verify", {
      address: deployment.vetraImplementation,
      constructorArguments: [],
    });
    console.log(`✅ Vetra implementation verified\n`);
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log(`✅ Vetra implementation already verified\n`);
    } else {
      console.error(`❌ Error verifying Vetra implementation:`, error.message);
    }
  }

  // Verify Vetra Proxy
  console.log("📝 Verifying Vetra proxy...");
  try {
    await run("verify:verify", {
      address: deployment.vetra,
      constructorArguments: [],
    });
    console.log(`✅ Vetra proxy verified\n`);
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log(`✅ Vetra proxy already verified\n`);
    } else {
      console.error(`❌ Error verifying Vetra proxy:`, error.message);
    }
  }

  // Verify ReserveOracle Implementation
  console.log("📝 Verifying ReserveOracle implementation...");
  try {
    await run("verify:verify", {
      address: deployment.reserveOracleImplementation,
      constructorArguments: [],
    });
    console.log(`✅ ReserveOracle implementation verified\n`);
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log(`✅ ReserveOracle implementation already verified\n`);
    } else {
      console.error(`❌ Error verifying ReserveOracle implementation:`, error.message);
    }
  }

  // Verify ReserveOracle Proxy
  console.log("📝 Verifying ReserveOracle proxy...");
  try {
    await run("verify:verify", {
      address: deployment.reserveOracle,
      constructorArguments: [],
    });
    console.log(`✅ ReserveOracle proxy verified\n`);
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log(`✅ ReserveOracle proxy already verified\n`);
    } else {
      console.error(`❌ Error verifying ReserveOracle proxy:`, error.message);
    }
  }

  console.log("==================================================");
  console.log("✅ Verification Complete!");
  console.log("==================================================\n");

  console.log("View on Polygonscan:");
  const explorerBase =
    chainId === 137n
      ? "https://polygonscan.com"
      : "https://amoy.polygonscan.com";

  console.log(`  Vetra: ${explorerBase}/address/${deployment.vetra}#code`);
  console.log(`  ReserveOracle: ${explorerBase}/address/${deployment.reserveOracle}#code`);
  console.log(`  FunctionsConsumer: ${explorerBase}/address/${deployment.functionsConsumer}#code`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
