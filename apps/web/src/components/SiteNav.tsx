import { navigate } from '../App';
import { useI18n } from '../lib/i18n';
import { wt } from '../lib/webText';

type Section = 'home' | 'matches' | 'live' | 'analysis' | 'settings';

/** Shared site navigation: bottom tab bar on phones, top bar on desktop (see web-layout.css). */
export default function SiteNav({ active, liveMatchId }: { active: Section; liveMatchId?: string | null }) {
  const { t, lang } = useI18n();
  const cls = (s: Section) => (active === s ? 'active' : '');
  return (
    <nav className="bottom-nav site-nav">
      <button className="site-nav-brand" onClick={() => navigate('home')} aria-label="CS2USTOZ">
        <span className="brand-mark">C</span><strong>CS2<span>USTOZ</span></strong>
      </button>
      <button className={cls('home')} onClick={() => navigate('home')}><span>⌂</span><small>{t('home')}</small></button>
      <button className={cls('matches')} onClick={() => navigate('matches')}><span>◫</span><small>{t('matches')}</small></button>
      {active === 'analysis'
        ? <button className="active"><span>◈</span><small>{t('patterns')}</small></button>
        : <button className={cls('live')} onClick={() => liveMatchId && navigate('match', liveMatchId)} disabled={!liveMatchId}><span>⌁</span><small>{t('liveAi')}</small></button>}
      <button className={cls('settings')} onClick={() => navigate('settings')}><span>⚙</span><small>{wt(lang, 'settings')}</small></button>
    </nav>
  );
}
