import FileExplorer from './components/FileExplorer'
import WalletPage from './components/WalletPage'
import { useEffect, useState } from 'react'
import { FaMoon, FaSun } from 'react-icons/fa'

function App() {
  const [page, setPage] = useState('explorer') // explorer | wallet
  const [pendingPath, setPendingPath] = useState(null)
  const [max, setMax] = useState(false)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    window.api?.win?.onMaximized?.((v) => setMax(v))
  }, [])

  return (
    <>
      {/* Overlay de préparation wallet */}
      {/* Utilise le contexte pour bloquer navigation tant que non prêt */}
      {/* Note: main.jsx fournit le Provider global */}
      <div className="win-bar">
        <div className="app-title">UltraXplorateur</div>
        <div className="win-drag-spacer" />
        <button
          className="win-btn theme-toggle no-drag"
          title={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        >
          {theme === 'dark' ? <FaSun size={14} /> : <FaMoon size={14} />}
        </button>
        <div className="win-bar-btns">
          <button className="win-btn" title="Minimize" onClick={() => window.api.win.minimize()}>
            <span className="ico-line" />
          </button>
          <button
            className="win-btn"
            title={max ? 'Restore' : 'Maximize'}
            onClick={async () => {
              const r = await window.api.win.maximize()
              if (typeof r === 'boolean') setMax(r)
            }}
          >
            <span className={max ? 'ico-restore' : 'ico-max'} />
          </button>
          <button className="win-btn close" title="Close" onClick={() => window.api.win.close()}>
            <span className="ico-close" />
          </button>
        </div>
      </div>
      {page === 'explorer' ? (
        <FileExplorer
          onOpenWallet={() => setPage('wallet')}
          pendingPath={pendingPath}
          onConsumePendingPath={() => setPendingPath(null)}
        />
      ) : (
        <WalletPage
          onBack={(path) => {
            if (path) setPendingPath(path)
            setPage('explorer')
          }}
        />
      )}
    </>
  )
}

export default App
