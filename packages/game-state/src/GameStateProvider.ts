import type { GameEvent, MatchState } from '@cs2coach/shared';
export interface GameStateProvider { readonly sourceName:string; getCurrentState(matchId:string):Promise<MatchState|null>; subscribeToEvents(matchId:string,handler:(event:GameEvent)=>void):()=>void; disconnect():Promise<void>; }
