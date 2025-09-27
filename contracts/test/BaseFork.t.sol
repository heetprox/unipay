// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {TreasuryHook} from "../src/TreasuryHook.sol";
import {TicketNFT} from "../src/TicketNFT.sol";
import {PoolManagerWrapper} from "../src/PoolManagerWrapper.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

contract BaseForkTest is Test {
    using PoolIdLibrary for PoolKey;

    // Base mainnet addresses
    address constant POOL_MANAGER_ADDRESS =
        0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant ETH = 0x0000000000000000000000000000000000000000;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant USDC_WHALE = 0xcDAC0d6c6C59727a65F871236188350531885C43;

    // Pool configuration
    uint24 constant POOL_FEE = 500;
    int24 constant TICK_SPACING = 10;

    // Test configuration
    uint256 constant INITIAL_USDC_FUNDING = 10000e6; // 10k USDC
    uint256 constant INITIAL_ETH_FUNDING = 5 ether; // 5 ETH

    // Contracts
    IPoolManager poolManager;
    TreasuryHook hook;
    TicketNFT ticketNFT;
    PoolManagerWrapper wrapper;

    // Test accounts
    address deployer;
    address relayer;
    address user;
    address minter;

    // Pool data
    PoolKey poolKey;
    bytes32 poolKeyHash;
    PoolId poolId;

    // Test parameters
    bytes32 constant TEST_TXN_ID = bytes32(uint256(0x123456789));
    uint64 deadline;
    uint256 constant MIN_OUT = 4000e6; // Expect ~4000 USDC for 1 ETH (current market)
    uint256 constant MAX_IN = 1 ether; // 1 ETH max input
    uint8 constant MODE = 1;

    // Events to test
    event TicketConsumed(bytes32 indexed txnId, address user);
    event Paid(address indexed token, uint256 amount, address indexed to);
    event SwapSubmitted(
        bytes32 indexed poolKeyHash,
        bytes32 indexed txnId,
        address indexed user,
        uint8 mode,
        bool immediateTake
    );
    event ImmediateTake(
        bytes32 indexed poolKeyHash,
        address indexed currencyOut,
        uint256 amount,
        address indexed to
    );
    event TokensTaken(
        address indexed currency,
        address indexed from,
        address indexed to,
        uint256 amount
    );

    function setUp() public {
        // Set up accounts to match deployment
        deployer = 0xc111Ea84c2FBF21E45d837FF32DD3399CBfeF480;
        relayer = 0xc111Ea84c2FBF21E45d837FF32DD3399CBfeF480;
        user = makeAddr("user");
        minter = 0xc111Ea84c2FBF21E45d837FF32DD3399CBfeF480;

        // Set deadline to 1 hour from now
        deadline = uint64(block.timestamp + 1 hours);

        console2.log("Setting up BaseFork test...");
        console2.log("Block number:", block.number);
        console2.log("Chain ID:", block.chainid);

        // Get pool manager
        poolManager = IPoolManager(POOL_MANAGER_ADDRESS);

        // Deploy our contracts
        deployContracts();

        // Initialize pool if needed
        initializePool();

        // Setup wrapper configuration
        setupWrapper();

        // Fund user with ETH for gas
        vm.deal(user, 1 ether);

        // Fund PoolManagerWrapper with ETH for paying swaps (acting as vault now)
        vm.deal(address(wrapper), 10 ether);

        console2.log("Setup complete");
    }

    function deployContracts() internal {
        console2.log("Using deployed contracts with valid hook address...");

        // Use the deployed addresses from latest deployment
        hook = TreasuryHook(0x0dE575A636b23D5cD03574230befaddc063400C0);
        ticketNFT = TicketNFT(0xf46a1766fA1A45DfE355E0C57282AF48370D6B8a);
        wrapper = PoolManagerWrapper(
            payable(0xB9EecBF9bbB01AfaC94A0AB1CB8AED3c35769E0C)
        );

        console2.log("  TicketNFT:         ", address(ticketNFT));
        console2.log("  TreasuryHook:      ", address(hook));
        console2.log("  PoolManagerWrapper:", address(wrapper));
    }

    function initializePool() internal {
        console2.log("Initializing pool...");

        // Build pool key
        poolKey = PoolKey({
            currency0: Currency.wrap(ETH),
            currency1: Currency.wrap(USDC),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(0x0dE575A636b23D5cD03574230befaddc063400C0)
        });

        poolKeyHash = hashPoolKey(poolKey);
        poolId = poolKey.toId();

        console2.log("  Pool Key Hash:", vm.toString(poolKeyHash));
        console2.log(
            "  Expected Hash: 0xe1abc4ae08fc47739bf501d7bbbfcb25f688ce59d2551dfc0bd78f8dae36233a"
        );

        // Initialize pool with 1 ETH = 4034 USDC (current market price)
        uint160 sqrtPriceX96 = 5032985394563870399568240952979;

        try poolManager.initialize(poolKey, sqrtPriceX96) {
            console2.log("Pool initialized");
        } catch {
            console2.log("Pool already initialized or failed");
        }
    }

    function setupWrapper() internal {
        console2.log("Setting up wrapper configuration...");

        // Set relayer permissions
        vm.prank(deployer);
        wrapper.setRelayer(relayer, true);

        // Enable the pool
        vm.prank(deployer);
        wrapper.setPoolEnabled(poolKeyHash, true);

        console2.log("Wrapper configured");
    }

    // Helper function that matches our contracts
    function hashPoolKey(PoolKey memory key) internal pure returns (bytes32) {
        return keccak256(abi.encode(key));
    }

    function mintTicketToHook(bytes32 txnId) internal {
        vm.prank(minter);
        ticketNFT.mint(txnId, address(hook));
    }

    function testHappyPathSwapClaimOnly() public {
        console2.log("\n=== Testing Happy Path (Claim Only) ===");
        PoolKey memory poolKeyMem = poolKey;

        // Mint ticket to hook
        mintTicketToHook(TEST_TXN_ID);

        // Get initial balances
        uint256 userUSDCBefore = IERC20(USDC).balanceOf(user);
        uint256 userERC6909Before = poolManager.balanceOf(
            user,
            uint256(uint160(USDC))
        );

        console2.log("User USDC before:", userUSDCBefore / 1e6);
        console2.log("User ERC-6909 before:", userERC6909Before / 1e6);

        // Expect events
        vm.expectEmit(true, false, false, true);
        emit TicketConsumed(TEST_TXN_ID, user);

        vm.expectEmit(true, true, true, true);
        emit SwapSubmitted(poolKeyHash, TEST_TXN_ID, user, MODE, false);

        // Execute swap as relayer
        vm.prank(relayer);
        (bytes32 returnedHash, bytes memory result) = wrapper.swapWithHook(
            poolKeyMem,
            TEST_TXN_ID,
            user,
            deadline,
            MIN_OUT,
            MAX_IN,
            MODE,
            false, // immediateTake = false
            address(0),
            0
        );

        assertEq(returnedHash, poolKeyHash);
        console2.log("Swap executed successfully");

        // Check post-swap state
        uint256 userUSDCAfter = IERC20(USDC).balanceOf(user);
        uint256 userERC6909After = poolManager.balanceOf(
            user,
            uint256(uint160(USDC))
        );

        console2.log("User USDC after:", userUSDCAfter / 1e6);
        console2.log("User ERC-6909 after:", userERC6909After / 1e6);

        // Assertions
        assertEq(userUSDCAfter, userUSDCBefore); // No direct USDC transfer
        assertGt(userERC6909After, userERC6909Before); // ERC-6909 claims increased
        assertTrue(hook.used(TEST_TXN_ID)); // TxnId marked as used

        // Check NFT was burned
        vm.expectRevert();
        ticketNFT.ownerOf(uint256(TEST_TXN_ID));

        console2.log("All assertions passed");
        console2.log("Gas used: ~", gasleft());
    }

    function testHappyPathImmediateTake() public {
        console2.log("\n=== Testing Happy Path (Immediate Take) ===");
        PoolKey memory poolKeyMem = poolKey;

        bytes32 txnId = bytes32(uint256(TEST_TXN_ID) + 1);
        mintTicketToHook(txnId);

        uint256 takeAmount = MIN_OUT; // Take the minimum expected USDC

        // Get initial balances
        uint256 userUSDCBefore = IERC20(USDC).balanceOf(user);
        uint256 userERC6909Before = poolManager.balanceOf(
            user,
            uint256(uint160(USDC))
        );

        // Expect events
        vm.expectEmit(true, true, true, true);
        emit SwapSubmitted(poolKeyHash, txnId, user, MODE, true);

        vm.expectEmit(true, true, true, true);
        emit ImmediateTake(poolKeyHash, USDC, takeAmount, user);

        // Execute swap with immediate take
        vm.prank(relayer);
        wrapper.swapWithHook(
            poolKeyMem,
            txnId,
            user,
            deadline,
            MIN_OUT,
            MAX_IN,
            MODE,
            true, // immediateTake = true
            USDC,
            takeAmount
        );

        // Check balances
        uint256 userUSDCAfter = IERC20(USDC).balanceOf(user);
        uint256 userERC6909After = poolManager.balanceOf(
            user,
            uint256(uint160(USDC))
        );

        console2.log("User USDC balance increased");

        // Assertions
        assertGt(userUSDCAfter, userUSDCBefore); // User received USDC
        // ERC-6909 balance might be positive or zero depending on swap vs take amounts

        console2.log("Immediate take successful");
    }

    function testReplayAttackReverts() public {
        console2.log("\n=== Testing Replay Attack ===");
        PoolKey memory poolKeyMem = poolKey;

        bytes32 txnId = bytes32(uint256(TEST_TXN_ID) + 2);
        mintTicketToHook(txnId);

        // First swap should succeed
        vm.prank(relayer);
        wrapper.swapWithHook(
            poolKeyMem,
            txnId,
            user,
            deadline,
            MIN_OUT,
            MAX_IN,
            MODE,
            false,
            address(0),
            0
        );

        console2.log("First swap succeeded");

        // Second swap with same txnId should fail
        mintTicketToHook(txnId); // Mint new ticket (same ID)

        vm.expectRevert(TreasuryHook.TicketUsed.selector);
        vm.prank(relayer);
        wrapper.swapWithHook(
            poolKeyMem,
            txnId,
            user,
            deadline,
            MIN_OUT,
            MAX_IN,
            MODE,
            false,
            address(0),
            0
        );

        console2.log("Replay attack prevented");
    }

    function testMissingTicketReverts() public {
        console2.log("\n=== Testing Missing Ticket ===");
        PoolKey memory poolKeyMem = poolKey;

        bytes32 txnId = bytes32(uint256(TEST_TXN_ID) + 3);
        // Don't mint ticket

        vm.expectRevert(); // TokenNotExists from TicketNFT
        vm.prank(relayer);
        wrapper.swapWithHook(
            poolKeyMem,
            txnId,
            user,
            deadline,
            MIN_OUT,
            MAX_IN,
            MODE,
            false,
            address(0),
            0
        );

        console2.log("Missing ticket detected");
    }

    function testExpiredDeadlineReverts() public {
        console2.log("\n=== Testing Expired Deadline ===");
        PoolKey memory poolKeyMem = poolKey;

        bytes32 txnId = bytes32(uint256(TEST_TXN_ID) + 4);
        mintTicketToHook(txnId);

        // Use expired deadline
        uint64 expiredDeadline = uint64(block.timestamp - 1);

        vm.expectRevert("DeadlineExpired");
        vm.prank(relayer);
        wrapper.swapWithHook(
            poolKeyMem,
            txnId,
            user,
            expiredDeadline,
            MIN_OUT,
            MAX_IN,
            MODE,
            false,
            address(0),
            0
        );

        console2.log("Expired deadline detected");
    }

    function testPausedHookReverts() public {
        console2.log("\n=== Testing Paused Hook ===");
        PoolKey memory poolKeyMem = poolKey;

        bytes32 txnId = bytes32(uint256(TEST_TXN_ID) + 5);
        mintTicketToHook(txnId);

        // Pause hook - run as deployer who owns the contract
        vm.prank(deployer);
        hook.pause();

        vm.expectRevert(TreasuryHook.Paused.selector);
        vm.prank(relayer);
        wrapper.swapWithHook(
            poolKeyMem,
            txnId,
            user,
            deadline,
            MIN_OUT,
            MAX_IN,
            MODE,
            false,
            address(0),
            0
        );

        console2.log("Paused hook detected");
    }

    function testPausedWrapperReverts() public {
        console2.log("\n=== Testing Paused Wrapper ===");
        PoolKey memory poolKeyMem = poolKey;

        bytes32 txnId = bytes32(uint256(TEST_TXN_ID) + 6);
        mintTicketToHook(txnId);

        // Pause wrapper - run as deployer who owns the contract
        vm.prank(deployer);
        wrapper.pause(true);

        vm.expectRevert("Paused");
        vm.prank(relayer);
        wrapper.swapWithHook(
            poolKeyMem,
            txnId,
            user,
            deadline,
            MIN_OUT,
            MAX_IN,
            MODE,
            false,
            address(0),
            0
        );

        console2.log("Paused wrapper detected");
    }

    function testDisabledPoolReverts() public {
        console2.log("\n=== Testing Disabled Pool ===");
        PoolKey memory poolKeyMem = poolKey;

        bytes32 txnId = bytes32(uint256(TEST_TXN_ID) + 7);
        mintTicketToHook(txnId);

        // Disable pool - run as deployer who owns the contract
        vm.prank(deployer);
        wrapper.setPoolEnabled(poolKeyHash, false);

        vm.expectRevert("PoolDisabled");
        vm.prank(relayer);
        wrapper.swapWithHook(
            poolKeyMem,
            txnId,
            user,
            deadline,
            MIN_OUT,
            MAX_IN,
            MODE,
            false,
            address(0),
            0
        );

        console2.log("Disabled pool detected");
    }

    function testERC6909ClaimsAndTake() public {
        console2.log("\n=== Testing ERC-6909 Claims and Take ===");
        PoolKey memory poolKeyMem = poolKey;

        bytes32 txnId = bytes32(uint256(TEST_TXN_ID) + 8);
        mintTicketToHook(txnId);

        // Execute swap (claim only)
        vm.prank(relayer);
        wrapper.swapWithHook(
            poolKeyMem,
            txnId,
            user,
            deadline,
            MIN_OUT,
            MAX_IN,
            MODE,
            false,
            address(0),
            0
        );

        // Check ERC-6909 balance increased
        uint256 claimBalance = poolManager.balanceOf(
            user,
            uint256(uint160(USDC))
        );
        console2.log("User ERC-6909 claims:", claimBalance / 1e6, "USDC");
        assertGt(claimBalance, 0);

        // Take some of the claims
        uint256 takeAmount = claimBalance / 2;
        uint256 userUSDCBefore = IERC20(USDC).balanceOf(user);

        vm.expectEmit(true, true, true, true);
        emit TokensTaken(USDC, user, user, takeAmount);

        vm.prank(relayer);
        wrapper.takeTokens(USDC, user, user, takeAmount);

        // Check balances after take
        uint256 claimBalanceAfter = poolManager.balanceOf(
            user,
            uint256(uint160(USDC))
        );
        uint256 userUSDCAfter = IERC20(USDC).balanceOf(user);

        console2.log("Claims after take:", claimBalanceAfter / 1e6, "USDC");
        console2.log("USDC received by user");

        // Assertions
        assertEq(claimBalance - takeAmount, claimBalanceAfter);
        assertGt(userUSDCAfter, userUSDCBefore);

        console2.log("ERC-6909 claims and take working correctly");
    }

    function testGasUsage() public {
        console2.log("\n=== Testing Gas Usage ===");
        PoolKey memory poolKeyMem = poolKey;

        bytes32 txnId = bytes32(uint256(TEST_TXN_ID) + 9);
        mintTicketToHook(txnId);

        uint256 gasBefore = gasleft();

        vm.prank(relayer);
        wrapper.swapWithHook(
            poolKeyMem,
            txnId,
            user,
            deadline,
            MIN_OUT,
            MAX_IN,
            MODE,
            false, // No immediate take
            address(0),
            0
        );

        uint256 gasUsed = gasBefore - gasleft();
        console2.log("Gas used for swap (claim only):", gasUsed);

        // Test with immediate take
        bytes32 txnId2 = bytes32(uint256(TEST_TXN_ID) + 10);
        mintTicketToHook(txnId2);

        gasBefore = gasleft();

        vm.prank(relayer);
        wrapper.swapWithHook(
            poolKeyMem,
            txnId2,
            user,
            deadline,
            MIN_OUT,
            MAX_IN,
            MODE,
            true, // Immediate take
            USDC,
            MIN_OUT
        );

        uint256 gasUsedWithTake = gasBefore - gasleft();
        console2.log("Gas used for swap (with take):", gasUsedWithTake);

        // Verify gas constraints
        assertLt(gasUsed, 300_000, "Swap-only gas should be < 300k");
        assertLt(gasUsedWithTake, 350_000, "Swap+take gas should be < 350k");

        console2.log("Gas usage within acceptable limits");
    }
}
