// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TicketNFT} from "./TicketNFT.sol";
import {PricingOracle} from "./PricingOracle.sol";

// Universal Router interface
interface IUniversalRouter {
    function execute(
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external payable;
}

// Commands and Actions constants
library Commands {
    uint8 constant V4_SWAP = 0x10;
}

// IV4Router struct
struct ExactInputSingleParams {
    PoolKey poolKey;
    bool zeroForOne;
    uint128 amountIn;
    uint128 amountOutMinimum;
    bytes hookData;
}

contract Relayer is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IUniversalRouter public immutable universalRouter;
    IERC20 public immutable usdc;
    address public immutable nativeTokenAddress;
    address public immutable usdcTokenAddress;
    uint24 public immutable poolFee;
    int24 public immutable tickSpacing;
    PoolKey private poolKey;

    TicketNFT public ticketContract;
    PricingOracle public pricingOracle;

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
    event QuoteSwapExecuted(
        bytes32 indexed quoteId,
        bytes32 indexed transactionId,
        address indexed user,
        uint256 outputAmount
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
        PricingOracle pricingOracleContract,
        address uniswapV4Router,
        address nativeToken,
        address usdcToken,
        uint24 fee,
        int24 spacing
    ) Ownable(contractOwner) {
        universalRouter = IUniversalRouter(uniswapV4Router);
        usdc = IERC20(usdcToken);
        ticketContract = ticketNFTContract;
        pricingOracle = pricingOracleContract;
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

    function swapETHToUSDC(
        bytes32 transactionId,
        address user,
        uint256 ethAmount,
        uint256 minimumUSDCOutput
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
            minimumUSDCOutput
        );
    }

    function swapWithQuote(
        bytes32 quoteId,
        bytes32 transactionId
    )
        external
        payable
        onlyAuthorizedRelayer
        whenNotPaused
        nonReentrant
        returns (uint256 outputAmount)
    {
        // Get quote details
        PricingOracle.Quote memory quote = pricingOracle.getQuote(quoteId);
        require(
            pricingOracle.isQuoteValid(quoteId),
            "Quote invalid or expired"
        );

        // Claim the quote
        pricingOracle.claimQuote(quoteId);

        if (quote.quoteType == PricingOracle.QuoteType.ETH_INR) {
            // ETH/INR: Input USDC, Output ETH
            outputAmount = executeUSDCToETHSwap(
                transactionId,
                quote.user,
                uint256(quote.inputAmount), // USDC input amount
                uint256((quote.outputAmount * 95) / 100) // 5% slippage tolerance for ETH output
            );
        } else {
            // USD/INR: Input ETH, Output USDC
            outputAmount = executeETHToUSDCSwap(
                transactionId,
                quote.user,
                uint256(quote.inputAmount), // ETH input amount
                uint256((quote.outputAmount * 95) / 100) // 5% slippage tolerance for USDC output
            );
        }

        emit QuoteSwapExecuted(quoteId, transactionId, quote.user, outputAmount);
    }

    function swapUSDCToETH(
        bytes32 transactionId,
        address user,
        uint256 usdcAmount,
        uint256 minimumETHOutput
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
            minimumETHOutput
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

    function updatePricingOracle(
        PricingOracle newPricingOracle
    ) external onlyOwner {
        pricingOracle = newPricingOracle;
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
        uint256 minimumUSDCOutput
    ) internal returns (uint256 usdcOutput) {
        consumeTicket(transactionId, user);

        if (address(this).balance < ethAmount) revert InsufficientETHBalance();

        // Store initial USDC balance to calculate output
        uint256 initialUSDCBalance = usdc.balanceOf(address(this));

        // Execute swap using Universal Router
        _executeV4Swap(
            poolKey,
            true, // zeroForOne (ETH -> USDC)
            uint128(ethAmount),
            uint128(minimumUSDCOutput)
        );

        // Calculate actual USDC output received
        uint256 finalUSDCBalance = usdc.balanceOf(address(this));
        usdcOutput = finalUSDCBalance - initialUSDCBalance;

        require(usdcOutput >= minimumUSDCOutput, "Insufficient output amount");

        // Transfer USDC to user
        usdc.safeTransfer(user, usdcOutput);

        emit ETHToUSDCSwapExecuted(transactionId, user, ethAmount, usdcOutput);
    }

    function executeUSDCToETHSwap(
        bytes32 transactionId,
        address user,
        uint256 usdcAmount,
        uint256 minimumETHOutput
    ) internal returns (uint256 ethOutput) {
        // consumeTicket(transactionId, user);

        if (usdc.balanceOf(address(this)) < usdcAmount)
            revert InsufficientUSDCBalance();

        // Store initial ETH balance to calculate output
        uint256 initialETHBalance = address(this).balance;

        // Approve USDC for Universal Router
        usdc.approve(address(universalRouter), 0);
        usdc.safeIncreaseAllowance(address(universalRouter), usdcAmount);

        // Execute swap using Universal Router
        _executeV4Swap(
            poolKey,
            false, // zeroForOne (USDC -> ETH)
            uint128(usdcAmount),
            uint128(minimumETHOutput)
        );

        // Calculate actual ETH output received
        uint256 finalETHBalance = address(this).balance;
        ethOutput = finalETHBalance - initialETHBalance;

        require(ethOutput >= minimumETHOutput, "Insufficient output amount");

        // Transfer ETH to user
        (bool success, ) = payable(user).call{value: ethOutput}("");
        require(success, "ETH transfer failed");

        emit USDCToETHSwapExecuted(transactionId, user, usdcAmount, ethOutput);
    }

    function _executeV4Swap(
        PoolKey memory key,
        bool zeroForOne,
        uint128 amountIn,
        uint128 minAmountOut
    ) internal {
        // Encode the Universal Router command
        bytes memory commands = abi.encodePacked(uint8(Commands.V4_SWAP));
        bytes[] memory inputs = new bytes[](1);

        // Encode V4Router actions
        bytes memory actions = abi.encodePacked(
            uint8(Actions.SWAP_EXACT_IN_SINGLE),
            uint8(Actions.SETTLE_ALL),
            uint8(Actions.TAKE_ALL)
        );

        // Prepare parameters for each action
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            ExactInputSingleParams({
                poolKey: key,
                zeroForOne: zeroForOne,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                hookData: bytes("")
            })
        );

        if (zeroForOne) {
            // ETH -> USDC swap
            params[1] = abi.encode(key.currency0, amountIn);
            params[2] = abi.encode(key.currency1, minAmountOut);
        } else {
            // USDC -> ETH swap
            params[1] = abi.encode(key.currency1, amountIn);
            params[2] = abi.encode(key.currency0, minAmountOut);
        }

        // Combine actions and params into inputs
        inputs[0] = abi.encode(actions, params);

        // Execute the swap with deadline
        uint256 deadline = block.timestamp + 300;
        universalRouter.execute{value: zeroForOne ? amountIn : 0}(
            commands,
            inputs,
            deadline
        );
    }

    function consumeTicket(bytes32 transactionId, address user) internal {
        if (ticketContract.ownerOfTxn(transactionId) != address(this)) {
            revert TicketNotOwnedByContract();
        }
        ticketContract.burn(transactionId);
        emit TicketConsumed(transactionId, user);
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
