import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {writeSecretClipboardText, copyWithAutoWipe, getTauriInternals} from './utils'

type TauriInternals = {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
}

function installTauri(invoke: TauriInternals['invoke']): void {
  ;(globalThis as unknown as {__TAURI_INTERNALS__: TauriInternals}).__TAURI_INTERNALS__ = {invoke}
}

function removeTauri(): void {
  delete (globalThis as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
}

describe('writeSecretClipboardText', () => {
  beforeEach(() => {
    removeTauri()
  })

  afterEach(() => {
    removeTauri()
    vi.restoreAllMocks()
  })

  // ── Tauri path ──────────────────────────────────────────────────

  it('writes through the Tauri write_secret command, not write_text', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    installTauri(invoke)

    await writeSecretClipboardText('hello')

    expect(invoke).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenCalledWith('plugin:clipboard-manager|write_secret', {text: 'hello'})
    expect(invoke).not.toHaveBeenCalledWith('plugin:clipboard-manager|write_text', expect.anything())
  })

  it('calls Tauri write_secret for empty string (wipe)', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    installTauri(invoke)

    await writeSecretClipboardText('')

    expect(invoke).toHaveBeenCalledWith('plugin:clipboard-manager|write_secret', {text: ''})
  })

  it('does not fall through to navigator.clipboard when Tauri succeeds', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    installTauri(invoke)

    const browserWrite = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: {writeText: browserWrite},
      writable: true,
      configurable: true,
    })

    await writeSecretClipboardText('secret')

    expect(invoke).toHaveBeenCalledOnce()
    expect(browserWrite).not.toHaveBeenCalled()
  })

  it('propagates Tauri IPC errors (not silently swallowed)', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('ACL denied'))
    installTauri(invoke)

    await expect(writeSecretClipboardText('test')).rejects.toThrow('ACL denied')
  })

  // ── Browser fallback path ───────────────────────────────────────

  it('uses navigator.clipboard.writeText when Tauri is absent', async () => {
    const browserWrite = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: {writeText: browserWrite},
      writable: true,
      configurable: true,
    })

    await writeSecretClipboardText('browser-text')

    expect(browserWrite).toHaveBeenCalledWith('browser-text')
  })

  it('falls through to execCommand when both Tauri and navigator.clipboard are absent', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    const execCommand = vi.fn().mockReturnValue(true)
    vi.spyOn(document, 'execCommand').mockImplementation(execCommand)

    await writeSecretClipboardText('legacy')

    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  // ── getTauriInternals ───────────────────────────────────────────

  it('returns undefined when __TAURI_INTERNALS__ is not set', () => {
    expect(getTauriInternals()).toBeUndefined()
  })

  it('returns the internals object when set', () => {
    const invoke = vi.fn()
    installTauri(invoke)

    const internals = getTauriInternals()
    expect(internals).toBeDefined()
    expect(internals!.invoke).toBe(invoke)
  })
})

describe('copyWithAutoWipe', () => {
  beforeEach(() => {
    removeTauri()
    vi.useFakeTimers()
  })

  afterEach(() => {
    removeTauri()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('copies text as a secret via Tauri IPC', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    installTauri(invoke)

    await copyWithAutoWipe('password123', 0)

    expect(invoke).toHaveBeenCalledWith('plugin:clipboard-manager|write_secret', {text: 'password123'})
  })

  it('schedules a wipe after the specified delay', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    installTauri(invoke)

    await copyWithAutoWipe('secret', 5000)

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('plugin:clipboard-manager|write_secret', {text: 'secret'})

    await vi.advanceTimersByTimeAsync(5000)

    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenLastCalledWith('plugin:clipboard-manager|write_secret', {text: ''})
  })

  it('does not schedule wipe when wipeMs is 0', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    installTauri(invoke)

    await copyWithAutoWipe('no-wipe', 0)

    await vi.advanceTimersByTimeAsync(60000)

    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('does not let an old wipe clear a newer copy', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    installTauri(invoke)

    await copyWithAutoWipe('first', 5000)
    await vi.advanceTimersByTimeAsync(3000)
    await copyWithAutoWipe('second', 5000)

    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenNthCalledWith(1, 'plugin:clipboard-manager|write_secret', {text: 'first'})
    expect(invoke).toHaveBeenNthCalledWith(2, 'plugin:clipboard-manager|write_secret', {text: 'second'})

    await vi.advanceTimersByTimeAsync(1999)
    expect(invoke).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(3001)
    expect(invoke).toHaveBeenCalledTimes(3)
    expect(invoke).toHaveBeenLastCalledWith('plugin:clipboard-manager|write_secret', {text: ''})
  })

  it('cancels a pending wipe after a successful no-wipe copy', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    installTauri(invoke)

    await copyWithAutoWipe('first', 5000)
    await copyWithAutoWipe('keep', 0)
    await vi.advanceTimersByTimeAsync(5000)

    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenNthCalledWith(1, 'plugin:clipboard-manager|write_secret', {text: 'first'})
    expect(invoke).toHaveBeenNthCalledWith(2, 'plugin:clipboard-manager|write_secret', {text: 'keep'})
  })

  it('rejects when the initial clipboard write fails', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('IPC broken'))
    installTauri(invoke)

    await expect(copyWithAutoWipe('test', 0)).rejects.toThrow('IPC broken')
  })

  it('ignores wipe failures after a successful copy', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('wipe failed'))
    installTauri(invoke)

    await copyWithAutoWipe('secret', 5000)
    await vi.advanceTimersByTimeAsync(5000)

    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenNthCalledWith(1, 'plugin:clipboard-manager|write_secret', {text: 'secret'})
    expect(invoke).toHaveBeenNthCalledWith(2, 'plugin:clipboard-manager|write_secret', {text: ''})
  })
})
