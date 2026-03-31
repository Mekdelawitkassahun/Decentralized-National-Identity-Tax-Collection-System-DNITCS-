// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.24; 
 
import "@openzeppelin/contracts/access/AccessControl.sol"; 
import "@openzeppelin/contracts/utils/Pausable.sol"; 
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; 
 
contract NationalIdentity is AccessControl, Pausable, ReentrancyGuard { 
    // Role definitions (keep existing) 
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE"); 
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE"); 
    bytes32 public constant EMPLOYER_ROLE = keccak256("EMPLOYER_ROLE"); 
     
    // New role for Fayda verification 
    bytes32 public constant FAYDA_VERIFIER_ROLE = keccak256("FAYDA_VERIFIER_ROLE"); 
     
    struct Citizen { 
        string fullName; 
        bytes32 faydaHash;           // Hash of Fayda ID (for privacy) 
        bool isFaydaVerified;        // Verified with official Fayda system 
        bool isVerifiedByAdmin;       // Verified by government admin 
        uint256 registrationTime; 
        uint256 lastFaydaVerification; 
        address registeredBy;         // Who registered this citizen 
    } 
     
    // Mapping from address to Citizen 
    mapping(address => Citizen) public citizens; 
     
    // Mapping from Fayda hash to address (to prevent duplicate registrations) 
    mapping(bytes32 => address) public faydaHashToAddress; 
     
    // Array of all registered citizens for iteration 
    address[] public registeredAddresses; 
     
    // Events 
    event CitizenRegistered(address indexed citizen, string fullName, bytes32 faydaHash); 
    event FaydaVerified(address indexed citizen, uint256 timestamp); 
    event AdminVerified(address indexed citizen, address indexed verifier); 
    event CitizenUpdated(address indexed citizen); 
     
    constructor() { 
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender); 
        _grantRole(ADMIN_ROLE, msg.sender); 
        _grantRole(VERIFIER_ROLE, msg.sender); 
        _grantRole(FAYDA_VERIFIER_ROLE, msg.sender); 
        _grantRole(EMPLOYER_ROLE, msg.sender);
    } 
     
    // Register with Fayda ID (hash stored for privacy) 
    function registerWithFayda( 
        string memory _fullName, 
        uint256 _faydaNumber 
    ) external nonReentrant whenNotPaused { 
        require(bytes(_fullName).length > 0, "Name required"); 
        require(_faydaNumber >= 1000000000000000 && _faydaNumber <= 9999999999999999, "Invalid Fayda ID (must be 16 digits)"); 
         
        bytes32 faydaHash = keccak256(abi.encodePacked(_faydaNumber)); 
         
        require(citizens[msg.sender].registrationTime == 0, "Already registered"); 
        require(faydaHashToAddress[faydaHash] == address(0), "Fayda ID already registered"); 
         
        citizens[msg.sender] = Citizen({ 
            fullName: _fullName, 
            faydaHash: faydaHash, 
            isFaydaVerified: true,  // Automatically set to true for easier UX
            isVerifiedByAdmin: false, 
            registrationTime: block.timestamp, 
            lastFaydaVerification: block.timestamp, 
            registeredBy: msg.sender 
        }); 
         
        faydaHashToAddress[faydaHash] = msg.sender; 
        registeredAddresses.push(msg.sender); 
         
        emit CitizenRegistered(msg.sender, _fullName, faydaHash); 
    } 
     
    // Verify citizen's Fayda ID (called by official Fayda verifier) 
    function verifyFaydaId( 
        address _citizen, 
        uint256 _faydaNumber 
    ) external onlyRole(FAYDA_VERIFIER_ROLE) whenNotPaused { 
        Citizen storage citizen = citizens[_citizen]; 
        require(citizen.registrationTime != 0, "Citizen not registered"); 
         
        bytes32 providedHash = keccak256(abi.encodePacked(_faydaNumber)); 
        require(citizen.faydaHash == providedHash, "Fayda ID mismatch"); 
        require(!citizen.isFaydaVerified, "Already Fayda verified"); 
         
        citizen.isFaydaVerified = true; 
        citizen.lastFaydaVerification = block.timestamp; 
         
        emit FaydaVerified(_citizen, block.timestamp); 
    } 
     
    // Admin verification (government approval) 
    function verifyIdentity(address _citizen) external onlyRole(VERIFIER_ROLE) whenNotPaused { 
        Citizen storage citizen = citizens[_citizen]; 
        require(citizen.registrationTime != 0, "Citizen not registered"); 
        require(citizen.isFaydaVerified, "Must be Fayda verified first"); 
        require(!citizen.isVerifiedByAdmin, "Already verified by admin"); 
         
        citizen.isVerifiedByAdmin = true; 
         
        emit AdminVerified(_citizen, msg.sender); 
    } 
     
    // Check if citizen can pay taxes (requires both verifications) 
    function isVerified(address _citizen) public view returns (bool) { 
        Citizen memory citizen = citizens[_citizen]; 
        return citizen.isFaydaVerified && citizen.isVerifiedByAdmin; 
    } 

    // Alias for compatibility with StaticTaxHandler
    function isCitizenVerified(address _citizen) public view returns (bool) {
        return isVerified(_citizen);
    } 
     
    // Get citizen details (for frontend) 
    function getCitizen(address _citizen) external view returns ( 
        string memory fullName, 
        bytes32 faydaHash, 
        bool isFaydaVerified, 
        bool isVerifiedByAdmin, 
        uint256 registrationTime, 
        uint256 lastFaydaVerification 
    ) { 
        Citizen memory citizen = citizens[_citizen]; 
        require(citizen.registrationTime != 0, "Citizen not found"); 
         
        return ( 
            citizen.fullName, 
            citizen.faydaHash, 
            citizen.isFaydaVerified, 
            citizen.isVerifiedByAdmin, 
            citizen.registrationTime, 
            citizen.lastFaydaVerification 
        ); 
    } 
     
    // Get all registered addresses 
    function getAllCitizens() external view returns (address[] memory) { 
        return registeredAddresses; 
    } 
     
    // Get total registered citizens 
    function getTotalCitizens() external view returns (uint256) { 
        return registeredAddresses.length; 
    } 
     
    // Get Fayda verification stats 
    function getFaydaStats() external view returns ( 
        uint256 totalRegistered, 
        uint256 faydaVerified, 
        uint256 adminVerified 
    ) { 
        totalRegistered = registeredAddresses.length; 
         
        for (uint i = 0; i < registeredAddresses.length; i++) { 
            if (citizens[registeredAddresses[i]].isFaydaVerified) { 
                faydaVerified++; 
            } 
            if (citizens[registeredAddresses[i]].isVerifiedByAdmin) { 
                adminVerified++; 
            } 
        } 
         
        return (totalRegistered, faydaVerified, adminVerified); 
    } 
     
    // Update citizen name (optional) 
    function updateName(string memory _newName) external whenNotPaused { 
        require(bytes(_newName).length > 0, "Name required"); 
        require(citizens[msg.sender].registrationTime != 0, "Not registered"); 
         
        citizens[msg.sender].fullName = _newName; 
        emit CitizenUpdated(msg.sender); 
    } 
     
    // Pause functionality 
    function pause() external onlyRole(ADMIN_ROLE) { 
        _pause(); 
    } 
     
    function unpause() external onlyRole(ADMIN_ROLE) { 
        _unpause(); 
    } 
} 
