import React from 'react';
import ReactDOM from 'react-dom/client';
import { getTelegramWebApp, initTelegram } from './lib/telegram';
import App from './App';
import './styles.css';

initTelegram();

// FACEIT OAuth finishes in the external browser. The API redirects back to
// Telegram's Main Mini App with the one-time handoff in startapp. Convert that
// start parameter into the existing internal callback route before React mounts.
const startParam = getTelegramWebApp()?.initDataUnsafe?.start_param ?? '';
if (/^[a-f0-9]{64}$/.test(startParam) && !window.location.hash.includes('faceit-callback')) {
  window.location.hash = `/faceit-callback?handoff=${encodeURIComponent(startParam)}`;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
