import {invoke} from '@tauri-apps/api/core'
import {listen} from '@tauri-apps/api/event'

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

export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!hasTauriInternals()) {
    warnMissingRuntime({action: 'invoke', cmd})
    throw new Error('Tauri runtime not available (missing window.__TAURI_INTERNALS__)')
  }

  try {
    const serialized = args ? (serializeForTauri(args) as Record<string, unknown>) : undefined
    return await invoke<T>(cmd, serialized)
  } catch (e) {
    console.warn('[dashboard][tauri] invoke failed', {
      cmd,
      argKeys: args ? Object.keys(args) : [],
    })
    throw e
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
