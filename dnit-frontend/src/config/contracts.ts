export const CONTRACT_ADDRESSES = {
  sepolia: {
    nationalIdentity: "0x462dC73596Fab24b5e4271f6018917504F818DbB",
    staticTaxHandler: "0xCd9eB25254bC0EC7Df3F911E2923e591907D01B0"
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
