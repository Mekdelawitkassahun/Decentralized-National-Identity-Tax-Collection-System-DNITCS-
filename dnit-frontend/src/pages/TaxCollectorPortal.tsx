import React, { useMemo, useState } from 'react';
import { ethers } from 'ethers';
import useWallet from '../hooks/useWallet';
import {
  Search,
  Landmark,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  ScanFace,
} from 'lucide-react';

const TaxCollectorPortal = () => {
  const { isTaxCollector, loading, nationalIdentityContract, staticTaxHandlerContract } = useWallet();
  const [query, setQuery] = useState('');
  const [resolvedWallet, setResolvedWallet] = useState<string>('');
  const [citizen, setCitizen] = useState<any>(null);
  const [taxRecord, setTaxRecord] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string>('');

  const taxCatLabel = (cat: number) => {
    if (cat === 0) return 'Government';
    if (cat === 1) return 'Category A';
    if (cat === 2) return 'Category B';
    return 'Micro';
  };

  const compliance = useMemo(() => {
    if (!citizen) return null;
    const autoApproved = !!citizen.isAutoApproved;
    const verified = !!citizen.isFaydaVerified;
    const recordExists = !!taxRecord?.exists;
    if (!verified || !autoApproved) {
      return { label: 'Incomplete Verification', color: 'text-yellow-500', icon: <Clock className="w-5 h-5" /> };
    }
    if (!recordExists || (taxRecord?.totalTaxPaid ?? 0n) <= 0n) {
      return { label: 'Non-Compliant', color: 'text-red-500', icon: <XCircle className="w-5 h-5" /> };
    }
    return { label: 'Tax Compliant', color: 'text-green-500', icon: <CheckCircle2 className="w-5 h-5" /> };
  }, [citizen, taxRecord]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResolvedWallet('');
    setCitizen(null);
    setTaxRecord(null);

    if (!nationalIdentityContract || !staticTaxHandlerContract) return;
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      let wallet = '';

      const trimmed = query.trim();
      if (/^\d{16}$/.test(trimmed)) {
        wallet = await nationalIdentityContract.resolveWalletFromFaydaNumber(BigInt(trimmed));
      } else {
        if (!ethers.isAddress(trimmed)) throw new Error('Enter a wallet address (0x...) or 16-digit Fayda ID.');
        wallet = ethers.getAddress(trimmed);
      }

      const c = await nationalIdentityContract.getCitizenPublic(wallet);
      const [
        taxCategory,
        isFaydaVerified,
        isAutoApproved,
        needsManualReview,
        approvalTimestamp,
        registrationTime,
      ] = c;

      setCitizen({
        wallet,
        taxCategory: Number(taxCategory),
        isFaydaVerified: !!isFaydaVerified,
        isAutoApproved: !!isAutoApproved,
        needsManualReview: !!needsManualReview,
        approvalTimestamp,
        registrationTime,
      });

      const record = await staticTaxHandlerContract.getTaxRecord(wallet);
      const [exists, totalTaxPaid, lastPaymentTimestamp] = record;
      setTaxRecord({
        exists,
        totalTaxPaid,
        lastPaymentTimestamp,
      });

      setResolvedWallet(wallet);
    } catch (err: any) {
      setError(err?.message || 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  if (loading) return <div className="p-8 text-white">Loading Tax Collector Portal...</div>;
  if (!isTaxCollector) {
    return (
      <div className="min-h-screen bg-[#0a0f1d] flex flex-col items-center justify-center p-8 text-center">
        <div className="bg-red-500/10 border border-red-500/20 p-12 rounded-3xl max-w-md">
          <ShieldCheck className="w-16 h-16 text-red-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-4">Access Denied</h1>
          <p className="text-government-400 mb-8">Your account is not registered as an authorized Tax Collector.</p>
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
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-ethiopia-yellow/20 rounded-2xl">
              <Landmark className="w-7 h-7 text-ethiopia-yellow" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">Tax Collector Portal</h1>
              <p className="text-government-400">Search citizens and verify compliance status.</p>
            </div>
          </div>
        </div>

        <div className="bg-government-900/40 p-7 rounded-3xl border border-government-800 backdrop-blur-xl mb-8">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-government-500 w-5 h-5" />
              <input
                type="text"
                placeholder="Wallet address (0x...) or 16-digit Fayda ID"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full p-4 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-yellow focus:outline-none transition-all pl-12 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching || !query.trim()}
              className="sm:w-44 px-8 py-4 bg-ethiopia-yellow hover:bg-yellow-600 disabled:opacity-50 text-government-950 font-bold rounded-xl transition-all shadow-lg shadow-yellow-900/20 flex items-center justify-center gap-2"
            >
              {isSearching ? 'Verifying...' : 'Verify Citizen'}
              <ScanFace className="w-4 h-4" />
            </button>
          </form>
          {error && <p className="mt-4 text-red-500 text-sm font-medium">{error}</p>}
        </div>

        {citizen && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-government-900/40 p-7 rounded-3xl border border-government-800">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
                <div>
                  <h3 className="text-sm font-bold text-government-500 uppercase tracking-widest mb-2">Citizen</h3>
                  <p className="text-2xl font-bold">{resolvedWallet.slice(0, 14)}...</p>
                  <p className="text-xs text-government-500 font-mono mt-1">{resolvedWallet}</p>
                </div>
                {compliance && (
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 ${compliance.color}`}>
                    {compliance.icon}
                    <span className="text-sm font-bold uppercase">{compliance.label}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-6 py-4 border-t border-government-800">
                <div>
                  <p className="text-xs text-government-500 uppercase font-bold mb-1">Category</p>
                  <p className="font-medium">{taxCatLabel(citizen.taxCategory)}</p>
                </div>
                <div>
                  <p className="text-xs text-government-500 uppercase font-bold mb-1">Status</p>
                  <p className="font-medium">
                    {citizen.isAutoApproved ? 'Auto-approved' : citizen.needsManualReview ? 'Manual review' : 'Pending'}
                  </p>
                </div>
              </div>

              <div className="mt-6 bg-government-800/30 p-5 rounded-2xl border border-government-700">
                <div className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-ethiopia-yellow" />
                  <div>
                    <p className="text-xs text-government-500 uppercase tracking-widest font-bold">Payments</p>
                    <p className="text-3xl font-black text-white mt-1">
                      Ξ {ethers.formatEther(taxRecord?.totalTaxPaid ?? 0n)}
                    </p>
                    <p className="text-xs text-government-500 mt-1">
                      Last payment: {taxRecord?.exists ? new Date(Number(taxRecord.lastPaymentTimestamp) * 1000).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex gap-3">
                  <button
                    className="mt-2 flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                    onClick={() => window.print()}
                  >
                    Issue Certificate
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaxCollectorPortal;

