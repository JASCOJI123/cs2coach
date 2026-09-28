/** Score from the user's side as `own:opponent`. score.a/b follow FACEIT faction1/faction2. */
export function ownScore(score: { a: number; b: number }, myTeam?: 'A' | 'B' | null): [number, number] {
  return myTeam === 'B' ? [score.b, score.a] : [score.a, score.b];
}
