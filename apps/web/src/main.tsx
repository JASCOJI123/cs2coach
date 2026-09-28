import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { I18nProvider } from './lib/i18n';
import './legacy-base.css';
import './styles.css';
<<<<<<< Updated upstream
import './design-system.css';
import { initSystemTheme } from './dark-mode';

initTelegram();
initSystemTheme();

const telegramStartParam = getTelegramWebApp()?.initDataUnsafe?.start_param ?? '';
const browserParams = new URLSearchParams(window.location.search);
const directHandoff = browserParams.get('faceit_handoff') ?? '';
const legacyHandoff = /^[a-f0-9]{64}$/.test(telegramStartParam) ? telegramStartParam : '';
const handoff = /^[a-f0-9]{64}$/.test(directHandoff) ? directHandoff : legacyHandoff;

if (handoff && !window.location.hash.includes('faceit-callback')) {
  window.location.hash = `/faceit-callback?handoff=${encodeURIComponent(handoff)}`;
=======
import './unified-theme.css';
import './theme-toggle.css';
import './lib/i18n.css';
import './web-layout.css';

// FACEIT sign-in returns to ?faceit_handoff=<hex>#/faceit-callback; make sure
// the callback page handles it even if the hash was lost on the way.
const handoff = new URLSearchParams(window.location.search).get('faceit_handoff') ?? '';
if (/^[a-f0-9]{64}$/.test(handoff) && !window.location.hash.includes('faceit-callback')) {
  window.location.hash = '/faceit-callback';
>>>>>>> Stashed changes
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
