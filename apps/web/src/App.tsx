import { useEffect, useMemo, useState } from 'react';
import Splash from './pages/Splash';
import Home from './pages/Home';
import Matches from './pages/Matches';
import MatchPage from './pages/MatchPage';
import FaceitCallback from './pages/FaceitCallback';

export type Route = 'splash' | 'home' | 'matches' | 'match' | 'faceit-callback';

function parseHash(): { route: Route; param?: string } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [pathPart, param] = raw.split('/');
  // Strip any query string (?ok=1) that may follow the path inside the hash.
  const path = pathPart.split('?')[0];
  switch (path) {
    case 'home':
      return { route: 'home' };
    case 'matches':
      return { route: 'matches' };
    case 'match':
      return { route: 'match', param: param ? decodeURIComponent(param.split('?')[0]) : undefined };
    case 'faceit-callback':
      return { route: 'faceit-callback' };
    default:
      return { route: 'splash' };
  }
}

export function navigate(route: Route, param?: string): void {
  const suffix = param ? `/${encodeURIComponent(param)}` : '';
  window.location.hash = `/${route}${suffix}`;
}

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const current = useMemo(() => parseHash(), [hash]);

  switch (current.route) {
    case 'home':
      return <Home />;
    case 'matches':
      return <Matches />;
    case 'match':
      return <MatchPage key={current.param ?? ''} faceitMatchId={current.param ?? ''} />;
    case 'faceit-callback':
      return <FaceitCallback />;
    default:
      return <Splash />;
  }
}