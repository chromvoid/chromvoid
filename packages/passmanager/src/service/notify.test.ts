import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  DEFAULT_NOTIFY_DESKTOP_POSITION,
  DEFAULT_NOTIFY_MOBILE_POSITION,
  getNotifyAdapter,
  notify,
  setNotifyAdapter,
  showNotifyToast,
  type NotifyPayload,
} from './notify'

afterEach(() => {
  setNotifyAdapter(null)
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'window')
})

describe('notify adapter', () => {
  it('returns a no-op handle when no adapter is registered', () => {
    expect(getNotifyAdapter()).toBeNull()
    expect(() => showNotifyToast({message: 'Saved'}).dismiss()).not.toThrow()
  })

  it('passes resolved default payload to the registered adapter', () => {
    let payload: NotifyPayload | null = null

    setNotifyAdapter({
      present(nextPayload) {
        payload = nextPayload
      },
    })

    showNotifyToast({message: 'Saved', title: 'Vault'})

    expect(payload).toEqual({
      message: 'Saved',
      title: 'Vault',
      variant: 'info',
      duration: 5000,
      persistent: false,
      closable: true,
      icon: undefined,
      progress: true,
      position: DEFAULT_NOTIFY_DESKTOP_POSITION,
    })
  })

  it('uses the mobile default position when matchMedia reports a small viewport', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        matchMedia: vi.fn(() => ({matches: true} as MediaQueryList)),
      } as unknown as Pick<Window, 'matchMedia'>,
    })

    let payload: NotifyPayload | null = null
    setNotifyAdapter({
      present(nextPayload) {
        payload = nextPayload
      },
    })

    showNotifyToast({message: 'Saved'})

    if (!payload) throw new Error('expected payload to be present')
    const resolvedPayload = payload as NotifyPayload
    expect(resolvedPayload.position).toBe(DEFAULT_NOTIFY_MOBILE_POSITION)
  })

  it('notify.loading returns a dismiss callback and uses loading-specific defaults', () => {
    const dismiss = vi.fn()
    let payload: NotifyPayload | null = null

    setNotifyAdapter({
      present(nextPayload) {
        payload = nextPayload
        return {dismiss}
      },
    })

    const stopLoading = notify.loading('Syncing', 'Vault')

    expect(payload).toEqual({
      message: 'Syncing',
      title: 'Vault',
      variant: 'loading',
      duration: 5000,
      persistent: true,
      closable: false,
      icon: undefined,
      progress: false,
      position: DEFAULT_NOTIFY_DESKTOP_POSITION,
    })

    stopLoading()
    expect(dismiss).toHaveBeenCalledOnce()
  })
})
