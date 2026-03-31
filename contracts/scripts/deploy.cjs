const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  // 1. Deploy NationalIdentity
  const NationalIdentity = await hre.ethers.getContractFactory("NationalIdentity");
  const nationalIdentity = await NationalIdentity.deploy();
  await nationalIdentity.waitForDeployment();
  const nationalIdentityAddress = await nationalIdentity.getAddress();
  console.log("NationalIdentity deployed to:", nationalIdentityAddress);

  // 2. Deploy StaticTaxHandler
  const StaticTaxHandler = await hre.ethers.getContractFactory("StaticTaxHandler");
  const staticTaxHandler = await StaticTaxHandler.deploy(nationalIdentityAddress);
  await staticTaxHandler.waitForDeployment();
  const staticTaxHandlerAddress = await staticTaxHandler.getAddress();
  console.log("StaticTaxHandler deployed to:", staticTaxHandlerAddress);

  console.log("Deployment completed successfully!");
  
  // Update frontend contract addresses
  const network = hre.network.name === "sepolia" ? "sepolia" : "hardhat";
  const configPath = path.join(__dirname, "../../dnit-frontend/src/config/contracts.ts");
  
  if (fs.existsSync(configPath)) {
    let configContent = fs.readFileSync(configPath, "utf8");
    
    // Update the corresponding network section
    const pattern = new RegExp(`${network}: \\{[\\s\\S]*?nationalIdentity: ".*?",[\\s\\S]*?staticTaxHandler: ".*?"`, "m");
    const replacement = `${network}: {\n    nationalIdentity: "${nationalIdentityAddress}",\n    staticTaxHandler: "${staticTaxHandlerAddress}"`;
    
    configContent = configContent.replace(pattern, replacement);
    fs.writeFileSync(configPath, configContent);
    console.log(`Updated ${network} contract addresses in ${configPath}`);
  }
  
  // Copy ABIs to frontend public directory
  const publicAbisDir = path.join(__dirname, "../../dnit-frontend/public/abis");
  if (!fs.existsSync(publicAbisDir)) {
    fs.mkdirSync(publicAbisDir, { recursive: true });
  }

  const contractNames = ["NationalIdentity", "StaticTaxHandler"];
  contractNames.forEach(name => {
    const artifactPath = path.join(__dirname, `../artifacts/contracts/${name}.sol/${name}.json`);
    if (fs.existsSync(artifactPath)) {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      fs.writeFileSync(path.join(publicAbisDir, `${name}.json`), JSON.stringify(artifact, null, 2));
      console.log(`Copied ${name} ABI to ${publicAbisDir}`);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
