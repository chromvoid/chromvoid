import {afterEach, describe, expect, it, vi} from 'vitest'

const tauriInvoke = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => tauriInvoke(...args),
}))

import {
  normalizeExternalBrowserUrl,
  openExternalBrowserUrl,
} from '../../src/shared/services/external-browser'

const originalTauriInternals = (globalThis as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
const originalWindowOpen = window.open

describe('external-browser service', () => {
  afterEach(() => {
    tauriInvoke.mockReset()
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      writable: true,
      value: originalTauriInternals,
    })
    Object.defineProperty(window, 'open', {
      configurable: true,
      writable: true,
      value: originalWindowOpen,
    })
  })

  it('opens web URLs through the native external browser command inside Tauri', async () => {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      writable: true,
      value: {invoke: vi.fn()},
    })

    await openExternalBrowserUrl('https://www.google.com/maps/search/?api=1&query=55.755833%2C37.617222')

    expect(tauriInvoke).toHaveBeenCalledWith('open_url_external', {
      url: 'https://www.google.com/maps/search/?api=1&query=55.755833%2C37.617222',
    })
    expect(window.open).toBe(originalWindowOpen)
  })

  it('falls back to a browser tab only outside Tauri', async () => {
    const open = vi.fn()
    Object.defineProperty(window, 'open', {
      configurable: true,
      writable: true,
      value: open,
    })
    Reflect.deleteProperty(globalThis, '__TAURI_INTERNALS__')

    await openExternalBrowserUrl('https://example.com/maps')

    expect(tauriInvoke).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledWith('https://example.com/maps', '_blank', 'noopener,noreferrer')
  })

  it('rejects non-web URL schemes', () => {
    expect(() => normalizeExternalBrowserUrl('javascript:alert(1)')).toThrow(/Unsupported/)
    expect(() => normalizeExternalBrowserUrl('file:///tmp/map.html')).toThrow(/Unsupported/)
  })
})
