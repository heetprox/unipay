// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "../src/Relayer.sol";
import "../src/TicketNFT.sol";

contract DebugAuthorization is Script {
    address public relayerAddress;
    address public ticketNFTAddress;
    
    function run() external {
        relayerAddress = vm.envAddress("SEPOLIA_UNICHAIN_RELAYER_CONTRACT");
        ticketNFTAddress = vm.envAddress("SEPOLIA_UNICHAIN_TICKET_NFT_CONTRACT");
        
        Relayer relayer = Relayer(payable(relayerAddress));
        TicketNFT ticketNFT = TicketNFT(ticketNFTAddress);
        
        console.log("=== Authorization Debug ===");
        console.log("Relayer address:", relayerAddress);
        console.log("TicketNFT address:", ticketNFTAddress);
        
        // Check TicketNFT minter
        address currentMinter = ticketNFT.minter();
        console.log("TicketNFT.minter():", currentMinter);
        console.log("Expected minter (Relayer):", relayerAddress);
        console.log("Minter matches Relayer:", currentMinter == relayerAddress);
        
        // Check TicketNFT hook
        address currentHook = ticketNFT.hook();
        console.log("TicketNFT.hook():", currentHook);
        console.log("Expected hook (Relayer):", relayerAddress);
        console.log("Hook matches Relayer:", currentHook == relayerAddress);
        
        // Check Relayer's ticket contract reference
        address relayerTicketContract = address(relayer.ticketContract());
        console.log("Relayer.ticketContract():", relayerTicketContract);
        console.log("Expected ticket contract:", ticketNFTAddress);
        console.log("Ticket contract matches:", relayerTicketContract == ticketNFTAddress);
        
        // Check deployer authorization in Relayer
        address deployer = vm.addr(vm.envUint("PRIVATE_KEY"));
        bool isAuthorized = relayer.authorizedRelayers(deployer);
        console.log("Deployer address:", deployer);
        console.log("Deployer authorized in Relayer:", isAuthorized);
        
        // Check contract ownership
        console.log("TicketNFT owner:", ticketNFT.owner());
        console.log("Relayer owner:", relayer.owner());
    }
}