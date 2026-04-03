const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function readHardhatAddresses() {
  const configPath = path.join(__dirname, "../../dnit-frontend/src/config/contracts.ts");
  const configContent = fs.readFileSync(configPath, "utf8");
  const matchNI = configContent.match(/hardhat:\s*\{[\s\S]*?nationalIdentity:\s*\"(0x[a-fA-F0-9]{40})\"/m);
  const matchTH = configContent.match(/hardhat:\s*\{[\s\S]*?staticTaxHandler:\s*\"(0x[a-fA-F0-9]{40})\"/m);
  if (!matchNI || !matchTH) throw new Error("Could not find hardhat addresses in contracts.ts");
  return { NATIONAL_IDENTITY: matchNI[1], STATIC_TAX_HANDLER: matchTH[1] };
}

async function verifyOtpForCitizen({ faydaNumber, otp, walletAddress, fullName, taxCategory, businessType, location, linkedBankAccount, tinNumber }) {
  const res = await fetch("http://127.0.0.1:8080/api/fayda/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      faydaNumber,
      otp,
      walletAddress,
      fullName,
      taxCategory,
      businessType,
      location,
      linkedBankAccount,
      tinNumber,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`verify-otp failed: ${data?.error || "unknown"}`);
  return data;
}

async function main() {
  const { NATIONAL_IDENTITY, STATIC_TAX_HANDLER } = readHardhatAddresses();
  const signers = await hre.ethers.getSigners();
  const adminEmployerTaxCollector = signers[0];
  const citizenAuto = signers[3];
  const citizenNeedsReview = signers[4];

  const fullName1 = "Citizen Auto";
  const fullName2 = "Citizen Needs Review";
  const base = (Date.now() % 10000000000000000).toString().padStart(16, "0");
  const faydaNumber = base;
  const faydaNumber2 = (BigInt(base) + 1n).toString().padStart(16, "0");
  const otp = "123456";

  const linkedBankAccountZero = "0x0000000000000000000000000000000000000000";

  // 1) Claimed Category B but tinNumber derives MICRO in mock.
  const taxCategoryB_claimed = 2; // CATEGORY_B
  const businessTypeRetail = 0; // RETAIL_SHOP
  const locationNotOther = 0; // ADDIS_ABABA
  const att1 = await verifyOtpForCitizen({
    faydaNumber,
    otp,
    walletAddress: await citizenAuto.getAddress(),
    fullName: fullName1,
    taxCategory: taxCategoryB_claimed,
    businessType: businessTypeRetail,
    location: locationNotOther,
    linkedBankAccount: linkedBankAccountZero,
    tinNumber: "TIN000000000", // last digit 0 => derived MICRO in mock
  });

  const ni = await hre.ethers.getContractAt("NationalIdentity", NATIONAL_IDENTITY);
  await (
    await ni
      .connect(citizenAuto)
      .registerAndAutoApprove(
        att1.attestationId,
        fullName1,
        att1.faydaHash,
        att1.age,
        att1.faydaVerified,
        att1.onSanctionsList,
        att1.derivedTaxCategory,
        att1.derivedBusinessType,
        att1.derivedLocation,
        att1.effectiveLinkedBankAccount,
        att1.signature
      )
  ).wait();

  const th = await hre.ethers.getContractAt("StaticTaxHandler", STATIC_TAX_HANDLER);
  const cat1OnChain = await ni.taxCategoryOf(await citizenAuto.getAddress());
  if (Number(cat1OnChain) !== Number(att1.derivedTaxCategory)) throw new Error("Derived taxCategory not enforced");

  const due1 = await th.taxDueNow(await citizenAuto.getAddress());
  await (await th.connect(citizenAuto).payTax({ value: due1 })).wait();

  // 2) Claimed MICRO but tinNumber derives CATEGORY_B in mock.
  const att2 = await verifyOtpForCitizen({
    faydaNumber: faydaNumber2,
    otp,
    walletAddress: await citizenNeedsReview.getAddress(),
    fullName: fullName2,
    taxCategory: 3, // claimed MICRO
    businessType: businessTypeRetail,
    location: locationNotOther,
    linkedBankAccount: linkedBankAccountZero,
    tinNumber: "TIN000000003", // last digit 3 => derived CATEGORY_B in mock
  });

  await (
    await ni
      .connect(citizenNeedsReview)
      .registerAndAutoApprove(
        att2.attestationId,
        fullName2,
        att2.faydaHash,
        att2.age,
        att2.faydaVerified,
        att2.onSanctionsList,
        att2.derivedTaxCategory,
        att2.derivedBusinessType,
        att2.derivedLocation,
        att2.effectiveLinkedBankAccount,
        att2.signature
      )
  ).wait();

  const cat2OnChain = await ni.taxCategoryOf(await citizenNeedsReview.getAddress());
  if (Number(cat2OnChain) !== Number(att2.derivedTaxCategory)) throw new Error("Derived taxCategory not enforced (2)");

  // Citizen can pay now
  const due2 = await th.taxDueNow(await citizenNeedsReview.getAddress());
  await (await th.connect(citizenNeedsReview).payTax({ value: due2 })).wait();

  // 3) Tax collector can resolve Fayda number -> wallet
  const taxCollectorAddr = await ni.resolveWalletFromFaydaNumber(BigInt(faydaNumber2));
  if (taxCollectorAddr.toLowerCase() !== (await citizenNeedsReview.getAddress()).toLowerCase()) {
    throw new Error("resolveWalletFromFaydaNumber mismatch");
  }

  // 4) Employer withholding (employerWithhold) should accept auto-approved employee
  const due3 = await th.taxDueNow(await citizenAuto.getAddress());
  await (await th.connect(adminEmployerTaxCollector).employerWithhold(await citizenAuto.getAddress(), { value: due3 })).wait();

  console.log("All role flows (local) passed.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

