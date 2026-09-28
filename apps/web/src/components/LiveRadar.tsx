import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { radarFor, siteForAction, worldToRadar, type RadarLevel } from '../lib/radar';
import type { MatchStateLite, TacticalDecisionLite } from '../lib/types';

interface Props {
  state: MatchStateLite;
  decision: TacticalDecisionLite | null;
  myTeam: 'A' | 'B';
}

// The signed-in player's FACEIT id, fetched once per page load.
let meRequest: Promise<string | null> | null = null;
function useMyFaceitId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    meRequest ??= api.faceitStatus().then((s) => s.faceitUserId ?? null).catch(() => null);
    let alive = true;
    void meRequest.then((v) => { if (alive) setId(v); });
    return () => { alive = false; };
  }, []);
  return id;
}

/**
 * Live radar: the player's own team on the real map overview. The server only
 * ever sends own-team positions (see api ws/team-view.ts), so enemies never
 * appear here — this is a coaching view, not a wallhack.
 */
export function LiveRadar({ state, decision, myTeam }: Props) {
  const { t } = useI18n();
  const meId = useMyFaceitId();
  const radar = radarFor(state.map);
  const [manualLevel, setManualLevel] = useState<RadarLevel | null>(null);

  const dots = useMemo(() => {
    if (!radar) return [];
    return state.players
      .filter((p) => p.team === myTeam)
      .flatMap((p) => {
        const samples = state.positions?.[p.faceitPlayerId] ?? [];
        const last = samples[samples.length - 1];
        if (!last) return [];
        const point = worldToRadar(radar, last);
        const trail = samples.slice(-8, -1).map((s) => worldToRadar(radar, s));
        return [{ id: p.faceitPlayerId, nickname: p.nickname, alive: p.alive, hp: p.hp, me: p.faceitPlayerId === meId, point, trail }];
      });
  }, [radar, state.players, state.positions, myTeam, meId]);

  if (!radar) return null;

  const mine = dots.find((d) => d.me);
  const autoLevel: RadarLevel = mine?.point.level ?? 'upper';
  const level = radar.lowerImage ? manualLevel ?? autoLevel : 'upper';
  const image = level === 'lower' && radar.lowerImage ? radar.lowerImage : radar.image;
  const site = siteForAction(decision?.recommendation.action);
  const visible = dots.filter((d) => d.point.level === level);

  return (
    <section className="card live-radar">
      <header className="radar-head">
        <span className="eyebrow">{t('radarTitle')}</span>
        {radar.lowerImage && (
          <div className="radar-levels" role="group">
            {(['upper', 'lower'] as const).map((l) => (
              <button key={l} type="button" className={level === l ? 'active' : ''} onClick={() => setManualLevel(l === autoLevel ? null : l)}>
                {l === 'upper' ? t('radarUpper') : t('radarLower')}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="radar-stage">
        <img className="radar-map" src={image} alt={state.map ?? ''} draggable={false} />
        <div className="radar-sweep" aria-hidden />
        {(['A', 'B'] as const).map((s) => (
          <span key={s} className={`radar-site ${site === s ? 'hot' : ''}`} style={{ left: `${radar.sites[s][0] * 100}%`, top: `${radar.sites[s][1] * 100}%` }}>
            {s}
          </span>
        ))}
        {visible.map((d) => (
          <div key={d.id} className="radar-player-wrap">
            {d.trail.filter((p) => p.level === level).map((p, i, arr) => (
              <i key={i} className="radar-trail" style={{ left: `${p.left}%`, top: `${p.top}%`, opacity: ((i + 1) / (arr.length + 1)) * 0.5 }} />
            ))}
            <span
              className={`radar-dot ${d.me ? 'me' : ''} ${d.alive ? '' : 'dead'}`}
              style={{ left: `${d.point.left}%`, top: `${d.point.top}%`, '--hp': Math.max(0, Math.min(100, d.hp)) } as CSSProperties}
            >
              <b>{d.me ? t('radarYou') : d.nickname}</b>
            </span>
          </div>
        ))}
        {dots.length === 0 && <p className="radar-empty">{t('radarWaiting')}</p>}
      </div>
      <p className="radar-note">{t('radarTeamOnly')}</p>
    </section>
  );
}
