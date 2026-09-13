import { useEffect, useMemo, useState } from 'react';
import Splash from './pages/Splash';
import Home from './pages/Home';
import Matches from './pages/Matches';
import MatchPage from './pages/MatchPage';
import PostMatch from './pages/PostMatch';
import FaceitCallback from './pages/FaceitCallback';
import { hasAuthToken } from './lib/api';

export type Route = 'splash' | 'home' | 'matches' | 'match' | 'post-match' | 'faceit-callback';

function parseHash(): { route: Route; param?: string } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [pathPart, param] = raw.split('/');
  const path = pathPart.split('?')[0];
  switch (path) {
    case 'home': return { route: 'home' };
    case 'matches': return { route: 'matches' };
    case 'match': return { route: 'match', param: param ? decodeURIComponent(param.split('?')[0]) : undefined };
    case 'post-match': return { route: 'post-match', param: param ? decodeURIComponent(param.split('?')[0]) : undefined };
    case 'faceit-callback': return { route: 'faceit-callback' };
    default: return { route: 'splash' };
  }
}

export function navigate(route: Route, param?: string): void {
  const suffix = param ? `/${encodeURIComponent(param)}` : '';
  window.location.hash = `/${route}${suffix}`;
}

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => { const onHash = () => setHash(window.location.hash); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  const current = useMemo(() => parseHash(), [hash]);
  if (current.route !== 'splash' && current.route !== 'faceit-callback' && !hasAuthToken()) return <Splash />;
  switch (current.route) {
    case 'home': return <Home />;
    case 'matches': return <Matches />;
    case 'match': return current.param ? <MatchPage key={current.param} faceitMatchId={current.param} /> : <Matches />;
    case 'post-match': return current.param ? <PostMatch key={current.param} faceitMatchId={current.param} /> : <Matches />;
    case 'faceit-callback': return <FaceitCallback />;
    default: return <Splash />;
  }
}
