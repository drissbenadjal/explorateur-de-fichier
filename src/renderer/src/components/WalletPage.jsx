import { useEffect, useState, useRef, useCallback, useContext } from 'react'
import { SiEthereum, SiSolana, SiBitcoin, SiRipple, SiTether, SiBinance } from 'react-icons/si'
import {
  FaSync,
  FaArrowUp,
  FaArrowDown,
  FaHome,
  FaDesktop,
  FaRegFileAlt,
  FaDownload,
  FaHdd,
  FaLevelUpAlt,
  FaDollarSign
} from 'react-icons/fa'
import PropTypes from 'prop-types'
import { CryptoBalanceContext } from './cryptoBalance.ctx'

export default function WalletPage({ onBack = () => {} }) {
  const {
    ready,
    eth,
    sol,
    setEth: setEthCtx,
    setSol: setSolCtx,
    setBalances: setBalancesCtx,
    setLastUpdated
  } = useContext(CryptoBalanceContext)
  const [network, setNetwork] = useState('sepolia') // 'sepolia' | 'mainnet'
  const [rpcUrl, setRpcUrl] = useState('https://rpc.sepolia.org')
  const [showRpcEdit, setShowRpcEdit] = useState(false)
  const [rpcTemp, setRpcTemp] = useState('https://rpc.sepolia.org')
  const [address, setAddress] = useState(() => eth?.address || null)
  const [balanceEth, setBalanceEth] = useState(() =>
    typeof eth?.balance === 'number' ? eth.balance : null
  )
  const [blockNumber, setBlockNumber] = useState(null)
  const [showNotif, setShowNotif] = useState(false)
  const prevBalance = useRef(null)
  const audioRef = useRef(null)
  const [gasGwei, setGasGwei] = useState(null)
  const [latency, setLatency] = useState(null)
  const [activeRpc, setActiveRpc] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [sendTo, setSendTo] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [sending, setSending] = useState(false)
  const [lastTx, setLastTx] = useState(null)
  const [txStatus, setTxStatus] = useState(null)
  const [error, setError] = useState(null)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [activity, setActivity] = useState(() => {
    try {
      const raw = localStorage.getItem('walletActivity')
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return arr
    } catch {
      // ignore parse error
    }
    return []
  })
  const [lastReceivedAmount, setLastReceivedAmount] = useState(null)
  const [priceEur, setPriceEur] = useState(null)
  const [priceChange, setPriceChange] = useState(null)
  const [priceError, setPriceError] = useState(null)
  const [priceSource, setPriceSource] = useState(null) // 'coingecko' | 'binance' | 'cache'
  const [priceCached, setPriceCached] = useState(false)
  // Prix SOL
  const [priceSolEur, setPriceSolEur] = useState(null)
  const [priceSolChange, setPriceSolChange] = useState(null)
  const [priceSolError, setPriceSolError] = useState(null)
  const [priceSolSource, setPriceSolSource] = useState(null)
  const [priceSolCached, setPriceSolCached] = useState(false)
  const [selectedCrypto, setSelectedCrypto] = useState('ETH')
  const [solNet, setSolNet] = useState('devnet')
  const [solAddress, setSolAddress] = useState('')
  const [solBalance, setSolBalance] = useState(() =>
    typeof sol?.balance === 'number' ? sol.balance : null
  )
  const [solLatency, setSolLatency] = useState(null)
  const [known, setKnown] = useState(null)
  const [drives, setDrives] = useState([])

  const loadSolBalance = useCallback(async () => {
    try {
      const t0 = Date.now()
      const b = await window.api.sol.balance({
        network: solNet === 'mainnet' ? 'mainnet' : 'devnet'
      })
      setSolLatency(Date.now() - t0)
      if (!b?.error && typeof b.sol === 'number') {
        setSolBalance(b.sol)
        // maj contexte aussi
        setSolCtx((prev) => ({ ...prev, balance: b.sol }))
        setBalancesCtx((prev) => ({ ...(prev || {}), SOL: b.sol }))
        setLastUpdated?.(Date.now())
      }
    } catch {
      // ignore
    }
  }, [solNet, setBalancesCtx, setLastUpdated, setSolCtx])

  const ensureSolAddress = useCallback(async () => {
    try {
      let addr = ''
      const a = await window.api.sol.address()
      if (a?.address) addr = a.address
      if (!addr) {
        const g = await window.api.sol.generate()
        if (g?.address) addr = g.address
      }
      if (addr) setSolAddress(addr)
    } catch {
      // ignore
    }
  }, [])

  const loadSolana = useCallback(async () => {
    await ensureSolAddress()
    await loadSolBalance()
  }, [ensureSolAddress, loadSolBalance])

  useEffect(() => {
    if (selectedCrypto === 'SOL') {
      // afficher immédiatement la valeur du contexte si dispo
      if (typeof sol?.balance === 'number') setSolBalance(sol.balance)
      // recharge en arrière-plan
      loadSolana()
    }
  }, [selectedCrypto, solNet, loadSolana, sol?.balance])

  // Charger chemins connus et lecteurs pour la sidebar (comme les autres pages)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const k = await window.api?.fs?.known?.()
        if (mounted && k) setKnown(k)
      } catch {
        // ignore
      }
      try {
        const ds = await window.api?.fs?.drives?.()
        if (mounted && Array.isArray(ds)) setDrives(ds)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  // Prix SOL via IPC + cache
  useEffect(() => {
    let cancelled = false
    const CACHE_KEY = 'walletPriceSolEur'
    const fromCache = () => {
      try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return false
        const { v, ch, t, src } = JSON.parse(raw)
        if (Date.now() - t < 1000 * 60 * 15) {
          setPriceSolEur(v)
          setPriceSolChange(ch ?? null)
          setPriceSolSource(src || 'cache')
          setPriceSolCached(true)
          return true
        }
      } catch {
        // ignore cache save
      }
      return false
    }
    const load = async () => {
      try {
        const r = await window.api?.price?.solEur?.()
        if (cancelled) return
        if (r?.error) {
          if (!fromCache()) setPriceSolError(r.error)
        } else if (r?.price != null) {
          setPriceSolEur(r.price)
          setPriceSolChange(r.change ?? null)
          setPriceSolSource(r.source)
          setPriceSolCached(false)
          setPriceSolError(null)
          try {
            localStorage.setItem(
              CACHE_KEY,
              JSON.stringify({ v: r.price, ch: r.change, t: Date.now(), src: r.source })
            )
          } catch {
            // ignore
          }
        }
      } catch {
        if (!cancelled) if (!fromCache()) setPriceSolError('Prix SOL indisponible')
      }
    }
    if (!fromCache()) load()
    const id = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const addActivity = useCallback((entry) => {
    setActivity((prev) => {
      const next = [entry, ...prev].slice(0, 5)
      try {
        localStorage.setItem('walletActivity', JSON.stringify(next))
      } catch {
        /* ignore storage error */
      }
      return next
    })
  }, [])

  const init = useCallback(async () => {
    try {
      // Si le contexte a déjà préparé l'adresse, ne pas réinitialiser
      if (eth?.address) {
        setAddress(eth.address)
        return
      }
      const w = await window.api.wallet.init()
      if (w?.address) setAddress(w.address)
    } catch (e) {
      setError(e.message || 'Init error')
    }
  }, [eth?.address])

  const fetchBalance = async () => {
    if (!address) return
    setRefreshing(true)
    try {
      const r = await window.api.wallet.balance({ rpcUrl, chain: network })
      if (!r?.error) {
        setBalanceEth(r.eth)
        // mettre à jour aussi le contexte, sans enlever l’ancienne valeur avant
        setEthCtx((prev) => ({ ...prev, balance: r.eth }))
        setBalancesCtx((prev) => ({ ...(prev || {}), ETH: r.eth }))
        setLastUpdated?.(Date.now())
        setBlockNumber(r.block ?? null)
        setGasGwei(r.gasGwei ?? null)
        setLatency(r.latency ?? null)
        setActiveRpc(r.rpcUrl || rpcUrl)
      } else {
        setError(normalizeError(r))
      }
    } catch (e) {
      setError(normalizeError(e))
    } finally {
      setRefreshing(false)
    }
  }

  const pollTx = async (hash) => {
    let attempts = 0
    const max = 20
    while (attempts < max) {
      const r = await window.api.wallet.txStatus({ hash, rpcUrl, chain: network })
      if (r?.error) {
        setError(r.error)
        break
      }
      if (!r.pending) {
        setTxStatus(r.status === 1 ? 'success' : 'failed')
        fetchBalance()
        break
      }
      await new Promise((res) => setTimeout(res, 3000))
      attempts++
    }
  }

  function isValidAddress(a) {
    return /^0x[a-fA-F0-9]{40}$/.test(a)
  }
  function normalizeError(err) {
    const msg = err?.error || err?.message || String(err)
    if (/body is not valid json/i.test(msg))
      return 'Endpoint RPC hors service (réponse invalide). Réessaie.'
    if (/rpc indisponible/i.test(msg)) return 'Tous les endpoints RPC testés ont échoué.'
    return msg
  }

  const submitSend = async () => {
    if (!sendTo || !sendAmount) {
      setError('Champs requis manquants')
      return
    }
    if (selectedCrypto === 'ETH') {
      if (!isValidAddress(sendTo.trim())) {
        setError('Adresse invalide')
        return
      }
    }
    const num = Number(sendAmount)
    if (!isFinite(num) || num <= 0) {
      setError('Montant invalide')
      return
    }
    setSending(true)
    setError(null)
    try {
      let r
      if (selectedCrypto === 'ETH') {
        r = await window.api.wallet.send({
          to: sendTo.trim(),
          amountEth: sendAmount.trim(),
          rpcUrl,
          chain: network
        })
      } else {
        r = await window.api.sol.send({
          to: sendTo.trim(),
          amountSol: sendAmount.trim(),
          network: solNet
        })
      }
      if (r?.error) {
        setError(normalizeError(r))
      } else {
        setLastTx(r.hash || r.signature)
        setTxStatus('pending')
        addActivity({
          hash: r.hash || r.signature,
          direction: 'out',
          amount: parseFloat(sendAmount),
          status: 'pending',
          ts: Date.now(),
          network: selectedCrypto === 'ETH' ? network : solNet,
          asset: selectedCrypto
        })
        setSendOpen(false)
        setSendTo('')
        setSendAmount('')
        if (selectedCrypto === 'ETH' && r.hash) pollTx(r.hash)
        if (selectedCrypto === 'SOL') setTimeout(loadSolBalance, 2000)
      }
    } catch (e) {
      setError(normalizeError(e))
    } finally {
      setSending(false)
    }
  }

  // Prix via IPC + cache local (15 min)
  useEffect(() => {
    let cancelled = false
    const CACHE_KEY = 'walletPriceEthEur'
    const fromCache = () => {
      try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return false
        const { v, ch, t, src } = JSON.parse(raw)
        if (Date.now() - t < 1000 * 60 * 15) {
          setPriceEur(v)
          setPriceChange(ch ?? null)
          setPriceSource(src || 'cache')
          setPriceCached(true)
          return true
        }
      } catch {
        // ignore parse cache
      }
      return false
    }
    const load = async () => {
      try {
        const r = await window.api.price.ethEur()
        if (cancelled) return
        if (r?.error) {
          if (!fromCache()) setPriceError(r.error)
        } else {
          setPriceEur(r.price)
          setPriceChange(r.change ?? null)
          setPriceSource(r.source)
          setPriceCached(false)
          setPriceError(null)
          try {
            localStorage.setItem(
              CACHE_KEY,
              JSON.stringify({ v: r.price, ch: r.change, t: Date.now(), src: r.source })
            )
          } catch {
            // ignore cache save
          }
        }
      } catch {
        if (!cancelled) if (!fromCache()) setPriceError('Prix indisponible')
      }
    }
    if (!fromCache()) load()
    const id = setInterval(load, 60_000)
    const force = () => load()
    window.addEventListener('forcePriceReload', force)
    return () => {
      cancelled = true
      clearInterval(id)
      window.removeEventListener('forcePriceReload', force)
    }
  }, [])

  useEffect(() => {
    // Si pas déjà prêt, init local (fallback). Sinon, l'adresse est déjà fournie.
    if (!ready) init()
  }, [ready, init])

  // Synchroniser l'adresse locale avec celle du contexte (utile au retour sur la page)
  useEffect(() => {
    if (eth?.address && eth.address !== address) {
      setAddress(eth.address)
    }
  }, [eth?.address, address])

  // Synchroniser le solde local avec celui du contexte (valeur persistée via localStorage)
  useEffect(() => {
    if (typeof eth?.balance === 'number') {
      setBalanceEth(eth.balance)
    }
  }, [eth?.balance])
  useEffect(() => {
    // À chaque entrée sur la page (mount) on relance un fetch mais on garde l’ancienne valeur affichée
    if (typeof eth?.balance === 'number') setBalanceEth(eth.balance)
    if (address) fetchBalance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  // Quand le réseau change: rafraîchir le solde sans purger l'historique local
  useEffect(() => {
    if (!address) return
    fetchBalance()
    // historique sera rechargé par l'effet history (dépend de network)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network])

  // Rafraîchissement automatique périodique du solde pour capter dépôts entrants
  useEffect(() => {
    if (!address) return
    const INTERVAL = 15000 // 15s; ajustable
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      // éviter chevauchement
      if (!refreshing) fetchBalance()
    }
    const id = setInterval(tick, INTERVAL)
    // premier tick rapide après 3s (balance peut changer juste après ouverture)
    const quick = setTimeout(tick, 3000)
    return () => {
      cancelled = true
      clearInterval(id)
      clearTimeout(quick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, network])

  // Fetch historique on-chain externe (Etherscan) au montage adresse + réseau
  useEffect(() => {
    let aborted = false
    async function loadHistory() {
      if (!address) return
      try {
        const r = await window.api.wallet.history({ address, chain: network, limit: 5 })
        if (aborted) return
        if (r?.items) {
          // Convertir en format activité interne et fusionner (sans doublons hash)
          const converted = r.items.map((tx) => ({
            hash: tx.hash,
            direction: tx.direction,
            amount: tx.valueEth,
            status: tx.confirmed ? 'confirmed' : 'pending',
            ts: tx.time,
            network: tx.chain
          }))
          setActivity((prev) => {
            const existingHashes = new Set(prev.filter((p) => p.hash).map((p) => p.hash))
            const merged = [...converted.filter((c) => !existingHashes.has(c.hash)), ...prev]
            return merged.slice(0, 5)
          })
        }
      } catch {
        // ignore erreur historique
      }
    }
    loadHistory()
    return () => {
      aborted = true
    }
  }, [address, network])

  useEffect(() => {
    if (balanceEth != null && prevBalance.current != null) {
      const prev = parseFloat(prevBalance.current)
      const now = parseFloat(balanceEth)
      if (now > prev + 1e-12) {
        const diff = now - prev
        setLastReceivedAmount(diff)
        setShowNotif(true)
        addActivity({
          hash: null, // dépôt détecté par variation de solde
          direction: 'in',
          amount: diff,
          status: 'confirmed',
          ts: Date.now(),
          network,
          asset: 'ETH'
        })
        if (audioRef.current) {
          audioRef.current.currentTime = 0
          audioRef.current.play()
        }
        setTimeout(() => setShowNotif(false), 3500)
      }
    }
    prevBalance.current = balanceEth
  }, [balanceEth, addActivity, network])
  // truncated address inutilisé dans nouveau design

  // Mise à jour statut d'une activité après confirmation
  useEffect(() => {
    if (txStatus && lastTx) {
      setActivity((prev) =>
        prev.map((a) => {
          if (a.hash === lastTx) {
            return { ...a, status: txStatus === 'success' ? 'confirmed' : 'failed' }
          }
          return a
        })
      )
    }
  }, [txStatus, lastTx])
  const safeError = error && typeof error === 'object' ? JSON.stringify(error) : error

  return (
    <div className="fe-layout minimal">
      <aside className="sidebar-app">
        <div className="side-group" style={{ paddingBottom: 4 }}>
          <button className="side-item" onClick={() => onBack()} title="Overview">
            <FaHome size={14} />
            <span>Overview</span>
          </button>
        </div>
        <div className="side-group" style={{ paddingBottom: 4 }}>
          <button className="side-item active" title="Wallet">
            <SiEthereum size={14} />
            <span>Wallet</span>
          </button>
        </div>
        <div className="side-group">
          <div className="side-group-label">Quick Access</div>
          {known && (
            <>
              <button
                className="side-item"
                onClick={() => onBack(known.home)}
                title="Ouvrir User dans l'explorateur"
              >
                <FaHome size={14} />
                <span>User</span>
              </button>
              <button
                className="side-item"
                onClick={() => onBack(known.desktop)}
                title="Ouvrir Desktop dans l'explorateur"
              >
                <FaDesktop size={14} />
                <span>Desktop</span>
              </button>
              <button
                className="side-item"
                onClick={() => onBack(known.documents)}
                title="Ouvrir Documents dans l'explorateur"
              >
                <FaRegFileAlt size={14} />
                <span>Documents</span>
              </button>
              <button
                className="side-item"
                onClick={() => onBack(known.downloads)}
                title="Ouvrir Downloads dans l'explorateur"
              >
                <FaDownload size={14} />
                <span>Downloads</span>
              </button>
            </>
          )}
          <button className="side-item" disabled>
            <FaLevelUpAlt size={14} />
            <span>Parent folder</span>
          </button>
        </div>
        <div className="side-separator" />
        <div className="side-group">
          <div className="side-group-label">Lecteurs</div>
          {drives.map((d) => (
            <button
              key={d.path}
              className="side-item"
              onClick={() => onBack(d.path)}
              title="Ouvrir dans l'explorateur"
            >
              <FaHdd size={14} />
              <span>
                {/^[A-Za-z]:/.test(d.path) ? `Disque local (${d.path[0].toUpperCase()}:)` : d.name}
              </span>
            </button>
          ))}
        </div>
      </aside>
      <main className="fe-main no-preview">
        <audio ref={audioRef} src="../../resources/eth-received.wav" preload="auto" />
        {showNotif && (
          <div
            style={{
              position: 'fixed',
              top: 28,
              right: 28,
              width: 300,
              background: '#fff',
              color: '#111',
              borderRadius: 18,
              padding: '18px 20px 20px',
              boxShadow: '0 8px 28px -4px rgba(0,0,0,.22), 0 2px 6px rgba(0,0,0,.15)',
              fontFamily: 'system-ui,Segoe UI,Roboto,sans-serif',
              zIndex: 10000,
              animation: 'fadeSlide .55s cubic-bezier(.65,.05,.36,1)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: '50%',
                  background: '#111',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <svg width="30" height="30" viewBox="0 0 256 417">
                  <path fill="#3C3C3D" d="M127.9 0L124.1 13.1v272.6l3.8 3.8 127.9-75.6z" />
                  <path fill="#8C8C8C" d="M127.9 0L0 214.1l127.9 75.6V154.2z" />
                  <path fill="#3C3C3D" d="M127.9 311.1l-2.1 2.5v80.4l2.1 6.1 128-180.3z" />
                  <path fill="#8C8C8C" d="M127.9 399.9v-88.8L0 219.8z" />
                  <path fill="#141414" d="M127.9 289.7l127.9-75.6-127.9-58.3z" />
                  <path fill="#393939" d="M0 214.1l127.9 75.6V155.8z" />
                </svg>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  Reçu&nbsp;+
                  {lastReceivedAmount != null
                    ? parseFloat(lastReceivedAmount).toFixed(6)
                    : '0.000000'}{' '}
                  Ξ
                </div>
                <div style={{ fontSize: 12, color: '#555', lineHeight: 1.25 }}>
                  Votre solde a augmenté
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => setShowNotif(false)}
                style={{
                  flex: 1,
                  background: '#111',
                  color: '#fff',
                  fontSize: 12,
                  border: 'none',
                  padding: '10px 14px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Fermer
              </button>
              <button
                onClick={() => {
                  setShowNotif(false)
                }}
                style={{
                  background: '#f2f2f2',
                  color: '#111',
                  fontSize: 12,
                  border: '1px solid #ddd',
                  padding: '10px 14px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                OK
              </button>
            </div>
            <style>{`
              @keyframes fadeSlide {0%{opacity:0;transform:translateY(-8px) scale(.96);}60%{opacity:1;}100%{opacity:1;transform:translateY(0) scale(1);}}
            `}</style>
          </div>
        )}
        {(() => {
          const tokens = [
            {
              key: 'BTC',
              label: 'Bitcoin',
              icon: <SiBitcoin size={14} />,
              balanceText: '0 BTC',
              balance: 0,
              supported: false
            },
            {
              key: 'ETH',
              label: 'Ethereum',
              icon: <SiEthereum size={14} />,
              balanceText:
                balanceEth == null ? '0 ETH' : `${parseFloat(balanceEth).toFixed(6)} ETH`,
              balance: balanceEth == null ? 0 : parseFloat(balanceEth) || 0,
              supported: true
            },
            {
              key: 'XRP',
              label: 'XRP',
              icon: <SiRipple size={14} />,
              balanceText: '0 XRP',
              balance: 0,
              supported: false
            },
            {
              key: 'USDT',
              label: 'Tether USD',
              icon: <SiTether size={14} />,
              balanceText: '0 USDT',
              balance: 0,
              supported: false
            },
            {
              key: 'BNB',
              label: 'BNB',
              icon: <SiBinance size={14} />,
              balanceText: '0 BNB',
              balance: 0,
              supported: false
            },
            {
              key: 'SOL',
              label: 'Solana',
              icon: <SiSolana size={14} />,
              balanceText: solBalance == null ? '0 SOL' : `${solBalance.toFixed(4)} SOL`,
              balance: solBalance == null ? 0 : Number(solBalance) || 0,
              supported: true
            },
            {
              key: 'USDC',
              label: 'USDC',
              icon: <FaDollarSign size={14} />,
              balanceText: '0 USDC',
              balance: 0,
              supported: false
            }
          ]
          const tokensSorted = [...tokens].sort((a, b) => {
            if (a.supported !== b.supported) return a.supported ? -1 : 1
            const aHas = (a.balance || 0) > 0
            const bHas = (b.balance || 0) > 0
            if (aHas !== bHas) return aHas ? -1 : 1
            const diff = (b.balance || 0) - (a.balance || 0)
            if (diff !== 0) return diff
            return 0
          })
          return (
            <div className="wallet-topbar tabs">
              <div className="wtabs" role="tablist" aria-label="Crypto tabs">
                {tokensSorted.map((t) => (
                  <button
                    key={t.key}
                    className={`wtab ${selectedCrypto === t.key ? 'active' : ''}`}
                    role="tab"
                    aria-selected={selectedCrypto === t.key}
                    title={t.supported ? t.label : `${t.label} (bientôt)`}
                    onClick={() => t.supported && setSelectedCrypto(t.key)}
                    disabled={!t.supported}
                  >
                    <span className="wtab-ico">{t.icon}</span>
                    <span className="wtab-label">{t.label}</span>
                    <span className="wtab-sub">{t.balanceText}</span>
                  </button>
                ))}
              </div>
              {/* Réseau selector retiré pour SOL (on utilise le bouton dans la carte) */}
            </div>
          )
        })()}
        <div className="wallet-hero">
          {selectedCrypto === 'ETH' ? (
            <div className="wallet-balance-card center">
              <div className="wallet-center" style={{ maxWidth: 780 }}>
                <div className="token-mark">
                  <SiEthereum size={36} />
                </div>
                <div className="primary-amount">
                  {balanceEth == null ? '0.000000' : parseFloat(balanceEth).toFixed(6)}
                  <small>ETH</small>
                </div>
                <div className="fiat-amount">
                  {balanceEth == null || priceEur == null
                    ? '—'
                    : (parseFloat(balanceEth) * priceEur).toLocaleString('fr-FR', {
                        style: 'currency',
                        currency: 'EUR'
                      })}
                </div>
                {/* le prix unitaire est affiché dans la rangée des mini-boutons ci-dessous */}
                <div className="cta-row">
                  <button className="cta-btn" disabled={!address} onClick={() => setSendOpen(true)}>
                    Envoyer
                  </button>
                  <button
                    className="cta-btn receive"
                    disabled={!address}
                    onClick={() => setReceiveOpen(true)}
                  >
                    Recevoir
                  </button>
                </div>
                {/* variation déjà affichée à côté du prix unitaire */}
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    marginTop: 8,
                    flexWrap: 'wrap',
                    justifyContent: 'center'
                  }}
                >
                  <button
                    className="mini-btn ghost"
                    onClick={() => {
                      setNetwork((n) => {
                        const next = n === 'mainnet' ? 'sepolia' : 'mainnet'
                        if (next === 'mainnet') setRpcUrl('https://cloudflare-eth.com')
                        else setRpcUrl('https://rpc.sepolia.org')
                        return next
                      })
                      setError(null)
                    }}
                  >
                    Réseau: {network === 'mainnet' ? 'Mainnet' : 'Sepolia'}
                  </button>
                  {priceEur != null && (
                    <div
                      className="unit-inline"
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <span>
                        1 ETH ={' '}
                        {priceEur.toLocaleString('fr-FR', {
                          style: 'currency',
                          currency: 'EUR'
                        })}
                      </span>
                      {priceChange != null && (
                        <span className={'wbc-change ' + (priceChange >= 0 ? 'pos' : 'neg')}>
                          {priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
                        </span>
                      )}
                    </div>
                  )}
                  <button
                    className="mini-btn ghost"
                    onClick={fetchBalance}
                    disabled={refreshing || !address}
                  >
                    <FaSync size={12} className={refreshing ? 'spin' : ''} /> Actualiser
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="wallet-balance-card center">
              <div className="wallet-center" style={{ maxWidth: 780 }}>
                <div
                  className="token-mark"
                  style={{ background: 'linear-gradient(135deg, #00FFA3 0%, #DC1FFF 100%)' }}
                >
                  <SiSolana size={36} color="#0b0b0f" />
                </div>
                <div className="primary-amount">
                  {solBalance == null ? '0.000000' : solBalance.toFixed(6)}
                  <small>SOL</small>
                </div>
                <div className="fiat-amount" style={{ opacity: 0.7 }}>
                  {solBalance == null || priceSolEur == null
                    ? '—'
                    : (solBalance * priceSolEur).toLocaleString('fr-FR', {
                        style: 'currency',
                        currency: 'EUR'
                      })}
                </div>
                {/* le prix unitaire est affiché dans la rangée des mini-boutons ci-dessous */}
                <div className="cta-row">
                  <button
                    className="cta-btn"
                    disabled={!solAddress}
                    onClick={() => setSendOpen(true)}
                  >
                    Envoyer
                  </button>
                  <button
                    className="cta-btn receive"
                    disabled={!solAddress}
                    onClick={() => setReceiveOpen(true)}
                  >
                    Recevoir
                  </button>
                </div>
                {/* variation déjà affichée à côté du prix unitaire */}
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    marginTop: 8,
                    flexWrap: 'wrap',
                    justifyContent: 'center'
                  }}
                >
                  <button
                    className="mini-btn ghost"
                    onClick={() => setSolNet((n) => (n === 'mainnet' ? 'devnet' : 'mainnet'))}
                  >
                    Réseau: {solNet === 'mainnet' ? 'Mainnet' : 'Devnet'}
                  </button>
                  {priceSolEur != null && (
                    <div
                      className="unit-inline"
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <span>
                        1 SOL ={' '}
                        {priceSolEur.toLocaleString('fr-FR', {
                          style: 'currency',
                          currency: 'EUR'
                        })}
                      </span>
                      {priceSolChange != null && (
                        <span className={'wbc-change ' + (priceSolChange >= 0 ? 'pos' : 'neg')}>
                          {priceSolChange >= 0 ? '▲' : '▼'} {Math.abs(priceSolChange).toFixed(2)}%
                        </span>
                      )}
                    </div>
                  )}
                  <button
                    className="mini-btn ghost"
                    onClick={loadSolBalance}
                    disabled={!solAddress}
                  >
                    <FaSync size={12} /> Actualiser
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Affichage des erreurs de prix proche de la carte (source déplacée plus bas) */}
          {selectedCrypto === 'ETH' && priceError && (
            <div style={{ fontSize: 11, marginTop: 6 }}>
              <span style={{ color: '#d9534f', fontWeight: 600 }}>{priceError}</span>
            </div>
          )}
          {selectedCrypto === 'SOL' && priceSolError && (
            <div style={{ fontSize: 11, marginTop: 6 }}>
              <span style={{ color: '#d9534f', fontWeight: 600 }}>{priceSolError}</span>
            </div>
          )}
          {safeError && (
            <div style={{ color: '#ff6666', fontSize: 12, fontWeight: 600, marginTop: 8 }}>
              Erreur: {safeError}
            </div>
          )}
          {showRpcEdit && (
            <div className="wallet-rpc-edit">
              <input
                className="ov-input"
                style={{ flex: 1, minWidth: 260 }}
                placeholder="URL RPC personnalisée"
                value={rpcTemp}
                onChange={(e) => setRpcTemp(e.target.value)}
              />
              <button
                className="mini-btn"
                onClick={() => {
                  setRpcUrl(rpcTemp.trim())
                  setError(null)
                  fetchBalance()
                  setShowRpcEdit(false)
                }}
              >
                Appliquer
              </button>
              <button className="mini-btn ghost" onClick={() => setShowRpcEdit(false)}>
                Fermer
              </button>
            </div>
          )}
          <div className="wallet-side-panels">
            <div className="wallet-card mini">
              <div className="wc-title">Activité récente</div>
              {activity.length === 0 && (
                <div className="wc-empty" style={{ fontSize: 11 }}>
                  (Aucune activité)
                </div>
              )}
              {activity.length > 0 && (
                <ul
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: '4px 0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}
                >
                  {activity.map((a) => {
                    const isIn = a.direction === 'in'
                    const color = isIn ? '#2ecc71' : '#ff7675'
                    const explorer =
                      a.hash &&
                      (a.network === 'mainnet'
                        ? `https://etherscan.io/tx/${a.hash}`
                        : `https://sepolia.etherscan.io/tx/${a.hash}`)
                    return (
                      <li
                        key={(a.hash || a.ts) + a.direction}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          fontSize: 11,
                          background: 'var(--panel-bg, rgba(255,255,255,0.04))',
                          border: '1px solid rgba(255,255,255,0.06)',
                          padding: '6px 8px',
                          borderRadius: 8,
                          backdropFilter: 'blur(4px)'
                        }}
                      >
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color,
                            background: 'rgba(255,255,255,0.06)',
                            borderRadius: 6
                          }}
                          title={isIn ? 'Entrant' : 'Sortant'}
                        >
                          {isIn ? <FaArrowDown size={10} /> : <FaArrowUp size={10} />}
                        </span>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, color }}>
                              {isIn ? '+' : '-'}
                              {a.amount?.toFixed?.(6) || a.amount}
                            </span>
                            <span style={{ opacity: 0.6 }}>{a.status || '—'}</span>
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              opacity: 0.55,
                              display: 'flex',
                              gap: 6,
                              flexWrap: 'wrap'
                            }}
                          >
                            {a.hash ? (
                              <a
                                href={explorer}
                                style={{ color: '#4daafc', textDecoration: 'none' }}
                                target="_blank"
                                rel="noreferrer"
                                title="Voir sur Etherscan"
                              >
                                {a.hash.slice(0, 14)}…
                              </a>
                            ) : (
                              <span style={{ opacity: 0.4 }}>(hash inconnu)</span>
                            )}
                            <span>{new Date(a.ts).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="wallet-card mini">
              <div className="wc-title">Réseau</div>
              <div className="net-grid">
                <div>
                  <span className="lbl">Chaîne</span>
                  <span>{network === 'mainnet' ? 'Mainnet' : 'Sepolia'}</span>
                </div>
                <div>
                  <span className="lbl">Gas (gwei)</span>
                  <span>{gasGwei ?? '—'}</span>
                </div>
                <div>
                  <span className="lbl">Bloc</span>
                  <span>{blockNumber ?? '—'}</span>
                </div>
                <div>
                  <span className="lbl">Latence</span>
                  <span>{latency != null ? latency + 'ms' : '—'}</span>
                </div>
                <div>
                  <span className="lbl">RPC</span>
                  <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {activeRpc || '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          {/* Attribution de la source des prix (déplacée) */}
          <div style={{ fontSize: 10, opacity: 0.55, marginTop: 8, textAlign: 'right' }}>
            {selectedCrypto === 'ETH' && priceSource && !priceError && (
              <span>
                Données prix :{' '}
                {priceSource === 'coingecko'
                  ? 'CoinGecko'
                  : priceSource === 'binance'
                    ? 'Binance'
                    : priceSource}
                {priceCached && ' (cache)'}
              </span>
            )}
            {selectedCrypto === 'SOL' && priceSolSource && !priceSolError && (
              <span>
                Données prix :{' '}
                {priceSolSource === 'coingecko'
                  ? 'CoinGecko'
                  : priceSolSource === 'binance'
                    ? 'Binance'
                    : priceSolSource}
                {priceSolCached && ' (cache)'}
              </span>
            )}
          </div>
        </div>
        {(sendOpen || receiveOpen) && (
          <div
            className="wallet-modal-overlay"
            onClick={() => {
              if (!sending) {
                setSendOpen(false)
                setReceiveOpen(false)
              }
            }}
          >
            <div
              className="wallet-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              {sendOpen ? (
                <>
                  <div className="wm-head">
                    <h3>Envoyer des ETH</h3>
                    <button className="wm-close" onClick={() => !sending && setSendOpen(false)}>
                      ✕
                    </button>
                  </div>
                  <div className="wm-body">
                    <label className="wm-field">
                      <span>Adresse destinataire</span>
                      <input
                        className="ov-input"
                        placeholder="0x..."
                        value={sendTo}
                        onChange={(e) => setSendTo(e.target.value)}
                        autoFocus
                      />
                    </label>
                    <label className="wm-field">
                      <span>Montant (ETH)</span>
                      <input
                        className="ov-input"
                        placeholder="0.01"
                        value={sendAmount}
                        onChange={(e) => setSendAmount(e.target.value)}
                      />
                    </label>
                    <div className="wm-hint">
                      Réseau actuel:{' '}
                      {network === 'mainnet' ? 'Ethereum Mainnet (réel)' : 'Sepolia test'}
                    </div>
                    {txStatus === 'pending' && lastTx && (
                      <div className="wm-status">
                        Transaction en attente ({lastTx.slice(0, 12)}…)
                      </div>
                    )}
                    {error && <div className="wm-error">{safeError}</div>}
                  </div>
                  <div className="wm-actions">
                    <button
                      className="mini-btn ghost"
                      disabled={sending}
                      onClick={() => setSendOpen(false)}
                    >
                      Annuler
                    </button>
                    <button className="mini-btn" disabled={sending} onClick={submitSend}>
                      {sending ? 'Envoi…' : 'Confirmer'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="wm-head">
                    <h3>Recevoir {selectedCrypto}</h3>
                    <button className="wm-close" onClick={() => setReceiveOpen(false)}>
                      ✕
                    </button>
                  </div>
                  <div className="wm-body">
                    <div className="wm-field">
                      <span>Adresse</span>
                      <input
                        className="ov-input"
                        readOnly
                        value={selectedCrypto === 'SOL' ? solAddress || '' : address || ''}
                      />
                    </div>
                    <div className="wm-hint">
                      Copiez l&#39;adresse et partagez-la pour recevoir des fonds.
                    </div>
                  </div>
                  <div className="wm-actions">
                    <button className="mini-btn ghost" onClick={() => setReceiveOpen(false)}>
                      Fermer
                    </button>
                    <button
                      className="mini-btn"
                      onClick={() => {
                        const v = selectedCrypto === 'SOL' ? solAddress : address
                        if (v && navigator.clipboard) navigator.clipboard.writeText(v)
                      }}
                    >
                      Copier
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

WalletPage.propTypes = {
  onBack: PropTypes.func
}
