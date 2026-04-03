const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  // Role addresses (prototype constants). You can override via env vars.
  const ADMIN_WALLET = process.env.DNIT_ADMIN_WALLET || "0x2646C40E21f8ef7637e3cD7AB6e33730Fba3C1A5";
  const EMPLOYER_WALLET = process.env.DNIT_EMPLOYER_WALLET || "0x2d06fb81C36D325c26E90a485598aA5f2d05B3dB";
  const TAX_COLLECTOR_WALLET = process.env.DNIT_TAX_COLLECTOR_WALLET || "0x487C04EBF0c20F05009Adf9e7103644a66D1A3Ef";

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

  // Grant role permissions for portal access (deploy-time convenience).
  // Keeps deployer as admin (constructor) while adding your pilot wallets.
  const adminRole = await nationalIdentity.ADMIN_ROLE();
  const employerRole = await nationalIdentity.EMPLOYER_ROLE();
  const taxCollectorRole = await nationalIdentity.TAX_COLLECTOR_ROLE();

  await nationalIdentity.grantRole(adminRole, ADMIN_WALLET);
  await nationalIdentity.grantRole(employerRole, EMPLOYER_WALLET);
  await nationalIdentity.grantRole(taxCollectorRole, TAX_COLLECTOR_WALLET);

  const handlerTaxCollectorRole = await staticTaxHandler.TAX_COLLECTOR_ROLE();
  await staticTaxHandler.grantRole(handlerTaxCollectorRole, TAX_COLLECTOR_WALLET);

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
