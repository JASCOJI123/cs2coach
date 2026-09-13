import type { FastifyInstance } from 'fastify';
import { AppError, codes } from '@cs2coach/shared';
import { findFaceitAccountByUserId, getMatchByFaceitId, listMatchesForUser, syncFaceitPlayerHistory, updateFaceitAccountPlayerId } from '@cs2coach/database';
import type { AppConfig } from '../config';
import { requireAuth } from '../middleware/telegram-auth';

const HISTORY_SYNC_TTL_MS = 30_000;
const historySyncAt = new Map<string, number>();

export async function userOwnsMatch(config: AppConfig, userId: string, matchId: string): Promise<boolean> {
  const [row] = await config.db`SELECT 1 FROM match_players mp JOIN players p ON p.id=mp.player_id JOIN faceit_accounts fa ON fa.faceit_user_id=p.faceit_player_id WHERE mp.match_id=${matchId} AND fa.user_id=${userId} LIMIT 1`;
  return Boolean(row);
}

function extractMap(detail: any): string | null {
  const direct = detail?.details?.map;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const voting = detail?.voting?.map;
  if (typeof voting === 'string' && voting.trim()) return voting.trim();
  for (const value of [voting?.pick, voting?.name, voting?.selected]) if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

async function hydrateHistoryMaps(config: AppConfig, items: any[]): Promise<any[]> {
  return Promise.all(items.map(async (item) => {
    if (item?.details?.map) return item;
    try {
      const detail = await config.faceitClient.getMatchById(item.match_id);
      const map = extractMap(detail);
      return map ? { ...item, details: { ...(item.details ?? {}), map } } : item;
    } catch (error) {
      config.logger.warn('faceit_match_detail_failed', { matchId: item?.match_id, error: error instanceof Error ? error.message : String(error) });
      return item;
    }
  }));
}

export async function matchesRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get('/api/matches', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const user = request.authedUser!;
    const account = await findFaceitAccountByUserId(config.db, user.userId);
    let liveHistory: any[] = [];
    const lastSync = historySyncAt.get(user.userId) ?? 0;
    if (account?.faceitUserId && Date.now() - lastSync >= HISTORY_SYNC_TTL_MS) {
      try {
        const player = await config.faceitClient.resolvePlayer(account.faceitUserId, account.nickname, 'cs2');
        if (player.player_id !== account.faceitUserId) await updateFaceitAccountPlayerId(config.db, user.userId, player.player_id);
        const history = await config.faceitClient.getPlayerMatches(player.player_id, { offset: 0, limit: 20 });
        const items = await hydrateHistoryMaps(config, history.items ?? []);
        liveHistory = items.map((m: any) => ({ id:`faceit-${m.match_id}`, faceitMatchId:m.match_id, map:extractMap(m), status:m.status??'finished', score:{a:m.results?.score?.faction1??0,b:m.results?.score?.faction2??0}, startedAt:m.started_at?new Date(m.started_at*1000).toISOString():null, finishedAt:m.finished_at?new Date(m.finished_at*1000).toISOString():null }));
        await syncFaceitPlayerHistory(config.db, { faceitPlayerId:player.player_id, nickname:player.nickname||account.nickname, avatar:player.avatar??account.avatar, country:player.country??account.country, skillLevel:player.games?.cs2?.skill_level??account.skillLevel, elo:player.games?.cs2?.faceit_elo??account.elo, items });
        historySyncAt.set(user.userId, Date.now());
      } catch (error) {
        config.logger.warn('faceit_history_sync_failed', { userId:user.userId, faceitUserId:account.faceitUserId, error:error instanceof Error?error.message:String(error) });
      }
    }
    const dbMatches = await listMatchesForUser(config.db,{userId:user.userId,limit:30});
    const merged = new Map<string,any>();
    for (const m of dbMatches) merged.set(m.faceitMatchId,{id:m.id,faceitMatchId:m.faceitMatchId,map:m.map,status:m.status,score:{a:m.scoreA??0,b:m.scoreB??0},startedAt:m.startedAt,finishedAt:m.finishedAt});
    for (const m of liveHistory) {
      const old=merged.get(m.faceitMatchId);
      merged.set(m.faceitMatchId,old?{...old,map:m.map??old.map,status:m.status??old.status,score:m.score??old.score,startedAt:m.startedAt??old.startedAt,finishedAt:m.finishedAt??old.finishedAt}:m);
    }
    const result=[...merged.values()].sort((a,b)=>new Date(b.startedAt??0).getTime()-new Date(a.startedAt??0).getTime()).slice(0,30);
    return reply.send({ok:true,data:result});
  });

  app.get('/api/matches/:faceitMatchId',{preHandler:await requireAuth(config)},async(request,reply)=>{
    const faceitMatchId=(request.params as {faceitMatchId:string}).faceitMatchId; const user=request.authedUser!;
    const match=await getMatchByFaceitId(config.db,faceitMatchId);
    if(match){
      if(!(await userOwnsMatch(config,user.userId,match.id))) throw new AppError(codes.notFound,'Match not found',404);
      const state=config.matchStateEngine.getState(match.faceitMatchId);
      return reply.send({ok:true,data:{id:match.id,faceitMatchId:match.faceitMatchId,map:match.map??state?.map??null,status:state?.status??match.status,score:{a:state?.score.a??match.scoreA??0,b:state?.score.b??match.scoreB??0},live:state??null}});
    }
    const account=await findFaceitAccountByUserId(config.db,user.userId); if(!account?.faceitUserId) throw new AppError(codes.notFound,'Match not found',404);
    try{const detail=await config.faceitClient.getMatchById(faceitMatchId);const roster=[...(detail.teams?.faction1?.roster??[]),...(detail.teams?.faction2?.roster??[])];if(!roster.some((p:any)=>p.player_id===account.faceitUserId))throw new Error('match is not owned by current user');return reply.send({ok:true,data:{id:`faceit-${detail.match_id}`,faceitMatchId:detail.match_id,map:extractMap(detail),status:detail.status??'finished',score:{a:detail.results?.score?.faction1??0,b:detail.results?.score?.faction2??0},live:null}});}catch{throw new AppError(codes.notFound,'Match not found',404);}
  });

  app.post('/api/matches/:faceitMatchId/coach',{preHandler:await requireAuth(config)},async(request,reply)=>{
    const faceitMatchId=(request.params as {faceitMatchId:string}).faceitMatchId; const user=request.authedUser!; const match=await getMatchByFaceitId(config.db,faceitMatchId);
    if(!match||!(await userOwnsMatch(config,user.userId,match.id)))throw new AppError(codes.notFound,'Match not found',404);
    const state=config.matchStateEngine.getState(match.faceitMatchId); if(!state||!state.gameDataAvailable)throw new AppError(codes.waitingForGameData,'Waiting for live game data',202);
    const decision=await config.aiCoordinator.requestDecision(match.faceitMatchId,state,'A');config.aiCoordinator.processNext();return reply.send({ok:true,data:await decision});
  });
}
