import type { FastifyInstance } from 'fastify';
import { AppError, codes } from '@cs2coach/shared';
import type { AppConfig } from '../config';
import { requireAuth } from '../middleware/telegram-auth';

export async function subscriptionRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get('/api/subscription', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const user = request.authedUser!;
    const [row] = await config.db<{
      plan: 'free' | 'pro';
      status: string;
      provider: string | null;
      expires_at: Date | null;
    }[]>`
      insert into subscriptions (user_id, plan, status)
      values (${user.userId}, 'free', 'active')
      on conflict (user_id) do update set updated_at = now()
      returning plan, status, provider, expires_at
    `;

    const active = row.plan === 'pro' && row.status === 'active' && (!row.expires_at || row.expires_at.getTime() > Date.now());
    return reply.send({
      ok: true,
      data: {
        plan: active ? 'pro' : 'free',
        status: active ? row.status : 'active',
        expiresAt: active && row.expires_at ? row.expires_at.getTime() : null,
        premium: active,
        billingReady: true,
      },
    });
  });

  app.post('/api/subscription/dev-pro', { preHandler: await requireAuth(config) }, async (request, reply) => {
    if (!config.env.isDemoMode && config.env.nodeEnv === 'production') {
      throw new AppError(codes.forbidden, 'Development subscription endpoint is disabled', 403);
    }
    const user = request.authedUser!;
    await config.db`
      insert into subscriptions (user_id, plan, status, provider)
      values (${user.userId}, 'pro', 'active', 'dev')
      on conflict (user_id) do update set plan = 'pro', status = 'active', provider = 'dev', expires_at = null, updated_at = now()
    `;
    return reply.send({ ok: true, data: { plan: 'pro', premium: true } });
  });
}
