import type { GameEvent, MatchState } from '@cs2coach/shared';
import { GameEventBus } from '../GameEventBus';
import { MatchStateEngine } from '../MatchStateEngine';
import type { GameStateProvider } from '../GameStateProvider';
export class CS2GameStateProvider implements GameStateProvider { readonly sourceName='cs2-gsi'; private bus=new GameEventBus(); private engine=new MatchStateEngine(); constructor(private logger?:{warn?:Function}){} ingestEvents(events:GameEvent[]){const state=this.engine.applyEvents(events);for(const e of events)this.bus.publish(e);return state} getCurrentState(id:string):Promise<MatchState|null>{return Promise.resolve(this.engine.getState(id))} subscribeToEvents(id:string,h:(e:GameEvent)=>void){return this.bus.subscribe(id,h)} disconnect(){return Promise.resolve()} }
