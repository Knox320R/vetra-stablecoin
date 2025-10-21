// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title ReserveOracle
 * @notice Stores and validates Proof-of-Reserves data from Chainlink Functions
 * @dev Upgradeable contract using UUPS pattern with TTL and nonce replay protection
 *
 * Security features:
 * - TTL enforcement: rejects data older than configured threshold
 * - Nonce monotonicity: prevents replay attacks by ensuring nonces strictly increase
 * - Access control: only authorized updaters (Chainlink Functions consumer) can write
 * - Timestamp validation: ensures reserve data is recent
 */
contract ReserveOracle is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    // ============ Roles ============

    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

    // ============ State Variables ============
    // WARNING: Do not change the order or remove variables - this breaks upgradeability

    /// @notice Latest reserve balance in USD (18 decimals precision)
    uint256 public reserveBalanceUSD;

    /// @notice Timestamp of the last reserve update
    uint256 public lastUpdateTimestamp;

    /// @notice Monotonic nonce to prevent replay attacks
    uint256 public lastNonce;

    /// @notice Source identifier for the reserve data (e.g., API endpoint hash)
    bytes32 public sourceId;

    /// @notice Maximum allowed age of reserve data in seconds (Time-To-Live)
    uint256 public ttlSeconds;

    // ============ Events ============

    /**
     * @notice Emitted when reserve data is updated
     * @param balanceUSD New reserve balance (18 decimals)
     * @param timestamp Timestamp of the reserve data
     * @param nonce Nonce of the update
     * @param updater Address that performed the update
     */
    event ReserveUpdated(
        uint256 indexed balanceUSD,
        uint256 timestamp,
        uint256 indexed nonce,
        address indexed updater
    );

    /**
     * @notice Emitted when TTL is updated
     * @param oldTTL Previous TTL in seconds
     * @param newTTL New TTL in seconds
     * @param admin Address that updated the TTL
     */
    event TTLUpdated(uint256 oldTTL, uint256 newTTL, address indexed admin);

    /**
     * @notice Emitted when source ID is updated
     * @param oldSourceId Previous source identifier
     * @param newSourceId New source identifier
     * @param admin Address that updated the source ID
     */
    event SourceIdUpdated(bytes32 oldSourceId, bytes32 newSourceId, address indexed admin);

    // ============ Errors ============

    error StaleData(uint256 dataAge, uint256 maxAge);
    error InvalidNonce(uint256 providedNonce, uint256 expectedNonce);
    error ZeroBalance();
    error ZeroTimestamp();
    error FutureTimestamp(uint256 providedTimestamp, uint256 currentTimestamp);
    error InvalidTTL();

    // ============ Constructor & Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract
     * @param admin Address that will receive DEFAULT_ADMIN_ROLE
     * @param updater Address that will receive UPDATER_ROLE (Chainlink Functions consumer)
     * @param _ttlSeconds Maximum allowed age of reserve data in seconds
     * @param _sourceId Identifier for the reserve data source
     */
    function initialize(
        address admin,
        address updater,
        uint256 _ttlSeconds,
        bytes32 _sourceId
    ) public initializer {
        require(admin != address(0), "Zero address: admin");
        require(updater != address(0), "Zero address: updater");
        if (_ttlSeconds == 0) revert InvalidTTL();

        __AccessControl_init();
        __UUPSUpgradeable_init();

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPDATER_ROLE, updater);

        // Initialize state
        ttlSeconds = _ttlSeconds;
        sourceId = _sourceId;
        lastNonce = 0;
        lastUpdateTimestamp = 0;
        reserveBalanceUSD = 0;
    }

    // ============ Update Functions ============

    /**
     * @notice Update reserve data from Chainlink Functions
     * @dev Only callable by UPDATER_ROLE with valid TTL and nonce
     * @param balanceUSD New reserve balance in USD (18 decimals)
     * @param timestamp Timestamp of the reserve data (seconds since epoch)
     * @param nonce Monotonic nonce for replay protection
     */
    function updateReserve(
        uint256 balanceUSD,
        uint256 timestamp,
        uint256 nonce
    ) external onlyRole(UPDATER_ROLE) {
        // Validate inputs
        if (balanceUSD == 0) revert ZeroBalance();
        if (timestamp == 0) revert ZeroTimestamp();

        // Prevent future timestamps
        if (timestamp > block.timestamp) {
            revert FutureTimestamp(timestamp, block.timestamp);
        }

        // Enforce TTL: data must be recent enough
        uint256 dataAge = block.timestamp - timestamp;
        if (dataAge > ttlSeconds) {
            revert StaleData(dataAge, ttlSeconds);
        }

        // Enforce monotonic nonce (strictly increasing)
        if (nonce <= lastNonce) {
            revert InvalidNonce(nonce, lastNonce + 1);
        }

        // Update state
        reserveBalanceUSD = balanceUSD;
        lastUpdateTimestamp = timestamp;
        lastNonce = nonce;

        emit ReserveUpdated(balanceUSD, timestamp, nonce, msg.sender);
    }

    // ============ Admin Functions ============

    /**
     * @notice Update the TTL (Time-To-Live) for reserve data
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param newTTL New maximum age in seconds
     */
    function setTTL(uint256 newTTL) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTTL == 0) revert InvalidTTL();

        uint256 oldTTL = ttlSeconds;
        ttlSeconds = newTTL;

        emit TTLUpdated(oldTTL, newTTL, msg.sender);
    }

    /**
     * @notice Update the source identifier for reserve data
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param newSourceId New source identifier (e.g., hash of API endpoint)
     */
    function setSourceId(bytes32 newSourceId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 oldSourceId = sourceId;
        sourceId = newSourceId;

        emit SourceIdUpdated(oldSourceId, newSourceId, msg.sender);
    }

    // ============ View Functions ============

    /**
     * @notice Check if the current reserve data is still valid (within TTL)
     * @return isValid True if data is within TTL, false otherwise
     * @return age Current age of the data in seconds
     */
    function isDataValid() external view returns (bool isValid, uint256 age) {
        if (lastUpdateTimestamp == 0) {
            return (false, 0);
        }

        age = block.timestamp - lastUpdateTimestamp;
        isValid = age <= ttlSeconds;
    }

    /**
     * @notice Get the age of the current reserve data
     * @return age Age in seconds (0 if never updated)
     */
    function getDataAge() external view returns (uint256 age) {
        if (lastUpdateTimestamp == 0) {
            return 0;
        }
        return block.timestamp - lastUpdateTimestamp;
    }

    /**
     * @notice Get remaining time before data becomes stale
     * @return remainingTime Seconds until staleness (0 if already stale or never updated)
     */
    function getTimeUntilStale() external view returns (uint256 remainingTime) {
        if (lastUpdateTimestamp == 0) {
            return 0;
        }

        uint256 age = block.timestamp - lastUpdateTimestamp;
        if (age >= ttlSeconds) {
            return 0;
        }

        return ttlSeconds - age;
    }

    /**
     * @notice Get all reserve data at once
     * @return balance Current reserve balance in USD (18 decimals)
     * @return timestamp Timestamp of last update
     * @return nonce Last nonce used
     * @return isValid Whether the data is still within TTL
     */
    function getReserveData()
        external
        view
        returns (
            uint256 balance,
            uint256 timestamp,
            uint256 nonce,
            bool isValid
        )
    {
        balance = reserveBalanceUSD;
        timestamp = lastUpdateTimestamp;
        nonce = lastNonce;

        if (lastUpdateTimestamp == 0) {
            isValid = false;
        } else {
            uint256 age = block.timestamp - lastUpdateTimestamp;
            isValid = age <= ttlSeconds;
        }
    }

    /**
     * @notice Check if total supply is within reserve backing (1:1 invariant)
     * @dev Helper for monitoring scripts - compares against external token supply
     * @param totalSupply Total supply of the stablecoin (18 decimals)
     * @return isBackedFully True if reserves >= total supply
     * @return reserveRatio Ratio of reserves to supply (in basis points, 10000 = 100%)
     */
    function checkReserveBacking(uint256 totalSupply)
        external
        view
        returns (bool isBackedFully, uint256 reserveRatio)
    {
        if (totalSupply == 0) {
            return (true, 10000); // 100% backed if no supply
        }

        isBackedFully = reserveBalanceUSD >= totalSupply;

        // Calculate ratio in basis points (10000 = 100%)
        reserveRatio = (reserveBalanceUSD * 10000) / totalSupply;
    }

    // ============ UUPS Upgrade Authorization ============

    /**
     * @notice Authorize an upgrade to a new implementation
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param newImplementation Address of the new implementation contract
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        // Additional upgrade checks can be added here if needed
    }
}
