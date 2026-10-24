import {afterEach, beforeEach, describe, expect, it, vi, type Mock} from 'vitest'

const {tauriInvokeMock, tauriListenMock} = vi.hoisted(() => ({
  tauriInvokeMock: vi.fn<(command: string) => Promise<unknown>>(),
  tauriListenMock:
    vi.fn<(event: string, callback: (payload: unknown) => void) => Promise<() => void>>(),
}))

vi.mock('../../src/core/transport/tauri/ipc', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: tauriListenMock,
}))

import {moduleAccessModel} from '../../src/core/modules/module-access.model'
import {
  getRuntimeCapabilities,
  setRuntimeCapabilities,
} from '../../src/core/runtime/runtime-capabilities'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'
import {TauriTransport} from '../../src/core/transport/tauri/tauri-transport'
import type {TransportEventHandler} from '../../src/core/transport/transport'

const EVENTS = [
  'update:state',
  'catalog:event',
  'catalog:event:batch',
  'vault:locked',
  'volume:status',
  'ping',
  'pong',
  'media-stream:error',
  'ssh-agent:sign-request',
  'ssh-agent:sign-request-expired',
  'native-audio-player:event',
  'mode:changed',
] as const

type RegisteredListener = {
  event: string
  callback: (payload: unknown) => void
  unlisten: Mock<() => void>
}

function captureGlobalState() {
  return {
    capabilities: getRuntimeCapabilities(),
    coreMode: runtimeModeModel.coreMode(),
    remoteCoreFeatures: runtimeModeModel.remoteCoreFeatures(),
    transportSessionGeneration: runtimeModeModel.transportSessionGeneration(),
    nativeMediaStreamDisabled: runtimeModeModel.nativeMediaStreamDisabledForRuntimeSession(),
    nativeVideoDisabled: runtimeModeModel.nativeVideoDisabledForRuntimeSession(),
    nativeAudioDisabled: runtimeModeModel.nativeAudioDisabledForRuntimeSession(),
    nativeAudioDisabledReason: runtimeModeModel.nativeAudioDisabledReasonForRuntimeSession(),
    moduleAccessContext: moduleAccessModel.activeCoreContext(),
    moduleAccessReadiness: moduleAccessModel.activeCoreReadiness(),
    moduleAccessResolution: moduleAccessModel.resolution(),
  }
}

