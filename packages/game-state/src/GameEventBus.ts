import { EventEmitter } from 'node:events';
import type { GameEvent } from '@cs2coach/shared';
export class GameEventBus { private emitter=new EventEmitter(); constructor(){this.emitter.setMaxListeners(200)} publish(e:GameEvent){this.emitter.emit(e.matchId,e);this.emitter.emit('*',e)} subscribe(id:string,h:(e:GameEvent)=>void){this.emitter.on(id,h);return()=>this.emitter.off(id,h)} }
