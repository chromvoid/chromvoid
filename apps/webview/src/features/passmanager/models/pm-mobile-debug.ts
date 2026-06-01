type PMMobileDebugDetails = Record<string, unknown> | undefined

type PMMobileDebugEntry = {
  seq: number
  ts: string
  scope: string
  event: string
  details?: PMMobileDebugDetails
}

declare global {
  var __pmMobileDebugEvents: PMMobileDebugEntry[] | undefined
  var __pmMobileDebugSeq: number | undefined
}

const isDevHost =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.startsWith('192.168.'))

const PM_MOBILE_DEBUG_ENABLED =
  typeof window !== 'undefined' && (window.env === 'dev' || isDevHost)

const PM_MOBILE_DEBUG_LIMIT = 400

function getBuffer(): PMMobileDebugEntry[] {
  globalThis.__pmMobileDebugEvents ??= []
  return globalThis.__pmMobileDebugEvents
}

function nextSeq(): number {
  globalThis.__pmMobileDebugSeq = (globalThis.__pmMobileDebugSeq ?? 0) + 1
  return globalThis.__pmMobileDebugSeq
}

export function pmMobileDebug(scope: string, event: string, details?: PMMobileDebugDetails): void {
  if (!PM_MOBILE_DEBUG_ENABLED) return

  const entry: PMMobileDebugEntry = {
    seq: nextSeq(),
    ts: new Date().toISOString(),
    scope,
    event,
    details,
  }

  const buffer = getBuffer()
  buffer.push(entry)
  if (buffer.length > PM_MOBILE_DEBUG_LIMIT) {
    buffer.splice(0, buffer.length - PM_MOBILE_DEBUG_LIMIT)
  }

  if (details) {
    console.debug(`[PM][MobileSelection][${entry.seq}] ${scope}.${event}`, details)
    return
  }

  console.debug(`[PM][MobileSelection][${entry.seq}] ${scope}.${event}`)
}

export function pmMobileDebugEnabled(): boolean {
  return PM_MOBILE_DEBUG_ENABLED
}
