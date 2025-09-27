// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IUniswapV4Router04} from "./V4Swap.sol";
import {TicketNFT} from "./TicketNFT.sol";

contract Relayer is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IUniswapV4Router04 public immutable v4Router;
    IERC20 public immutable usdc;
    address public immutable nativeTokenAddress;
    address public immutable usdcTokenAddress;
    uint24 public immutable poolFee;
    int24 public immutable tickSpacing;
    PoolKey private poolKey;

    TicketNFT public ticketContract;

    mapping(address => bool) public authorizedRelayers;
    bool public contractPaused;

    event RelayerStatusUpdated(address indexed relayer, bool authorized);
    event ContractPauseStatusChanged(bool paused);
    event TicketMinted(
        bytes32 indexed transactionId,
        address indexed recipient
    );
    event TicketConsumed(bytes32 indexed transactionId, address indexed user);
    event ETHToUSDCSwapExecuted(
        bytes32 indexed transactionId,
        address indexed user,
        uint256 ethAmount,
        uint256 usdcAmount
    );
    event USDCToETHSwapExecuted(
        bytes32 indexed transactionId,
        address indexed user,
        uint256 usdcAmount,
        uint256 ethAmount
    );
    event FundsSwept(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );

    error UnauthorizedRelayer();
    error ContractPaused();
    error InvalidUser();
    error TransactionExpired();
    error TicketNotOwnedByContract();
    error InsufficientETHBalance();
    error InsufficientUSDCBalance();
    error InvalidRecipient();
    error ETHTransferFailed();

    constructor(
        address contractOwner,
        TicketNFT ticketNFTContract,
        address uniswapV4Router,
        address nativeToken,
        address usdcToken,
        uint24 fee,
        int24 spacing
    ) Ownable(contractOwner) {
        v4Router = IUniswapV4Router04(uniswapV4Router);
        usdc = IERC20(usdcToken);
        ticketContract = ticketNFTContract;
        nativeTokenAddress = nativeToken;
        usdcTokenAddress = usdcToken;
        poolFee = fee;
        tickSpacing = spacing;

        poolKey = PoolKey({
            currency0: Currency.wrap(nativeToken),
            currency1: Currency.wrap(usdcToken),
            fee: fee,
            tickSpacing: spacing,
            hooks: IHooks(address(0))
        });
    }

    function mintTicket(
        bytes32 transactionId
    ) external onlyAuthorizedRelayer whenNotPaused nonReentrant {
        ticketContract.mint(transactionId, address(this));
        emit TicketMinted(transactionId, address(this));
    }

    function mintTicketAndSwapETHToUSDC(
        bytes32 transactionId,
        address user,
        uint256 ethAmount,
        uint256 minimumUSDCOutput,
        uint64 deadline
    )
        external
        onlyAuthorizedRelayer
        whenNotPaused
        nonReentrant
        returns (uint256 usdcOutput)
    {
        ticketContract.mint(transactionId, address(this));
        emit TicketMinted(transactionId, address(this));
        usdcOutput = executeETHToUSDCSwap(
            transactionId,
            user,
            ethAmount,
            minimumUSDCOutput,
            deadline
        );
    }

    function mintTicketAndSwapUSDCToETH(
        bytes32 transactionId,
        address user,
        uint256 usdcAmount,
        uint256 minimumETHOutput,
        uint64 deadline
    )
        external
        onlyAuthorizedRelayer
        whenNotPaused
        nonReentrant
        returns (uint256 ethOutput)
    {
        ticketContract.mint(transactionId, address(this));
        emit TicketMinted(transactionId, address(this));
        ethOutput = executeUSDCToETHSwap(
            transactionId,
            user,
            usdcAmount,
            minimumETHOutput,
            deadline
        );
    }

    function swapETHToUSDC(
        bytes32 transactionId,
        address user,
        uint256 ethAmount,
        uint256 minimumUSDCOutput,
        uint64 deadline
    )
        external
        onlyAuthorizedRelayer
        whenNotPaused
        nonReentrant
        returns (uint256 usdcOutput)
    {
        usdcOutput = executeETHToUSDCSwap(
            transactionId,
            user,
            ethAmount,
            minimumUSDCOutput,
            deadline
        );
    }

    function swapUSDCToETH(
        bytes32 transactionId,
        address user,
        uint256 usdcAmount,
        uint256 minimumETHOutput,
        uint64 deadline
    )
        external
        onlyAuthorizedRelayer
        whenNotPaused
        nonReentrant
        returns (uint256 ethOutput)
    {
        ethOutput = executeUSDCToETHSwap(
            transactionId,
            user,
            usdcAmount,
            minimumETHOutput,
            deadline
        );
    }

    function updateRelayerAuthorization(
        address relayer,
        bool authorized
    ) external onlyOwner {
        authorizedRelayers[relayer] = authorized;
        emit RelayerStatusUpdated(relayer, authorized);
    }

    function updateContractPauseStatus(bool paused) external onlyOwner {
        contractPaused = paused;
        emit ContractPauseStatusChanged(paused);
    }

    function updateTicketContract(
        TicketNFT newTicketContract
    ) external onlyOwner {
        ticketContract = newTicketContract;
    }

    receive() external payable {}

    function sweepFunds(
        address token,
        address recipient,
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert InvalidRecipient();

        if (token == address(0)) {
            (bool success, ) = recipient.call{value: amount}("");
            if (!success) revert ETHTransferFailed();
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
        emit FundsSwept(token, recipient, amount);
    }

    function executeETHToUSDCSwap(
        bytes32 transactionId,
        address user,
        uint256 ethAmount,
        uint256 minimumUSDCOutput,
        uint64 deadline
    ) internal returns (uint256 usdcOutput) {
        validateUserAndDeadline(user, deadline);
        consumeTicket(transactionId, user);

        if (address(this).balance < ethAmount) revert InsufficientETHBalance();

        usdcOutput = v4Router.swapExactTokensForTokens{value: ethAmount}(
            ethAmount,
            minimumUSDCOutput,
            true,
            poolKey,
            "",
            user,
            uint256(deadline)
        );

        emit ETHToUSDCSwapExecuted(transactionId, user, ethAmount, usdcOutput);
    }

    function executeUSDCToETHSwap(
        bytes32 transactionId,
        address user,
        uint256 usdcAmount,
        uint256 minimumETHOutput,
        uint64 deadline
    ) internal returns (uint256 ethOutput) {
        validateUserAndDeadline(user, deadline);
        consumeTicket(transactionId, user);

        if (usdc.balanceOf(address(this)) < usdcAmount)
            revert InsufficientUSDCBalance();

        usdc.approve(address(v4Router), 0);
        usdc.safeIncreaseAllowance(address(v4Router), usdcAmount);

        ethOutput = v4Router.swapExactTokensForTokens(
            usdcAmount,
            minimumETHOutput,
            false,
            poolKey,
            "",
            user,
            uint256(deadline)
        );

        emit USDCToETHSwapExecuted(transactionId, user, usdcAmount, ethOutput);
    }

    function consumeTicket(bytes32 transactionId, address user) internal {
        if (ticketContract.ownerOfTxn(transactionId) != address(this)) {
            revert TicketNotOwnedByContract();
        }
        ticketContract.burn(transactionId);
        emit TicketConsumed(transactionId, user);
    }

    function validateUserAndDeadline(
        address user,
        uint64 deadline
    ) internal view {
        if (user == address(0)) revert InvalidUser();
        if (block.timestamp > uint256(deadline)) revert TransactionExpired();
    }

    modifier onlyAuthorizedRelayer() {
        if (!authorizedRelayers[msg.sender]) revert UnauthorizedRelayer();
        _;
    }

    modifier whenNotPaused() {
        if (contractPaused) revert ContractPaused();
        _;
    }
}
