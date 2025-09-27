# Base Fork Testing Makefile
.PHONY: fork-base deploy-onchain create-pool test-happy test-all clean-fork

# Environment variables
BASE_RPC_URL ?= https://mainnet.base.org
RELAYER_EOA ?= 0xc111Ea84c2FBF21E45d837FF32DD3399CBfeF480

fork-base: ## Start Anvil fork with BASE RPC (blocking)
	@echo "Starting Anvil fork on Base mainnet..."
	anvil --fork-url $(BASE_RPC_URL) --host 0.0.0.0 --port 8545

deploy-onchain: ## Run DeployOnchainTrio.s.sol
	@if [ -z "$(PRIVATE_KEY)" ]; then echo "Error: PRIVATE_KEY must be provided"; exit 1; fi
	@echo "Deploying contracts on Base fork..."
	@PRIVATE_KEY=$(PRIVATE_KEY) RELAYER_EOA=$(RELAYER_EOA) \
		forge script script/DeployOnchainTrio.s.sol \
		--fork-url http://127.0.0.1:8545 --broadcast -vv

create-pool: ## Run CreatePoolAndSeed.s.sol (uses sqrtPriceX96 above)
	@if [ -z "$(PRIVATE_KEY)" ]; then echo "Error: PRIVATE_KEY must be provided"; exit 1; fi
	@echo "Creating pool with liquidity..."
	@TREASURY_HOOK=$(TREASURY_HOOK) \
	PRIVATE_KEY=$(PRIVATE_KEY) \
	forge script script/CreatePoolAndSeed.s.sol \
		--fork-url http://127.0.0.1:8545 \
		--private-key $(PRIVATE_KEY) \
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
