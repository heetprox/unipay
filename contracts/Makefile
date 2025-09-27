# UniPay Relayer Deployment Makefile
.PHONY: fork-base deploy-onchain create-pool test-happy test-all clean-fork
.PHONY: deploy-relayer-testnet deploy-relayer-ethereum deploy-relayer-base deploy-relayer-unichain
.PHONY: help

# Load environment variables from .env file
include .env

# Check for required environment variables
check-private-key:
	@if [ -z "$(PRIVATE_KEY)" ]; then echo "Error: PRIVATE_KEY must be set in .env"; exit 1; fi

fork-base: ## Start Anvil fork with BASE RPC (blocking)
	@echo "Starting Anvil fork on Base mainnet..."
	anvil --fork-url $(BASE_RPC_URL) --host 0.0.0.0 --port 8545

deploy-onchain: check-private-key ## Run DeployOnchainTrio.s.sol
	@echo "Deploying contracts on Base fork..."
	@forge script script/DeployOnchainTrio.s.sol \
		--fork-url http://127.0.0.1:8545 --broadcast -vv

create-pool: check-private-key ## Run CreatePoolAndSeed.s.sol (uses sqrtPriceX96 above)
	@echo "Creating pool with liquidity..."
	@forge script script/CreatePoolAndSeed.s.sol \
		--fork-url http://127.0.0.1:8545 \
		--broadcast -vvv

test-happy: ## Run only happy-path tests in BaseFork.t.sol
	@echo "Running happy path tests..."
	@forge test -vvv --match-test "testHappyPath" \
		--fork-url http://127.0.0.1:8545

test-all: ## Run the full suite in BaseFork.t.sol
	@echo "Running full test suite..."
	@forge test -vvv --match-contract BaseForkTest \
		--fork-url http://127.0.0.1:8545

clean-fork: ## Kill Anvil processes
	@echo "Cleaning up fork..."
	@pkill -f "anvil.*fork-url" || true

# Network-specific relayer deployments
deploy-relayer-testnet: check-private-key ## Deploy relayer to Unichain Testnet
	@echo "Deploying relayer to Unichain Testnet..."
	@forge script script/RelayerTestnet.s.sol \
		--rpc-url $(UNICHAIN_TESTNET_RPC_URL) \
		--broadcast -vv

deploy-relayer-ethereum: check-private-key ## Deploy relayer to Ethereum Mainnet
	@echo "Deploying relayer to Ethereum Mainnet..."
	@forge script script/Relayer.s.sol \
		--rpc-url $(ETHEREUM_RPC_URL) \
		--broadcast -vv

deploy-relayer-base: check-private-key ## Deploy relayer to Base Mainnet
	@echo "Deploying relayer to Base Mainnet..."
	@forge script script/Relayer.s.sol \
		--rpc-url $(BASE_RPC_URL) \
		--broadcast -vv

deploy-relayer-unichain: check-private-key ## Deploy relayer to Unichain Mainnet
	@echo "Deploying relayer to Unichain Mainnet..."
	@forge script script/Relayer.s.sol \
		--rpc-url $(UNICHAIN_RPC_URL) \
		--broadcast -vv

help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'
