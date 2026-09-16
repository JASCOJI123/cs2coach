const STORAGE_KEY = 'cs2coach.dark-mode';
const STYLE_ID = 'cs2coach-theme-overrides';

function ensureThemeStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    html:not(.dark) body { background: radial-gradient(circle at 50% -10%, rgba(255,122,0,.08), transparent 34%), #f4f6f8 !important; color:#101820 !important; }
    html:not(.dark) .panel { color:#101820; }
    html:not(.dark) .card, html:not(.dark) .section-block, html:not(.dark) .player-card, html:not(.dark) .elo-card, html:not(.dark) .idle-card { background:linear-gradient(145deg,#fff,#f1f4f6) !important; border-color:#d9e0e5 !important; box-shadow:0 14px 36px rgba(20,30,40,.10) !important; }
    html:not(.dark) .hero-card, html:not(.dark) .live-command, html:not(.dark) .tactical-hud { background:linear-gradient(145deg,#fff,#edf1f4) !important; border-color:#d5dde3 !important; color:#101820 !important; }
    html:not(.dark) .hero-grid { opacity:.45; }
    html:not(.dark) .hero-copy p, html:not(.dark) .player-info p, html:not(.dark) .idle-card p, html:not(.dark) .muted, html:not(.dark) .analysis-block p, html:not(.dark) .signal-detail { color:#687782 !important; }
    html:not(.dark) .quick-grid button, html:not(.dark) .row-btn, html:not(.dark) .call-block, html:not(.dark) .inst-list li, html:not(.dark) .score-item, html:not(.dark) .secondary { background:#fff !important; border-color:#dce3e8 !important; color:#101820 !important; }
    html:not(.dark) .quick-grid small, html:not(.dark) .match-map small, html:not(.dark) .live-match-main small, html:not(.dark) .live-command-head, html:not(.dark) .live-command-foot, html:not(.dark) .section-heading .eyebrow, html:not(.dark) .eyebrow { color:#73818b !important; }
    html:not(.dark) .pill { background:#eef2f5 !important; border-color:#d6dee4 !important; color:#667681 !important; }
    html:not(.dark) .bottom-nav { background:rgba(255,255,255,.92) !important; border-color:#dce3e8 !important; }
    html:not(.dark) .bottom-nav button { color:#7a8790; }
    html:not(.dark) .back { background:#fff !important; border-color:#d9e0e5 !important; color:#101820 !important; }
  `;
  document.head.appendChild(style);
}

function emitThemeChange() { window.dispatchEvent(new Event('cs2coach-theme-change')); }

export function applyDarkMode(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  ensureThemeStyles();
  try { localStorage.setItem(STORAGE_KEY, dark ? '1' : '0'); } catch { /* Telegram WebView/private browsing */ }
  emitThemeChange();
}

export function toggleDarkMode() {
  applyDarkMode(!document.documentElement.classList.contains('dark'));
}

export function initDarkMode() {
  let stored = '';
  try { stored = localStorage.getItem(STORAGE_KEY) ?? ''; } catch { stored = ''; }
  const dark = stored ? stored === '1' : window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  document.documentElement.classList.toggle('dark', dark);
  ensureThemeStyles();
}

if (typeof document !== 'undefined') initDarkMode();
