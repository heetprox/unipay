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
            hooks: IHooks(address(0))
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
        bool immediateTake,
        address currencyOut,
        uint256 takeAmount
    ) external returns (bytes32 poolKeyHash, bytes memory swapResult) {
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
            mode
        );

        treasuryHook.validateSwap(hookData);

        SwapParams memory swapParams = SwapParams({
            zeroForOne: true,
            amountSpecified: -int256(maxIn),
            sqrtPriceLimitX96: 0
        });

        bytes memory multicallData = abi.encode(
            false,
            liquidPool,
            bytes(""),
            immediateTake,
            currencyOut,
            takeAmount,
            user
        );

        swapResult = poolManager.unlock(multicallData);

        emit SwapSubmitted(poolKeyHash, txnId, user, mode, immediateTake);

        if (immediateTake) {
            emit ImmediateTake(poolKeyHash, currencyOut, takeAmount, user);
        }
    }

    function takeTokens(
        address currency,
        address from,
        address to,
        uint256 amount
    ) external returns (bytes memory result) {
        require(isRelayer[msg.sender], "NotRelayer");
        require(!paused, "Paused");
        require(from != address(0), "BadFrom");
        require(to != address(0), "BadTo");
        require(amount > 0, "ZeroAmount");

        uint256 userBalance = poolManager.balanceOf(
            from,
            uint256(uint160(currency))
        );
        require(userBalance >= amount, "InsufficientBalance");

        bytes memory unlockData = abi.encode(true, currency, from, to, amount);

        result = poolManager.unlock(unlockData);

        emit TokensTaken(currency, from, to, amount);
    }

    function lockAcquired(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "NotPoolManager");

        bool isTakeOnly = abi.decode(data, (bool));

        if (isTakeOnly) {
            (, address currency, address from, address to, uint256 amount) = abi
                .decode(data, (bool, address, address, address, uint256));

            poolManager.take(Currency.wrap(currency), to, amount);
            return abi.encode(amount);
        } else {
            (
                ,
                PoolKey memory poolKey,
                bytes memory hookData,
                bool doTake,
                address currencyOut,
                uint256 takeAmount,
                address user
            ) = abi.decode(
                    data,
                    (bool, PoolKey, bytes, bool, address, uint256, address)
                );

            SwapParams memory swapParams = SwapParams({
                zeroForOne: true,
                amountSpecified: -1e18,
                sqrtPriceLimitX96: 0
            });

            BalanceDelta delta = poolManager.swap(
                poolKey,
                swapParams,
                bytes("")
            );

            if (doTake) {
                poolManager.take(Currency.wrap(currencyOut), user, takeAmount);
            }

            return abi.encode(delta);
        }
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
