// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TreasuryHook, ITicketNFT} from "../src/TreasuryHook.sol";
import {TicketNFT} from "../src/TicketNFT.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

contract MockSponsorVault {
    mapping(address => uint256) public paidAmounts;

    function pay(address currency, uint256 amount, address) external {
        paidAmounts[currency] += amount;
    }

    function payETH(uint256 amount, address) external {
        paidAmounts[address(0)] += amount;
    }
}

contract MockPoolManager {
    function swap(
        PoolKey memory,
        SwapParams memory,
        bytes memory
    ) external pure returns (BalanceDelta) {
        return BalanceDelta.wrap(0);
    }
}

contract IntegrationTest is Test {
    TicketNFT nft;
    TreasuryHook hook;
    MockSponsorVault vault;

    bytes32 constant TXN_ID = bytes32(uint256(0x123abc));
    address constant USER = address(0x1234);
    address minter = address(this);

    function setUp() public {
        vault = new MockSponsorVault();

        nft = new TicketNFT("Test Ticket", "TICKET", address(1), minter);

        hook = new TreasuryHook(
            IPoolManager(address(new MockPoolManager())),
            ITicketNFT(address(nft))
        );

        nft.setHook(address(hook));
    }

    function testEndToEndTicketFlow() public {
        // 1. Minter mints ticket to hook
        vm.expectEmit(true, true, false, true);
        emit TicketNFT.TicketMinted(TXN_ID, address(hook));
        nft.mint(TXN_ID, address(hook));

        // Verify hook owns the ticket
        assertEq(nft.ownerOf(uint256(TXN_ID)), address(hook));
        assertEq(nft.ownerOfTxn(TXN_ID), address(hook));

        // 2. Hook burns ticket (simulating _beforeSwap)
        vm.expectEmit(true, false, false, true);
        emit TicketNFT.TicketBurned(TXN_ID);

        vm.prank(address(hook));
        nft.burn(TXN_ID);

        // Verify ticket is burned
        vm.expectRevert(TicketNFT.TokenNotExists.selector);
        nft.ownerOf(uint256(TXN_ID));
    }

    function testTicketTransferLock() public {
        // Enable transfer lock
        nft.setTransferLock(true);

        // Mint ticket to user first
        nft.mint(TXN_ID, USER);

        // User can only transfer to hook
        vm.prank(USER);
        nft.transferFrom(USER, address(hook), uint256(TXN_ID));

        assertEq(nft.ownerOf(uint256(TXN_ID)), address(hook));

        // Now hook can burn it
        vm.prank(address(hook));
        nft.burn(TXN_ID);
    }

    function testOnlyHookCanBurn() public {
        // Mint ticket to user
        nft.mint(TXN_ID, USER);

        // User cannot burn their own ticket
        vm.prank(USER);
        vm.expectRevert(TicketNFT.NotHook.selector);
        nft.burn(TXN_ID);

        // Only hook can burn
        vm.prank(address(hook));
        nft.burn(TXN_ID);
    }

    function testDuplicateTicketPrevention() public {
        // Mint ticket once
        nft.mint(TXN_ID, address(hook));

        // Cannot mint same txnId again
        vm.expectRevert(TicketNFT.AlreadyMinted.selector);
        nft.mint(TXN_ID, USER);

        // Even after burning, the minted mapping remains true
        vm.prank(address(hook));
        nft.burn(TXN_ID);

        // Still cannot mint again
        vm.expectRevert(TicketNFT.AlreadyMinted.selector);
        nft.mint(TXN_ID, USER);
    }
}
