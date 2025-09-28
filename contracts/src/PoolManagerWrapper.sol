// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TreasuryHook} from "./TreasuryHook.sol";

contract PoolManagerWrapper is Ownable {
    IPoolManager public immutable poolManager;
    TreasuryHook public immutable treasuryHook;
    mapping(bytes32 => bool) public poolEnabled;
    mapping(address => bool) public isRelayer;
    bool public paused;

    PoolKey public liquidPool;
    bytes32 public liquidPoolHash;

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

    constructor(
        IPoolManager _poolManager,
        TreasuryHook _treasuryHook,
        address _owner
    ) Ownable(_owner) {
        poolManager = _poolManager;
        treasuryHook = _treasuryHook;

        liquidPool = PoolKey({
            currency0: Currency.wrap(
                0x0000000000000000000000000000000000000000
            ),
            currency1: Currency.wrap(
                0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
            ),
            fee: 500,
            tickSpacing: 10,
            hooks: IHooks(address(_treasuryHook))
        });
        liquidPoolHash = keccak256(abi.encode(liquidPool));
    }

    function swapWithHook(
        PoolKey calldata poolKey,
        bytes32 txnId,
        address user,
        uint64 deadline,
        uint256 minOut,
        uint256 maxIn,
        uint8 mode,
        bool zeroForOne
    ) external returns (bytes32 poolKeyHash) {
        require(isRelayer[msg.sender], "NotRelayer");
        require(!paused, "Paused");
        require(user != address(0), "BadUser");
        require(block.timestamp <= deadline, "DeadlineExpired");

        poolKeyHash = hashPoolKey(poolKey);
        require(poolEnabled[poolKeyHash], "PoolDisabled");

        bytes memory hookData = abi.encode(
            txnId,
            user,
            deadline,
            minOut,
            maxIn,
            mode,
            zeroForOne
        );

        SwapParams memory swapParams = SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: zeroForOne ? -int256(maxIn) : int256(maxIn),
            sqrtPriceLimitX96: 0
        });

        bytes memory unlockData = abi.encode(poolKey, swapParams, hookData);
        poolManager.unlock(unlockData);

        emit SwapSubmitted(poolKeyHash, txnId, user, mode, false);
    }

    function unlockCallback(
        bytes calldata data
    ) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "NotPoolManager");

        (
            PoolKey memory poolKey,
            SwapParams memory swapParams,
            bytes memory hookData
        ) = abi.decode(data, (PoolKey, SwapParams, bytes));

        BalanceDelta delta = poolManager.swap(poolKey, swapParams, hookData);

        return abi.encode(delta);
    }

    function getClaimBalance(
        address user,
        address token
    ) external view returns (uint256) {
        uint256 tokenId = uint256(uint160(token));
        return poolManager.balanceOf(user, tokenId);
    }

    function claimUserTokens(
        address user,
        address token,
        uint256 amount
    ) external {
        require(isRelayer[msg.sender], "NotRelayer");
        require(!paused, "Paused");

        treasuryHook.claimTokensFor(user, token, amount);

        emit TokensTaken(token, address(treasuryHook), user, amount);
    }

    function setRelayer(address relayer, bool allowed) external onlyOwner {
        isRelayer[relayer] = allowed;
        emit RelayerSet(relayer, allowed);
    }

    function bulkSetRelayers(
        address[] calldata relayers,
        bool allowed
    ) external onlyOwner {
        for (uint256 i = 0; i < relayers.length; i++) {
            isRelayer[relayers[i]] = allowed;
            emit RelayerSet(relayers[i], allowed);
        }
    }

    function setPoolEnabled(
        bytes32 poolKeyHash,
        bool enabled
    ) external onlyOwner {
        poolEnabled[poolKeyHash] = enabled;
        emit PoolToggle(poolKeyHash, enabled);
    }

    function pause(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

    function hashPoolKey(
        PoolKey calldata poolKey
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(poolKey));
    }
}
