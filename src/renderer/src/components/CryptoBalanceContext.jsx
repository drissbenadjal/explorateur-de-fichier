import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { CryptoBalanceContext } from './cryptoBalance.ctx'

// Le contexte est défini dans cryptoBalance.ctx.js pour satisfaire react-refresh

export const CryptoBalanceProvider = ({ children }) => {
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [eth, setEth] = useState({
    address: null,
    balance: null,
    network: 'sepolia',
    rpcUrl: 'https://rpc.sepolia.org'
  })
  const [sol, setSol] = useState({ address: null, balance: null, network: 'devnet' })
  const [balances, setBalances] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  // Charger éventuelles dernières valeurs (stale) depuis localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('walletLastBalances')
      if (raw) {
        const o = JSON.parse(raw)
        if (o && typeof o === 'object') {
          if (typeof o.ETH === 'number') {
            setEth((prev) => ({ ...prev, balance: o.ETH }))
          }
          if (typeof o.SOL === 'number') {
            setSol((prev) => ({ ...prev, balance: o.SOL }))
          }
          setBalances((prev) => ({ ...(prev || {}), ETH: o.ETH ?? null, SOL: o.SOL ?? null }))
          if (o.t) setLastUpdated(o.t)
        }
      }
    } catch {
      // ignore
    }
  }, [])

  // Persister les soldes dès qu'ils sont à jour
  useEffect(() => {
    const ETHv =
      typeof eth?.balance === 'number'
        ? eth.balance
        : typeof eth?.balance === 'string' && isFinite(Number(eth.balance))
          ? Number(eth.balance)
          : null
    const SOLv = typeof sol?.balance === 'number' ? sol.balance : null
    if (ETHv != null || SOLv != null) {
      try {
        const payload = {
          ETH: ETHv,
          SOL: SOLv,
          t: Date.now()
        }
        localStorage.setItem('walletLastBalances', JSON.stringify(payload))
      } catch {
        // ignore
      }
    }
  }, [eth?.balance, sol?.balance])
  const preparePromiseRef = useRef(null)

  const setNetworks = ({ ethNetwork, rpcUrl, solNetwork } = {}) => {
    if (ethNetwork || rpcUrl) {
      setEth((e) => ({ ...e, network: ethNetwork || e.network, rpcUrl: rpcUrl || e.rpcUrl }))
    }
    if (solNetwork) {
      setSol((s) => ({ ...s, network: solNetwork }))
    }
  }

  const prepareWallet = async () => {
    setLoading(true)
    setError(null)
    try {
      // ETH: adresse + solde
      try {
        const w = await window.api?.wallet?.init?.()
        if (w?.address) {
          setEth((e) => ({ ...e, address: w.address }))
        }
      } catch {
        // capture non bloquante
      }
      try {
        const eState =
          typeof eth === 'object' ? eth : { network: 'sepolia', rpcUrl: 'https://rpc.sepolia.org' }
        const rb = await window.api?.wallet?.balance?.({
          rpcUrl: eState.rpcUrl,
          chain: eState.network
        })
        if (rb && !rb.error) {
          const nextBal =
            typeof rb.eth === 'number'
              ? rb.eth
              : typeof rb.eth === 'string' && isFinite(Number(rb.eth))
                ? Number(rb.eth)
                : null
          if (nextBal != null) setEth((prev) => ({ ...prev, balance: nextBal }))
        }
      } catch {
        // ignore
      }

      // SOL: adresse + solde
      try {
        let addr = ''
        const a = await window.api?.sol?.address?.()
        if (a?.address) addr = a.address
        if (!addr) {
          const g = await window.api?.sol?.generate?.()
          if (g?.address) addr = g.address
        }
        if (addr) setSol((s) => ({ ...s, address: addr }))
      } catch {
        // ignore
      }
      try {
        const sState = typeof sol === 'object' ? sol : { network: 'devnet' }
        const sb = await window.api?.sol?.balance?.({
          network: sState.network === 'mainnet' ? 'mainnet' : 'devnet'
        })
        if (sb && !sb.error && typeof sb.sol === 'number') {
          setSol((prev) => ({ ...prev, balance: sb.sol }))
        }
      } catch {
        // ignore
      }

      // Récap rapide balances
      setBalances((prev) => ({
        ...(prev || {}),
        ETH:
          typeof eth?.balance === 'number'
            ? eth.balance
            : typeof eth?.balance === 'string' && isFinite(Number(eth.balance))
              ? Number(eth.balance)
              : null,
        SOL: typeof sol?.balance === 'number' ? sol.balance : null
      }))

      setReady(true)
    } catch (e) {
      setError(e?.message || 'Préparation du wallet échouée')
      setReady(false)
      throw e
    } finally {
      setLoading(false)
    }
  }

  const ensureWalletPrepared = async () => {
    if (ready) return
    if (preparePromiseRef.current) return preparePromiseRef.current
    const p = prepareWallet().finally(() => {
      preparePromiseRef.current = null
    })
    preparePromiseRef.current = p
    return p
  }

  const refresh = async () => {
    setReady(false)
    return ensureWalletPrepared()
  }

  return (
    <CryptoBalanceContext.Provider
      value={{
        loading,
        ready,
        error,
        balances,
        eth,
        sol,
        setNetworks,
        refresh,
        ensureWalletPrepared,
        setEth: (updater) =>
          setEth((prev) => (typeof updater === 'function' ? updater(prev) : updater)),
        setSol: (updater) =>
          setSol((prev) => (typeof updater === 'function' ? updater(prev) : updater)),
        setBalances,
        lastUpdated,
        setLastUpdated
      }}
    >
      {children}
    </CryptoBalanceContext.Provider>
  )
}

CryptoBalanceProvider.propTypes = {
  children: PropTypes.node
}
