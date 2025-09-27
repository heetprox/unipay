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
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

interface ITicketNFT {
    function ownerOf(uint256 tokenId) external view returns (address);

    function burn(bytes32 txnId) external;
}


struct SwapData {
    bytes32 txnId;
    address user;
    uint64 deadline;
    uint256 minAmountOut;
    uint256 maxAmountIn;
    uint8 mode;
    bool zeroForOne;
}

contract TreasuryHook is BaseHook, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    ITicketNFT public immutable ticketNFT;
    IERC20 public immutable usdc;
    address public immutable nativeTokenAddress;
    address public immutable usdcTokenAddress;
    uint24 public immutable poolFee;
    int24 public immutable tickSpacing;

    mapping(bytes32 => bool) public used;
    bool public paused;
    mapping(address => uint256) public maxPerTx;
    mapping(address => bool) public authorizedRelayers;

    mapping(address => uint256) public pendingClaims;
    mapping(bytes32 => SwapData) public pendingSwaps;

    event TicketConsumed(bytes32 txnId, address user);
    event SwapExecuted(
        bytes32 indexed txnId,
        address indexed user,
        address inputToken,
        address outputToken,
        uint256 amountIn,
        uint256 amountOut
    );
    event ClaimCreated(
        address indexed user,
        address indexed token,
        uint256 amount
    );
    event ClaimRedeemed(
        address indexed user,
        address indexed token,
        uint256 amount
    );
    event TreasuryFunded(address indexed token, uint256 amount);
    event RelayerStatusUpdated(address indexed relayer, bool authorized);

    error TicketMissing();
    error TicketUsed();
    error DeadlineExpired();
    error Paused();
    error AmountExceedsLimit();
    error UnauthorizedRelayer();
    error InsufficientTreasuryBalance();
    error InvalidSwapData();
    error SwapFailed();
    error InvalidOutputAmount();

    constructor(
        IPoolManager _poolManager,
        ITicketNFT _ticketNFT,
        address _owner,
        address _nativeToken,
        address _usdcToken,
        uint24 _poolFee,
        int24 _tickSpacing
    ) BaseHook(_poolManager) Ownable(_owner) {
        ticketNFT = _ticketNFT;
        usdc = IERC20(_usdcToken);
        nativeTokenAddress = _nativeToken;
        usdcTokenAddress = _usdcToken;
        poolFee = _poolFee;
        tickSpacing = _tickSpacing;
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

    function _validateAndBurnTicket(SwapData memory swapData) internal {
        if (block.timestamp > swapData.deadline) revert DeadlineExpired();

        if (used[swapData.txnId]) revert TicketUsed();

        if (ticketNFT.ownerOf(uint256(swapData.txnId)) != address(this))
            revert TicketMissing();

        used[swapData.txnId] = true;

        ticketNFT.burn(swapData.txnId);

        emit TicketConsumed(swapData.txnId, swapData.user);
    }

    function validateSwap(bytes calldata hookData) external notPaused {
        SwapData memory swapData = _decodeSwapData(hookData);
        _validateAndBurnTicket(swapData);
    }

    function pause() external {
        paused = !paused;
    }

    function setMaxPerTx(address currency, uint256 max) external {
        maxPerTx[currency] = max;
    }

    function _beforeSwap(
        address,
        PoolKey calldata,
        SwapParams calldata swapParams,
        bytes calldata hookData
    ) internal override notPaused returns (bytes4, BeforeSwapDelta, uint24) {
        SwapData memory swapData = _decodeSwapData(hookData);
        _validateAndBurnTicket(swapData);

        // Validate limits
        address tokenIn = swapData.zeroForOne ? nativeTokenAddress : usdcTokenAddress;
        if (maxPerTx[tokenIn] > 0 && swapData.maxAmountIn > maxPerTx[tokenIn]) {
            revert AmountExceedsLimit();
        }

        // Store swap data for afterSwap to process
        pendingSwaps[swapData.txnId] = swapData;

        return (BaseHook.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);
    }


    function _createERC6909Claim(
        address user,
        address token,
        uint256 amount
    ) internal {
        uint256 tokenId = uint256(uint160(token));
        poolManager.mint(user, tokenId, amount);
        pendingClaims[user] += amount;

        emit ClaimCreated(user, token, amount);
    }

    function _decodeSwapData(
        bytes calldata hookData
    ) internal pure returns (SwapData memory) {
        (
            bytes32 txnId,
            address user,
            uint64 deadline,
            uint256 minAmountOut,
            uint256 maxAmountIn,
            uint8 mode,
            bool zeroForOne
        ) = abi.decode(
                hookData,
                (bytes32, address, uint64, uint256, uint256, uint8, bool)
            );

        return
            SwapData({
                txnId: txnId,
                user: user,
                deadline: deadline,
                minAmountOut: minAmountOut,
                maxAmountIn: maxAmountIn,
                mode: mode,
                zeroForOne: zeroForOne
            });
    }

    function _getTokenBalance(address token) internal view returns (uint256) {
        if (token == address(0)) {
            return address(this).balance;
        } else {
            return IERC20(token).balanceOf(address(this));
        }
    }

    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata swapParams,
        BalanceDelta delta,
        bytes calldata hookData
    ) internal override returns (bytes4, int128) {
        SwapData memory swapData = _decodeSwapData(hookData);
        
        // Clean up pending swap
        delete pendingSwaps[swapData.txnId];
        
        // Calculate output amount from the delta
        uint256 amountOut;
        address outputToken;
        
        if (swapData.zeroForOne) {
            // ETH -> USDC: amount1() is positive (USDC received)
            // Delta is positive for tokens we receive, negative for tokens we pay
            int128 delta1 = delta.amount1();
            require(delta1 > 0, "Invalid swap delta");
            amountOut = uint256(uint128(delta1));
            outputToken = usdcTokenAddress;
        } else {
            // USDC -> ETH: amount0() is positive (ETH received)
            // Delta is positive for tokens we receive, negative for tokens we pay
            int128 delta0 = delta.amount0();
            require(delta0 > 0, "Invalid swap delta");
            amountOut = uint256(uint128(delta0));
            outputToken = nativeTokenAddress;
        }
        
        // Validate minimum output
        require(amountOut >= swapData.minAmountOut, "Insufficient output amount");
        
        // Create ERC-6909 claim for user
        _createERC6909Claim(swapData.user, outputToken, amountOut);
        
        emit SwapExecuted(
            swapData.txnId,
            swapData.user,
            swapData.zeroForOne ? nativeTokenAddress : usdcTokenAddress,
            outputToken,
            swapData.maxAmountIn,
            amountOut
        );
        
        return (BaseHook.afterSwap.selector, 0);
    }

    function claimTokens(address token, uint256 amount) external nonReentrant {
        uint256 tokenId = uint256(uint160(token));
        uint256 claimBalance = poolManager.balanceOf(msg.sender, tokenId);

        require(claimBalance >= amount, "Insufficient claim balance");
        require(
            pendingClaims[msg.sender] >= amount,
            "Insufficient pending claims"
        );

        poolManager.burn(msg.sender, tokenId, amount);
        pendingClaims[msg.sender] -= amount;

        if (token == address(0)) {
            (bool success, ) = payable(msg.sender).call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }

        emit ClaimRedeemed(msg.sender, token, amount);
    }

    function claimTokensFor(
        address user,
        address token,
        uint256 amount
    ) external onlyAuthorizedRelayer nonReentrant {
        uint256 tokenId = uint256(uint160(token));
        uint256 claimBalance = poolManager.balanceOf(user, tokenId);

        require(claimBalance >= amount, "Insufficient claim balance");
        require(pendingClaims[user] >= amount, "Insufficient pending claims");

        poolManager.burn(user, tokenId, amount);
        pendingClaims[user] -= amount;

        if (token == address(0)) {
            (bool success, ) = payable(user).call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(user, amount);
        }

        emit ClaimRedeemed(user, token, amount);
    }

    function fundTreasury(
        address token,
        uint256 amount
    ) external payable onlyOwner {
        if (token == address(0)) {
            require(msg.value == amount, "Incorrect ETH amount");
        } else {
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        emit TreasuryFunded(token, amount);
    }

    function updateRelayerAuthorization(
        address relayer,
        bool authorized
    ) external onlyOwner {
        authorizedRelayers[relayer] = authorized;
        emit RelayerStatusUpdated(relayer, authorized);
    }

    function emergencyWithdraw(
        address token,
        uint256 amount,
        address to
    ) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = payable(to).call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    receive() external payable {
        emit TreasuryFunded(address(0), msg.value);
    }

    modifier onlyAuthorizedRelayer() {
        if (!authorizedRelayers[msg.sender]) revert UnauthorizedRelayer();
        _;
    }

    function validateHookAddress(BaseHook) internal pure override {}
}
