/**
 * structured JSON logger.
 *
 * Log lines are single JSON objects: { ts, level, service, msg, ...fields }
 * Callers must never pass tokens/API keys as fields (spec §45).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  [key: string]: unknown;
}

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

export class Logger {
  private readonly service: string;
  private readonly baseFields: LogFields;
  private readonly minLevel: number;

  constructor(service: string, baseFields: LogFields = {}, minLevel?: LogLevel) {
    this.service = service;
    this.baseFields = baseFields;
    const configured = (process.env.LOG_LEVEL as LogLevel | undefined) ?? (process.env.NODE_ENV === 'test' ? 'error' : 'info');
    this.minLevel = LEVELS[configured] ?? (minLevel ? LEVELS[minLevel] : LEVELS.info);
  }

  child(fields: LogFields): Logger {
    return new Logger(this.service, { ...this.baseFields, ...fields });
  }

  debug(msg: string, fields?: LogFields): void {
    this.write('debug', msg, fields);
  }

  info(msg: string, fields?: LogFields): void {
    this.write('info', msg, fields);
  }

  warn(msg: string, fields?: LogFields): void {
    this.write('warn', msg, fields);
  }

  error(msg: string, fields?: LogFields): void {
    this.write('error', msg, fields);
  }

  private write(level: LogLevel, msg: string, fields?: LogFields): void {
    if (LEVELS[level] < this.minLevel) return;
    const line = {
      ts: new Date().toISOString(),
      level,
      service: this.service,
      ...this.baseFields,
      ...(fields ?? {}),
      msg,
    };
    const out = safeJson(line) + '\n';
    if (level === 'error') process.stderr.write(out);
    else process.stdout.write(out);
  }
}

export function createLogger(service: string, fields?: LogFields): Logger {
  return new Logger(service, fields);
}

export const rootLogger = createLogger('cs2coach');