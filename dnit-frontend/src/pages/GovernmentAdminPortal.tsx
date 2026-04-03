import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import useWallet from '../hooks/useWallet';
import { ShieldCheck, CheckCircle2, Clock, BarChart3, Users, ListChecks, Settings, UserPlus } from 'lucide-react';

type PendingRow = {
  wallet: string;
  fullName: string;
  taxCategory: number;
  age: number;
  isFaydaVerified: boolean;
  isAutoApproved: boolean;
  needsManualReview: boolean;
};

const GovernmentAdminPortal = () => {
  const { address, nationalIdentityContract, staticTaxHandlerContract, isAdmin, loading } = useWallet();
  const [queue, setQueue] = useState<PendingRow[]>([]);
  const [allCitizens, setAllCitizens] = useState<PendingRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [stats, setStats] = useState({ totalCollectedWei: 0n, totalAuto: 0, totalManual: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewMode, setViewMode] = useState<'pending' | 'all'>('pending');

  const [grantTarget, setGrantTarget] = useState<string>('');
  const [grantRole, setGrantRole] = useState<'admin' | 'employer' | 'taxCollector'>('employer');
  const [grantMsg, setGrantMsg] = useState<string>('');

  const taxCatLabel = (cat: number) => {
    if (cat === 0) return 'Government';
    if (cat === 1) return 'Category A';
    if (cat === 2) return 'Category B';
    return 'Micro';
  };

  const loadData = async () => {
    if (!nationalIdentityContract || !staticTaxHandlerContract || !isAdmin) return;

    const all = await nationalIdentityContract.getAllCitizens();
    const rows: PendingRow[] = [];

    let autoCount = 0;
    let manualCount = 0;
    for (const wallet of all) {
      const c = await nationalIdentityContract.getCitizenAdmin(wallet);
      const [
        fullName,
        _faydaHash,
        taxCategory,
        age,
        isFaydaVerified,
        _isOnSanctionsList,
        isAutoApproved,
        needsManualReview,
        _approvalTimestamp,
        _registrationTime,
      ] = c;

      const row: PendingRow = {
        wallet,
        fullName,
        taxCategory: Number(taxCategory),
        age: Number(age),
        isFaydaVerified: !!isFaydaVerified,
        isAutoApproved: !!isAutoApproved,
        needsManualReview: !!needsManualReview,
      };

      if (row.isAutoApproved) autoCount++;
      if (row.needsManualReview) manualCount++;

      rows.push(row);
    }

    const collected = await staticTaxHandlerContract.totalTaxCollected();
    setStats({
      totalCollectedWei: collected,
      totalAuto: autoCount,
      totalManual: manualCount,
    });

    const pending = rows.filter((r) => r.needsManualReview);
    setAllCitizens(rows);
    setQueue(pending);
    setSelected({});
  };

  useEffect(() => {
    if (!loading) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAdmin, nationalIdentityContract, staticTaxHandlerContract]);

  const pendingWallets = useMemo(() => queue.map((q) => q.wallet), [queue]);

  const batchApprove = async () => {
    if (!nationalIdentityContract) return;
    const targets = pendingWallets.filter((w) => selected[w]);
    if (targets.length === 0) return;

    setIsProcessing(true);
    try {
      await nationalIdentityContract.batchManualApprove(targets);
      await loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  const batchReject = async () => {
    if (!nationalIdentityContract) return;
    const targets = pendingWallets.filter((w) => selected[w]);
    if (targets.length === 0) return;

    setIsProcessing(true);
    try {
      // Prototype: reject one-by-one (contract supports single reject).
      for (const w of targets) {
        const tx = await nationalIdentityContract.manualReject(w);
        await tx.wait();
      }
      await loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  const grantSelectedRole = async () => {
    if (!nationalIdentityContract) return;
    setGrantMsg('');
    const target = grantTarget.trim();
    if (!ethers.isAddress(target)) return setGrantMsg('Enter a valid wallet address.');

    setIsProcessing(true);
    try {
      const normalized = ethers.getAddress(target);
      const roleConst =
        grantRole === 'admin'
          ? await nationalIdentityContract.ADMIN_ROLE()
          : grantRole === 'employer'
            ? await nationalIdentityContract.EMPLOYER_ROLE()
            : await nationalIdentityContract.TAX_COLLECTOR_ROLE();

      const tx = await nationalIdentityContract.grantRole(roleConst, normalized);
      await tx.wait();
      setGrantMsg('Role granted successfully.');
      await loadData();
    } catch (e: any) {
      setGrantMsg(e?.reason || e?.message || 'Grant failed');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return <div className="p-8 text-white">Loading Admin Panel...</div>;
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a0f1d] flex flex-col items-center justify-center p-8 text-center">
        <div className="bg-red-500/10 border border-red-500/20 p-12 rounded-3xl max-w-md">
          <ShieldCheck className="w-16 h-16 text-red-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-4">Access Denied</h1>
          <p className="text-government-400 mb-8">
            Your account is not authorized as a Government Admin.
          </p>
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
            <div className="p-3 bg-ethiopia-blue/20 rounded-2xl">
              <ShieldCheck className="w-7 h-7 text-ethiopia-blue" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">Government Admin</h1>
              <p className="text-government-400">Approval queue + revenue analytics (no per-citizen tax record access).</p>
            </div>
          </div>
          <div className="text-xs text-government-500 font-mono break-all">
            Connected as: {address ? `${address.slice(0, 8)}...${address.slice(-6)}` : ''}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-government-900/40 p-7 rounded-3xl border border-government-800">
            <div className="flex items-center gap-3 mb-3">
              <Users className="w-6 h-6 text-ethiopia-green" />
              <p className="text-xs text-government-500 uppercase font-bold tracking-widest">Auto-approved</p>
            </div>
            <p className="text-4xl font-black">{stats.totalAuto}</p>
          </div>
          <div className="bg-government-900/40 p-7 rounded-3xl border border-government-800">
            <div className="flex items-center gap-3 mb-3">
              <Clock className="w-6 h-6 text-yellow-500" />
              <p className="text-xs text-government-500 uppercase font-bold tracking-widest">Manual review</p>
            </div>
            <p className="text-4xl font-black">{stats.totalManual}</p>
          </div>
          <div className="bg-government-900/40 p-7 rounded-3xl border border-government-800">
            <div className="flex items-center gap-3 mb-3">
              <BarChart3 className="w-6 h-6 text-ethiopia-yellow" />
              <p className="text-xs text-government-500 uppercase font-bold tracking-widest">Total collected</p>
            </div>
            <p className="text-3xl font-black">Ξ {ethers.formatEther(stats.totalCollectedWei)}</p>
          </div>
        </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-government-900/40 p-7 rounded-3xl border border-government-800">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <ListChecks className="w-6 h-6 text-ethiopia-blue" />
                <h2 className="text-2xl font-bold">
                  {viewMode === 'pending' ? 'Manual Review Queue' : 'All Citizens'}
                </h2>
              </div>
              <span className="text-xs text-government-500 font-bold uppercase tracking-widest">
                {viewMode === 'pending' ? `${queue.length} pending` : `${allCitizens.length} total`}
              </span>
            </div>

            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setViewMode('pending')}
                className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                  viewMode === 'pending'
                    ? 'bg-ethiopia-green/10 border-ethiopia-green/30 text-ethiopia-green'
                    : 'bg-white/5 border-white/10 text-government-300 hover:bg-white/10'
                }`}
              >
                Pending queue
              </button>
              <button
                onClick={() => setViewMode('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                  viewMode === 'all'
                    ? 'bg-ethiopia-blue/10 border-ethiopia-blue/30 text-ethiopia-blue'
                    : 'bg-white/5 border-white/10 text-government-300 hover:bg-white/10'
                }`}
              >
                View all
              </button>
            </div>

            {(
              viewMode === 'pending' ? queue : allCitizens
            ).length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-government-800 rounded-3xl">
                <p className="text-government-500">
                  {viewMode === 'pending'
                    ? 'No citizens require manual review right now.'
                    : 'No citizens found.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {(viewMode === 'pending' ? queue : allCitizens).map((c) => {
                  const showCheckbox = viewMode === 'pending';
                  return (
                    <div
                      key={c.wallet}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-government-800/30 rounded-2xl border border-government-700"
                    >
                      <div>
                        <div className="flex items-center gap-3">
                          {showCheckbox && (
                            <input
                              type="checkbox"
                              checked={!!selected[c.wallet]}
                              onChange={(e) => setSelected((p) => ({ ...p, [c.wallet]: e.target.checked }))}
                              className="w-4 h-4"
                            />
                          )}
                          <div className="font-bold">{c.fullName}</div>
                        </div>
                        <div className="text-xs text-government-500 font-mono mt-1">
                          {c.wallet.substring(0, 14)}...
                        </div>
                        <div className="text-xs text-government-400 mt-2">
                          Category: {taxCatLabel(c.taxCategory)} • Age: {c.age || 0} • Fayda: {c.isFaydaVerified ? 'Verified' : 'Not Verified'}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {c.isAutoApproved ? (
                          <span className="text-[10px] px-2 py-1 bg-ethiopia-green/10 text-ethiopia-green rounded border border-ethiopia-green/20 font-bold">
                            AUTO
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-1 bg-yellow-500/10 text-yellow-300 rounded border border-yellow-500/20 font-bold">
                            REVIEW
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-government-900/40 p-7 rounded-3xl border border-government-800 h-fit">
            <h2 className="text-2xl font-bold mb-4">Batch Actions</h2>

            <div className="space-y-3">
              <button
                onClick={batchApprove}
                disabled={isProcessing || queue.length === 0}
                className="w-full py-3 bg-ethiopia-green hover:bg-green-700 disabled:opacity-50 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Approve Selected
              </button>
              <button
                onClick={batchReject}
                disabled={isProcessing || queue.length === 0}
                className="w-full py-3 bg-red-500/15 hover:bg-red-500/25 disabled:opacity-50 rounded-xl font-bold transition-all border border-red-500/20"
              >
                Reject Selected
              </button>
            </div>

            <div className="mt-6 text-xs text-government-500">
              Prototype note: batch reject is processed one-by-one on-chain.
            </div>

            <div className="mt-8 pt-6 border-t border-government-800">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-5 h-5 text-ethiopia-blue" />
                <h3 className="text-lg font-bold">Grant Roles</h3>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  value={grantTarget}
                  onChange={(e) => setGrantTarget(e.target.value)}
                  placeholder="Target wallet address"
                  className="w-full p-3 bg-government-800/50 rounded-xl border border-government-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ethiopia-blue"
                />

                <select
                  value={grantRole}
                  onChange={(e) => setGrantRole(e.target.value as any)}
                  className="w-full p-3 bg-government-800/50 rounded-xl border border-government-700 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-ethiopia-blue"
                >
                  <option value="admin">ADMIN_ROLE</option>
                  <option value="employer">EMPLOYER_ROLE</option>
                  <option value="taxCollector">TAX_COLLECTOR_ROLE</option>
                </select>

                <button
                  onClick={grantSelectedRole}
                  disabled={isProcessing || !grantTarget.trim()}
                  className="w-full py-3 bg-ethiopia-blue hover:bg-blue-700 disabled:opacity-50 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Grant
                </button>

                {grantMsg && (
                  <div className="text-xs text-government-400 border border-white/10 rounded-xl p-3 bg-white/5">
                    {grantMsg}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GovernmentAdminPortal;

