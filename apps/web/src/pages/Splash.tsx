import { useEffect, useState } from 'react';
import { api, clearAuthToken, hasAuthToken, setAuthToken } from '../lib/api';
import { getInitData } from '../lib/telegram';
import { navigate } from '../App';

export default function Splash() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        // A persisted JWT survives Mini App reloads and the FACEIT OAuth
        // browser round-trip. Validate it against the API before using it.
        if (hasAuthToken()) {
          try {
            await api.faceitStatus();
            navigate('home');
            return;
          } catch (err) {
            if ((err as { status?: number }).status !== 401) throw err;
            clearAuthToken();
          }
        }

        const initData = getInitData();
        if (!initData) {
          setError('Open this app from the Telegram bot via "OPEN AI COACH".');
          return;
        }

        const auth = await api.login(initData);
        setAuthToken(auth.token);
        navigate('home');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  return (
    <main className="splash">
      <div className="logo-mark">◆</div>
      <h1>CS2 AI Coach</h1>
      <p className="muted">Live tactical coaching for your FACEIT matches</p>
      {busy && <div className="spinner" />}
      {error && <p className="error-banner">{error}</p>}
    </main>
  );
}