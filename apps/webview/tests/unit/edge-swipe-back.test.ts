import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

type NativeSwipeEvent = {
  state: 'began' | 'changed' | 'ended' | 'cancelled'
  deltaX: number
  y: number
  velocityX: number
}

const edgeSwipeRuntime = vi.hoisted(() => ({
  native: false,
  platform: 'web' as 'ios' | 'android' | 'web',
  nativeListener: null as ((payload: NativeSwipeEvent) => void) | null,
  tauriInvoke: vi.fn(),
  tauriListen: vi.fn(),
}))

vi.mock('root/core/runtime/runtime', () => ({
  isTauriRuntime: () => edgeSwipeRuntime.native,
}))

vi.mock('root/core/runtime/runtime-capabilities', () => ({
  getRuntimeCapabilities: () => ({platform: edgeSwipeRuntime.platform}),
}))

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: edgeSwipeRuntime.tauriInvoke,
  tauriListen: edgeSwipeRuntime.tauriListen,
}))

import {EdgeSwipeBack} from '../../src/utils/edge-swipe-back'

function createTouchEvent(type: string, touches: Array<{clientX: number; clientY: number}>): TouchEvent {
  const event = new Event(type, {bubbles: true, cancelable: true}) as TouchEvent
  Object.defineProperty(event, 'touches', {value: touches})
  Object.defineProperty(event, 'changedTouches', {value: touches})
  return event
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('EdgeSwipeBack', () => {
  beforeEach(() => {
    edgeSwipeRuntime.native = false
    edgeSwipeRuntime.platform = 'web'
    edgeSwipeRuntime.nativeListener = null
    edgeSwipeRuntime.tauriInvoke.mockResolvedValue(undefined)
    edgeSwipeRuntime.tauriListen.mockImplementation(
      async (_event: string, listener: (payload: NativeSwipeEvent) => void) => {
        edgeSwipeRuntime.nativeListener = listener
        return vi.fn()
      },
    )
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('suppresses touch fallback edge back when disabled at gesture start', () => {
    const onBack = vi.fn()
    let disabled = true
    const element = document.createElement('div')
    document.body.append(element)

    const edgeSwipeBack = new EdgeSwipeBack(element, {
      onBack,
      isDisabled: () => disabled,
    })

    element.dispatchEvent(createTouchEvent('touchstart', [{clientX: 4, clientY: 24}]))
    disabled = false
    document.dispatchEvent(createTouchEvent('touchmove', [{clientX: 140, clientY: 28}]))
    document.dispatchEvent(createTouchEvent('touchend', []))

    expect(onBack).not.toHaveBeenCalled()
    edgeSwipeBack.destroy()
  })

  it('keeps native iOS edge back suppressed when disabled becomes false before gesture end', async () => {
    edgeSwipeRuntime.native = true
    edgeSwipeRuntime.platform = 'ios'
    const onBack = vi.fn()
    let disabled = true
    const element = document.createElement('div')
    document.body.append(element)

    const edgeSwipeBack = new EdgeSwipeBack(element, {
      onBack,
      isDisabled: () => disabled,
    })
    await flushMicrotasks()

    expect(edgeSwipeRuntime.tauriInvoke).toHaveBeenCalledWith('setup_native_gestures')
    expect(edgeSwipeRuntime.tauriListen).toHaveBeenCalledWith('edge-swipe:progress', expect.any(Function))
    expect(edgeSwipeRuntime.nativeListener).not.toBeNull()

    edgeSwipeRuntime.nativeListener?.({state: 'began', deltaX: 0, y: 42, velocityX: 0})
    disabled = false
    edgeSwipeRuntime.nativeListener?.({state: 'changed', deltaX: 140, y: 42, velocityX: 300})
    edgeSwipeRuntime.nativeListener?.({state: 'ended', deltaX: 140, y: 42, velocityX: 300})

    expect(onBack).not.toHaveBeenCalled()
    edgeSwipeBack.destroy()
  })
})
