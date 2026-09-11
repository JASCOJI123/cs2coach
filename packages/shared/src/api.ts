/**
 * API response envelope (spec §38).
 * Every JSON response is { success: true, data } or { success: false, error }.
 */
import type { ErrorBody } from './errors';
import { AppError, isAppError } from './errors';

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: ErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

export function fail(code: string, message: string, details?: unknown): ApiFailure {
  return { success: false, error: { code, message, details } };
}

export function failFromError(e: unknown): ApiFailure {
  if (isAppError(e)) return fail(e.code, e.message, e.details);
  return fail('INTERNAL_ERROR', 'Internal server error');
}

/** Convenience for throwing typed errors inside services. */
export function assertOk<T>(resp: ApiResponse<T>): T {
  if (resp.success) return resp.data;
  throw new AppError(resp.error.code, resp.error.message, 400, resp.error.details);
}