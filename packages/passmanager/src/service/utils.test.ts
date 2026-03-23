import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {writeClipboardText, copyWithAutoWipe, getTauriInternals} from './utils'

type TauriInternals = {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
}

function installTauri(invoke: TauriInternals['invoke']): void {
  ;(globalThis as unknown as {__TAURI_INTERNALS__: TauriInternals}).__TAURI_INTERNALS__ = {invoke}
}

function removeTauri(): void {
  delete (globalThis as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
}

describe('writeClipboardText', () => {
  beforeEach(() => {
    removeTauri()
  })

  afterEach(() => {
    removeTauri()
    vi.restoreAllMocks()
  })

  // ── Tauri path ──────────────────────────────────────────────────

  it('calls Tauri IPC with correct command and payload', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    installTauri(invoke)

    await writeClipboardText('hello')

    expect(invoke).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenCalledWith('plugin:clipboard-manager|write_text', {text: 'hello'})
  })

  it('calls Tauri IPC for empty string (wipe)', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    installTauri(invoke)

    await writeClipboardText('')

    expect(invoke).toHaveBeenCalledWith('plugin:clipboard-manager|write_text', {text: ''})
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

    await writeClipboardText('secret')

    expect(invoke).toHaveBeenCalledOnce()
    expect(browserWrite).not.toHaveBeenCalled()
  })

  it('propagates Tauri IPC errors (not silently swallowed)', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('ACL denied'))
    installTauri(invoke)

    await expect(writeClipboardText('test')).rejects.toThrow('ACL denied')
  })

  // ── Browser fallback path ───────────────────────────────────────

  it('uses navigator.clipboard.writeText when Tauri is absent', async () => {
    const browserWrite = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: {writeText: browserWrite},
      writable: true,
      configurable: true,
    })

    await writeClipboardText('browser-text')

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

    await writeClipboardText('legacy')

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

  it('copies text via Tauri IPC', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    installTauri(invoke)

    await copyWithAutoWipe('password123', 0)

    expect(invoke).toHaveBeenCalledWith('plugin:clipboard-manager|write_text', {text: 'password123'})
  })

  it('schedules a wipe after the specified delay', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    installTauri(invoke)

    await copyWithAutoWipe('secret', 5000)

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('plugin:clipboard-manager|write_text', {text: 'secret'})

    await vi.advanceTimersByTimeAsync(5000)

    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenLastCalledWith('plugin:clipboard-manager|write_text', {text: ''})
  })

  it('does not schedule wipe when wipeMs is 0', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    installTauri(invoke)

    await copyWithAutoWipe('no-wipe', 0)

    await vi.advanceTimersByTimeAsync(60000)

    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('does not throw when Tauri IPC fails and logs a warning', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('IPC broken'))
    installTauri(invoke)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(copyWithAutoWipe('test', 0)).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0]![0]).toContain('[clipboard]')
  })
})
