// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {TicketNFT} from "../../src/TicketNFT.sol";

contract ForkUtils {
    Vm private constant vm =
        Vm(address(bytes20(uint160(uint256(keccak256("hevm cheat code"))))));

    // Base mainnet addresses
    address constant USDC_WHALE_1 = 0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A; // Coinbase
    address constant USDC_WHALE_2 = 0x20FE51A9229EEf2cF8Ad9E89d91CAb9312cF3b7A; // Another whale
    address constant ETH_WHALE = 0x4200000000000000000000000000000000000006; // WETH on Base

    // Token addresses
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant ETH = 0x0000000000000000000000000000000000000000;

    /**
     * @dev Fund an address with USDC by impersonating a whale
     */
    function fundWithUSDC(address recipient, uint256 amount) public {
        // Try first whale
        if (IERC20(USDC).balanceOf(USDC_WHALE_1) >= amount) {
            vm.startPrank(USDC_WHALE_1);
            IERC20(USDC).transfer(recipient, amount);
            vm.stopPrank();
            return;
        }

        // Try second whale
        if (IERC20(USDC).balanceOf(USDC_WHALE_2) >= amount) {
            vm.startPrank(USDC_WHALE_2);
            IERC20(USDC).transfer(recipient, amount);
            vm.stopPrank();
            return;
        }

        revert("No whale has enough USDC");
    }

    /**
     * @dev Fund an address with ETH using vm.deal
     */
    function fundWithETH(address recipient, uint256 amount) public {
        vm.deal(recipient, amount);
    }

    /**
     * @dev Check USDC balance of an address
     */
    function getUSDCBalance(address account) public view returns (uint256) {
        return IERC20(USDC).balanceOf(account);
    }

    /**
     * @dev Check ETH balance of an address
     */
    function getETHBalance(address account) public view returns (uint256) {
        return account.balance;
    }

    /**
     * @dev Helper to mint a ticket NFT to a specific recipient
     */
    function mintTicket(
        TicketNFT nft,
        address minter,
        bytes32 txnId,
        address to
    ) public {
        vm.prank(minter);
        nft.mint(txnId, to);
    }

    /**
     * @dev Calculate sqrtPriceX96 for a given ETH/USDC price
     * @param ethPriceInUSDC Price of 1 ETH in USDC (e.g., 3000 for $3000/ETH)
     */
    function getSqrtPriceX96ForETHUSDC(
        uint256 ethPriceInUSDC
    ) public pure returns (uint160) {
        // For ETH/USDC pool where ETH is currency0 and USDC is currency1
        // price = (USDC amount with decimals) / (ETH amount with decimals)
        // For 1 ETH = 3000 USDC: price = 3000e6 / 1e18 = 3000 / 1e12

        // Simplified calculation for common prices
        if (ethPriceInUSDC == 3000) {
            return 4340067320442655524698263349; // Pre-calculated
        } else if (ethPriceInUSDC == 2000) {
            return 3543191142285914205922034323; // sqrt(2000) * 2^96
        } else if (ethPriceInUSDC == 4000) {
            return 5012562893380045063230175199; // sqrt(4000) * 2^96
        }

        // Generic calculation (less precise)
        uint256 priceRatio = (ethPriceInUSDC * 1e6) / 1e18; // Adjust for decimals
        uint256 sqrtPrice = sqrt(priceRatio);
        return uint160(sqrtPrice * (2 ** 96));
    }

    /**
     * @dev Simple square root implementation
     */
    function sqrt(uint256 x) public pure returns (uint256) {
        if (x == 0) return 0;

        uint256 z = (x + 1) / 2;
        uint256 y = x;

        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }

        return y;
    }

    /**
     * @dev Hash a pool key (matches our contract implementations)
     */
    function hashPoolKey(PoolKey memory poolKey) public pure returns (bytes32) {
        return keccak256(abi.encode(poolKey));
    }

    /**
     * @dev Generate a unique transaction ID for testing
     */
    function generateTxnId(uint256 seed) public view returns (bytes32) {
        return keccak256(abi.encodePacked("test_txn_", seed, block.timestamp));
    }

    /**
     * @dev Log account balances for debugging
     */
    function logBalances(address account, string memory label) public view {
        console2.log("=== Balances for", label, "===");
        console2.log("Address:", account);
        console2.log("ETH:", account.balance / 1e18, "ETH");
        console2.log("USDC:", IERC20(USDC).balanceOf(account) / 1e6, "USDC");
    }

    /**
     * @dev Create a snapshot for test isolation
     */
    function createSnapshot() public returns (uint256) {
        return vm.snapshot();
    }

    /**
     * @dev Revert to a snapshot
     */
    function revertToSnapshot(uint256 snapshotId) public {
        vm.revertTo(snapshotId);
    }

    /**
     * @dev Skip time forward (useful for deadline testing)
     */
    function skipTime(uint256 seconds_) public {
        vm.warp(block.timestamp + seconds_);
    }

    /**
     * @dev Set block timestamp to specific value
     */
    function setTimestamp(uint256 timestamp) public {
        vm.warp(timestamp);
    }

    /**
     * @dev Get current gas price on Base (for gas estimation)
     */
    function getGasPrice() public view returns (uint256) {
        return tx.gasprice;
    }

    /**
     * @dev Estimate ETH cost for a transaction at current gas prices
     */
    function estimateETHCost(uint256 gasUsed) public view returns (uint256) {
        return gasUsed * getGasPrice();
    }
}

/**
 * @dev Abstract test contract with common setup for fork tests
 */
abstract contract BaseForkSetup is Test {
    // using ForkUtils for *; // Not needed since it's a contract now

    // Snapshots for test isolation
    uint256 public initialSnapshot;

    modifier useSnapshot() {
        uint256 snapshot = vm.snapshot();
        _;
        vm.revertTo(snapshot);
    }

    function setUpFork() public {
        // Ensure we're on Base fork
        require(block.chainid == 8453, "Not on Base fork");

        // Create initial snapshot
        initialSnapshot = vm.snapshot();

        console2.log("Fork setup complete");
        console2.log("Block number:", block.number);
        console2.log("Chain ID:", block.chainid);
        console2.log("Block timestamp:", block.timestamp);
    }

    function resetToInitial() public {
        vm.revertTo(initialSnapshot);
    }
}
