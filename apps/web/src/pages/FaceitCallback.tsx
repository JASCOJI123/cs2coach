import { useEffect } from 'react';
import { navigate } from '../App';

export default function FaceitCallback() {
  useEffect(() => {
    // The API redirects to `#/faceit-callback?ok=1`; the query lives inside the
    // hash (window.location.search is empty in our hash-based router). Either
    // outcome lands on Home, which re-reads the live FACEIT status.
    navigate('home');
  }, []);

  return (
    <main className="splash">
      <div className="logo-mark">◆</div>
      <h1>Linking FACEIT…</h1>
      <div className="spinner" />
    </main>
  );
}