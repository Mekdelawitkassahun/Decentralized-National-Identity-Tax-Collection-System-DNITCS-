import React, { useState, useEffect } from 'react';
import useWallet from '../hooks/useWallet';
import { Globe, TrendingUp, History, Search, PieChart, ArrowUpRight } from 'lucide-react';
import { ethers } from 'ethers';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

const TransparencyExplorer = () => {
  const { staticTaxHandlerContract, nationalIdentityContract } = useWallet();
  const [stats, setStats] = useState({ totalCollected: '0', citizenCount: '0' });
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPublicData = async () => {
      if (staticTaxHandlerContract && nationalIdentityContract) {
        try {
          // Fetch Totals
          const collected = await staticTaxHandlerContract.totalTaxCollected();
          const count = await nationalIdentityContract.getTotalCitizens();
          const addresses = await nationalIdentityContract.getAllCitizens();
          
          setStats({ 
            totalCollected: ethers.formatEther(collected), 
            citizenCount: count.toString() 
          });

          // Fetch Recent Activity via Events
          const taxPaidFilter = staticTaxHandlerContract.filters.TaxPaid();
          const withholdingFilter = staticTaxHandlerContract.filters.EmployerWithholding();
          
          // Query last 1000 blocks for activity
          const [taxPaidEvents, withholdingEvents] = await Promise.all([
            staticTaxHandlerContract.queryFilter(taxPaidFilter, -1000),
            staticTaxHandlerContract.queryFilter(withholdingFilter, -1000)
          ]);

          const allActivity = [
            ...taxPaidEvents.map((event: any) => ({
              address: event.args[0],
              amount: ethers.formatEther(event.args[1]),
              date: 'Recently', // Simplified for now as getting block timestamp requires more calls
              type: 'Income Tax',
              blockNumber: event.blockNumber
            })),
            ...withholdingEvents.map((event: any) => ({
              address: event.args[1], // Employee address
              amount: ethers.formatEther(event.args[2]),
              date: 'Withheld',
              type: 'Employer Withholding',
              blockNumber: event.blockNumber
            }))
          ];

          // Sort by block number descending and take last 5
          const sortedActivity = allActivity
            .sort((a, b) => b.blockNumber - a.blockNumber)
            .slice(0, 5);

          setRecentTransactions(sortedActivity);
        } catch (err) {
          console.error('Error fetching public data:', err);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchPublicData();
  }, [staticTaxHandlerContract, nationalIdentityContract]);

  const chartData = [
    { name: 'Education', value: 35, color: '#008810' },
    { name: 'Healthcare', value: 25, color: '#fcd116' },
    { name: 'Infrastructure', value: 20, color: '#da121a' },
    { name: 'Defense', value: 15, color: '#1e40af' },
    { name: 'Social Programs', value: 5, color: '#64748b' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-12">
          <div className="p-3 bg-government-800 rounded-2xl">
            <Globe className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold">Transparency Explorer</h1>
            <p className="text-government-400">Public Ledger of National Revenue & Allocation</p>
          </div>
        </div>

        {/* Top Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <div className="bg-government-900/40 p-8 rounded-3xl border border-government-800 backdrop-blur-md">
            <p className="text-government-500 text-xs uppercase font-bold tracking-widest mb-2">Total Tax Revenue</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-white">Ξ {stats.totalCollected}</span>
              <span className="text-ethiopia-green text-sm font-bold flex items-center gap-1">
                <TrendingUp className="w-4 h-4" /> +12%
              </span>
            </div>
          </div>
          <div className="bg-government-900/40 p-8 rounded-3xl border border-government-800 backdrop-blur-md">
            <p className="text-government-500 text-xs uppercase font-bold tracking-widest mb-2">Verified Taxpayers</p>
            <p className="text-4xl font-black text-white">{stats.citizenCount}</p>
          </div>
          <div className="bg-government-900/40 p-8 rounded-3xl border border-government-800 backdrop-blur-md">
            <p className="text-government-500 text-xs uppercase font-bold tracking-widest mb-2">System Uptime</p>
            <p className="text-4xl font-black text-ethiopia-green">99.99%</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Allocation Chart */}
          <div className="bg-government-900/40 p-8 rounded-3xl border border-government-800 backdrop-blur-md">
            <div className="flex items-center gap-3 mb-8">
              <PieChart className="w-6 h-6 text-ethiopia-blue" />
              <h2 className="text-2xl font-bold">Revenue Allocation</h2>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <YAxis hide />
                  <Tooltip 
                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                    contentStyle={{backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px'}}
                  />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-8">
              {chartData.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{backgroundColor: item.color}}></div>
                  <span className="text-sm text-government-400">{item.name} ({item.value}%)</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-government-900/40 p-8 rounded-3xl border border-government-800 backdrop-blur-md">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <History className="w-6 h-6 text-ethiopia-green" />
                <h2 className="text-2xl font-bold">Live Activity</h2>
              </div>
              <button className="text-sm text-ethiopia-blue font-bold flex items-center gap-1 hover:underline">
                View All <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {loading ? (
                <p className="text-center text-government-500 py-12">Loading activity...</p>
              ) : recentTransactions.length > 0 ? (
                recentTransactions.map((tx, i) => (
                  <div key={i} className="flex justify-between items-center p-4 bg-government-800/30 rounded-2xl border border-government-700">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-ethiopia-green/10 flex items-center justify-center">
                        <ArrowUpRight className="w-5 h-5 text-ethiopia-green" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">{tx.address.substring(0, 12)}...</p>
                        <p className="text-xs text-government-500">{tx.type} ΓÇó {tx.date}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-white">Ξ {tx.amount}</p>
                      <p className="text-[10px] text-ethiopia-green font-bold uppercase">Confirmed</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-government-500 py-12">No recent tax payments found.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransparencyExplorer;
