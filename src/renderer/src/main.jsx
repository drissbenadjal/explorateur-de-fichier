import './assets/main.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CryptoBalanceProvider } from './components/CryptoBalanceContext';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CryptoBalanceProvider>
      <App />
    </CryptoBalanceProvider>
  </StrictMode>
);
