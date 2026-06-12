import {tauriInvoke} from 'root/core/transport/tauri/ipc'

export type ClipboardTextReader = {
  readText(): Promise<string>
}

const hasTauriInternals = (): boolean => {
  const internals = (globalThis as unknown as {__TAURI_INTERNALS__?: {invoke?: unknown}})
    .__TAURI_INTERNALS__
  return Boolean(internals && typeof internals === 'object' && typeof internals.invoke === 'function')
}

const readTextFromTauri = async (): Promise<string | null> => {
  if (!hasTauriInternals()) {
    return null
  }

  try {
    return await tauriInvoke<string>('plugin:clipboard-manager|read_text')
  } catch {
    return null
  }
}

const readTextFromWebClipboard = async (): Promise<string> => {
  if (typeof navigator === 'undefined') {
    return ''
  }

  return (await navigator.clipboard?.readText?.()) ?? ''
}

export const systemClipboardTextReader: ClipboardTextReader = {
  async readText(): Promise<string> {
    return (await readTextFromTauri()) ?? (await readTextFromWebClipboard())
  },
}
