export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  readonly level: LogLevel
  debug(message: string, meta?: unknown): void
  info(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
  error(message: string, meta?: unknown): void
}

const NOOP = () => {}

export const noopLogger: Logger = {
  level: 'error',
  debug: NOOP,
  info: NOOP,
  warn: NOOP,
  error: NOOP,
}

export class FallbackLogger implements Logger {
  readonly level: LogLevel

  constructor(level: LogLevel = 'info') {
    this.level = level
  }

  debug(message: string, meta?: unknown): void {
    if (!shouldLog(this.level, 'debug')) return
    try {
      console.debug(message, meta ?? '')
    } catch {}
  }

  info(message: string, meta?: unknown): void {
    if (!shouldLog(this.level, 'info')) return
    try {
      console.info(message, meta ?? '')
    } catch {}
  }

  warn(message: string, meta?: unknown): void {
    if (!shouldLog(this.level, 'warn')) return
    try {
      console.warn(message, meta ?? '')
    } catch {}
  }

  error(message: string, meta?: unknown): void {
    if (!shouldLog(this.level, 'error')) return
    try {
      console.error(message, meta ?? '')
    } catch {}
  }
}

function createLogger(): Logger {
  try {
    if (typeof window !== 'undefined' && (window as unknown as {__PM_LOG__?: boolean}).__PM_LOG__) {
      return new FallbackLogger('debug')
    }
  } catch {}
  return noopLogger
}

export const logger = createLogger()

function shouldLog(current: LogLevel, desired: LogLevel): boolean {
  const order: LogLevel[] = ['debug', 'info', 'warn', 'error']
  return order.indexOf(desired) >= order.indexOf(current)
}

