import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import useWallet from '../hooks/useWallet';
import { Building2, ShieldAlert, Users, Receipt, Send, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

type EmployeeRow = {
  wallet: string;
  taxCategory: number;
  autoApproved: boolean;
  isRegistered: boolean;
};

const EmployerPortal = () => {
  const { address, nationalIdentityContract, staticTaxHandlerContract, isEmployer, loading } = useWallet();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [newEmployeeAddr, setNewEmployeeAddr] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState('');

  const taxCatLabel = (cat: number) => {
    if (cat === 0) return 'Government';
    if (cat === 1) return 'Category A';
    if (cat === 2) return 'Category B';
    return 'Micro';
  };

  useEffect(() => {
    if (!address) return;
    const saved = localStorage.getItem(`employees_${address}`);
    if (saved) setEmployees(JSON.parse(saved));
  }, [address]);

  const saveEmployees = (list: EmployeeRow[]) => {
    setEmployees(list);
    if (address) localStorage.setItem(`employees_${address}`, JSON.stringify(list));
  };

  const loadEmployeeStatus = async (wallet: string): Promise<EmployeeRow> => {
    if (!nationalIdentityContract) throw new Error('Missing identity contract');
    let isRegistered = false;
    try {
      const citizen = await nationalIdentityContract.getCitizenPublic(wallet);
      const registrationTime = Number(citizen[5]);
      isRegistered = registrationTime > 0;
    } catch {
      isRegistered = false;
    }
    if (!isRegistered) {
      throw new Error('Employee must register as a citizen first.');
    }
    const autoApproved = await nationalIdentityContract.isAutoApprovedCitizen(wallet);
    const taxCategory = await nationalIdentityContract.taxCategoryOf(wallet);
    return { wallet, taxCategory: Number(taxCategory), autoApproved: !!autoApproved, isRegistered };
  };

  const addEmployee = async () => {
    setMessage('');
    if (!nationalIdentityContract) return;
    if (!newEmployeeAddr.trim()) return;
    if (!ethers.isAddress(newEmployeeAddr.trim())) return alert('Enter a valid employee wallet address.');

    const wallet = ethers.getAddress(newEmployeeAddr.trim());
    if (employees.some((e) => e.wallet.toLowerCase() === wallet.toLowerCase())) {
      setMessage('Employee already added.');
      return;
    }

    setIsProcessing(true);
    try {
      const row = await loadEmployeeStatus(wallet);
      if (!row.autoApproved) {
        alert('Employee is registered but not auto-approved yet.');
        return;
      }
      saveEmployees([...employees, row]);
      setNewEmployeeAddr('');
    } catch (e: any) {
      setMessage(e?.message || 'Failed to add employee');
    } finally {
      setIsProcessing(false);
    }
  };

  const withhold = async (employee: string) => {
    if (!staticTaxHandlerContract || !nationalIdentityContract) return;
    setMessage('');

    setIsProcessing(true);
    try {
      const dueWei = await staticTaxHandlerContract.taxDueNow(employee);
      if (dueWei <= 0n) throw new Error('No tax due for this employee (yet).');

      const tx = await staticTaxHandlerContract.employerWithhold(employee, { value: dueWei });
      await tx.wait();
      setMessage('Withholding confirmed.');
    } catch (e: any) {
      setMessage(e?.reason || e?.message || 'Withholding failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const canShow = loading ? false : true;

  if (!canShow) return <div className="p-8 text-white">Loading Employer Portal...</div>;

  if (!isEmployer) {
    return (
      <div className="min-h-screen bg-[#0a0f1d] flex flex-col items-center justify-center p-8 text-center">
        <div className="bg-red-500/10 border border-red-500/20 p-12 rounded-3xl max-w-md">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-4">Access Denied</h1>
          <p className="text-government-400 mb-8">Your account is not registered as an authorized Employer.</p>
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
    <div className="min-h-screen bg-[#0a0f1d] text-white p-6 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/20 rounded-2xl">
              <Building2 className="w-7 h-7 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">Employer Portal</h1>
              <p className="text-government-400">Payroll withholding with auto-calculated category taxes.</p>
            </div>
          </div>
          <div className="text-xs text-government-500 font-mono break-all">
            {address ? `Employer: ${address.slice(0, 10)}...` : ''}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-government-900/40 p-7 rounded-3xl border border-government-800 h-fit">
            <div className="flex items-center gap-3 mb-5">
              <Users className="w-6 h-6 text-blue-400" />
              <h2 className="text-2xl font-bold">Add Employee</h2>
            </div>

            <input
              type="text"
              placeholder="Employee wallet address"
              value={newEmployeeAddr}
              onChange={(e) => setNewEmployeeAddr(e.target.value)}
              className="w-full p-3 bg-government-800/50 rounded-xl border border-government-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />

            <button
              onClick={addEmployee}
              disabled={isProcessing || !newEmployeeAddr}
              className="mt-4 w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-xl font-bold transition-all"
            >
              Add to Payroll
            </button>

            {message && (
              <div className="mt-4 text-sm bg-white/5 border border-white/10 rounded-xl p-3">
                {message}
              </div>
            )}

            <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-xs text-government-400">
              <AlertTriangle className="w-4 h-4 inline mr-2 text-ethiopia-yellow" />
              Prototype: employers cannot submit salaries/income; taxes are computed from on-chain category data.
            </div>
          </div>

          <div className="lg:col-span-2 bg-government-900/40 p-7 rounded-3xl border border-government-800">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Receipt className="w-6 h-6 text-ethiopia-green" />
                <h2 className="text-2xl font-bold">Active Payroll</h2>
              </div>
              <span className="text-xs text-government-500 font-bold uppercase tracking-widest">{employees.length} Employees</span>
            </div>

            {employees.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-government-800 rounded-3xl">
                <p className="text-government-500">No employees added yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {employees.map((emp) => (
                  <EmployeeCard
                    key={emp.wallet}
                    emp={emp}
                    onWithhold={() => withhold(emp.wallet)}
                    staticTaxHandlerContract={staticTaxHandlerContract}
                    isProcessing={isProcessing}
                    taxCatLabel={taxCatLabel}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const EmployeeCard = ({
  emp,
  onWithhold,
  staticTaxHandlerContract,
  isProcessing,
  taxCatLabel,
}: {
  emp: EmployeeRow;
  onWithhold: () => void;
  staticTaxHandlerContract: any;
  isProcessing: boolean;
  taxCatLabel: (n: number) => string;
}) => {
  const [dueWei, setDueWei] = useState<bigint>(0n);
  const [loadingDue, setLoadingDue] = useState(false);

  const refreshDue = async () => {
    if (!staticTaxHandlerContract) return;
    setLoadingDue(true);
    try {
      const due = await staticTaxHandlerContract.taxDueNow(emp.wallet);
      setDueWei(due);
    } finally {
      setLoadingDue(false);
    }
  };

  useEffect(() => {
    refreshDue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staticTaxHandlerContract, emp.wallet]);

  return (
    <div className="p-4 bg-government-800/30 rounded-2xl border border-government-700">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-government-700 flex items-center justify-center font-bold text-blue-400">
            {emp.wallet[2] ? emp.wallet[2].toUpperCase() : 'E'}
          </div>
          <div>
            <p className="font-bold">Wallet: {emp.wallet.slice(0, 12)}...</p>
            <p className="text-xs text-government-500 font-mono mt-1">
              Category: {taxCatLabel(emp.taxCategory)}
            </p>
            <p className="text-xs text-government-400 mt-1 flex items-center gap-2">
              {emp.autoApproved ? <CheckCircle2 className="w-4 h-4 text-ethiopia-green" /> : <Clock className="w-4 h-4 text-yellow-500" />}
              {emp.autoApproved ? 'Auto-approved' : 'Not auto-approved'}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-xs text-government-500 uppercase font-bold">Tax due</p>
          <p className="font-black text-white">
            {loadingDue ? '...' : `Ξ ${ethers.formatEther(dueWei)}`}
          </p>
          <button
            onClick={onWithhold}
            disabled={isProcessing || !emp.autoApproved}
            className="mt-3 flex items-center gap-2 px-4 py-2 bg-ethiopia-green/10 hover:bg-ethiopia-green/20 disabled:opacity-50 disabled:cursor-not-allowed text-ethiopia-green rounded-lg text-sm font-bold transition-all border border-ethiopia-green/20"
          >
            <Send className="w-4 h-4" />
            Withhold Tax
          </button>
          <div className="text-[11px] text-government-500 mt-2">
            Due is computed from on-chain category (no salary input).
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployerPortal;

