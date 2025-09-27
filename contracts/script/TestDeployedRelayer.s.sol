// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "../src/Relayer.sol";
import "../src/TicketNFT.sol";

contract TestDeployedRelayer is Script {
    // Sepolia Unichain addresses from environment
    address public relayerAddress;
    address public ticketNFTAddress;
    
    // Test constants
    bytes32 constant TEST_TRANSACTION_ID = keccak256("test_txn_123");
    address constant TEST_USER = 0x742d35cc662c88e1Dc5A11cbB074857b6eBF7eDB;
    
    Relayer public relayer;
    TicketNFT public ticketNFT;
    
    function setUp() public {
        relayerAddress = vm.envAddress("SEPOLIA_UNICHAIN_RELAYER_CONTRACT");
        ticketNFTAddress = vm.envAddress("SEPOLIA_UNICHAIN_TICKET_NFT_CONTRACT");
        
        relayer = Relayer(payable(relayerAddress));
        ticketNFT = TicketNFT(ticketNFTAddress);
    }
    
    function run() external {
        setUp();
        
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("=== Testing Deployed Relayer Contract ===");
        console.log("Chain ID:", block.chainid);
        console.log("Relayer Address:", relayerAddress);
        console.log("TicketNFT Address:", ticketNFTAddress);
        console.log("Test User:", TEST_USER);
        console.log("Deployer:", msg.sender);
        
        runTests();
        
        vm.stopBroadcast();
    }
    
    function runTests() internal {
        console.log("\n=== Contract Information ===");
        testContractInfo();
        
        console.log("\n=== Authorization Tests ===");
        testAuthorizationStatus();
        
        console.log("\n=== Contract State Tests ===");
        testContractState();
        
        console.log("\n=== Ticket Minting Test ===");
        testMintTicket();
        
        console.log("\n=== Balance Tests ===");
        testBalances();
    }
    
    function testContractInfo() internal view {
        console.log("V4 Router:", address(relayer.v4Router()));
        console.log("USDC Token:", address(relayer.usdc()));
        console.log("Native Token:", relayer.nativeTokenAddress());
        console.log("USDC Address:", relayer.usdcTokenAddress());
        console.log("Pool Fee:", relayer.poolFee());
        console.log("Tick Spacing:", int256(relayer.tickSpacing()));
        console.log("Owner:", relayer.owner());
        console.log("Ticket Contract:", address(relayer.ticketContract()));
    }
    
    function testAuthorizationStatus() internal view {
        bool isAuthorized = relayer.authorizedRelayers(msg.sender);
        console.log("Deployer authorized as relayer:", isAuthorized);
        
        if (!isAuthorized) {
            console.log("WARNING: Deployer is not authorized as a relayer!");
            console.log("Call updateRelayerAuthorization to authorize this address");
        }
    }
    
    function testContractState() internal view {
        bool isPaused = relayer.contractPaused();
        console.log("Contract paused:", isPaused);
        
        if (isPaused) {
            console.log("WARNING: Contract is paused!");
        }
    }
    
    function testMintTicket() internal {
        console.log("Testing ticket minting with transaction ID:", vm.toString(TEST_TRANSACTION_ID));
        
        // Check if ticket already exists (simplified without try/catch)
        // Note: This may revert if ticket doesn't exist, which is expected
        
        bool isAuthorized = relayer.authorizedRelayers(msg.sender);
        bool isPaused = relayer.contractPaused();
        
        if (!isAuthorized) {
            console.log("SKIP: Cannot mint ticket - deployer not authorized");
            return;
        }
        
        if (isPaused) {
            console.log("SKIP: Cannot mint ticket - contract is paused");
            return;
        }
        
        // Attempt to mint ticket (will revert on failure)
        relayer.mintTicket(TEST_TRANSACTION_ID);
        console.log("SUCCESS: Ticket minted successfully");
        
        // Verify the ticket was minted
        address newOwner = ticketNFT.ownerOfTxn(TEST_TRANSACTION_ID);
        console.log("Ticket now owned by:", newOwner);
        console.log("Expected owner (relayer contract):", address(relayer));
        
        if (newOwner == address(relayer)) {
            console.log("SUCCESS: Ticket correctly owned by relayer contract");
        } else {
            console.log("ERROR: Ticket ownership mismatch");
        }
    }
    
    function testBalances() internal view {
        console.log("Contract ETH balance:", address(relayer).balance, "wei");
        console.log("Contract USDC balance:", relayer.usdc().balanceOf(address(relayer)));
        console.log("Deployer ETH balance:", msg.sender.balance, "wei");
        console.log("Deployer USDC balance:", relayer.usdc().balanceOf(msg.sender));
    }
    
    // Function to test specific functionality with custom parameters
    function testMintTicketCustom(bytes32 customTransactionId) external {
        setUp();
        
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("=== Custom Ticket Mint Test ===");
        console.log("Custom Transaction ID:", vm.toString(customTransactionId));
        
        relayer.mintTicket(customTransactionId);
        console.log("SUCCESS: Custom ticket minted");
        
        address owner = ticketNFT.ownerOfTxn(customTransactionId);
        console.log("Ticket owner:", owner);
        
        vm.stopBroadcast();
    }
    
    // Function to authorize the deployer as a relayer (if they're the owner)
    function authorizeDeployer() external {
        setUp();
        
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("=== Authorizing Deployer ===");
        
        if (relayer.owner() != msg.sender) {
            console.log("ERROR: Only contract owner can authorize relayers");
            console.log("Contract owner:", relayer.owner());
            console.log("Current sender:", msg.sender);
            vm.stopBroadcast();
            return;
        }
        
        relayer.updateRelayerAuthorization(msg.sender, true);
        console.log("SUCCESS: Deployer authorized as relayer");
        
        vm.stopBroadcast();
    }
    
    // Function to check contract health and basic functionality
    function healthCheck() external {
        setUp();
        
        console.log("=== Contract Health Check ===");
        console.log("Chain ID:", block.chainid);
        console.log("Block number:", block.number);
        console.log("Block timestamp:", block.timestamp);
        
        // Check if contracts are deployed at expected addresses
        uint256 relayerCodeSize;
        uint256 ticketCodeSize;
        address relayerAddr = relayerAddress;
        address ticketAddr = ticketNFTAddress;
        
        assembly {
            relayerCodeSize := extcodesize(relayerAddr)
            ticketCodeSize := extcodesize(ticketAddr)
        }
        
        console.log("Relayer contract code size:", relayerCodeSize);
        console.log("TicketNFT contract code size:", ticketCodeSize);
        
        if (relayerCodeSize == 0) {
            console.log("ERROR: No code found at relayer address");
        } else {
            console.log("SUCCESS: Relayer contract deployed");
        }
        
        if (ticketCodeSize == 0) {
            console.log("ERROR: No code found at ticket NFT address");
        } else {
            console.log("SUCCESS: TicketNFT contract deployed");
        }
    }
}