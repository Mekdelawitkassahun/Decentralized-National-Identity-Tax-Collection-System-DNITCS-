const hre = require("hardhat");

async function main() {
  const [admin] = await hre.ethers.getSigners();
  const ADMIN_ADDRESS = process.env.DNIT_ADMIN_WALLET || "0x2646C40E21f8ef7637e3cD7AB6e33730Fba3C1A5";
  const EMPLOYER_ADDRESS = process.env.DNIT_EMPLOYER_WALLET || "0x2d06fb81C36D325c26E90a485598aA5f2d05B3dB";
  const TAX_COLLECTOR_ADDRESS = process.env.DNIT_TAX_COLLECTOR_WALLET || "0x487C04EBF0c20F05009Adf9e7103644a66D1A3Ef";

  const NATIONAL_IDENTITY = "0xd8bc12e4257998767798431ABA22cBC69069e13e";
  const STATIC_TAX_HANDLER = "0x5720a110e0eceb277a289C5Bf478a0C69f0DAB08";

  const ni = await hre.ethers.getContractAt("NationalIdentity", NATIONAL_IDENTITY, admin);
  const th = await hre.ethers.getContractAt("StaticTaxHandler", STATIC_TAX_HANDLER, admin);

  const adminRole = await ni.ADMIN_ROLE();
  const employerRole = await ni.EMPLOYER_ROLE();
  const taxCollectorRole = await ni.TAX_COLLECTOR_ROLE();
  const thTaxCollectorRole = await th.TAX_COLLECTOR_ROLE();

  const grantIfMissing = async (label, contract, role, target) => {
    const has = await contract.hasRole(role, target);
    if (has) {
      console.log(`skip ${label}: already granted to ${target}`);
      return;
    }
    const tx = await contract.grantRole(role, target);
    await tx.wait();
    console.log(`granted ${label} -> ${target}`);
  };

  await grantIfMissing("ADMIN_ROLE", ni, adminRole, ADMIN_ADDRESS);
  await grantIfMissing("EMPLOYER_ROLE", ni, employerRole, EMPLOYER_ADDRESS);
  await grantIfMissing("TAX_COLLECTOR_ROLE", ni, taxCollectorRole, TAX_COLLECTOR_ADDRESS);
  await grantIfMissing("TH_TAX_COLLECTOR_ROLE", th, thTaxCollectorRole, TAX_COLLECTOR_ADDRESS);

  // Use backend signer from env to match attestation signatures.
  const attesterKey = process.env.ATTESTER_PRIVATE_KEY;
  if (!attesterKey) throw new Error("ATTESTER_PRIVATE_KEY not set in environment");
  const attesterAddress = new hre.ethers.Wallet(attesterKey).address;
  const currentAttester = await ni.faydaAttester();
  if (currentAttester.toLowerCase() !== attesterAddress.toLowerCase()) {
    const tx = await ni.setFaydaAttester(attesterAddress);
    await tx.wait();
    console.log(`set faydaAttester -> ${attesterAddress}`);
  } else {
    console.log(`skip faydaAttester: already ${currentAttester}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
