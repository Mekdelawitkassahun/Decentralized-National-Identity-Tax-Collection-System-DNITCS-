import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES, getContractAddress } from '../config/contracts';

const useWallet = () => {
  const [address, setAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [nationalIdentityContract, setNationalIdentityContract] = useState<ethers.Contract | null>(null);
  const [staticTaxHandlerContract, setStaticTaxHandlerContract] = useState<ethers.Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEmployer, setIsEmployer] = useState(false);
  const [balance, setBalance] = useState('0');

  const loadABIs = async () => {
    try {
      const nationalIdentityABI = await fetch('/abis/NationalIdentity.json').then(res => res.json());
      const staticTaxHandlerABI = await fetch('/abis/StaticTaxHandler.json').then(res => res.json());

      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        const bal = await provider.getBalance(address);

        setAddress(address);
        setSigner(signer);
        setBalance(ethers.formatEther(bal));

        const network = await provider.getNetwork();
        const chainId = Number(network.chainId);

        // Get sanitized addresses based on current network
        const nationalIdentityAddr = ethers.getAddress(getContractAddress(chainId, 'nationalIdentity'));
        const staticTaxHandlerAddr = ethers.getAddress(getContractAddress(chainId, 'staticTaxHandler'));

        const nationalIdentity = new ethers.Contract(
          nationalIdentityAddr,
          nationalIdentityABI.abi || nationalIdentityABI,
          signer
        );
        setNationalIdentityContract(nationalIdentity);

        const staticTaxHandler = new ethers.Contract(
          staticTaxHandlerAddr,
          staticTaxHandlerABI.abi || staticTaxHandlerABI,
          signer
        );
        setStaticTaxHandlerContract(staticTaxHandler);

        // Check Roles - ensure address is checksummed
        const checksummedAddress = ethers.getAddress(address);
        const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
        const ADMIN_ROLE = await nationalIdentity.ADMIN_ROLE();
        const EMPLOYER_ROLE = await nationalIdentity.EMPLOYER_ROLE();
        
        const [isDefaultAdmin, hasAdmin, hasEmployer] = await Promise.all([
          nationalIdentity.hasRole(DEFAULT_ADMIN_ROLE, checksummedAddress),
          nationalIdentity.hasRole(ADMIN_ROLE, checksummedAddress),
          nationalIdentity.hasRole(EMPLOYER_ROLE, checksummedAddress)
        ]);

        console.log("=== ROLE DIAGNOSTIC ===");
        console.log("Current Wallet Address:", checksummedAddress);
        console.log("Network ChainID:", chainId.toString());
        console.log("NationalIdentity Address:", nationalIdentityAddr);
        console.log("Has DEFAULT_ADMIN_ROLE:", isDefaultAdmin);
        console.log("Has ADMIN_ROLE:", hasAdmin);
        console.log("Has EMPLOYER_ROLE:", hasEmployer);
        console.log("========================");

        setIsAdmin(isDefaultAdmin || hasAdmin);
        setIsEmployer(hasEmployer);
      }
    } catch (error) {
      console.error("Failed to load ABIs or connect wallet:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadABIs();

    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length > 0) {
          loadABIs();
        } else {
          setAddress(null);
          setSigner(null);
          setNationalIdentityContract(null);
          setStaticTaxHandlerContract(null);
        }
      });
    }
  }, []);

  const connectWallet = async () => {
    try {
      if (window.ethereum) {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        await loadABIs();
      } else {
        alert("Please install MetaMask!");
      }
    } catch (error) {
      console.error("Connection failed:", error);
    }
  };

  const switchAccount = async () => {
    try {
      if (window.ethereum) {
        // This forces MetaMask to show the account selection screen
        await window.ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
        await loadABIs();
      }
    } catch (error) {
      console.error("Switch account failed:", error);
    }
  };

  const disconnectWallet = () => {
    setAddress(null);
    setSigner(null);
    setNationalIdentityContract(null);
    setStaticTaxHandlerContract(null);
    setIsAdmin(false);
    setIsEmployer(false);
    setBalance('0');
  };

  return { 
    address, 
    connectWallet, 
    switchAccount,
    disconnectWallet,
    nationalIdentityContract, 
    staticTaxHandlerContract, 
    loading,
    isAdmin,
    isEmployer,
    balance
  };
};

export default useWallet;
