import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { radarFor, worldToRadar, type RadarLevel } from '../lib/radar';
import type { MatchDeathLite, MatchDeathsResponse } from '../lib/types';

const EARLY_S = 20;
const LATE_S = 90;
/** Deaths closer than this (world units, ~ a doorway or small corner) count as the same spot. */
const SPOT_RADIUS = 320;

const fmtTime = (s: number | null) => (s == null ? '—' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

/** The biggest group of deaths around one spot, if it repeats at least 3 times. */
function findHotspot(deaths: MatchDeathLite[]): MatchDeathLite[] | null {
  let best: MatchDeathLite[] = [];
  for (const d of deaths) {
    const near = deaths.filter((o) => Math.hypot(o.position.x - d.position.x, o.position.y - d.position.y) <= SPOT_RADIUS && Math.abs(o.position.z - d.position.z) < 150);
    if (near.length > best.length) best = near;
  }
  return best.length >= 3 ? best : null;
}

/**
 * Post-match death map: where and when the player (or their team) died,
 * recorded live from CS2 GSI. Enemy positions are not known here.
 */
export function DeathReview({ faceitMatchId }: { faceitMatchId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<MatchDeathsResponse | null>(null);
  const [scope, setScope] = useState<'me' | 'team'>('me');
  const [selected, setSelected] = useState<number | null>(null);
  const [manualLevel, setManualLevel] = useState<RadarLevel | null>(null);

  useEffect(() => {
    let alive = true;
    api.getMatchDeaths(faceitMatchId).then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, [faceitMatchId]);

  const radar = radarFor(data?.map);
  const deaths = useMemo(() => (data?.deaths ?? []).filter((d) => scope === 'team' || d.faceitPlayerId === data?.myFaceitId), [data, scope]);
  const placed = useMemo(() => (radar ? deaths.map((d, i) => ({ d, i, p: worldToRadar(radar, d.position) })) : []), [radar, deaths]);
  const hotspot = useMemo(() => findHotspot(deaths), [deaths]);

  if (!data || !radar) return null;
  if (data.deaths.length === 0) {
    return (
      <section className="card death-review">
        <span className="eyebrow">{t('deathTitle')}</span>
        <p className="muted death-empty">{t('deathEmpty')}</p>
      </section>
    );
  }

  const lowerCount = placed.filter((x) => x.p.level === 'lower').length;
  const autoLevel: RadarLevel = radar.lowerImage && lowerCount > placed.length / 2 ? 'lower' : 'upper';
  const level = radar.lowerImage ? manualLevel ?? autoLevel : 'upper';
  const image = level === 'lower' && radar.lowerImage ? radar.lowerImage : radar.image;

  const timed = deaths.filter((d) => d.seconds != null);
  const avg = timed.length ? timed.reduce((s, d) => s + (d.seconds ?? 0), 0) / timed.length : null;
  const early = timed.filter((d) => (d.seconds ?? 0) < EARLY_S);
  const late = timed.filter((d) => (d.seconds ?? 0) >= LATE_S);
  const lost = deaths.filter((d) => d.roundWon === false);
  const ct = deaths.filter((d) => d.side === 'CT').length;
  const tSide = deaths.filter((d) => d.side === 'T').length;

  const insights: string[] = [];
  if (early.length >= 3) insights.push(t('deathInsightEarly').replace('{n}', String(early.length)));
  if (hotspot) insights.push(t('deathInsightSpot').replace('{n}', String(hotspot.length)).replace('{rounds}', hotspot.map((d) => d.round).join(', ')));
  if (late.length >= 3) insights.push(t('deathInsightLate').replace('{n}', String(late.length)));
  if (Math.max(ct, tSide) >= 4 && Math.abs(ct - tSide) >= 3) {
    insights.push(t('deathInsightSide').replace('{side}', ct > tSide ? 'CT' : 'T').replace('{a}', String(Math.max(ct, tSide))).replace('{b}', String(Math.min(ct, tSide))));
  }
  if (insights.length === 0 && deaths.length >= 3) insights.push(t('deathInsightNone'));

  const spot = hotspot ? worldToRadar(radar, {
    x: hotspot.reduce((s, d) => s + d.position.x, 0) / hotspot.length,
    y: hotspot.reduce((s, d) => s + d.position.y, 0) / hotspot.length,
    z: hotspot[0]!.position.z,
  }) : null;

  return (
    <section className="card death-review">
      <header className="radar-head">
        <span className="eyebrow">{t('deathTitle')}</span>
        <div className="radar-levels" role="group">
          {(['me', 'team'] as const).map((s) => (
            <button key={s} type="button" className={scope === s ? 'active' : ''} onClick={() => { setScope(s); setSelected(null); }}>
              {s === 'me' ? t('deathMe') : t('deathTeam')}
            </button>
          ))}
          {radar.lowerImage && (['upper', 'lower'] as const).map((l) => (
            <button key={l} type="button" className={level === l ? 'active' : ''} onClick={() => setManualLevel(l === autoLevel ? null : l)}>
              {l === 'upper' ? t('radarUpper') : t('radarLower')}
            </button>
          ))}
        </div>
      </header>

      <div className="death-stats">
        <div><b>{deaths.length}</b><small>{t('deathCount')}</small></div>
        <div><b>{fmtTime(avg)}</b><small>{t('deathAvg')}</small></div>
        <div className={early.length >= 3 ? 'warn' : ''}><b>{early.length}</b><small>{t('deathEarly')}</small></div>
        <div><b>{lost.length}</b><small>{t('deathLost')}</small></div>
      </div>

      <div className="radar-stage">
        <img className="radar-map" src={image} alt={data.map ?? ''} draggable={false} />
        {spot && spot.level === level && <span className="death-hotspot" style={{ left: `${spot.left}%`, top: `${spot.top}%` }} aria-hidden />}
        {placed.filter((x) => x.p.level === level).map(({ d, i, p }) => (
          <button
            key={i}
            type="button"
            className={`death-mark ${d.roundWon === false ? 'lost' : ''} ${d.faceitPlayerId === data.myFaceitId ? 'me' : ''} ${selected === i ? 'selected' : ''}`}
            style={{ left: `${p.left}%`, top: `${p.top}%`, animationDelay: `${Math.min(i, 30) * 40}ms` }}
            onClick={() => setSelected(selected === i ? null : i)}
            title={`${t('deathRound')} ${d.round} · ${fmtTime(d.seconds)}`}
          >
            <span>{d.round}</span>
          </button>
        ))}
      </div>

      {insights.length > 0 && (
        <ul className="death-insights">
          {insights.map((text) => <li key={text}>{text}</li>)}
        </ul>
      )}

      <ol className="death-list">
        {deaths.map((d, i) => (
          <li key={i} className={selected === i ? 'selected' : ''}>
            <button type="button" onClick={() => setSelected(selected === i ? null : i)}>
              <b>R{d.round}</b>
              <span className="mono">{fmtTime(d.seconds)}</span>
              {d.side && <span className={`side ${d.side.toLowerCase()}`}>{d.side}</span>}
              {scope === 'team' && <span className="who">{d.nickname}</span>}
              {d.weapon && <span className="weapon">{d.weapon}</span>}
              {d.roundWon != null && <em className={d.roundWon ? 'won' : 'lost'}>{d.roundWon ? t('deathWon') : t('deathLostShort')}</em>}
            </button>
          </li>
        ))}
      </ol>
      <p className="radar-note">{t('deathEnemyNote')}</p>
    </section>
  );
}
