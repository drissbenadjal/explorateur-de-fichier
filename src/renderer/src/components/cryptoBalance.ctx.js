import { createContext } from 'react'

export const CryptoBalanceContext = createContext({
  loading: false,
  ready: false,
  error: null,
  balances: null,
  eth: { address: null, balance: null, network: 'sepolia', rpcUrl: 'https://rpc.sepolia.org' },
  sol: { address: null, balance: null, network: 'devnet' },
  setNetworks: () => {},
  refresh: async () => {},
  ensureWalletPrepared: async () => {}
})
