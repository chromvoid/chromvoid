import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  DEFAULT_NOTIFY_DESKTOP_POSITION,
  DEFAULT_NOTIFY_MOBILE_POSITION,
  getNotifyAdapter,
  notify,
  setNotifyAdapter,
  showNotifyToast,
  type NotifyPayload,
  type NotifyToastPresentOptions,
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
    let options: NotifyToastPresentOptions | undefined

    setNotifyAdapter({
      present(nextPayload, nextOptions) {
        payload = nextPayload
        options = nextOptions
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
    expect(options).toEqual({
      announce: undefined,
      announceMessage: undefined,
      announcePriority: undefined,
    })
  })

  it('uses the mobile default position when matchMedia reports a small viewport', () => {
    ;(globalThis as typeof globalThis & {window: Window}).window = {
      matchMedia: vi.fn(() => ({matches: true})),
    } as unknown as Window

    let payload: NotifyPayload | null = null
    setNotifyAdapter({
      present(nextPayload) {
        payload = nextPayload
      },
    })

    showNotifyToast({message: 'Saved'})

    expect(payload?.position).toBe(DEFAULT_NOTIFY_MOBILE_POSITION)
  })

  it('notify.loading returns a dismiss callback and uses loading-specific defaults', () => {
    const dismiss = vi.fn()
    let payload: NotifyPayload | null = null
    let options: NotifyToastPresentOptions | undefined

    setNotifyAdapter({
      present(nextPayload, nextOptions) {
        payload = nextPayload
        options = nextOptions
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
    expect(options).toEqual({
      announce: false,
      announceMessage: undefined,
      announcePriority: undefined,
    })

    stopLoading()
    expect(dismiss).toHaveBeenCalledOnce()
  })
})
