import { useEffect, useState, useRef } from 'react'
import { SiEthereum } from 'react-icons/si'
import { FaSync, FaArrowLeft } from 'react-icons/fa'
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
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [sendTo, setSendTo] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [sending, setSending] = useState(false)
  const [lastTx, setLastTx] = useState(null)
  const [txStatus, setTxStatus] = useState(null)
  const [error, setError] = useState(null)

  const init = async () => {
    setLoading(true)
    try {
      const w = await window.api.wallet.init()
      if (w?.address) setAddress(w.address)
    } catch (e) {
      setError(e.message || 'Init error')
    } finally {
      setLoading(false)
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

  useEffect(() => {
    init()
  }, [])
  useEffect(() => {
    if (address) fetchBalance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  useEffect(() => {
    if (balanceEth != null && prevBalance.current != null) {
      if (parseFloat(balanceEth) > parseFloat(prevBalance.current)) {
        setShowNotif(true)
        if (audioRef.current) {
          audioRef.current.currentTime = 0
          audioRef.current.play()
        }
        setTimeout(() => setShowNotif(false), 3500)
      }
    }
    prevBalance.current = balanceEth
  }, [balanceEth])
  const truncated = address ? address.slice(0, 6) + '...' + address.slice(-4) : ''
  const safeError = error && typeof error === 'object' ? JSON.stringify(error) : error

  return (
    <div className="wallet-page">
      <audio ref={audioRef} src="../../resources/eth-received.wav" preload="auto" />
      {showNotif && (
        <div
          style={{
            position: 'fixed',
            top: 36,
            right: 36,
            minWidth: 320,
            maxWidth: 400,
            background: 'rgba(18,22,34,0.82)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 28,
            borderRadius: 24,
            boxShadow: '0 6px 32px #2de1fc55, 0 1px 0 #fff1 inset',
            padding: '32px 44px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            letterSpacing: 0.5,
            border: '2px solid #2de1fc',
            animation: 'notifPop 0.6s cubic-bezier(.68,-0.55,.27,1.55)'
          }}
        >
          <span
            style={{
              width: 70,
              height: 70,
              borderRadius: '50%',
              background: 'conic-gradient(from 120deg, #2de1fc 0%, #3fffa8 40%, #2de1fc 100%)',
              boxShadow: '0 0 32px #2de1fc99, 0 0 0 8px #1e2746',
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'notifCircleSpin 1.2s linear infinite'
            }}
          >
            <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
              <circle cx="19" cy="19" r="16" stroke="#fff" strokeWidth="2" opacity="0.18" />
              <circle cx="19" cy="19" r="12" stroke="#2de1fc" strokeWidth="3" />
              <text x="19" y="25" textAnchor="middle" fontSize="20" fill="#fff" fontWeight="bold">Ξ</text>
            </svg>
          </span>
          <span style={{ textAlign: 'center', fontFamily: 'inherit', fontSize: 28, fontWeight: 800, textShadow: '0 2px 12px #2de1fc99' }}>
            ETH reçu !
          </span>
          <span style={{ textAlign: 'center', fontFamily: 'inherit', fontSize: 15, fontWeight: 500, color: '#2de1fc', marginTop: 2, letterSpacing: 0.2 }}>
            You received ETH
          </span>
          <style>{`
            @keyframes notifPop {
              0% { transform: scale(0.7); opacity: 0.2; }
              80% { transform: scale(1.08); opacity: 1; }
              100% { transform: scale(1); opacity: 1; }
            }
            @keyframes notifCircleSpin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
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
        <div className="wallet-big-card">
          <div className="wb-head">
            <div className="wallet-ring xl">
              <div className="wallet-ring-inner xl">
                <SiEthereum size={46} />
              </div>
            </div>
            <div className="wb-info">
              <div className="wb-label">Adresse</div>
              {loading && (
                <div className="wb-value" style={{ fontSize: 20 }}>
                  Chargement…
                </div>
              )}
              {!loading && (
                <div className="wb-addr" title={address} style={{ fontSize: 13 }}>
                  {truncated}
                </div>
              )}
              <div className="wb-label" style={{ marginTop: 10 }}>
                Solde (ETH)
              </div>
              <div className="wb-value" style={{ fontSize: 28 }}>
                {balanceEth == null ? '—' : parseFloat(balanceEth).toFixed(4)}
              </div>
            </div>
            <button
              className="wallet-refresh"
              onClick={fetchBalance}
              disabled={refreshing}
              title="Actualiser"
            >
              <FaSync size={14} className={refreshing ? 'spin' : ''} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="mini-btn" disabled={!address} onClick={() => setSendOpen((v) => !v)}>
              {sendOpen ? 'Fermer envoi' : 'Envoyer'}
            </button>
            <button
              className="mini-btn ghost"
              style={{
                background: showRpcEdit ? 'var(--accent-fg)' : undefined,
                color: showRpcEdit ? '#fff' : undefined
              }}
              onClick={() => setShowRpcEdit((v) => !v)}
            >
              RPC
            </button>
            <select
              className="ov-input"
              style={{ width: 130, fontSize: 12, padding: '4px 6px' }}
              value={network}
              onChange={(e) => {
                const val = e.target.value
                setNetwork(val)
                // Réinitialiser RPC par défaut selon le réseau
                if (val === 'mainnet') setRpcUrl('https://cloudflare-eth.com')
                else setRpcUrl('https://rpc.sepolia.org')
                setError(null)
                setTimeout(() => fetchBalance(), 50)
              }}
            >
              <option value="sepolia">Sepolia (test)</option>
              <option value="mainnet">Mainnet</option>
            </select>
            <button
              className="mini-btn ghost"
              onClick={() =>
                navigator.clipboard && address && navigator.clipboard.writeText(address)
              }
              disabled={!address}
            >
              Copier adresse
            </button>
            {lastTx && (
              <div style={{ fontSize: 11, opacity: 0.7 }}>
                Dernière tx: {lastTx.slice(0, 12)}… ({txStatus || '...'})
              </div>
            )}
          </div>
          {showRpcEdit && (
            <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          {sendOpen && (
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  className="ov-input"
                  style={{ flex: 1, minWidth: 240 }}
                  placeholder="Adresse destinataire"
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                />
                <input
                  className="ov-input"
                  style={{ width: 140 }}
                  placeholder="Montant ETH"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                />
                <button className="mini-btn" disabled={sending} onClick={submitSend}>
                  {sending ? 'Envoi…' : 'Confirmer'}
                </button>
                <button className="mini-btn ghost" onClick={() => setSendOpen(false)}>
                  Annuler
                </button>
              </div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>
                Réseau: {network === 'mainnet' ? 'Ethereum Mainnet (vrai ETH)' : 'Sepolia (test)'}.
                {network === 'mainnet'
                  ? ' Attention: fonds réels.'
                  : ' Utilisez un faucet pour obtenir des ETH de test.'}
              </div>
            </div>
          )}
          {safeError && (
            <div style={{ color: '#ff6666', fontSize: 12, fontWeight: 600 }}>
              Erreur: {safeError}
            </div>
          )}
        </div>
        <div className="wallet-side-panels">
          <div className="wallet-card mini">
            <div className="wc-title">Activité récente</div>
            <div className="wc-empty" style={{ fontSize: 11 }}>
              {lastTx ? (
                <span>
                  {lastTx.slice(0, 20)}… – {txStatus || 'pending'}
                </span>
              ) : (
                '(Pas encore de transaction envoyée)'
              )}
            </div>
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
    </div>
  )
}

WalletPage.propTypes = {
  onBack: PropTypes.func
}
