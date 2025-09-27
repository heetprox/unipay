// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {ImmutableState} from "@uniswap/v4-periphery/src/base/ImmutableState.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

interface ITicketNFT {
    function ownerOf(uint256 tokenId) external view returns (address);

    function burn(bytes32 txnId) external;
}

interface ISponsorVault {
    function pay(address currency, uint256 amount, address to) external;
}

contract TreasuryHook is BaseHook {
    ITicketNFT public immutable ticketNFT;
    ISponsorVault public immutable vault;

    mapping(bytes32 => bool) public used;
    bool public paused;
    mapping(address => uint256) public maxPerTx;

    event TicketConsumed(bytes32 txnId, address user);

    error TicketMissing();
    error TicketUsed();
    error DeadlineExpired();
    error Paused();
    error AmountExceedsLimit();

    constructor(
        IPoolManager _poolManager,
        ITicketNFT _ticketNFT,
        ISponsorVault _vault
    ) BaseHook(_poolManager) {
        ticketNFT = _ticketNFT;
        vault = _vault;
    }

    function getHookPermissions()
        public
        pure
        override
        returns (Hooks.Permissions memory)
    {
        return
            Hooks.Permissions({
                beforeInitialize: false,
                afterInitialize: false,
                beforeAddLiquidity: false,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: true,
                afterSwap: true,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: false,
                afterSwapReturnDelta: false,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            });
    }

    modifier notPaused() {
        if (paused) revert Paused();
        _;
    }

    function _validateAndBurnTicket(bytes calldata hookData) internal {
        (
            bytes32 txnId,
            address user,
            uint64 deadline,
            uint256 minOut,
            uint256 maxIn,
            uint8 mode
        ) = abi.decode(
                hookData,
                (bytes32, address, uint64, uint256, uint256, uint8)
            );

        if (block.timestamp > deadline) revert DeadlineExpired();

        if (used[txnId]) revert TicketUsed();

        if (ticketNFT.ownerOf(uint256(txnId)) != address(this))
            revert TicketMissing();

        used[txnId] = true;

        ticketNFT.burn(txnId);

        emit TicketConsumed(txnId, user);
    }

    function validateSwap(bytes calldata hookData) external notPaused {
        _validateAndBurnTicket(hookData);
    }

    function pause() external {
        paused = !paused;
    }

    function setMaxPerTx(address currency, uint256 max) external {
        maxPerTx[currency] = max;
    }

    function _beforeSwap(
        address,
        bytes calldata hookData
    ) internal notPaused returns (bytes4, BeforeSwapDelta, uint24) {
        _validateAndBurnTicket(hookData);
        return (BaseHook.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);
    }

    function lockAcquired(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager))
            revert ImmutableState.NotPoolManager();

        (
            PoolKey memory key,
            SwapParams memory params,
            bytes memory hookData
        ) = abi.decode(data, (PoolKey, SwapParams, bytes));

        BalanceDelta delta = poolManager.swap(key, params, hookData);

        Currency currencyIn;
        uint256 amountIn;

        if (params.zeroForOne) {
            currencyIn = key.currency0;
            amountIn = uint256(int256(-delta.amount0()));
        } else {
            currencyIn = key.currency1;
            amountIn = uint256(int256(-delta.amount1()));
        }

        if (
            maxPerTx[Currency.unwrap(currencyIn)] > 0 &&
            amountIn > maxPerTx[Currency.unwrap(currencyIn)]
        ) {
            revert AmountExceedsLimit();
        }

        vault.pay(Currency.unwrap(currencyIn), amountIn, address(poolManager));

        return abi.encode(delta);
    }

    function _afterSwap(
        address,
        PoolKey calldata,
        BalanceDelta,
        bytes calldata hookData
    ) internal pure returns (bytes4, int128) {
        (, address user, , , , ) = abi.decode(
            hookData,
            (bytes32, address, uint64, uint256, uint256, uint8)
        );

        return (BaseHook.afterSwap.selector, 0);
    }

    function validateHookAddress(BaseHook) internal pure override {}
}
