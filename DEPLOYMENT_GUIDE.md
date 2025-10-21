# Vetra Stablecoin - Deployment Guide

## Quick Start

This guide walks you through deploying Vetra stablecoin from scratch to production on Polygon.

## Prerequisites

- Node.js v18 or higher
- NPM or Yarn
- Git
- Polygon wallet with MATIC for gas
- Chainlink Functions subscription (for oracle updates)
- Polygonscan API key

## Step-by-Step Deployment

### 1. Initial Setup

```bash
# Clone repository (if applicable)
cd Vetra-coin

# Install dependencies
npm install

# Verify installation
npm run compile
npm test
```

Expected output:
- ✅ Compilation successful
- ✅ 90 tests passing

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```bash
# Required values:
ADMIN_ADDRESS=0xYourMultisigAddress
ADMIN_PRIVATE_KEY=yourPrivateKey

OPERATOR_ADDRESS=0xYourOperatorAddress
OPERATOR_PRIVATE_KEY=yourPrivateKey

POLYGONSCAN_API_KEY=yourApiKey

# Chainlink Functions (get from functions.chain.link)
FUNCTIONS_SUBSCRIPTION_ID=123
```

### 3. Deploy to Amoy Testnet

```bash
# Deploy contracts
npm run deploy:amoy
```

This will:
1. Deploy Vetra (UUPS proxy)
2. Deploy ReserveOracle (UUPS proxy)
3. Deploy VetraFunctionsConsumer
4. Grant UPDATER_ROLE to FunctionsConsumer
5. Save addresses to `deployments/amoy-80002.json`

Expected output:
```
✅ Vetra deployed at: 0x...
✅ ReserveOracle deployed at: 0x...
✅ VetraFunctionsConsumer deployed at: 0x...
```

### 4. Verify Contracts on Polygonscan

```bash
npm run verify:amoy
```

This verifies all contracts on Amoy Polygonscan.

### 5. Set Up Chainlink Functions

#### 5.1 Create Subscription

