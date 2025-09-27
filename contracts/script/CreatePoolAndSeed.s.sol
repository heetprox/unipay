pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SqrtPriceMath} from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

contract CreatePoolAndSeed is Script, StdCheats {
    using PoolIdLibrary for PoolKey;

    address constant POOL_MANAGER = 0x00B036B58a818B1BC34d502D3fE730Db729e62AC;
    address constant POSITION_MANAGER =
        0xf969Aee60879C54bAAed9F3eD26147Db216Fd664;
    address constant ETH = 0x0000000000000000000000000000000000000000;
    address constant USDC = 0x31d0220469e10c4E71834a79b1f276d740d3768F;

    uint24 constant POOL_FEE = 500;
    int24 constant TICK_SPACING = 10;

    uint256 constant SEED_ETH = 0.0005 ether;
    uint256 constant SEED_USDC = 20;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployerEOA = 0x000002fde2Da878DfA26fCb0748C0b9A25e8acEb;

        address hookAddress = 0xB39f55223d711a3711212c41367BeD615e9700c0;

        console2.log("Initializing pool on Base mainnet fork...");
        console2.log("Deployer:", deployerEOA);
        console2.log("Hook:", hookAddress);
        console2.log("PoolManager:", POOL_MANAGER);
        console2.log("");

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(ETH),
            currency1: Currency.wrap(USDC),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(hookAddress)
        });

        bytes32 poolKeyHash = keccak256(abi.encode(poolKey));
        PoolId poolId = poolKey.toId();

        console2.log("Pool Key Hash:", vm.toString(poolKeyHash));
        console2.log("Pool ID:", vm.toString(PoolId.unwrap(poolId)));

        uint160 sqrtPriceX96 = 5032985394563870399568240952979;

        console2.log("Target price: 1 ETH = 4034 USDC (current market)");
        console2.log("sqrtPriceX96:", sqrtPriceX96);

        console2.log("1. Checking deployer balances...");

        uint256 deployerETH = deployerEOA.balance;
        uint256 deployerUSDC = IERC20(USDC).balanceOf(deployerEOA);

        console2.log("Deployer ETH balance (wei):", deployerETH);
        console2.log("Deployer ETH balance (ETH):", deployerETH / 1e18);
        console2.log("Deployer USDC balance:", deployerUSDC / 1e6, "USDC");

        require(deployerUSDC >= SEED_USDC, "Insufficient USDC for liquidity");

        vm.startBroadcast(deployerPrivateKey);

        console2.log("2. Initializing pool...");

        IPoolManager poolManager = IPoolManager(POOL_MANAGER);

        try poolManager.initialize(poolKey, sqrtPriceX96) {
            console2.log("Pool initialized successfully");
        } catch Error(string memory reason) {
            console2.log(
                "Pool initialization failed or already exists:",
                reason
            );
        } catch {
            console2.log("Pool initialization failed with unknown error");
        }

        console2.log("3. Adding initial liquidity via PositionManager...");
        console2.log("   Amount: 0.1 ETH + proportional USDC");

        IPositionManager positionManager = IPositionManager(POSITION_MANAGER);
        console2.log("   Using PositionManager at:", address(positionManager));

        int24 currentTick = 82760;
        int24 tickLower = ((currentTick - 2000) / TICK_SPACING) * TICK_SPACING;
        int24 tickUpper = ((currentTick + 2000) / TICK_SPACING) * TICK_SPACING;

        console2.log(
            "   Tick range:",
            vm.toString(tickLower),
            "to",
            vm.toString(tickUpper)
        );

        uint256 currentUSDCBalance = IERC20(USDC).balanceOf(deployerEOA);
        console2.log(
            "   Deployer USDC balance:",
            currentUSDCBalance / 1e6,
            "USDC"
        );
        console2.log(
            "   Deployer ETH balance:",
            deployerEOA.balance / 1e18,
            "ETH"
        );

        uint256 nextTokenId = positionManager.nextTokenId();
        console2.log("   Next token ID:", nextTokenId);

        uint256 amount0Max = (deployerETH * 9) / 10;
        uint256 amount1Max = (deployerUSDC * 9) / 10;

        console2.log("   Will use ETH:", amount0Max);
        console2.log("   Will use USDC:", amount1Max / 1e6, "USDC");

        address permit2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

        IERC20(USDC).approve(permit2, type(uint256).max);
        console2.log("   Approved Permit2 for USDC");

        uint48 expiration = uint48(block.timestamp + 3600);
        IAllowanceTransfer(permit2).approve(
            USDC,
            address(positionManager),
            uint160(amount1Max),
            expiration
        );
        console2.log(
            "   Used Permit2 to approve PositionManager for",
            amount1Max / 1e6,
            "USDC"
        );

        uint160 sqrtPriceLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtPriceUpper = TickMath.getSqrtPriceAtTick(tickUpper);
        uint160 sqrtPriceCurrent = sqrtPriceX96;

        uint128 liquidity = 1000;

        console2.log("   Target liquidity:", liquidity);
        console2.log("   sqrtPriceLower:", sqrtPriceLower);
        console2.log("   sqrtPriceUpper:", sqrtPriceUpper);
        console2.log("   sqrtPriceCurrent:", sqrtPriceCurrent);

        bytes memory actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION),
            uint8(Actions.SETTLE_PAIR)
        );

        bytes[] memory params = new bytes[](2);

        params[0] = abi.encode(
            poolKey,
            tickLower,
            tickUpper,
            liquidity,
            uint128(amount0Max),
            uint128(amount1Max),
            deployerEOA,
            ""
        );

        params[1] = abi.encode(poolKey.currency0, poolKey.currency1);

        console2.log("   Ready to execute with proper Permit2 setup");

        uint256 valueToPass = amount0Max;
        uint256 deadline = block.timestamp + 3600;

        console2.log("   Calling modifyLiquidities with value:", valueToPass);

        try
            positionManager.modifyLiquidities{value: valueToPass}(
                abi.encode(actions, params),
                deadline
            )
        {
            console2.log("   SUCCESS: Position minted via PositionManager!");
            console2.log("   Token ID minted:", nextTokenId);

            uint256 finalETHBalance = deployerEOA.balance;
            uint256 finalUSDCBalance = IERC20(USDC).balanceOf(deployerEOA);

            console2.log("   Final ETH balance:", finalETHBalance, "wei");
            console2.log(
                "   Final USDC balance:",
                finalUSDCBalance / 1e6,
                "USDC"
            );
            console2.log(
                "   ETH used:",
                (deployerETH - finalETHBalance) / 1e18,
                "ETH"
            );
            console2.log(
                "   USDC used:",
                (currentUSDCBalance - finalUSDCBalance) / 1e6,
                "USDC"
            );
        } catch Error(string memory reason) {
            console2.log("   PositionManager MINT_POSITION failed:", reason);
        } catch (bytes memory lowLevelData) {
            console2.log(
                "   PositionManager MINT_POSITION failed with low-level error:"
            );
            console2.logBytes(lowLevelData);
        }

        console2.log("4. Verifying position creation...");
        uint256 currentTokenId = positionManager.nextTokenId();
        if (currentTokenId > nextTokenId) {
            console2.log("   SUCCESS: Position", nextTokenId, "was created!");
            console2.log("   Next available token ID is now:", currentTokenId);
        } else {
            console2.log(
                "   Position was not created - nextTokenId unchanged:",
                currentTokenId
            );
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== POOL SETUP COMPLETE ===");
        console2.log("Pool Key Hash:     ", vm.toString(poolKeyHash));
        console2.log("Pool ID:           ", vm.toString(PoolId.unwrap(poolId)));
        console2.log("Initial Price:     1 ETH = 4034 USDC");
        console2.log("sqrtPriceX96:      ", sqrtPriceX96);
        console2.log("Fee:               0.05% (500)");
        console2.log("Tick Spacing:      10");
        console2.log("Hook:              ", hookAddress);
        console2.log("Position Token ID: ", nextTokenId, "(if minted)");
        console2.log("");

        console2.log("POOL_JSON_START");
        console2.log("{");
        console2.log('  "poolKey": {');
        console2.log(
            '    "currency0": "',
            Currency.unwrap(poolKey.currency0),
            '",'
        );
        console2.log(
            '    "currency1": "',
            Currency.unwrap(poolKey.currency1),
            '",'
        );
        console2.log('    "fee": ', poolKey.fee, ",");
        console2.log(
            '    "tickSpacing": ',
            vm.toString(int256(poolKey.tickSpacing)),
            ","
        );
        console2.log('    "hooks": "', address(poolKey.hooks), '"');
        console2.log("  },");
        console2.log('  "poolKeyHash": "', vm.toString(poolKeyHash), '",');
        console2.log('  "poolId": "', vm.toString(PoolId.unwrap(poolId)), '",');
        console2.log('  "sqrtPriceX96": "', sqrtPriceX96, '",');
        console2.log('  "nextTokenId": ', nextTokenId, ",");
        console2.log('  "tickLower": ', vm.toString(tickLower), ",");
        console2.log('  "tickUpper": ', vm.toString(tickUpper), ",");
        console2.log('  "liquidity": "', liquidity, '"');
        console2.log("}");
        console2.log("POOL_JSON_END");
    }
}
