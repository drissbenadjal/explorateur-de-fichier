import FileExplorer from './components/FileExplorer'
import { useEffect, useState } from 'react'

function App() {
  const [max, setMax] = useState(false)
  useEffect(() => {
    window.api?.win?.onMaximized?.((v) => setMax(v))
  }, [])
  return (
    <>
      <div className="win-bar">
        <div className="app-title">UltraXplorateur</div>
        <div className="win-drag-spacer" />
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
      <FileExplorer />
    </>
  )
}

export default App
