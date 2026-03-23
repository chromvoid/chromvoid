import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {state} from '@statx/core'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
    tauriListen: async () => () => {},
  }
})

describe('WelcomeModel remote entry', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    clearAppContext()
    resetRuntimeCapabilities()
    if (typeof globalThis.localStorage === 'undefined') {
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
          clear: () => {},
          key: () => null,
          length: 0,
        },
        configurable: true,
      })
    }
    ;(globalThis as unknown as {__TAURI_INTERNALS__?: {invoke: () => void}}).__TAURI_INTERNALS__ = {
      invoke: () => {},
    }

    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'network_list_paired_peers') return []
      if (command === 'mode_status') {
        return {
          mode: 'local',
          connection_state: 'disconnected',
          transport_type: null,
        }
      }
      throw new Error(`unexpected command: ${command}`)
    })
  })

  afterEach(() => {
    clearAppContext()
    resetRuntimeCapabilities()
    delete (globalThis as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
  })

  it('opens the remote connect step on desktop welcome', async () => {
    setRuntimeCapabilities({
      desktop: true,
      supports_network_remote: true,
    })

    const stateData = {
      NeedUserInitialization: true,
      StorageOpened: false,
    }
    const pushNotification = vi.fn()

    initAppContext(
      createMockAppContext({
        store: {
          pushNotification,
          remoteSessionState: state<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
        } as never,
        state: {
          data: () => stateData,
          update: vi.fn(),
        } as never,
      }),
    )

    const mod = await import('../../src/routes/welcome/welcome.model')
    const model = new mod.WelcomeModel()
    model.onSelectRemoteMode()
    await Promise.resolve()

    expect(model.setupStep()).toBe('remote-connect')
    expect(pushNotification).not.toHaveBeenCalled()
  })

  it('keeps the old mobile behavior', async () => {
    setRuntimeCapabilities({
      mobile: true,
      desktop: false,
      supports_network_remote: true,
    })

    const stateData = {
      NeedUserInitialization: true,
      StorageOpened: false,
    }
    const pushNotification = vi.fn()

    initAppContext(
      createMockAppContext({
        store: {
          pushNotification,
          remoteSessionState: state<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
        } as never,
        state: {
          data: () => stateData,
          update: vi.fn(),
        } as never,
      }),
    )

    const mod = await import('../../src/routes/welcome/welcome.model')
    const model = new mod.WelcomeModel()
    model.onSelectRemoteMode()

    expect(model.setupStep()).toBe(null)
    expect(pushNotification).toHaveBeenCalledWith('info', 'Remote mode is not available on this device')
  })
})