describe('TauriTransport connect retry listener cleanup', () => {
  const listeners: RegisteredListener[] = []
  const activeListeners = new Set<RegisteredListener>()
  let transport: TauriTransport
  let originalState: ReturnType<typeof captureGlobalState>
  let registrationError: Error | undefined
  let unlistenError: Error | undefined

  beforeEach(() => {
    originalState = captureGlobalState()
    transport = new TauriTransport()
    listeners.length = 0
    activeListeners.clear()
    registrationError = undefined
    unlistenError = undefined
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    tauriListenMock.mockReset()
    tauriListenMock.mockImplementation(async (event, callback) => {
      if (event === 'mode:changed' && registrationError) {
        const error = registrationError
        registrationError = undefined
        throw error
      }

      const listener: RegisteredListener = {
        event,
        callback,
        unlisten: vi.fn<() => void>(() => {
          activeListeners.delete(listener)
          if (event === 'update:state' && unlistenError) throw unlistenError
        }),
      }
      listeners.push(listener)
      activeListeners.add(listener)
      return listener.unlisten
    })

    tauriInvokeMock.mockReset()
    tauriInvokeMock.mockImplementation(async (command) => {
      switch (command) {
        case 'init_local_storage':
          return {ok: true, result: {storage_root: '/tmp/chromvoid'}}
        case 'runtime_capabilities':
          return {...originalState.capabilities, platform: 'ios', desktop: false, mobile: true}
        case 'get_current_mode':
          return {ok: true, result: 'local'}
        case 'module_access_snapshot':
          return {ok: true, result: []}
        default:
          throw new Error(`unexpected tauri command: ${command}`)
      }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    unlistenError = undefined
    transport.disconnect()
    setRuntimeCapabilities(originalState.capabilities)
    runtimeModeModel.coreMode.set(originalState.coreMode)
    runtimeModeModel.remoteCoreFeatures.set(originalState.remoteCoreFeatures)
    runtimeModeModel.transportSessionGeneration.set(originalState.transportSessionGeneration)
    runtimeModeModel.nativeMediaStreamDisabledForRuntimeSession.set(
      originalState.nativeMediaStreamDisabled,
    )
    runtimeModeModel.nativeVideoDisabledForRuntimeSession.set(originalState.nativeVideoDisabled)
    runtimeModeModel.nativeAudioDisabledForRuntimeSession.set(originalState.nativeAudioDisabled)
    runtimeModeModel.nativeAudioDisabledReasonForRuntimeSession.set(
      originalState.nativeAudioDisabledReason,
    )
    moduleAccessModel.reset()
    moduleAccessModel.setActiveCoreContext(
      originalState.moduleAccessContext,
      originalState.moduleAccessReadiness,
    )
    moduleAccessModel.resolution.set(originalState.moduleAccessResolution)
    tauriInvokeMock.mockReset()
    tauriListenMock.mockReset()
  })

  async function expectFailedConnect(error: Error): Promise<void> {
    await vi.waitFor(() => {
      expect(transport.connecting()).toBe(false)
      expect(transport.connected()).toBe(false)
      expect(transport.lastError()).toBe(error.message)
    })
  }

  function expectReleasedOnce(registered: readonly RegisteredListener[]): void {
    for (const listener of registered) {
      expect(listener.unlisten, listener.event).toHaveBeenCalledTimes(1)
    }
  }

  async function expectRetryDeliversOnce(failedListeners: readonly RegisteredListener[]): Promise<void> {
    transport.connect()
    await vi.waitFor(() => {
      expect(transport.connecting()).toBe(false)
      expect(transport.connected()).toBe(true)
    })

    const retryListeners = listeners.slice(failedListeners.length)
    expect(retryListeners.map(({event}) => event)).toEqual(EVENTS)
    expect(activeListeners.size).toBe(EVENTS.length)

    const subscriptions = EVENTS.map((event) => {
      const handler = vi.fn<TransportEventHandler>()
      transport.on(event, handler)
      return {event, handler, payload: {event, current_mode: 'local' as const}}
    })

    for (const {event, handler, payload} of subscriptions) {
      const activeForEvent = [...activeListeners].filter((listener) => listener.event === event)
      expect(activeForEvent, event).toHaveLength(1)
      for (const listener of activeForEvent) listener.callback(payload)
      expect(handler, event).toHaveBeenCalledTimes(1)
      expect(handler, event).toHaveBeenCalledWith(undefined, payload)
    }

    expectReleasedOnce(failedListeners)
    for (const listener of retryListeners) {
      expect(listener.unlisten, listener.event).not.toHaveBeenCalled()
    }

    transport.disconnect()
    expectReleasedOnce(failedListeners)
    expectReleasedOnce(retryListeners)
    expect(activeListeners.size).toBe(0)
  }

  it.each([false, true])(
    'releases a partial attempt before retry (unlisten throws: %s)',
    async (unlistenThrows) => {
      const error = new Error('mode listener registration failed')
      registrationError = error
      if (unlistenThrows) unlistenError = new Error('unlisten failed')

      transport.connect()
      await expectFailedConnect(error)

      const failedListeners = [...listeners]
      expect(failedListeners.map(({event}) => event)).toEqual(EVENTS.slice(0, -1))
      expectReleasedOnce(failedListeners)
      expect(activeListeners.size).toBe(0)
      if (unlistenThrows) {
        expect(console.warn).toHaveBeenCalledWith(
          '[dashboard][tauri] disconnect(): unlisten failed',
          unlistenError,
        )
      }

      unlistenError = undefined
      await expectRetryDeliversOnce(failedListeners)
    },
  )

  it('releases a complete attempt when mode initialization escapes its fallback catch', async () => {
    const error = new Error('runtime mode initialization failed')
    const setCoreMode = vi.spyOn(runtimeModeModel, 'setCoreMode').mockImplementation(() => {
      throw error
    })

    transport.connect()
    await expectFailedConnect(error)

    const failedListeners = [...listeners]
    expect(failedListeners.map(({event}) => event)).toEqual(EVENTS)
    expect(setCoreMode).toHaveBeenNthCalledWith(1, 'local')
    expect(setCoreMode).toHaveBeenNthCalledWith(2, 'switching')
    expectReleasedOnce(failedListeners)
    expect(activeListeners.size).toBe(0)

    setCoreMode.mockRestore()
    await expectRetryDeliversOnce(failedListeners)
  })

  it('still releases every listener once when disconnecting a successful attempt', async () => {
    transport.connect()
    await vi.waitFor(() => {
      expect(transport.connecting()).toBe(false)
      expect(transport.connected()).toBe(true)
    })
    expect(listeners.map(({event}) => event)).toEqual(EVENTS)
    for (const listener of listeners) expect(listener.unlisten).not.toHaveBeenCalled()

    transport.disconnect()

    expectReleasedOnce(listeners)
    expect(activeListeners.size).toBe(0)
    expect(transport.connected()).toBe(false)
    expect(transport.connecting()).toBe(false)

    transport.disconnect()
    expectReleasedOnce(listeners)
  })
})
