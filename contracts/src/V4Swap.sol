// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

interface IUniswapV4Router04 {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        bool zeroForOne,
        PoolKey memory poolKey,
        bytes calldata hookData,
        address recipient,
        uint256 deadline
    ) external payable returns (uint256 amountOut);

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        bool zeroForOne,
        PoolKey memory poolKey,
        bytes calldata hookData,
        address recipient,
        uint256 deadline
    ) external payable returns (uint256 amountIn);
}

interface IETH {
    function deposit() external payable;

    function withdraw(uint256) external;

    function balanceOf(address) external view returns (uint256);

    function transfer(address, uint256) external returns (bool);

    function transferFrom(address, address, uint256) external returns (bool);

    function approve(address, uint256) external returns (bool);
}

contract V4Swap is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IUniswapV4Router04 public immutable V4_ROUTER;
    IERC20 public immutable USDC;

    address public constant V4_ROUTER_ADDRESS =
        0x00000000000044a361Ae3cAc094c9D1b14Eece97;
    address public constant CURRENCY_0 =
        0x0000000000000000000000000000000000000000;
    address public constant CURRENCY_1 =
        0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    uint24 public constant POOL_FEE = 500;
    int24 public constant TICK_SPACING = 10;
    address public constant HOOK_ADDRESS = address(0x0);

    event SwapExecuted(
        address indexed sender,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    constructor() {
        V4_ROUTER = IUniswapV4Router04(V4_ROUTER_ADDRESS);
        USDC = IERC20(CURRENCY_1);
    }

    function swapETHForUSDC(
        uint256 amountOutMinimum
    ) external payable nonReentrant returns (uint256 amountOut) {
        require(msg.value > 0, "Must send ETH");

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(CURRENCY_0),
            currency1: Currency.wrap(CURRENCY_1),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(HOOK_ADDRESS)
        });

        amountOut = V4_ROUTER.swapExactTokensForTokens{value: msg.value}(
            msg.value,
            amountOutMinimum,
            true,
            poolKey,
            "",
            msg.sender,
            block.timestamp + 300
        );

        emit SwapExecuted(
            msg.sender,
            address(0),
            CURRENCY_1,
            msg.value,
            amountOut
        );
    }

    function swapUSDCForETH(
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "Amount must be greater than 0");

        USDC.safeTransferFrom(msg.sender, address(this), amountIn);
        USDC.safeIncreaseAllowance(V4_ROUTER_ADDRESS, amountIn);

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(CURRENCY_0),
            currency1: Currency.wrap(CURRENCY_1),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(HOOK_ADDRESS)
        });

        amountOut = V4_ROUTER.swapExactTokensForTokens(
            amountIn,
            amountOutMinimum,
            false,
            poolKey,
            "",
            msg.sender,
            block.timestamp + 300
        );

        emit SwapExecuted(
            msg.sender,
            CURRENCY_1,
            address(0),
            amountIn,
            amountOut
        );
    }

    function getAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external pure returns (uint256 amountOut) {
        return 0;
    }

    receive() external payable {}
}
