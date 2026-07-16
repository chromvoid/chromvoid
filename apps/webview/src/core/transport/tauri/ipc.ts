import {invoke} from '@tauri-apps/api/core'
import {listen} from '@tauri-apps/api/event'

const DEFAULT_INVOKE_TIMEOUT_MS = 60_000
const LONG_RUNNING_INVOKE_TIMEOUT_MS = 30 * 60_000
const TAURI_IPC_FAILURE_MARKER = 'TAURI_IPC_FAILURE'
const TAURI_IPC_DIAGNOSTIC_COMMAND = 'unlock_debug_log'
const MAX_NATIVE_FAILURE_DIAGNOSTICS = 50

const COMMAND_TIMEOUT_OVERRIDES_MS: Record<string, number> = {
  backup_local_create: LONG_RUNNING_INVOKE_TIMEOUT_MS,
  restore_local_from_folder: LONG_RUNNING_INVOKE_TIMEOUT_MS,
  erase_device: LONG_RUNNING_INVOKE_TIMEOUT_MS,
  master_rekey: LONG_RUNNING_INVOKE_TIMEOUT_MS,
  vault_rekey: LONG_RUNNING_INVOKE_TIMEOUT_MS,
  catalog_file_replace: LONG_RUNNING_INVOKE_TIMEOUT_MS,
  catalog_upload_path: LONG_RUNNING_INVOKE_TIMEOUT_MS,
  catalog_upload_file_path: LONG_RUNNING_INVOKE_TIMEOUT_MS,
  catalog_download_path: LONG_RUNNING_INVOKE_TIMEOUT_MS,
  catalog_upload_native_files: LONG_RUNNING_INVOKE_TIMEOUT_MS,
  catalog_upload_shared_files: LONG_RUNNING_INVOKE_TIMEOUT_MS,
}

export type TauriInvokeOptions = {
  timeoutMs?: number
  disableTimeout?: boolean
}

type TauriInvokeFailureKind = 'command-not-allowed' | 'command-not-found' | 'timeout' | 'invoke-error'
type TauriInvokeFailureSeverity = 'critical' | 'error'

interface Catchable {
  catch(onRejected: (error: unknown) => unknown): unknown
}

const reportedNativeFailureDiagnostics = new Set<string>()

function serializeForTauri(value: unknown): unknown {
  if (typeof value === 'bigint') {
    throw new Error(
      'BigInt is not allowed in Tauri IPC payloads; u64 values must be passed as safe integers (number).',
    )
  }
  if (Array.isArray(value)) return value.map(serializeForTauri)
  if (value && typeof value === 'object') {
    // Keep non-plain objects (e.g. Uint8Array) as-is.
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return value

    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeForTauri(v)
    }
    return out
  }
  return value
}

export function getTauriInvokeTimeoutMs(cmd: string, options?: TauriInvokeOptions): number | null {
  if (options?.disableTimeout) return null

  const timeoutMs = options?.timeoutMs ?? COMMAND_TIMEOUT_OVERRIDES_MS[cmd] ?? DEFAULT_INVOKE_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return null
  return timeoutMs
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function classifyInvokeFailure(message: string): TauriInvokeFailureKind {
  const lower = message.toLowerCase()
  if (lower.includes('timed out')) return 'timeout'

  const looksNotAllowed =
    lower.includes('not allowed') || lower.includes('permission') || lower.includes('forbidden')
  if (looksNotAllowed) return 'command-not-allowed'

  if (lower.includes('command not found') || lower.includes('command_not_found')) return 'command-not-found'

  return 'invoke-error'
}

function invokeFailureSeverity(kind: TauriInvokeFailureKind): TauriInvokeFailureSeverity {
  return kind === 'invoke-error' ? 'error' : 'critical'
}

function isCatchable(value: unknown): value is Catchable {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as {catch?: unknown}).catch === 'function',
  )
}

