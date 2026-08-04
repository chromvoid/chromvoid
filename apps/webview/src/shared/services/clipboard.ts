import {tauriInvoke} from 'root/core/transport/tauri/ipc'

export type ClipboardTextReader = {
  readText(): Promise<string>
}

export type ClipboardTextWriter = {
  writeText(text: string): Promise<void>
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

const writeTextToTauri = async (text: string): Promise<boolean> => {
  if (!hasTauriInternals()) {
    return false
  }

  try {
    await tauriInvoke<void>('plugin:clipboard-manager|write_text', {text})
    return true
  } catch {
    return false
  }
}

const writeTextToWebClipboard = async (text: string): Promise<void> => {
  const writeText = typeof navigator === 'undefined' ? undefined : navigator.clipboard?.writeText
  if (typeof writeText !== 'function') {
    throw new Error('Clipboard text write is unavailable')
  }
  await writeText.call(navigator.clipboard, text)
}

export const systemClipboardTextReader: ClipboardTextReader = {
  async readText(): Promise<string> {
    return (await readTextFromTauri()) ?? (await readTextFromWebClipboard())
  },
}

export const systemClipboardTextWriter: ClipboardTextWriter = {
  async writeText(text: string): Promise<void> {
    if (await writeTextToTauri(text)) return
    await writeTextToWebClipboard(text)
  },
}
