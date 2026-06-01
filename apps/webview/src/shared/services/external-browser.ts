import {tauriInvoke} from 'root/core/transport/tauri/ipc'

export function normalizeExternalBrowserUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Unsupported external URL scheme: ${url.protocol}`)
  }
  return url.href
}

export async function openExternalBrowserUrl(value: string): Promise<void> {
  const url = normalizeExternalBrowserUrl(value)

  if (hasTauriRuntime()) {
    await tauriInvoke('open_url_external', {url})
    return
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}

function hasTauriRuntime(): boolean {
  const internals = (globalThis as {__TAURI_INTERNALS__?: {invoke?: unknown}}).__TAURI_INTERNALS__
  return Boolean(internals && typeof internals.invoke === 'function')
}
