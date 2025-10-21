# Vetra (VTR) - USD-Backed Stablecoin

A production-ready, 1:1 USD-backed stablecoin on Polygon PoS with Chainlink Proof-of-Reserves.

## Overview

Vetra is an upgradeable ERC-20 stablecoin backed 1:1 by USD reserves held with FT Asset Management. The system uses Chainlink Functions to fetch real-time proof-of-reserves data, ensuring transparency and auditability.

### Key Features

- **1:1 USD Backing**: Every VTR token is backed by $1 USD in reserves
- **Proof-of-Reserves**: Real-time reserve verification via Chainlink Functions
- **Upgradeable**: UUPS proxy pattern for Vetra and ReserveOracle contracts
- **Access Control**: Role-based permissions (ADMIN, MINTER, BURNER)
- **Pausable**: Emergency stop mechanism
- **Optional Controls**: Mint caps and allowlists for controlled distribution
- **Comprehensive Events**: Full observability for all operations

## Architecture

```
┌─────────────────────┐
│   Vetra Token       │
│   (UUPS Proxy)      │
│                     │
│ - Mint              │
│ - Burn              │
│ - Pause             │
│ - AccessControl     │
└──────────┬──────────┘
           │
           │ Reads backing status
           │
           ▼
┌──────────────────────────┐
│   ReserveOracle          │
│   (UUPS Proxy)           │
│                          │
│ - Reserve Balance (USD)  │
│ - TTL Enforcement        │
│ - Nonce Tracking         │
└──────────┬───────────────┘
           │
           │ Updates
           │
           ▼
┌────────────────────────────┐
│  VetraFunctionsConsumer    │
│                            │
│ - Chainlink Functions      │
│ - Poll Interval: 5 min     │
│ - TTL: 15 min              │
└──────────┬─────────────────┘
           │
           │ HTTP Request
           │
           ▼
┌────────────────────────────┐
│  FT Asset Management API   │
│                            │
│  Custodian Reserves        │
│  $100M USD                 │
└────────────────────────────┘
```

## Contracts

| Contract | Type | Address | Purpose |
|----------|------|---------|---------|
| **Vetra** | UUPS Proxy | `deployments/{network}.json` | Main stablecoin contract |
| **ReserveOracle** | UUPS Proxy | `deployments/{network}.json` | Stores & validates reserve data |
| **VetraFunctionsConsumer** | Regular | `deployments/{network}.json` | Chainlink Functions consumer |

## Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Configure .env with your values
```

## Configuration

Edit `.env` with your configuration:

```bash
# Network RPCs
RPC_URL_AMOY=https://rpc-amoy.polygon.technology/
RPC_URL_POLYGON=https://polygon-rpc.com/

# Governance addresses
ADMIN_ADDRESS=0xYourAdminAddress
ADMIN_PRIVATE_KEY=yourPrivateKey

# Operator (minter/burner)
OPERATOR_ADDRESS=0xYourOperatorAddress
OPERATOR_PRIVATE_KEY=yourPrivateKey

# Chainlink Functions
FUNCTIONS_SUBSCRIPTION_ID=123
DON_ID=fun-polygon-amoy-1

# Custodian API
POR_API_URL=https://my.ftassetmanagement.com/api/bcl.asp
POR_TTL_SECONDS=900
POR_POLL_SECONDS=300

# Polygonscan
POLYGONSCAN_API_KEY=SQFCTQ8UVHUN883CFCNVWZF8SF4QVVJSRY
```

## Deployment

### 1. Compile Contracts

```bash
npm run compile
```

### 2. Run Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run with gas reporting
npm run test:gas
```

### 3. Deploy to Amoy Testnet

```bash
npm run deploy:amoy
```

### 4. Verify on Polygonscan

```bash
npm run verify:amoy
```

### 5. Configure Chainlink Functions

```bash
# Create subscription at functions.chain.link
# Fund subscription with LINK
# Add VetraFunctionsConsumer as approved consumer
```

### 6. Test Oracle Updates

```bash
npx hardhat poke-oracle --network amoy
npx hardhat read-reserve --network amoy
```

### 7. Deploy to Polygon Mainnet

```bash
npm run deploy:polygon
npm run verify:polygon
```

## Usage

### Hardhat Tasks

