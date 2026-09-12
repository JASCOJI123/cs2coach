/**
 * GameStateNormalizer (spec §24): converts raw, external payloads into typed
 * `GameEvent`s. Strict so a spoofed or malformed payload can never inject
 * fabricated game state. Only callers behind authorization may use this.
 */
import type { GameEvent } from '@cs2coach/shared';
export type NormalizedResult = { ok: true; event: GameEvent } | { ok: false; reason: string };
const MATCH_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const NICKNAME_RE = /^[^\n]{1,80}$/;
function str(v: unknown, re: RegExp): string | null { return typeof v === 'string' && re.test(v) ? v : null; }
function num(v: unknown): number | null { return typeof v === 'number' && Number.isFinite(v) ? v : null; }

export function normalizeExternalGameEvent(raw: unknown): NormalizedResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, reason: 'payload must be an object' };
  const obj = raw as Record<string, unknown>;
  const type = str(obj.type, /^[a-z_]{1,48}$/);
  if (!type) return { ok: false, reason: 'missing type' };
  const matchId = str(obj.matchId, MATCH_ID_RE) ?? str(obj.match_id, MATCH_ID_RE);
  if (!matchId) return { ok: false, reason: 'missing matchId' };
  const ts = num(obj.ts) ?? Date.now();
  const base = { matchId, ts };

  switch (type) {
    case 'round_started': { const round = num(obj.round); const side = str(obj.side, /^(CT|T)$/) as 'CT' | 'T' | null; if (round === null) return { ok: false, reason: 'round_started requires round' }; return { ok: true, event: { type: 'round_started', ...base, round, side: side ?? undefined } }; }
    case 'round_ended': { const round = num(obj.round); if (round === null) return { ok: false, reason: 'round_ended requires round' }; return { ok: true, event: { type: 'round_ended', ...base, round, winner: str(obj.winner, /^(CT|T)$/) ?? undefined, reason: typeof obj.reason === 'string' ? obj.reason.slice(0, 200) : undefined } }; }
    case 'score_updated': { const a = num(obj.scoreA ?? obj.score_a); const b = num(obj.scoreB ?? obj.score_b); if (a === null || b === null) return { ok: false, reason: 'score_updated requires scoreA and scoreB' }; return { ok: true, event: { type: 'score_updated', ...base, scoreA: a, scoreB: b } }; }
    case 'player_state_updated': {
      const playerId = str(obj.playerId ?? obj.player_id, MATCH_ID_RE);
      const nickname = str(obj.nickname ?? obj.player, NICKNAME_RE);
      const team = str(obj.team, /^(A|B)$/) as 'A' | 'B' | null;
      if (!playerId || !nickname || !team) return { ok: false, reason: 'player_state_updated requires playerId, nickname and team' };
      const pos = typeof obj.position === 'object' && obj.position !== null ? obj.position as Record<string, unknown> : undefined;
      const x = num(pos?.x); const y = num(pos?.y); const z = num(pos?.z);
      return { ok: true, event: { type: 'player_state_updated', ...base, player: { faceitPlayerId: playerId, nickname }, team, alive: obj.alive !== false, hp: num(obj.hp) ?? undefined, kills: num(obj.kills) ?? undefined, deaths: num(obj.deaths) ?? undefined, assists: num(obj.assists) ?? undefined, weapons: Array.isArray(obj.weapons) ? obj.weapons.filter((v): v is string => typeof v === 'string').slice(0, 16) : undefined, position: x !== null && y !== null && z !== null ? { x, y, z } : undefined } };
    }
    case 'player_kill': { const round = num(obj.round) ?? 0; const killerN = str(obj.killer, NICKNAME_RE); const victimN = str(obj.victim, NICKNAME_RE); if (!killerN || !victimN) return { ok: false, reason: 'player_kill requires killer and victim nicknames' }; const attackerId = str(obj.killerId, MATCH_ID_RE); const victimId = str(obj.victimId, MATCH_ID_RE); return { ok: true, event: { type: 'player_kill', ...base, round, killer: { faceitPlayerId: attackerId ?? killerN, nickname: killerN }, victim: { faceitPlayerId: victimId ?? victimN, nickname: victimN }, weapon: typeof obj.weapon === 'string' ? obj.weapon.slice(0, 40) : undefined, headshot: obj.headshot === true, site: str(obj.site, /^(A|B)$/) as 'A' | 'B' | undefined } }; }
    case 'bomb_state': return { ok: true, event: { type: 'bomb_state', ...base, planted: obj.planted === true, site: str(obj.site, /^(A|B)$/) as 'A' | 'B' | undefined, defused: obj.defused === true ? true : undefined } };
    case 'map_selected': { const map = str(obj.map, /^[A-Za-z0-9 _-]{1,40}$/); if (!map) return { ok: false, reason: 'map_selected requires map' }; return { ok: true, event: { type: 'map_selected', ...base, map } }; }
    case 'match_status_finished': return { ok: true, event: { type: 'match_status_finished', ...base } };
    default: return { ok: false, reason: `unsupported event type: ${type}` };
  }
}
