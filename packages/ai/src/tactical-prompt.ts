/**
 * Tactical prompt builder (spec §15, §50). Compresses state to a bounded
 * payload and instructs the model to return structured JSON. The prompt always
 * includes the "DATA_UNAVAILABLE" clause so Groq cannot fabricate live data.
 */
import { pickTopPatterns, type MatchState } from '@cs2coach/shared';
import type { GroqChatMessage } from './groq-client';

const DATA_UNAVAILABLE = 'CRITICAL: Never invent live game data. If a value is unknown say "unavailable". Do not say "winning" or "losing" without score numbers.';

const MAX_PATTERNS = 6;

export interface TacticalPromptInput {
  state: MatchState;
  userTeamId: 'A' | 'B';
  language?: 'uz' | 'ru' | 'en';
}

export function buildTacticalPrompt(input: TacticalPromptInput): GroqChatMessage[] {
  const { state, userTeamId } = input;
  const language = input.language ?? 'uz';
  const languageName = language === 'ru' ? 'Russian' : language === 'en' ? 'English' : 'Uzbek (Latin)';

  const compressed: Record<string, unknown> = {
    map: state.map ?? 'unknown',
    phase: state.phase,
    status: state.status,
    round: state.round ?? 0,
    side: state.side,
    score: { a: state.score.a, b: state.score.b },
    userTeam: userTeamId,
    playersAlive: state.alivePlayers.map((p) => ({
      name: p.nickname,
      role: p.role,
      kills: p.kills,
      deaths: p.deaths,
      alive: p.alive,
    })),
    economy: state.economy
      ? { a: { money: state.economy.a.money, buyType: state.economy.a.buyType }, b: { money: state.economy.b.money, buyType: state.economy.b.buyType } }
      : null,
    bomb: state.bomb.planted ? { planted: true, site: state.bomb.site ?? 'unknown' } : { planted: false },
    previousRoundsSummary: state.previousRounds.slice(-4).map((r) => ({
      round: r.round,
      winner: r.winner,
      reason: r.winReason,
    })),
    opponentPatterns: pickTopPatterns(state.opponentPatterns, MAX_PATTERNS).map((p) => ({
      location: p.location,
      confidence: p.confidence,
      frequency: p.frequency,
      sampleSize: p.sampleSize,
    })),
    demoMode: state.demoMode,
    stateHash: state.stateHash,
    timestamp: state.timestamp,
  };

  const systemMessage = `You are a CS2 tactical coach (spec §15). Write all human-readable text fields (detail, nickname-independent instructions, analysis, signal labels/details) in ${languageName}. Keep action, confidence, role identifiers, and IDs exactly as required by the schema. Return ONLY valid JSON with this exact shape:
{
  "recommendation": {
    "action": "<ACTION_TYPE>",
    "detail": "<brief tactical call>",
    "priority": 1-5,
    "confidence": "HIGH"|"MEDIUM"|"LOW",
    "expiresAt": <epoch_ms|null>
  },
  "instructions": [
    { "faceitPlayerId": "<id>", "nickname": "<name>", "role": "<role>", "instruction": "<tactical direction>" }
  ],
  "analysis": "<one-paragraph tactical analysis>",
  "signals": [{ "label": "<signal_name>", "detail": "<text>" }]
}
ACTION_TYPE must be one of: DEFAULT, A_EXECUTE, B_EXECUTE, MID_CONTROL, FAST_A, FAST_B, SPLIT_A, SPLIT_B, ANTI_ECO, FORCE, SAVE, RETREAT.
If live game data is unavailable in a field, set it to null and state "unavailable" in analysis. Do not fabricate scores, positions, or weapons.
${DATA_UNAVAILABLE}`;

  const userMessage = `Current state (compressed JSON): ${JSON.stringify(compressed)}
${JSON.stringify(compressed).length > 600 ? '(state truncated for brevity — do not invent missing fields)' : ''}`;

  return [
    { role: 'system', content: systemMessage },
    { role: 'user', content: userMessage },
  ];
}