import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as fs from "fs";
import * as path from "path";

// Helper to load deployment addresses
function loadDeployment(network: string, chainId: bigint): any {
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const filename = `${network}-${chainId}.json`;
  const filepath = path.join(deploymentsDir, filename);

  if (!fs.existsSync(filepath)) {
    throw new Error(`Deployment file not found: ${filepath}. Please deploy first.`);
  }

  return JSON.parse(fs.readFileSync(filepath, "utf8"));
}

// ============ Mint Task ============

task("mint", "Mint VTR tokens to an address")
  .addParam("to", "Recipient address")
  .addParam("amount", "Amount to mint (in VTR, not wei)")
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deployment = loadDeployment(network.name, chainId);

    const [signer] = await ethers.getSigners();
    console.log(`Minting as: ${signer.address}`);

    const vetra = await ethers.getContractAt("Vetra", deployment.vetra);
    const amount = ethers.parseEther(taskArgs.amount);

    const tx = await vetra.mint(taskArgs.to, amount);
    console.log(`Transaction sent: ${tx.hash}`);

    await tx.wait();
    console.log(`✅ Minted ${taskArgs.amount} VTR to ${taskArgs.to}`);

    const balance = await vetra.balanceOf(taskArgs.to);
    console.log(`New balance: ${ethers.formatEther(balance)} VTR`);
  });

// ============ Burn Task ============

task("burn", "Burn VTR tokens from an address")
  .addParam("from", "Address to burn from")
  .addParam("amount", "Amount to burn (in VTR, not wei)")
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deployment = loadDeployment(network.name, chainId);

    const [signer] = await ethers.getSigners();
    console.log(`Burning as: ${signer.address}`);

    const vetra = await ethers.getContractAt("Vetra", deployment.vetra);
    const amount = ethers.parseEther(taskArgs.amount);

    const tx = await vetra.burn(taskArgs.from, amount);
    console.log(`Transaction sent: ${tx.hash}`);

    await tx.wait();
    console.log(`✅ Burned ${taskArgs.amount} VTR from ${taskArgs.from}`);

    const balance = await vetra.balanceOf(taskArgs.from);
    console.log(`New balance: ${ethers.formatEther(balance)} VTR`);
  });

// ============ Pause Task ============

task("pause", "Pause the Vetra contract").setAction(
  async (_, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deployment = loadDeployment(network.name, chainId);

    const [signer] = await ethers.getSigners();
    console.log(`Pausing as: ${signer.address}`);

    const vetra = await ethers.getContractAt("Vetra", deployment.vetra);

    const tx = await vetra.pause();
    console.log(`Transaction sent: ${tx.hash}`);

    await tx.wait();
    console.log(`✅ Vetra contract paused`);
  }
);

// ============ Unpause Task ============

task("unpause", "Unpause the Vetra contract").setAction(
  async (_, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deployment = loadDeployment(network.name, chainId);

    const [signer] = await ethers.getSigners();
    console.log(`Unpausing as: ${signer.address}`);

    const vetra = await ethers.getContractAt("Vetra", deployment.vetra);

    const tx = await vetra.unpause();
    console.log(`Transaction sent: ${tx.hash}`);

    await tx.wait();
    console.log(`✅ Vetra contract unpaused`);
  }
);

// ============ Read Reserve Task ============

task("read-reserve", "Read current reserve data from oracle").setAction(
  async (_, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deployment = loadDeployment(network.name, chainId);

    const oracle = await ethers.getContractAt("ReserveOracle", deployment.reserveOracle);

    const [balance, timestamp, nonce, isValid] = await oracle.getReserveData();

    console.log("\n==================================================");
    console.log("Reserve Oracle Data");
    console.log("==================================================");
    console.log(`Balance:        $${ethers.formatEther(balance)} USD`);
    console.log(`Timestamp:      ${new Date(Number(timestamp) * 1000).toISOString()}`);
    console.log(`Nonce:          ${nonce}`);
    console.log(`Is Valid:       ${isValid ? "✅ Yes" : "❌ No (stale)"}`);

    const age = await oracle.getDataAge();
    console.log(`Data Age:       ${age} seconds`);

    const remaining = await oracle.getTimeUntilStale();
    console.log(`Time to Stale:  ${remaining} seconds`);

    // Check backing
    const vetra = await ethers.getContractAt("Vetra", deployment.vetra);
    const totalSupply = await vetra.totalSupply();

    const [isBackedFully, ratio] = await oracle.checkReserveBacking(totalSupply);

    console.log("\n==================================================");
    console.log("Backing Status");
    console.log("==================================================");
    console.log(`Total Supply:   ${ethers.formatEther(totalSupply)} VTR`);
    console.log(`Backing Ratio:  ${(Number(ratio) / 100).toFixed(2)}%`);
    console.log(`Fully Backed:   ${isBackedFully ? "✅ Yes" : "❌ No"}`);
    console.log("==================================================\n");
  }
);

