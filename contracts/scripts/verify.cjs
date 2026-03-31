// scripts/verify.cjs 
const hre = require("hardhat");

async function main() { 
  // Replace with actual deployed address
  const nationalIdentityAddress = "0xbB7d162D2445e3e61d232a4f46b8a1Da6a2698E";

  console.log("Verifying NationalIdentity on Etherscan...");
  await hre.run("verify:verify", { 
    address: nationalIdentityAddress, 
    constructorArguments: [], 
  }); 
   
  console.log("Contracts verified on Etherscan!"); 
} 

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
