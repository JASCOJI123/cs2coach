import { useEffect, useState } from 'react';
import { api, setAuthToken } from '../lib/api';
import { navigate } from '../App';
import { useI18n } from '../lib/i18n';
import { wt } from '../lib/webText';

function readHandoff(): string | null {
  // The API returns the one-time handoff in the normal query string
  // (?faceit_handoff=…#/faceit-callback). Also accept the hash form.
  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [, hashQuery = ''] = hash.split('?');
  const hashParams = new URLSearchParams(hashQuery);
  const value = searchParams.get('faceit_handoff') ?? hashParams.get('faceit_handoff') ?? searchParams.get('handoff') ?? hashParams.get('handoff');
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

/** Drop the one-time handoff from the address bar so it never lands in history or bookmarks. */
function cleanUrl(): void {
  window.history.replaceState(null, '', window.location.pathname);
}

export default function FaceitCallback() {
  const { lang } = useI18n();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const handoff = readHandoff();
      cleanUrl();
      try {
        if (!handoff) {
          await api.faceitStatus();
          navigate('home');
          return;
        }
        const auth = await api.exchangeFaceitHandoff(handoff);
        setAuthToken(auth.token);
        navigate('home');
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, []);

  return (
    <main className="splash">
      <div className="logo-mark">◆</div>
      <h1>{error ? wt(lang, 'signInFailed') : wt(lang, 'signingIn')}</h1>
      {error ? (
        <>
          <p className="error-banner">{error}</p>
          <button className="primary splash-login" onClick={() => navigate('splash')}>{wt(lang, 'backHome')}</button>
        </>
      ) : <div className="spinner" />}
    </main>
  );
}
