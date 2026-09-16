import { confidenceFromScore, type GameEvent, type MatchState, type OpponentPattern } from '@cs2coach/shared';
export class OpponentModel {
 private records=new Map<string,{patternType:OpponentPattern['patternType'];location:string;frequency:number;sampleSize:number;updatedAt:number}>();
 learn(state:MatchState,event:GameEvent){let type:OpponentPattern['patternType']|undefined;let location:string|undefined;if(event.type==='bomb_state'&&event.planted&&event.site){type='site';location=event.site}else if(event.type==='player_kill'&&event.site){type='site';location=event.site}if(!type||!location)return;const key=`${type}:${location}`;const r=this.records.get(key)??{patternType:type,location,frequency:0,sampleSize:0,updatedAt:0};r.frequency++;r.sampleSize=Math.max(r.sampleSize,state.round);r.updatedAt=Date.now();this.records.set(key,r)}
 getPatterns():OpponentPattern[]{return[...this.records.values()].map(r=>{const score=Math.min(r.sampleSize/8,1)*(r.frequency/Math.max(r.sampleSize,1));return{patternType:r.patternType,location:r.location,frequency:r.frequency,confidence:confidenceFromScore(score),sampleSize:r.sampleSize,updatedAt:r.updatedAt}})}
}
