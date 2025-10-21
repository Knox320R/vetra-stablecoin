# Security Policy

## Overview

This document outlines security practices, threat models, and operational procedures for the Vetra stablecoin system.

## Security Architecture

### Access Control Model

```
DEFAULT_ADMIN_ROLE (Governance)
├── Can upgrade contracts (UUPS)
├── Can pause/unpause
├── Can set mint caps
├── Can manage allowlist
├── Can grant/revoke all roles
└── Can update configuration

MINTER_ROLE (Operator)
├── Can mint new tokens
└── Requires reserve backing

BURNER_ROLE (Operator)
├── Can burn tokens
└── Used for redemptions

UPDATER_ROLE (Chainlink Functions)
├── Can update ReserveOracle
└── Enforces TTL and nonce checks

REQUESTER_ROLE (Automation)
├── Can trigger Chainlink Functions requests
└── Subject to rate limiting
```

## Key Management

### Private Keys

**CRITICAL**: Never commit private keys to version control.

#### Production Keys

1. **Admin Private Key** (ADMIN_ADDRESS)
   - Should be a multisig wallet (Gnosis Safe recommended)
   - Minimum 3-of-5 signers
   - Geographically distributed signers
   - Hardware wallet signers preferred
   - Rotate annually

2. **Operator Private Key** (OPERATOR_ADDRESS)
   - Hot wallet for minting/burning operations
   - Keep in secure key management system (AWS KMS, HashiCorp Vault)
   - Rotate quarterly
   - Monitor all transactions
   - Set up alerts for unusual activity

3. **Requester Private Key** (Chainlink automation)
   - Bot wallet for triggering oracle updates
   - Minimal funds (only gas)
   - Rotate monthly

#### Development/Testnet Keys

- Use separate keys from production
- Never reuse testnet keys in production
- Document all testnet key addresses
- Safe to share testnet keys within team (not production)

### Environment Variables

Store secrets in `.env` file (never commit):

```bash
# Production
ADMIN_PRIVATE_KEY=0x...          # Multisig wallet
OPERATOR_PRIVATE_KEY=0x...       # Hot wallet (encrypted at rest)

# Use environment-specific .env files
.env.production     # Production secrets (encrypted, restricted access)
.env.staging        # Staging secrets
.env.development    # Development secrets (can be shared)
```

### Key Storage Best Practices

1. **Production Keys**
   - Store in hardware wallets (Ledger, Trezor)
   - Use multisig (Gnosis Safe)
   - Enable 2FA for all accounts
   - Backup mnemonics in secure, offline locations
   - Use separate backups for each signer

2. **Operator Keys**
   - Use HSM or KMS (AWS KMS, Google Cloud KMS)
   - Encrypt at rest
   - Audit all access
   - Set up rotation policies
   - Monitor usage patterns

3. **API Keys**
   - Rotate Polygonscan API key quarterly
   - Restrict Chainlink Functions subscription to specific consumers
   - Monitor API usage for anomalies

## Upgrade Procedures

### UUPS Upgrade Process

Only ADMIN can upgrade contracts. Follow this checklist:

#### Pre-Upgrade

- [ ] Code review by 2+ developers
- [ ] Security audit of changes
- [ ] Comprehensive testing on local network
- [ ] Deploy to Amoy testnet
- [ ] Test all functionality on Amoy
- [ ] Verify storage layout compatibility
- [ ] Test upgrade process on Amoy
- [ ] Monitor for 24-48 hours on Amoy

#### Upgrade Execution

- [ ] Prepare multisig transaction
- [ ] Collect required signatures
- [ ] Deploy new implementation
- [ ] Verify implementation on Polygonscan
- [ ] Execute upgrade via multisig
- [ ] Verify proxy points to new implementation
- [ ] Test all critical functions
- [ ] Monitor events and logs

#### Post-Upgrade

- [ ] Verify storage state preserved
- [ ] Test mint/burn operations
- [ ] Verify reserve oracle updates
- [ ] Monitor for 24 hours
- [ ] Document upgrade in changelog
- [ ] Announce to community

### Rollback Plan

In case of upgrade failure:

1. **Immediate Actions**
   - Pause contract if necessary
   - Assess impact
   - Gather multisig signers

2. **Rollback Execution**
   - Deploy previous implementation
   - Upgrade proxy back to previous version
   - Verify rollback successful
   - Test critical functions

3. **Post-Rollback**
   - Investigate root cause
   - Fix issues
   - Re-audit
   - Attempt upgrade again

## Incident Response

### Emergency Pause Protocol

If a critical vulnerability is discovered:

1. **Immediate** (< 5 minutes)
   - Admin calls `pause()` on Vetra contract
   - Halts all minting and burning
   - Transfers continue (ERC-20 standard)

2. **Assessment** (< 1 hour)
   - Identify scope of vulnerability
   - Determine impact (users, funds, data)
   - Gather multisig signers
   - Prepare communication

3. **Mitigation** (< 24 hours)
   - Deploy fix if available
   - Upgrade contracts if needed
   - Test fix on testnet first
   - Execute upgrade via multisig

4. **Recovery** (24-48 hours)
   - Verify fix successful
   - Unpause contract
   - Monitor closely
   - Communicate with users

5. **Post-Mortem** (< 1 week)
   - Document incident
   - Identify root cause
   - Implement preventive measures
   - Update security procedures

### Contact Information

**Security Team**
- Email: security@vetra.foundation
- PGP Key: [Link to PGP key]
- Emergency Hotline: [Phone number]

**Multisig Signers**
- Signer 1: [Name], [Contact]
- Signer 2: [Name], [Contact]
- Signer 3: [Name], [Contact]
- Signer 4: [Name], [Contact]
- Signer 5: [Name], [Contact]

## Vulnerability Disclosure

