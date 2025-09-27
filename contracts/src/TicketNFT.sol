// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract TicketNFT is ERC721, Ownable {
    mapping(bytes32 => bool) public minted;

    address public hook;
    address public minter;
    bool public transferLock;

    event TicketMinted(bytes32 indexed txnId, address indexed to);
    event TicketBurned(bytes32 indexed txnId);
    event HookChanged(address indexed oldHook, address indexed newHook);
    event MinterChanged(address indexed oldMinter, address indexed newMinter);
    event TransferLockChanged(bool locked);

    error AlreadyMinted();
    error NotMinter();
    error NotHook();
    error InvalidRecipient();
    error TokenNotExists();

    constructor(
        string memory _name,
        string memory _symbol,
        address _hook,
        address _minter
    ) ERC721(_name, _symbol) Ownable(msg.sender) {
        hook = _hook;
        minter = _minter;
    }

    modifier onlyMinter() {
        if (msg.sender != minter) revert NotMinter();
        _;
    }

    modifier onlyHook() {
        if (msg.sender != hook) revert NotHook();
        _;
    }

    function txnIdToTokenId(bytes32 txnId) public pure returns (uint256) {
        return uint256(txnId);
    }

    function tokenIdToTxnId(uint256 tokenId) public pure returns (bytes32) {
        return bytes32(tokenId);
    }

    function ownerOfTxn(bytes32 txnId) public view returns (address) {
        return ownerOf(uint256(txnId));
    }

    function mint(bytes32 txnId, address to) external onlyMinter {
        if (minted[txnId]) revert AlreadyMinted();

        uint256 tokenId = uint256(txnId);
        minted[txnId] = true;

        _mint(to, tokenId);

        emit TicketMinted(txnId, to);
    }

    function burn(bytes32 txnId) external onlyHook {
        uint256 tokenId = uint256(txnId);

        address tokenOwner = _ownerOf(tokenId);
        if (tokenOwner == address(0)) revert TokenNotExists();

        _burn(tokenId);

        emit TicketBurned(txnId);
    }

    function setHook(address newHook) external onlyOwner {
        address oldHook = hook;
        hook = newHook;
        emit HookChanged(oldHook, newHook);
    }

    function setMinter(address newMinter) external onlyOwner {
        address oldMinter = minter;
        minter = newMinter;
        emit MinterChanged(oldMinter, newMinter);
    }

    function setTransferLock(bool locked) external onlyOwner {
        transferLock = locked;
        emit TransferLockChanged(locked);
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        if (
            transferLock && from != address(0) && to != address(0) && to != hook
        ) {
            revert InvalidRecipient();
        }

        return super._update(to, tokenId, auth);
    }

    function ownerOf(uint256 tokenId) public view override returns (address) {
        address tokenOwner = _ownerOf(tokenId);
        if (tokenOwner == address(0)) revert TokenNotExists();
        return tokenOwner;
    }
}
