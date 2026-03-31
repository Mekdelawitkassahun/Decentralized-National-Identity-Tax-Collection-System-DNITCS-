// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./NationalIdentity.sol";

/**
 * @title StaticTaxHandler
 * @dev Automated tax collection system for national revenue.
 */
contract StaticTaxHandler is Ownable {
    NationalIdentity public identityContract;

    struct TaxBracket {
        uint256 minIncome;
        uint256 maxIncome;
        uint256 rate; // In micro-basis points (e.g., 1 = 1/1e15)
    }

    TaxBracket[] public taxBrackets;
    
    struct TaxRecord {
        uint256 totalIncome;
        uint256 totalTaxPaid;
        uint256 lastFilingDate;
        bool exists;
    }

    mapping(address => TaxRecord) public taxRecords;
    uint256 public totalTaxCollected;

    event TaxPaid(address indexed citizenAddress, uint256 amount, uint256 income);
    event TaxBracketUpdated(uint256 index, uint256 minIncome, uint256 maxIncome, uint256 rate);
    event EmployerWithholding(address indexed employer, address indexed employee, uint256 amount);

    constructor(address _identityContract) Ownable(msg.sender) {
        identityContract = NationalIdentity(_identityContract);
        
        // Extremely low tax rates for testing
        // Rate 200 with divisor 1e15 = 0.00000001 ETH tax on 50,000 ETH salary
        taxBrackets.push(TaxBracket(0, type(uint256).max, 200)); 
    }

    function calculateTax(uint256 _income) public view returns (uint256) {
        uint256 totalTax = 0;
        
        for (uint256 i = 0; i < taxBrackets.length; i++) {
            if (_income > taxBrackets[i].minIncome) {
                uint256 taxableAmount;
                if (_income > taxBrackets[i].maxIncome) {
                    taxableAmount = taxBrackets[i].maxIncome - taxBrackets[i].minIncome;
                } else {
                    taxableAmount = _income - taxBrackets[i].minIncome;
                }
                totalTax += (taxableAmount * taxBrackets[i].rate) / 1e15;
            }
        }
        
        return totalTax;
    }

    function payTax(uint256 _income) external payable {
        require(identityContract.isCitizenVerified(msg.sender), "Citizen not verified");
        
        uint256 calculatedTax = calculateTax(_income);
        require(msg.value >= calculatedTax, "Insufficient tax payment");

        TaxRecord storage record = taxRecords[msg.sender];
        record.totalIncome += _income;
        record.totalTaxPaid += msg.value;
        record.lastFilingDate = block.timestamp;
        record.exists = true;

        totalTaxCollected += msg.value;

        emit TaxPaid(msg.sender, msg.value, _income);
    }

    function employerWithhold(address _employee, uint256 _salary) external payable {
        require(identityContract.hasRole(identityContract.EMPLOYER_ROLE(), msg.sender), "Not an authorized employer");
        require(identityContract.isCitizenVerified(_employee), "Employee not verified");

        uint256 taxToWithhold = calculateTax(_salary);
        require(msg.value >= taxToWithhold, "Insufficient withholding amount");

        TaxRecord storage record = taxRecords[_employee];
        record.totalIncome += _salary;
        record.totalTaxPaid += msg.value;
        record.lastFilingDate = block.timestamp;
        record.exists = true;

        totalTaxCollected += msg.value;

        emit EmployerWithholding(msg.sender, _employee, msg.value);
    }

    function updateTaxBracket(uint256 _index, uint256 _min, uint256 _max, uint256 _rate) external onlyOwner {
        require(_index < taxBrackets.length, "Invalid bracket index");
        taxBrackets[_index] = TaxBracket(_min, _max, _rate);
        emit TaxBracketUpdated(_index, _min, _max, _rate);
    }

    function addTaxBracket(uint256 _min, uint256 _max, uint256 _rate) external onlyOwner {
        taxBrackets.push(TaxBracket(_min, _max, _rate));
    }

    function withdrawRevenue(uint256 _amount) external onlyOwner {
        require(_amount <= address(this).balance, "Insufficient balance");
        payable(owner()).transfer(_amount);
    }

    receive() external payable {}
}