#### Mint Tokens
```bash
npx hardhat mint \
  --to 0xRecipientAddress \
  --amount 1000 \
  --network polygon
```

#### Burn Tokens
```bash
npx hardhat burn \
  --from 0xAddress \
  --amount 500 \
  --network polygon
```

#### Check Balance
```bash
npx hardhat balance \
  --account 0xAddress \
  --network polygon
```

#### Read Reserve Data
```bash
npx hardhat read-reserve --network polygon
```

#### Trigger Oracle Update
```bash
npx hardhat poke-oracle --network polygon
```

#### Pause Contract
```bash
npx hardhat pause --network polygon
npx hardhat unpause --network polygon
```

#### Grant Roles
```bash
npx hardhat grant-role \
  --contract vetra \
  --role MINTER_ROLE \
  --account 0xAddress \
  --network polygon
```

#### Token Info
```bash
npx hardhat token-info --network polygon
```

### Monitoring

Run the monitoring script to check system invariants:

```bash
npx hardhat run scripts/monitor.ts --network polygon
```

This checks:
- ✅ Total supply ≤ reserve balance (1:1 backing)
- ✅ Reserve data is fresh (within TTL)
- ✅ Nonce progression (updates received)

## Security

### Access Control

- **DEFAULT_ADMIN_ROLE**: Can upgrade contracts, pause, set caps, manage roles
- **MINTER_ROLE**: Can mint new tokens
- **BURNER_ROLE**: Can burn tokens
- **UPDATER_ROLE**: Can update ReserveOracle (granted to FunctionsConsumer)
- **REQUESTER_ROLE**: Can trigger Chainlink Functions requests

### Key Security Features

1. **UUPS Upgradeability**: Only ADMIN can upgrade contracts
2. **Pausable**: Emergency stop for mint/burn operations
3. **TTL Enforcement**: Rejects stale reserve data (>15 minutes)
4. **Nonce Replay Protection**: Monotonically increasing nonces prevent replay attacks
5. **Role-Based Access**: Granular permissions for all operations
6. **Event Emission**: Complete audit trail

### Multisig Recommendation

For production, use a multisig wallet (e.g., Gnosis Safe) for the ADMIN role:

```bash
# After deployment, transfer admin to multisig
npx hardhat grant-role \
  --contract vetra \
  --role ADMIN \
  --account 0xMultisigAddress \
  --network polygon
```

See [SECURITY.md](./SECURITY.md) for detailed security practices.

## Testing

Test suite includes:

- **Vetra.sol**: 50 tests, 97.44% coverage
- **ReserveOracle.sol**: 40 tests, comprehensive coverage
- **Total**: 90 tests passing

```bash
# Run all tests
npm test

# Run specific test file
npx hardhat test test/Vetra.test.ts

# Coverage report
npm run test:coverage
```

## Upgrading Contracts

### Vetra Upgrade

```bash
# Deploy new implementation
npx hardhat run scripts/upgrade.ts --network polygon
```

### ReserveOracle Upgrade

```bash
# Deploy new implementation
npx hardhat run scripts/upgrade.ts --network polygon
```

Note: VetraFunctionsConsumer is NOT upgradeable due to Chainlink Functions limitations. Deploy a new consumer and update the UPDATER_ROLE if needed.

## License

MIT

## Support

For issues or questions:
- GitHub Issues: [https://github.com/vetra-foundation/vetra-coin/issues](https://github.com/vetra-foundation/vetra-coin/issues)
- Email: contactvtrcoin@gmail.com

## Audit Status

⚠️ **Not yet audited**. Please conduct a professional security audit before mainnet deployment.

Recommended auditors:
- OpenZeppelin
- Trail of Bits
- Consensys Diligence
- Certik

## Roadmap

- [x] Core stablecoin implementation
- [x] Chainlink Functions integration
- [x] Comprehensive test suite
- [x] Deployment scripts
- [x] Monitoring tools
- [ ] Professional security audit
- [ ] Mainnet deployment
- [ ] Polygonscan verification
- [ ] Public dashboard for transparency
- [ ] Automated reserve updates (cron job)

## Acknowledgments

- OpenZeppelin for secure contract libraries
- Chainlink for decentralized oracle network
- FT Asset Management for custody services
- Polygon for scalable infrastructure
