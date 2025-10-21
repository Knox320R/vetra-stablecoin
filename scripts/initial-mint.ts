import { ethers, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Initial Mint Script
 *
 * This script performs the initial minting of VTR tokens to match the reserve balance.
 * It reads the current reserve from ReserveOracle and mints an equivalent amount of VTR.
 *
 * Prerequisites:
 * 1. Contracts must be deployed (run deploy.ts first)
 * 2. ReserveOracle must have been updated with current reserve data
 * 3. Signer must have MINTER_ROLE on Vetra contract
 *
 * Usage:
 *   npx hardhat run scripts/initial-mint.ts --network amoy
 *   npx hardhat run scripts/initial-mint.ts --network polygon
 */

interface DeploymentAddresses {
  vetra: {
    proxy: string;
    implementation: string;
  };
  reserveOracle: {
    proxy: string;
    implementation: string;
  };
  vetraFunctionsConsumer?: string;
}

async function main() {
  console.log("\n=== Vetra Initial Mint Script ===\n");

  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log(`Network: ${network.name} (chainId: ${network.chainId})`);
  console.log(`Signer: ${signer.address}`);
  console.log(`Signer balance: ${ethers.formatEther(await ethers.provider.getBalance(signer.address))} MATIC\n`);

  // Load deployment addresses
  const deploymentFile = path.join(__dirname, `../deployments/${network.name}-${network.chainId}.json`);

  if (!fs.existsSync(deploymentFile)) {
    throw new Error(
      `Deployment file not found: ${deploymentFile}\n` +
      `Please run deployment script first: npx hardhat run scripts/deploy.ts --network ${network.name}`
    );
  }

  const deployment: DeploymentAddresses = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  console.log(`Loaded deployment addresses from: ${deploymentFile}\n`);

  // Get contract instances
  console.log("Loading contract instances...");
  const Vetra = await ethers.getContractFactory("Vetra");
  const ReserveOracle = await ethers.getContractFactory("ReserveOracle");

  const vetra = Vetra.attach(deployment.vetra.proxy);
  const reserveOracle = ReserveOracle.attach(deployment.reserveOracle.proxy);

  console.log(`Vetra proxy: ${await vetra.getAddress()}`);
  console.log(`ReserveOracle proxy: ${await reserveOracle.getAddress()}\n`);

  // Check if signer has MINTER_ROLE
  const MINTER_ROLE = await vetra.MINTER_ROLE();
  const hasMinterRole = await vetra.hasRole(MINTER_ROLE, signer.address);

  if (!hasMinterRole) {
    throw new Error(
      `Signer ${signer.address} does not have MINTER_ROLE\n` +
      `Please grant the role using: npx hardhat grant-role --role MINTER --account ${signer.address} --network ${network.name}`
    );
  }
  console.log(`✓ Signer has MINTER_ROLE\n`);

  // Check if contract is paused
  const isPaused = await vetra.paused();
  if (isPaused) {
    throw new Error(
      `Vetra contract is paused. Cannot mint tokens.\n` +
      `Unpause first using: npx hardhat unpause --network ${network.name}`
    );
  }
  console.log(`✓ Vetra contract is not paused\n`);

  // Get current reserve data
  console.log("Reading reserve data from ReserveOracle...");
  const reserveBalanceUSD = await reserveOracle.reserveBalanceUSD();
  const lastUpdateTimestamp = await reserveOracle.lastUpdateTimestamp();
  const currentBlockTimestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
  const dataAge = currentBlockTimestamp - Number(lastUpdateTimestamp);

  console.log(`Reserve Balance: $${ethers.formatUnits(reserveBalanceUSD, 18)}`);
  console.log(`Reserve Balance (wei): ${reserveBalanceUSD.toString()}`);
  console.log(`Last Update: ${new Date(Number(lastUpdateTimestamp) * 1000).toISOString()}`);
  console.log(`Data Age: ${dataAge} seconds (${Math.floor(dataAge / 60)} minutes)\n`);

  // Check if reserve data is fresh
  const ttlSeconds = await reserveOracle.ttlSeconds();
  if (dataAge > Number(ttlSeconds)) {
    console.log(`⚠️  WARNING: Reserve data is stale (age: ${dataAge}s, TTL: ${ttlSeconds}s)`);
    console.log(`Consider updating the reserve first using: npx hardhat poke-oracle --network ${network.name}\n`);

    // Ask for confirmation (in production, you'd want to handle this more gracefully)
    console.log("Proceeding with stale data may result in over/under minting.");
  }

  // Check if reserve is zero
  if (reserveBalanceUSD === 0n) {
    throw new Error(
      `Reserve balance is zero. Cannot perform initial mint.\n` +
      `Please update the reserve first using: npx hardhat poke-oracle --network ${network.name}`
    );
  }

  // Get current total supply
  const currentSupply = await vetra.totalSupply();
  console.log(`Current VTR Supply: ${ethers.formatUnits(currentSupply, 18)} VTR\n`);

  // Calculate mint amount (reserve - current supply)
  const mintAmount = reserveBalanceUSD - currentSupply;

  if (mintAmount <= 0n) {
    console.log(`✓ No minting needed. Total supply (${ethers.formatUnits(currentSupply, 18)} VTR) already matches or exceeds reserve.`);

    if (currentSupply > reserveBalanceUSD) {
      console.log(`⚠️  WARNING: Total supply EXCEEDS reserve by ${ethers.formatUnits(currentSupply - reserveBalanceUSD, 18)} VTR`);
      console.log(`This violates the 1:1 backing invariant!`);
    }

    return;
  }

  // Get recipient address (default to signer, but can be overridden via env var)
  const recipient = process.env.INITIAL_MINT_RECIPIENT || signer.address;

  console.log("=== Initial Mint Summary ===");
  console.log(`Recipient: ${recipient}`);
  console.log(`Mint Amount: ${ethers.formatUnits(mintAmount, 18)} VTR`);
  console.log(`Mint Amount (wei): ${mintAmount.toString()}`);
  console.log(`New Total Supply: ${ethers.formatUnits(currentSupply + mintAmount, 18)} VTR`);
  console.log(`Reserve Balance: ${ethers.formatUnits(reserveBalanceUSD, 18)} USD`);
  console.log(`Backing Ratio: 1:1 (100%)\n`);

  // Perform the mint
  console.log("Executing mint transaction...");
  const tx = await vetra.mint(recipient, mintAmount);
  console.log(`Transaction hash: ${tx.hash}`);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log(`✓ Transaction confirmed in block ${receipt!.blockNumber}`);
  console.log(`Gas used: ${receipt!.gasUsed.toString()}\n`);

  // Verify final state
  const finalSupply = await vetra.totalSupply();
  const recipientBalance = await vetra.balanceOf(recipient);

  console.log("=== Final State ===");
  console.log(`Total Supply: ${ethers.formatUnits(finalSupply, 18)} VTR`);
  console.log(`Recipient Balance: ${ethers.formatUnits(recipientBalance, 18)} VTR`);
  console.log(`Reserve Balance: ${ethers.formatUnits(reserveBalanceUSD, 18)} USD`);

  // Check backing invariant
  const isFullyBacked = finalSupply <= reserveBalanceUSD;
  console.log(`\nBacking Check: ${isFullyBacked ? "✓ PASS" : "✗ FAIL"}`);

  if (!isFullyBacked) {
    console.log(`⚠️  WARNING: Total supply (${ethers.formatUnits(finalSupply, 18)}) exceeds reserve (${ethers.formatUnits(reserveBalanceUSD, 18)})`);
  }

  console.log("\n=== Initial Mint Complete ===\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error during initial mint:\n");
    console.error(error);
    process.exit(1);
  });
