import type { FastifyInstance } from 'fastify';
import { AppError, codes, type FaceitPlayerRef, type FaceitTeamRef, type GameEvent } from '@cs2coach/shared';
import { addMatchPlayer, findFaceitAccountByFaceitUserId, getMatchByFaceitId, listMatchesForUser, upsertMatchFromFaceit, upsertPlayer } from '@cs2coach/database';
import type { FaceitMatchDetail } from '@cs2coach/faceit';
import type { AppConfig } from '../config';

type GsiBody = Record<string, any>;
type GsiMemory = { phase?: string; round: number; finished?: boolean };
const gsiMemory = new Map<string, GsiMemory>();

function teamRef(faction: Record<string, any> | undefined): FaceitTeamRef | undefined {
  if (!faction) return undefined;
  const roster = Array.isArray(faction.roster) ? faction.roster : Array.isArray(faction.members) ? faction.members : [];
  return {
    teamId: typeof faction.team_id === 'string' ? faction.team_id : undefined,
    name: typeof faction.nickname === 'string' ? faction.nickname : undefined,
    players: roster.filter((m: any) => typeof m?.player_id === 'string' && typeof m?.nickname === 'string').map((m: any) => ({ faceitPlayerId: m.player_id, nickname: m.nickname, avatar: m.avatar, skillLevel: m.skill_level })),
  };
}
function positionOf(player: any): { x: number; y: number; z: number } | undefined {
  if (typeof player?.position !== 'string') return undefined;
  const parts = player.position.split(',').map((v: string) => Number(v.trim()));
  return parts.length === 3 && parts.every(Number.isFinite) ? { x: parts[0], y: parts[1], z: parts[2] } : undefined;
}
function weaponNames(player: any): string[] {
  if (!player?.weapons || typeof player.weapons !== 'object') return [];
  return Object.values(player.weapons).map((weapon: any) => weapon?.name).filter((v): v is string => typeof v === 'string').slice(0, 16);
}
function currentRound(body: GsiBody): number {
  const ct = Number(body.map?.team_ct?.score ?? 0);
  const t = Number(body.map?.team_t?.score ?? 0);
  return Number.isFinite(ct + t) ? Math.max(1, ct + t + 1) : 1;
}

async function findActiveFaceitMatch(config: AppConfig, userId: string, faceitPlayerId: string, gamePlayerId: string): Promise<FaceitMatchDetail | null> {
  const dbMatches = await listMatchesForUser(config.db, { userId, limit: 10 });
  const active = dbMatches.find((m) => ['scheduled', 'configuring', 'ready', 'ongoing'].includes(String(m.status)));
  if (active) return config.faceitClient.getMatchById(active.faceitMatchId);

  const history = await config.faceitClient.getPlayerMatches(faceitPlayerId, { offset: 0, limit: 20 });
  const candidate = (history.items ?? []).find((item) => {
    const status = String(item.status ?? '').toLowerCase();
    if (['finished', 'aborted', 'cancelled'].includes(status)) return false;
    if (item.playing_players?.includes(gamePlayerId)) return true;
    return Object.values(item.teams ?? {}).some((team: any) => (team.roster ?? team.players ?? team.members ?? []).some((p: any) => p.game_player_id === gamePlayerId));
  });
  return candidate ? config.faceitClient.getMatchById(candidate.match_id) : null;
}

