export const CONTRACT_ADDRESSES = {
  sepolia: {
    nationalIdentity: "0xd8bc12e4257998767798431ABA22cBC69069e13e",
    staticTaxHandler: "0x5720a110e0eceb277a289C5Bf478a0C69f0DAB08"
  },
  hardhat: {
    nationalIdentity: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    staticTaxHandler: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
  }
};

export const getContractAddress = (chainId: number, contractName: 'nationalIdentity' | 'staticTaxHandler') => {
  const network = chainId === 11155111 ? 'sepolia' : 'hardhat';
  return CONTRACT_ADDRESSES[network][contractName];
};

// Pilot role-wallets used for UI fallback when on-chain role checks fail
// (e.g., contract addresses not updated yet, or roles not granted on Sepolia).
export const ROLE_ADDRESSES = {
  admin: "0x2646C40E21f8ef7637e3cD7AB6e33730Fba3C1A5",
  employer: "0x2d06fb81C36D325c26E90a485598aA5f2d05B3dB",
  taxCollector: "0x487C04EBF0c20F05009Adf9e7103644a66D1A3Ef",
} as const;
