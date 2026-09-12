import { useEffect, useState } from 'react';
import { api, setAuthToken } from '../lib/api';
import { navigate } from '../App';

function readHandoff(): string | null {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  const value = params.get('handoff');
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export default function FaceitCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const handoff = readHandoff();
        if (!handoff) {
          // A normal Mini App reload may already have a valid persisted token.
          await api.faceitStatus();
          navigate('home');
          return;
        }

        const auth = await api.exchangeFaceitHandoff(handoff);
        setAuthToken(auth.token);
        // Remove the one-time handoff from browser history/URL before entering
        // the authenticated app.
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        navigate('home');
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, []);

  return (
    <main className="splash">
      <div className="logo-mark">◆</div>
      <h1>{error ? 'FACEIT connection failed' : 'Linking FACEIT…'}</h1>
      {error ? <p className="error-banner">{error}</p> : <div className="spinner" />}
    </main>
  );
}