// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "../src/Relayer.sol";
import "../src/TicketNFT.sol";

contract DeployRelayerTestnet is Script {
    address public constant CURRENCY_0_ETH =
        0x0000000000000000000000000000000000000000;
    uint24 public constant POOL_FEE = 500;
    int24 public constant TICK_SPACING = 10;
    address public constant HOOK_ADDRESS = address(0x0);

    address public constant UNICHAIN_TESTNET_USDC =
        0x31d0220469e10c4E71834a79b1f276d740d3768F;

    uint256 public constant UNICHAIN_TESTNET_ID = 1301;

    address public constant UNICHAIN_TESTNET_ROUTER =
        0xf70536B3bcC1bD1a972dc186A2cf84cC6da6Be5D;

    address public constant TESTNET_OWNER =
        0x000002fde2Da878DfA26fCb0748C0b9A25e8acEb;

    function run() external {
        uint256 chainId = block.chainid;

        require(
            chainId == UNICHAIN_TESTNET_ID,
            "This script is only for Unichain testnet"
        );

        vm.startBroadcast();

        deployUnichainTestnet();

        vm.stopBroadcast();
    }

    function deployUnichainTestnet() internal {
        console.log("\n=== Deploying to Unichain Testnet ===");
        console.log("Chain ID:", block.chainid);
        console.log("USDC Address:", UNICHAIN_TESTNET_USDC);
        console.log("Router Address:", UNICHAIN_TESTNET_ROUTER);
        console.log("Owner Address:", TESTNET_OWNER);

        console.log("\n=== Deploying ETH/USDC Pool Configuration ===");

        TicketNFT ticketETHUSDC = new TicketNFT(
            "ETH/USDC Relayer Tickets - Unichain Testnet",
            "RTIX-ETH-USDC-TEST",
            address(0),
            address(0)
        );

        Relayer relayerETHUSDC = new Relayer(
            TESTNET_OWNER,
            ticketETHUSDC,
            UNICHAIN_TESTNET_ROUTER,
            CURRENCY_0_ETH,
            UNICHAIN_TESTNET_USDC,
            POOL_FEE,
            TICK_SPACING
        );

        ticketETHUSDC.setMinter(address(relayerETHUSDC));
        ticketETHUSDC.setHook(address(relayerETHUSDC));
        relayerETHUSDC.updateRelayerAuthorization(msg.sender, true);

        console.log("ETH/USDC TicketNFT deployed at:", address(ticketETHUSDC));
        console.log("ETH/USDC Relayer deployed at:", address(relayerETHUSDC));

        console.log("\n=== TESTNET DEPLOYMENT SUMMARY ===");
        console.log("Network: Unichain Testnet");
        console.log("Chain ID:", UNICHAIN_TESTNET_ID);
        console.log("Owner:", TESTNET_OWNER);
        console.log("Router:", UNICHAIN_TESTNET_ROUTER);
        console.log("USDC Address:", UNICHAIN_TESTNET_USDC);
        console.log("Pool Fee:", POOL_FEE);
        console.log("Tick Spacing:", TICK_SPACING);
        console.log("\nETH/USDC Configuration:");
        console.log("  TicketNFT:", address(ticketETHUSDC));
        console.log("  Relayer:", address(relayerETHUSDC));
        console.log("\nDeployer authorized as relayer:", msg.sender);
    }

    function deployWithCustomParams(
        address customOwner,
        address customRouter,
        string memory ticketName,
        string memory ticketSymbol
    ) external {
        require(
            block.chainid == UNICHAIN_TESTNET_ID,
            "This script is only for Unichain testnet"
        );

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        console.log("\n=== Custom Testnet Deployment ===");

        TicketNFT ticket = new TicketNFT(
            ticketName,
            ticketSymbol,
            address(0),
            address(0)
        );

        Relayer relayer = new Relayer(
            customOwner,
            ticket,
            customRouter,
            CURRENCY_0_ETH,
            UNICHAIN_TESTNET_USDC,
            POOL_FEE,
            TICK_SPACING
        );

        ticket.setMinter(address(relayer));
        ticket.setHook(address(relayer));
        relayer.updateRelayerAuthorization(msg.sender, true);

        console.log("Custom TicketNFT:", address(ticket));
        console.log("Custom Relayer:", address(relayer));

        vm.stopBroadcast();
    }

    function deployETHUSDCTestnetOnly() external {
        require(
            block.chainid == UNICHAIN_TESTNET_ID,
            "Wrong chain - only for Unichain testnet"
        );

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        deployUnichainTestnet();

        vm.stopBroadcast();
    }

    function getTestnetInfo()
        external
        view
        returns (
            uint256 chainId,
            address usdcAddress,
            address routerAddress,
            address owner,
            uint24 fee,
            int24 spacing
        )
    {
        return (
            UNICHAIN_TESTNET_ID,
            UNICHAIN_TESTNET_USDC,
            UNICHAIN_TESTNET_ROUTER,
            TESTNET_OWNER,
            POOL_FEE,
            TICK_SPACING
        );
    }
}
