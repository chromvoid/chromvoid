import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {atom} from '@reatom/core'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {remoteSessionModel} from '../../src/routes/remote/remote-session.model'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'

const tauriInvoke = vi.fn()
const tauriListeners = new Map<string, (payload: unknown) => void>()

function mobileUsbStatus(sessionState: string) {
  return {
    transport_family: 'usb_mobile',
    available_transports: ['usb_mobile'],
    selected_transport: 'usb_mobile',
    session_state: sessionState,
    fallback_allowed: false,
    active_host: {
      host_id: 'usb-host-1',
      label: 'Pixel Host',
      platform: 'android',
      bridge_kind: 'android_aoa',
      pairing_state: 'paired',
      last_seen: null,
    },
    paired_hosts: [],
    pairing_approval: null,
    in_flight: null,
    error_code: null,
  }
}

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
    tauriListen: async (event: string, handler: (payload: unknown) => void) => {
      tauriListeners.set(event, handler)
      return () => {
        tauriListeners.delete(event)
      }
    },
  }
})

describe('remoteSessionModel', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    tauriListeners.clear()
    navigationModel.disconnect()
    runtimeModeModel.handleTransportDisconnect()
    setRuntimeCapabilities({platform: 'macos', desktop: true, mobile: false})
    clearAppContext()
  })

  afterEach(() => {
    remoteSessionModel.disconnect()
    navigationModel.disconnect()
    runtimeModeModel.handleTransportDisconnect()
    resetRuntimeCapabilities()
    clearAppContext()
  })

  it('tracks waiting and ready states from remote vault:status', async () => {
    let remoteMode = true
    let vaultUnlocked = false

    const remoteSessionState = atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive')
    const remoteSessionPeerId = atom<string | null>(null)
    const handleRemoteHostLocked = vi.fn()
    const resetSpy = vi.spyOn(navigationModel, 'reset')

    initAppContext(
      createMockAppContext({
        ws: {
          connected: () => true,
        } as never,
        store: {
          remoteSessionState,
          remoteSessionPeerId,
          setRemoteSessionWaiting: (peerId: string | null) => {
            remoteSessionPeerId.set(peerId)
            remoteSessionState.set('waiting_host_unlock')
          },
          setRemoteSessionReady: (peerId: string | null) => {
            remoteSessionPeerId.set(peerId)
            remoteSessionState.set('ready')
          },
          resetRemoteSession: () => {
            remoteSessionPeerId.set(null)
            remoteSessionState.set('inactive')
          },
          handleRemoteHostLocked,
        } as never,
      }),
    )

    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'mode_status') {
        return remoteMode
          ? {
              mode: {
                remote: {
                  host: {
                    type: 'tauri_remote_wss',
                    peer_id: 'peer-1',
                  },
                },
              },
              connection_state: 'ready',
              transport_type: 'wss',
            }
          : {
              mode: 'local',
              connection_state: 'disconnected',
              transport_type: null,
            }
      }

      if (command === 'rpc_dispatch') {
        return {
          ok: true,
          result: {
            command: 'vault:status',
            result: {
              is_unlocked: vaultUnlocked,
              session_started_at: vaultUnlocked ? 42 : null,
            },
          },
        }
      }

      throw new Error(`unexpected command: ${command}`)
    })

    await remoteSessionModel.connect()
    expect(remoteSessionState()).toBe('waiting_host_unlock')
    expect(remoteSessionPeerId()).toBe('peer-1')
    expect(runtimeModeModel.remoteCoreMode()).toBe(true)
    expect(handleRemoteHostLocked).not.toHaveBeenCalled()
    expect(resetSpy).not.toHaveBeenCalled()

    vaultUnlocked = true
    await remoteSessionModel.syncNow()
    expect(remoteSessionState()).toBe('ready')
    expect(remoteSessionPeerId()).toBe('peer-1')
    expect(resetSpy).toHaveBeenCalledTimes(1)

    vaultUnlocked = false
    await remoteSessionModel.syncNow()
    expect(remoteSessionState()).toBe('waiting_host_unlock')
    expect(handleRemoteHostLocked).toHaveBeenCalledTimes(1)

    remoteMode = false
    await remoteSessionModel.syncNow()
    expect(remoteSessionState()).toBe('inactive')
    expect(remoteSessionPeerId()).toBe(null)
    expect(runtimeModeModel.coreMode()).toBe('local')

    resetSpy.mockRestore()
  })

  it('tracks transport session generation for same-peer reconnects', async () => {
    let generation = 1
    const remoteSessionState = atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive')
    const remoteSessionPeerId = atom<string | null>(null)
    const remoteSessionGeneration = atom<number | null>(null)
    const resetSpy = vi.spyOn(navigationModel, 'reset')

    initAppContext(
      createMockAppContext({
        ws: {
          connected: () => true,
        } as never,
        store: {
          remoteSessionState,
          remoteSessionPeerId,
          remoteSessionGeneration,
          setRemoteSessionWaiting: (peerId: string | null) => {
            remoteSessionPeerId.set(peerId)
            remoteSessionState.set('waiting_host_unlock')
          },
          setRemoteSessionReady: (peerId: string | null) => {
            remoteSessionPeerId.set(peerId)
            remoteSessionState.set('ready')
          },
          resetRemoteSession: () => {
            remoteSessionPeerId.set(null)
            remoteSessionGeneration.set(null)
            remoteSessionState.set('inactive')
          },
          handleRemoteHostLocked: vi.fn(),
        } as never,
      }),
    )

    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'mode_status') {
        return {
          mode: {
            remote: {
              host: {
                type: 'tauri_remote_wss',
                peer_id: 'peer-1',
              },
            },
          },
          connection_state: 'ready',
          transport_type: 'wss',
          remote_core_features: [],
          transport_session_generation: generation,
        }
      }

      if (command === 'rpc_dispatch') {
        return {
          ok: true,
          result: {
            command: 'vault:status',
            result: {
              is_unlocked: true,
              session_started_at: 42,
            },
          },
        }
      }

      throw new Error(`unexpected command: ${command}`)
    })

    await remoteSessionModel.connect()
    expect(remoteSessionState()).toBe('ready')
    expect(remoteSessionPeerId()).toBe('peer-1')
    expect(remoteSessionGeneration()).toBe(1)
    expect(runtimeModeModel.transportSessionGeneration()).toBe(1)
    expect(resetSpy).toHaveBeenCalledTimes(1)

    generation = 2
    await remoteSessionModel.syncNow()

    expect(remoteSessionState()).toBe('ready')
    expect(remoteSessionPeerId()).toBe('peer-1')
    expect(remoteSessionGeneration()).toBe(2)
    expect(runtimeModeModel.transportSessionGeneration()).toBe(2)
    expect(resetSpy).toHaveBeenCalledTimes(2)

    resetSpy.mockRestore()
  })

  it('tracks mobile USB remote host sessions by host_id', async () => {
    const remoteSessionState = atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive')
    const remoteSessionPeerId = atom<string | null>(null)

    initAppContext(
      createMockAppContext({
        ws: {
          connected: () => true,
        } as never,
        store: {
          remoteSessionState,
          remoteSessionPeerId,
          setRemoteSessionWaiting: (peerId: string | null) => {
            remoteSessionPeerId.set(peerId)
            remoteSessionState.set('waiting_host_unlock')
          },
          setRemoteSessionReady: (peerId: string | null) => {
            remoteSessionPeerId.set(peerId)
            remoteSessionState.set('ready')
          },
          resetRemoteSession: () => {
            remoteSessionPeerId.set(null)
            remoteSessionState.set('inactive')
          },
          handleRemoteHostLocked: vi.fn(),
        } as never,
      }),
    )

    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'mode_status') {
        return {
          mode: {
            remote: {
              host: {
                type: 'mobile_usb',
                host_id: 'usb-host-1',
                label: 'Pixel Host',
                platform: 'android',
              },
            },
          },
          connection_state: 'ready',
          transport_type: 'usb_mobile',
        }
      }

      if (command === 'mobile_usb_status') {
        return mobileUsbStatus('transport_ready_host_locked')
      }

      if (command === 'rpc_dispatch') {
        return {
          ok: true,
          result: {
            command: 'vault:status',
            result: {
              is_unlocked: false,
              session_started_at: null,
            },
          },
        }
      }

      throw new Error(`unexpected command: ${command}`)
    })

    await remoteSessionModel.connect()

    expect(remoteSessionState()).toBe('waiting_host_unlock')
    expect(remoteSessionPeerId()).toBe('usb-host-1')
    expect(runtimeModeModel.remoteCoreMode()).toBe(true)
    expect(runtimeModeModel.canUseMediaStreamSource({transportKind: 'tauri'})).toBe(true)
  })

  it('waits for phone approval before reading a mobile USB remote vault', async () => {
    const remoteSessionState = atom<'inactive' | 'waiting_host_unlock' | 'waiting_phone_approval' | 'ready'>(
      'inactive',
    )
    const remoteSessionPeerId = atom<string | null>(null)
    const setRemoteSessionPhoneApproval = vi.fn((peerId: string | null) => {
      remoteSessionPeerId.set(peerId)
      remoteSessionState.set('waiting_phone_approval')
    })

    initAppContext(
      createMockAppContext({
        ws: {
          connected: () => true,
        } as never,
        store: {
          remoteSessionState,
          remoteSessionPeerId,
          setRemoteSessionWaiting: (peerId: string | null) => {
            remoteSessionPeerId.set(peerId)
            remoteSessionState.set('waiting_host_unlock')
          },
          setRemoteSessionPhoneApproval,
          setRemoteSessionReady: (peerId: string | null) => {
            remoteSessionPeerId.set(peerId)
            remoteSessionState.set('ready')
          },
          resetRemoteSession: () => {
            remoteSessionPeerId.set(null)
            remoteSessionState.set('inactive')
          },
          handleRemoteHostLocked: vi.fn(),
        } as never,
      }),
    )

    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'mode_status') {
        return {
          mode: {
            remote: {
              host: {
                type: 'mobile_usb',
                host_id: 'usb-host-1',
                label: 'Pixel Host',
                platform: 'android',
              },
            },
          },
          connection_state: 'ready',
          transport_type: 'usb_mobile',
          remote_core_features: [],
          transport_session_generation: 7,
        }
      }

      if (command === 'mobile_usb_status') {
        return mobileUsbStatus('session_approval_required')
      }

      throw new Error(`unexpected command: ${command}`)
    })

    await remoteSessionModel.connect()

    expect(setRemoteSessionPhoneApproval).toHaveBeenCalledWith('usb-host-1')
    expect(remoteSessionState()).toBe('waiting_phone_approval')
    expect(remoteSessionPeerId()).toBe('usb-host-1')
    expect(tauriInvoke.mock.calls.some(([command]) => command === 'rpc_dispatch')).toBe(false)
  })

  it('syncs immediately when mobile_usb_status_changed is emitted', async () => {
    const remoteSessionState = atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive')
    const remoteSessionPeerId = atom<string | null>(null)
    let usbSessionState = 'transport_ready_host_locked'

    initAppContext(
      createMockAppContext({
        ws: {
          connected: () => true,
        } as never,
        store: {
          remoteSessionState,
          remoteSessionPeerId,
          setRemoteSessionWaiting: (peerId: string | null) => {
            remoteSessionPeerId.set(peerId)
            remoteSessionState.set('waiting_host_unlock')
          },
          setRemoteSessionReady: (peerId: string | null) => {
            remoteSessionPeerId.set(peerId)
            remoteSessionState.set('ready')
          },
          resetRemoteSession: () => {
            remoteSessionPeerId.set(null)
            remoteSessionState.set('inactive')
          },
          handleRemoteHostLocked: vi.fn(),
        } as never,
      }),
    )

    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'mode_status') {
        return {
          mode: {
            remote: {
              host: {
                type: 'mobile_usb',
                host_id: 'usb-host-1',
                label: 'Pixel Host',
                platform: 'android',
              },
            },
          },
          connection_state: 'ready',
          transport_type: 'usb_mobile',
          remote_core_features: [],
          transport_session_generation: 11,
        }
      }

      if (command === 'mobile_usb_status') {
        return mobileUsbStatus(usbSessionState)
      }

      if (command === 'rpc_dispatch') {
        return {
          ok: true,
          result: {
            command: 'vault:status',
            result: {
              is_unlocked: true,
              session_started_at: 42,
            },
          },
        }
      }

      throw new Error(`unexpected command: ${command}`)
    })

    await remoteSessionModel.connect()
    expect(remoteSessionState()).toBe('waiting_host_unlock')

    usbSessionState = 'remote_dashboard_open'
    tauriListeners.get('mobile_usb_status_changed')?.(mobileUsbStatus('remote_dashboard_open'))
    await remoteSessionModel.syncNow()

    expect(remoteSessionState()).toBe('ready')
    expect(remoteSessionPeerId()).toBe('usb-host-1')
  })

  it('does not call desktop mode_status on mobile runtime', async () => {
    setRuntimeCapabilities({platform: 'android', desktop: false, mobile: true})
    const resetRemoteSession = vi.fn()

    initAppContext(
      createMockAppContext({
        ws: {
          connected: () => true,
        } as never,
        store: {
          resetRemoteSession,
        } as never,
      }),
    )

    await remoteSessionModel.connect()

    expect(resetRemoteSession).toHaveBeenCalledTimes(1)
    expect(tauriInvoke).not.toHaveBeenCalledWith('mode_status')
  })
})
