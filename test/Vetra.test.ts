import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Vetra } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import "@nomicfoundation/hardhat-chai-matchers";

describe("Vetra - USD-backed Stablecoin", function () {
  // Roles
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

  // Test fixture for deployment
  async function deployVetraFixture() {
    const [admin, minter, burner, user1, user2, unauthorized] = await ethers.getSigners();

    const VetraFactory = await ethers.getContractFactory("Vetra");
    const vetra = (await upgrades.deployProxy(
      VetraFactory,
      [admin.address, minter.address, burner.address],
      { kind: "uups" }
    )) as unknown as Vetra;

    return { vetra, admin, minter, burner, user1, user2, unauthorized };
  }

  describe("Deployment & Initialization", function () {
    it("Should initialize with correct name and symbol", async function () {
      const { vetra } = await loadFixture(deployVetraFixture);

      expect(await vetra.name()).to.equal("Vetra");
      expect(await vetra.symbol()).to.equal("VTR");
      expect(await vetra.decimals()).to.equal(18n);
    });

    it("Should grant roles correctly during initialization", async function () {
      const { vetra, admin, minter, burner } = await loadFixture(deployVetraFixture);

      expect(await vetra.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await vetra.hasRole(MINTER_ROLE, minter.address)).to.be.true;
      expect(await vetra.hasRole(BURNER_ROLE, burner.address)).to.be.true;
    });

    it("Should initialize with no mint cap and disabled allowlist", async function () {
      const { vetra } = await loadFixture(deployVetraFixture);

      expect(await vetra.mintCap()).to.equal(0n);
      expect(await vetra.allowlistEnabled()).to.be.false;
    });

    it("Should revert if initialized with zero addresses", async function () {
      const VetraFactory = await ethers.getContractFactory("Vetra");
      const [admin, minter] = await ethers.getSigners();

      await expect(
        upgrades.deployProxy(
          VetraFactory,
          [ethers.ZeroAddress, minter.address, minter.address],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(VetraFactory, "ZeroAddress");
    });

    it("Should not allow reinitialization", async function () {
      const { vetra, admin, minter, burner } = await loadFixture(deployVetraFixture);

      await expect(
        vetra.initialize(admin.address, minter.address, burner.address)
      ).to.be.revertedWithCustomError(vetra, "InvalidInitialization");
    });
  });

  describe("Role Management", function () {
    it("Should allow admin to grant and revoke MINTER_ROLE", async function () {
      const { vetra, admin, user1 } = await loadFixture(deployVetraFixture);

      await vetra.connect(admin).grantRole(MINTER_ROLE, user1.address);
      expect(await vetra.hasRole(MINTER_ROLE, user1.address)).to.be.true;

      await vetra.connect(admin).revokeRole(MINTER_ROLE, user1.address);
      expect(await vetra.hasRole(MINTER_ROLE, user1.address)).to.be.false;
    });

    it("Should allow admin to grant and revoke BURNER_ROLE", async function () {
      const { vetra, admin, user1 } = await loadFixture(deployVetraFixture);

      await vetra.connect(admin).grantRole(BURNER_ROLE, user1.address);
      expect(await vetra.hasRole(BURNER_ROLE, user1.address)).to.be.true;

      await vetra.connect(admin).revokeRole(BURNER_ROLE, user1.address);
      expect(await vetra.hasRole(BURNER_ROLE, user1.address)).to.be.false;
    });

    it("Should prevent non-admin from granting roles", async function () {
      const { vetra, unauthorized, user1 } = await loadFixture(deployVetraFixture);

      await expect(
        vetra.connect(unauthorized).grantRole(MINTER_ROLE, user1.address)
      ).to.be.revertedWithCustomError(vetra, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Minting", function () {
    it("Should allow minter to mint tokens", async function () {
      const { vetra, minter, user1 } = await loadFixture(deployVetraFixture);
      const amount = ethers.parseEther("1000");

      await expect(vetra.connect(minter).mint(user1.address, amount))
        .to.emit(vetra, "TokensMinted")
        .withArgs(user1.address, amount, minter.address);

      expect(await vetra.balanceOf(user1.address)).to.equal(amount);
      expect(await vetra.totalSupply()).to.equal(amount);
    });

    it("Should prevent non-minter from minting", async function () {
      const { vetra, unauthorized, user1 } = await loadFixture(deployVetraFixture);
      const amount = ethers.parseEther("1000");

      await expect(
        vetra.connect(unauthorized).mint(user1.address, amount)
      ).to.be.revertedWithCustomError(vetra, "AccessControlUnauthorizedAccount");
    });

    it("Should revert when minting to zero address", async function () {
      const { vetra, minter } = await loadFixture(deployVetraFixture);
      const amount = ethers.parseEther("1000");

      await expect(
        vetra.connect(minter).mint(ethers.ZeroAddress, amount)
      ).to.be.revertedWithCustomError(vetra, "ZeroAddress");
    });

    it("Should revert when minting zero amount", async function () {
      const { vetra, minter, user1 } = await loadFixture(deployVetraFixture);

      await expect(
        vetra.connect(minter).mint(user1.address, 0)
      ).to.be.revertedWithCustomError(vetra, "ZeroAmount");
    });

    it("Should prevent minting when paused", async function () {
      const { vetra, admin, minter, user1 } = await loadFixture(deployVetraFixture);
      const amount = ethers.parseEther("1000");

      await vetra.connect(admin).pause();

      await expect(
        vetra.connect(minter).mint(user1.address, amount)
      ).to.be.revertedWithCustomError(vetra, "EnforcedPause");
    });

    it("Should allow minting after unpause", async function () {
      const { vetra, admin, minter, user1 } = await loadFixture(deployVetraFixture);
      const amount = ethers.parseEther("1000");

      await vetra.connect(admin).pause();
      await vetra.connect(admin).unpause();

      await expect(vetra.connect(minter).mint(user1.address, amount))
        .to.emit(vetra, "TokensMinted");
    });
  });

  describe("Burning", function () {
    it("Should allow burner to burn tokens", async function () {
      const { vetra, minter, burner, user1 } = await loadFixture(deployVetraFixture);
      const mintAmount = ethers.parseEther("1000");
      const burnAmount = ethers.parseEther("400");

      await vetra.connect(minter).mint(user1.address, mintAmount);

      await expect(vetra.connect(burner).burn(user1.address, burnAmount))
        .to.emit(vetra, "TokensBurned")
        .withArgs(user1.address, burnAmount, burner.address);

      expect(await vetra.balanceOf(user1.address)).to.equal(mintAmount - burnAmount);
      expect(await vetra.totalSupply()).to.equal(mintAmount - burnAmount);
    });

    it("Should prevent non-burner from burning", async function () {
      const { vetra, minter, unauthorized, user1 } = await loadFixture(deployVetraFixture);
      const amount = ethers.parseEther("1000");

      await vetra.connect(minter).mint(user1.address, amount);

      await expect(
        vetra.connect(unauthorized).burn(user1.address, amount)
      ).to.be.revertedWithCustomError(vetra, "AccessControlUnauthorizedAccount");
    });

    it("Should revert when burning from zero address", async function () {
      const { vetra, burner } = await loadFixture(deployVetraFixture);

      await expect(
        vetra.connect(burner).burn(ethers.ZeroAddress, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(vetra, "ZeroAddress");
    });

    it("Should revert when burning zero amount", async function () {
      const { vetra, minter, burner, user1 } = await loadFixture(deployVetraFixture);

      await vetra.connect(minter).mint(user1.address, ethers.parseEther("1000"));

      await expect(
        vetra.connect(burner).burn(user1.address, 0)
      ).to.be.revertedWithCustomError(vetra, "ZeroAmount");
    });

    it("Should revert when burning more than balance", async function () {
      const { vetra, minter, burner, user1 } = await loadFixture(deployVetraFixture);

      await vetra.connect(minter).mint(user1.address, ethers.parseEther("100"));

      await expect(
        vetra.connect(burner).burn(user1.address, ethers.parseEther("200"))
      ).to.be.revertedWithCustomError(vetra, "ERC20InsufficientBalance");
    });

    it("Should prevent burning when paused", async function () {
      const { vetra, admin, minter, burner, user1 } = await loadFixture(deployVetraFixture);

      await vetra.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      await vetra.connect(admin).pause();

      await expect(
        vetra.connect(burner).burn(user1.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(vetra, "EnforcedPause");
    });
  });

  describe("Mint Cap", function () {
    it("Should allow admin to set mint cap", async function () {
      const { vetra, admin } = await loadFixture(deployVetraFixture);
      const cap = ethers.parseEther("1000000");

      await expect(vetra.connect(admin).setMintCap(cap))
        .to.emit(vetra, "MintCapUpdated")
        .withArgs(0n, cap, admin.address);

      expect(await vetra.mintCap()).to.equal(cap);
    });

    it("Should prevent minting above cap", async function () {
      const { vetra, admin, minter, user1 } = await loadFixture(deployVetraFixture);
      const cap = ethers.parseEther("1000");

      await vetra.connect(admin).setMintCap(cap);

      await expect(
        vetra.connect(minter).mint(user1.address, ethers.parseEther("1001"))
      ).to.be.revertedWithCustomError(vetra, "MintCapExceeded");
    });

    it("Should allow minting up to cap exactly", async function () {
      const { vetra, admin, minter, user1 } = await loadFixture(deployVetraFixture);
      const cap = ethers.parseEther("1000");

      await vetra.connect(admin).setMintCap(cap);

      await vetra.connect(minter).mint(user1.address, cap);
      expect(await vetra.totalSupply()).to.equal(cap);
    });

    it("Should allow minting in multiple transactions up to cap", async function () {
      const { vetra, admin, minter, user1, user2 } = await loadFixture(deployVetraFixture);
      const cap = ethers.parseEther("1000");

      await vetra.connect(admin).setMintCap(cap);

      await vetra.connect(minter).mint(user1.address, ethers.parseEther("600"));
      await vetra.connect(minter).mint(user2.address, ethers.parseEther("400"));

      expect(await vetra.totalSupply()).to.equal(cap);

      // Should fail on next mint
      await expect(
        vetra.connect(minter).mint(user1.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(vetra, "MintCapExceeded");
    });

    it("Should allow admin to update cap", async function () {
      const { vetra, admin, minter, user1 } = await loadFixture(deployVetraFixture);

      await vetra.connect(admin).setMintCap(ethers.parseEther("1000"));
      await vetra.connect(minter).mint(user1.address, ethers.parseEther("1000"));

      // Increase cap
      await vetra.connect(admin).setMintCap(ethers.parseEther("2000"));
      await vetra.connect(minter).mint(user1.address, ethers.parseEther("500"));

      expect(await vetra.totalSupply()).to.equal(ethers.parseEther("1500"));
    });

    it("Should allow disabling cap by setting to 0", async function () {
      const { vetra, admin, minter, user1 } = await loadFixture(deployVetraFixture);

      await vetra.connect(admin).setMintCap(ethers.parseEther("1000"));
      await vetra.connect(admin).setMintCap(0);

      // Should allow minting any amount
      await vetra.connect(minter).mint(user1.address, ethers.parseEther("10000"));
      expect(await vetra.totalSupply()).to.equal(ethers.parseEther("10000"));
    });

    it("Should prevent non-admin from setting cap", async function () {
      const { vetra, unauthorized } = await loadFixture(deployVetraFixture);

      await expect(
        vetra.connect(unauthorized).setMintCap(ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(vetra, "AccessControlUnauthorizedAccount");
    });

    it("Should correctly calculate remaining mintable amount", async function () {
      const { vetra, admin, minter, user1 } = await loadFixture(deployVetraFixture);
      const cap = ethers.parseEther("1000");

      await vetra.connect(admin).setMintCap(cap);
      await vetra.connect(minter).mint(user1.address, ethers.parseEther("300"));

      expect(await vetra.remainingMintableAmount()).to.equal(ethers.parseEther("700"));
    });

    it("Should return max uint256 when no cap is set", async function () {
      const { vetra } = await loadFixture(deployVetraFixture);

      expect(await vetra.remainingMintableAmount()).to.equal(ethers.MaxUint256);
    });
  });

  describe("Allowlist", function () {
    it("Should allow admin to enable allowlist", async function () {
      const { vetra, admin } = await loadFixture(deployVetraFixture);

      await expect(vetra.connect(admin).setAllowlistEnabled(true))
        .to.emit(vetra, "AllowlistToggled")
        .withArgs(true, admin.address);

      expect(await vetra.allowlistEnabled()).to.be.true;
    });

    it("Should allow admin to add address to allowlist", async function () {
      const { vetra, admin, user1 } = await loadFixture(deployVetraFixture);

      await expect(vetra.connect(admin).addToAllowlist(user1.address))
        .to.emit(vetra, "AllowlistAdded")
        .withArgs(user1.address, admin.address);

      expect(await vetra.isAllowlisted(user1.address)).to.be.true;
    });

    it("Should allow admin to remove address from allowlist", async function () {
      const { vetra, admin, user1 } = await loadFixture(deployVetraFixture);

      await vetra.connect(admin).addToAllowlist(user1.address);
      await expect(vetra.connect(admin).removeFromAllowlist(user1.address))
        .to.emit(vetra, "AllowlistRemoved")
        .withArgs(user1.address, admin.address);

      expect(await vetra.isAllowlisted(user1.address)).to.be.false;
    });

    it("Should allow batch adding to allowlist", async function () {
      const { vetra, admin, user1, user2 } = await loadFixture(deployVetraFixture);

      await vetra.connect(admin).addToAllowlistBatch([user1.address, user2.address]);

      expect(await vetra.isAllowlisted(user1.address)).to.be.true;
      expect(await vetra.isAllowlisted(user2.address)).to.be.true;
    });

    it("Should prevent minting to non-allowlisted address when enabled", async function () {
      const { vetra, admin, minter, user1 } = await loadFixture(deployVetraFixture);

      await vetra.connect(admin).setAllowlistEnabled(true);

      await expect(
        vetra.connect(minter).mint(user1.address, ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(vetra, "RecipientNotAllowlisted");
    });

    it("Should allow minting to allowlisted address when enabled", async function () {
      const { vetra, admin, minter, user1 } = await loadFixture(deployVetraFixture);

      await vetra.connect(admin).setAllowlistEnabled(true);
      await vetra.connect(admin).addToAllowlist(user1.address);

      await vetra.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      expect(await vetra.balanceOf(user1.address)).to.equal(ethers.parseEther("1000"));
    });

    it("Should allow minting to any address when allowlist disabled", async function () {
      const { vetra, minter, user1 } = await loadFixture(deployVetraFixture);

      await vetra.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      expect(await vetra.balanceOf(user1.address)).to.equal(ethers.parseEther("1000"));
    });

    it("Should prevent adding zero address to allowlist", async function () {
      const { vetra, admin } = await loadFixture(deployVetraFixture);

      await expect(
        vetra.connect(admin).addToAllowlist(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vetra, "ZeroAddress");
    });

    it("Should prevent non-admin from managing allowlist", async function () {
      const { vetra, unauthorized, user1 } = await loadFixture(deployVetraFixture);

      await expect(
        vetra.connect(unauthorized).setAllowlistEnabled(true)
      ).to.be.revertedWithCustomError(vetra, "AccessControlUnauthorizedAccount");

      await expect(
        vetra.connect(unauthorized).addToAllowlist(user1.address)
      ).to.be.revertedWithCustomError(vetra, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Pause & Unpause", function () {
    it("Should allow admin to pause", async function () {
      const { vetra, admin } = await loadFixture(deployVetraFixture);

      await expect(vetra.connect(admin).pause())
        .to.emit(vetra, "Paused")
        .withArgs(admin.address);

      expect(await vetra.paused()).to.be.true;
    });

    it("Should allow admin to unpause", async function () {
      const { vetra, admin } = await loadFixture(deployVetraFixture);

      await vetra.connect(admin).pause();

      await expect(vetra.connect(admin).unpause())
        .to.emit(vetra, "Unpaused")
        .withArgs(admin.address);

      expect(await vetra.paused()).to.be.false;
    });

    it("Should prevent non-admin from pausing", async function () {
      const { vetra, unauthorized } = await loadFixture(deployVetraFixture);

      await expect(
        vetra.connect(unauthorized).pause()
      ).to.be.revertedWithCustomError(vetra, "AccessControlUnauthorizedAccount");
    });

    it("Should prevent non-admin from unpausing", async function () {
      const { vetra, admin, unauthorized } = await loadFixture(deployVetraFixture);

      await vetra.connect(admin).pause();

      await expect(
        vetra.connect(unauthorized).unpause()
      ).to.be.revertedWithCustomError(vetra, "AccessControlUnauthorizedAccount");
    });
  });

  describe("UUPS Upgradeability", function () {
    it("Should allow admin to upgrade", async function () {
      const { vetra, admin } = await loadFixture(deployVetraFixture);

      const VetraV2Factory = await ethers.getContractFactory("Vetra");
      await upgrades.upgradeProxy(await vetra.getAddress(), VetraV2Factory);

      // Verify state is preserved
      expect(await vetra.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should prevent non-admin from upgrading", async function () {
      const { vetra, unauthorized } = await loadFixture(deployVetraFixture);

      const VetraV2Factory = await ethers.getContractFactory("Vetra", unauthorized);

      await expect(
        upgrades.upgradeProxy(await vetra.getAddress(), VetraV2Factory)
      ).to.be.revertedWithCustomError(vetra, "AccessControlUnauthorizedAccount");
    });

    it("Should preserve state across upgrade", async function () {
      const { vetra, admin, minter, user1 } = await loadFixture(deployVetraFixture);

      // Mint some tokens
      await vetra.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      await vetra.connect(admin).setMintCap(ethers.parseEther("5000"));

      const balanceBefore = await vetra.balanceOf(user1.address);
      const capBefore = await vetra.mintCap();

      // Upgrade
      const VetraV2Factory = await ethers.getContractFactory("Vetra");
      const upgraded = await upgrades.upgradeProxy(await vetra.getAddress(), VetraV2Factory);

      // Verify state preserved
      expect(await upgraded.balanceOf(user1.address)).to.equal(balanceBefore);
      expect(await upgraded.mintCap()).to.equal(capBefore);
      expect(await upgraded.totalSupply()).to.equal(ethers.parseEther("1000"));
    });
  });

  describe("ERC-20 Functionality", function () {
    it("Should allow token transfers", async function () {
      const { vetra, minter, user1, user2 } = await loadFixture(deployVetraFixture);

      await vetra.connect(minter).mint(user1.address, ethers.parseEther("1000"));

      await vetra.connect(user1).transfer(user2.address, ethers.parseEther("300"));

      expect(await vetra.balanceOf(user1.address)).to.equal(ethers.parseEther("700"));
      expect(await vetra.balanceOf(user2.address)).to.equal(ethers.parseEther("300"));
    });

    it("Should allow approve and transferFrom", async function () {
      const { vetra, minter, user1, user2 } = await loadFixture(deployVetraFixture);

      await vetra.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      await vetra.connect(user1).approve(user2.address, ethers.parseEther("500"));

      await vetra.connect(user2).transferFrom(user1.address, user2.address, ethers.parseEther("300"));

      expect(await vetra.balanceOf(user1.address)).to.equal(ethers.parseEther("700"));
      expect(await vetra.balanceOf(user2.address)).to.equal(ethers.parseEther("300"));
    });
  });

  describe("Edge Cases & Security", function () {
    it("Should handle multiple mints and burns correctly", async function () {
      const { vetra, minter, burner, user1 } = await loadFixture(deployVetraFixture);

      await vetra.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      await vetra.connect(burner).burn(user1.address, ethers.parseEther("300"));
      await vetra.connect(minter).mint(user1.address, ethers.parseEther("500"));
      await vetra.connect(burner).burn(user1.address, ethers.parseEther("200"));

      expect(await vetra.balanceOf(user1.address)).to.equal(ethers.parseEther("1000"));
      expect(await vetra.totalSupply()).to.equal(ethers.parseEther("1000"));
    });

    it("Should enforce cap with multiple users", async function () {
      const { vetra, admin, minter, user1, user2 } = await loadFixture(deployVetraFixture);
      const cap = ethers.parseEther("1000");

      await vetra.connect(admin).setMintCap(cap);
      await vetra.connect(minter).mint(user1.address, ethers.parseEther("600"));
      await vetra.connect(minter).mint(user2.address, ethers.parseEther("300"));

      await expect(
        vetra.connect(minter).mint(user1.address, ethers.parseEther("200"))
      ).to.be.revertedWithCustomError(vetra, "MintCapExceeded");
    });

    it("Should allow cap adjustment after burns", async function () {
      const { vetra, admin, minter, burner, user1 } = await loadFixture(deployVetraFixture);
      const cap = ethers.parseEther("1000");

      await vetra.connect(admin).setMintCap(cap);
      await vetra.connect(minter).mint(user1.address, cap);

      // Should fail
      await expect(
        vetra.connect(minter).mint(user1.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(vetra, "MintCapExceeded");

      // Burn some tokens
      await vetra.connect(burner).burn(user1.address, ethers.parseEther("500"));

      // Should now succeed
      await vetra.connect(minter).mint(user1.address, ethers.parseEther("400"));
      expect(await vetra.totalSupply()).to.equal(ethers.parseEther("900"));
    });
  });
});
