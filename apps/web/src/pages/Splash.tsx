import { useEffect, useState } from 'react';
import { api, clearAuthToken, hasAuthToken, setAuthToken } from '../lib/api';
import { getInitData } from '../lib/telegram';
import { navigate } from '../App';

const LOGGED_OUT_KEY = 'cs2coach.logged_out.v1';

export function markLoggedOut(): void {
  try {
    sessionStorage.setItem(LOGGED_OUT_KEY, '1');
  } catch {
    // Session storage is optional.
  }
}

export default function Splash() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);

  const login = async () => {
    setError(null);
    setBusy(true);
    try {
      try {
        sessionStorage.removeItem(LOGGED_OUT_KEY);
      } catch {
        // Session storage is optional.
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
  };

  useEffect(() => {
    let wasLoggedOut = false;
    try {
      wasLoggedOut = sessionStorage.getItem(LOGGED_OUT_KEY) === '1';
    } catch {
      // Session storage is optional.
    }

    if (wasLoggedOut) {
      clearAuthToken();
      setLoggedOut(true);
      return;
    }

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

        await login();
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, []);

  return (
    <main className="splash">
      <div className="logo-mark">◆</div>
      <h1>CS2 AI Coach</h1>
      <p className="muted">Live tactical coaching for your FACEIT matches</p>
      {busy && <div className="spinner" />}
      {loggedOut && !busy && (
        <button className="primary splash-login" onClick={login} type="button">
          Qayta kirish
        </button>
      )}
      {error && <p className="error-banner">{error}</p>}
    </main>
  );
}
