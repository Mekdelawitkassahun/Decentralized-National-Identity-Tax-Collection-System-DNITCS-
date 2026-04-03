const hre = require("hardhat");

async function main() {
  // Read current contract addresses from the frontend config.
  const fs = require("fs");
  const path = require("path");
  const configPath = path.join(__dirname, "../../dnit-frontend/src/config/contracts.ts");
  const configContent = fs.readFileSync(configPath, "utf8");

  const match = configContent.match(/hardhat:\s*\{[\s\S]*?nationalIdentity:\s*\"(0x[a-fA-F0-9]{40})\"/m);
  if (!match) {
    throw new Error("Could not find hardhat.nationalIdentity in contracts.ts");
  }
  const NATIONAL_IDENTITY = match[1];

  // Backend attester address (derived from ATTESTER_PRIVATE_KEY)
  const FAYDA_ATTESTER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  const [admin] = await hre.ethers.getSigners();
  console.log("Setup from admin signer:", admin.address);

  const NationalIdentity = await hre.ethers.getContractAt("NationalIdentity", NATIONAL_IDENTITY);

  const tx = await NationalIdentity.setFaydaAttester(FAYDA_ATTESTER);
  await tx.wait();

  console.log("faydaAttester set to:", await NationalIdentity.faydaAttester());
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

