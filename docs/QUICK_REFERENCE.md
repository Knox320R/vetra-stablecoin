# Vetra Stablecoin - Quick Reference

## One-Liners

### Setup
```bash
npm install && npm run compile && npm test
```

### Deploy
```bash
npm run deploy:amoy    # Testnet
npm run deploy:polygon # Mainnet
```

### Verify
```bash
npm run verify:amoy
npm run verify:polygon
```

### Monitor
```bash
npx hardhat read-reserve --network polygon
npx hardhat run scripts/monitor.ts --network polygon
```

## Common Commands

| Task | Command |
|------|---------|
| **Mint 1000 VTR** | `npx hardhat mint --to 0xADDRESS --amount 1000 --network polygon` |
| **Burn 500 VTR** | `npx hardhat burn --from 0xADDRESS --amount 500 --network polygon` |
| **Check balance** | `npx hardhat balance --account 0xADDRESS --network polygon` |
| **Pause contract** | `npx hardhat pause --network polygon` |
| **Unpause contract** | `npx hardhat unpause --network polygon` |
| **Update oracle** | `npx hardhat poke-oracle --network polygon` |
| **Read reserve** | `npx hardhat read-reserve --network polygon` |
| **Token info** | `npx hardhat token-info --network polygon` |
| **Grant role** | `npx hardhat grant-role --contract vetra --role MINTER_ROLE --account 0xADDRESS --network polygon` |

## Contract Addresses

Load from: `deployments/{network}-{chainId}.json`

```bash
cat deployments/amoy-80002.json     # Amoy testnet
cat deployments/polygon-137.json    # Polygon mainnet
```

## Role Hashes

```javascript
DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000"
MINTER_ROLE = keccak256("MINTER_ROLE")
BURNER_ROLE = keccak256("BURNER_ROLE")
UPDATER_ROLE = keccak256("UPDATER_ROLE")
REQUESTER_ROLE = keccak256("REQUESTER_ROLE")
```

## Key Files

| File | Purpose |
|------|---------|
| `contracts/Vetra.sol` | Main stablecoin |
| `contracts/ReserveOracle.sol` | Reserve data |
| `contracts/VetraFunctionsConsumer.sol` | Chainlink integration |
| `scripts/deploy.ts` | Deployment |
| `scripts/monitor.ts` | Monitoring |
| `test/Vetra.test.ts` | 50 tests |
| `test/ReserveOracle.test.ts` | 40 tests |

## Configuration (.env)

```bash
ADMIN_ADDRESS=0x...
ADMIN_PRIVATE_KEY=...
OPERATOR_ADDRESS=0x...
OPERATOR_PRIVATE_KEY=...
FUNCTIONS_SUBSCRIPTION_ID=123
POLYGONSCAN_API_KEY=...
POR_TTL_SECONDS=900
POR_POLL_SECONDS=300
```

## Emergency Procedures

### Contract Compromised
1. `npx hardhat pause --network polygon`
2. Gather multisig signers
3. Investigate issue
4. Deploy fix if needed
5. Upgrade via multisig
6. Test thoroughly
7. Unpause

### Oracle Stuck
1. Check Chainlink subscription funded
2. Verify consumer added to subscription
3. Manually trigger: `npx hardhat poke-oracle --network polygon`
4. Check logs in Chainlink Functions dashboard

### Key Compromised
1. Immediately pause if minter/burner
2. Revoke compromised role
3. Generate new key
4. Grant role to new address
5. Update monitoring
6. Document incident

## Testing

```bash
npm test                  # All tests
npm run test:coverage     # With coverage
npm run test:gas          # With gas reporting

npx hardhat test test/Vetra.test.ts              # Vetra only
npx hardhat test test/ReserveOracle.test.ts      # Oracle only
```

## Monitoring Metrics

- ✅ `totalSupply ≤ reserveBalance` (1:1 backing)
- ✅ Reserve data age ≤ 15 minutes
- ✅ Nonce strictly increasing
- ✅ Contract not paused (unless intentional)

## Useful Links

- Hardhat Docs: https://hardhat.org/docs
- OpenZeppelin: https://docs.openzeppelin.com/contracts
- Chainlink Functions: https://docs.chain.link/chainlink-functions
- Polygon Docs: https://docs.polygon.technology
- Amoy Faucet: https://faucet.polygon.technology
- Chainlink Faucet: https://faucets.chain.link/polygon-amoy

## Support

- Docs: See README.md, SECURITY.md, DEPLOYMENT_GUIDE.md
- Email: contactvtrcoin@gmail.com
- Issues: [GitHub repository]

## Version
Current: v1.0.0 (October 21, 2025)
