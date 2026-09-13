import type { FastifyInstance } from 'fastify';
import { AppError, codes } from '@cs2coach/shared';
import { findFaceitAccountByUserId, getMatchByFaceitId } from '@cs2coach/database';
import { PostMatchAnalysisService } from '@cs2coach/ai';
import type { AppConfig } from '../config';
import { requireAuth } from '../middleware/telegram-auth';
import { userOwnsMatch } from './matches';
import { syncFaceitPlayerMatchStats } from '../utils/faceit-stats';

function parseJson(value: unknown): unknown { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return null; } }
function num(value: unknown): number | null { const n = Number(value); return Number.isFinite(n) ? n : null; }
function avg(values: Array<number | null>): number | null { const valid = values.filter((v): v is number => v != null && Number.isFinite(v)); return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null; }

export async function matchAnalysisRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get('/api/matches/:faceitMatchId/analysis', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const faceitMatchId=(request.params as {faceitMatchId:string}).faceitMatchId; const user=request.authedUser!; const account=await findFaceitAccountByUserId(config.db,user.userId); const match=await getMatchByFaceitId(config.db,faceitMatchId);
    if(!match||!account||!(await userOwnsMatch(config,user.userId,match.id)))throw new AppError(codes.notFound,'Match not found',404);
    const [analysisRows]=await Promise.all([config.db`SELECT post_match_analysis,created_at,updated_at FROM match_analysis WHERE match_id=${match.id} LIMIT 1`]);
    const saved=analysisRows[0] as {postMatchAnalysis?:unknown}|undefined;
    if(!saved?.postMatchAnalysis)return reply.send({ok:true,data:null});
    return reply.send({ok:true,data:saved.postMatchAnalysis});
  });

  app.post('/api/matches/:faceitMatchId/analysis', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const faceitMatchId=(request.params as {faceitMatchId:string}).faceitMatchId; const user=request.authedUser!; const account=await findFaceitAccountByUserId(config.db,user.userId); const match=await getMatchByFaceitId(config.db,faceitMatchId);
    if(!match||!account||!(await userOwnsMatch(config,user.userId,match.id)))throw new AppError(codes.notFound,'Match not found',404);

    // Post-match analysis is intentionally idempotent. Once a real Groq analysis is
    // saved for a match, repeated clicks must return the exact same recommendations
    // instead of asking the model to sample a new answer. Legacy fallback results are
    // allowed through once so they can be upgraded to Groq after deployment.
    const [existingRows]=await Promise.all([config.db`SELECT post_match_analysis FROM match_analysis WHERE match_id=${match.id} LIMIT 1`]);
    const existing=existingRows[0] as {postMatchAnalysis?:unknown}|undefined;
    const existingAnalysis=existing?.postMatchAnalysis as {source?:unknown}|undefined;
    if(existingAnalysis && existingAnalysis.source==='groq') {
      return reply.send({ok:true,data:existingAnalysis});
    }

    const [playerRows,roundRows,patternRows,historyRows]=await Promise.all([
      config.db`SELECT p.nickname,mp.player_id,
        COALESCE(ps.kills,mp.kills,0) AS kills,COALESCE(ps.deaths,mp.deaths,0) AS deaths,COALESCE(ps.assists,mp.assists,0) AS assists,
        ps.adr,ps.kast,ps.rating,COALESCE(ps.opening_kills,0) AS opening_kills,COALESCE(ps.opening_deaths,0) AS opening_deaths,
        COALESCE(ps.utility_damage,0) AS utility_damage,COALESCE(ps.flash_assists,0) AS flash_assists,COALESCE(ps.clutches,0) AS clutches,
        COALESCE(ps.headshots,0) AS headshots,ps.headshots_percent,COALESCE(ps.total_damage,0) AS total_damage,COALESCE(ps.mvps,0) AS mvps,
        COALESCE(ps.triple_kills,0) AS triple_kills,COALESCE(ps.quadro_kills,0) AS quadro_kills,COALESCE(ps.ace_kills,0) AS ace_kills
        FROM match_players mp JOIN players p ON p.id=mp.player_id LEFT JOIN player_statistics ps ON ps.match_id=mp.match_id AND ps.player_id=mp.player_id
        JOIN faceit_accounts fa ON fa.faceit_user_id=p.faceit_player_id WHERE mp.match_id=${match.id} AND fa.user_id=${user.userId} LIMIT 1`,
      config.db`SELECT r.round_number,r.winner,r.side,r.win_reason,r.score_after_round,COALESCE(json_agg(json_build_object('eventType',e.event_type,'weapon',e.weapon,'damage',e.damage,'metadata',e.metadata_json)) FILTER(WHERE e.id IS NOT NULL),'[]'::json) AS events FROM rounds r LEFT JOIN player_round_events e ON e.round_id=r.id WHERE r.match_id=${match.id} GROUP BY r.id ORDER BY r.round_number ASC`,
      config.db`SELECT pattern_type,location,frequency,confidence,sample_size FROM opponent_patterns WHERE match_id=${match.id} ORDER BY sample_size DESC,frequency DESC LIMIT 10`,
      config.db`SELECT m.faceit_match_id,m.map,m.score_a,m.score_b,m.finished_at,
        COALESCE(ps.kills,mp.kills,0) AS kills,COALESCE(ps.deaths,mp.deaths,0) AS deaths,COALESCE(ps.assists,mp.assists,0) AS assists,
        ps.adr,ps.kast,ps.rating,COALESCE(ps.opening_kills,0) AS opening_kills,COALESCE(ps.opening_deaths,0) AS opening_deaths,
        COALESCE(ps.utility_damage,0) AS utility_damage,COALESCE(ps.flash_assists,0) AS flash_assists,COALESCE(ps.clutches,0) AS clutches,
        ps.headshots_percent,COALESCE(ps.total_damage,0) AS total_damage
        FROM match_players mp JOIN matches m ON m.id=mp.match_id JOIN players p ON p.id=mp.player_id
        JOIN faceit_accounts fa ON fa.faceit_user_id=p.faceit_player_id LEFT JOIN player_statistics ps ON ps.match_id=mp.match_id AND ps.player_id=mp.player_id
        WHERE fa.user_id=${user.userId} AND m.id<>${match.id} ORDER BY m.finished_at DESC NULLS LAST LIMIT 20`,
    ]);

    const player=playerRows[0] as Record<string,unknown>|undefined; if(!player)throw new AppError(codes.notFound,'Player is not linked to this match',404);
    let syncedStats:Awaited<ReturnType<typeof syncFaceitPlayerMatchStats>>=null;
    try{syncedStats=await syncFaceitPlayerMatchStats(config,match.id,String(player.playerId),account.faceitUserId,faceitMatchId);if(!syncedStats)config.logger.warn('faceit_match_player_stats_missing',{faceitMatchId,faceitPlayerId:account.faceitUserId});}catch(error){config.logger.warn('faceit_match_stats_sync_failed',{faceitMatchId,error:error instanceof Error?error.message:String(error)});}

    const effectivePlayer={
      nickname:String(player.nickname),
      kills:syncedStats?.kills??num(player.kills), deaths:syncedStats?.deaths??num(player.deaths), assists:syncedStats?.assists??num(player.assists),
      adr:syncedStats?.adr??num(player.adr), kast:syncedStats?.kast??num(player.kast), rating:syncedStats?.rating??num(player.rating),
      openingKills:syncedStats?.openingKills??num(player.openingKills), openingDeaths:syncedStats?.openingDeaths??num(player.openingDeaths),
      utilityDamage:syncedStats?.utilityDamage??num(player.utilityDamage), flashAssists:syncedStats?.flashAssists??num(player.flashAssists),
      clutches:syncedStats?.clutches??num(player.clutches), headshots:syncedStats?.headshots??num(player.headshots),
      headshotsPercent:syncedStats?.headshotsPercent??num(player.headshotsPercent), totalDamage:syncedStats?.totalDamage??num(player.totalDamage),
      mvps:syncedStats?.mvps??num(player.mvps), tripleKills:syncedStats?.tripleKills??num(player.tripleKills),
      quadroKills:syncedStats?.quadroKills??num(player.quadroKills), aceKills:syncedStats?.aceKills??num(player.aceKills),
    };

    const history=historyRows.map(row=>{const r=row as Record<string,unknown>;return{
      matchId:String(r.faceitMatchId),map:r.map==null?null:String(r.map),scoreA:num(r.scoreA),scoreB:num(r.scoreB),finishedAt:r.finishedAt==null?null:String(r.finishedAt),
      kills:num(r.kills),deaths:num(r.deaths),assists:num(r.assists),adr:num(r.adr),kast:num(r.kast),rating:num(r.rating),
      openingKills:num(r.openingKills),openingDeaths:num(r.openingDeaths),utilityDamage:num(r.utilityDamage),flashAssists:num(r.flashAssists),
      clutches:num(r.clutches),headshotsPercent:num(r.headshotsPercent),totalDamage:num(r.totalDamage),
    };});
    const recentFive=history.slice(0,5); const previousFive=history.slice(5,10);
    const metricKeys=['kills','deaths','assists','adr','kast','rating','openingKills','openingDeaths','utilityDamage','flashAssists','clutches','headshotsPercent','totalDamage'] as const;
    const averages=Object.fromEntries(metricKeys.map(k=>[k,avg(history.map(r=>r[k]))]));
    const trend=Object.fromEntries(metricKeys.map(k=>{const recent=avg(recentFive.map(r=>r[k]));const previous=avg(previousFive.map(r=>r[k]));return[k,recent!=null&&previous!=null?recent-previous:null];}));
    const maps:Record<string,number>={}; for(const r of history)if(r.map)maps[r.map]=(maps[r.map]??0)+1;

    const rounds=roundRows.map(row=>{const r=row as Record<string,unknown>;return{roundNumber:Number(r.roundNumber),winner:r.winner==null?null:String(r.winner),side:r.side==null?null:String(r.side),winReason:r.winReason==null?null:String(r.winReason),scoreAfterRound:r.scoreAfterRound==null?null:String(r.scoreAfterRound),playerEvents:(parseJson(r.events) as unknown[]|null)??[]};});
    const opponentPatterns=patternRows.map(row=>{const r=row as Record<string,unknown>;return`${String(r.patternType)}${r.location?` at ${String(r.location)}`:''}: frequency ${Number(r.frequency).toFixed(1)}, confidence ${String(r.confidence)}, sample ${Number(r.sampleSize)}`;});
    const result=await new PostMatchAnalysisService(config.groqClient).generate({
      map:match.map??null,
      finalScore:{a:Number(match.scoreA??0),b:Number(match.scoreB??0)},
      player:effectivePlayer,
      rounds,
      opponentPatterns,
      history:{sampleSize:history.length,averages,recentFive,previousFive,trend,maps},
    });
    await config.db.begin(async sql=>{await sql`INSERT INTO match_analysis(match_id,post_match_analysis)VALUES(${match.id},${sql.json(result.analysis)})ON CONFLICT(match_id)DO UPDATE SET post_match_analysis=EXCLUDED.post_match_analysis,updated_at=now()`;await sql`INSERT INTO training_plans(user_id,match_id,plan_json)VALUES(${user.userId},${match.id},${sql.json(result.analysis.trainingPlan)})ON CONFLICT(user_id,match_id)DO UPDATE SET plan_json=EXCLUDED.plan_json`;});
    return reply.send({ok:true,data:{...result.analysis,source:result.source}});
  });
}
