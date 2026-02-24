# DEX AMM Project

## Overview

This project implements a simplified Decentralized Exchange (DEX) using the Automated Market Maker (AMM) model, similar to Uniswap V2. The DEX enables trustless, peer-to-peer token swapping without the need for order books or centralized intermediaries. Users can provide liquidity to earn trading fees or swap between ERC-20 tokens using the constant product formula.

The implementation features:
- Non-custodial trading where users retain full control of their assets
- Permissionless liquidity provision and trading
- On-chain price discovery through automated market making 
- Transparent fee distribution to liquidity providers  
 
## Features

### Core Functionality
- **Initial and subsequent liquidity provision**: First provider sets the initial price ratio; subsequent providers add liquidity proportionally
- **Liquidity removal with proportional share calculation**: LP token holders can redeem their share of the pool at any time
- **Token swaps using constant product formula (x × y = k)**: Automated pricing mechanism ensures liquidity is always available
- **0.3% trading fee for liquidity providers**: Fees accumulate in the pool and benefit all LPs proportionally
- **LP token minting and burning**: ERC-20-like tokens represent ownership share of the liquidity pool

### Security Features
- **ReentrancyGuard protection**: Prevents reentrancy attacks on critical functions
- **SafeERC20 usage**: Safe token transfer operations that handle non-standard ERC-20 implementations
- **Input validation**: Comprehensive checks for zero amounts, sufficient balances, and reserve levels
- **Minimum liquidity lock**: Prevents manipulation and division-by-zero errors

## Architecture

### Contract Structure

**DEX.sol** - Main AMM contract implementing:
- Liquidity pool management for token pairs
- LP token accounting (mapping-based implementation)
- Swap execution with automated pricing
- Fee collection and distribution mechanism

**MockERC20.sol** - Test token implementation:
- Standard ERC-20 functionality via OpenZeppelin
- Mint function for testing purposes

### Key Design Decisions

1. **Mapping-based LP Tokens**: Instead of deploying a separate ERC-20 contract, we use a mapping for LP token balances. This reduces gas costs and simplifies the architecture while maintaining the same functionality.

2. **Minimum Liquidity Lock**: Following Uniswap V2, we permanently lock a small amount (1000 wei) of the first liquidity provision. This prevents the pool from ever being completely drained and protects against price manipulation attacks.

3. **Fee-on-input Model**: The 0.3% fee is deducted from the input amount before calculating the output. This is mathematically equivalent to other approaches but simplifies the implementation.

4. **Geometric Mean for Initial LP Tokens**: Using `sqrt(amountA × amountB)` for the first liquidity provision ensures fair valuation regardless of which token is "token A" vs "token B".

## Mathematical Implementation

### Constant Product Formula

The AMM maintains an invariant: **x × y = k**

Where:
- `x` = reserve of token A
- `y` = reserve of token B  
- `k` = constant product (remains constant after trades, ignoring fees)

When a user swaps token A for token B:
```
New reserve A = x + amountIn
New reserve B = k / (x + amountIn)
Amount out = y - (k / (x + amountIn))
```

### Fee Calculation

The 0.3% trading fee is applied to the input amount:

```solidity
amountInWithFee = amountIn × 997 / 1000  // 99.7% of input
numerator = amountInWithFee × reserveOut
denominator = (reserveIn × 1000) + amountInWithFee
amountOut = numerator / denominator
```

This ensures:
- 0.3% of each trade stays in the pool
- Fees benefit all liquidity providers proportionally
- The constant product k increases over time due to accumulated fees

### LP Token Minting

**First Liquidity Provider:**
```
liquidityMinted = sqrt(amountA × amountB) - MINIMUM_LIQUIDITY
```

The geometric mean ensures the initial LP tokens represent fair value regardless of the token ratio chosen.

**Subsequent Liquidity Additions:**
```
liquidityMinted = min(
    (amountA × totalLiquidity) / reserveA,
    (amountB × totalLiquidity) / reserveB
)
```

LP tokens are minted proportionally to the existing pool size to maintain fair ownership distribution.

**Liquidity Removal:**
```
amountA = (liquidityBurned × reserveA) / totalLiquidity
amountB = (liquidityBurned × reserveB) / totalLiquidity
```

Users receive a proportional share of both tokens based on their LP token holdings.

## Setup Instructions

### Prerequisites
- Docker and Docker Compose installed
- Git
- Node.js 18+ (for local development without Docker)

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/yourusername/dex-amm.git
cd dex-amm
```

2. **Start Docker environment:**
```bash
docker-compose up -d
```

3. **Compile contracts:**
```bash
docker-compose exec app npm run compile
```

4. **Run tests:**
```bash
docker-compose exec app npm test
```

5. **Check coverage:**
```bash
docker-compose exec app npm run coverage
```

6. **Stop Docker:**
```bash
docker-compose down
```

### Running Tests Locally (without Docker)

```bash
# Install dependencies
npm install

