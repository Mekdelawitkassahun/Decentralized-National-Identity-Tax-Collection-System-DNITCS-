// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./NationalIdentity.sol";

/**
 * StaticTaxHandler
 *
 * Production prototype changes:
 *  - No income self-reporting (citizens/employers never submit income figures)
 *  - Category-based tax calculation (A uses bank deposits oracle; B/Micro use fixed tables)
 */
contract StaticTaxHandler is Ownable, AccessControl, ReentrancyGuard {
    NationalIdentity public identityContract;

    bytes32 public constant BANK_ORACLE_ROLE = keccak256("BANK_ORACLE_ROLE");
    bytes32 public constant GOVERNMENT_ORACLE_ROLE = keccak256("GOVERNMENT_ORACLE_ROLE");
    bytes32 public constant TAX_COLLECTOR_ROLE = keccak256("TAX_COLLECTOR_ROLE");

    // For demo we treat "ETB amounts" as 1 ETB = 1e12 wei (so amounts are payable).
    uint256 public constant ETB_TO_WEI = 1e12;

    // Category A: deposits * 30%
    uint256 public constant CATEGORY_A_RATE_BPS = 3000; // 30.00% (bps / 10000)

    struct TaxRecord {
        uint256 totalTaxPaid;
        uint256 lastPaymentTimestamp;
        bool exists;
    }

    mapping(address => TaxRecord) private taxRecords;
    uint256 public totalTaxCollected;

    // Oracle-provided values
    mapping(address => uint256) public categoryADepositsAnnualWei; // annual deposits in wei(ETB)
    mapping(address => uint256) public governmentTaxAnnualWei; // annual due for GOVERNMENT category

    event TaxPaid(address indexed citizen, uint256 amountWei, NationalIdentity.TaxCategory category, uint256 timestamp);
    event EmployerWithholding(address indexed employer, address indexed employee, uint256 amountWei, uint256 timestamp);
    event DepositsUpdated(address indexed business, uint256 annualDepositsWei, uint256 timestamp);
    event GovernmentWithholdingUpdated(address indexed employee, uint256 annualTaxWei, uint256 timestamp);

    constructor(address _identityContract) Ownable(msg.sender) {
        identityContract = NationalIdentity(_identityContract);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(BANK_ORACLE_ROLE, msg.sender);
        _grantRole(GOVERNMENT_ORACLE_ROLE, msg.sender);
        _grantRole(TAX_COLLECTOR_ROLE, msg.sender);
    }

    // ----------------- Category Tax Calculations -----------------

    function calculateTaxForCategoryA(address business) public view returns (uint256) {
        uint256 deposits = categoryADepositsAnnualWei[business];
        return (deposits * CATEGORY_A_RATE_BPS) / 10000;
    }

    function calculateTaxForCategoryB(
        NationalIdentity.BusinessType businessType,
        NationalIdentity.Location area
    ) public pure returns (uint256) {
        // Prototype fixed table:
        // - Annual presumptive sales (ETB) are fixed per (businessType, location)
        // - Tax rate varies between 2% and 9%
        uint256 salesEtb = _categoryBSalesEtbAnnual(businessType, area);
        uint256 rateBps = _categoryBRateBps(businessType, area);
        uint256 taxEtb = (salesEtb * rateBps) / 10000;
        return taxEtb * ETB_TO_WEI;
    }

    function calculateTaxForMicro(
        NationalIdentity.BusinessType businessType
    ) public pure returns (uint256) {
        // Flat monthly payment (ETB), dependent on business type.
        uint256 monthlyEtb = _microMonthlyEtb(businessType);
        return monthlyEtb * ETB_TO_WEI;
    }

    function calculateTaxForGovernment(address employee) public view returns (uint256) {
        return governmentTaxAnnualWei[employee];
    }

    function taxDueNow(address citizen) public view returns (uint256) {
        NationalIdentity.TaxCategory cat = identityContract.taxCategoryOf(citizen);
        if (cat == NationalIdentity.TaxCategory.GOVERNMENT) {
            return calculateTaxForGovernment(citizen);
        }
        if (cat == NationalIdentity.TaxCategory.CATEGORY_A) {
            return calculateTaxForCategoryA(citizen);
        }
        if (cat == NationalIdentity.TaxCategory.CATEGORY_B) {
            return calculateTaxForCategoryB(identityContract.businessTypeOf(citizen), identityContract.locationOf(citizen));
        }
        // MICRO
        return calculateTaxForMicro(identityContract.businessTypeOf(citizen));
    }

    // ----------------- Payments -----------------

    function payTax() external payable nonReentrant {
        require(identityContract.isAutoApprovedCitizen(msg.sender), "Citizen not auto-approved");

        NationalIdentity.TaxCategory cat = identityContract.taxCategoryOf(msg.sender);
        require(cat == NationalIdentity.TaxCategory.CATEGORY_B || cat == NationalIdentity.TaxCategory.MICRO, "Citizen payments disabled for this category");

        uint256 dueWei = taxDueNow(msg.sender);
        require(dueWei > 0, "No tax due");
        require(msg.value >= dueWei, "Insufficient payment");

        _recordTax(msg.sender, dueWei, cat, msg.sender);
    }

    function employerWithhold(address employee) external payable nonReentrant {
        require(identityContract.hasRole(identityContract.EMPLOYER_ROLE(), msg.sender), "Not an authorized employer");
        require(identityContract.isAutoApprovedCitizen(employee), "Employee not auto-approved");

        uint256 dueWei = taxDueNow(employee);
        require(dueWei > 0, "No tax due");
        require(msg.value >= dueWei, "Insufficient withholding amount");

        NationalIdentity.TaxCategory cat = identityContract.taxCategoryOf(employee);
        _recordTax(employee, dueWei, cat, msg.sender);

        emit EmployerWithholding(msg.sender, employee, dueWei, block.timestamp);
    }

    function _recordTax(address citizen, uint256 amountWei, NationalIdentity.TaxCategory category, address payer) internal {
        (payer); // payer reserved for future audit data

        TaxRecord storage r = taxRecords[citizen];
        r.totalTaxPaid += amountWei;
        r.lastPaymentTimestamp = block.timestamp;
        r.exists = true;

        totalTaxCollected += amountWei;

        emit TaxPaid(citizen, amountWei, category, block.timestamp);
    }

    // ----------------- Oracle Updates -----------------

    function updateDepositsFromBank(address business, uint256 annualDepositsWei) external onlyRole(BANK_ORACLE_ROLE) {
        require(business != address(0), "Invalid business");
        categoryADepositsAnnualWei[business] = annualDepositsWei;
        emit DepositsUpdated(business, annualDepositsWei, block.timestamp);
    }

    function updateGovernmentWithholding(address employee, uint256 annualTaxWei) external onlyRole(GOVERNMENT_ORACLE_ROLE) {
        require(employee != address(0), "Invalid employee");
        governmentTaxAnnualWei[employee] = annualTaxWei;
        emit GovernmentWithholdingUpdated(employee, annualTaxWei, block.timestamp);
    }

    // ----------------- Read Access Control -----------------

    function getTaxRecord(address citizen) external view returns (
        bool exists,
        uint256 totalTaxPaid,
        uint256 lastPaymentTimestamp
    ) {
        require(
            citizen == msg.sender || hasRole(TAX_COLLECTOR_ROLE, msg.sender),
            "Not authorized to view tax record"
        );
        TaxRecord memory r = taxRecords[citizen];
        return (r.exists, r.totalTaxPaid, r.lastPaymentTimestamp);
    }

    // ----------------- Withdraw -----------------

    function withdrawRevenue(uint256 amountWei) external onlyOwner {
        require(amountWei <= address(this).balance, "Insufficient balance");
        payable(owner()).transfer(amountWei);
    }

    function _categoryBSalesEtbAnnual(
        NationalIdentity.BusinessType businessType,
        NationalIdentity.Location area
    ) internal pure returns (uint256) {
        // Fixed sales assumptions (ETB/year) for demo.
        // Keeping numbers small-ish for testnet UX.
        uint256 base;
        if (businessType == NationalIdentity.BusinessType.RETAIL_SHOP) base = 2_000_000;
        else if (businessType == NationalIdentity.BusinessType.RESTAURANT) base = 3_200_000;
        else if (businessType == NationalIdentity.BusinessType.TAXI) base = 1_600_000;
        else if (businessType == NationalIdentity.BusinessType.WHOLESALE) base = 4_800_000;
        else if (businessType == NationalIdentity.BusinessType.MANUFACTURING) base = 4_500_000;
        else base = 2_700_000;

        // Region multiplier (prototype only).
        // - Addis Ababa highest
        // - Major regions medium
        // - others lower
        uint256 multiplierBps;
        if (area == NationalIdentity.Location.ADDIS_ABABA) multiplierBps = 20000; // 2.0x
        else if (area == NationalIdentity.Location.OROMIA) multiplierBps = 15000; // 1.5x
        else if (area == NationalIdentity.Location.AMHARA) multiplierBps = 13000; // 1.3x
        else if (area == NationalIdentity.Location.TIGRAY) multiplierBps = 12000; // 1.2x
        else if (area == NationalIdentity.Location.SIDAMA) multiplierBps = 12500; // 1.25x
        else multiplierBps = 11500; // ~1.15x

        return (base * multiplierBps) / 10000;
    }

    function _categoryBRateBps(
        NationalIdentity.BusinessType businessType,
        NationalIdentity.Location area
    ) internal pure returns (uint256) {
        // Rate between 2% and 9% (bps / 10000).
        uint256 rateBpsBase;
        if (businessType == NationalIdentity.BusinessType.RETAIL_SHOP) rateBpsBase = 220; // 2.2%
        else if (businessType == NationalIdentity.BusinessType.RESTAURANT) rateBpsBase = 520; // 5.2%
        else if (businessType == NationalIdentity.BusinessType.TAXI) rateBpsBase = 420; // 4.2%
        else if (businessType == NationalIdentity.BusinessType.WHOLESALE) rateBpsBase = 620; // 6.2%
        else if (businessType == NationalIdentity.BusinessType.MANUFACTURING) rateBpsBase = 680; // 6.8%
        else rateBpsBase = 450; // 4.5%

        // Location adjustment (kept bounded to 2%-9% range)
        uint256 adj;
        if (area == NationalIdentity.Location.ADDIS_ABABA) adj = 250; // +2.5%
        else if (area == NationalIdentity.Location.OROMIA) adj = 150; // +1.5%
        else if (area == NationalIdentity.Location.AMHARA) adj = 100; // +1%
        else if (area == NationalIdentity.Location.TIGRAY) adj = 50; // +0.5%
        else adj = 75; // others

        uint256 rate = rateBpsBase + adj;
        if (rate < 200) return 200;
        if (rate > 900) return 900;
        return rate;
    }

    function _microMonthlyEtb(NationalIdentity.BusinessType businessType) internal pure returns (uint256) {
        if (businessType == NationalIdentity.BusinessType.RETAIL_SHOP) return 220;
        if (businessType == NationalIdentity.BusinessType.RESTAURANT) return 300;
        if (businessType == NationalIdentity.BusinessType.TAXI) return 250;
        if (businessType == NationalIdentity.BusinessType.WHOLESALE) return 320;
        if (businessType == NationalIdentity.BusinessType.MANUFACTURING) return 420;
        return 280;
    }

    receive() external payable {}
}
