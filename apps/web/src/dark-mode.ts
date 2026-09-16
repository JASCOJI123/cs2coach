const STORAGE_KEY = 'cs2coach.dark-mode';
const STYLE_ID = 'cs2coach-theme-overrides';

function ensureThemeStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    html:not(.dark), html:not(.dark) body, html:not(.dark) #root { background:#eef1f4 !important; color:#111820 !important; }
    html:not(.dark) body { background-image:radial-gradient(circle at 50% -12%,rgba(255,122,0,.10),transparent 30%) !important; }
    html:not(.dark) .panel { color:#111820; }
    html:not(.dark) .brand-lockup small { color:#87939d !important; }
    html:not(.dark) .connection-dot { background:rgba(255,255,255,.78) !important; border-color:#dce2e7 !important; color:#7a8790 !important; }
    html:not(.dark) .connection-dot.online { color:#15965a !important; border-color:rgba(21,150,90,.20) !important; }
    html:not(.dark) .card,html:not(.dark) .section-block,html:not(.dark) .player-card,html:not(.dark) .elo-card,html:not(.dark) .idle-card { background:rgba(255,255,255,.94) !important; border-color:#dce2e7 !important; box-shadow:0 12px 34px rgba(31,45,58,.09) !important; }
    html:not(.dark) .hero-card { background:linear-gradient(145deg,#151b20,#0a0e12) !important; border-color:#263039 !important; color:#fff !important; box-shadow:0 18px 42px rgba(20,30,40,.16) !important; }
    html:not(.dark) .hero-copy p { color:#9aa6af !important; }
    html:not(.dark) .hero-grid { opacity:.18 !important; }
    html:not(.dark) .player-avatar { background:#f0f3f5 !important; border-color:#d8dfe4 !important; }
    html:not(.dark) .player-info p,html:not(.dark) .idle-card p,html:not(.dark) .muted,html:not(.dark) .analysis-block p,html:not(.dark) .signal-detail { color:#71808b !important; }
    html:not(.dark) .level-ring { background:radial-gradient(circle,rgba(255,122,0,.12),#fff 65%) !important; }
    html:not(.dark) .quick-grid button,html:not(.dark) .row-btn,html:not(.dark) .call-block,html:not(.dark) .inst-list li,html:not(.dark) .score-item,html:not(.dark) .secondary { background:#fff !important; border-color:#dce2e7 !important; color:#111820 !important; box-shadow:0 5px 18px rgba(31,45,58,.05) !important; }
    html:not(.dark) .quick-grid small,html:not(.dark) .match-map small,html:not(.dark) .live-match-main small,html:not(.dark) .live-command-head,html:not(.dark) .live-command-foot,html:not(.dark) .eyebrow { color:#7a8994 !important; }
    html:not(.dark) .pill { background:#f0f3f6 !important; border-color:#d7dfe5 !important; color:#6c7a85 !important; }
    html:not(.dark) .bottom-nav { background:rgba(255,255,255,.94) !important; border-color:#dce2e7 !important; box-shadow:0 -8px 28px rgba(31,45,58,.08) !important; }
    html:not(.dark) .bottom-nav button { color:#83909a; }
    html:not(.dark) .bottom-nav button.active { color:#ff7a00; }
    html:not(.dark) .back { background:#fff !important; border-color:#dce2e7 !important; color:#111820 !important; }
  `;
  document.head.appendChild(style);
}
function emitThemeChange(){window.dispatchEvent(new Event('cs2coach-theme-change'));}
export function applyDarkMode(dark:boolean){document.documentElement.classList.toggle('dark',dark);ensureThemeStyles();try{localStorage.setItem(STORAGE_KEY,dark?'1':'0')}catch{}emitThemeChange();}
export function toggleDarkMode(){applyDarkMode(!document.documentElement.classList.contains('dark'));}
export function initDarkMode(){let stored='';try{stored=localStorage.getItem(STORAGE_KEY)??''}catch{}const dark=stored?stored==='1':window.matchMedia?.('(prefers-color-scheme: dark)').matches??false;document.documentElement.classList.toggle('dark',dark);ensureThemeStyles();}
if(typeof document!=='undefined')initDarkMode();
