pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TreasuryHook} from "../src/TreasuryHook.sol";
import {TicketNFT} from "../src/TicketNFT.sol";
import {PoolManagerWrapper} from "../src/PoolManagerWrapper.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TestTreasuryHookFlow is Script {
    // Base Mainnet addresses
    address constant POOL_MANAGER = 0x00B036B58a818B1BC34d502D3fE730Db729e62AC;
    address constant UNIVERSAL_ROUTER =
        0xf70536B3bcC1bD1a972dc186A2cf84cC6da6Be5D;
    address constant ETH = 0x0000000000000000000000000000000000000000;
    address constant USDC = 0x31d0220469e10c4E71834a79b1f276d740d3768F;

    uint24 constant POOL_FEE = 500;
    int24 constant TICK_SPACING = 10;

    // Test transaction parameters
    uint256 constant ETH_AMOUNT = 0.001 ether; // 0.001 ETH
    uint256 constant MIN_USDC_OUT = 3e6; // Minimum 3 USDC out
    uint256 constant DEADLINE_OFFSET = 3600; // 1 hour from now

    function run() external {
        address buyer = 0x000002fde2Da878DfA26fCb0748C0b9A25e8acEb;

        console2.log("=== Testing TreasuryHook Flow ===");
        console2.log("Buyer address:", buyer);
        console2.log("Buyer ETH balance:", buyer.balance);
        console2.log("Buyer USDC balance:", IERC20(USDC).balanceOf(buyer));
        console2.log("");

        // Try to get deployed contract addresses from environment
        address hookAddress = 0xB39f55223d711a3711212c41367BeD615e9700c0;
        address ticketNFTAddress = 0x5DC0d4b2b23fccc9C8be9Dd6555940F1abf14B46;
        address wrapperAddress = 0x40647d475Fd0321A31faA945700aE2386c8d3E38;

        vm.startBroadcast();

        TreasuryHook hook = TreasuryHook(payable(hookAddress));
        TicketNFT ticketNFT = TicketNFT(ticketNFTAddress);
        PoolManagerWrapper wrapper = PoolManagerWrapper(wrapperAddress);

        console2.log("=== Step 1: Generate Transaction ID ===");
        bytes32 transactionId = generateTransactionId(
            buyer,
            ETH_AMOUNT,
            block.timestamp
        );
        console2.log("Transaction ID:", vm.toString(transactionId));

        console2.log("");
        console2.log("=== Step 2: Mint Ticket (Relayer Action) ===");

        // Check if buyer is authorized as relayer
        if (!wrapper.isRelayer(buyer)) {
            console2.log(
                "Buyer is not authorized as relayer. This would normally be done by an authorized relayer."
            );
            console2.log(
                "For testing, you might need to authorize this address first."
            );

            // If buyer is owner, try to authorize themselves
            try wrapper.owner() returns (address owner) {
                if (owner == buyer) {
                    console2.log("Buyer is owner, authorizing as relayer...");
                    wrapper.setRelayer(buyer, true);
                    console2.log("Buyer authorized as relayer");
                }
            } catch {
                console2.log("Could not check ownership");
            }
        }

        // Mint ticket NFT to the hook (this represents off-chain verification)
        try ticketNFT.mint(transactionId, address(hook)) {
            console2.log("Ticket minted successfully");
        } catch Error(string memory reason) {
            console2.log("Ticket minting failed:", reason);
            vm.stopBroadcast();
            return;
        }

        console2.log("");
        console2.log("=== Step 3: Fund Treasury (if needed) ===");

        uint256 hookETHBalance = address(hook).balance;
        console2.log("Hook ETH balance:", hookETHBalance / 1e18, "ETH");

        if (hookETHBalance < ETH_AMOUNT) {
            console2.log("Hook needs more ETH, sending directly...");
            uint256 fundingAmount = ETH_AMOUNT * 2;
            (bool success, ) = address(hook).call{value: fundingAmount}("");
            if (success) {
                console2.log(
                    "Sent",
                    fundingAmount / 1e18,
                    "ETH directly to hook"
                );
            } else {
                console2.log("Failed to send ETH to hook");
            }
        }

        console2.log("");
        console2.log("=== Step 4: Execute Swap via Hook ===");

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(ETH),
            currency1: Currency.wrap(USDC),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });

        uint64 deadline = uint64(block.timestamp + DEADLINE_OFFSET);

        console2.log("Attempting swap:");
        console2.log("- ETH Amount In:", ETH_AMOUNT);
        console2.log("- Min USDC Out:", MIN_USDC_OUT / 1e6, "USDC");
        console2.log("- Deadline:", deadline);

        try
            wrapper.swapWithHook(
                poolKey,
                transactionId,
                buyer,
                deadline,
                MIN_USDC_OUT,
                ETH_AMOUNT,
                0, // mode
                true // zeroForOne (ETH -> USDC)
            )
        returns (bytes32 poolKeyHash) {
            console2.log("Swap executed successfully!");
            console2.log("Pool Key Hash:", vm.toString(poolKeyHash));
        } catch Error(string memory reason) {
            console2.log("Swap failed:", reason);
            vm.stopBroadcast();
            return;
        } catch (bytes memory lowLevelData) {
            console2.log("Swap failed with low-level error:");
            console2.logBytes(lowLevelData);
            vm.stopBroadcast();
            return;
        }

        console2.log("");
        console2.log("=== Step 5: Check ERC-6909 Claims ===");

        uint256 usdcTokenId = uint256(uint160(USDC));
        uint256 claimBalance = wrapper.getClaimBalance(buyer, USDC);

        console2.log("Buyer's USDC claim balance:", claimBalance / 1e6, "USDC");

        if (claimBalance > 0) {
            console2.log("");
            console2.log("=== Step 6: Claim Tokens ===");

            try hook.claimTokens(USDC, claimBalance) {
                console2.log("Tokens claimed successfully!");

                uint256 finalUSDCBalance = IERC20(USDC).balanceOf(buyer);
                console2.log(
                    "Final buyer USDC balance:",
                    finalUSDCBalance / 1e6,
                    "USDC"
                );
            } catch Error(string memory reason) {
                console2.log("Claim failed:", reason);

                console2.log("");
                console2.log("=== Alternative: Relayer Claims for User ===");
                try wrapper.claimUserTokens(buyer, USDC, claimBalance) {
                    console2.log(
                        "Relayer claimed tokens for user successfully!"
                    );

                    uint256 finalUSDCBalance = IERC20(USDC).balanceOf(buyer);
                    console2.log(
                        "Final buyer USDC balance:",
                        finalUSDCBalance / 1e6,
                        "USDC"
                    );
                } catch Error(string memory claimReason) {
                    console2.log("Relayer claim also failed:", claimReason);
                }
            }
        } else {
            console2.log(
                "No claims to redeem - something went wrong with the swap"
            );
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Flow Test Complete ===");
        console2.log("Final buyer ETH balance:", buyer.balance / 1e18, "ETH");
        console2.log(
            "Final buyer USDC balance:",
            IERC20(USDC).balanceOf(buyer) / 1e6,
            "USDC"
        );
    }

    function generateTransactionId(
        address user,
        uint256 amount,
        uint256 timestamp
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(user, amount, timestamp, "test-transaction")
            );
    }
}