1. Go to [functions.chain.link](https://functions.chain.link)
2. Connect wallet (Amoy network)
3. Create new subscription
4. Note the subscription ID

#### 5.2 Fund Subscription

1. Add LINK tokens to subscription (minimum 2 LINK recommended)
2. Get testnet LINK from [Chainlink Faucet](https://faucets.chain.link/polygon-amoy)

#### 5.3 Add Consumer

1. In Functions subscription dashboard
2. Click "Add Consumer"
3. Enter VetraFunctionsConsumer address from deployment
4. Confirm transaction

#### 5.4 Update .env

```bash
FUNCTIONS_SUBSCRIPTION_ID=123  # Your subscription ID
```

### 6. Test Oracle Updates

```bash
# Trigger manual oracle update
npx hardhat poke-oracle --network amoy

# Wait 30-60 seconds for Chainlink DON to fulfill

# Check reserve data
npx hardhat read-reserve --network amoy
```

Expected output:
```
Balance:        $100000000.0 USD
Timestamp:      2025-10-21T14:03:20.000Z
Nonce:          1
Is Valid:       ✅ Yes
```

### 7. Test Token Operations

```bash
# Check token info
npx hardhat token-info --network amoy

# Mint tokens (as operator)
npx hardhat mint \
  --to 0xYourAddress \
  --amount 1000 \
  --network amoy

# Check balance
npx hardhat balance \
  --account 0xYourAddress \
  --network amoy

# Burn tokens
npx hardhat burn \
  --from 0xYourAddress \
  --amount 500 \
  --network amoy
```

### 8. Monitor System

```bash
# Run monitoring script
npx hardhat run scripts/monitor.ts --network amoy
```

This checks:
- ✅ Backing invariant (supply ≤ reserves)
- ✅ Reserve data freshness
- ✅ Nonce progression

### 9. Deploy to Polygon Mainnet

⚠️ **IMPORTANT**: Only deploy to mainnet after:
- [ ] Professional security audit completed
- [ ] All tests passing
- [ ] Tested thoroughly on Amoy for 1+ week
- [ ] Multisig wallet set up for admin
- [ ] Monitoring infrastructure in place
- [ ] Incident response plan documented

```bash
# Deploy to mainnet
npm run deploy:polygon

# Verify on Polygonscan
npm run verify:polygon

# Set up Chainlink Functions on mainnet
# (Same process as testnet, but use mainnet LINK)

# Transfer admin to multisig
npx hardhat grant-role \
  --contract vetra \
  --role ADMIN \
  --account 0xMultisigAddress \
  --network polygon
```

## Post-Deployment Checklist

### Immediate (Day 1)

- [ ] Verify all contracts on Polygonscan
- [ ] Test mint/burn operations
- [ ] Verify oracle updates working
- [ ] Set up monitoring alerts
- [ ] Test pause/unpause functionality
- [ ] Document all deployed addresses

### Short-term (Week 1)

- [ ] Transfer admin to multisig
- [ ] Set up automated oracle updates (cron job)
- [ ] Configure monitoring dashboards
- [ ] Test incident response procedures
- [ ] Announce to community
- [ ] Update documentation

### Medium-term (Month 1)

- [ ] Monitor system 24/7
- [ ] Review all transactions
- [ ] Collect user feedback
- [ ] Plan for first upgrade (if needed)
- [ ] Security review
- [ ] Performance optimization

### Long-term (Ongoing)

- [ ] Monthly security reviews
- [ ] Quarterly audits
- [ ] Annual key rotation
- [ ] Community governance
- [ ] Continuous monitoring

## Troubleshooting

### Deployment Fails

**Error**: "Insufficient funds"
- **Solution**: Add more MATIC to deployer wallet

**Error**: "Nonce too high"
- **Solution**: Reset account nonce or wait for pending transactions

**Error**: "Contract verification failed"
- **Solution**: Check Polygonscan API key, retry after a few minutes

### Oracle Updates Not Working

**Error**: "Request too soon"
- **Solution**: Wait for request interval (5 minutes) to pass

**Error**: "UnexpectedRequestID"
- **Solution**: Check that FunctionsConsumer is added to subscription

**Error**: "Stale data"
- **Solution**: Check custodian API is responding, verify TTL settings

### Role Issues

**Error**: "AccessControlUnauthorizedAccount"
- **Solution**: Grant required role using `grant-role` task

**Error**: "Cannot upgrade"
- **Solution**: Ensure signer has DEFAULT_ADMIN_ROLE

## Common Tasks

### Adding a New Minter

```bash
npx hardhat grant-role \
  --contract vetra \
  --role MINTER_ROLE \
  --account 0xNewMinterAddress \
  --network polygon
```

### Revoking a Role

```bash
# Use hardhat console
npx hardhat console --network polygon

# In console:
const vetra = await ethers.getContractAt("Vetra", "0xVetraAddress")
const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"))
await vetra.revokeRole(MINTER_ROLE, "0xOldMinterAddress")
```

### Updating Mint Cap

```bash
# Use hardhat console
npx hardhat console --network polygon

# In console:
const vetra = await ethers.getContractAt("Vetra", "0xVetraAddress")
await vetra.setMintCap(ethers.parseEther("10000000")) // $10M cap
```

### Emergency Pause

```bash
# Pause immediately
npx hardhat pause --network polygon

# Verify paused
npx hardhat token-info --network polygon

# Unpause when safe
npx hardhat unpause --network polygon
```

### Upgrading Contracts

```bash
# Deploy new implementation
npx hardhat run scripts/upgrade.ts --network polygon

# Follow upgrade checklist in SECURITY.md
```

## Monitoring Setup

### Automated Monitoring (Cron)

Set up cron job to run monitoring every 5 minutes:

```bash
# Edit crontab
crontab -e

# Add entry:
*/5 * * * * cd /path/to/Vetra-coin && npx hardhat run scripts/monitor.ts --network polygon >> /var/log/vetra-monitor.log 2>&1
```

### Alerts

Set up alerts for critical events:

1. **Email Alerts**
   - Use SendGrid, Mailgun, or AWS SES
   - Alert on invariant violations
   - Alert on admin actions

2. **Slack/Discord Alerts**
   - Webhook integration
   - Real-time notifications
   - Channel for emergencies

3. **PagerDuty Integration**
   - Critical alerts
   - On-call rotation
   - Escalation policies

## Support

### Documentation

- [README.md](./README.md) - Overview and usage
- [SECURITY.md](./SECURITY.md) - Security practices
- This guide - Deployment procedures

### Help

- GitHub Issues: [Repository issues]
- Email: contactvtrcoin@gmail.com
- Discord: [Link to Discord]

### Emergency Contacts

- Security Team: security@vetra.foundation
- Multisig Signers: [Contact list]
- Infrastructure: ops@vetra.foundation

## Version History

- v1.0.0 (2025-10-21): Initial deployment guide

---

**Last Updated**: October 21, 2025
