import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { getContractAddress, ROLE_ADDRESSES } from '../config/contracts';

const useWallet = () => {
  const [address, setAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [nationalIdentityContract, setNationalIdentityContract] = useState<ethers.Contract | null>(null);
  const [staticTaxHandlerContract, setStaticTaxHandlerContract] = useState<ethers.Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEmployer, setIsEmployer] = useState(false);
  const [isTaxCollector, setIsTaxCollector] = useState(false);
  const [isCitizen, setIsCitizen] = useState(false);
  const [balance, setBalance] = useState('0');

  const loadABIs = async () => {
    try {
      const nationalIdentityABI = await fetch('/abis/NationalIdentity.json').then(res => res.json());
      const staticTaxHandlerABI = await fetch('/abis/StaticTaxHandler.json').then(res => res.json());

      const hasMetamask = !!window.ethereum;
      const publicRpcUrl =
        (import.meta as any).env?.VITE_PUBLIC_RPC_URL ||
        "https://ethereum-sepolia-rpc.publicnode.com";

      const provider = hasMetamask
        ? new ethers.BrowserProvider(window.ethereum)
        : new ethers.JsonRpcProvider(publicRpcUrl);

      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      // Get sanitized addresses based on current network
      const nationalIdentityAddr = ethers.getAddress(getContractAddress(chainId, 'nationalIdentity'));
      const staticTaxHandlerAddr = ethers.getAddress(getContractAddress(chainId, 'staticTaxHandler'));

      const signer = hasMetamask ? await provider.getSigner() : null;
      const address = hasMetamask ? await signer!.getAddress() : null;

      // Contract instances: read-only when no signer
      const nationalIdentity = new ethers.Contract(
        nationalIdentityAddr,
        nationalIdentityABI.abi || nationalIdentityABI,
        signer || provider
      );
      setNationalIdentityContract(nationalIdentity);

      const staticTaxHandler = new ethers.Contract(
        staticTaxHandlerAddr,
        staticTaxHandlerABI.abi || staticTaxHandlerABI,
        signer || provider
      );
      setStaticTaxHandlerContract(staticTaxHandler);

      if (hasMetamask && address && signer) {
        const bal = await provider.getBalance(address);
        setAddress(address);
        setSigner(signer);
        setBalance(ethers.formatEther(bal));

        // Role source of truth (strict wallet mapping requested by project owner):
        // ADMIN        = 0x2646C40E21f8ef7637e3cD7AB6e33730Fba3C1A5
        // EMPLOYER     = 0x2d06fb81C36D325c26E90a485598aA5f2d05B3dB
        // TAX_COLLECTOR= 0x487C04EBF0c20F05009Adf9e7103644a66D1A3Ef
        // Any other wallet is treated as a citizen UI role.
        const checksummedAddress = ethers.getAddress(address);
        const isAdminByWallet = checksummedAddress.toLowerCase() === ROLE_ADDRESSES.admin.toLowerCase();
        const isEmployerByWallet = checksummedAddress.toLowerCase() === ROLE_ADDRESSES.employer.toLowerCase();
        const isTaxCollectorByWallet = checksummedAddress.toLowerCase() === ROLE_ADDRESSES.taxCollector.toLowerCase();
        setIsAdmin(isAdminByWallet);
        setIsEmployer(isEmployerByWallet);
        setIsTaxCollector(isTaxCollectorByWallet);
        setIsCitizen(!isAdminByWallet && !isEmployerByWallet && !isTaxCollectorByWallet);
      } else {
        // No wallet connected: public read-only mode.
        setAddress(null);
        setSigner(null);
        setIsAdmin(false);
        setIsEmployer(false);
        setIsTaxCollector(false);
        setIsCitizen(false);
        setBalance('0');
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
          setIsAdmin(false);
          setIsEmployer(false);
          setIsTaxCollector(false);
          setIsCitizen(false);
        }
      });
      window.ethereum.on('chainChanged', () => loadABIs());
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
    setIsTaxCollector(false);
    setIsCitizen(false);
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
    isTaxCollector,
    isCitizen,
    balance
  };
};

export default useWallet;
