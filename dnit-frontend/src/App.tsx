import { useState } from 'react';
import { Link } from 'react-router-dom';
import './App.css';
import { 
  User, 
  ShieldCheck, 
  Building2, 
  Globe, 
  Wallet,
  Landmark,
  LogOut,
  Users,
  Lock
} from 'lucide-react';
import useWallet from './hooks/useWallet';

function App() {
  const { address, connectWallet, switchAccount, disconnectWallet, loading, isAdmin, isEmployer, isTaxCollector, isCitizen } = useWallet();

  const portals = [
    {
      id: 'citizen',
      name: 'Citizen Portal',
      description: 'Manage digital identity, file income taxes, and view payment receipts.',
      icon: <User className="w-8 h-8 text-ethiopia-green" />,
      color: 'border-ethiopia-green/20 hover:border-ethiopia-green',
      link: '/citizen',
      requiresRole: null
    },
    {
      id: 'admin',
      name: 'Government Admin',
      description: 'Configure tax brackets, approve identities, and view revenue analytics.',
      icon: <ShieldCheck className="w-8 h-8 text-ethiopia-blue" />,
      color: 'border-ethiopia-blue/20 hover:border-ethiopia-blue',
      link: '/admin',
      requiresRole: 'admin'
    },
    {
      id: 'collector',
      name: 'Tax Collector',
      description: 'Verify tax payments and issue compliance certificates.',
      icon: <Landmark className="w-8 h-8 text-ethiopia-yellow" />,
      color: 'border-ethiopia-yellow/20 hover:border-ethiopia-yellow',
      link: '/tax-collector',
      requiresRole: 'tax-collector'
    },
    {
      id: 'employer',
      name: 'Employer Portal',
      description: 'Submit employee withholding taxes and manage payroll integration.',
      icon: <Building2 className="w-8 h-8 text-blue-400" />,
      color: 'border-blue-400/20 hover:border-blue-400',
      link: '/employer',
      requiresRole: 'employer'
    },
    {
      id: 'transparency',
      name: 'Transparency Explorer',
      description: 'Public view of total tax collected and transaction history.',
      icon: <Globe className="w-8 h-8 text-government-400" />,
      color: 'border-government-600/20 hover:border-government-400',
      link: '/transparency',
      requiresRole: null
    }
  ];

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-white font-sans">
      {/* Ethiopian Government Header Bar */}
      <div className="h-2 w-full flex">
        <div className="h-full flex-1 bg-ethiopia-green"></div>
        <div className="h-full flex-1 bg-ethiopia-yellow"></div>
        <div className="h-full flex-1 bg-ethiopia-red"></div>
      </div>

      <nav className="border-b border-government-800 bg-government-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-ethiopia-blue rounded-full flex items-center justify-center shadow-lg shadow-ethiopia-blue/20">
              <Landmark className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">DNIT ETHIOPIA</h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-government-400 font-medium">Decentralized National Identity & Tax</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {address && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={switchAccount}
                  className="p-2 text-government-400 hover:text-ethiopia-yellow transition-colors flex items-center gap-2 text-xs font-medium"
                  title="Switch Account"
                >
                  <Users className="w-5 h-5" />
                  <span className="hidden sm:inline">Switch</span>
                </button>
                <button 
                  onClick={disconnectWallet}
                  className="p-2 text-government-400 hover:text-red-500 transition-colors flex items-center gap-2 text-xs font-medium"
                  title="Disconnect Wallet"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            )}
            <button 
              onClick={connectWallet}
              className="flex items-center gap-2 bg-ethiopia-blue hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium transition-all shadow-lg shadow-ethiopia-blue/20">
              <Wallet className="w-4 h-4" />
              {loading ? "Connecting..." : (address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : "Connect Wallet")}
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16 space-y-4">
          <div className="inline-block px-4 py-1.5 rounded-full bg-ethiopia-blue/10 border border-ethiopia-blue/20 text-ethiopia-blue text-sm font-semibold mb-4">
            Federal Democratic Republic of Ethiopia
          </div>
          <h2 className="text-5xl font-extrabold text-white sm:text-6xl tracking-tight">
            National Digital Infrastructure
          </h2>
          <p className="text-xl text-government-400 max-w-2xl mx-auto font-light leading-relaxed">
            A secure, blockchain-powered system for managing national identities and 
            automated tax collection for all citizens and businesses.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {portals.map((portal) => {
            const isLocked = (portal.requiresRole === 'admin' && !isAdmin) || 
                             (portal.requiresRole === 'employer' && !isEmployer) ||
                             (portal.requiresRole === 'tax-collector' && !isTaxCollector);
            const isCitizenPortalHiddenForPrivileged =
              portal.id === 'citizen' && !!address && !isCitizen;
            
            // If it's a role-restricted portal and the user doesn't have that role, hide it completely
            if (portal.requiresRole && isLocked) return null;
            if (isCitizenPortalHiddenForPrivileged) return null;
            
            return (
              <Link to={portal.link} key={portal.id}>
                <div 
                  className={`group relative bg-government-900/40 p-8 rounded-3xl border ${portal.color} transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl cursor-pointer overflow-hidden h-full`}
                >
                  {/* Decorative background element */}
                  <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-colors"></div>
                  
                  <div className="mb-6 p-4 rounded-2xl bg-government-800/50 w-fit group-hover:scale-110 transition-transform">
                    {portal.icon}
                  </div>
                  
                  <h3 className="text-2xl font-bold mb-3 group-hover:text-white transition-colors">
                    {portal.name}
                  </h3>
                  
                  <p className="text-government-400 leading-relaxed group-hover:text-government-300 transition-colors">
                    {portal.description}
                  </p>
                  
                  <div className="mt-8 flex items-center text-sm font-bold text-ethiopia-blue group-hover:translate-x-2 transition-transform">
                    Enter Portal <span className="ml-2">→</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* System Stats Section */}
        <div className="mt-32 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 py-12 border-y border-government-800">
          {[
            { label: 'Registered Citizens', value: '1.2M+' },
            { label: 'Total Tax Collected', value: 'Ξ 45.8K' },
            { label: 'Active Employers', value: '8.4K' },
            { label: 'System Compliance', value: '99.9%' }
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-3xl font-black text-white mb-1">{stat.value}</div>
              <div className="text-sm font-medium text-government-500 uppercase tracking-widest">{stat.label}</div>
            </div>
          ))}
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8 text-government-500">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-government-800 rounded-full flex items-center justify-center grayscale opacity-50">
              <Landmark className="w-4 h-4 text-white" />
            </div>
            <span className="font-medium text-sm">DNIT ETHIOPIA INFRASTRUCTURE</span>
          </div>
          
          <div className="flex gap-8 text-sm font-medium">
            <a href="#" className="hover:text-ethiopia-blue transition-colors">Transparency Report</a>
            <a href="#" className="hover:text-ethiopia-blue transition-colors">Legal Framework</a>
            <a href="#" className="hover:text-ethiopia-blue transition-colors">API Docs</a>
          </div>
          
          <p className="text-xs">© 2026 Ministry of Finance. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

export default App
