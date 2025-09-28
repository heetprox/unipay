// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {PricingOracle} from "../src/PricingOracle.sol";

contract DeployPricingOracle is Script {
    function setUp() public {}

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying PricingOracle with deployer:", deployer);
        console.log("Deployer balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        // Pyth contract addresses for different networks
        // Sepolia Unichain: 0x2880aB155794e7179c9eE2e38200202908C17B43

        // For local testing, you might use a different address
        address pythContract = vm.envOr(
            "PYTH_CONTRACT",
            address(0x2880aB155794e7179c9eE2e38200202908C17B43)
        );

        console.log("Using Pyth contract address:", pythContract);

        PricingOracle pricingOracle = new PricingOracle(pythContract, deployer);

        console.log("PricingOracle deployed at:", address(pricingOracle));
        console.log("Owner:", pricingOracle.owner());

        // Verify the contract is properly initialized
        console.log(
            "ETH/USD Price Feed ID:",
            vm.toString(pricingOracle.ETH_USD_FEED())
        );
        console.log(
            "USD/INR Price Feed ID:",
            vm.toString(pricingOracle.USD_INR_FEED())
        );
        console.log("Max Price Age:", pricingOracle.MAX_PRICE_AGE());
        console.log(
            "Quote Lock Duration:",
            pricingOracle.QUOTE_LOCK_DURATION()
        );

        vm.stopBroadcast();
    }
}
