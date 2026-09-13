import { useEffect, useState } from 'react';
import { api, setAuthToken } from '../lib/api';
import { navigate } from '../App';

function readHandoff(): string | null {
  // The API intentionally returns the one-time handoff in the normal query
  // string. Also accept the hash form for backwards compatibility with old
  // deployed Mini App URLs.
  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [, hashQuery = ''] = hash.split('?');
  const hashParams = new URLSearchParams(hashQuery);
  const value = searchParams.get('faceit_handoff') ?? hashParams.get('faceit_handoff') ?? searchParams.get('handoff') ?? hashParams.get('handoff');
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export default function FaceitCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const handoff = readHandoff();
        if (!handoff) {
          await api.faceitStatus();
          navigate('home');
          return;
        }
        const auth = await api.exchangeFaceitHandoff(handoff);
        setAuthToken(auth.token);
        window.history.replaceState(null, '', window.location.pathname + window.location.hash.replace(/([?&])(?:faceit_)?handoff=[a-f0-9]{64}&?/, '$1').replace(/[?&]$/, ''));
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
