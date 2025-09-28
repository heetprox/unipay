// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TreasuryHook, ITicketNFT} from "../src/TreasuryHook.sol";

contract HookMiner {
    // Find a salt that makes the CREATE2 address have the required hook flags
    function find(
        address deployer,
        uint160 flags,
        bytes memory creationCode,
        bytes memory constructorArgs
    ) external pure returns (address, bytes32) {
        bytes memory bytecode = abi.encodePacked(creationCode, constructorArgs);
        bytes32 salt = 0;
        
        // Try up to 100000 iterations to find a valid address
        for (uint256 i = 0; i < 100000; i++) {
            address hookAddress = computeAddress(deployer, salt, bytecode);
            // Check if address has EXACTLY the required flags and no extra ones
            // We mask with 0x3FFF to check only the hook permission bits (last 14 bits)
            if ((uint160(hookAddress) & 0x3FFF) == flags) {
                return (hookAddress, salt);
            }
            salt = bytes32(uint256(salt) + 1);
        }
        
        revert("Could not find valid hook address");
    }
    
    function computeAddress(
        address deployer,
        bytes32 salt,
        bytes memory bytecode
    ) public pure returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                deployer,
                salt,
                keccak256(bytecode)
            )
        );
        return address(uint160(uint256(hash)));
    }
}

contract HookDeployer {
    HookMiner public immutable miner;
    
    constructor() {
        miner = new HookMiner();
    }
    
    function deployTreasuryHook(
        IPoolManager poolManager,
        ITicketNFT ticketNFT,
        address owner,
        address nativeToken,
        address usdcToken,
        uint24 poolFee,
        int24 tickSpacing,
        uint160 flags
    ) external returns (TreasuryHook) {
        bytes memory creationCode = type(TreasuryHook).creationCode;
        bytes memory constructorArgs = abi.encode(
            poolManager, 
            ticketNFT, 
            owner,
            nativeToken,
            usdcToken,
            poolFee,
            tickSpacing
        );
        
        (address expectedAddress, bytes32 salt) = miner.find(
            address(this),
            flags,
            creationCode,
            constructorArgs
        );
        
        // Deploy using CREATE2
        TreasuryHook hook = new TreasuryHook{salt: salt}(
            poolManager, 
            ticketNFT, 
            owner,
            nativeToken,
            usdcToken,
            poolFee,
            tickSpacing
        );
        
        require(address(hook) == expectedAddress, "Deployment address mismatch");
        return hook;
    }
}