import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { I18nProvider } from './lib/i18n';
import './styles.css';
import './design-system.css';
import './web-layout.css';
import { initSystemTheme } from './dark-mode';

initSystemTheme();

// FACEIT sign-in returns to ?faceit_handoff=<hex>#/faceit-callback; make sure
// the callback page handles it even if the hash was lost on the way.
const handoff = new URLSearchParams(window.location.search).get('faceit_handoff') ?? '';
if (/^[a-f0-9]{64}$/.test(handoff) && !window.location.hash.includes('faceit-callback')) {
  window.location.hash = '/faceit-callback';
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
