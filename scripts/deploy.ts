import { ethers, upgrades, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deployment script for Vetra stablecoin system
 *
 * Deploys in this order:
 * 1. Vetra (UUPS proxy)
 * 2. ReserveOracle (UUPS proxy)
 * 3. VetraFunctionsConsumer (regular contract)
 *
 * Configuration is loaded from environment variables
 */

interface DeploymentAddresses {
  vetra: string;
  vetraImplementation: string;
  reserveOracle: string;
  reserveOracleImplementation: string;
  functionsConsumer: string;
  network: string;
  chainId: number;
  deployer: string;
  admin: string;
  operator: string;
  timestamp: string;
}

const TTL_SECONDS = parseInt(process.env.POR_TTL_SECONDS || "900"); // 15 minutes
const POLL_SECONDS = parseInt(process.env.POR_POLL_SECONDS || "300"); // 5 minutes

async function main() {
  console.log("\n==================================================");
  console.log("🚀 Vetra Stablecoin Deployment");
  console.log("==================================================\n");

  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${chainId}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // Load configuration from environment
  const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS;
  const OPERATOR_ADDRESS = process.env.OPERATOR_ADDRESS;

  if (!ADMIN_ADDRESS || !OPERATOR_ADDRESS) {
    throw new Error("Missing required environment variables: ADMIN_ADDRESS, OPERATOR_ADDRESS");
  }

  console.log(`Admin Address: ${ADMIN_ADDRESS}`);
  console.log(`Operator Address: ${OPERATOR_ADDRESS}\n`);

  const deploymentAddresses: DeploymentAddresses = {
    vetra: "",
    vetraImplementation: "",
    reserveOracle: "",
    reserveOracleImplementation: "",
    functionsConsumer: "",
    network: network.name,
    chainId: Number(chainId),
    deployer: deployer.address,
    admin: ADMIN_ADDRESS,
    operator: OPERATOR_ADDRESS,
    timestamp: new Date().toISOString(),
  };

  // ============ Step 1: Deploy Vetra (UUPS Proxy) ============
  console.log("📝 Step 1: Deploying Vetra stablecoin contract...");

  const VetraFactory = await ethers.getContractFactory("Vetra");
  const vetra = await upgrades.deployProxy(
    VetraFactory,
    [ADMIN_ADDRESS, OPERATOR_ADDRESS, OPERATOR_ADDRESS], // admin, minter, burner
    {
      kind: "uups",
      initializer: "initialize",
    }
  );

  await vetra.waitForDeployment();
  const vetraAddress = await vetra.getAddress();
  const vetraImplAddress = await upgrades.erc1967.getImplementationAddress(vetraAddress);

  deploymentAddresses.vetra = vetraAddress;
  deploymentAddresses.vetraImplementation = vetraImplAddress;

  console.log(`✅ Vetra deployed at: ${vetraAddress}`);
  console.log(`   Implementation: ${vetraImplAddress}\n`);

  // ============ Step 2: Deploy ReserveOracle (UUPS Proxy) ============
  console.log("📝 Step 2: Deploying ReserveOracle contract...");

  const SOURCE_ID = ethers.keccak256(ethers.toUtf8Bytes(process.env.POR_API_URL || ""));

  const ReserveOracleFactory = await ethers.getContractFactory("ReserveOracle");
  const reserveOracle = await upgrades.deployProxy(
    ReserveOracleFactory,
    [
      ADMIN_ADDRESS, // admin
      OPERATOR_ADDRESS, // updater (will be FunctionsConsumer later)
      TTL_SECONDS, // TTL
      SOURCE_ID, // source ID
    ],
    {
      kind: "uups",
      initializer: "initialize",
    }
  );

  await reserveOracle.waitForDeployment();
  const reserveOracleAddress = await reserveOracle.getAddress();
  const reserveOracleImplAddress = await upgrades.erc1967.getImplementationAddress(
    reserveOracleAddress
  );

  deploymentAddresses.reserveOracle = reserveOracleAddress;
  deploymentAddresses.reserveOracleImplementation = reserveOracleImplAddress;

  console.log(`✅ ReserveOracle deployed at: ${reserveOracleAddress}`);
  console.log(`   Implementation: ${reserveOracleImplAddress}\n`);

  // ============ Step 3: Deploy VetraFunctionsConsumer ============
  console.log("📝 Step 3: Deploying VetraFunctionsConsumer...");

  // Read JavaScript source for Chainlink Functions
  const sourcePath = path.join(__dirname, "..", "functions", "get_reserve_offchain.js");
  const source = fs.readFileSync(sourcePath, "utf8");

  // Chainlink Functions configuration (network-specific)
  let functionsRouter: string;
  let donId: string;

  if (chainId === 80002n) {
    // Amoy testnet
    functionsRouter = process.env.FUNCTIONS_ROUTER_AMOY || "0xC22a79eBA640940ABB6dF0f7982cc119578E11De";
    donId = process.env.DON_ID || ethers.encodeBytes32String("fun-polygon-amoy-1");
  } else if (chainId === 137n) {
    // Polygon mainnet
    functionsRouter = process.env.FUNCTIONS_ROUTER_POLYGON || "0xdc2AAF042Aeff2E68B3e8E33F19e4B9fA7C73F10";
    donId = process.env.DON_ID || ethers.encodeBytes32String("fun-polygon-mainnet-1");
  } else {
    throw new Error(`Unsupported chain ID: ${chainId}. Use Amoy (80002) or Polygon (137).`);
  }

  const subscriptionId = process.env.FUNCTIONS_SUBSCRIPTION_ID || "0";
  const gasLimit = 300000; // Gas limit for callback

  console.log(`   Functions Router: ${functionsRouter}`);
  console.log(`   DON ID: ${ethers.decodeBytes32String(donId)}`);
  console.log(`   Subscription ID: ${subscriptionId}`);

  const VetraFunctionsConsumerFactory = await ethers.getContractFactory("VetraFunctionsConsumer");
  const functionsConsumer = await VetraFunctionsConsumerFactory.deploy(
    functionsRouter,
    ADMIN_ADDRESS,
    ADMIN_ADDRESS, // requester role (can be changed later)
    reserveOracleAddress,
    subscriptionId,
    gasLimit,
    donId,
    source,
    POLL_SECONDS // request interval
  );

  await functionsConsumer.waitForDeployment();
  const functionsConsumerAddress = await functionsConsumer.getAddress();

  deploymentAddresses.functionsConsumer = functionsConsumerAddress;

  console.log(`✅ VetraFunctionsConsumer deployed at: ${functionsConsumerAddress}\n`);

  // ============ Step 4: Grant UPDATER_ROLE to FunctionsConsumer ============
  console.log("📝 Step 4: Granting UPDATER_ROLE to FunctionsConsumer...");

  const UPDATER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPDATER_ROLE"));

  // Check if deployer has admin role
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  const hasAdminRole = await reserveOracle.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);

  if (!hasAdminRole && deployer.address.toLowerCase() !== ADMIN_ADDRESS.toLowerCase()) {
    console.log(`⚠️  Deployer doesn't have admin role. Skipping role grant.`);
    console.log(`   Please grant UPDATER_ROLE manually using the admin account:\n`);
    console.log(`   await reserveOracle.grantRole("${UPDATER_ROLE}", "${functionsConsumerAddress}")`);
  } else {
    const tx = await reserveOracle.grantRole(UPDATER_ROLE, functionsConsumerAddress);
    await tx.wait();
    console.log(`✅ UPDATER_ROLE granted to FunctionsConsumer\n`);
  }

  // ============ Step 5: Save Deployment Addresses ============
  console.log("📝 Step 5: Saving deployment addresses...");

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = `${network.name}-${chainId}.json`;
  const filepath = path.join(deploymentsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(deploymentAddresses, null, 2));

  console.log(`✅ Deployment addresses saved to: ${filepath}\n`);

  // ============ Deployment Summary ============
  console.log("==================================================");
  console.log("✅ Deployment Complete!");
  console.log("==================================================\n");

  console.log("Contract Addresses:");
  console.log(`  Vetra (Proxy):              ${deploymentAddresses.vetra}`);
  console.log(`  Vetra (Implementation):     ${deploymentAddresses.vetraImplementation}`);
  console.log(`  ReserveOracle (Proxy):      ${deploymentAddresses.reserveOracle}`);
  console.log(`  ReserveOracle (Impl):       ${deploymentAddresses.reserveOracleImplementation}`);
  console.log(`  VetraFunctionsConsumer:     ${deploymentAddresses.functionsConsumer}`);

  console.log("\nNext Steps:");
  console.log("1. Verify contracts on Polygonscan:");
  console.log(`   npm run verify:${network.name}`);
  console.log("\n2. Fund Chainlink Functions subscription");
  console.log(`   Subscription ID: ${subscriptionId}`);
  console.log(`   Add consumer: ${functionsConsumerAddress}`);
  console.log("\n3. Test oracle updates:");
  console.log(`   npx hardhat poke-oracle --network ${network.name}`);
  console.log("\n4. Test minting:");
  console.log(`   npx hardhat mint --to <address> --amount <amount> --network ${network.name}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
