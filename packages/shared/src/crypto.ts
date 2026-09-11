/**
 * Crypto helpers for data-at-rest protection (spec §67).
 * FACEIT OAuth tokens are AES-256-GCM encrypted using a key derived from
 * SESSION_SECRET before storage, so a leaked database dump does not leak tokens.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

export function deriveKey(secret: string, salt: string): Buffer {
  return createHash('sha256')
    .update(`cs2coach:v1:${salt}:${secret}`)
    .digest();
}

export interface EncryptedPayload {
  iv: string; // base64
  tag: string; // base64
  data: string; // base64 ciphertext
}

export function encryptSecret(secret: string, plaintext: string): EncryptedPayload {
  const iv = randomBytes(12);
  const key = deriveKey(secret, 'token-enc');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  };
}

export function decryptSecret(secret: string, payload: EncryptedPayload): string {
  const key = deriveKey(secret, 'token-enc');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

export function serializeEncrypted(payload: EncryptedPayload): string {
  return `${payload.iv}.${payload.tag}.${payload.data}`;
}

export function parseEncrypted(value: string): EncryptedPayload | null {
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  return { iv: parts[0], tag: parts[1], data: parts[2] };
}

// ── tiny stateless JWT (HS256) using node crypto only ───────────────────────
// No external dependency; payload is base64url JSON, signature is HMAC-SHA256.

const b64url = (buf: Buffer): string => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlDecode = (s: string): Buffer => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export interface SessionClaims {
  sub: string; // user id (uuid)
  telegramId: number;
  /** issued-at epoch ms */
  iat: number;
  /** expiry epoch ms */
  exp: number;
}

export function signSession(secret: string, claims: SessionClaims): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = b64url(Buffer.from(JSON.stringify(claims)));
  const data = `${header}.${payload}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${data}.${sig}`;
}

export function verifySession(secret: string, token: string): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const a = Buffer.from(sig ?? '', 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const headerJson = JSON.parse(b64urlDecode(header).toString('utf8'));
    if (headerJson.alg !== 'HS256') return null;
    const claims = JSON.parse(b64urlDecode(payload).toString('utf8')) as SessionClaims;
    if (typeof claims.exp !== 'number' || claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}