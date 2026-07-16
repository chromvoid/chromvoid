import type {TextDirection} from '@project/i18n'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

type NativeSwipeEvent = {
  configurationId: number
  direction: TextDirection
  distance: number
  state: 'began' | 'changed' | 'ended' | 'cancelled'
  velocity: number
  y: number
}

type NativeConfigureArgs = {
  direction: TextDirection
  enabled: boolean
  requestId: number
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

function createDirectionSource(initialDirection: TextDirection) {
  let direction = initialDirection
  let listener: ((direction: TextDirection) => void) | null = null
  const unsubscribe = vi.fn(() => {
    listener = null
  })

  return {
    getDirection: () => direction,
    setDirection(nextDirection: TextDirection) {
      direction = nextDirection
      listener?.(nextDirection)
    },
    subscribeDirection(callback: (direction: TextDirection) => void) {
      listener = callback
      callback(direction)
      return unsubscribe
    },
    unsubscribe,
  }
}

function emitNativeGesture(
  configurationId: number,
  direction: TextDirection,
  distance = 140,
) {
  edgeSwipeRuntime.nativeListener?.({
    configurationId,
    direction,
    distance: 0,
    state: 'began',
    velocity: 0,
    y: 42,
  })
  edgeSwipeRuntime.nativeListener?.({
    configurationId,
    direction,
    distance,
    state: 'changed',
    velocity: 300,
    y: 42,
  })
  edgeSwipeRuntime.nativeListener?.({
    configurationId,
    direction,
    distance,
    state: 'ended',
    velocity: 300,
    y: 42,
  })
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const configuredRequestIds = (): number[] =>
  edgeSwipeRuntime.tauriInvoke.mock.calls
    .filter(([, args]) => args?.enabled === true)
    .map(([, args]) => args.requestId as number)

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return {promise, resolve}
}

describe('EdgeSwipeBack', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    edgeSwipeRuntime.native = false
    edgeSwipeRuntime.platform = 'web'
    edgeSwipeRuntime.nativeListener = null
    edgeSwipeRuntime.tauriInvoke.mockImplementation(
      async (
        command: string,
        args: NativeConfigureArgs,
      ) => {
        if (command !== 'configure_native_edge_back') return undefined
        return {
          configurationId: args.requestId,
          direction: args.direction,
          edge: args.direction === 'rtl' ? 'right' : 'left',
          enabled: args.enabled,
        }
      },
    )
    edgeSwipeRuntime.tauriListen.mockImplementation(
      async (_event: string, listener: (payload: NativeSwipeEvent) => void) => {
        edgeSwipeRuntime.nativeListener = listener
        return vi.fn()
      },
    )
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.head.querySelector('#edge-swipe-back-indicator-style')?.remove()
    vi.restoreAllMocks()
  })

  it.each([
    ['ltr', 4, 144],
    ['rtl', window.innerWidth - 4, window.innerWidth - 144],
  ] as const)('triggers touch fallback from logical inline-start in %s', (direction, startX, endX) => {
    const onBack = vi.fn()
    const element = document.createElement('div')
    document.body.append(element)
    const edgeSwipeBack = new EdgeSwipeBack(element, {
      getDirection: () => direction,
      onBack,
    })

    element.dispatchEvent(createTouchEvent('touchstart', [{clientX: startX, clientY: 24}]))
    document.dispatchEvent(createTouchEvent('touchmove', [{clientX: endX, clientY: 28}]))
    document.dispatchEvent(createTouchEvent('touchend', []))

    expect(onBack).toHaveBeenCalledOnce()
    edgeSwipeBack.destroy()
  })

  it('does not start an RTL touch fallback gesture from the physical left edge', () => {
    const onBack = vi.fn()
    const element = document.createElement('div')
    document.body.append(element)
    const edgeSwipeBack = new EdgeSwipeBack(element, {
      getDirection: () => 'rtl',
      onBack,
    })

    element.dispatchEvent(createTouchEvent('touchstart', [{clientX: 4, clientY: 24}]))
    document.dispatchEvent(createTouchEvent('touchmove', [{clientX: 144, clientY: 28}]))
    document.dispatchEvent(createTouchEvent('touchend', []))

    expect(onBack).not.toHaveBeenCalled()
    edgeSwipeBack.destroy()
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

  it('registers the native listener before enabling the iOS recognizer', async () => {
    edgeSwipeRuntime.native = true
    edgeSwipeRuntime.platform = 'ios'
    const direction = createDirectionSource('rtl')
    const edgeSwipeBack = new EdgeSwipeBack(document.createElement('div'), {
      ...direction,
      onBack: vi.fn(),
    })

    await flushMicrotasks()

    expect(edgeSwipeRuntime.tauriListen).toHaveBeenCalledWith('edge-swipe:progress', expect.any(Function))
    expect(edgeSwipeRuntime.tauriInvoke).toHaveBeenCalledWith('configure_native_edge_back', {
      direction: 'rtl',
      enabled: true,
      requestId: expect.any(Number),
    })
    expect(edgeSwipeRuntime.tauriListen.mock.invocationCallOrder[0]).toBeLessThan(
      edgeSwipeRuntime.tauriInvoke.mock.invocationCallOrder[0]!,
    )
    edgeSwipeBack.destroy()
  })

  it('keeps native iOS edge back suppressed when disabled becomes false before gesture end', async () => {
    edgeSwipeRuntime.native = true
    edgeSwipeRuntime.platform = 'ios'
    const direction = createDirectionSource('ltr')
    const onBack = vi.fn()
    let disabled = true
    const edgeSwipeBack = new EdgeSwipeBack(document.createElement('div'), {
      ...direction,
      onBack,
      isDisabled: () => disabled,
    })
    await flushMicrotasks()
    const [configurationId] = configuredRequestIds()
    expect(configurationId).toBeTypeOf('number')

    edgeSwipeRuntime.nativeListener?.({
      configurationId: configurationId!,
      direction: 'ltr',
      distance: 0,
      state: 'began',
      velocity: 0,
      y: 42,
    })
    disabled = false
    edgeSwipeRuntime.nativeListener?.({
      configurationId: configurationId!,
      direction: 'ltr',
      distance: 140,
      state: 'changed',
      velocity: 300,
      y: 42,
    })
    edgeSwipeRuntime.nativeListener?.({
      configurationId: configurationId!,
      direction: 'ltr',
      distance: 140,
      state: 'ended',
      velocity: 300,
      y: 42,
    })

    expect(onBack).not.toHaveBeenCalled()
    edgeSwipeBack.destroy()
  })

  it('reconfigures for runtime direction changes and rejects stale native events', async () => {
    edgeSwipeRuntime.native = true
    edgeSwipeRuntime.platform = 'ios'
    const direction = createDirectionSource('ltr')
    const onBack = vi.fn()
    const edgeSwipeBack = new EdgeSwipeBack(document.createElement('div'), {
      ...direction,
      onBack,
    })
    await flushMicrotasks()
    const [ltrConfigurationId] = configuredRequestIds()

    direction.setDirection('rtl')
    await flushMicrotasks()
    const [, rtlConfigurationId] = configuredRequestIds()
    expect(ltrConfigurationId).toBeTypeOf('number')
    expect(rtlConfigurationId).toBeTypeOf('number')
    emitNativeGesture(ltrConfigurationId!, 'ltr')
    expect(onBack).not.toHaveBeenCalled()

    emitNativeGesture(rtlConfigurationId!, 'rtl')
    expect(onBack).toHaveBeenCalledOnce()
    edgeSwipeBack.destroy()
  })

  it('serializes rapid direction changes and accepts only the latest acknowledged request', async () => {
    edgeSwipeRuntime.native = true
    edgeSwipeRuntime.platform = 'ios'
    const direction = createDirectionSource('ltr')
    const ltrResponse = createDeferred<{
      configurationId: number
      direction: TextDirection
      edge: 'left' | 'right'
      enabled: boolean
    }>()
    edgeSwipeRuntime.tauriInvoke.mockImplementation(async (_command: string, args: NativeConfigureArgs) => {
      if (!args.enabled) return {...args, configurationId: args.requestId, edge: 'left'}
      if (args.direction === 'ltr') return ltrResponse.promise
      return {...args, configurationId: args.requestId, edge: 'right'}
    })
    const onBack = vi.fn()
    const edgeSwipeBack = new EdgeSwipeBack(document.createElement('div'), {
      ...direction,
      onBack,
    })
    await flushMicrotasks()
    const [ltrRequestId] = configuredRequestIds()

    direction.setDirection('rtl')
    await flushMicrotasks()
    expect(configuredRequestIds()).toEqual([ltrRequestId])

    ltrResponse.resolve({
      configurationId: ltrRequestId!,
      direction: 'ltr',
      edge: 'left',
      enabled: true,
    })
    await flushMicrotasks()
    const [, rtlRequestId] = configuredRequestIds()
    expect(rtlRequestId).toBeGreaterThan(ltrRequestId!)

    emitNativeGesture(ltrRequestId!, 'ltr')
    expect(onBack).not.toHaveBeenCalled()
    emitNativeGesture(rtlRequestId!, 'rtl')
    expect(onBack).toHaveBeenCalledOnce()
    edgeSwipeBack.destroy()
  })

  it('queues destroy disablement after an in-flight enable request', async () => {
    edgeSwipeRuntime.native = true
    edgeSwipeRuntime.platform = 'ios'
    const direction = createDirectionSource('rtl')
    const enableResponse = createDeferred<{
      configurationId: number
      direction: TextDirection
      edge: 'right'
      enabled: true
    }>()
    edgeSwipeRuntime.tauriInvoke.mockImplementation(async (_command: string, args: NativeConfigureArgs) => {
      if (args.enabled) return enableResponse.promise
      return {...args, configurationId: args.requestId, edge: 'right'}
    })
    const edgeSwipeBack = new EdgeSwipeBack(document.createElement('div'), {
      ...direction,
      onBack: vi.fn(),
    })
    await flushMicrotasks()
    const [enableRequestId] = configuredRequestIds()

    edgeSwipeBack.destroy()
    await flushMicrotasks()
    expect(edgeSwipeRuntime.tauriInvoke).toHaveBeenCalledTimes(1)

    enableResponse.resolve({
      configurationId: enableRequestId!,
      direction: 'rtl',
      edge: 'right',
      enabled: true,
    })
    await flushMicrotasks()

    const disableCall = edgeSwipeRuntime.tauriInvoke.mock.calls.at(-1)
    expect(disableCall).toEqual([
      'configure_native_edge_back',
      {
        direction: 'rtl',
        enabled: false,
        requestId: expect.any(Number),
      },
    ])
    expect(disableCall?.[1].requestId).toBeGreaterThan(enableRequestId!)
  })

  it('falls back to RTL touch handling when native configuration fails', async () => {
    edgeSwipeRuntime.native = true
    edgeSwipeRuntime.platform = 'ios'
    edgeSwipeRuntime.tauriInvoke.mockRejectedValue(new Error('native bridge unavailable'))
    const onBack = vi.fn()
    const direction = createDirectionSource('rtl')
    const element = document.createElement('div')
    const edgeSwipeBack = new EdgeSwipeBack(element, {...direction, onBack})
    await flushMicrotasks()

    const startX = window.innerWidth - 4
    element.dispatchEvent(createTouchEvent('touchstart', [{clientX: startX, clientY: 24}]))
    document.dispatchEvent(
      createTouchEvent('touchmove', [{clientX: startX - 140, clientY: 28}]),
    )
    document.dispatchEvent(createTouchEvent('touchend', []))

    expect(onBack).toHaveBeenCalledOnce()
    expect(direction.unsubscribe).toHaveBeenCalledOnce()
    edgeSwipeBack.destroy()
  })

  it('unsubscribes, unlistens, and disables native recognition on destroy', async () => {
    edgeSwipeRuntime.native = true
    edgeSwipeRuntime.platform = 'ios'
    const direction = createDirectionSource('rtl')
    const unlisten = vi.fn()
    edgeSwipeRuntime.tauriListen.mockImplementation(async (_event: string, listener) => {
      edgeSwipeRuntime.nativeListener = listener
      return unlisten
    })
    const edgeSwipeBack = new EdgeSwipeBack(document.createElement('div'), {
      ...direction,
      onBack: vi.fn(),
    })
    await flushMicrotasks()

    edgeSwipeBack.destroy()
    await flushMicrotasks()

    expect(direction.unsubscribe).toHaveBeenCalledOnce()
    expect(unlisten).toHaveBeenCalledOnce()
    expect(edgeSwipeRuntime.tauriInvoke).toHaveBeenLastCalledWith('configure_native_edge_back', {
      direction: 'rtl',
      enabled: false,
      requestId: expect.any(Number),
    })
  })
})
