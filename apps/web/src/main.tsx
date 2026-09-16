import React from 'react';
import ReactDOM from 'react-dom/client';
import { getTelegramWebApp, initTelegram } from './lib/telegram';
import App from './App';
import { I18nProvider } from './lib/i18n';
import { initDarkMode } from './dark-mode';
import './styles.css';
import './dark-mode.css';

initTelegram();
initDarkMode();

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
    <I18nProvider><App /></I18nProvider>
  </React.StrictMode>
);