function writeNativeFailureDiagnostic(payload: Record<string, unknown>): void {
  const {cmd} = payload
  if (cmd === TAURI_IPC_DIAGNOSTIC_COMMAND) return

  const key = `${String(cmd)}:${String(payload['error_kind'])}:${String(payload['error'])}`
  if (reportedNativeFailureDiagnostics.has(key)) return
  if (reportedNativeFailureDiagnostics.size >= MAX_NATIVE_FAILURE_DIAGNOSTICS) return
  reportedNativeFailureDiagnostics.add(key)

  try {
    const result: unknown = invoke(TAURI_IPC_DIAGNOSTIC_COMMAND, {
      message: JSON.stringify(payload),
      reset: false,
    })
    if (isCatchable(result)) {
      result.catch(() => false)
    }
  } catch {
    // Best-effort logging path. The original invoke error must remain the surfaced failure.
  }
}

function logInvokeFailure(
  cmd: string,
  args: Record<string, unknown> | undefined,
  error: unknown,
): void {
  const message = errorMessage(error)
  const errorKind = classifyInvokeFailure(message)
  const severity = invokeFailureSeverity(errorKind)
  const payload = {
    arg_keys: args ? Object.keys(args) : [],
    cmd,
    error: message,
    error_kind: errorKind,
    event: 'invoke-failed',
    has_tauri_internals: hasTauriInternals(),
    href: typeof location !== 'undefined' ? location.href : undefined,
    marker: TAURI_IPC_FAILURE_MARKER,
    scope: 'tauri-ipc',
    severity,
    ts: new Date().toISOString(),
    visibility_state: typeof document !== 'undefined' ? document.visibilityState : undefined,
  }

  if (severity === 'critical') {
    console.error('[dashboard][tauri][TAURI_IPC_FAILURE]', payload)
  } else {
    console.warn('[dashboard][tauri][TAURI_IPC_FAILURE]', payload)
  }
  writeNativeFailureDiagnostic(payload)
}

export async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
  options?: TauriInvokeOptions,
): Promise<T> {
  if (!hasTauriInternals()) {
    warnMissingRuntime({action: 'invoke', cmd})
    throw new Error('Tauri runtime not available (missing window.__TAURI_INTERNALS__)')
  }

  try {
    const serialized = args ? (serializeForTauri(args) as Record<string, unknown>) : undefined
    const invokePromise = invoke<T>(cmd, serialized)
    const timeoutMs = getTauriInvokeTimeoutMs(cmd, options)
    if (timeoutMs === null) {
      return await invokePromise
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Tauri invoke timed out after ${timeoutMs}ms: ${cmd}`))
      }, timeoutMs)
    })

    try {
      return await Promise.race([invokePromise, timeoutPromise])
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  } catch (e) {
    logInvokeFailure(cmd, args, e)
    throw e instanceof Error ? e : new Error(String(e))
  }
}

export type UnlistenFn = () => void

export async function tauriListen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  if (!hasTauriInternals()) {
    warnMissingRuntime({action: 'listen', event})
    throw new Error('Tauri runtime not available (missing window.__TAURI_INTERNALS__)')
  }

  try {
    const unlisten = await listen<T>(event, (evt) => handler(evt.payload))
    return unlisten
  } catch (e) {
    console.warn('[dashboard][tauri] listen failed', {event})
    throw e
  }
}

function hasTauriInternals(): boolean {
  const w = globalThis as unknown as {__TAURI_INTERNALS__?: unknown}
  const internals = w.__TAURI_INTERNALS__ as {invoke?: unknown} | undefined
  return Boolean(internals && typeof internals === 'object' && typeof internals.invoke === 'function')
}

let didWarnMissingRuntime = false

function warnMissingRuntime(details: Record<string, unknown>) {
  if (didWarnMissingRuntime) return
  didWarnMissingRuntime = true

  const href = typeof location !== 'undefined' ? location.href : undefined
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : undefined
  const hasGlobalTauri = typeof (globalThis as unknown as {__TAURI__?: unknown}).__TAURI__ === 'object'
  const tauriInternalsAvailable = hasTauriInternals()

  console.warn('[dashboard][tauri] Tauri JS API not available', {
    href,
    ua,
    hasGlobalTauri,
    hasTauriInternals: tauriInternalsAvailable,
    ...details,
  })
  console.warn('[dashboard][tauri] If this is a browser tab, open it inside the Tauri app window instead.')
}
