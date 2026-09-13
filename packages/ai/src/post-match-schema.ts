import { z } from 'zod';

export const postMatchAnalysisSchema = z.object({
  overallScore: z.object({
    aim: z.number().min(0).max(100),
    positioning: z.number().min(0).max(100),
    decisionMaking: z.number().min(0).max(100),
    utility: z.number().min(0).max(100),
    trading: z.number().min(0).max(100),
    opening: z.number().min(0).max(100),
    clutch: z.number().min(0).max(100),
    teamplay: z.number().min(0).max(100),
  }),
  bestRound: z.object({ roundNumber: z.number(), reason: z.string() }).nullable(),
  worstRound: z.object({ roundNumber: z.number(), reason: z.string() }).nullable(),
  topMistakes: z.array(z.string()).max(3),
  topDecisions: z.array(z.string()).max(3),
  opponentPatterns: z.array(z.string()).max(5),
  trainingPlan: z.array(z.object({ day: z.number().min(1).max(7), focus: z.string() })).max(7),
});

export type PostMatchAnalysis = z.infer<typeof postMatchAnalysisSchema>;
