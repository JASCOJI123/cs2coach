import { useCallback, useEffect, useRef, useState } from 'react';
import { api, authTokenOrThrow } from '../lib/api';
import { openLiveCoach } from '../lib/ws';
import { navigate } from '../App';
import { TacticalHud } from '../components/TacticalHud';
import { LiveScore } from '../components/LiveScore';
import type { MatchStateLite, TacticalDecisionLite } from '../lib/types';

interface Props {
  faceitMatchId: string;
}

export default function MatchPage({ faceitMatchId }: Props) {
  const [state, setState] = useState<MatchStateLite | null>(null);
  const [decision, setDecision] = useState<TacticalDecisionLite | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef('');

  useEffect(() => {
    try {
      tokenRef.current = authTokenOrThrow();
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    // Initial fetch
    void (async () => {
      try {
        const match = await api.getMatch(faceitMatchId);
        if (match.live) setState(match.live);
      } catch (err) {
        setError((err as Error).message);
      }
    })();

    // WS subscribe
    const close = openLiveCoach(faceitMatchId, tokenRef.current, {
      onState: (s) => setState(s),
      onDecision: (d) => setDecision(d),
      onConnection: (c) => setConnected(c),
    });
    return () => close();
  }, [faceitMatchId]);

  // REST fallback poll (keeps the HUD live if the socket drops)
  const poll = useCallback(async () => {
    try {
      const match = await api.getMatch(faceitMatchId);
      if (match.live) setState(match.live);
    } catch {
      /* wait for next tick */
    }
  }, [faceitMatchId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!connected) void poll();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [connected, poll]);

  const askCoach = async () => {
    try {
      const d = await api.requestCoach(faceitMatchId);
      setDecision(d);
    } catch {
      /* the WS push will deliver it */
    }
  };

  return (
    <main className="panel match">
      <header className="topbar">
        <button className="back" onClick={() => navigate('matches')}>‹</button>
        <h1>Live Coach</h1>
      </header>

      {error && !state && <p className="error-banner">{error}</p>}

      {state && (
        <>
          <LiveScore state={state} />
          <TacticalHud state={state} decision={decision} connected={connected} />
          <button className="secondary" onClick={askCoach} style={{ marginTop: 12 }}>Ask the coach now</button>
        </>
      )}
    </main>
  );
}