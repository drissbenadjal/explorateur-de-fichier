import '../assets/main.css'

const WalletPage = () => (
  <div className="wallet-dashboard dark-theme">
    <header className="dashboard-header">
      <div className="dashboard-title">
        <span className="icon">💼</span>
        <h2>DASHBOARD</h2>
      </div>
      <div className="wallet-info">
        <span className="wallet-label">Business Wallet</span>
        <span className="wallet-address">one1pmd9jc...utr6y03cw</span>
      </div>
      <div className="dashboard-actions">
        <button className="btn receive">RECEIVE</button>
        <button className="btn send">SEND</button>
      </div>
    </header>
    <main className="dashboard-main">
      <section className="wallet-value-section">
        <div className="wallet-value-circle">
          <svg width="180" height="180">
            <circle cx="90" cy="90" r="75" stroke="#7fffd4" strokeWidth="10" fill="none" />
            <circle cx="90" cy="90" r="75" stroke="#7b7bff" strokeWidth="10" fill="none" strokeDasharray="360" strokeDashoffset="120" />
          </svg>
          <div className="wallet-value-text">
            <span className="wallet-value">423.12</span>
            <span className="wallet-currency">USD</span>
          </div>
        </div>
        <ul className="wallet-assets">
          <li>
            <span className="asset-name one">One Harmony</span>
            <span>10.0 ONE | $363.2 USD</span>
          </li>
          <li>
            <span className="asset-name elrond">Elrand</span>
            <span>18.0 ELR | $43.8 USD</span>
          </li>
          <li>
            <span className="asset-name kava">Kava</span>
            <span>99.5 KAV | $12.6 USD</span>
          </li>
          <li>
            <span className="asset-name polkadot">Polkadot</span>
            <span>$43.8 USD</span>
          </li>
          <li>
            <span className="asset-name kusama">Kusama</span>
            <span>$43.8 USD</span>
          </li>
          <li>
            <span className="asset-name centrifuge">Centrifuge</span>
            <span>$43.8 USD</span>
          </li>
        </ul>
      </section>
      <section className="transactions-section">
        <div className="transactions-header">
          <h3>TRANSACTIONS</h3>
          <a href="#" className="see-all">SEE ALL</a>
        </div>
        <div className="transactions-graph">
          {/* Graph placeholder */}
          <svg width="220" height="80">
            <polyline points="0,60 40,40 80,50 120,30 160,50 200,20" fill="none" stroke="#ffb86c" strokeWidth="3" />
            <circle cx="120" cy="30" r="8" fill="#ffb86c" />
            <text x="130" y="25" fill="#fff" fontSize="14">$3,250</text>
          </svg>
        </div>
        <ul className="transactions-list">
          <li>
            <span className="tx-asset one">One</span>
            <span className="tx-amount positive">+ $309.72</span>
            <span className="tx-date">2 days ago</span>
          </li>
          <li>
            <span className="tx-asset elrond">Elrand</span>
            <span className="tx-amount negative">- $90.16</span>
            <span className="tx-date">3 days ago</span>
          </li>
        </ul>
      </section>
      <section className="token-rates-section">
        <h3>TOKEN RATES</h3>
        <ul className="token-rates-list">
          <li>
            <span className="token-name usdt">USDT | Tether USD</span>
            <span>$1.00 USD</span>
          </li>
          <li>
            <span className="token-name neo">NEO | NEO</span>
            <span>$12.00 USD</span>
          </li>
          <li>
            <span className="token-name harmony">Harmony | ONE</span>
            <span>$7.00 USD</span>
          </li>
        </ul>
      </section>
      <section className="earnings-section">
        <div className="earnings-card">
          <div className="earnings-icon">➕</div>
          <div className="earnings-info">
            <span>ESTIMATED EARNINGS FROM CURRENT APR</span>
            <button className="btn stake">STAKE YOUR TOKENS</button>
          </div>
        </div>
      </section>
    </main>
  </div>
)

export default WalletPage;
