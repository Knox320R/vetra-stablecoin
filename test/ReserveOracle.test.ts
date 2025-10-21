import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { ReserveOracle } from "../typechain-types";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import "@nomicfoundation/hardhat-chai-matchers";

describe("ReserveOracle - Proof-of-Reserves Oracle", function () {
  const UPDATER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPDATER_ROLE"));
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

  const TTL_SECONDS = 900; // 15 minutes
  const SOURCE_ID = ethers.keccak256(ethers.toUtf8Bytes("https://my.ftassetmanagement.com/api/bcl.asp"));

  async function deployReserveOracleFixture() {
    const [admin, updater, user1, unauthorized] = await ethers.getSigners();

    const ReserveOracleFactory = await ethers.getContractFactory("ReserveOracle");
    const oracle = (await upgrades.deployProxy(
      ReserveOracleFactory,
      [admin.address, updater.address, TTL_SECONDS, SOURCE_ID],
      { kind: "uups" }
    )) as unknown as ReserveOracle;

    return { oracle, admin, updater, user1, unauthorized };
  }

  describe("Deployment & Initialization", function () {
    it("Should initialize with correct parameters", async function () {
      const { oracle, admin, updater } = await loadFixture(deployReserveOracleFixture);

      expect(await oracle.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await oracle.hasRole(UPDATER_ROLE, updater.address)).to.be.true;
      expect(await oracle.ttlSeconds()).to.equal(TTL_SECONDS);
      expect(await oracle.sourceId()).to.equal(SOURCE_ID);
    });

    it("Should initialize with zero reserve state", async function () {
      const { oracle } = await loadFixture(deployReserveOracleFixture);

      expect(await oracle.reserveBalanceUSD()).to.equal(0n);
      expect(await oracle.lastUpdateTimestamp()).to.equal(0n);
      expect(await oracle.lastNonce()).to.equal(0n);
    });

    it("Should revert if initialized with zero admin address", async function () {
      const ReserveOracleFactory = await ethers.getContractFactory("ReserveOracle");
      const [_, updater] = await ethers.getSigners();

      await expect(
        upgrades.deployProxy(
          ReserveOracleFactory,
          [ethers.ZeroAddress, updater.address, TTL_SECONDS, SOURCE_ID],
          { kind: "uups" }
        )
      ).to.be.revertedWith("Zero address: admin");
    });

    it("Should revert if initialized with zero updater address", async function () {
      const ReserveOracleFactory = await ethers.getContractFactory("ReserveOracle");
      const [admin] = await ethers.getSigners();

      await expect(
        upgrades.deployProxy(
          ReserveOracleFactory,
          [admin.address, ethers.ZeroAddress, TTL_SECONDS, SOURCE_ID],
          { kind: "uups" }
        )
      ).to.be.revertedWith("Zero address: updater");
    });

    it("Should revert if initialized with zero TTL", async function () {
      const ReserveOracleFactory = await ethers.getContractFactory("ReserveOracle");
      const [admin, updater] = await ethers.getSigners();

      await expect(
        upgrades.deployProxy(
          ReserveOracleFactory,
          [admin.address, updater.address, 0, SOURCE_ID],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(ReserveOracleFactory, "InvalidTTL");
    });

    it("Should not allow reinitialization", async function () {
      const { oracle, admin, updater } = await loadFixture(deployReserveOracleFixture);

      await expect(
        oracle.initialize(admin.address, updater.address, TTL_SECONDS, SOURCE_ID)
      ).to.be.revertedWithCustomError(oracle, "InvalidInitialization");
    });
  });

  describe("Reserve Updates", function () {
    it("Should allow updater to update reserve", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000"); // $100M
      const currentTime = await time.latest();
      const nonce = 1;

      await expect(
        oracle.connect(updater).updateReserve(balanceUSD, currentTime, nonce)
      )
        .to.emit(oracle, "ReserveUpdated")
        .withArgs(balanceUSD, currentTime, nonce, updater.address);

      expect(await oracle.reserveBalanceUSD()).to.equal(balanceUSD);
      expect(await oracle.lastUpdateTimestamp()).to.equal(currentTime);
      expect(await oracle.lastNonce()).to.equal(nonce);
    });

    it("Should prevent non-updater from updating reserve", async function () {
      const { oracle, unauthorized } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000");
      const currentTime = await time.latest();
      const nonce = 1;

      await expect(
        oracle.connect(unauthorized).updateReserve(balanceUSD, currentTime, nonce)
      ).to.be.revertedWithCustomError(oracle, "AccessControlUnauthorizedAccount");
    });

    it("Should revert on zero balance", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const currentTime = await time.latest();
      const nonce = 1;

      await expect(
        oracle.connect(updater).updateReserve(0, currentTime, nonce)
      ).to.be.revertedWithCustomError(oracle, "ZeroBalance");
    });

    it("Should revert on zero timestamp", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000");
      const nonce = 1;

      await expect(
        oracle.connect(updater).updateReserve(balanceUSD, 0, nonce)
      ).to.be.revertedWithCustomError(oracle, "ZeroTimestamp");
    });

    it("Should revert on future timestamp", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000");
      const futureTime = (await time.latest()) + 3600; // 1 hour in the future
      const nonce = 1;

      await expect(
        oracle.connect(updater).updateReserve(balanceUSD, futureTime, nonce)
      ).to.be.revertedWithCustomError(oracle, "FutureTimestamp");
    });

    it("Should allow multiple sequential updates with increasing nonces", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const currentTime = await time.latest();

      // First update
      await oracle.connect(updater).updateReserve(
        ethers.parseEther("100000000"),
        currentTime,
        1
      );

      // Second update
      await oracle.connect(updater).updateReserve(
        ethers.parseEther("100500000"),
        currentTime,
        2
      );

      // Third update
      await oracle.connect(updater).updateReserve(
        ethers.parseEther("101000000"),
        currentTime,
        3
      );

      expect(await oracle.lastNonce()).to.equal(3);
      expect(await oracle.reserveBalanceUSD()).to.equal(ethers.parseEther("101000000"));
    });
  });

  describe("TTL (Time-To-Live) Enforcement", function () {
    it("Should reject stale data beyond TTL", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000");
      // Timestamp older than TTL (900 seconds)
      const staleTime = (await time.latest()) - 1000;
      const nonce = 1;

      await expect(
        oracle.connect(updater).updateReserve(balanceUSD, staleTime, nonce)
      ).to.be.revertedWithCustomError(oracle, "StaleData");
    });

    it("Should accept data exactly at TTL threshold", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000");
      // Timestamp within TTL_SECONDS (subtract TTL + 1 to account for block time)
      const thresholdTime = (await time.latest()) - TTL_SECONDS + 1;
      const nonce = 1;

      await expect(
        oracle.connect(updater).updateReserve(balanceUSD, thresholdTime, nonce)
      ).to.emit(oracle, "ReserveUpdated");
    });

    it("Should accept fresh data within TTL", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000");
      const currentTime = await time.latest();
      const nonce = 1;

      await expect(
        oracle.connect(updater).updateReserve(balanceUSD, currentTime, nonce)
      ).to.emit(oracle, "ReserveUpdated");
    });

    it("Should allow admin to update TTL", async function () {
      const { oracle, admin } = await loadFixture(deployReserveOracleFixture);

      const newTTL = 1800; // 30 minutes

      await expect(oracle.connect(admin).setTTL(newTTL))
        .to.emit(oracle, "TTLUpdated")
        .withArgs(TTL_SECONDS, newTTL, admin.address);

      expect(await oracle.ttlSeconds()).to.equal(newTTL);
    });

    it("Should prevent setting TTL to zero", async function () {
      const { oracle, admin } = await loadFixture(deployReserveOracleFixture);

      await expect(
        oracle.connect(admin).setTTL(0)
      ).to.be.revertedWithCustomError(oracle, "InvalidTTL");
    });

    it("Should prevent non-admin from updating TTL", async function () {
      const { oracle, unauthorized } = await loadFixture(deployReserveOracleFixture);

      await expect(
        oracle.connect(unauthorized).setTTL(1800)
      ).to.be.revertedWithCustomError(oracle, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Nonce Monotonicity (Replay Protection)", function () {
    it("Should reject nonce equal to last nonce", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000");
      const currentTime = await time.latest();

      // First update with nonce 1
      await oracle.connect(updater).updateReserve(balanceUSD, currentTime, 1);

      // Try to reuse nonce 1
      await expect(
        oracle.connect(updater).updateReserve(balanceUSD, currentTime, 1)
      ).to.be.revertedWithCustomError(oracle, "InvalidNonce");
    });

    it("Should reject nonce less than last nonce", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000");
      const currentTime = await time.latest();

      // First update with nonce 5
      await oracle.connect(updater).updateReserve(balanceUSD, currentTime, 5);

      // Try to use nonce 3 (replay attack)
      await expect(
        oracle.connect(updater).updateReserve(balanceUSD, currentTime, 3)
      ).to.be.revertedWithCustomError(oracle, "InvalidNonce");
    });

    it("Should accept nonce greater than last nonce", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000");
      const currentTime = await time.latest();

      await oracle.connect(updater).updateReserve(balanceUSD, currentTime, 10);
      await oracle.connect(updater).updateReserve(balanceUSD, currentTime, 20);

      expect(await oracle.lastNonce()).to.equal(20);
    });

    it("Should enforce strict monotonicity even with large nonce jumps", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000");
      const currentTime = await time.latest();

      // Jump to nonce 1000
      await oracle.connect(updater).updateReserve(balanceUSD, currentTime, 1000);

      // Cannot go back to 999
      await expect(
        oracle.connect(updater).updateReserve(balanceUSD, currentTime, 999)
      ).to.be.revertedWithCustomError(oracle, "InvalidNonce");

      // Can go to 1001
      await oracle.connect(updater).updateReserve(balanceUSD, currentTime, 1001);
      expect(await oracle.lastNonce()).to.equal(1001);
    });
  });

  describe("View Functions", function () {
    it("Should correctly report data validity", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      // Initially no data
      let [isValid, age] = await oracle.isDataValid();
      expect(isValid).to.be.false;
      expect(age).to.equal(0);

      // After update, should be valid
      const balanceUSD = ethers.parseEther("100000000");
      const currentTime = await time.latest();
      await oracle.connect(updater).updateReserve(balanceUSD, currentTime, 1);

      [isValid, age] = await oracle.isDataValid();
      expect(isValid).to.be.true;
      expect(age).to.be.lessThanOrEqual(2); // Should be very fresh
    });

    it("Should detect data becoming stale over time", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000");
      const currentTime = await time.latest();
      await oracle.connect(updater).updateReserve(balanceUSD, currentTime, 1);

      // Data is valid now
      let [isValid] = await oracle.isDataValid();
      expect(isValid).to.be.true;

      // Advance time beyond TTL
      await time.increase(TTL_SECONDS + 1);

      // Data should now be stale
      [isValid] = await oracle.isDataValid();
      expect(isValid).to.be.false;
    });

    it("Should correctly calculate data age", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000");
      const currentTime = await time.latest();
      await oracle.connect(updater).updateReserve(balanceUSD, currentTime, 1);

      // Initially very fresh
      let age = await oracle.getDataAge();
      expect(age).to.be.lessThanOrEqual(2);

      // Advance time
      await time.increase(300); // 5 minutes

      age = await oracle.getDataAge();
      expect(age).to.be.closeTo(300, 2);
    });

    it("Should correctly calculate time until stale", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000");
      const currentTime = await time.latest();
      await oracle.connect(updater).updateReserve(balanceUSD, currentTime, 1);

      // Initially close to full TTL
      let remaining = await oracle.getTimeUntilStale();
      expect(remaining).to.be.closeTo(TTL_SECONDS, 2);

      // Advance time halfway
      await time.increase(TTL_SECONDS / 2);

      remaining = await oracle.getTimeUntilStale();
      expect(remaining).to.be.closeTo(TTL_SECONDS / 2, 2);

      // Advance beyond TTL
      await time.increase(TTL_SECONDS);

      remaining = await oracle.getTimeUntilStale();
      expect(remaining).to.equal(0);
    });

    it("Should return all reserve data at once", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000");
      const currentTime = await time.latest();
      const nonce = 42;

      await oracle.connect(updater).updateReserve(balanceUSD, currentTime, nonce);

      const [balance, timestamp, returnedNonce, isValid] = await oracle.getReserveData();

      expect(balance).to.equal(balanceUSD);
      expect(timestamp).to.equal(currentTime);
      expect(returnedNonce).to.equal(nonce);
      expect(isValid).to.be.true;
    });
  });

  describe("Reserve Backing Invariants", function () {
    it("Should confirm full backing when reserves exceed supply", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const reserveUSD = ethers.parseEther("100000000"); // $100M
      const currentTime = await time.latest();
      await oracle.connect(updater).updateReserve(reserveUSD, currentTime, 1);

      const totalSupply = ethers.parseEther("80000000"); // $80M
      const [isBackedFully, ratio] = await oracle.checkReserveBacking(totalSupply);

      expect(isBackedFully).to.be.true;
      expect(ratio).to.equal(12500); // 125% backing (100M / 80M * 10000)
    });

    it("Should confirm exact 1:1 backing", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const amount = ethers.parseEther("100000000");
      const currentTime = await time.latest();
      await oracle.connect(updater).updateReserve(amount, currentTime, 1);

      const [isBackedFully, ratio] = await oracle.checkReserveBacking(amount);

      expect(isBackedFully).to.be.true;
      expect(ratio).to.equal(10000); // Exactly 100%
    });

    it("Should detect under-collateralization", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const reserveUSD = ethers.parseEther("80000000"); // $80M
      const currentTime = await time.latest();
      await oracle.connect(updater).updateReserve(reserveUSD, currentTime, 1);

      const totalSupply = ethers.parseEther("100000000"); // $100M
      const [isBackedFully, ratio] = await oracle.checkReserveBacking(totalSupply);

      expect(isBackedFully).to.be.false;
      expect(ratio).to.equal(8000); // 80% backing
    });

    it("Should return 100% when supply is zero", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const reserveUSD = ethers.parseEther("100000000");
      const currentTime = await time.latest();
      await oracle.connect(updater).updateReserve(reserveUSD, currentTime, 1);

      const [isBackedFully, ratio] = await oracle.checkReserveBacking(0);

      expect(isBackedFully).to.be.true;
      expect(ratio).to.equal(10000); // 100%
    });
  });

  describe("Source ID Management", function () {
    it("Should allow admin to update source ID", async function () {
      const { oracle, admin } = await loadFixture(deployReserveOracleFixture);

      const newSourceId = ethers.keccak256(ethers.toUtf8Bytes("https://new-api.example.com"));

      await expect(oracle.connect(admin).setSourceId(newSourceId))
        .to.emit(oracle, "SourceIdUpdated")
        .withArgs(SOURCE_ID, newSourceId, admin.address);

      expect(await oracle.sourceId()).to.equal(newSourceId);
    });

    it("Should prevent non-admin from updating source ID", async function () {
      const { oracle, unauthorized } = await loadFixture(deployReserveOracleFixture);

      const newSourceId = ethers.keccak256(ethers.toUtf8Bytes("https://new-api.example.com"));

      await expect(
        oracle.connect(unauthorized).setSourceId(newSourceId)
      ).to.be.revertedWithCustomError(oracle, "AccessControlUnauthorizedAccount");
    });
  });

  describe("UUPS Upgradeability", function () {
    it("Should allow admin to upgrade", async function () {
      const { oracle, admin } = await loadFixture(deployReserveOracleFixture);

      const ReserveOracleV2Factory = await ethers.getContractFactory("ReserveOracle");
      await upgrades.upgradeProxy(await oracle.getAddress(), ReserveOracleV2Factory);

      expect(await oracle.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should prevent non-admin from upgrading", async function () {
      const { oracle, unauthorized } = await loadFixture(deployReserveOracleFixture);

      const ReserveOracleV2Factory = await ethers.getContractFactory("ReserveOracle", unauthorized);

      await expect(
        upgrades.upgradeProxy(await oracle.getAddress(), ReserveOracleV2Factory)
      ).to.be.revertedWithCustomError(oracle, "AccessControlUnauthorizedAccount");
    });

    it("Should preserve state across upgrade", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      // Set some state
      const balanceUSD = ethers.parseEther("100000000");
      const currentTime = await time.latest();
      await oracle.connect(updater).updateReserve(balanceUSD, currentTime, 1);

      const balanceBefore = await oracle.reserveBalanceUSD();
      const nonceBefore = await oracle.lastNonce();

      // Upgrade
      const ReserveOracleV2Factory = await ethers.getContractFactory("ReserveOracle");
      const upgraded = await upgrades.upgradeProxy(await oracle.getAddress(), ReserveOracleV2Factory);

      // Verify state preserved
      expect(await upgraded.reserveBalanceUSD()).to.equal(balanceBefore);
      expect(await upgraded.lastNonce()).to.equal(nonceBefore);
    });
  });

  describe("Edge Cases & Security", function () {
    it("Should handle very large reserve values", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      // $1 Trillion with 18 decimals
      const hugeBalance = ethers.parseEther("1000000000000");
      const currentTime = await time.latest();

      await oracle.connect(updater).updateReserve(hugeBalance, currentTime, 1);
      expect(await oracle.reserveBalanceUSD()).to.equal(hugeBalance);
    });

    it("Should handle very large nonce values", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000");
      const currentTime = await time.latest();
      const largeNonce = BigInt("999999999999999999");

      await oracle.connect(updater).updateReserve(balanceUSD, currentTime, largeNonce);
      expect(await oracle.lastNonce()).to.equal(largeNonce);
    });

    it("Should handle timestamp at block timestamp", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const balanceUSD = ethers.parseEther("100000000");
      const currentTime = await time.latest();

      await oracle.connect(updater).updateReserve(balanceUSD, currentTime, 1);
      expect(await oracle.lastUpdateTimestamp()).to.equal(currentTime);
    });

    it("Should handle rapid sequential updates", async function () {
      const { oracle, updater } = await loadFixture(deployReserveOracleFixture);

      const currentTime = await time.latest();

      for (let i = 1; i <= 10; i++) {
        await oracle.connect(updater).updateReserve(
          ethers.parseEther((100000000 + i * 1000).toString()),
          currentTime,
          i
        );
      }

      expect(await oracle.lastNonce()).to.equal(10);
      expect(await oracle.reserveBalanceUSD()).to.equal(ethers.parseEther("100010000"));
    });
  });
});
