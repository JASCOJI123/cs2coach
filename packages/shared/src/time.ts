/** small time helpers. */

export function epochNow(): number {
  return Date.now();
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function toISO(ms: number): string {
  return new Date(ms).toISOString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Format ms as mm:ss, used for timing recommendations ("1:28"). */
export const formatClockMs = formatClock;

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Parse "1:28" or 88 into milliseconds. */
export function parseClockToMs(value: string | number): number {
  if (typeof value === 'number') return value * 1000;
  const parts = value.split(':').map((p) => Number.parseInt(p, 10));
  if (parts.length === 2 && parts[0] >= 0 && parts[1] >= 0) {
    return (parts[0] * 60 + parts[1]) * 1000;
  }
  return Number.parseInt(value, 10) * 1000;
}