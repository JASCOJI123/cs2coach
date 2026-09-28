import type { Sql } from 'postgres';

export interface PlayerDeathRow {
  matchId: string;
  faceitPlayerId: string;
  nickname: string;
  roundNumber: number;
  secondsIntoRound: number | null;
  side: 'CT' | 'T' | null;
  x: number;
  y: number;
  z: number;
  weapon: string | null;
  roundWon: boolean | null;
}

export interface InsertPlayerDeathInput {
  matchId: string;
  playerId: string;
  roundNumber: number;
  secondsIntoRound: number | null;
  side: 'CT' | 'T' | null;
  x: number;
  y: number;
  z: number;
  weapon: string | null;
}

/** One death per player per round; a repeated GSI tick for the same round is ignored. */
export async function insertPlayerDeath(sql: Sql, input: InsertPlayerDeathInput): Promise<void> {
  await sql`insert into player_deaths (match_id, player_id, round_number, seconds_into_round, side, x, y, z, weapon)
    values (${input.matchId}, ${input.playerId}, ${input.roundNumber}, ${input.secondsIntoRound}, ${input.side}, ${input.x}, ${input.y}, ${input.z}, ${input.weapon})
    on conflict (match_id, player_id, round_number) do nothing`;
}

/** Marks whether the player's side won the rounds they died in. */
export async function setDeathRoundOutcome(sql: Sql, input: { matchId: string; roundNumber: number; winnerSide: 'CT' | 'T' }): Promise<void> {
  await sql`update player_deaths set round_won = (side = ${input.winnerSide})
    where match_id = ${input.matchId} and round_number = ${input.roundNumber} and side is not null`;
}

/** Deaths in a match for players of one team, oldest round first. */
export async function listTeamDeaths(sql: Sql, input: { matchId: string; team: 'A' | 'B' }): Promise<PlayerDeathRow[]> {
  return sql<PlayerDeathRow[]>`select d.match_id, p.faceit_player_id, p.nickname, d.round_number, d.seconds_into_round, d.side, d.x, d.y, d.z, d.weapon, d.round_won
    from player_deaths d
    join players p on p.id = d.player_id
    join match_players mp on mp.match_id = d.match_id and mp.player_id = d.player_id
    where d.match_id = ${input.matchId} and mp.team = ${input.team}
    order by d.round_number asc, d.seconds_into_round asc nulls last`;
}
