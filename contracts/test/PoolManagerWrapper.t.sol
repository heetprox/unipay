// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PoolManagerWrapper} from "../src/PoolManagerWrapper.sol";
import {TreasuryHook} from "../src/TreasuryHook.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta, toBalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MockPoolManager {
    bool public shouldRevert;
    string public revertReason;
    bytes public lastUnlockData;
    bytes public unlockReturnData;
    
    mapping(address => uint256) public takeCallCount;
    mapping(address => uint256) public swapCallCount;
    
    struct TakeCall {
        address currency;
        address to;
        uint256 amount;
    }
    
    struct SwapCall {
        PoolKey key;
        SwapParams params;
        bytes hookData;
    }
    
    TakeCall[] public takeCalls;
    SwapCall[] public swapCalls;
    
    function setShouldRevert(bool _shouldRevert, string memory _reason) external {
        shouldRevert = _shouldRevert;
        revertReason = _reason;
    }
    
    function setUnlockReturnData(bytes memory _data) external {
        unlockReturnData = _data;
    }
    
    function unlock(bytes calldata data) external returns (bytes memory) {
        if (shouldRevert) {
            revert(revertReason);
        }
        
        lastUnlockData = data;
        
        // Call back to the wrapper's lockAcquired function
        (bool success, bytes memory result) = msg.sender.call(
            abi.encodeWithSignature("lockAcquired(bytes)", data)
        );
        
        if (!success) {
            // Bubble up the revert
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
        
        return unlockReturnData.length > 0 ? unlockReturnData : result;
    }
    
    function balanceOf(address owner, address currency) external pure returns (uint256) {
        // Mock balance - return 0 for zero address, 1000 tokens for others
        return owner == address(0) ? 0 : 1000e18;
    }
    
    function take(address currency, address to, uint256 amount) external {
        takeCalls.push(TakeCall(currency, to, amount));
        takeCallCount[to]++;
    }
    
    function swap(PoolKey memory key, SwapParams memory params, bytes memory hookData) 
        external returns (BalanceDelta) {
        swapCalls.push(SwapCall(key, params, hookData));
        swapCallCount[address(0)]++; // Generic counter
        
        // Return a mock delta using toBalanceDelta function
        return toBalanceDelta(-100e18, 95e18);
    }
    
    // Helper to get the last take call
    function getLastTakeCall() external view returns (address, address, uint256) {
        require(takeCalls.length > 0, "No take calls");
        TakeCall memory call = takeCalls[takeCalls.length - 1];
        return (call.currency, call.to, call.amount);
    }
    
    // Helper to get the last swap call
    function getLastSwapCall() external view returns (PoolKey memory, SwapParams memory, bytes memory) {
        require(swapCalls.length > 0, "No swap calls");
        SwapCall memory call = swapCalls[swapCalls.length - 1];
        return (call.key, call.params, call.hookData);
    }
    
    function getTakeCallsCount() external view returns (uint256) {
        return takeCalls.length;
    }
    
    function getSwapCallsCount() external view returns (uint256) {
        return swapCalls.length;
    }
}

