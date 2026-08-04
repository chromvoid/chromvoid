import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {atom} from '@reatom/core'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
    tauriListen: async () => () => {},
  }
})

describe('WelcomeSetupModel remote entry', () => {
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
      if (command === 'mobile_usb_detect') return []
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
      supports_mobile_usb_remote: true,
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
          remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
        } as never,
        state: {
          data: () => stateData,
          update: vi.fn(),
        } as never,
      }),
    )

    const mod = await import('../../src/routes/welcome/welcome.model')
    const model = new mod.WelcomeSetupModel()
    model.connect()
    await Promise.resolve()

    expect(tauriInvoke).not.toHaveBeenCalledWith('mobile_usb_detect')

    model.onSelectRemoteMode()
    await vi.waitFor(() => expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_detect'))
    model.remote.activateDesktopInventory()

    expect(model.effectiveStep()).toBe('remote-connect')
    expect(pushNotification).not.toHaveBeenCalled()
    expect(tauriInvoke.mock.calls.filter(([command]) => command === 'mobile_usb_detect')).toHaveLength(1)

    model.onBackToModeSelect()
    expect(model.remote.usb.detectedDevices()).toEqual([])
    model.disconnect()
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
          remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
        } as never,
        state: {
          data: () => stateData,
          update: vi.fn(),
        } as never,
      }),
    )

    const mod = await import('../../src/routes/welcome/welcome.model')
    const model = new mod.WelcomeSetupModel()
    model.onSelectRemoteMode()

    expect(model.effectiveStep()).toBe('mode-select')
    expect(pushNotification).toHaveBeenCalledWith('info', 'Remote mode is not available on this device')
  })
})
