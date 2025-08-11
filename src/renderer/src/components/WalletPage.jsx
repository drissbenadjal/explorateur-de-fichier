import { useEffect, useState, useRef, useCallback } from 'react'
import { SiEthereum } from 'react-icons/si'
import { FaSync, FaArrowLeft, FaArrowUp, FaArrowDown, FaPaperPlane, FaGlobe } from 'react-icons/fa'
import PropTypes from 'prop-types'

export default function WalletPage({ onBack = () => {} }) {
  const [network, setNetwork] = useState('sepolia') // 'sepolia' | 'mainnet'
  const [rpcUrl, setRpcUrl] = useState('https://rpc.sepolia.org')
  const [showRpcEdit, setShowRpcEdit] = useState(false)
  const [rpcTemp, setRpcTemp] = useState('https://rpc.sepolia.org')
  const [address, setAddress] = useState(null)
  const [balanceEth, setBalanceEth] = useState(null)
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

  const addActivity = useCallback((entry) => {
    setActivity((prev) => {
      const next = [entry, ...prev].slice(0, 5)
      try {
        localStorage.setItem('walletActivity', JSON.stringify(next))
    } catch {
      // ignore storage error
    }
      return next
    })
  }, [])

  const init = async () => {
    try {
      const w = await window.api.wallet.init()
      if (w?.address) setAddress(w.address)
    } catch (e) {
      setError(e.message || 'Init error')
    }
  }

  const fetchBalance = async () => {
    if (!address) return
    setRefreshing(true)
    try {
      const r = await window.api.wallet.balance({ rpcUrl, chain: network })
      if (!r?.error) {
        setBalanceEth(r.eth)
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
    if (!isValidAddress(sendTo.trim())) {
      setError('Adresse invalide')
      return
    }
    const num = Number(sendAmount)
    if (!isFinite(num) || num <= 0) {
      setError('Montant invalide')
      return
    }
    setSending(true)
    setError(null)
    try {
      const r = await window.api.wallet.send({
        to: sendTo.trim(),
        amountEth: sendAmount.trim(),
        rpcUrl,
        chain: network
      })
      if (r?.error) {
        setError(normalizeError(r))
      } else {
        setLastTx(r.hash)
        setTxStatus('pending')
        addActivity({
          hash: r.hash,
          direction: 'out',
          amount: parseFloat(sendAmount),
          status: 'pending',
          ts: Date.now(),
          network
        })
        setSendOpen(false)
        setSendTo('')
        setSendAmount('')
        pollTx(r.hash)
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
    init()
  }, [])
  useEffect(() => {
    if (address) fetchBalance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  // Quand le réseau change: purge les activités d'autres réseaux et rafraîchit immédiatement
  useEffect(() => {
    if (!address) return
    setActivity((prev) => prev.filter((a) => a.network === network))
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
          network
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
    <div className="wallet-page">
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
      <div
        className="wallet-topbar"
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}
      >
        <button onClick={onBack} className="mini-btn" title="Retour explorateur">
          <FaArrowLeft size={12} />
          <span style={{ marginLeft: 4 }}>Retour</span>
        </button>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Wallet</div>
      </div>
      <div className="wallet-hero">
        <div className="wallet-balance-card">
          <div className="wbc-left">
            <div className="eth-logo-circle">
              <SiEthereum size={30} />
            </div>
            <div className="wbc-balances">
              <div className="wbc-label">Solde total</div>
              <div className="wbc-main-amount">
                {balanceEth == null || priceEur == null
                  ? '—'
                  : (parseFloat(balanceEth) * priceEur).toLocaleString('fr-FR', {
                      style: 'currency',
                      currency: 'EUR'
                    })}
              </div>
              <div className="wbc-sub-line">
                <span className="wbc-eth-small">
                  {balanceEth == null ? '—' : parseFloat(balanceEth).toFixed(6)} ETH
                </span>
                {priceChange != null && (
                  <span className={'wbc-change ' + (priceChange >= 0 ? 'pos' : 'neg')}>
                    {priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="wbc-actions">
            <button
              className="action-btn"
              disabled={!address}
              title="Envoyer"
              onClick={() => setSendOpen(true)}
            >
              <FaPaperPlane size={14} />
              <span>Envoyer</span>
            </button>
            <button
              className="action-btn"
              onClick={() => {
                setNetwork((n) => {
                  const next = n === 'mainnet' ? 'sepolia' : 'mainnet'
                  if (next === 'mainnet') setRpcUrl('https://cloudflare-eth.com')
                  else setRpcUrl('https://rpc.sepolia.org')
                  return next
                })
                setError(null)
              }}
              title="Changer réseau"
            >
              <FaGlobe size={14} />
              <span>{network === 'mainnet' ? 'Mainnet' : 'Sepolia'}</span>
            </button>
            <button
              className="action-btn ghost"
              onClick={fetchBalance}
              disabled={refreshing || !address}
              title="Actualiser"
            >
              <FaSync size={14} className={refreshing ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
            <button
              className="action-btn ghost"
              onClick={() =>
                navigator.clipboard && address && navigator.clipboard.writeText(address)
              }
              disabled={!address}
              title="Copier adresse"
            >
              <span style={{ fontSize: 12 }}>Copier</span>
            </button>
          </div>
        </div>
        <div style={{ fontSize: 11, marginTop: 6, display: 'flex', gap: 12, alignItems: 'center' }}>
          {priceSource && !priceError && (
            <span style={{ opacity: 0.6 }}>
              Source: {priceSource}
              {priceCached && ' (cache)'}
            </span>
          )}
          {priceError && <span style={{ color: '#d9534f', fontWeight: 600 }}>{priceError}</span>}
          {priceError && (
            <button
              className="mini-btn ghost"
              style={{ fontSize: 10, padding: '4px 10px' }}
              onClick={() => {
                // force reload immédiat
                ;(async () => {
                  try {
                    setPriceError(null)
                    const ev = new Event('forcePriceReload')
                    window.dispatchEvent(ev)
                  } catch {
                    /* ignore */
                  }
                })()
              }}
            >
              Réessayer
            </button>
          )}
        </div>
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
      </div>
      {sendOpen && (
        <div className="wallet-modal-overlay" onClick={() => !sending && setSendOpen(false)}>
          <div
            className="wallet-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
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
                Réseau actuel: {network === 'mainnet' ? 'Ethereum Mainnet (réel)' : 'Sepolia test'}
              </div>
              {txStatus === 'pending' && lastTx && (
                <div className="wm-status">Transaction en attente ({lastTx.slice(0, 12)}…)</div>
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
          </div>
        </div>
      )}
    </div>
  )
}

WalletPage.propTypes = {
  onBack: PropTypes.func
}