contract PoolManagerWrapperTest is Test {
    PoolManagerWrapper wrapper;
    MockPoolManager mockPM;
    
    address owner = address(this);
    address relayer1 = address(0x1111);
    address relayer2 = address(0x2222);
    address nonRelayer = address(0x3333);
    address user = address(0x4444);
    address currencyA = address(0x5555);
    address currencyB = address(0x6666);
    
    PoolKey defaultPoolKey;
    bytes32 defaultPoolHash;
    
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
    event PoolToggle(bytes32 indexed poolKeyHash, bool enabled);
    event Paused(bool paused);
    event RelayerSet(address indexed relayer, bool allowed);
    
    function setUp() public {
        mockPM = new MockPoolManager();
        // Create a mock TreasuryHook - for testing we'll use address(0)
        wrapper = new PoolManagerWrapper(IPoolManager(address(mockPM)), TreasuryHook(address(0)), owner);
        
        // Setup default pool key
        defaultPoolKey = PoolKey({
            currency0: Currency.wrap(currencyA),
            currency1: Currency.wrap(currencyB),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0x7777))
        });
        
        defaultPoolHash = wrapper.hashPoolKey(defaultPoolKey);
        
        // Enable the pool and add relayer
        wrapper.setPoolEnabled(defaultPoolHash, true);
        wrapper.setRelayer(relayer1, true);
    }
    
    function testRelayerOnly() public {
        // Non-relayer should fail
        vm.prank(nonRelayer);
        vm.expectRevert("NotRelayer");
        wrapper.swapWithHook(
            defaultPoolKey,
            bytes32(uint256(1)),
            user,
            uint64(block.timestamp + 1 hours),
            100e18,
            110e18,
            1,
            false,
            address(0),
            0
        );
        
        // Relayer should succeed
        vm.prank(relayer1);
        wrapper.swapWithHook(
            defaultPoolKey,
            bytes32(uint256(1)),
            user,
            uint64(block.timestamp + 1 hours),
            100e18,
            110e18,
            1,
            false,
            address(0),
            0
        );
    }
    
    function testHappyPathClaimOnly() public {
        bytes32 txnId = bytes32(uint256(123));
        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 minOut = 100e18;
        uint256 maxIn = 110e18;
        uint8 mode = 1;
        
        vm.expectEmit(true, true, true, true);
        emit SwapSubmitted(defaultPoolHash, txnId, user, mode, false);
        
        vm.prank(relayer1);
        (bytes32 returnedHash, bytes memory result) = wrapper.swapWithHook(
            defaultPoolKey,
            txnId,
            user,
            deadline,
            minOut,
            maxIn,
            mode,
            false,
            address(0),
            0
        );
        
        assertEq(returnedHash, defaultPoolHash);
        
        // Verify swap was called
        assertEq(mockPM.getSwapCallsCount(), 1);
        (PoolKey memory key, SwapParams memory params, bytes memory hookData) = mockPM.getLastSwapCall();
        
        // Verify hookData encoding
        (bytes32 decodedTxnId, address decodedUser, uint64 decodedDeadline, uint256 decodedMinOut, uint256 decodedMaxIn, uint8 decodedMode) = 
            abi.decode(hookData, (bytes32, address, uint64, uint256, uint256, uint8));
        
        assertEq(decodedTxnId, txnId);
        assertEq(decodedUser, user);
        assertEq(decodedDeadline, deadline);
        assertEq(decodedMinOut, minOut);
        assertEq(decodedMaxIn, maxIn);
        assertEq(decodedMode, mode);
        
        // Verify no take calls
        assertEq(mockPM.getTakeCallsCount(), 0);
    }
    
    function testHappyPathImmediateTake() public {
        bytes32 txnId = bytes32(uint256(456));
        uint64 deadline = uint64(block.timestamp + 1 hours);
        address currencyOut = currencyB;
        uint256 takeAmount = 95e18;
        
        vm.expectEmit(true, true, true, true);
        emit SwapSubmitted(defaultPoolHash, txnId, user, 2, true);
        
        vm.expectEmit(true, true, true, true);
        emit ImmediateTake(defaultPoolHash, currencyOut, takeAmount, user);
        
        vm.prank(relayer1);
        wrapper.swapWithHook(
            defaultPoolKey,
            txnId,
            user,
            deadline,
            90e18,
            110e18,
            2,
            true,
            currencyOut,
            takeAmount
        );
        
        // Verify both swap and take were called
        assertEq(mockPM.getSwapCallsCount(), 1);
        assertEq(mockPM.getTakeCallsCount(), 1);
        
        (address takeCurrency, address takeTo, uint256 takeAmountCalled) = mockPM.getLastTakeCall();
        assertEq(takeCurrency, currencyOut);
        assertEq(takeTo, user);
        assertEq(takeAmountCalled, takeAmount);
    }
    
    function testPausedReverts() public {
        wrapper.pause(true);
        
        vm.prank(relayer1);
        vm.expectRevert("Paused");
        wrapper.swapWithHook(
            defaultPoolKey,
            bytes32(uint256(1)),
            user,
            uint64(block.timestamp + 1 hours),
            100e18,
            110e18,
            1,
            false,
            address(0),
            0
        );
    }
    
    function testPoolDisabledReverts() public {
        wrapper.setPoolEnabled(defaultPoolHash, false);
        
        vm.prank(relayer1);
        vm.expectRevert("PoolDisabled");
        wrapper.swapWithHook(
            defaultPoolKey,
            bytes32(uint256(1)),
            user,
            uint64(block.timestamp + 1 hours),
            100e18,
            110e18,
            1,
            false,
            address(0),
            0
        );
    }
    
    function testBadUserReverts() public {
        vm.prank(relayer1);
        vm.expectRevert("BadUser");
        wrapper.swapWithHook(
            defaultPoolKey,
            bytes32(uint256(1)),
            address(0), // Bad user
            uint64(block.timestamp + 1 hours),
            100e18,
            110e18,
            1,
            false,
            address(0),
            0
        );
    }
    
    function testDeadlineExpiredReverts() public {
        vm.prank(relayer1);
        vm.expectRevert("DeadlineExpired");
        wrapper.swapWithHook(
            defaultPoolKey,
            bytes32(uint256(1)),
            user,
            uint64(block.timestamp - 1), // Expired deadline
            100e18,
            110e18,
            1,
            false,
            address(0),
            0
        );
    }
    
    function testHashConsistency() public {
        // Test that hash is consistent
        bytes32 hash1 = wrapper.hashPoolKey(defaultPoolKey);
        bytes32 hash2 = wrapper.hashPoolKey(defaultPoolKey);
        assertEq(hash1, hash2);
        
        // Test that different pools have different hashes
        PoolKey memory differentKey = PoolKey({
            currency0: Currency.wrap(currencyB), // Swapped
            currency1: Currency.wrap(currencyA),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0x7777))
        });
        
        bytes32 differentHash = wrapper.hashPoolKey(differentKey);
        assertTrue(hash1 != differentHash);
    }
    
    function testPoolManagerRevertBubbling() public {
        mockPM.setShouldRevert(true, "Mock revert reason");
        
        vm.prank(relayer1);
        vm.expectRevert("Mock revert reason");
        wrapper.swapWithHook(
            defaultPoolKey,
            bytes32(uint256(1)),
            user,
            uint64(block.timestamp + 1 hours),
            100e18,
            110e18,
            1,
            false,
            address(0),
            0
        );
    }
    
    function testSetRelayer() public {
        // Only owner can set relayer
        vm.prank(nonRelayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonRelayer));
        wrapper.setRelayer(relayer2, true);
        
        // Owner sets relayer
        vm.expectEmit(true, false, false, true);
        emit RelayerSet(relayer2, true);
        wrapper.setRelayer(relayer2, true);
        
        assertTrue(wrapper.isRelayer(relayer2));
        
        // New relayer can call swap
        vm.prank(relayer2);
        wrapper.swapWithHook(
            defaultPoolKey,
            bytes32(uint256(1)),
            user,
            uint64(block.timestamp + 1 hours),
            100e18,
            110e18,
            1,
            false,
            address(0),
            0
        );
        
        // Remove relayer
        wrapper.setRelayer(relayer2, false);
        assertFalse(wrapper.isRelayer(relayer2));
        
        vm.prank(relayer2);
        vm.expectRevert("NotRelayer");
        wrapper.swapWithHook(
            defaultPoolKey,
            bytes32(uint256(2)),
            user,
            uint64(block.timestamp + 1 hours),
            100e18,
            110e18,
            1,
            false,
            address(0),
            0
        );
    }
    
    function testBulkSetRelayers() public {
        address[] memory relayers = new address[](3);
        relayers[0] = address(0x1001);
        relayers[1] = address(0x1002);
        relayers[2] = address(0x1003);
        
        // Only owner can bulk set
        vm.prank(nonRelayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonRelayer));
        wrapper.bulkSetRelayers(relayers, true);
        
        // Owner bulk sets relayers
        wrapper.bulkSetRelayers(relayers, true);
        
        for (uint i = 0; i < relayers.length; i++) {
            assertTrue(wrapper.isRelayer(relayers[i]));
        }
        
        // Bulk remove
        wrapper.bulkSetRelayers(relayers, false);
        
        for (uint i = 0; i < relayers.length; i++) {
            assertFalse(wrapper.isRelayer(relayers[i]));
        }
    }
    
    function testSetPoolEnabled() public {
        bytes32 newPoolHash = keccak256("different pool");
        
        // Only owner can set pool
        vm.prank(nonRelayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonRelayer));
        wrapper.setPoolEnabled(newPoolHash, true);
        
        // Owner sets pool
        vm.expectEmit(true, false, false, true);
        emit PoolToggle(newPoolHash, true);
        wrapper.setPoolEnabled(newPoolHash, true);
        
        assertTrue(wrapper.poolEnabled(newPoolHash));
    }
    
    function testPause() public {
        // Only owner can pause
        vm.prank(nonRelayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonRelayer));
        wrapper.pause(true);
        
        // Owner pauses
        vm.expectEmit(false, false, false, true);
        emit Paused(true);
        wrapper.pause(true);
        
        assertTrue(wrapper.paused());
        
        // Owner unpauses
        wrapper.pause(false);
        assertFalse(wrapper.paused());
    }

    function testTakeTokensHappyPath() public {
        address currency = currencyA;
        uint256 amount = 500e18;
        
        vm.expectEmit(true, true, true, true);
        emit TokensTaken(currency, user, user, amount);
        
        vm.prank(relayer1);
        bytes memory result = wrapper.takeTokens(currency, user, user, amount);
        
        // Verify take was called
        assertEq(mockPM.getTakeCallsCount(), 1);
        (address takeCurrency, address takeTo, uint256 takeAmount) = mockPM.getLastTakeCall();
        
        assertEq(takeCurrency, currency);
        assertEq(takeTo, user);
        assertEq(takeAmount, amount);
        
        // Verify return data - the result is bytes containing encoded uint256
        bytes memory innerData = abi.decode(result, (bytes));
        uint256 returnedAmount = abi.decode(innerData, (uint256));
        assertEq(returnedAmount, amount);
    }
    
    function testTakeTokensNotRelayerReverts() public {
        vm.prank(nonRelayer);
        vm.expectRevert("NotRelayer");
        wrapper.takeTokens(currencyA, user, user, 100e18);
    }
    
    function testTakeTokensPausedReverts() public {
        wrapper.pause(true);
        
        vm.prank(relayer1);
        vm.expectRevert("Paused");
        wrapper.takeTokens(currencyA, user, user, 100e18);
    }
    
    function testTakeTokensBadFromReverts() public {
        vm.prank(relayer1);
        vm.expectRevert("BadFrom");
        wrapper.takeTokens(currencyA, address(0), user, 100e18);
    }
    
    function testTakeTokensBadToReverts() public {
        vm.prank(relayer1);
        vm.expectRevert("BadTo");
        wrapper.takeTokens(currencyA, user, address(0), 100e18);
    }
    
    function testTakeTokensZeroAmountReverts() public {
        vm.prank(relayer1);
        vm.expectRevert("ZeroAmount");
        wrapper.takeTokens(currencyA, user, user, 0);
    }
    
    function testTakeTokensInsufficientBalanceReverts() public {
        // Create a mock with zero balance by modifying the mock
        address lowBalanceUser = address(0x1234);
        
        // This will cause the mock to return 0 balance, but we need a different approach
        // Since our mock returns 1000e18 for non-zero addresses, let's try to take more than that
        vm.prank(relayer1);
        vm.expectRevert("InsufficientBalance");
        wrapper.takeTokens(currencyA, lowBalanceUser, user, 1001e18); // More than mock balance
    }
    
    function testTakeTokensToAnotherAddress() public {
        address recipient = address(0x9999);
        uint256 amount = 250e18;
        
        vm.expectEmit(true, true, true, true);
        emit TokensTaken(currencyA, user, recipient, amount);
        
        vm.prank(relayer1);
        wrapper.takeTokens(currencyA, user, recipient, amount);
        
        // Verify take was called with correct recipient
        (address takeCurrency, address takeTo, uint256 takeAmount) = mockPM.getLastTakeCall();
        assertEq(takeTo, recipient);
        assertEq(takeAmount, amount);
    }
}