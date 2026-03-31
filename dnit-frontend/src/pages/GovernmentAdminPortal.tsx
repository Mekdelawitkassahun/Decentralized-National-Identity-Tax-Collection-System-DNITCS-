import React, { useState, useEffect } from 'react';
import useWallet from '../hooks/useWallet';
import { ShieldCheck, UserCheck, Settings, BarChart3 } from 'lucide-react';

const GovernmentAdminPortal = () => {
  const { address, nationalIdentityContract, staticTaxHandlerContract, isAdmin, loading } = useWallet();
  const [citizens, setCitizens] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalCollected: '0' });

  const loadData = async () => {
    if (nationalIdentityContract && staticTaxHandlerContract && isAdmin) {
      try {
        // Load Citizens using new methods
        const addresses = await nationalIdentityContract.getAllCitizens();
        const citizenList = [];
        
        for (const addr of addresses) {
          const data = await nationalIdentityContract.citizens(addr);
          // ethers returns struct fields as indexed properties or named properties
          // Depending on the version and ABI, we need to map them correctly
          citizenList.push({ 
            address: addr, 
            fullName: data.fullName || data[0],
            isFaydaVerified: data.isFaydaVerified !== undefined ? data.isFaydaVerified : data[2],
            isVerifiedByAdmin: data.isVerifiedByAdmin !== undefined ? data.isVerifiedByAdmin : data[3]
          });
        }
        setCitizens(citizenList);

        // Load Stats
        const collected = await staticTaxHandlerContract.totalTaxCollected();
        setStats({ totalCollected: collected.toString() });

      } catch (error) {
        console.error("Error loading admin data:", error);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [nationalIdentityContract, staticTaxHandlerContract, isAdmin]);

  const verifyIdentity = async (citizenAddr: string) => {
    if (nationalIdentityContract) {
      try {
        const tx = await nationalIdentityContract.verifyIdentity(citizenAddr);
        await tx.wait();
        alert('Citizen verified successfully!');
        loadData();
      } catch (error: any) {
        console.error("Verification failed:", error);
        alert(error.reason || "Verification failed. Ensure Fayda verification is complete.");
      }
    }
  };

  const mockFaydaVerify = async (citizenAddr: string, faydaNum: string) => {
    if (nationalIdentityContract) {
      try {
        // Ensure faydaNum is a BigInt for the contract call
        const tx = await nationalIdentityContract.verifyFaydaId(citizenAddr, BigInt(faydaNum));
        await tx.wait();
        alert('Mock Fayda verification successful!');
        loadData();
      } catch (error: any) {
        console.error("Fayda verification failed:", error);
        alert("Fayda verification failed. Check if the 16-digit ID matches the one used during registration.");
      }
    }
  };

  if (loading) return <div className="p-8 text-white">Loading Admin Panel...</div>;
  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0a0f1d] flex flex-col items-center justify-center p-8 text-center">
      <div className="bg-red-500/10 border border-red-500/20 p-12 rounded-3xl max-w-md">
        <ShieldCheck className="w-16 h-16 text-red-500 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-white mb-4">Access Denied</h1>
        <p className="text-government-400 mb-8">
          You do not have the required administrative permissions to access this portal. 
          Please ensure you are connected with an authorized government account.
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

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-white p-8">
      <div className="flex items-center gap-4 mb-12">
        <div className="p-3 bg-ethiopia-blue/20 rounded-2xl">
          <ShieldCheck className="w-8 h-8 text-ethiopia-blue" />
        </div>
        <div>
          <h1 className="text-4xl font-bold text-white">Government Admin</h1>
          <p className="text-government-400">National Identity Oversight & Revenue Analytics</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-government-900/40 p-8 rounded-3xl border border-government-800">
          <div className="flex items-center gap-3 mb-4">
            <UserCheck className="w-6 h-6 text-ethiopia-green" />
            <h2 className="text-2xl font-bold">Identity Pipeline</h2>
          </div>

          <div className="mb-6 p-4 bg-ethiopia-blue/10 border border-ethiopia-blue/20 rounded-2xl text-xs text-government-300">
            <p className="font-bold text-ethiopia-blue mb-1">Γä╣∩╕Å 2-Step Verification Guide:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Click <span className="text-ethiopia-yellow">VERIFY FAYDA</span> to simulate a biometric check against the national database.</li>
              <li>Once verified, click <span className="text-ethiopia-blue">APPROVE IDENTITY</span> for final government authorization.</li>
            </ol>
          </div>
          
          <div className="space-y-4">
            {citizens.length === 0 && <p className="text-government-500">No citizens registered yet.</p>}
            {citizens.map((c, i) => (
              <div key={i} className="p-4 bg-government-800/50 rounded-xl border border-government-700">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-bold">{c.fullName}</p>
                    <p className="text-xs text-government-500 font-mono">{c.address.substring(0, 10)}...</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {c.isFaydaVerified ? (
                      <span className="text-[10px] px-2 py-1 bg-ethiopia-green/10 text-ethiopia-green rounded border border-ethiopia-green/20 text-center font-bold">FAYDA OK</span>
                    ) : (
                      <button 
                        onClick={() => {
                          const num = prompt("Enter 16-digit Fayda Number to verify (Mock):");
                          if(num) mockFaydaVerify(c.address, num);
                        }}
                        className="text-[10px] px-2 py-1 bg-ethiopia-yellow/10 text-ethiopia-yellow rounded border border-ethiopia-yellow/20 hover:bg-ethiopia-yellow/20 font-bold"
                      >
                        VERIFY FAYDA
                      </button>
                    )}
                    
                    {c.isVerifiedByAdmin ? (
                      <span className="text-[10px] px-2 py-1 bg-ethiopia-blue/10 text-ethiopia-blue rounded border border-ethiopia-blue/20 text-center font-bold">ADMIN OK</span>
                    ) : (
                      <button 
                        disabled={!c.isFaydaVerified}
                        onClick={() => verifyIdentity(c.address)}
                        className="text-[10px] px-2 py-1 bg-ethiopia-blue/80 hover:bg-ethiopia-blue text-white rounded disabled:opacity-30 font-bold"
                      >
                        APPROVE IDENTITY
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-government-900/40 p-8 rounded-3xl border border-government-800">
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 className="w-6 h-6 text-ethiopia-yellow" />
            <h2 className="text-2xl font-bold">Revenue Analytics</h2>
          </div>
          
          <div className="p-6 bg-government-800/50 rounded-2xl border border-government-700 text-center">
            <p className="text-government-400 text-sm uppercase tracking-widest mb-2 font-bold">Total National Tax Collected</p>
            <p className="text-5xl font-black text-white">Ξ {Number(stats.totalCollected) / 1e18}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GovernmentAdminPortal;
