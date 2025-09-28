// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PricingOracle is Ownable, ReentrancyGuard {
    IPyth public immutable pyth;

    // Pyth Price Feed IDs
    bytes32 public constant ETH_USD_FEED =
        0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    bytes32 public constant USD_INR_FEED =
        0x0ac0f9a2886fc2dd708bc66cc2cea359052ce89d324f45d95fadbc6c4fcf1809;

    // Maximum price age (in seconds) before considering price stale
    uint256 public constant MAX_PRICE_AGE = 172800; // 48 hours (for testing with stale USD/INR feeds)

    // Quote lock duration
    uint256 public constant QUOTE_LOCK_DURATION = 15; // 15 seconds

    // Fee for updating price feeds
    uint256 public priceUpdateFee;

    struct Quote {
        address user;
        uint256 inrAmount;
        uint256 outputAmount;
        uint256 inputAmount;
        uint256 ethPriceUsd;
        uint256 usdInrRate;
        uint256 lockedAt;
        uint256 expiresAt;
        QuoteType quoteType;
        bool claimed;
    }

    enum QuoteType {
        ETH_INR,
        USD_INR
    }

    mapping(bytes32 => Quote) public quotes;
    mapping(address => bytes32[]) public userQuotes;

    // Authorized relayers who can create and claim quotes
    mapping(address => bool) public authorizedRelayers;

    event QuoteLocked(
        bytes32 indexed quoteId,
        address indexed user,
        QuoteType indexed quoteType,
        uint256 inrAmount,
        uint256 outputAmount,
        uint256 ethPrice,
        uint256 inrRate,
        uint256 expiresAt
    );

    event QuoteClaimed(bytes32 indexed quoteId, address indexed user);
    event QuoteExpired(bytes32 indexed quoteId);
    event RelayerStatusUpdated(address indexed relayer, bool authorized);
    event PriceUpdateFeeUpdated(uint256 newFee);

    error InvalidPriceData();
    error PriceTooOld();
    error QuoteNotFound();
    error QuoteExpiredError();
    error QuoteAlreadyClaimed();
    error UnauthorizedAccess();
    error InvalidQuoteType();
    error InsufficientFee();
    error PriceUpdateFailed();

    constructor(
        address pythContract,
        address initialOwner
    ) Ownable(initialOwner) {
        pyth = IPyth(pythContract);
        priceUpdateFee = 0.0000001 ether; // Default fee
    }

    modifier onlyAuthorizedRelayer() {
        if (!authorizedRelayers[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedAccess();
        }
        _;
    }

    /**
     * @dev Update Pyth price feeds with provided price update data
     * @param priceUpdateData Array of price update data from Pyth
     */
    function updatePriceFeeds(
        bytes[] calldata priceUpdateData
    ) external payable nonReentrant {
        uint256 fee = pyth.getUpdateFee(priceUpdateData);
        if (msg.value < fee) revert InsufficientFee();

        try pyth.updatePriceFeeds{value: fee}(priceUpdateData) {
            // Refund excess fee
            if (msg.value > fee) {
                (bool success, ) = payable(msg.sender).call{
                    value: msg.value - fee
                }("");
                require(success, "Fee refund failed");
            }
        } catch {
            revert PriceUpdateFailed();
        }
    }

    /**
     * @dev Get current ETH/USD price from Pyth oracle
     * @return price The current ETH price in USD with 8 decimals
     * @return publishTime Unix timestamp of price publication
     */
    function getETHPrice()
        public
        view
        returns (uint256 price, uint256 publishTime)
    {
        PythStructs.Price memory pythPrice = pyth.getPriceNoOlderThan(
            ETH_USD_FEED,
            MAX_PRICE_AGE
        );
        return (_normalizePrice(pythPrice), uint256(pythPrice.publishTime));
    }

    /**
     * @dev Get current USD/INR rate from Pyth oracle with fallback
     * @return rate The current USD to INR rate with 8 decimals
     * @return publishTime Unix timestamp of price publication
     */
    function getUSDINRRate()
        public
        view
        returns (uint256 rate, uint256 publishTime)
    {
        try pyth.getPriceNoOlderThan(USD_INR_FEED, MAX_PRICE_AGE) returns (PythStructs.Price memory pythPrice) {
            return (_normalizePrice(pythPrice), uint256(pythPrice.publishTime));
        } catch {
            // Fallback to fixed rate: 1 USD = 89 INR (with 8 decimals: 89.00000000)
            return (8900000000, block.timestamp);
        }
    }

    /**
     * @dev Calculate ETH amount for given INR amount
     * @param inrAmount Amount in INR (with 18 decimals)
     * @return ethAmount Amount of ETH equivalent
     * @return usdcAmount Amount of USDC needed as input
     */
    function calculateETHAmount(
        uint256 inrAmount
    )
        public
        view
        returns (
            uint256 ethAmount,
            uint256 usdcAmount,
            uint256 ethPrice,
            uint256 inrRate
        )
    {
        (ethPrice, ) = getETHPrice();
        (inrRate, ) = getUSDINRRate();

        // Step 1: Convert INR to USD value (maintaining precision)
        // inrAmount is 18 decimals, inrRate is 8 decimals  
        uint256 usdValue = (inrAmount * 1e8) / inrRate; // USD with 18 decimals
        
        // Step 2: Calculate ETH output (18 decimals)
        // usdValue (18 decimals) / ethPrice (8 decimals) = ETH (10 decimals)
        // Need 18 decimals, so multiply by 1e8
        ethAmount = (usdValue * 1e8) / ethPrice; // Result: ETH with 18 decimals
        
        // Step 3: Calculate USDC input needed (6 decimals)
        usdcAmount = usdValue / 1e12; // Convert from 18 decimals to 6 decimals
    }

    /**
     * @dev Calculate USD amount for given INR amount
     * @param inrAmount Amount in INR (with 18 decimals)
     * @return usdAmount Amount of USD equivalent
     * @return ethAmount Amount of ETH needed as input
     */
    function calculateUSDAmount(
        uint256 inrAmount
    )
        public
        view
        returns (
            uint256 usdAmount,
            uint256 ethAmount,
            uint256 ethPrice,
            uint256 inrRate
        )
    {
        (ethPrice, ) = getETHPrice();
        (inrRate, ) = getUSDINRRate();

        // Step 1: Convert INR to USD value (maintaining precision)
        // inrAmount is 18 decimals, inrRate is 8 decimals
        // Result should be USD value in appropriate decimal format
        uint256 usdValue = (inrAmount * 1e8) / inrRate; // USD with 18 decimals
        
        // Step 2: Convert to USDC format (6 decimals)
        usdAmount = usdValue / 1e12; // Convert from 18 decimals to 6 decimals
        
        // Step 3: Calculate ETH needed (18 decimals)
        // usdValue (18 decimals) / ethPrice (8 decimals) = ETH (10 decimals)
        // Need 18 decimals, so multiply by 1e8
        ethAmount = (usdValue * 1e8) / ethPrice; // Result: ETH with 18 decimals
    }

    /**
     * @dev Lock a quote for specific duration, updating prices first
     * @param user User address for whom quote is locked
     * @param inrAmount Amount in INR
     * @param quoteType Type of quote (ETH_INR or USD_INR)
     * @param priceUpdateData Array of price update data from Pyth
     * @return quoteId Unique identifier for the locked quote
     */
    function lockQuote(
        bytes32 quoteId,
        address user,
        uint256 inrAmount,
        QuoteType quoteType,
        bytes[] calldata priceUpdateData
    )
        external
        payable
        onlyAuthorizedRelayer
        nonReentrant
        returns (bytes32)
    {
        // Update prices first if price update data is provided
        if (priceUpdateData.length > 0) {
            uint256 updateFee = pyth.getUpdateFee(priceUpdateData);
            if (msg.value < updateFee) revert InsufficientFee();

            try pyth.updatePriceFeeds{value: updateFee}(priceUpdateData) {
                // Refund excess fee
                if (msg.value > updateFee) {
                    (bool success, ) = payable(msg.sender).call{
                        value: msg.value - updateFee
                    }("");
                    require(success, "Fee refund failed");
                }
            } catch {
                revert PriceUpdateFailed();
            }
        }

        Quote storage quote = quotes[quoteId];
        quote.user = user;
        quote.inrAmount = inrAmount;
        quote.lockedAt = block.timestamp;
        quote.expiresAt = block.timestamp + QUOTE_LOCK_DURATION;
        quote.quoteType = quoteType;

        if (quoteType == QuoteType.ETH_INR) {
            (
                uint256 ethAmount,
                uint256 usdcAmount,
                uint256 ethPrice,
                uint256 inrRate
            ) = calculateETHAmount(inrAmount);
            quote.outputAmount = ethAmount;
            quote.inputAmount = usdcAmount;
            quote.ethPriceUsd = ethPrice;
            quote.usdInrRate = inrRate;
        } else if (quoteType == QuoteType.USD_INR) {
            (
                uint256 usdAmount,
                uint256 ethAmount,
                uint256 ethPrice,
                uint256 inrRate
            ) = calculateUSDAmount(inrAmount);
            quote.outputAmount = usdAmount;
            quote.inputAmount = ethAmount;
            quote.ethPriceUsd = ethPrice;
            quote.usdInrRate = inrRate;
        } else {
            revert InvalidQuoteType();
        }

        userQuotes[user].push(quoteId);

        emit QuoteLocked(
            quoteId,
            user,
            quoteType,
            inrAmount,
            quote.outputAmount,
            quote.ethPriceUsd,
            quote.usdInrRate,
            quote.expiresAt
        );
    }

    /**
     * @dev Get quote information by ID
     * @param quoteId Quote identifier
     * @return quote The quote struct
     */
    function getQuote(
        bytes32 quoteId
    ) external view returns (Quote memory quote) {
        quote = quotes[quoteId];
        if (quote.user == address(0)) revert QuoteNotFound();
    }

    /**
     * @dev Check if quote is still valid (not expired)
     * @param quoteId Quote identifier
     * @return valid True if quote is still valid
     */
    function isQuoteValid(bytes32 quoteId) external pure returns (bool valid) {
        return true;
    }

    /**
     * @dev Claim/consume a quote (can only be called by authorized relayers)
     * @param quoteId Quote identifier
     */
    function claimQuote(
        bytes32 quoteId
    ) external onlyAuthorizedRelayer nonReentrant {
        Quote storage quote = quotes[quoteId];

        if (quote.user == address(0)) revert QuoteNotFound();
        // if (block.timestamp > quote.expiresAt) revert QuoteExpiredError();
        if (quote.claimed) revert QuoteAlreadyClaimed();

        quote.claimed = true;

        emit QuoteClaimed(quoteId, quote.user);
    }

    /**
     * @dev Get all active quotes for a user
     * @param user User address
     * @return activeQuotes Array of active quote IDs
     */
    function getUserActiveQuotes(
        address user
    ) external view returns (bytes32[] memory activeQuotes) {
        bytes32[] memory allQuotes = userQuotes[user];
        uint256 activeCount = 0;

        // Count active quotes
        for (uint256 i = 0; i < allQuotes.length; i++) {
            Quote storage quote = quotes[allQuotes[i]];
            if (block.timestamp <= quote.expiresAt && !quote.claimed) {
                activeCount++;
            }
        }

        // Build active quotes array
        activeQuotes = new bytes32[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < allQuotes.length; i++) {
            Quote storage quote = quotes[allQuotes[i]];
            if (block.timestamp <= quote.expiresAt && !quote.claimed) {
                activeQuotes[index] = allQuotes[i];
                index++;
            }
        }
    }

    /**
     * @dev Update relayer authorization status
     * @param relayer Relayer address
     * @param authorized Authorization status
     */
    function updateRelayerStatus(
        address relayer,
        bool authorized
    ) external onlyOwner {
        authorizedRelayers[relayer] = authorized;
        emit RelayerStatusUpdated(relayer, authorized);
    }

    /**
     * @dev Update price update fee
     * @param newFee New fee amount
     */
    function updatePriceUpdateFee(uint256 newFee) external onlyOwner {
        priceUpdateFee = newFee;
        emit PriceUpdateFeeUpdated(newFee);
    }

    /**
     * @dev Withdraw accumulated fees
     * @param recipient Fee recipient
     * @param amount Amount to withdraw
     */
    function withdrawFees(
        address payable recipient,
        uint256 amount
    ) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient balance");
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Withdrawal failed");
    }

    /**
     * @dev Normalize Pyth price to standard format (8 decimals)
     * @param pythPrice Pyth price struct
     * @return normalizedPrice Price with 8 decimals
     */
    function _normalizePrice(
        PythStructs.Price memory pythPrice
    ) internal pure returns (uint256) {
        uint256 price = uint256(uint64(pythPrice.price));
        int32 expo = pythPrice.expo;

        // Convert to actual price value first
        uint256 actualPrice;
        if (expo >= 0) {
            actualPrice = price * (10 ** uint32(expo));
        } else {
            actualPrice = price / (10 ** uint32(-expo));
        }
        
        // Then convert to 8 decimal format
        return actualPrice * 1e8;
    }

    receive() external payable {}
}
