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
    const handle = showNotifyToast({message: 'Saved'})
    expect(handle.id).toBe('')
    expect(handle.update({message: 'Updated'})).toBe(false)
    expect(() => handle.dismiss()).not.toThrow()
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
      key: undefined,
      actions: undefined,
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

  it('uses warning and action durations from the shared contract', () => {
    const payloads: NotifyPayload[] = []
    setNotifyAdapter({
      present(payload) {
        payloads.push(payload)
      },
    })

    notify.warning('Warning')
    showNotifyToast({
      message: 'Moved',
      actions: [{label: 'Undo', onClick: vi.fn()}],
    })

    expect(payloads[0]?.duration).toBe(8000)
    expect(payloads[1]?.duration).toBe(10_000)
  })

  it('notify.loading returns an updateable handle and uses loading-specific defaults', () => {
    const dismiss = vi.fn()
    const update = vi.fn(() => true)
    let payload: NotifyPayload | null = null

    setNotifyAdapter({
      present(nextPayload) {
        payload = nextPayload
        return {id: 'toast-1', update, dismiss}
      },
    })

    const loading = notify.loading('Syncing', 'Vault')

    expect(payload).toEqual({
      message: 'Syncing',
      title: 'Vault',
      variant: 'loading',
      duration: 0,
      persistent: true,
      closable: false,
      icon: undefined,
      progress: false,
      position: DEFAULT_NOTIFY_DESKTOP_POSITION,
      key: undefined,
      actions: undefined,
    })

    expect(loading.id).toBe('toast-1')
    expect(loading.update({message: 'Done', variant: 'success'})).toBe(true)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({message: 'Done', variant: 'success', duration: 5000}),
    )
    loading.dismiss()
    expect(dismiss).toHaveBeenCalledOnce()
  })
})
