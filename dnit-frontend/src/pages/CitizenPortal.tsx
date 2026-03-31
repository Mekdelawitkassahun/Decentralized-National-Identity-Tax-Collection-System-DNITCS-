import React, { useState, useEffect } from 'react';
import useWallet from '../hooks/useWallet';
import { User, FileText, CreditCard, CheckCircle2, Clock, Landmark } from 'lucide-react';
import { ethers } from 'ethers';

const CitizenPortal = () => {
  const { address, nationalIdentityContract, staticTaxHandlerContract, balance } = useWallet();
  const [fullName, setFullName] = useState('');
  const [faydaNumber, setFaydaNumber] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [isFaydaVerified, setIsFaydaVerified] = useState(false);
  const [isAdminVerified, setIsAdminVerified] = useState(false);
  const [income, setIncome] = useState('');
  const [calculatedTax, setCalculatedTax] = useState('0');
  const [isProcessing, setIsProcessing] = useState(false);
  const [taxRecord, setTaxRecord] = useState<any>(null);

  const isAffordable = Number(balance) >= Number(calculatedTax);

  const checkStatus = async () => {
    if (address && nationalIdentityContract && staticTaxHandlerContract) {
      try {
        const citizen = await nationalIdentityContract.citizens(address);
        setIsRegistered(Number(citizen.registrationTime) > 0);
        setIsFaydaVerified(citizen.isFaydaVerified);
        setIsAdminVerified(citizen.isVerifiedByAdmin);

        if (citizen.isFaydaVerified && citizen.isVerifiedByAdmin) {
          const record = await staticTaxHandlerContract.taxRecords(address);
          if (record.exists) {
            setTaxRecord(record);
          }
        }
      } catch (error) {
        console.error("Could not check citizen status:", error);
      }
    }
  };

  useEffect(() => {
    checkStatus();
  }, [address, nationalIdentityContract, staticTaxHandlerContract]);

  useEffect(() => {
    const calc = async () => {
      if (staticTaxHandlerContract && income) {
        try {
          const amountInWei = ethers.parseEther(income);
          const taxInWei = await staticTaxHandlerContract.calculateTax(amountInWei);
          setCalculatedTax(ethers.formatEther(taxInWei));
        } catch (e) {
          setCalculatedTax('0');
        }
      } else {
        setCalculatedTax('0');
      }
    };
    calc();
  }, [income, staticTaxHandlerContract]);

  const handleRegister = async () => {
    if (nationalIdentityContract && fullName && faydaNumber) {
      if (!/^\d{16}$/.test(faydaNumber)) {
        return alert("Please enter a valid 16-digit Fayda ID");
      }
      setIsProcessing(true);
      try {
        const tx = await nationalIdentityContract.registerWithFayda(fullName, faydaNumber);
        await tx.wait();
        alert('Registration successful! Awaiting Fayda verification.');
        await checkStatus();
      } catch (error) {
        console.error("Registration failed:", error);
        alert('Registration failed. Make sure you have Sepolia ETH.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handlePayTax = async () => {
    if (staticTaxHandlerContract && income) {
      setIsProcessing(true);
      try {
        const amountInWei = ethers.parseEther(income);
        const taxInWei = await staticTaxHandlerContract.calculateTax(amountInWei);
        
        const tx = await staticTaxHandlerContract.payTax(amountInWei, { value: taxInWei });
        await tx.wait();
        alert('Tax payment successful!');
        await checkStatus();
        setIncome('');
      } catch (error: any) {
        console.error("Tax payment failed:", error);
        alert('Payment failed. Ensure you are fully verified (Fayda + Admin).');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-12">
          <div className="p-3 bg-ethiopia-green/20 rounded-2xl">
            <User className="w-8 h-8 text-ethiopia-green" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white">Citizen Portal</h1>
            <p className="text-government-400">Manage your National Identity & Tax Obligations</p>
          </div>
        </div>

        {!isRegistered ? (
          <div className="space-y-8">
            <div className="bg-government-900/40 p-8 rounded-3xl border border-ethiopia-green/30 backdrop-blur-xl">
              <div className="flex items-center gap-3 mb-6">
                <Landmark className="w-6 h-6 text-ethiopia-green" />
                <h2 className="text-2xl font-bold">Fayda ID Registration</h2>
              </div>
              <p className="text-government-400 mb-8">Link your Ethiopian Fayda National ID to your digital wallet. Each wallet address can register as one unique citizen.</p>
              
              <div className="space-y-6 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-government-300 mb-2">Full Legal Name</label>
                  <input 
                    type="text"
                    placeholder="e.g. Abebe Bikila"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full p-4 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-green focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-government-300 mb-2">16-Digit Fayda Number</label>
                  <input 
                    type="text"
                    maxLength={16}
                    placeholder="1234567890123456"
                    value={faydaNumber}
                    onChange={(e) => setFaydaNumber(e.target.value.replace(/\D/g, ''))}
                    className="w-full p-4 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-green focus:outline-none transition-all"
                  />
                </div>
                <button 
                  onClick={handleRegister}
                  disabled={isProcessing || !fullName || faydaNumber.length !== 16}
                  className="w-full p-4 bg-ethiopia-green hover:bg-green-700 disabled:opacity-50 rounded-xl font-bold text-lg transition-all"
                >
                  {isProcessing ? "Processing..." : "Register with Fayda"}
                </button>
              </div>
            </div>

            <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
              <p className="text-sm text-blue-400 font-bold mb-2">💡 Pro-Tip: Testing Multiple Citizens</p>
              <p className="text-xs text-government-400">
                To register another person, simply **switch to a different account** in your MetaMask wallet. 
                The portal will automatically update to show the registration form for the new account.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-government-900/40 p-6 rounded-2xl border border-government-800">
                <p className="text-government-500 text-xs uppercase tracking-widest mb-4 font-bold">Verification Pipeline</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Fayda System:</span>
                    {isFaydaVerified ? (
                      <span className="text-ethiopia-green flex items-center gap-1 font-bold"><CheckCircle2 className="w-4 h-4" /> Verified</span>
                    ) : (
                      <span className="text-yellow-500 flex items-center gap-1 font-bold"><Clock className="w-4 h-4" /> Pending</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Government Admin:</span>
                    {isAdminVerified ? (
                      <span className="text-ethiopia-green flex items-center gap-1 font-bold"><CheckCircle2 className="w-4 h-4" /> Approved</span>
                    ) : (
                      <span className="text-yellow-500 flex items-center gap-1 font-bold"><Clock className="w-4 h-4" /> Awaiting</span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="bg-government-900/40 p-6 rounded-2xl border border-government-800">
                <p className="text-government-500 text-xs uppercase tracking-widest mb-4 font-bold">Tax History</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">Ξ {taxRecord ? ethers.formatEther(taxRecord.totalTaxPaid) : '0.00'}</p>
                    <p className="text-xs text-government-500">Total Tax Paid</p>
                  </div>
                  <FileText className="w-8 h-8 text-government-700" />
                </div>
              </div>
            </div>

            <div className={`bg-government-900/40 p-8 rounded-3xl border ${isFaydaVerified && isAdminVerified ? 'border-ethiopia-blue/30' : 'border-government-800 opacity-50'}`}>
              <div className="flex items-center gap-3 mb-6">
                <CreditCard className="w-6 h-6 text-ethiopia-blue" />
                <h2 className="text-2xl font-bold">Annual Tax Filing</h2>
              </div>
              
              {!(isFaydaVerified && isAdminVerified) && (
                <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-500 text-sm">
                  Your identity must be verified by both Fayda and government administrator before you can file taxes.
                </div>
              )}

              <div className="max-w-md space-y-6">
                <div>
                  <label className="block text-sm font-medium text-government-300 mb-2">Declare Annual Income (ETH)</label>
                  <div className="relative">
                    <input 
                      type="number"
                      disabled={!(isFaydaVerified && isAdminVerified) || isProcessing}
                      placeholder="0.00"
                      value={income}
                      onChange={(e) => setIncome(e.target.value)}
                      className="w-full p-4 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-blue focus:outline-none transition-all pl-10"
                    />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-government-500 font-bold">Ξ</span>
                  </div>
                </div>

                {income && (
                  <div className={`p-4 rounded-xl border ${isAffordable ? 'bg-ethiopia-blue/10 border-ethiopia-blue/20' : 'bg-red-500/10 border-red-500/20'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-government-400">Calculated Tax (Progressive):</span>
                      <span className={`text-xl font-bold ${isAffordable ? 'text-ethiopia-blue' : 'text-red-500'}`}>Ξ {calculatedTax}</span>
                    </div>
                    {!isAffordable && (
                      <p className="text-xs text-red-500 mt-2 font-bold uppercase tracking-wider">
                        Warning: This exceeds your current balance of Ξ {Number(balance).toFixed(4)}
                      </p>
                    )}
                  </div>
                )}

                <button 
                  onClick={handlePayTax}
                  disabled={!(isFaydaVerified && isAdminVerified) || isProcessing || !income || !isAffordable}
                  className="w-full p-4 bg-ethiopia-blue hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-lg shadow-lg shadow-blue-900/20 transition-all"
                >
                  {isProcessing ? "Processing Transaction..." : (isAffordable ? "File & Pay Tax" : "Insufficient Funds")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CitizenPortal;
