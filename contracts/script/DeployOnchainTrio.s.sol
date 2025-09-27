pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TreasuryHook, ITicketNFT} from "../src/TreasuryHook.sol";
import {TicketNFT} from "../src/TicketNFT.sol";
import {PoolManagerWrapper} from "../src/PoolManagerWrapper.sol";
import {HookMiner, HookDeployer} from "../test/HookMiner.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

contract DeployOnchainTrio is Script {
    address constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant ETH = 0x0000000000000000000000000000000000000000;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    uint24 constant POOL_FEE = 500;
    int24 constant TICK_SPACING = 10;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployerEOA = vm.addr(deployerPrivateKey);
        IPoolManager poolManager = IPoolManager(POOL_MANAGER);

        vm.startBroadcast(deployerPrivateKey);

        console2.log("Deploying on Base mainnet fork...");
        console2.log("Deployer:", deployerEOA);
        console2.log("PoolManager:", POOL_MANAGER);
        console2.log("ETH:", ETH);
        console2.log("USDC:", USDC);
        console2.log("");

        console2.log("1. Deploying TicketNFT...");
        TicketNFT ticketNFT = new TicketNFT(
            "Treasury Tickets",
            "TTICKET",
            address(0),
            deployerEOA
        );
        console2.log("   TicketNFT deployed at:", address(ticketNFT));

        console2.log("3. Deploying TreasuryHook with valid address...");
        uint160 flags = uint160(Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG);
        console2.log("   Required flags:", flags);

        HookDeployer hookDeployer = new HookDeployer();

        TreasuryHook hook = hookDeployer.deployTreasuryHook(
            poolManager,
            ITicketNFT(address(ticketNFT)),
            flags
        );
        console2.log("   TreasuryHook deployed at:", address(hook));
        console2.log("   Hook address validation passed!");

        console2.log("4. Deploying PoolManagerWrapper...");
        PoolManagerWrapper wrapper = new PoolManagerWrapper(
            poolManager,
            hook,
            deployerEOA
        );
        console2.log("   PoolManagerWrapper deployed at:", address(wrapper));

        console2.log("5. Wiring contracts together...");

        ticketNFT.setHook(address(hook));
        console2.log("TicketNFT.hook set to TreasuryHook");

        wrapper.setRelayer(deployerEOA, true);
        console2.log("PoolManagerWrapper relayer set for deployer");

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(ETH),
            currency1: Currency.wrap(USDC),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });

        bytes32 poolKeyHash = keccak256(abi.encode(poolKey));
        wrapper.setPoolEnabled(poolKeyHash, true);
        console2.log("Pool enabled in wrapper");

        console2.log("ETH and USDC enabled in vault");

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== DEPLOYMENT COMPLETE ===");
        console2.log("TicketNFT deployed at:         ", address(ticketNFT));
        console2.log("TreasuryHook deployed at:      ", address(hook));
        console2.log("PoolManagerWrapper deployed at:", address(wrapper));
        console2.log("Pool Key Hash:     ", vm.toString(poolKeyHash));

        console2.log("");
        console2.log("DEPLOYMENT_JSON_START");
        console2.log("{");
        console2.log('  "ticketNFT": "', address(ticketNFT), '",');
        console2.log('  "hook": "', address(hook), '",');
        console2.log('  "wrapper": "', address(wrapper), '",');
        console2.log('  "owner": "', deployerEOA, '",');
        console2.log('  "relayer": "', deployerEOA, '",');
        console2.log('  "poolKeyHash": "', vm.toString(poolKeyHash), '"');
        console2.log("}");
        console2.log("DEPLOYMENT_JSON_END");

        console2.log("");
        console2.log("Next steps:");
        console2.log("1. Fund SponsorVault with ETH/USDC");
        console2.log("2. Run CreatePoolAndSeed.s.sol to initialize the pool");
        console2.log(
            "3. Run tests with forge test --fork-url http://127.0.0.1:8545"
        );
    }
}
