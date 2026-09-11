/**
 * Telegram Mini App initData HMAC validation (spec §53). Validates the
 * `Authorization` header (Bearer <jwt>) issued by this API, not Telegram's
 * initData — Telegram's initData is validated once at login time (see
 * POST /api/auth/telegram) and the issued JWT is then trusted by the client.
 *
 * This middleware ensures the request carries a valid, non-expired JWT issued
 * by this API, and attaches `ctx.userId`, `ctx.telegramId`, and `ctx.faceitId`
 * (if present) to the Fastify request.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError, codes } from '@cs2coach/shared';
import type { AppConfig } from '../config';

export interface AuthedUser {
  userId: string;
  telegramId: number;
  faceitId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authedUser?: AuthedUser;
  }
}

export async function requireAuth(config: AppConfig): Promise<(request: FastifyRequest, reply: FastifyReply) => Promise<void>> {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError(codes.unauthorized, 'Missing or invalid Authorization header', 401);
    }
    const token = header.slice(7);
    const claims = config.verifySession(token);
    if (!claims) {
      throw new AppError(codes.invalidTelegramInitData, 'Invalid or expired session token', 401);
    }
    request.authedUser = {
      userId: claims.sub,
      telegramId: claims.telegramId,
    };
  };
}

/**
 * Optional auth — attaches user if present but doesn't reject.
 */
export async function optionalAuth(config: AppConfig): Promise<(request: FastifyRequest, _reply: FastifyReply) => Promise<void>> {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return;
    const token = header.slice(7);
    const claims = config.verifySession(token);
    if (claims) {
      request.authedUser = {
        userId: claims.sub,
        telegramId: claims.telegramId,
      };
    }
  };
}