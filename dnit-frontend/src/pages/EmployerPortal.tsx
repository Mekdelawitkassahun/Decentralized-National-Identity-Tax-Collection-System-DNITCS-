import React, { useState, useEffect } from 'react';
import useWallet from '../hooks/useWallet';
import { Building2, Users, Receipt, Send, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { ethers } from 'ethers';

const EmployerPortal = () => {
  const { address, nationalIdentityContract, staticTaxHandlerContract, isEmployer, loading } = useWallet();
  const [employees, setEmployees] = useState<any[]>([]);
  const [newEmployeeAddr, setNewEmployeeAddr] = useState('');
  const [newEmployeeSalary, setNewEmployeeSalary] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Note: In a production app, employee lists would be stored in a database (PostgreSQL)
  // For this blockchain demo, we'll use local storage to persist the list for this browser
  useEffect(() => {
    const saved = localStorage.getItem(`employees_${address}`);
    if (saved) setEmployees(JSON.parse(saved));
  }, [address]);

  const saveEmployees = (list: any[]) => {
    setEmployees(list);
    localStorage.setItem(`employees_${address}`, JSON.stringify(list));
  };

  const addEmployee = async () => {
    if (!newEmployeeAddr) return;
    
    setIsProcessing(true);
    try {
      let targetAddr = newEmployeeAddr.trim();
      
      // If it looks like a Fayda ID (numeric and 16 digits), resolve it to a wallet address
      if (/^\d{16}$/.test(targetAddr)) {
        const faydaHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [BigInt(targetAddr)]));
        const resolvedAddr = await nationalIdentityContract?.faydaHashToAddress(faydaHash);
        
        if (!resolvedAddr || resolvedAddr === ethers.ZeroAddress) {
          alert("This Fayda ID is not registered to any digital wallet.");
          setIsProcessing(false);
          return;
        }
        targetAddr = resolvedAddr;
      } else if (!ethers.isAddress(targetAddr)) {
        alert("Please enter a valid Wallet Address or 16-digit Fayda ID.");
        setIsProcessing(false);
        return;
      }

      // Verify if employee is a registered citizen first
      const citizen = await nationalIdentityContract?.citizens(targetAddr);
      const isRegistered = Number(citizen.registrationTime || citizen[4]) > 0;

      if (!isRegistered) {
        alert("This person is not a registered citizen. They must register first.");
      } else {
        const newList = [...employees, { 
          address: targetAddr, 
          salary: newEmployeeSalary,
          name: citizen.fullName || citizen[0],
          isVerified: citizen.isVerifiedByAdmin || citizen[3]
        }];
        saveEmployees(newList);
        setNewEmployeeAddr('');
        setNewEmployeeSalary('');
      }
    } catch (err) {
      console.error(err);
      alert("Error adding employee. Please check the ID/Address and try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const submitWithholding = async (empAddr: string, salary: string) => {
    if (!staticTaxHandlerContract) return;
    setIsProcessing(true);
    try {
      const salaryWei = ethers.parseEther(salary);
      const taxWei = await staticTaxHandlerContract.calculateTax(salaryWei);
      
      const tx = await staticTaxHandlerContract.employerWithhold(empAddr, salaryWei, { value: taxWei });
      await tx.wait();
      alert(`Tax withholding successful for ${empAddr}!`);
    } catch (error: any) {
      console.error(error);
      alert(error.reason || "Withholding failed. Ensure you have the EMPLOYER_ROLE.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return <div className="p-8 text-white">Loading Portal...</div>;

  if (!isEmployer) {
    return (
      <div className="min-h-screen bg-[#0a0f1d] flex flex-col items-center justify-center p-8 text-center">
        <div className="bg-red-500/10 border border-red-500/20 p-12 rounded-3xl max-w-md">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-4">Access Denied</h1>
          <p className="text-government-400 mb-8">
            Your account is not registered as an authorized Employer. 
            Please contact the Ministry of Finance to obtain the Employer Role.
          </p>
          <div className="p-4 bg-government-800 rounded-xl text-xs font-mono text-government-500 break-all mb-8">
            Req Address: {address}
          </div>
          <button 
            onClick={() => window.history.back()}
            className="px-8 py-3 bg-government-800 hover:bg-government-700 text-white rounded-xl font-bold transition-all"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-12">
          <div className="p-3 bg-blue-500/20 rounded-2xl">
            <Building2 className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <h1 className="text-4xl font-bold">Employer Portal</h1>
            <p className="text-government-400">Corporate Tax Withholding & Payroll Management</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Add Employee Form */}
          <div className="bg-government-900/40 p-8 rounded-3xl border border-government-800 h-fit">
            <div className="flex items-center gap-3 mb-6">
              <Users className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl font-bold">Onboard Employee</h2>
            </div>
            <div className="space-y-4">
              <input 
                type="text"
                placeholder="Wallet Address or 16-digit Fayda ID"
                value={newEmployeeAddr}
                onChange={(e) => setNewEmployeeAddr(e.target.value)}
                className="w-full p-3 bg-government-800/50 rounded-xl border border-government-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input 
                type="number"
                placeholder="Monthly Salary (ETH)"
                value={newEmployeeSalary}
                onChange={(e) => setNewEmployeeSalary(e.target.value)}
                className="w-full p-3 bg-government-800/50 rounded-xl border border-government-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button 
                onClick={addEmployee}
                disabled={isProcessing || !newEmployeeAddr || !newEmployeeSalary}
                className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-xl font-bold transition-all"
              >
                Add to Payroll
              </button>
            </div>
          </div>

          {/* Employee List */}
          <div className="lg:col-span-2 bg-government-900/40 p-8 rounded-3xl border border-government-800">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <Receipt className="w-6 h-6 text-ethiopia-green" />
                <h2 className="text-xl font-bold">Active Payroll</h2>
              </div>
              <span className="text-xs text-government-500 font-bold uppercase tracking-widest">{employees.length} Employees</span>
            </div>

            <div className="space-y-4">
              {employees.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-government-800 rounded-3xl">
                  <p className="text-government-500">No employees added yet.</p>
                </div>
              ) : (
                employees.map((emp, i) => (
                  <div key={i} className="flex flex-wrap items-center justify-between p-4 bg-government-800/30 rounded-2xl border border-government-700 gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-government-700 flex items-center justify-center font-bold text-blue-400">
                        {emp.name[0]}
                      </div>
                      <div>
                        <p className="font-bold">{emp.name}</p>
                        <p className="text-xs text-government-500 font-mono">{emp.address.substring(0, 16)}...</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs text-government-500 uppercase font-bold">Salary</p>
                        <p className="font-black text-white">Ξ {emp.salary}</p>
                      </div>
                      <button 
                        onClick={() => submitWithholding(emp.address, emp.salary)}
                        disabled={isProcessing || !emp.isVerified}
                        className="flex items-center gap-2 px-4 py-2 bg-ethiopia-green/10 hover:bg-ethiopia-green/20 text-ethiopia-green rounded-lg text-sm font-bold transition-all border border-ethiopia-green/20"
                      >
                        <Send className="w-4 h-4" />
                        Withhold Tax
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployerPortal;