// ============ Poke Oracle Task ============

task("poke-oracle", "Trigger a Chainlink Functions request to update reserves").setAction(
  async (_, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deployment = loadDeployment(network.name, chainId);

    const [signer] = await ethers.getSigners();
    console.log(`Poking oracle as: ${signer.address}`);

    const consumer = await ethers.getContractAt(
      "VetraFunctionsConsumer",
      deployment.functionsConsumer
    );

    // Check if we can send request
    const [canRequest, timeRemaining] = await consumer.canSendRequest();

    if (!canRequest) {
      console.log(`⚠️  Cannot send request yet. Wait ${timeRemaining} more seconds.`);
      return;
    }

    const tx = await consumer.sendRequest();
    console.log(`Transaction sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`✅ Request sent successfully`);

    // Find RequestSent event
    const event = receipt?.logs
      .map((log: any) => {
        try {
          return consumer.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e: any) => e && e.name === "RequestSent");

    if (event) {
      console.log(`Request ID: ${event.args.requestId}`);
      console.log(`Nonce: ${event.args.nonce}`);
    }

    console.log("\nWait for Chainlink DON to fulfill the request...");
    console.log("Check reserve with: npx hardhat read-reserve --network", network.name);
  }
);

// ============ Grant Role Task ============

task("grant-role", "Grant a role to an address")
  .addParam("contract", "Contract name (vetra or oracle)")
  .addParam("role", "Role name (MINTER_ROLE, BURNER_ROLE, UPDATER_ROLE, ADMIN)")
  .addParam("account", "Address to grant role to")
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deployment = loadDeployment(network.name, chainId);

    const [signer] = await ethers.getSigners();
    console.log(`Granting role as: ${signer.address}`);

    let contract;
    if (taskArgs.contract === "vetra") {
      contract = await ethers.getContractAt("Vetra", deployment.vetra);
    } else if (taskArgs.contract === "oracle") {
      contract = await ethers.getContractAt("ReserveOracle", deployment.reserveOracle);
    } else {
      throw new Error("Invalid contract. Use 'vetra' or 'oracle'");
    }

    // Map role name to bytes32
    let roleHash;
    if (taskArgs.role === "ADMIN") {
      roleHash = ethers.ZeroHash;
    } else {
      roleHash = ethers.keccak256(ethers.toUtf8Bytes(taskArgs.role));
    }

    const tx = await contract.grantRole(roleHash, taskArgs.account);
    console.log(`Transaction sent: ${tx.hash}`);

    await tx.wait();
    console.log(`✅ Granted ${taskArgs.role} to ${taskArgs.account}`);
  });

// ============ Check Balance Task ============

task("balance", "Check VTR balance of an address")
  .addParam("account", "Address to check")
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deployment = loadDeployment(network.name, chainId);

    const vetra = await ethers.getContractAt("Vetra", deployment.vetra);
    const balance = await vetra.balanceOf(taskArgs.account);

    console.log(`Balance of ${taskArgs.account}:`);
    console.log(`  ${ethers.formatEther(balance)} VTR`);
  });

// ============ Token Info Task ============

task("token-info", "Display Vetra token information").setAction(
  async (_, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deployment = loadDeployment(network.name, chainId);

    const vetra = await ethers.getContractAt("Vetra", deployment.vetra);

    const name = await vetra.name();
    const symbol = await vetra.symbol();
    const decimals = await vetra.decimals();
    const totalSupply = await vetra.totalSupply();
    const paused = await vetra.paused();
    const mintCap = await vetra.mintCap();

    console.log("\n==================================================");
    console.log("Vetra Token Information");
    console.log("==================================================");
    console.log(`Name:         ${name}`);
    console.log(`Symbol:       ${symbol}`);
    console.log(`Decimals:     ${decimals}`);
    console.log(`Total Supply: ${ethers.formatEther(totalSupply)} VTR`);
    console.log(`Paused:       ${paused ? "Yes" : "No"}`);
    console.log(`Mint Cap:     ${mintCap > 0 ? ethers.formatEther(mintCap) + " VTR" : "No cap"}`);
    console.log(`Contract:     ${deployment.vetra}`);
    console.log("==================================================\n");
  }
);

export {};
