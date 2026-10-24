import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {DEFAULT_CLIPBOARD_WIPE_MS} from '@project/passmanager/password-utils'
import {passmanagerAutoWipeClipboard} from '../../src/features/passmanager/service/passmanager-clipboard'
import {systemClipboardTextWriter} from '../../src/shared/services/clipboard'

const invoke = vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>()

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: (cmd: string, args?: Record<string, unknown>) => invoke(cmd, args),
}))

function installTauri(): void {
  Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {configurable: true, value: {invoke}})
}

function installBrowserClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText}})
  return writeText
}

describe('clipboard copy paths', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue(undefined)
  })

  afterEach(() => {
    delete (globalThis as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: undefined})
    vi.useRealTimers()
  })

  it('copies and wipes vault data through write_secret on Tauri', async () => {
    vi.useFakeTimers()
    installTauri()

    await passmanagerAutoWipeClipboard.writeText('hunter2')

    expect(invoke).toHaveBeenCalledExactlyOnceWith('plugin:clipboard-manager|write_secret', {text: 'hunter2'})

    await vi.advanceTimersByTimeAsync(DEFAULT_CLIPBOARD_WIPE_MS)

    expect(invoke).toHaveBeenLastCalledWith('plugin:clipboard-manager|write_secret', {text: ''})
    expect(invoke).not.toHaveBeenCalledWith('plugin:clipboard-manager|write_text', expect.anything())
  })

  it('copies non-secret text through write_text on Tauri', async () => {
    installTauri()

    await systemClipboardTextWriter.writeText('chromvoid://pair?offer=abc')

    expect(invoke).toHaveBeenCalledExactlyOnceWith('plugin:clipboard-manager|write_text', {
      text: 'chromvoid://pair?offer=abc',
    })
  })

  it('falls back to navigator.clipboard for both paths outside Tauri', async () => {
    vi.useFakeTimers()
    const browserWrite = installBrowserClipboard()

    await passmanagerAutoWipeClipboard.writeText('hunter2')
    await systemClipboardTextWriter.writeText('offer')

    expect(invoke).not.toHaveBeenCalled()
    expect(browserWrite).toHaveBeenNthCalledWith(1, 'hunter2')
    expect(browserWrite).toHaveBeenNthCalledWith(2, 'offer')

    await vi.advanceTimersByTimeAsync(DEFAULT_CLIPBOARD_WIPE_MS)

    expect(browserWrite).toHaveBeenLastCalledWith('')
  })
})
