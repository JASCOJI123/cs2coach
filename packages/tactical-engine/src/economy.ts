import type { BuyType } from '@cs2coach/shared';
export interface EconomyInput { money:number; lostPreviousRound:boolean; consecutiveLosses:number; }
export class EconomyEngine { classify(input:EconomyInput):BuyType { const {money,lostPreviousRound,consecutiveLosses}=input; if(money>=4000)return'FULL_BUY'; if(money>=3000)return lostPreviousRound&&consecutiveLosses>=2?'FORCE_BUY':'HALF_BUY'; if(money>=1800)return'LOW_BUY'; return lostPreviousRound?'ECO':'SAVE'; } isAntiEco(opponent:BuyType){return opponent==='ECO'||opponent==='LOW_BUY';} }