# Compile contracts
npm run compile

# Run tests
npm test

# Generate coverage report
npm run coverage
```

### Deploying to Local Network

```bash
# Start local Hardhat node
npx hardhat node

# In another terminal, deploy contracts
npm run deploy
```

## Testing

The test suite includes 28 comprehensive test cases covering:

- **Liquidity Management (8 tests)**: Initial provision, LP token minting, subsequent additions, removals, edge cases
- **Token Swaps (8 tests)**: Bidirectional swaps, fee calculations, reserve updates, multiple swaps
- **Price Calculations (3 tests)**: Initial price, price updates, zero reserve handling
- **Fee Distribution (2 tests)**: Fee accumulation, proportional distribution
- **Edge Cases (3 tests)**: Small amounts, large amounts, access control
- **Events (3 tests)**: Proper event emission for all operations

All tests use Hardhat's testing framework with Chai assertions and achieve >95% code coverage.

## Contract Addresses

*To be updated after deployment to testnet*

### Local Hardhat Network
After running deployment script, addresses are saved in `deployment-info.json`

### Sepolia Testnet
- Token A: `TBD`
- Token B: `TBD`
- DEX: `TBD`

## Known Limitations

1. **Single Token Pair**: The current implementation supports only one token pair per DEX contract. Multiple pairs would require deploying multiple contracts or implementing a factory pattern.

2. **No Slippage Protection**: Users should implement slippage checks on the frontend by comparing expected output with actual output and reverting if the difference exceeds tolerance.

3. **No Price Oracle**: The DEX price is purely determined by the pool ratio and can be manipulated by large trades. External price oracles would be needed for production use.

4. **Rounding Errors**: Integer division in Solidity causes small rounding errors. The implementation uses "multiply before divide" best practices to minimize this.

5. **First LP Disadvantage**: The first liquidity provider loses MINIMUM_LIQUIDITY (1000 wei) permanently. This is a known tradeoff for security.

6. **Gas Costs**: Not optimized for gas efficiency. Production implementations would use techniques like packed storage and assembly for critical operations.

## Security Considerations

### Implemented Protections

1. **ReentrancyGuard**: All state-changing functions use the `nonReentrant` modifier to prevent reentrancy attacks.

2. **SafeERC20**: Uses OpenZeppelin's SafeERC20 library to handle non-standard token implementations safely.

3. **Input Validation**: All functions validate inputs (non-zero amounts, sufficient balances, adequate reserves).

4. **Overflow Protection**: Using Solidity 0.8+ with built-in overflow/underflow checks.

5. **Minimum Liquidity**: Locks minimum liquidity to prevent complete pool drainage and division-by-zero errors.

6. **Access Control**: Users can only remove their own liquidity (implicit through balance check).

### Recommended Audits

Before production deployment:
- [ ] Professional security audit
- [ ] Formal verification of mathematical invariants
- [ ] Fuzzing tests for edge cases
- [ ] Economic analysis of fee structure
- [ ] Gas optimization review

### Known Attack Vectors (Mitigated)

- **Front-running**: Market makers and arbitrageurs can front-run trades. Consider implementing deadline parameters and minimum output amounts.
- **Price Manipulation**: Large holders can manipulate prices. Consider rate limiting or time-weighted average prices (TWAP).
- **Flash Loan Attacks**: Not directly vulnerable, but consider implications if integrating with lending protocols.

## Development

### Project Structure
```
dex-amm/
├── contracts/
│   ├── DEX.sol              # Main AMM contract
│   └── MockERC20.sol        # Test token
├── test/
│   └── DEX.test.js          # Comprehensive test suite
├── scripts/
│   └── deploy.js            # Deployment script
├── Dockerfile               # Docker configuration
├── docker-compose.yml       # Docker Compose setup
├── .dockerignore           # Docker ignore rules
├── hardhat.config.js       # Hardhat configuration
├── package.json            # Node dependencies
└── README.md              # This file
```

### Key Commands

```bash
# Compile contracts
npm run compile

# Run tests
npm test

# Generate coverage report
npm run coverage

# Deploy to network
npm run deploy

# Clean artifacts
npx hardhat clean
```

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Inspired by Uniswap V2
- Built with Hardhat and OpenZeppelin
- Mathematical formulas based on constant product AMM research

## Future Enhancements

Potential improvements for production:
- [ ] Factory pattern for multiple trading pairs
- [ ] Slippage protection parameters
- [ ] Deadline parameters for time-bound transactions
- [ ] Price oracle integration
- [ ] Flash swap functionality
- [ ] Governance token for protocol fees
- [ ] Multi-hop routing for indirect swaps
- [ ] Gas optimizations using assembly
- [ ] EIP-712 signatures for meta-transactions
- [ ] Integration with aggregators (1inch, Matcha)

---

**⚠️ Disclaimer**: This is an educational implementation. DO NOT use in production without comprehensive security audits and testing.
