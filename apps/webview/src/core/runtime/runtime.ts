export function isTauriRuntime(): boolean {
  const w = globalThis as unknown as {window?: unknown}
  if (!w || typeof w !== 'object') return false

  // Tauri v2 exposes internal bridge even when withGlobalTauri=false.
  const internals = (globalThis as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ as
    | {invoke?: unknown}
    | undefined
  if (internals && typeof internals === 'object' && typeof internals.invoke === 'function') {
    return true
  }

  // Fallback: global API is only injected when app.withGlobalTauri=true.
  const globalApi = (globalThis as unknown as {__TAURI__?: unknown}).__TAURI__ as
    | {core?: {invoke?: unknown}}
    | undefined
  return Boolean(globalApi?.core && typeof globalApi.core.invoke === 'function')
}
