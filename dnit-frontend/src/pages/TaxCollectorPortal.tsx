import React, { useState } from 'react';
import useWallet from '../hooks/useWallet';
import { Search, Landmark, FileText, CheckCircle2, XCircle, Clock, ShieldCheck } from 'lucide-react';
import { ethers } from 'ethers';

const TaxCollectorPortal = () => {
  const { nationalIdentityContract, staticTaxHandlerContract, loading } = useWallet();
  const [searchAddress, setSearchAddress] = useState('');
  const [citizenData, setCitizenData] = useState<any>(null);
  const [taxData, setTaxData] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ethers.isAddress(searchAddress)) {
      setError('Invalid Ethereum address format');
      return;
    }

    setIsSearching(true);
    setError('');
    setCitizenData(null);
    setTaxData(null);

    try {
      if (nationalIdentityContract && staticTaxHandlerContract) {
        // Fetch Identity Data
        const citizen = await nationalIdentityContract.citizens(searchAddress);
        const regTime = citizen.registrationTime !== undefined ? citizen.registrationTime : citizen[4];
        
        if (Number(regTime) === 0) {
          setError('No identity record found for this address.');
        } else {
          // Handle ethers v6 struct return for citizen
          setCitizenData({
            fullName: citizen.fullName || citizen[0],
            faydaHash: citizen.faydaHash || citizen[1],
            isFaydaVerified: citizen.isFaydaVerified !== undefined ? citizen.isFaydaVerified : citizen[2],
            isVerifiedByAdmin: citizen.isVerifiedByAdmin !== undefined ? citizen.isVerifiedByAdmin : citizen[3],
            registrationTime: regTime
          });
          
          // Fetch Tax Data
          const record = await staticTaxHandlerContract.taxRecords(searchAddress);
          const recordExists = record.exists !== undefined ? record.exists : record[3];
          
          if (recordExists) {
            setTaxData({
              exists: true,
              totalIncome: record.totalIncome !== undefined ? record.totalIncome : record[0],
              totalTaxPaid: record.totalTaxPaid !== undefined ? record.totalTaxPaid : record[1],
              lastFilingDate: record.lastFilingDate !== undefined ? record.lastFilingDate : record[2]
            });
          } else {
            setTaxData({ exists: false, totalTaxPaid: 0n, totalIncome: 0n });
          }
        }
      }
    } catch (err) {
      console.error('Search error:', err);
      setError('An error occurred during verification.');
    } finally {
      setIsSearching(false);
    }
  };

  const getComplianceStatus = () => {
    if (!citizenData) return null;
    if (!citizenData.isFaydaVerified || !citizenData.isVerifiedByAdmin) {
      return { label: 'Incomplete Verification', color: 'text-yellow-500', icon: <Clock className="w-5 h-5" /> };
    }
    if (!taxData || !taxData.exists) return { label: 'Non-Compliant', color: 'text-red-500', icon: <XCircle className="w-5 h-5" /> };
    return { label: 'Tax Compliant', color: 'text-green-500', icon: <CheckCircle2 className="w-5 h-5" /> };
  };

  const status = getComplianceStatus();

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-12">
          <div className="p-3 bg-ethiopia-yellow/20 rounded-2xl">
            <Landmark className="w-8 h-8 text-ethiopia-yellow" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white">Tax Collector Portal</h1>
            <p className="text-government-400">Official Payment Verification & Compliance Interface</p>
          </div>
        </div>

        {/* Search Section */}
        <div className="bg-government-900/40 p-8 rounded-3xl border border-government-800 backdrop-blur-xl mb-8">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-government-500 w-5 h-5" />
              <input 
                type="text"
                placeholder="Enter Citizen Wallet Address (0x...)"
                value={searchAddress}
                onChange={(e) => setSearchAddress(e.target.value)}
                className="w-full p-4 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-yellow focus:outline-none transition-all pl-12"
              />
            </div>
            <button 
              type="submit"
              disabled={isSearching || !searchAddress}
              className="px-8 py-4 bg-ethiopia-yellow hover:bg-yellow-600 disabled:opacity-50 text-government-950 font-bold rounded-xl transition-all shadow-lg shadow-yellow-900/20"
            >
              {isSearching ? 'Verifying...' : 'Verify Citizen'}
            </button>
          </form>
          {error && <p className="mt-4 text-red-500 text-sm font-medium">{error}</p>}
        </div>

        {/* Results Section */}
        {citizenData && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Identity Info */}
              <div className="md:col-span-2 bg-government-900/40 p-8 rounded-3xl border border-government-800">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-sm font-bold text-government-500 uppercase tracking-widest mb-1">Citizen Details</h3>
                    <p className="text-2xl font-bold">{citizenData.fullName}</p>
                    <p className="text-xs text-government-500 font-mono mt-1">{searchAddress}</p>
                  </div>
                  {status && (
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 ${status.color}`}>
                      {status.icon}
                      <span className="text-sm font-bold uppercase">{status.label}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-8 py-6 border-t border-government-800">
                  <div>
                    <p className="text-xs text-government-500 uppercase font-bold mb-1">Registration Date</p>
                    <p className="font-medium">{new Date(Number(citizenData.registrationTime) * 1000).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-government-500 uppercase font-bold mb-1">Fayda ID Hash</p>
                    <p className="font-mono text-xs text-government-400">{citizenData.faydaHash.substring(0, 20)}...</p>
                  </div>
                </div>
              </div>

              {/* Quick Summary */}
              <div className="bg-government-900/40 p-8 rounded-3xl border border-government-800 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-government-500 uppercase tracking-widest mb-4">Total Contribution</h3>
                  <div className="flex items-center gap-3">
                    <FileText className="w-10 h-10 text-ethiopia-yellow" />
                    <div>
                      <p className="text-3xl font-black text-white">Ξ {taxData?.exists ? ethers.formatEther(taxData.totalTaxPaid) : '0.00'}</p>
                      <p className="text-xs text-government-500">Lifetime Tax Paid</p>
                    </div>
                  </div>
                </div>
                
                <button 
                  className="mt-8 w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                  onClick={() => window.print()}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Issue Certificate
                </button>
              </div>
            </div>

            {/* Detailed Tax History Placeholder */}
            <div className="bg-government-900/40 p-8 rounded-3xl border border-government-800">
              <h3 className="text-xl font-bold mb-6">Declaration History</h3>
              <div className="space-y-4">
                {taxData?.exists ? (
                  <div className="flex justify-between items-center p-4 bg-government-800/30 rounded-xl border border-government-700">
                    <div>
                      <p className="text-sm text-government-400">Last Payment Date</p>
                      <p className="font-bold">{new Date(Number(taxData.lastFilingDate) * 1000).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-government-400">Income Declared</p>
                      <p className="font-bold text-ethiopia-blue">Ξ {ethers.formatEther(taxData.totalIncome)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-government-500">
                    No payment records found for this verified identity.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaxCollectorPortal;
