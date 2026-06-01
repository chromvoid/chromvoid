import {afterEach, describe, expect, it, vi} from 'vitest'

import {setupRuntimeCapabilitiesSync} from '../../src/app/bootstrap/runtime-capabilities-sync'
import {syncIOSViewportZoomPolicy} from '../../src/app/bootstrap/ios-viewport'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import type {TransportLike} from '../../src/core/transport/transport'
import type {Store} from '../../src/app/state/store'

vi.mock('../../src/app/bootstrap/ios-viewport', () => ({
  syncIOSViewportZoomPolicy: vi.fn(),
}))

function createSignal<T>(initialValue: T) {
  let value = initialValue
  const listeners = new Set<() => void>()

  return Object.assign(
    () => value,
    {
      set(nextValue: T) {
        value = nextValue
        for (const listener of listeners) listener()
      },
      subscribe(listener: () => void) {
        listeners.add(listener)
        listener()
        return () => listeners.delete(listener)
      },
    },
  )
}

describe('setupRuntimeCapabilitiesSync', () => {
  afterEach(() => {
    resetRuntimeCapabilities()
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('data-mobile-runtime')
  })

  it('runs explicit initial sync once and reacts only to real connection transitions', () => {
    setRuntimeCapabilities({mobile: true})
    const connected = createSignal(true)
    let mobile = false
    const setMobile = vi.fn((next: boolean) => {
      mobile = next
    })
    const isMobile = Object.assign(() => mobile, {set: setMobile})

    const cleanup = setupRuntimeCapabilitiesSync(
      {kind: 'ws', connected} as unknown as TransportLike,
      {isMobile} as unknown as Store,
      true,
    )

    expect(setMobile).toHaveBeenCalledTimes(1)
    expect(mobile).toBe(true)
    expect(document.documentElement.hasAttribute('data-mobile-runtime')).toBe(true)
    expect(syncIOSViewportZoomPolicy).toHaveBeenCalledTimes(1)

    connected.set(true)
    expect(setMobile).toHaveBeenCalledTimes(1)

    connected.set(false)
    expect(setMobile).toHaveBeenCalledTimes(2)
    expect(syncIOSViewportZoomPolicy).toHaveBeenCalledTimes(2)

    cleanup()
    connected.set(true)

    expect(setMobile).toHaveBeenCalledTimes(2)
  })
})
