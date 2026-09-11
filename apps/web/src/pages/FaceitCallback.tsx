import { useEffect } from 'react';
import { navigate } from '../App';

export default function FaceitCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ok') === '1') {
      navigate('home');
    } else {
      navigate('home');
    }
  }, []);

  return (
    <main className="splash">
      <div className="logo-mark">◆</div>
      <h1>Linking FACEIT…</h1>
      <div className="spinner" />
    </main>
  );
}