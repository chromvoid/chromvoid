export const PASS_DIR = '.passmanager'

export function sanitizeName(name: string): string {
  const s = String(name ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
  return s || 'untitled'
}

export async function streamToText(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder()
  let text = ''
  for await (const chunk of stream) {
    text += decoder.decode(chunk, {stream: true})
  }
  text += decoder.decode()
  return text
}

export function normalizeOTPEncoding(enc?: string): 'base32' | 'base64' | 'hex' | undefined {
  if (enc === 'hex' || enc === 'base64' || enc === 'base32') return enc
  if (enc === 'base16') return 'hex'
  return undefined
}

export function normalizeOTPEncodingStrict(enc?: string): 'base32' | 'base64' | 'hex' {
  const v = normalizeOTPEncoding(enc)
  return v ?? 'base32'
}

// Стабильный сериализатор meta: отсортированные ключи и детерминированный JSON
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  const order = (val: unknown): unknown => {
    if (val && typeof val === 'object') {
      if (seen.has(val as object)) return null
      seen.add(val as object)
      if (Array.isArray(val)) {
        return (val as unknown[]).map(order)
      }
      const obj = val as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(obj).sort()) {
        out[key] = order(obj[key])
      }
      return out
    }
    return val
  }
  return JSON.stringify(order(value))
}

// Ограничение параллелизма для массовых операций
export async function withConcurrencyLimit<T, R = unknown>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  const workers: Array<Promise<void>> = []
  const start = async (): Promise<void> => {
    const current = nextIndex++
    if (current >= items.length) return
    const item = items[current]
    if (item === undefined) return
    const value = await worker(item as T, current)
    ;(results as Array<R | undefined>)[current] = value as R
    await start()
  }
  const actual = Math.max(1, Math.min(limit, items.length))
  for (let i = 0; i < actual; i++) workers.push(start())
  await Promise.all(workers)
  return results
}

// Единый словарь кодов ошибок адаптеров (без enum)
export const ADAPTER_ERROR = {
  SAVE_ROOT_PARSE: 'SAVE_ROOT_PARSE_ERROR',
  SAVE_ROOT_WRITE: 'SAVE_ROOT_WRITE_ERROR',
  READ_ROOT: 'READ_ROOT_ERROR',
  OTP_GENERATE: 'OTP_GENERATE_ERROR',
  OTP_SECRET_READ: 'OTP_SECRET_READ_ERROR',
  OTP_REMOVE: 'OTP_REMOVE_ERROR',
  OTP_SAVE: 'OTP_SAVE_ERROR',
} as const

export type AdapterErrorCode = (typeof ADAPTER_ERROR)[keyof typeof ADAPTER_ERROR]

export function formatAdapterError(code: AdapterErrorCode, details?: string, cause?: unknown): string {
  const base = `[Adapter:${code}]` + (details ? ` ${details}` : '')
  if (cause instanceof Error) return `${base}: ${cause.message}`
  if (typeof cause === 'string') return `${base}: ${cause}`
  if (cause) return `${base}: ${String(cause)}`
  return base
}

// Примитивный Result без enum
export type Result<T> = {ok: true; value: T} | {ok: false; error: AdapterErrorCode; message?: string}

export function ok<T>(value: T): Result<T> {
  return {ok: true, value}
}

export function err<T = never>(error: AdapterErrorCode, message?: string): Result<T> {
  return {ok: false, error, message}
}
