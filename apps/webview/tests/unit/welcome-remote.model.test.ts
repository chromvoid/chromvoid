import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {state} from '@statx/core'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {WelcomeRemoteModel} from '../../src/routes/welcome/welcome-remote.model'
import {remoteSessionModel} from '../../src/routes/remote/remote-session.model'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
    tauriListen: async () => () => {},
  }
})

describe('WelcomeRemoteModel', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    vi.useRealTimers()
    navigationModel.disconnect()
    clearAppContext()
  })

  afterEach(() => {
    vi.useRealTimers()
    remoteSessionModel.disconnect()
    navigationModel.disconnect()
    clearAppContext()
  })

  it('keeps the app in welcome and waits for host-local unlock after transport connect', async () => {
    let remoteModePeerId: string | null = null
    const stateData: Record<string, unknown> = {
      NeedUserInitialization: true,
      StorageOpened: false,
    }
    const stateUpdate = vi.fn((next: Record<string, unknown>) => {
      Object.assign(stateData, next)
    })
    const remoteSessionState = state<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive')
    const remoteSessionPeerId = state<string | null>(null)
    const setRemoteSessionWaiting = vi.fn((peerId: string | null) => {
      remoteSessionPeerId.set(peerId)
      remoteSessionState.set('waiting_host_unlock')
    })
    const setRemoteSessionReady = vi.fn((peerId: string | null) => {
      remoteSessionPeerId.set(peerId)
      remoteSessionState.set('ready')
    })
    const resetRemoteSession = vi.fn(() => {
      remoteSessionPeerId.set(null)
      remoteSessionState.set('inactive')
    })
    const resetSpy = vi.spyOn(navigationModel, 'reset')

    initAppContext(
      createMockAppContext({
        store: {
          remoteSessionState,
          remoteSessionPeerId,
          setRemoteSessionWaiting,
          setRemoteSessionReady,
          resetRemoteSession,
          handleRemoteHostLocked: vi.fn(),
        } as never,
        state: {
          data: () => stateData,
          update: stateUpdate,
        } as never,
      }),
    )

    tauriInvoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'network_list_paired_peers') {
        return [
          {
            peer_id: 'peer-1',
            label: 'My iPhone',
            relay_url: 'wss://relay.chromvoid.com',
            last_seen: Date.now(),
            paired_at: Date.now(),
            platform: 'ios',
            status: 'ready',
            presence_expires_at_ms: null,
          },
        ]
      }

      if (command === 'mode_status') {
        return remoteModePeerId
          ? {
              mode: {
                remote: {
                  host: {
                    type: 'tauri_remote_wss',
                    peer_id: remoteModePeerId,
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

      if (command === 'mode_switch') {
        const target = args?.target
        remoteModePeerId = target === 'remote' ? String(args?.peerId ?? '') : null
        return {
          previous_mode: 'local',
          current_mode: remoteModePeerId
            ? {
                remote: {
                  host: {
                    type: 'tauri_remote_wss',
                    peer_id: remoteModePeerId,
                  },
                },
              }
            : 'local',
          auto_locked: true,
          drain_completed: true,
        }
      }

      if (command === 'rpc_dispatch') {
        return {
          ok: true,
          result: {
            command: 'vault:status',
            result: {is_unlocked: false, session_started_at: null},
          },
        }
      }

      throw new Error(`unexpected command: ${command}`)
    })

    const model = new WelcomeRemoteModel()
    model.connect()
    await model.loadPeers()

    expect(model.peers()).toHaveLength(1)

    const connected = await model.connectToPeer('peer-1')
    expect(connected).toBe(true)
    expect(model.transportConnectedPeerId()).toBe('peer-1')
    expect(model.statusText()).toBe('Transport connected. Waiting for the vault to be opened on your iPhone.')
    expect(setRemoteSessionWaiting).toHaveBeenCalledWith('peer-1')
    expect(setRemoteSessionReady).not.toHaveBeenCalled()
    expect(stateUpdate).not.toHaveBeenCalledWith({StorageOpened: true})
    expect(resetSpy).not.toHaveBeenCalled()

    model.disconnect()
    resetSpy.mockRestore()
  })

  it('marks the remote session ready immediately when the host vault is already open', async () => {
    let remoteModePeerId: string | null = null
    const stateData: Record<string, unknown> = {
      NeedUserInitialization: true,
      StorageOpened: false,
    }
    const stateUpdate = vi.fn((next: Record<string, unknown>) => {
      Object.assign(stateData, next)
    })
    const remoteSessionState = state<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive')
    const remoteSessionPeerId = state<string | null>(null)
    const setRemoteSessionWaiting = vi.fn((peerId: string | null) => {
      remoteSessionPeerId.set(peerId)
      remoteSessionState.set('waiting_host_unlock')
    })
    const setRemoteSessionReady = vi.fn((peerId: string | null) => {
      remoteSessionPeerId.set(peerId)
      remoteSessionState.set('ready')
    })
    const resetRemoteSession = vi.fn(() => {
      remoteSessionPeerId.set(null)
      remoteSessionState.set('inactive')
    })
    const resetSpy = vi.spyOn(navigationModel, 'reset')

    initAppContext(
      createMockAppContext({
        store: {
          remoteSessionState,
          remoteSessionPeerId,
          setRemoteSessionWaiting,
          setRemoteSessionReady,
          resetRemoteSession,
          handleRemoteHostLocked: vi.fn(),
        } as never,
        state: {
          data: () => stateData,
          update: stateUpdate,
        } as never,
      }),
    )

    tauriInvoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'network_list_paired_peers') {
        return [
          {
            peer_id: 'peer-1',
            label: 'My iPhone',
            relay_url: 'wss://relay.chromvoid.com',
            last_seen: Date.now(),
            paired_at: Date.now(),
            platform: 'ios',
            status: 'ready',
            presence_expires_at_ms: null,
          },
        ]
      }

      if (command === 'mode_status') {
        return remoteModePeerId
          ? {
              mode: {
                remote: {
                  host: {
                    type: 'tauri_remote_wss',
                    peer_id: remoteModePeerId,
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

      if (command === 'mode_switch') {
        const target = args?.target
        remoteModePeerId = target === 'remote' ? String(args?.peerId ?? '') : null
        return {
          previous_mode: 'local',
          current_mode: remoteModePeerId
            ? {
                remote: {
                  host: {
                    type: 'tauri_remote_wss',
                    peer_id: remoteModePeerId,
                  },
                },
              }
            : 'local',
          auto_locked: true,
          drain_completed: true,
        }
      }

      if (command === 'rpc_dispatch') {
        return {
          ok: true,
          result: {
            command: 'vault:status',
            result: {is_unlocked: true, session_started_at: Date.now()},
          },
        }
      }

      throw new Error(`unexpected command: ${command}`)
    })

    const model = new WelcomeRemoteModel()
    model.connect()
    await model.loadPeers()

    const connected = await model.connectToPeer('peer-1')
    expect(connected).toBe(true)
    expect(model.transportConnectedPeerId()).toBe('peer-1')
    expect(setRemoteSessionReady).toHaveBeenCalledWith('peer-1')
    expect(setRemoteSessionWaiting).not.toHaveBeenCalled()
    expect(stateUpdate).not.toHaveBeenCalledWith({StorageOpened: true})
    expect(resetSpy).toHaveBeenCalled()

    model.disconnect()
    resetSpy.mockRestore()
  })

  it('reconnects cleanly when the app is stuck in a broken remote mode', async () => {
    let remoteModePeerId: string | null = 'peer-1'
    let connectionState: 'ready' | 'error' | 'disconnected' = 'error'
    const switchTargets: string[] = []
    const remoteSessionState = state<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive')
    const remoteSessionPeerId = state<string | null>(null)

    initAppContext(
      createMockAppContext({
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

    tauriInvoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'mode_status') {
        return remoteModePeerId
          ? {
              mode: {
                remote: {
                  host: {
                    type: 'tauri_remote_wss',
                    peer_id: remoteModePeerId,
                  },
                },
              },
              connection_state: connectionState,
              transport_type: 'wss',
            }
          : {
              mode: 'local',
              connection_state: 'disconnected',
              transport_type: null,
            }
      }

      if (command === 'mode_switch') {
        const target = String(args?.target ?? '')
        switchTargets.push(target)
        if (target === 'local') {
          remoteModePeerId = null
          connectionState = 'disconnected'
        } else {
          remoteModePeerId = String(args?.peerId ?? '')
          connectionState = 'ready'
        }
        return {
          previous_mode: 'local',
          current_mode: remoteModePeerId
            ? {
                remote: {
                  host: {
                    type: 'tauri_remote_wss',
                    peer_id: remoteModePeerId,
                  },
                },
              }
            : 'local',
          auto_locked: true,
          drain_completed: true,
        }
      }

      if (command === 'rpc_dispatch') {
        return {
          ok: true,
          result: {
            command: 'vault:status',
            result: {is_unlocked: false, session_started_at: null},
          },
        }
      }

      throw new Error(`unexpected command: ${command}`)
    })

    const model = new WelcomeRemoteModel()
    model.connect()

    const connected = await model.connectToPeer('peer-1')
    expect(connected).toBe(true)
    expect(switchTargets).toEqual(['local', 'remote'])
    expect(model.transportConnectedPeerId()).toBe('peer-1')

    model.disconnect()
  })

  it('polls paired peers until an iPhone host becomes ready', async () => {
    vi.useFakeTimers()

    let listCalls = 0
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'network_list_paired_peers') {
        listCalls += 1
        return [
          {
            peer_id: 'peer-1',
            label: 'My iPhone',
            relay_url: 'wss://relay.chromvoid.com',
            last_seen: Date.now(),
            paired_at: Date.now(),
            platform: 'ios',
            status: listCalls === 1 ? 'offline' : 'ready',
            presence_expires_at_ms: listCalls === 1 ? null : Date.now() + 60_000,
          },
        ]
      }

      if (command === 'mode_status') {
        return {
          mode: 'local',
          connection_state: 'disconnected',
          transport_type: null,
        }
      }

      throw new Error(`unexpected command: ${command}`)
    })

    const model = new WelcomeRemoteModel()
    model.connect()
    await model.loadPeers()

    expect(model.peers()).toHaveLength(1)
    expect(model.peers()[0]?.status).toBe('offline')

    await vi.advanceTimersByTimeAsync(2_000)

    expect(model.peers()[0]?.status).toBe('ready')

    model.disconnect()
  })
})
