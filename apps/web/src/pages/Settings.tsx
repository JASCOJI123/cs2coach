import { useEffect, useRef, useState } from 'react';
import { api, clearAuthToken } from '../lib/api';
import { navigate } from '../App';
import { LanguageSwitcher, useI18n } from '../lib/i18n';
import { wt } from '../lib/webText';
import type { FaceitStatus, NotificationSettings } from '../lib/types';
import SiteNav from '../components/SiteNav';

const LINK_POLL_MS = 3000;
const LINK_POLL_TIMEOUT_MS = 15 * 60_000;

export default function Settings() {
  const { t, lang } = useI18n();
  const [faceit, setFaceit] = useState<FaceitStatus | null>(null);
  const [alerts, setAlerts] = useState<NotificationSettings | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    pollTimer.current = null;
    setWaiting(false);
  };

  useEffect(() => {
    void api.faceitStatus().then(setFaceit).catch(() => {});
    void api.notifications().then(setAlerts).catch((err) => setError((err as Error).message));
    return () => { if (pollTimer.current !== null) window.clearTimeout(pollTimer.current); };
  }, []);

  // Keep the bot's message language in sync with the site language.
  useEffect(() => {
    if (alerts && alerts.locale !== lang) void api.updateNotifications({ locale: lang }).then(setAlerts).catch(() => {});
  }, [lang, alerts?.locale]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await fn(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  const connectTelegram = () => run(async () => {
    // Open the tab synchronously so popup blockers allow it, then point it at the deep link.
    const tab = window.open('', '_blank');
    const { url } = await api.telegramLink(lang);
    if (tab) tab.location.href = url; else window.location.assign(url);
    setWaiting(true);
    const startedAt = Date.now();
    const poll = async () => {
      try {
        const next = await api.notifications();
        if (next.telegram.linked) { setAlerts(next); stopPolling(); return; }
      } catch { /* keep polling */ }
      if (Date.now() - startedAt >= LINK_POLL_TIMEOUT_MS) { stopPolling(); return; }
      pollTimer.current = window.setTimeout(() => void poll(), LINK_POLL_MS);
    };
    pollTimer.current = window.setTimeout(() => void poll(), LINK_POLL_MS);
  });

  const disconnectTelegram = () => run(async () => { stopPolling(); setAlerts(await api.telegramUnlink()); });
  const toggleEnabled = () => run(async () => { if (alerts) setAlerts(await api.updateNotifications({ enabled: !alerts.enabled })); });
  const logout = () => { stopPolling(); clearAuthToken(); navigate('splash'); };

  const tg = alerts?.telegram;

  return (
    <main className="panel settings-page">
      <header className="command-topbar">
        <div><span className="eyebrow">CS2USTOZ</span><h1 className="settings-title">{wt(lang, 'settings')}</h1></div>
      </header>
      {error && <p className="error-banner">{error}</p>}

      <section className="settings-card">
        <span className="eyebrow">{wt(lang, 'account')}</span>
        <div className="settings-account">
          <div className="player-avatar">
            {faceit?.avatar ? <img src={faceit.avatar} alt={t('avatarAlt')} /> : <span>{(faceit?.nickname ?? 'P').slice(0, 1).toUpperCase()}</span>}
          </div>
          <div>
            <strong>{faceit?.nickname ?? '—'}</strong>
            <small>{wt(lang, 'signedInWith')}{faceit?.skillLevel ? ` · ${t('level')} ${faceit.skillLevel}` : ''}{faceit?.elo ? ` · ${faceit.elo} ELO` : ''}</small>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <span className="eyebrow">{wt(lang, 'notifications')}</span>
        <div className="settings-row">
          <span className="alerts-icon">✈</span>
          <div>
            <strong>{wt(lang, 'telegramTitle')}</strong>
            <small>{wt(lang, 'telegramDesc')}</small>
          </div>
        </div>
        {!alerts ? <div className="spinner" />
          : !tg?.available ? <p className="settings-muted">{wt(lang, 'telegramUnavailable')}</p>
          : tg.linked ? (
            <>
              <div className="settings-linked">
                <span className="connection-dot online"><i />{wt(lang, 'telegramLinked')}</span>
                {tg.username && <b>@{tg.username}</b>}
              </div>
              <button className={`settings-toggle ${alerts.enabled ? 'on' : ''}`} onClick={() => void toggleEnabled()} disabled={busy} role="switch" aria-checked={alerts.enabled}>
                <span className="toggle-track"><i /></span>
                {alerts.enabled ? wt(lang, 'notificationsOn') : wt(lang, 'notificationsOff')}
              </button>
              <button className="text-action" onClick={() => void disconnectTelegram()} disabled={busy}>{wt(lang, 'disconnectTelegram')}</button>
            </>
          ) : (
            <>
              <button className="primary settings-cta" onClick={() => void connectTelegram()} disabled={busy}>✈ {wt(lang, 'connectTelegram')}</button>
              {waiting && <p className="settings-muted"><span className="pulse" /> {wt(lang, 'waitingTelegram')}</p>}
            </>
          )}
      </section>

      <section className="settings-card">
        <span className="eyebrow">{wt(lang, 'language')}</span>
        <LanguageSwitcher />
      </section>

      <button className="account-link danger" onClick={logout}><span>⎋</span>{wt(lang, 'logout')}<b>→</b></button>
      <SiteNav active="settings" />
    </main>
  );
}
