// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * NationalIdentity
 *
 * Prototype flow:
 *  - A trusted backend (Fayda attester) verifies the citizen with Fayda OTP + eKYC.
 *  - Backend signs an attestation. The citizen submits that attestation to register & auto-approve.
 *
 * This removes mock verification and removes the "manual admin approvals for millions".
 */
contract NationalIdentity is AccessControl, Pausable, ReentrancyGuard {
    using MessageHashUtils for bytes32;

    // Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant EMPLOYER_ROLE = keccak256("EMPLOYER_ROLE");
    bytes32 public constant TAX_COLLECTOR_ROLE = keccak256("TAX_COLLECTOR_ROLE");

    // ECDSA signer that attests Fayda results + tax category.
    address public faydaAttester;

    enum TaxCategory {
        GOVERNMENT,
        CATEGORY_A,
        CATEGORY_B,
        MICRO
    }

    enum BusinessType {
        RETAIL_SHOP,
        RESTAURANT,
        TAXI,
        WHOLESALE,
        MANUFACTURING,
        OTHER
    }

    enum Location {
        ADDIS_ABABA,
        AFAR,
        AMHARA,
        BENISHANGUL_GUMUZ,
        CENTRAL_ETHIOPIA,
        GAMBELLA,
        HARARI,
        OROMIA,
        SIDAMA,
        SOMALI,
        SOUTH_ETHIOPIA,
        SOUTH_WEST_ETHIOPIA,
        TIGRAY
    }

    struct Citizen {
        string fullName; // for admin display only in this prototype
        bytes32 faydaHash; // privacy-preserving hash of Fayda ID (UIN/VID)

        TaxCategory taxCategory;
        BusinessType businessType; // used for CATEGORY_B and MICRO
        Location area; // used for CATEGORY_B
        address linkedBankAccount; // used for CATEGORY_A (reference, not real bank account)

        uint8 age;
        bool isFaydaVerified;
        bool isOnSanctionsList;

        bool isAutoApproved;
        bool needsManualReview;
        uint256 registrationTime;
        uint256 lastFaydaVerification;
        uint256 approvalTimestamp;

        address registeredBy;
    }

    mapping(address => Citizen) private citizens;
    mapping(bytes32 => address) private faydaHashToAddress;
    address[] private registeredAddresses;
    mapping(bytes32 => bool) private usedAttestations;

    event CitizenRegistered(address indexed citizen, bytes32 indexed faydaHash, TaxCategory taxCategory);
    event CitizenAutoApproved(address indexed citizen, uint256 timestamp);
    event CitizenManualApproved(address indexed citizen, uint256 timestamp);
    event CitizenManualRejected(address indexed citizen, uint256 timestamp);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(EMPLOYER_ROLE, msg.sender);
        _grantRole(TAX_COLLECTOR_ROLE, msg.sender);
    }

    function setFaydaAttester(address signer) external onlyRole(ADMIN_ROLE) {
        faydaAttester = signer;
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // --------- Registration / Auto-approval ----------

    function registerAndAutoApprove(
        bytes32 attestationId,
        string calldata _fullName,
        bytes32 _faydaHash,
        uint8 _age,
        bool _faydaVerified,
        bool _onSanctionsList,
        TaxCategory _taxCategory,
        BusinessType _businessType,
        Location _area,
        address _linkedBankAccount,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        require(faydaAttester != address(0), "Fayda attester not configured");
        require(bytes(_fullName).length > 0, "Name required");
        require(citizens[msg.sender].registrationTime == 0, "Already registered");
        require(faydaHashToAddress[_faydaHash] == address(0), "Fayda ID already registered");
        require(!usedAttestations[attestationId], "Attestation already used");

        // Verify attestation signature (prevents lying about age/sanctions/category)
        bytes32 digest = keccak256(
            abi.encode(
                attestationId,
                msg.sender,
                _faydaHash,
                _age,
                _faydaVerified,
                _onSanctionsList,
                uint8(_taxCategory),
                uint8(_businessType),
                uint8(_area),
                _linkedBankAccount
            )
        );

        bytes32 messageHash = digest.toEthSignedMessageHash();
        address recovered = ECDSA.recover(messageHash, signature);
        require(recovered == faydaAttester, "Invalid attestation signature");

        usedAttestations[attestationId] = true;

        Citizen storage c = citizens[msg.sender];
        c.fullName = _fullName;
        c.faydaHash = _faydaHash;
        c.taxCategory = _taxCategory;
        c.businessType = _businessType;
        c.area = _area;
        c.linkedBankAccount = _linkedBankAccount;
        c.age = _age;
        c.isFaydaVerified = _faydaVerified;
        c.isOnSanctionsList = _onSanctionsList;
        c.registrationTime = block.timestamp;
        c.lastFaydaVerification = block.timestamp;
        c.registeredBy = msg.sender;

        // Auto-approval criteria
        bool eligible = _faydaVerified && (_age >= 18) && !_onSanctionsList && _isCategoryConfigured(_taxCategory, _businessType, _area, _linkedBankAccount);
        c.isAutoApproved = eligible;
        c.needsManualReview = !eligible;
        if (eligible) {
            c.approvalTimestamp = block.timestamp;
            emit CitizenAutoApproved(msg.sender, c.approvalTimestamp);
        }

        faydaHashToAddress[_faydaHash] = msg.sender;
        registeredAddresses.push(msg.sender);
        emit CitizenRegistered(msg.sender, _faydaHash, _taxCategory);
    }

    function _isCategoryConfigured(
        TaxCategory _taxCategory,
        BusinessType _businessType,
        Location _area,
        address _linkedBankAccount
    ) internal pure returns (bool) {
        // Minimal validation for prototype:
        // - CATEGORY_B requires a location
        // - MICRO requires a business type
        // - CATEGORY_A requires a bank account reference
        if (_taxCategory == TaxCategory.CATEGORY_B) {
            return (_businessType <= BusinessType.OTHER) && (_area <= Location.TIGRAY);
        }
        if (_taxCategory == TaxCategory.MICRO) {
            return (_businessType <= BusinessType.OTHER);
        }
        if (_taxCategory == TaxCategory.CATEGORY_A) {
            return (_linkedBankAccount != address(0));
        }
        // GOVERNMENT does not require extra fields in this prototype
        return true;
    }

    // --------- Manual review (edge cases) ----------

    function manualApprove(address citizen) public onlyRole(ADMIN_ROLE) {
        Citizen storage c = citizens[citizen];
        require(c.registrationTime != 0, "Citizen not found");
        require(!c.isAutoApproved, "Already auto-approved");
        c.isAutoApproved = true;
        c.needsManualReview = false;
        c.approvalTimestamp = block.timestamp;
        emit CitizenManualApproved(citizen, c.approvalTimestamp);
    }

    function manualReject(address citizen) public onlyRole(ADMIN_ROLE) {
        Citizen storage c = citizens[citizen];
        require(c.registrationTime != 0, "Citizen not found");
        require(!c.isAutoApproved, "Already approved");
        c.isAutoApproved = false;
        c.needsManualReview = false;
        emit CitizenManualRejected(citizen, block.timestamp);
    }

    function batchManualApprove(address[] calldata citizenWallets) external onlyRole(ADMIN_ROLE) {
        for (uint256 i = 0; i < citizenWallets.length; i++) {
            manualApprove(citizenWallets[i]);
        }
    }

    // --------- Getters for frontend ----------

    function isAutoApprovedCitizen(address citizen) external view returns (bool) {
        return citizens[citizen].isAutoApproved;
    }

    function taxCategoryOf(address citizen) external view returns (TaxCategory) {
        return citizens[citizen].taxCategory;
    }

    function businessTypeOf(address citizen) external view returns (BusinessType) {
        return citizens[citizen].businessType;
    }

    function locationOf(address citizen) external view returns (Location) {
        return citizens[citizen].area;
    }

    function linkedBankAccountOf(address citizen) external view returns (address) {
        return citizens[citizen].linkedBankAccount;
    }

    function getCitizenPublic(address citizen) external view returns (
        TaxCategory taxCategory,
        bool isFaydaVerified,
        bool isAutoApproved,
        bool needsManualReview,
        uint256 approvalTimestamp,
        uint256 registrationTime
    ) {
        Citizen memory c = citizens[citizen];
        require(c.registrationTime != 0, "Citizen not found");
        return (
            c.taxCategory,
            c.isFaydaVerified,
            c.isAutoApproved,
            c.needsManualReview,
            c.approvalTimestamp,
            c.registrationTime
        );
    }

    function getCitizenAdmin(address citizen) external view onlyRole(ADMIN_ROLE) returns (
        string memory fullName,
        bytes32 faydaHash,
        TaxCategory taxCategory,
        uint8 age,
        bool isFaydaVerified,
        bool isOnSanctionsList,
        bool isAutoApproved,
        bool needsManualReview,
        uint256 approvalTimestamp,
        uint256 registrationTime
    ) {
        Citizen memory c = citizens[citizen];
        require(c.registrationTime != 0, "Citizen not found");
        return (
            c.fullName,
            c.faydaHash,
            c.taxCategory,
            c.age,
            c.isFaydaVerified,
            c.isOnSanctionsList,
            c.isAutoApproved,
            c.needsManualReview,
            c.approvalTimestamp,
            c.registrationTime
        );
    }

    function resolveWalletFromFaydaHash(bytes32 faydaHash) external view onlyRole(TAX_COLLECTOR_ROLE) returns (address) {
        return faydaHashToAddress[faydaHash];
    }

    function resolveWalletFromFaydaNumber(uint256 faydaNumber) external view onlyRole(TAX_COLLECTOR_ROLE) returns (address) {
        bytes32 h = keccak256(abi.encodePacked(faydaNumber));
        return faydaHashToAddress[h];
    }

    function getAllCitizens() external view onlyRole(ADMIN_ROLE) returns (address[] memory) {
        return registeredAddresses;
    }

    function getTotalCitizens() external view returns (uint256) {
        return registeredAddresses.length;
    }
}
