pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {TicketNFT} from "../src/TicketNFT.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract MockERC721Receiver {
    bool public shouldRevert;
    bool public shouldReturnWrongSelector;

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function setShouldReturnWrongSelector(bool _shouldReturnWrong) external {
        shouldReturnWrongSelector = _shouldReturnWrong;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) external view returns (bytes4) {
        if (shouldRevert) {
            revert("Receiver revert");
        }
        if (shouldReturnWrongSelector) {
            return bytes4(0);
        }
        return this.onERC721Received.selector;
    }
}

contract TicketNFTTest is Test {
    TicketNFT nft;
    MockERC721Receiver receiver;

    address owner = address(this);
    address hook = address(0x1111);
    address minter = address(0x2222);
    address user = address(0x3333);
    address other = address(0x4444);

    bytes32 constant TXN_ID_1 = bytes32(uint256(0xabc123));
    bytes32 constant TXN_ID_2 = bytes32(uint256(0xdef456));

    event TicketMinted(bytes32 indexed txnId, address indexed to);
    event TicketBurned(bytes32 indexed txnId);
    event HookChanged(address indexed oldHook, address indexed newHook);
    event MinterChanged(address indexed oldMinter, address indexed newMinter);
    event TransferLockChanged(bool locked);

    function setUp() public {
        nft = new TicketNFT("Test Ticket", "TICKET", hook, minter);
        receiver = new MockERC721Receiver();
    }

    function testInitialState() public {
        assertEq(nft.name(), "Test Ticket");
        assertEq(nft.symbol(), "TICKET");
        assertEq(nft.owner(), owner);
        assertEq(nft.hook(), hook);
        assertEq(nft.minter(), minter);
        assertFalse(nft.transferLock());
    }

    function testSupportsInterface() public {
        assertTrue(nft.supportsInterface(0x80ac58cd));
        assertTrue(nft.supportsInterface(0x01ffc9a7));
        assertFalse(nft.supportsInterface(0x12345678));
    }

    function testTxnIdHelpers() public {
        uint256 tokenId = nft.txnIdToTokenId(TXN_ID_1);
        assertEq(tokenId, uint256(TXN_ID_1));

        bytes32 txnId = nft.tokenIdToTxnId(tokenId);
        assertEq(txnId, TXN_ID_1);
    }

    function testMintOnce() public {
        vm.expectEmit(true, true, false, true);
        emit TicketMinted(TXN_ID_1, user);

        vm.prank(minter);
        nft.mint(TXN_ID_1, user);

        assertTrue(nft.minted(TXN_ID_1));
        assertEq(nft.ownerOf(uint256(TXN_ID_1)), user);
        assertEq(nft.ownerOfTxn(TXN_ID_1), user);
        assertEq(nft.balanceOf(user), 1);
    }

    function testMintOnlyMinter() public {
        vm.prank(other);
        vm.expectRevert(TicketNFT.NotMinter.selector);
        nft.mint(TXN_ID_1, user);

        vm.prank(hook);
        vm.expectRevert(TicketNFT.NotMinter.selector);
        nft.mint(TXN_ID_1, user);

        if (owner != minter) {
            vm.prank(owner);
            vm.expectRevert(TicketNFT.NotMinter.selector);
            nft.mint(TXN_ID_1, user);
        }
    }

    function testDuplicateMint() public {
        vm.prank(minter);
        nft.mint(TXN_ID_1, user);

        vm.prank(minter);
        vm.expectRevert(TicketNFT.AlreadyMinted.selector);
        nft.mint(TXN_ID_1, other);
    }

    function testBurnPath() public {
        vm.prank(minter);
        nft.mint(TXN_ID_1, user);

        uint256 tokenId = uint256(TXN_ID_1);
        assertEq(nft.ownerOf(tokenId), user);
        assertEq(nft.balanceOf(user), 1);

        vm.prank(other);
        vm.expectRevert(TicketNFT.NotHook.selector);
        nft.burn(TXN_ID_1);

        vm.prank(user);
        vm.expectRevert(TicketNFT.NotHook.selector);
        nft.burn(TXN_ID_1);

        vm.expectEmit(true, false, false, true);
        emit TicketBurned(TXN_ID_1);

        vm.prank(hook);
        nft.burn(TXN_ID_1);

        vm.expectRevert(TicketNFT.TokenNotExists.selector);
        nft.ownerOf(tokenId);

        assertEq(nft.balanceOf(user), 0);
    }

    function testBurnNonExistentToken() public {
        vm.prank(hook);
        vm.expectRevert(TicketNFT.TokenNotExists.selector);
        nft.burn(TXN_ID_1);
    }

    function testTransferLockDisabled() public {
        vm.prank(minter);
        nft.mint(TXN_ID_1, user);

        uint256 tokenId = uint256(TXN_ID_1);

        vm.prank(user);
        nft.transferFrom(user, other, tokenId);

        assertEq(nft.ownerOf(tokenId), other);
    }

    function testTransferLockEnabled() public {
        nft.setTransferLock(true);
        assertTrue(nft.transferLock());

        vm.prank(minter);
        nft.mint(TXN_ID_1, user);

        uint256 tokenId = uint256(TXN_ID_1);

        vm.prank(user);
        vm.expectRevert(TicketNFT.InvalidRecipient.selector);
        nft.transferFrom(user, other, tokenId);

        vm.prank(user);
        nft.transferFrom(user, hook, tokenId);

        assertEq(nft.ownerOf(tokenId), hook);
    }

    function testSafeTransferLockEnabled() public {
        nft.setTransferLock(true);

        vm.prank(minter);
        nft.mint(TXN_ID_1, user);

        uint256 tokenId = uint256(TXN_ID_1);

        vm.prank(user);
        vm.expectRevert(TicketNFT.InvalidRecipient.selector);
        nft.safeTransferFrom(user, other, tokenId);

        vm.prank(user);
        nft.safeTransferFrom(user, hook, tokenId);

        assertEq(nft.ownerOf(tokenId), hook);
    }

    function testSafeTransferToContract() public {
        vm.prank(minter);
        nft.mint(TXN_ID_1, user);

        uint256 tokenId = uint256(TXN_ID_1);

        vm.prank(user);
        nft.safeTransferFrom(user, address(receiver), tokenId);

        assertEq(nft.ownerOf(tokenId), address(receiver));
    }

    function testSafeTransferToContractRevert() public {
        vm.prank(minter);
        nft.mint(TXN_ID_1, user);

        uint256 tokenId = uint256(TXN_ID_1);

        receiver.setShouldRevert(true);

        vm.prank(user);
        vm.expectRevert("Receiver revert");
        nft.safeTransferFrom(user, address(receiver), tokenId);
    }

    function testSafeTransferToContractWrongSelector() public {
        vm.prank(minter);
        nft.mint(TXN_ID_1, user);

        uint256 tokenId = uint256(TXN_ID_1);

        receiver.setShouldReturnWrongSelector(true);

        vm.prank(user);
        vm.expectRevert();
        nft.safeTransferFrom(user, address(receiver), tokenId);
    }

    function testRoleChanges() public {
        address newHook = address(0x5555);
        address newMinter = address(0x6666);

        vm.prank(other);
        vm.expectRevert(
            abi.encodeWithSelector(
                Ownable.OwnableUnauthorizedAccount.selector,
                other
            )
        );
        nft.setHook(newHook);

        vm.prank(other);
        vm.expectRevert(
            abi.encodeWithSelector(
                Ownable.OwnableUnauthorizedAccount.selector,
                other
            )
        );
        nft.setMinter(newMinter);

        vm.expectEmit(true, true, false, true);
        emit HookChanged(hook, newHook);
        nft.setHook(newHook);

        assertEq(nft.hook(), newHook);

        vm.expectEmit(true, true, false, true);
        emit MinterChanged(minter, newMinter);
        nft.setMinter(newMinter);

        assertEq(nft.minter(), newMinter);

        vm.prank(newMinter);
        nft.mint(TXN_ID_1, user);

        vm.prank(newHook);
        nft.burn(TXN_ID_1);
    }

    function testTransferLockChange() public {
        vm.prank(other);
        vm.expectRevert(
            abi.encodeWithSelector(
                Ownable.OwnableUnauthorizedAccount.selector,
                other
            )
        );
        nft.setTransferLock(true);

        vm.expectEmit(false, false, false, true);
        emit TransferLockChanged(true);
        nft.setTransferLock(true);

        assertTrue(nft.transferLock());
    }

    function testApprovalMechanism() public {
        // Mint token
        vm.prank(minter);
        nft.mint(TXN_ID_1, user);

        uint256 tokenId = uint256(TXN_ID_1);

        // User approves other
        vm.prank(user);
        nft.approve(other, tokenId);

        assertEq(nft.getApproved(tokenId), other);

        // Other can now transfer
        vm.prank(other);
        nft.transferFrom(user, other, tokenId);

        assertEq(nft.ownerOf(tokenId), other);

        // Approval should be cleared after transfer
        assertEq(nft.getApproved(tokenId), address(0));
    }

    function testApprovalForAll() public {
        // User sets approval for all
        vm.prank(user);
        nft.setApprovalForAll(other, true);

        assertTrue(nft.isApprovedForAll(user, other));

        // Mint multiple tokens to user
        vm.prank(minter);
        nft.mint(TXN_ID_1, user);
        vm.prank(minter);
        nft.mint(TXN_ID_2, user);

        // Other can transfer any token
        vm.prank(other);
        nft.transferFrom(user, other, uint256(TXN_ID_1));

        vm.prank(other);
        nft.transferFrom(user, hook, uint256(TXN_ID_2));

        assertEq(nft.ownerOf(uint256(TXN_ID_1)), other);
        assertEq(nft.ownerOf(uint256(TXN_ID_2)), hook);
    }

    function testUnauthorizedTransfer() public {
        // Mint token to user
        vm.prank(minter);
        nft.mint(TXN_ID_1, user);

        uint256 tokenId = uint256(TXN_ID_1);

        // Other tries to transfer without approval
        vm.prank(other);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC721Errors.ERC721InsufficientApproval.selector,
                other,
                tokenId
            )
        );
        nft.transferFrom(user, other, tokenId);
    }

    function testBurnClearsApprovals() public {
        // Mint token and approve
        vm.prank(minter);
        nft.mint(TXN_ID_1, user);

        uint256 tokenId = uint256(TXN_ID_1);

        vm.prank(user);
        nft.approve(other, tokenId);

        assertEq(nft.getApproved(tokenId), other);

        // Burn token
        vm.prank(hook);
        nft.burn(TXN_ID_1);

        // Getting approved should revert for non-existent token (OpenZeppelin uses different error)
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC721Errors.ERC721NonexistentToken.selector,
                tokenId
            )
        );
        nft.getApproved(tokenId);
    }
}
