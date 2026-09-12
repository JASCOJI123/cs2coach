import React from 'react';
import ReactDOM from 'react-dom/client';
import { getTelegramWebApp, initTelegram } from './lib/telegram';
import App from './App';
import './styles.css';

initTelegram();

// FACEIT OAuth now returns directly to the Mini App URL with a one-time
// handoff query parameter. Convert it into the existing internal callback
// route before React mounts. Keep startapp support for older OAuth sessions.
const telegramStartParam = getTelegramWebApp()?.initDataUnsafe?.start_param ?? '';
const browserParams = new URLSearchParams(window.location.search);
const directHandoff = browserParams.get('faceit_handoff') ?? '';
const legacyHandoff = /^[a-f0-9]{64}$/.test(telegramStartParam) ? telegramStartParam : '';
const handoff = /^[a-f0-9]{64}$/.test(directHandoff) ? directHandoff : legacyHandoff;

if (handoff && !window.location.hash.includes('faceit-callback')) {
  window.location.hash = `/faceit-callback?handoff=${encodeURIComponent(handoff)}`;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
