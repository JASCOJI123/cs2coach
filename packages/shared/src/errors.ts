/**
 * application error with a stable `code` and an optional HTTP status.
 * Bounded, documented codes let the frontend render known states.
 */

export interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toErrorBody(): ErrorBody {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

/** Map an unknown thrown value to a safe, non-leaking error body. */
export function toErrorBody(e: unknown): ErrorBody {
  if (isAppError(e)) return e.toErrorBody();
  if (e instanceof Error) {
    const status = (e as { status?: unknown }).status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return { code: 'BAD_REQUEST', message: e.message };
    }
  }
  return { code: 'INTERNAL_ERROR', message: 'Internal server error' };
}

export const codes = {
  badRequest: 'BAD_REQUEST',
  unauthorized: 'UNAUTHORIZED',
  forbidden: 'FORBIDDEN',
  notFound: 'NOT_FOUND',
  conflict: 'CONFLICT',
  rateLimited: 'RATE_LIMITED',
  upstreamError: 'UPSTREAM_ERROR',
  upstreamTimeout: 'UPSTREAM_TIMEOUT',
  missingEnv: 'MISSING_ENV',
  invalidTelegramInitData: 'INVALID_TELEGRAM_INIT_DATA',
  faceitNotConnected: 'FACEIT_NOT_CONNECTED',
  demoUnavailable: 'DEMO_UNAVAILABLE',
  dataUnavailable: 'DATA_UNAVAILABLE',
  waitingForGameData: 'WAITING_FOR_GAME_DATA',
} as const;