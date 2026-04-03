const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const configPath = path.join(__dirname, "../../dnit-frontend/src/config/contracts.ts");
  const configContent = fs.readFileSync(configPath, "utf8");

  const matchNI = configContent.match(/hardhat:\s*\{[\s\S]*?nationalIdentity:\s*\"(0x[a-fA-F0-9]{40})\"/m);
  const matchTH = configContent.match(/hardhat:\s*\{[\s\S]*?staticTaxHandler:\s*\"(0x[a-fA-F0-9]{40})\"/m);

  if (!matchNI || !matchTH) throw new Error("Could not read hardhat addresses from contracts.ts");

  const NATIONAL_IDENTITY = matchNI[1];
  const STATIC_TAX_HANDLER = matchTH[1];

  const [, citizen] = await hre.ethers.getSigners();
  const citizenWallet = await citizen.getAddress();

  const fullName = "Test Citizen";
  const base = (Date.now() % 10000000000000000).toString().padStart(16, "0");
  const faydaNumber = base;
  const otp = "123456";

  // CATEGORY_B: taxCategory=2, businessType=0 (RETAIL_SHOP), location=1 (AFAR)
  const taxCategory = 2;
  const businessType = 0;
  const area = 1; // AFAR
  const linkedBankAccount = "0x0000000000000000000000000000000000000000";

  const verifyUrl = "http://127.0.0.1:8080/api/fayda/verify-otp";
  const res = await fetch(verifyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      faydaNumber,
      otp,
      walletAddress: citizenWallet,
      fullName,
      taxCategory,
      businessType,
      location: area,
      linkedBankAccount,
      tinNumber: "TIN000000000",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.log("verify-otp failed response:", data);
    throw new Error("verify-otp failed");
  }

  const ni = await hre.ethers.getContractAt("NationalIdentity", NATIONAL_IDENTITY);
  const expectedAttester = await ni.faydaAttester();

  // Recompute the exact digest used by Solidity:
  const types = [
    "bytes32",
    "address",
    "bytes32",
    "uint8",
    "bool",
    "bool",
    "uint8",
    "uint8",
    "uint8",
    "address",
  ];
  const values = [
    data.attestationId,
    citizenWallet,
    data.faydaHash,
    data.age,
    data.faydaVerified,
    data.onSanctionsList,
    taxCategory,
    businessType,
    area,
    linkedBankAccount,
  ];
  const digest = hre.ethers.keccak256(hre.ethers.AbiCoder.defaultAbiCoder().encode(types, values));
  const messageHash = hre.ethers.hashMessage(hre.ethers.getBytes(digest));
  const recovered = hre.ethers.recoverAddress(messageHash, data.signature);

  console.log("Expected attester:", expectedAttester);
  console.log("Recovered attester:", recovered);
  console.log("Backend digestDebug:", data.digestDebug);
  console.log("Digest:", digest);

  const tx = await ni
    .connect(citizen)
    .registerAndAutoApprove(
      data.attestationId,
      fullName,
      data.faydaHash,
      data.age,
      data.faydaVerified,
      data.onSanctionsList,
      taxCategory,
      businessType,
      area,
      linkedBankAccount,
      data.signature
    );
  await tx.wait();
  console.log("Citizen registered");

  const st = await hre.ethers.getContractAt("StaticTaxHandler", STATIC_TAX_HANDLER);
  const dueWei = await st.taxDueNow(citizenWallet);
  console.log("Due wei:", dueWei.toString());

  const payTx = await st.connect(citizen).payTax({ value: dueWei });
  await payTx.wait();
  console.log("Tax paid");

  const record = await st.getTaxRecord(citizenWallet);
  console.log("Tax record:", record);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

