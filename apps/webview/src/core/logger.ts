export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  readonly level: LogLevel
  debug(message: string, meta?: unknown): void
  info(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
  error(message: string, meta?: unknown): void
}

function shouldLog(current: LogLevel, desired: LogLevel): boolean {
  const order: LogLevel[] = ['debug', 'info', 'warn', 'error']
  return order.indexOf(desired) >= order.indexOf(current)
}

class ConsoleLogger implements Logger {
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

function isDevRuntime(): boolean {
  // Vite / modern bundlers
  try {
    const env = (import.meta as unknown as {env?: Record<string, unknown>}).env
    if (env && env['DEV'] === true) return true
  } catch {}

  // Node-like runtimes (tests)
  try {
    const nodeEnv = (process as unknown as {env?: Record<string, string | undefined>}).env?.['NODE_ENV']
    if (nodeEnv && nodeEnv !== 'production') return true
  } catch {}

  return false
}

export const defaultLogger: Logger = isDevRuntime () ? new ConsoleLogger('debug') : new ConsoleLogger('debug')