export async function gameStateGsiRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.post('/api/game-state/gsi', async (request, reply) => {
    const expectedToken = config.env.cs2GsiToken;
    if (config.env.isProduction && !expectedToken) throw new AppError(codes.missingEnv, 'CS2_GSI_TOKEN is not configured', 503);
    const body = (request.body ?? {}) as GsiBody;
    if (expectedToken && body.auth?.token !== expectedToken) throw new AppError(codes.unauthorized, 'Invalid CS2 GSI token', 401);

    const steamId = typeof body.player?.steamid === 'string' ? body.player.steamid : typeof body.provider?.steamid === 'string' ? body.provider.steamid : null;
    if (!steamId) return reply.code(202).send({ ok: true, waiting: true, reason: 'player steamid unavailable' });

    let faceitPlayer;
    try { faceitPlayer = await config.faceitClient.getPlayerByGamePlayerId(steamId, 'cs2'); }
    catch { return reply.code(202).send({ ok: true, waiting: true, reason: 'FACEIT player not resolved from CS2 SteamID' }); }
    const account = await findFaceitAccountByFaceitUserId(config.db, faceitPlayer.player_id);
    if (!account) return reply.code(202).send({ ok: true, waiting: true, reason: 'CS2 SteamID is not linked to CS2 Ustoz' });

    const detail = await findActiveFaceitMatch(config, account.userId, faceitPlayer.player_id, steamId);
    if (!detail) return reply.code(202).send({ ok: true, waiting: true, reason: 'No active FACEIT match found for linked player' });

    const match = await upsertMatchFromFaceit(config.db, {
      faceitMatchId: detail.match_id,
      game: detail.game ?? 'cs2',
      competition: detail.competition_name ?? detail.competition_id ?? null,
      map: detail.details?.map ?? body.map?.name ?? null,
      status: 'ongoing',
      startedAtMs: detail.started_at ? detail.started_at * 1000 : Date.now(),
      finishedAtMs: null,
      scoreA: detail.results?.score?.faction1 ?? 0,
      scoreB: detail.results?.score?.faction2 ?? 0,
    });
    const playerRow = await upsertPlayer(config.db, { faceitPlayerId: faceitPlayer.player_id, nickname: faceitPlayer.nickname, avatar: faceitPlayer.avatar, country: faceitPlayer.country, skillLevel: faceitPlayer.games?.cs2?.skill_level, elo: faceitPlayer.games?.cs2?.faceit_elo });
    const factions = Object.values(detail.teams ?? {}) as Array<Record<string, any>>;
    const userFactionIndex = factions.findIndex((f) => (f.roster ?? f.members ?? []).some((p: any) => p.player_id === faceitPlayer.player_id || p.game_player_id === steamId));
    await addMatchPlayer(config.db, { matchId: match.id, playerId: playerRow.id, team: userFactionIndex === 1 ? 'B' : 'A' });

    const a = teamRef(factions[0]);
    const b = teamRef(factions[1]);
    const memory = gsiMemory.get(detail.match_id) ?? { round: 0 };
    const events: GameEvent[] = [];
    const mapName = typeof body.map?.name === 'string' ? body.map.name : detail.details?.map;

    if (!config.matchStateEngine.has(detail.match_id)) {
      events.push({ type: 'match_started', matchId: detail.match_id, ts: Date.now(), map: mapName, teams: { a, b } });
    }

    const round = currentRound(body);
    const phase = typeof body.round?.phase === 'string' ? body.round.phase : undefined;
    if (memory.round !== round && phase === 'freezetime') events.push({ type: 'round_started', matchId: detail.match_id, ts: Date.now(), round, side: body.player?.team === 'CT' ? 'CT' : body.player?.team === 'T' ? 'T' : undefined });
    if (memory.phase !== 'over' && phase === 'over') events.push({ type: 'round_ended', matchId: detail.match_id, ts: Date.now(), round, winner: body.round?.win_team === 'CT' || body.round?.win_team === 'T' ? body.round.win_team : undefined });

    const ctScore = Number(body.map?.team_ct?.score ?? 0);
    const tScore = Number(body.map?.team_t?.score ?? 0);
    if (Number.isFinite(ctScore) && Number.isFinite(tScore)) {
      const userIsFactionA = userFactionIndex !== 1;
      const userSide = body.player?.team === 'T' ? 'T' : 'CT';
      const scoreA = userIsFactionA ? (userSide === 'CT' ? ctScore : tScore) : (userSide === 'CT' ? tScore : ctScore);
      const scoreB = userIsFactionA ? (userSide === 'CT' ? tScore : ctScore) : (userSide === 'CT' ? ctScore : tScore);
      events.push({ type: 'score_updated', matchId: detail.match_id, ts: Date.now(), scoreA, scoreB });
    }

    const local = body.player ?? {};
    const state = local.state ?? {};
    const stats = local.match_stats ?? {};
    const localTeam = userFactionIndex === 1 ? 'B' : 'A';
    const playerRef: FaceitPlayerRef = { faceitPlayerId: faceitPlayer.player_id, nickname: faceitPlayer.nickname, avatar: faceitPlayer.avatar, country: faceitPlayer.country, skillLevel: faceitPlayer.games?.cs2?.skill_level, elo: faceitPlayer.games?.cs2?.faceit_elo };
    events.push({ type: 'player_state_updated', matchId: detail.match_id, ts: Date.now(), player: playerRef, team: localTeam, alive: Number(state.health ?? 0) > 0, hp: typeof state.health === 'number' ? state.health : undefined, kills: typeof stats.kills === 'number' ? stats.kills : undefined, deaths: typeof stats.deaths === 'number' ? stats.deaths : undefined, assists: typeof stats.assists === 'number' ? stats.assists : undefined, weapons: weaponNames(local), position: positionOf(local) });

    if (body.bomb?.state === 'planted' || body.bomb?.state === 'defused' || body.bomb?.state === 'exploded') events.push({ type: 'bomb_state', matchId: detail.match_id, ts: Date.now(), planted: body.bomb.state === 'planted', defused: body.bomb.state === 'defused' });
    if (body.map?.phase === 'gameover' && !memory.finished) events.push({ type: 'match_status_finished', matchId: detail.match_id, ts: Date.now() });

    config.matchStateEngine.applyEvents(events);
    gsiMemory.set(detail.match_id, { phase, round, finished: body.map?.phase === 'gameover' });
    config.aiCoordinator.processNext();
    return reply.send({ ok: true, data: { matchId: detail.match_id, state: config.matchStateEngine.getState(detail.match_id), receivedAt: Date.now() } });
  });
}
