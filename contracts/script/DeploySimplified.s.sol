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

contract DeploySimplified is Script {
    // Base Mainnet addresses
    address constant POOL_MANAGER = 0x00B036B58a818B1BC34d502D3fE730Db729e62AC;
    address constant UNIVERSAL_ROUTER =
        0xf70536B3bcC1bD1a972dc186A2cf84cC6da6Be5D;
    address constant ETH = 0x0000000000000000000000000000000000000000;
    address constant USDC = 0x31d0220469e10c4E71834a79b1f276d740d3768F;

    uint24 constant POOL_FEE = 500;
    int24 constant TICK_SPACING = 10;

    function run() external {
        address deployerEOA = 0x000002fde2Da878DfA26fCb0748C0b9A25e8acEb;
        IPoolManager poolManager = IPoolManager(POOL_MANAGER);

        vm.startBroadcast();

        console2.log("=== SIMPLIFIED DEPLOYMENT ===");
        console2.log("Deployer:", deployerEOA);
        console2.log("PoolManager:", POOL_MANAGER);
        console2.log("UniversalRouter:", UNIVERSAL_ROUTER);
        console2.log("ETH:", ETH);
        console2.log("USDC:", USDC);
        console2.log("");

        console2.log("1. Deploying TicketNFT...");
        TicketNFT ticketNFT = new TicketNFT(
            "Treasury Tickets",
            "TTICKET",
            address(0), // Will be set to hook address later
            deployerEOA // Minter (deployer for now)
        );
        console2.log("   TicketNFT deployed at:", address(ticketNFT));

        console2.log("2. Deploying TreasuryHook with valid address using CREATE2...");
        uint160 flags = uint160(Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG);
        console2.log("   Required flags:", flags);

        HookDeployer hookDeployer = new HookDeployer();

        TreasuryHook hook = hookDeployer.deployTreasuryHook(
            poolManager,
            ITicketNFT(address(ticketNFT)),
            deployerEOA, // owner
            ETH,
            USDC,
            POOL_FEE,
            TICK_SPACING,
            flags
        );
        console2.log("   TreasuryHook deployed at:", address(hook));
        console2.log("   Hook address validation passed!");

        console2.log("3. Deploying PoolManagerWrapper...");
        PoolManagerWrapper wrapper = new PoolManagerWrapper(
            poolManager,
            hook,
            deployerEOA
        );
        console2.log("   PoolManagerWrapper deployed at:", address(wrapper));

        console2.log("4. Wiring contracts together...");

        // Set the hook address in TicketNFT
        ticketNFT.setHook(address(hook));
        console2.log("   TicketNFT.hook set to TreasuryHook");

        // Set deployer as authorized relayer
        wrapper.setRelayer(deployerEOA, true);
        console2.log("   Deployer set as authorized relayer in wrapper");

        // Authorize deployer as relayer in hook
        hook.updateRelayerAuthorization(deployerEOA, true);
        console2.log("   Deployer set as authorized relayer in hook");

        // Enable the pool in wrapper
        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(ETH),
            currency1: Currency.wrap(USDC),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });

        bytes32 poolKeyHash = keccak256(abi.encode(poolKey));
        wrapper.setPoolEnabled(poolKeyHash, true);
        console2.log("   Pool enabled in wrapper");
        console2.log("   Pool Key Hash:", vm.toString(poolKeyHash));

        // Fund the hook with some ETH for testing
        console2.log("5. Funding hook with ETH for testing...");
        uint256 fundingAmount = 0.001 ether;
        (bool success, ) = address(hook).call{value: fundingAmount}("");
        require(success, "Failed to send ETH to hook");
        console2.log("   Sent", fundingAmount / 1e18, "ETH directly to hook");

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== DEPLOYMENT COMPLETE ===");
        console2.log("TicketNFT:         ", address(ticketNFT));
        console2.log("TreasuryHook:      ", address(hook));
        console2.log("PoolManagerWrapper:", address(wrapper));
        console2.log("Pool Key Hash:     ", vm.toString(poolKeyHash));
        console2.log("Deployer (relayer):", deployerEOA);
        console2.log("");

        console2.log("=== ENVIRONMENT VARIABLES ===");
        console2.log("Add these to your .env file:");
        console2.log("TREASURY_HOOK=", address(hook));
        console2.log("TICKET_NFT=", address(ticketNFT));
        console2.log("POOL_MANAGER_WRAPPER=", address(wrapper));
        console2.log("");

        console2.log("=== NEXT STEPS ===");
        console2.log("1. Update your .env file with the addresses above");
        console2.log(
            "2. Run: forge script script/TestTreasuryHookFlow.s.sol --fork-url YOUR_RPC_URL --broadcast"
        );
        console2.log("3. Or fund the hook with more tokens and test manually");
    }
}
