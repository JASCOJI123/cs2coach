import type { Sql } from 'postgres';
import type { MatchStatus } from '@cs2coach/shared';
import { addMatchPlayer, upsertMatchFromFaceit, upsertPlayer } from './index';

interface FaceitHistoryItem {
  match_id: string;
  game?: string;
  competition_id?: string;
  competition_name?: string;
  status?: string;
  started_at?: number;
  finished_at?: number;
  teams?: Record<string, { members?: Array<{ player_id: string }> }>;
  results?: { score?: { faction1?: number; faction2?: number } };
  details?: { map?: string };
}

const MATCH_STATUSES = new Set<MatchStatus>([
  'scheduled',
  'configuring',
  'ready',
  'ongoing',
  'finished',
  'aborted',
  'cancelled',
]);

function normalizeStatus(item: FaceitHistoryItem): MatchStatus {
  const raw = String(item.status ?? '').toLowerCase();
  if (MATCH_STATUSES.has(raw as MatchStatus)) return raw as MatchStatus;
  if (raw.includes('cancel')) return 'cancelled';
  if (raw.includes('abort')) return 'aborted';
  if (raw.includes('start') || raw.includes('ongo')) return 'ongoing';
  if (raw.includes('ready')) return 'ready';
  if (item.finished_at) return 'finished';
  if (item.started_at) return 'ongoing';
  return 'finished';
}

function playerTeam(item: FaceitHistoryItem, playerId: string): 'A' | 'B' {
  const factions = Object.values(item.teams ?? {});
  const index = factions.findIndex((faction) =>
    faction.members?.some((member) => member.player_id === playerId),
  );
  return index === 1 ? 'B' : 'A';
}

export async function syncFaceitPlayerHistory(
  sql: Sql,
  input: {
    faceitPlayerId: string;
    nickname: string;
    avatar?: string | null;
    country?: string | null;
    skillLevel?: number | null;
    elo?: number | null;
    items: FaceitHistoryItem[];
  },
): Promise<void> {
  const player = await upsertPlayer(sql, {
    faceitPlayerId: input.faceitPlayerId,
    nickname: input.nickname,
    avatar: input.avatar,
    country: input.country,
    skillLevel: input.skillLevel,
    elo: input.elo,
  });

  for (const item of input.items) {
    if (!item.match_id) continue;

    const match = await upsertMatchFromFaceit(sql, {
      faceitMatchId: item.match_id,
      game: item.game ?? 'cs2',
      competition: item.competition_name ?? item.competition_id ?? null,
      map: item.details?.map ?? null,
      status: normalizeStatus(item),
      startedAtMs: item.started_at ? item.started_at * 1000 : null,
      finishedAtMs: item.finished_at ? item.finished_at * 1000 : null,
      scoreA: item.results?.score?.faction1 ?? 0,
      scoreB: item.results?.score?.faction2 ?? 0,
    });

    await addMatchPlayer(sql, {
      matchId: match.id,
      playerId: player.id,
      team: playerTeam(item, input.faceitPlayerId),
    });
  }
}
