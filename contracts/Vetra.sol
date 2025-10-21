// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title Vetra
 * @notice 1:1 USD-backed stablecoin on Polygon PoS with Chainlink Proof-of-Reserves
 * @dev Upgradeable ERC-20 using UUPS pattern with role-based access control
 *
 * Features:
 * - UUPS upgradeability (only ADMIN can upgrade)
 * - Role-based access: ADMIN, MINTER_ROLE, BURNER_ROLE
 * - Pausable for emergency situations
 * - Optional mint cap and allowlist for controlled token distribution
 * - Comprehensive event emission for observability
 *
 * Security:
 * - Storage layout must remain frozen for upgrade safety
 * - All state-changing functions protected by access control
 * - Mint/burn operations respect pause state
 */
contract Vetra is
    Initializable,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    // ============ Roles ============

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    // ============ State Variables ============
    // WARNING: Do not change the order or remove variables - this breaks upgradeability

    /// @notice Maximum total supply cap (18 decimals). 0 = no cap.
    uint256 public mintCap;

    /// @notice Whether allowlist is enabled for minting
    bool public allowlistEnabled;

    /// @notice Mapping of addresses allowed to receive minted tokens (when allowlist is enabled)
    mapping(address => bool) public allowlist;

    // ============ Events ============

    /**
     * @notice Emitted when tokens are minted
     * @param to Recipient address
     * @param amount Amount minted (in wei, 18 decimals)
     * @param operator Address that executed the mint
     */
    event TokensMinted(address indexed to, uint256 amount, address indexed operator);

    /**
     * @notice Emitted when tokens are burned
     * @param from Address from which tokens were burned
     * @param amount Amount burned (in wei, 18 decimals)
     * @param operator Address that executed the burn
     */
    event TokensBurned(address indexed from, uint256 amount, address indexed operator);

    /**
     * @notice Emitted when mint cap is updated
     * @param oldCap Previous cap
     * @param newCap New cap
     * @param admin Address that updated the cap
     */
    event MintCapUpdated(uint256 oldCap, uint256 newCap, address indexed admin);

    /**
     * @notice Emitted when allowlist is toggled
     * @param enabled Whether allowlist is now enabled
     * @param admin Address that toggled the allowlist
     */
    event AllowlistToggled(bool enabled, address indexed admin);

    /**
     * @notice Emitted when an address is added to allowlist
     * @param account Address added
     * @param admin Address that added the account
     */
    event AllowlistAdded(address indexed account, address indexed admin);

    /**
     * @notice Emitted when an address is removed from allowlist
     * @param account Address removed
     * @param admin Address that removed the account
     */
    event AllowlistRemoved(address indexed account, address indexed admin);

    // ============ Errors ============

    error MintCapExceeded(uint256 requested, uint256 cap, uint256 currentSupply);
    error RecipientNotAllowlisted(address recipient);
    error ZeroAddress();
    error ZeroAmount();

    // ============ Constructor & Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract (replaces constructor for upgradeable contracts)
     * @param admin Address that will receive DEFAULT_ADMIN_ROLE
     * @param minter Address that will receive MINTER_ROLE
     * @param burner Address that will receive BURNER_ROLE
     */
    function initialize(
        address admin,
        address minter,
        address burner
    ) public initializer {
        if (admin == address(0) || minter == address(0) || burner == address(0)) {
            revert ZeroAddress();
        }

        __ERC20_init("Vetra", "VTR");
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);
        _grantRole(BURNER_ROLE, burner);

        // Initialize with no cap and allowlist disabled
        mintCap = 0;
        allowlistEnabled = false;
    }

    // ============ Mint & Burn Functions ============

    /**
     * @notice Mint new tokens to a recipient
     * @dev Only callable by MINTER_ROLE when not paused
     * @param to Recipient address
     * @param amount Amount to mint (18 decimals)
     */
    function mint(address to, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        // Check mint cap if enabled
        if (mintCap > 0) {
            uint256 newSupply = totalSupply() + amount;
            if (newSupply > mintCap) {
                revert MintCapExceeded(amount, mintCap, totalSupply());
            }
        }

        // Check allowlist if enabled
        if (allowlistEnabled && !allowlist[to]) {
            revert RecipientNotAllowlisted(to);
        }

        _mint(to, amount);

        emit TokensMinted(to, amount, msg.sender);
    }

    /**
     * @notice Burn tokens from an address
     * @dev Only callable by BURNER_ROLE when not paused
     * @param from Address to burn from
     * @param amount Amount to burn (18 decimals)
     */
    function burn(address from, uint256 amount)
        external
        onlyRole(BURNER_ROLE)
        whenNotPaused
    {
        if (from == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        _burn(from, amount);

        emit TokensBurned(from, amount, msg.sender);
    }

    // ============ Admin Functions ============

    /**
     * @notice Set the maximum mint cap
     * @dev Only callable by DEFAULT_ADMIN_ROLE. Set to 0 to disable.
     * @param newCap New maximum supply cap (18 decimals)
     */
    function setMintCap(uint256 newCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldCap = mintCap;
        mintCap = newCap;

        emit MintCapUpdated(oldCap, newCap, msg.sender);
    }

    /**
     * @notice Toggle allowlist on/off
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param enabled Whether to enable the allowlist
     */
    function setAllowlistEnabled(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        allowlistEnabled = enabled;

        emit AllowlistToggled(enabled, msg.sender);
    }

    /**
     * @notice Add an address to the allowlist
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param account Address to add
     */
    function addToAllowlist(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert ZeroAddress();

        allowlist[account] = true;

        emit AllowlistAdded(account, msg.sender);
    }

    /**
     * @notice Remove an address from the allowlist
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param account Address to remove
     */
    function removeFromAllowlist(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        allowlist[account] = false;

        emit AllowlistRemoved(account, msg.sender);
    }

    /**
     * @notice Add multiple addresses to the allowlist in batch
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param accounts Array of addresses to add
     */
    function addToAllowlistBatch(address[] calldata accounts)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i] == address(0)) revert ZeroAddress();
            allowlist[accounts[i]] = true;
            emit AllowlistAdded(accounts[i], msg.sender);
        }
    }

    /**
     * @notice Pause the contract (stops minting and burning)
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ============ UUPS Upgrade Authorization ============

    /**
     * @notice Authorize an upgrade to a new implementation
     * @dev Only callable by DEFAULT_ADMIN_ROLE. This is the UUPS security check.
     * @param newImplementation Address of the new implementation contract
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        // Additional upgrade checks can be added here if needed
    }

    // ============ View Functions ============

    /**
     * @notice Get the remaining mintable amount before hitting the cap
     * @return Remaining amount that can be minted (0 if no cap is set)
     */
    function remainingMintableAmount() external view returns (uint256) {
        if (mintCap == 0) {
            return type(uint256).max;
        }

        uint256 currentSupply = totalSupply();
        if (currentSupply >= mintCap) {
            return 0;
        }

        return mintCap - currentSupply;
    }

    /**
     * @notice Check if an address is allowlisted
     * @param account Address to check
     * @return Whether the address is allowlisted
     */
    function isAllowlisted(address account) external view returns (bool) {
        return allowlist[account];
    }
}
