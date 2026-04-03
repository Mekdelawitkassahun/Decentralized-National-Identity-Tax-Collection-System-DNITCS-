const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=========================================");
  console.log("DEPLOYING TO SEPOLIA TESTNET");
  console.log("=========================================");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const ADMIN_ADDRESS = process.env.DNIT_ADMIN_WALLET || "0x2646C40E21f8ef7637e3cD7AB6e33730Fba3C1A5";
  const EMPLOYER_ADDRESS = process.env.DNIT_EMPLOYER_WALLET || "0x2d06fb81C36D325c26E90a485598aA5f2d05B3dB";
  const TAX_COLLECTOR_ADDRESS =
    process.env.DNIT_TAX_COLLECTOR_WALLET || "0x487C04EBF0c20F05009Adf9e7103644a66D1A3Ef";

  // Optional: set the Fayda attester signer used to validate backend OTP attestations.
  // If you run a real Fayda integration backend, point this to the same private key your backend signs with.
  const ATTESTER_PRIVATE_KEY = process.env.ATTESTER_PRIVATE_KEY;

  // 1) Deploy NationalIdentity
  console.log("\n📄 Deploying NationalIdentity...");
  const NationalIdentity = await hre.ethers.getContractFactory("NationalIdentity");
  const nationalIdentity = await NationalIdentity.deploy();
  await nationalIdentity.waitForDeployment();
  const nationalIdentityAddress = await nationalIdentity.getAddress();
  console.log("✅ NationalIdentity deployed to:", nationalIdentityAddress);

  // 2) Deploy StaticTaxHandler
  console.log("\n📄 Deploying StaticTaxHandler...");
  const StaticTaxHandler = await hre.ethers.getContractFactory("StaticTaxHandler");
  const staticTaxHandler = await StaticTaxHandler.deploy(nationalIdentityAddress);
  await staticTaxHandler.waitForDeployment();
  const staticTaxHandlerAddress = await staticTaxHandler.getAddress();
  console.log("✅ StaticTaxHandler deployed to:", staticTaxHandlerAddress);

  // 3) Grant roles
  console.log("\n🔐 Granting roles...");
  const ADMIN_ROLE = await nationalIdentity.ADMIN_ROLE();
  const EMPLOYER_ROLE = await nationalIdentity.EMPLOYER_ROLE();
  const TAX_COLLECTOR_ROLE = await nationalIdentity.TAX_COLLECTOR_ROLE();

  await nationalIdentity.grantRole(ADMIN_ROLE, ADMIN_ADDRESS);
  await nationalIdentity.grantRole(EMPLOYER_ROLE, EMPLOYER_ADDRESS);
  await nationalIdentity.grantRole(TAX_COLLECTOR_ROLE, TAX_COLLECTOR_ADDRESS);

  const handlerTaxCollectorRole = await staticTaxHandler.TAX_COLLECTOR_ROLE();
  await staticTaxHandler.grantRole(handlerTaxCollectorRole, TAX_COLLECTOR_ADDRESS);

  console.log(`✅ ADMIN_ROLE -> ${ADMIN_ADDRESS}`);
  console.log(`✅ EMPLOYER_ROLE -> ${EMPLOYER_ADDRESS}`);
  console.log(`✅ TAX_COLLECTOR_ROLE -> ${TAX_COLLECTOR_ADDRESS}`);

  // 4) Configure Fayda attester (if provided)
  if (ATTESTER_PRIVATE_KEY) {
    const attesterAddress = new hre.ethers.Wallet(ATTESTER_PRIVATE_KEY).address;
    console.log("\n🧾 Setting faydaAttester to:", attesterAddress);
    const tx = await nationalIdentity.setFaydaAttester(attesterAddress);
    await tx.wait();
  } else {
    console.log("\n⚠️  ATTESTER_PRIVATE_KEY not provided: faydaAttester will remain unset.");
    console.log("    Citizens will not be able to registerAndAutoApprove until you set it.");
  }

  // 5) Update frontend contract addresses + copy ABIs
  const configPath = path.join(__dirname, "../../dnit-frontend/src/config/contracts.ts");
  let configContent = fs.readFileSync(configPath, "utf8");

  const pattern = new RegExp(`sepolia:\\s*\\{[\\s\\S]*?nationalIdentity:\\s*\".*?\",[\\s\\S]*?staticTaxHandler:\\s*\".*?\"`, "m");
  const replacement = `sepolia: {\n    nationalIdentity: "${nationalIdentityAddress}",\n    staticTaxHandler: "${staticTaxHandlerAddress}"\n  }`;
  if (pattern.test(configContent)) {
    configContent = configContent.replace(pattern, replacement);
  } else {
    throw new Error("Could not update sepolia section in dnit-frontend/src/config/contracts.ts");
  }
  fs.writeFileSync(configPath, configContent);
  console.log("\n✅ Updated frontend contracts.ts (sepolia)");

  const publicAbisDir = path.join(__dirname, "../../dnit-frontend/public/abis");
  if (!fs.existsSync(publicAbisDir)) fs.mkdirSync(publicAbisDir, { recursive: true });

  const contractNames = ["NationalIdentity", "StaticTaxHandler"];
  for (const name of contractNames) {
    const artifactPath = path.join(__dirname, `../artifacts/contracts/${name}.sol/${name}.json`);
    if (!fs.existsSync(artifactPath)) continue;
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    fs.writeFileSync(path.join(publicAbisDir, `${name}.json`), JSON.stringify(artifact, null, 2));
  }
  console.log("✅ Copied ABIs to frontend/public/abis");

  console.log("\n=========================================");
  console.log("🎉 SEPOLIA DEPLOYMENT COMPLETE!");
  console.log("=========================================");
  console.log("NationalIdentity:", nationalIdentityAddress);
  console.log("StaticTaxHandler:", staticTaxHandlerAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

