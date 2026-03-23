import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {state} from '@statx/core'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {remoteSessionModel} from '../../src/routes/remote/remote-session.model'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
    tauriListen: async () => () => {},
  }
})

describe('remoteSessionModel', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    navigationModel.disconnect()
    clearAppContext()
  })

  afterEach(() => {
    remoteSessionModel.disconnect()
    navigationModel.disconnect()
    clearAppContext()
  })

  it('tracks waiting and ready states from remote vault:status', async () => {
    let remoteMode = true
    let vaultUnlocked = false

    const remoteSessionState = state<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive')
    const remoteSessionPeerId = state<string | null>(null)
    const handleRemoteHostLocked = vi.fn()
    const resetSpy = vi.spyOn(navigationModel, 'reset')

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

    resetSpy.mockRestore()
  })
})
