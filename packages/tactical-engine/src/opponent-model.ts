import { confidenceFromScore, type GameEvent, type MatchState, type OpponentPattern } from '@cs2coach/shared';
interface RecordRow { patternType: OpponentPattern['patternType']; location: string; frequency: number; sampleSize: number; updatedAt: number; }
export class OpponentModel {
  private records = new Map<string, RecordRow>();
  learn(state: MatchState, event: GameEvent) {
    let patternType: OpponentPattern['patternType'] | undefined;
    let location: string | undefined;
    if (event.type === 'bomb_state' && event.planted && event.site) { patternType = 'site'; location = event.site; }
    else if (event.type === 'player_kill' && event.site) { patternType = 'site'; location = event.site; }
    if (!patternType || !location) return;
    const key = `${patternType}:${location}`;
    const old = this.records.get(key) ?? { patternType, location, frequency: 0, sampleSize: 0, updatedAt: 0 };
    old.frequency += 1; old.sampleSize = Math.max(old.sampleSize, state.round); old.updatedAt = Date.now(); this.records.set(key, old);
  }
  getPatterns(): OpponentPattern[] {
    return [...this.records.values()].map(r => { const raw = Math.min(r.sampleSize / 8, 1) * (r.frequency / Math.max(r.sampleSize, 1)); return { patternType: r.patternType, location: r.location, frequency: r.frequency, confidence: confidenceFromScore(raw), sampleSize: r.sampleSize, updatedAt: r.updatedAt }; });
  }
}