### Responsible Disclosure

If you discover a security vulnerability:

1. **DO NOT** disclose publicly
2. Email security@vetra.foundation with:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

3. We will respond within 24 hours
4. We will work with you to verify and fix
5. We will credit you in public disclosure (if desired)

### Bug Bounty

We offer rewards for responsible disclosure:

- **Critical**: $10,000 - $50,000
- **High**: $5,000 - $10,000
- **Medium**: $1,000 - $5,000
- **Low**: $100 - $1,000

Scope:
- Smart contracts
- Infrastructure
- Chainlink Functions integration
- Oracle manipulation

Out of scope:
- Social engineering
- Physical attacks
- Third-party services

## Threat Model

### Threats & Mitigations

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| **Private key compromise** | Critical | Medium | Multisig, HSM, key rotation |
| **Stale reserve data** | High | Low | TTL enforcement, nonce checks |
| **Oracle manipulation** | High | Low | Chainlink DON, response validation |
| **Reentrancy attack** | High | Low | OpenZeppelin contracts, checks-effects-interactions |
| **Upgrade to malicious code** | Critical | Low | Multisig, code review, audit |
| **Denial of service** | Medium | Medium | Pause mechanism, rate limiting |
| **Front-running** | Low | High | Acceptable for stablecoin operations |

### Attack Scenarios

#### 1. Malicious Upgrade
**Scenario**: Attacker compromises admin key and upgrades to malicious contract

**Prevention**:
- Multisig requirement (3-of-5)
- Code review process
- Timelock on upgrades (future improvement)

**Detection**:
- Monitor upgrade events
- Automated alerts on admin actions
- Community oversight

#### 2. Oracle Manipulation
**Scenario**: Attacker provides false reserve data

**Prevention**:
- Chainlink DON (decentralized oracle network)
- TTL enforcement (15 minutes)
- Nonce monotonicity (replay protection)
- Response validation

**Detection**:
- Monitor reserve updates
- Alert on unusual changes
- Compare with custodian API directly

#### 3. Key Compromise
**Scenario**: Operator key stolen, unauthorized minting

**Prevention**:
- Reserve backing checks
- Multisig for admin operations
- Key rotation policy
- Monitoring and alerts

**Detection**:
- Monitor mint events
- Alert on large mints
- Check reserve backing ratio

## Monitoring & Alerts

### Critical Alerts

Set up automated monitoring for:

1. **Backing Invariant**
   - Alert if totalSupply > reserveBalance
   - Check every block or every 5 minutes
   - Severity: CRITICAL

2. **Reserve Staleness**
   - Alert if reserve data > 15 minutes old
   - Check every 5 minutes
   - Severity: HIGH

3. **Large Mints/Burns**
   - Alert if single mint/burn > $1M
   - Immediate notification
   - Severity: MEDIUM

4. **Admin Actions**
   - Alert on any admin role action
   - Log all upgrade attempts
   - Severity: HIGH

5. **Contract Pause**
   - Alert immediately if paused
   - Notify all stakeholders
   - Severity: CRITICAL

### Monitoring Script

Run continuously:

```bash
# Monitor system invariants
npx hardhat run scripts/monitor.ts --network polygon

# Set up cron job (every 5 minutes)
*/5 * * * * cd /path/to/vetra-coin && npx hardhat run scripts/monitor.ts --network polygon
```

## Audit Requirements

### Pre-Launch Audit

Required before mainnet deployment:

1. **Smart Contract Audit**
   - OpenZeppelin, Trail of Bits, or Consensys Diligence
   - Minimum 2-week engagement
   - Full coverage of all contracts
   - Re-audit after any changes

2. **Infrastructure Audit**
   - Review key management
   - Review deployment procedures
   - Review monitoring setup
   - Review incident response

3. **Economic Audit**
   - Review tokenomics
   - Review reserve management
   - Review redemption process
   - Review fee structure

### Ongoing Audits

- Annual security review
- Audit before major upgrades
- Continuous bug bounty program
- Community code reviews

## Compliance

### Regulatory Compliance

- KYC/AML for large holders (optional)
- Regular reserve attestations
- Transparent reporting
- Regulatory consultation

### Operational Compliance

- SOC 2 compliance for infrastructure
- Regular security training
- Incident response drills
- Disaster recovery testing

## Best Practices Checklist

### Development

- [ ] All code reviewed by 2+ developers
- [ ] Comprehensive test coverage (>95%)
- [ ] No hardcoded secrets
- [ ] All dependencies up to date
- [ ] Static analysis tools used
- [ ] Linting enforced

### Deployment

- [ ] Testnet deployment first
- [ ] Mainnet deployment checklist followed
- [ ] All contracts verified on Polygonscan
- [ ] Deployment documented
- [ ] Rollback plan prepared

### Operations

- [ ] Monitoring alerts configured
- [ ] Backup procedures tested
- [ ] Key rotation schedule followed
- [ ] Incident response plan updated
- [ ] Team trained on procedures

### Governance

- [ ] Multisig configured correctly
- [ ] Signer list maintained
- [ ] Communication channels established
- [ ] Voting thresholds documented
- [ ] Emergency contacts updated

## References

- [OpenZeppelin Security](https://docs.openzeppelin.com/contracts/4.x/security)
- [Consensys Smart Contract Best Practices](https://consensys.github.io/smart-contract-best-practices/)
- [Chainlink Security Best Practices](https://docs.chain.link/architecture-overview/architecture-security)
- [Gnosis Safe Documentation](https://docs.safe.global/)

## Version History

- v1.0.0 (2025-10-21): Initial security policy

## Contact

For security concerns:
- Email: security@vetra.foundation
- PGP: [Link to key]
- Emergency: [Contact method]

**Last Updated**: October 21, 2025
