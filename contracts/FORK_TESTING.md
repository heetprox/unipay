# Base Mainnet Fork Testing

This directory contains comprehensive fork testing for the Uniswap v4 + Treasury Hook system on Base mainnet.

## System Overview

The system consists of four main components:
- **TreasuryHook**: Validates NFT tickets, consumes them once, and sponsors swaps from a treasury vault
- **SponsorVault**: Secure vault holding ETH and ERC-20 tokens that pays the PoolManager when instructed by authorized hooks
- **TicketNFT**: ERC-721 implementation for transaction tickets with role-based access control
- **PoolManagerWrapper**: Router that wraps PoolManager.unlock() calls with relayer access control

## Base Mainnet Configuration

- **Chain ID**: 8453 (Base)
- **PoolManager**: `0x498581ff718922c3f8e6a244956af099b2652b2b`
- **Target Pool**: ETH/USDC 0.05% (fee: 500, tick spacing: 10)
- **ETH Address**: `0x0000000000000000000000000000000000000000` (native)
- **USDC Address**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

## Setup Instructions

### 1. Environment Variables

Create a `.env` file:
```bash
# Required for deployment scripts
PRIVATE_KEY=your_private_key_here
TREASURY_HOOK=deployed_treasury_hook_address

# Required for fork testing
BASE_RPC_URL=https://mainnet.base.org
# or use your preferred Base RPC provider
```

### 2. Start Anvil Fork

Start a local fork of Base mainnet:
```bash
anvil --fork-url $BASE_RPC_URL --chain-id 8453
```

This creates a local fork at `http://127.0.0.1:8545`

### 3. Deploy Contracts

Deploy the entire system:
```bash
forge script script/DeployOnchainTrio.s.sol --fork-url http://127.0.0.1:8545 --broadcast
```

This will:
- Deploy all four contracts
- Wire them together (set hook addresses, authorize vault, etc.)
- Configure relayer permissions
- Enable the ETH/USDC pool
- Log all deployed addresses

### 4. Initialize Pool (Optional)

If the pool doesn't exist yet:
```bash
TREASURY_HOOK=<deployed_hook_address> forge script script/CreatePoolAndSeed.s.sol --fork-url http://127.0.0.1:8545 --broadcast
```

**Note**: The script initializes the pool but doesn't add liquidity (requires Position Manager).

### 5. Run Tests

Execute the comprehensive fork test suite:
```bash
forge test --fork-url http://127.0.0.1:8545 -vv
```

Or run specific tests:
```bash
# Run just the BaseFork tests
forge test --match-contract BaseForkTest --fork-url http://127.0.0.1:8545 -vv

# Run specific test functions
forge test --match-test testHappyPathSwapClaimOnly --fork-url http://127.0.0.1:8545 -vvvv
```

## Test Coverage

The `BaseFork.t.sol` test suite covers:

### Happy Path Tests
- ✅ **Swap with claims only**: User gets ERC-6909 claims, no immediate token transfer
- ✅ **Swap with immediate take**: User gets tokens directly via `immediateTake=true`
- ✅ **ERC-6909 claims management**: Convert claims to tokens using `takeTokens()`

### Security Tests
- ✅ **Replay attack prevention**: Same `txnId` cannot be used twice
- ✅ **Missing ticket validation**: Swap fails if ticket doesn't exist
- ✅ **Deadline enforcement**: Expired deadlines are rejected
- ✅ **Pause mechanisms**: Both hook and wrapper can be paused
- ✅ **Pool allowlisting**: Only enabled pools can be used
- ✅ **Relayer access control**: Only authorized relayers can execute swaps

### Gas Usage Tests
- ✅ **Swap-only gas**: < 300k gas (meets requirement)
- ✅ **Swap + immediate take**: < 350k gas (meets requirement)

### Event Testing
- ✅ **TicketConsumed**: Emitted when ticket is validated and burned
- ✅ **Paid**: Emitted when vault sponsors the swap input
- ✅ **SwapSubmitted**: Emitted by wrapper for all swaps
- ✅ **ImmediateTake**: Emitted when tokens are taken immediately
- ✅ **TokensTaken**: Emitted when ERC-6909 claims are converted

## Key Features Demonstrated

### 1. End-to-End Swap Flow
1. Relayer calls `wrapper.swapWithHook()`
2. Wrapper validates permissions and pool status
3. Hook validates ticket ownership and deadline
4. Hook burns ticket and marks `txnId` as used
5. Vault sponsors the input amount to PoolManager
6. User receives ERC-6909 claims or immediate tokens

### 2. Dual Settlement Options
- **Immediate**: Set `immediateTake=true` for direct token transfer
- **Deferred**: Set `immediateTake=false`, then call `takeTokens()` later

### 3. Security Guarantees
- **One-time use**: Each ticket can only be consumed once
- **Time-bounded**: All swaps have deadlines
- **Access controlled**: Only authorized relayers can execute
- **Pool restricted**: Only enabled pools can be used
- **Emergency controls**: System can be paused if needed

## Troubleshooting

### Common Issues

**"Pool not initialized"**
- Run the `CreatePoolAndSeed.s.sol` script
- Or manually initialize the pool via PoolManager

**"Insufficient balance" in vault**
- The deployment script funds the vault automatically
- For custom amounts, send ETH/USDC to the vault address

**"No liquidity" errors**
- The pool needs liquidity to perform swaps
- Add liquidity via Uniswap v4 Position Manager
- Or use a different pool that already has liquidity

**Fork connection issues**
- Ensure Anvil is running with the correct chain ID (8453)
- Check your `BASE_RPC_URL` is accessible
- Verify the fork URL in test commands

### Gas Issues

If tests fail gas requirements:
- Check if the pool has sufficient liquidity
- Verify hook address validation (may need CREATE2 mining)
- Ensure all contracts are properly optimized

## File Structure

```
script/
├── DeployOnchainTrio.s.sol     # Deploy all contracts and wire them
└── CreatePoolAndSeed.s.sol     # Initialize pool (optional)

test/
├── BaseFork.t.sol              # Main fork test suite
└── utils/
    └── ForkUtils.sol           # Helper utilities for fork testing

src/
├── TreasuryHook.sol            # Main hook contract
├── SponsorVault.sol            # Treasury vault
├── TicketNFT.sol               # NFT tickets
└── PoolManagerWrapper.sol      # Relayer-controlled router
```

## Production Considerations

Before mainnet deployment:

1. **Hook Address Mining**: Use CREATE2 to mine hook addresses with proper bit flags
2. **Access Control**: Set up proper multi-sig ownership
3. **Relayer Management**: Implement relayer rotation and monitoring
4. **Vault Funding**: Set up automated vault funding mechanisms
5. **Monitoring**: Add comprehensive event monitoring and alerting
6. **Emergency Procedures**: Test pause/unpause mechanisms thoroughly

The fork tests provide a solid foundation for ensuring the system works correctly before mainnet deployment.