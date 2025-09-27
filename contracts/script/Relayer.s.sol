// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "../src/Relayer.sol";
import "../src/TicketNFT.sol";

contract DeployRelayer is Script {
    address public constant CURRENCY_0_ETH =
        0x0000000000000000000000000000000000000000;
    uint24 public constant POOL_FEE = 500;
    int24 public constant TICK_SPACING = 10;
    address public constant HOOK_ADDRESS = address(0x0);

    // Chain-specific USDC addresses
    address public constant UNICHAIN_USDC =
        0x078D782b760474a361dDA0AF3839290b0EF57AD6;
    address public constant ETHEREUM_USDC =
        0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant BASE_USDC =
        0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    uint256 public constant UNICHAIN_ID = 130;
    uint256 public constant ETHEREUM_ID = 1;
    uint256 public constant BASE_ID = 8453;

    mapping(uint256 => address) public routers;
    mapping(uint256 => address) public owners;

    constructor() {
        routers[UNICHAIN_ID] = 0xEf740bf23aCaE26f6492B10de645D6B98dC8Eaf3;
        routers[ETHEREUM_ID] = 0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af;
        routers[BASE_ID] = 0x6fF5693b99212Da76ad316178A184AB56D299b43;
    }

    function run() external {
        uint256 chainId = block.chainid;
        address usdcAddress = getUSDCAddress(chainId);
        address routerAddress = routers[chainId];
        address owner = address(0);

        require(usdcAddress != address(0), "Unsupported chain");
        require(
            routerAddress != address(0),
            "Router not configured for this chain"
        );
        require(owner != address(0), "Owner not configured for this chain");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        deployBothPoolConfigurations(
            owner,
            routerAddress,
            usdcAddress,
            chainId
        );

        vm.stopBroadcast();
    }

    function deployBothPoolConfigurations(
        address owner,
        address routerAddress,
        address usdcAddress,
        uint256 chainId
    ) internal {
        string memory chainName = getChainName(chainId);

        console.log("\n=== Deploying ETH/USDC Pool Configuration ===");

        TicketNFT ticketETHUSDC = new TicketNFT(
            string(abi.encodePacked("ETH/USDC Relayer Tickets - ", chainName)),
            "RTIX-ETH-USDC",
            address(0),
            address(0)
        );

        Relayer relayerETHUSDC = new Relayer(
            owner,
            ticketETHUSDC,
            routerAddress,
            CURRENCY_0_ETH,
            usdcAddress,
            POOL_FEE,
            TICK_SPACING
        );

        ticketETHUSDC.setMinter(address(relayerETHUSDC));
        relayerETHUSDC.updateRelayerAuthorization(msg.sender, true);

        console.log("ETH/USDC TicketNFT:", address(ticketETHUSDC));
        console.log("ETH/USDC Relayer:", address(relayerETHUSDC));

        // Configuration 2: USDC as currency0, ETH as currency1
        console.log("\n=== Deploying USDC/ETH Pool Configuration ===");

        TicketNFT ticketUSDCETH = new TicketNFT(
            string(abi.encodePacked("USDC/ETH Relayer Tickets - ", chainName)),
            "RTIX-USDC-ETH",
            address(0),
            address(0)
        );

        Relayer relayerUSDCETH = new Relayer(
            owner,
            ticketUSDCETH,
            routerAddress,
            usdcAddress,
            CURRENCY_0_ETH,
            POOL_FEE,
            TICK_SPACING
        );

        ticketUSDCETH.setMinter(address(relayerUSDCETH));
        relayerUSDCETH.updateRelayerAuthorization(msg.sender, true);

        console.log("USDC/ETH TicketNFT:", address(ticketUSDCETH));
        console.log("USDC/ETH Relayer:", address(relayerUSDCETH));

        // Log deployment summary
        console.log("\n=== DEPLOYMENT SUMMARY ===");
        console.log("Chain:", chainName);
        console.log("Owner:", owner);
        console.log("Router:", routerAddress);
        console.log("USDC Address:", usdcAddress);
        console.log("Pool Fee:", POOL_FEE);
        console.log("Tick Spacing:", TICK_SPACING);
        console.log("\nETH/USDC Configuration:");
        console.log("  TicketNFT:", address(ticketETHUSDC));
        console.log("  Relayer:", address(relayerETHUSDC));
        console.log("\nUSDC/ETH Configuration:");
        console.log("  TicketNFT:", address(ticketUSDCETH));
        console.log("  Relayer:", address(relayerUSDCETH));
    }

    function deployToSpecificChain(uint256 targetChainId) external {
        require(block.chainid == targetChainId, "Wrong chain");

        address usdcAddress = getUSDCAddress(targetChainId);
        address routerAddress = routers[targetChainId];
        address owner = owners[targetChainId];

        require(usdcAddress != address(0), "Unsupported chain");
        require(routerAddress != address(0), "Router not configured");
        require(owner != address(0), "Owner not configured");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        deployBothPoolConfigurations(
            owner,
            routerAddress,
            usdcAddress,
            targetChainId
        );

        vm.stopBroadcast();
    }

    function deployETHUSDCOnly(uint256 targetChainId) external {
        require(block.chainid == targetChainId, "Wrong chain");

        address usdcAddress = getUSDCAddress(targetChainId);
        address routerAddress = routers[targetChainId];
        address owner = owners[targetChainId];

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        string memory chainName = getChainName(targetChainId);

        TicketNFT ticket = new TicketNFT(
            string(abi.encodePacked("ETH/USDC Relayer Tickets - ", chainName)),
            "RTIX-ETH-USDC",
            address(0),
            address(0)
        );

        Relayer relayer = new Relayer(
            owner,
            ticket,
            routerAddress,
            CURRENCY_0_ETH,
            usdcAddress,
            POOL_FEE,
            TICK_SPACING
        );

        ticket.setMinter(address(relayer));
        relayer.updateRelayerAuthorization(msg.sender, true);

        console.log("ETH/USDC TicketNFT:", address(ticket));
        console.log("ETH/USDC Relayer:", address(relayer));

        vm.stopBroadcast();
    }

    function deployUSDCETHOnly(uint256 targetChainId) external {
        require(block.chainid == targetChainId, "Wrong chain");

        address usdcAddress = getUSDCAddress(targetChainId);
        address routerAddress = routers[targetChainId];
        address owner = owners[targetChainId];

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        string memory chainName = getChainName(targetChainId);

        TicketNFT ticket = new TicketNFT(
            string(abi.encodePacked("USDC/ETH Relayer Tickets - ", chainName)),
            "RTIX-USDC-ETH",
            address(0),
            address(0)
        );

        Relayer relayer = new Relayer(
            owner,
            ticket,
            routerAddress,
            usdcAddress,
            CURRENCY_0_ETH,
            POOL_FEE,
            TICK_SPACING
        );

        ticket.setMinter(address(relayer));
        relayer.updateRelayerAuthorization(msg.sender, true);

        console.log("USDC/ETH TicketNFT:", address(ticket));
        console.log("USDC/ETH Relayer:", address(relayer));

        vm.stopBroadcast();
    }

    function getUSDCAddress(uint256 chainId) internal pure returns (address) {
        if (chainId == UNICHAIN_ID) return UNICHAIN_USDC;
        if (chainId == ETHEREUM_ID) return ETHEREUM_USDC;
        if (chainId == BASE_ID) return BASE_USDC;
        return address(0);
    }

    function getChainName(
        uint256 chainId
    ) internal pure returns (string memory) {
        if (chainId == UNICHAIN_ID) return "Unichain";
        if (chainId == ETHEREUM_ID) return "Ethereum";
        if (chainId == BASE_ID) return "Base";
        return "Unknown";
    }

    function updateRouter(uint256 chainId, address router) external {
        routers[chainId] = router;
        console.log("Updated router for chain", chainId, "to:", router);
    }

    function updateOwner(uint256 chainId, address owner) external {
        owners[chainId] = owner;
        console.log("Updated owner for chain", chainId, "to:", owner);
    }
}
