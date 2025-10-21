// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./ReserveOracle.sol";

/**
 * @title VetraFunctionsConsumer
 * @notice Chainlink Functions consumer that fetches Proof-of-Reserves from custodian API
 * @dev Polls the custodian API every 5 minutes and updates the ReserveOracle
 *
 * Security:
 * - Only authorized addresses can trigger requests
 * - Response validation before updating oracle
 * - Nonce tracking to prevent replay attacks
 * - TTL enforcement via ReserveOracle
 *
 * Note: This contract is NOT upgradeable (unlike Vetra and ReserveOracle)
 * because FunctionsClient doesn't support upgradeability patterns.
 */
contract VetraFunctionsConsumer is FunctionsClient, AccessControl {
    using FunctionsRequest for FunctionsRequest.Request;

    // ============ Roles ============

    bytes32 public constant REQUESTER_ROLE = keccak256("REQUESTER_ROLE");

    // ============ State Variables ============

    /// @notice Reference to the ReserveOracle contract
    ReserveOracle public reserveOracle;

    /// @notice Chainlink Functions subscription ID
    uint64 public subscriptionId;

    /// @notice Gas limit for callback function
    uint32 public gasLimit;

    /// @notice DON ID for Chainlink Functions
    bytes32 public donId;

    /// @notice JavaScript source code for the Chainlink Functions request
    string public source;

    /// @notice Current nonce for requests (monotonically increasing)
    uint256 public currentNonce;

    /// @notice Mapping of request ID to nonce
    mapping(bytes32 => uint256) public requestNonces;

    /// @notice Last successful update timestamp
    uint256 public lastSuccessfulUpdate;

    /// @notice Minimum interval between requests (seconds)
    uint256 public requestInterval;

    // ============ Events ============

    /**
     * @notice Emitted when a new Chainlink Functions request is sent
     * @param requestId The ID of the request
     * @param nonce The nonce associated with this request
     */
    event RequestSent(bytes32 indexed requestId, uint256 indexed nonce);

    /**
     * @notice Emitted when a Chainlink Functions response is received
     * @param requestId The ID of the request
     * @param balanceUSD The reserve balance returned
     * @param timestamp The timestamp of the reserve data
     * @param nonce The nonce of the request
     */
    event RequestFulfilled(
        bytes32 indexed requestId,
        uint256 balanceUSD,
        uint256 timestamp,
        uint256 indexed nonce
    );

    /**
     * @notice Emitted when request configuration is updated
     * @param subscriptionId New subscription ID
     * @param gasLimit New gas limit
     * @param donId New DON ID
     */
    event ConfigUpdated(uint64 subscriptionId, uint32 gasLimit, bytes32 donId);

    /**
     * @notice Emitted when source code is updated
     * @param newSource New JavaScript source code (hash)
     */
    event SourceUpdated(bytes32 indexed newSource);

    /**
     * @notice Emitted when request interval is updated
     * @param oldInterval Previous interval
     * @param newInterval New interval
     */
    event IntervalUpdated(uint256 oldInterval, uint256 newInterval);

    // ============ Errors ============

    error UnexpectedRequestID(bytes32 requestId);
    error RequestTooSoon(uint256 timeSinceLastUpdate, uint256 requiredInterval);
    error InvalidSource();
    error InvalidInterval();

    // ============ Constructor ============

    /**
     * @notice Constructor
     * @param _router Chainlink Functions router address
     * @param admin Address that will receive DEFAULT_ADMIN_ROLE
     * @param requester Address that will receive REQUESTER_ROLE
     * @param _reserveOracle Address of the ReserveOracle contract
     * @param _subscriptionId Chainlink Functions subscription ID
     * @param _gasLimit Gas limit for callback
     * @param _donId DON ID for Chainlink Functions
     * @param _source JavaScript source code for the request
     * @param _requestInterval Minimum interval between requests (seconds)
     */
    constructor(
        address _router,
        address admin,
        address requester,
        address _reserveOracle,
        uint64 _subscriptionId,
        uint32 _gasLimit,
        bytes32 _donId,
        string memory _source,
        uint256 _requestInterval
    ) FunctionsClient(_router) {
        require(admin != address(0), "Zero address: admin");
        require(requester != address(0), "Zero address: requester");
        require(_reserveOracle != address(0), "Zero address: oracle");
        require(bytes(_source).length > 0, "Empty source");
        if (_requestInterval == 0) revert InvalidInterval();

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REQUESTER_ROLE, requester);

        // Set state
        reserveOracle = ReserveOracle(_reserveOracle);
        subscriptionId = _subscriptionId;
        gasLimit = _gasLimit;
        donId = _donId;
        source = _source;
        requestInterval = _requestInterval;
        currentNonce = 1; // Start at 1
        lastSuccessfulUpdate = 0;
    }

    // ============ Request Functions ============

    /**
     * @notice Send a request to Chainlink Functions to fetch reserve data
     * @dev Only callable by REQUESTER_ROLE, respects requestInterval
     * @return requestId The ID of the request
     */
    function sendRequest() external onlyRole(REQUESTER_ROLE) returns (bytes32) {
        // Check if enough time has passed since last update
        if (lastSuccessfulUpdate > 0) {
            uint256 timeSinceLastUpdate = block.timestamp - lastSuccessfulUpdate;
            if (timeSinceLastUpdate < requestInterval) {
                revert RequestTooSoon(timeSinceLastUpdate, requestInterval);
            }
        }

        // Build request
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(source);

        // Send request
        bytes32 requestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            gasLimit,
            donId
        );

        // Track nonce for this request
        requestNonces[requestId] = currentNonce;

        emit RequestSent(requestId, currentNonce);

        // Increment nonce for next request
        currentNonce++;

        return requestId;
    }

    /**
     * @notice Callback function for Chainlink Functions response
     * @dev Only callable by the Chainlink Functions router
     * @param requestId The ID of the request
     * @param response The response data (ABI-encoded: balanceUSD, timestamp)
     * @param err Error message if any
     */
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        // Verify this is a known request
        uint256 nonce = requestNonces[requestId];
        if (nonce == 0) {
            revert UnexpectedRequestID(requestId);
        }

        // If there's an error, log and return
        if (err.length > 0) {
            // Error occurred, don't update oracle
            delete requestNonces[requestId];
            return;
        }

        // Decode response: (balanceUSD, timestamp)
        (uint256 balanceUSD, uint256 timestamp) = abi.decode(
            response,
            (uint256, uint256)
        );

        // Update the oracle
        reserveOracle.updateReserve(balanceUSD, timestamp, nonce);

        // Update last successful update time
        lastSuccessfulUpdate = block.timestamp;

        // Clean up
        delete requestNonces[requestId];

        emit RequestFulfilled(requestId, balanceUSD, timestamp, nonce);
    }

    // ============ Admin Functions ============

    /**
     * @notice Update Chainlink Functions configuration
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param _subscriptionId New subscription ID
     * @param _gasLimit New gas limit
     * @param _donId New DON ID
     */
    function updateConfig(
        uint64 _subscriptionId,
        uint32 _gasLimit,
        bytes32 _donId
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        subscriptionId = _subscriptionId;
        gasLimit = _gasLimit;
        donId = _donId;

        emit ConfigUpdated(_subscriptionId, _gasLimit, _donId);
    }

    /**
     * @notice Update the JavaScript source code
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param _source New JavaScript source code
     */
    function updateSource(string memory _source) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bytes(_source).length == 0) revert InvalidSource();

        source = _source;

        emit SourceUpdated(keccak256(bytes(_source)));
    }

    /**
     * @notice Update the minimum request interval
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param _requestInterval New interval in seconds
     */
    function updateRequestInterval(uint256 _requestInterval)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (_requestInterval == 0) revert InvalidInterval();

        uint256 oldInterval = requestInterval;
        requestInterval = _requestInterval;

        emit IntervalUpdated(oldInterval, _requestInterval);
    }

    // ============ View Functions ============

    /**
     * @notice Check if a new request can be sent
     * @return canRequest True if enough time has passed
     * @return timeRemaining Seconds remaining until next request is allowed
     */
    function canSendRequest() external view returns (bool canRequest, uint256 timeRemaining) {
        if (lastSuccessfulUpdate == 0) {
            return (true, 0);
        }

        uint256 timeSinceLastUpdate = block.timestamp - lastSuccessfulUpdate;
        if (timeSinceLastUpdate >= requestInterval) {
            return (true, 0);
        }

        return (false, requestInterval - timeSinceLastUpdate);
    }

    /**
     * @notice Get the current nonce value
     * @return The next nonce to be used
     */
    function getCurrentNonce() external view returns (uint256) {
        return currentNonce;
    }
}
