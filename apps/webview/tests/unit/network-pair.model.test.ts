import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {RemoteHostsFlowModel, type MobileHostStatus} from '../../src/routes/remote/remote-hosts-flow.model'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import type {ModeInfo, NetworkPairedPeer} from '../../src/routes/remote/remote.model'

const tauriInvoke = vi.fn()
const showConfirmDialog = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
  }
})

vi.mock('root/shared/services/dialog', () => ({
  dialogService: {
    showConfirmDialog: (...args: unknown[]) => showConfirmDialog(...args),
  },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return {promise, resolve}
}

describe('RemoteHostsFlowModel', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    showConfirmDialog.mockReset()
    vi.useRealTimers()
    resetRuntimeCapabilities()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetRuntimeCapabilities()
  })

  it('uses the managed relay fallback on iOS when no server profiles are imported', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_network_remote: true,
    })

    const status: MobileHostStatus = {
      phase: 'Pairing',
      platform: 'ios',
      relay_url: 'wss://relay.chromvoid.com',
      device_id: 'device-1',
      device_label: 'ChromVoid iPhone',
      pairing_pin: '123456',
      pairing_offer: null,
      expires_at_ms: null,
      presence: null,
      paired_peer_id: null,
      connected_peers: [],
      error: null,
    }

    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'network_list_server_profiles') {
        return []
      }
      if (cmd === 'mobile_host_start') {
        return status
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    const model = new RemoteHostsFlowModel()
    await model.submitPairing()
    model.disconnect()

    expect(tauriInvoke).toHaveBeenNthCalledWith(1, 'network_list_server_profiles')
    expect(tauriInvoke).toHaveBeenNthCalledWith(2, 'mobile_host_start', {
      relayUrl: 'wss://relay.chromvoid.com',
      deviceLabel: 'ChromVoid iPhone',
    })
    expect(model.pairPhase()).toBe('waiting')
    expect(model.pairError()).toBeNull()
  })

  it('auto-refreshes ready host presence on iOS when cached presence is missing', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_network_remote: true,
    })

    const staleStatus: MobileHostStatus = {
      phase: 'Ready',
      platform: 'ios',
      relay_url: 'wss://relay.chromvoid.com',
      device_id: 'device-1',
      device_label: 'ChromVoid iPhone',
      pairing_pin: '123456',
      pairing_offer: null,
      expires_at_ms: null,
      presence: null,
      paired_peer_id: 'desktop-1',
      connected_peers: [],
      error: null,
    }
    const refreshedStatus: IosHostStatus = {
      ...staleStatus,
      presence: {
        peer_id: 'device-1',
        relay_url: 'wss://relay.chromvoid.com',
        room_id: 'room-1',
        expires_at_ms: Date.now() + 60_000,
        status: 'ready',
      },
    }

    tauriInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'mobile_host_status') {
        return staleStatus
      }
      if (cmd === 'mobile_host_publish_presence') {
        expect(args).toEqual({relayUrl: 'wss://relay.chromvoid.com'})
        return refreshedStatus
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    const model = new RemoteHostsFlowModel()
    await (model as any).refreshHostStatus()
    model.disconnect()

    expect(tauriInvoke).toHaveBeenNthCalledWith(1, 'mobile_host_status')
    expect(tauriInvoke).toHaveBeenNthCalledWith(2, 'mobile_host_publish_presence', {
      relayUrl: 'wss://relay.chromvoid.com',
    })
    expect(model.pairPhase()).toBe('success')
    expect(model.hostStatus()?.presence?.status).toBe('ready')
    expect(model.pairError()).toBeNull()
  })

  it('does not auto-refresh ready host presence while expiry is still well beyond the refresh threshold', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_network_remote: true,
    })

    const readyStatus: MobileHostStatus = {
      phase: 'Ready',
      platform: 'ios',
      relay_url: 'wss://relay.chromvoid.com',
      device_id: 'device-1',
      device_label: 'ChromVoid iPhone',
      pairing_pin: '123456',
      pairing_offer: null,
      expires_at_ms: null,
      presence: {
        peer_id: 'device-1',
        relay_url: 'wss://relay.chromvoid.com',
        room_id: 'room-1',
        expires_at_ms: Date.now() + 120_000,
        status: 'ready',
      },
      paired_peer_id: 'desktop-1',
      connected_peers: [],
      error: null,
    }

    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'mobile_host_status') {
        return readyStatus
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    const model = new RemoteHostsFlowModel()
    await (model as any).refreshHostStatus()
    model.disconnect()

    expect(tauriInvoke).toHaveBeenCalledTimes(1)
    expect(tauriInvoke).toHaveBeenCalledWith('mobile_host_status')
    expect(model.pairPhase()).toBe('success')
    expect(model.hostStatus()?.presence?.room_id).toBe('room-1')
  })

  it('uses Android host defaults and mobile host IPC on Android', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_network_remote: true,
    })

    const status: MobileHostStatus = {
      phase: 'Pairing',
      platform: 'android',
      relay_url: 'wss://relay.chromvoid.com',
      device_id: 'device-android-1',
      device_label: 'ChromVoid Android',
      pairing_pin: '654321',
      pairing_offer: {
        session_id: 'session-1',
        relay_base_url: 'https://relay.chromvoid.com',
        device_label: 'ChromVoid Android',
        expires_at_ms: Date.now() + 60_000,
        platform: 'android',
      },
      expires_at_ms: null,
      presence: null,
      paired_peer_id: null,
      connected_peers: [],
      error: null,
    }

    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'network_list_server_profiles') {
        return []
      }
      if (cmd === 'mobile_host_start') {
        return status
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    const model = new RemoteHostsFlowModel()
    await model.submitPairing()
    model.disconnect()

    expect(tauriInvoke).toHaveBeenNthCalledWith(2, 'mobile_host_start', {
      relayUrl: 'wss://relay.chromvoid.com',
      deviceLabel: 'ChromVoid Android',
    })
    expect(model.offerText()).toContain('chromvoid://pair-mobile?')
    expect(model.offerText()).toContain('platform=android')
  })

  it('pairs desktop to generic mobile host offers through the canonical command', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_network_remote: true,
    })

    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'desktop_pair_mobile_host') {
        return {peer_id: 'android-host-1'}
      }
      if (cmd === 'network_list_paired_peers') {
        return []
      }
      if (cmd === 'mode_status') {
        return {mode: 'local', connection_state: 'disconnected', transport_type: null}
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    const model = new RemoteHostsFlowModel()
    model.setOfferInput(
      'chromvoid://pair-mobile?session_id=s1&relay_base_url=https%3A%2F%2Frelay.chromvoid.com&device_label=ChromVoid%20Android&expires_at_ms=9999999999999&platform=android',
    )
    model.setPinInput('123456')
    await model.submitPairing()
    model.disconnect()

    expect(tauriInvoke).toHaveBeenCalledWith('desktop_pair_mobile_host', {
      offer: {
        session_id: 's1',
        relay_base_url: 'https://relay.chromvoid.com',
        device_label: 'ChromVoid Android',
        expires_at_ms: 9999999999999,
        platform: 'android',
      },
      pin: '123456',
      deviceLabel: 'ChromVoid Desktop',
    })
  })

  it('ignores stale mobile host status after disconnect', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_network_remote: true,
    })

    const pendingStatus = deferred<MobileHostStatus>()
    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'mobile_host_status') {
        return pendingStatus.promise
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    const model = new RemoteHostsFlowModel()
    const refresh = (model as any).refreshHostStatus() as Promise<void>
    model.disconnect()
    pendingStatus.resolve({
      phase: 'Ready',
      platform: 'ios',
      relay_url: 'wss://relay.chromvoid.com',
      device_id: 'device-1',
      device_label: 'Late iPhone',
      pairing_pin: null,
      pairing_offer: null,
      expires_at_ms: null,
      presence: null,
      paired_peer_id: 'desktop-1',
      connected_peers: [],
      error: null,
    })
    await refresh

    expect(model.hostStatus()).toBeNull()
    expect(model.deviceLabel()).toBe('')
    expect(model.pairPhase()).toBe('idle')
  })

  it('ignores stale mode status when a newer refresh has already applied', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_network_remote: true,
    })

    const firstStatus = deferred<ModeInfo>()
    const secondStatus = deferred<ModeInfo>()
    const statuses = [firstStatus, secondStatus]
    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'mode_status') {
        return statuses.shift()!.promise
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    const model = new RemoteHostsFlowModel()
    const firstRefresh = (model as any).refreshModeState() as Promise<void>
    const secondRefresh = (model as any).refreshModeState() as Promise<void>

    secondStatus.resolve({
      mode: 'local',
      connection_state: 'disconnected',
      transport_type: null,
      remote_core_features: [],
    })
    await secondRefresh

    firstStatus.resolve({
      mode: {remote: {host: {type: 'tauri_remote_wss', peer_id: 'old-peer'}}},
      connection_state: 'ready',
      transport_type: 'tauri_remote_wss',
      remote_core_features: [],
    })
    await firstRefresh
    model.disconnect()

    expect(model.transportConnectedPeerId()).toBeNull()
    expect(model.view()).toBe('hosts')
  })

  it('does not apply a stale peer list after disconnect', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_network_remote: true,
    })

    const peers = deferred<NetworkPairedPeer[]>()
    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'network_list_paired_peers') {
        return peers.promise
      }
      if (cmd === 'mode_status') {
        return {
          mode: 'local',
          connection_state: 'disconnected',
          transport_type: null,
          remote_core_features: [],
        }
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    const model = new RemoteHostsFlowModel()
    const load = model.loadPeers()
    model.disconnect()
    peers.resolve([
      {
        peer_id: 'late-peer',
        label: 'Late peer',
        relay_url: 'wss://relay.chromvoid.com',
        last_seen: 1,
        paired_at: 1,
        platform: 'ios',
        status: 'ready',
        presence_expires_at_ms: Date.now() + 60_000,
      },
    ])
    await load

    expect(model.peers()).toEqual([])
    expect(model.loadingPeers()).toBe(false)
  })

  it('does not remove a paired peer when confirmation is cancelled', async () => {
    showConfirmDialog.mockResolvedValue(false)
    const model = new RemoteHostsFlowModel()
    const peer: NetworkPairedPeer = {
      peer_id: 'peer-cancel',
      label: 'Peer Cancel',
      relay_url: 'wss://relay.chromvoid.com',
      last_seen: 1,
      paired_at: 1,
      platform: 'ios',
      status: 'ready',
      presence_expires_at_ms: Date.now() + 60_000,
    }

    const removed = await model.removePeer(peer)
    model.disconnect()

    expect(removed).toBe(false)
    expect(showConfirmDialog).toHaveBeenCalledWith(expect.objectContaining({confirmVariant: 'danger'}))
    expect(tauriInvoke).not.toHaveBeenCalledWith('network_remove_paired_peer', expect.anything())
    expect(model.removingPeerId()).toBeNull()
    expect(model.statusText()).toBeNull()
    expect(model.errorText()).toBeNull()
  })

  it('removes a paired peer and reloads peers after confirmation', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_network_remote: true,
    })
    showConfirmDialog.mockResolvedValue(true)
    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'network_remove_paired_peer') return undefined
      if (cmd === 'network_list_paired_peers') return []
      if (cmd === 'mode_status') {
        return {
          mode: 'local',
          connection_state: 'disconnected',
          transport_type: null,
          remote_core_features: [],
        }
      }
      throw new Error(`unexpected command: ${cmd}`)
    })
    const model = new RemoteHostsFlowModel()
    const peer: NetworkPairedPeer = {
      peer_id: 'peer-remove',
      label: 'Peer Remove',
      relay_url: 'wss://relay.chromvoid.com',
      last_seen: 1,
      paired_at: 1,
      platform: 'ios',
      status: 'ready',
      presence_expires_at_ms: Date.now() + 60_000,
    }

    const removed = await model.removePeer(peer)
    model.disconnect()

    expect(removed).toBe(true)
    expect(tauriInvoke).toHaveBeenCalledWith('network_remove_paired_peer', {peerId: 'peer-remove'})
    expect(tauriInvoke).toHaveBeenCalledWith('network_list_paired_peers')
    expect(model.statusText()).toBe('Paired host removed.')
    expect(model.removingPeerId()).toBeNull()
  })

  it('clears removing state and surfaces an error when peer removal fails', async () => {
    showConfirmDialog.mockResolvedValue(true)
    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'network_remove_paired_peer') {
        throw new Error('remove failed')
      }
      throw new Error(`unexpected command: ${cmd}`)
    })
    const model = new RemoteHostsFlowModel()
    const peer: NetworkPairedPeer = {
      peer_id: 'peer-fail',
      label: 'Peer Fail',
      relay_url: 'wss://relay.chromvoid.com',
      last_seen: 1,
      paired_at: 1,
      platform: 'ios',
      status: 'ready',
      presence_expires_at_ms: Date.now() + 60_000,
    }

    const removed = await model.removePeer(peer)
    model.disconnect()

    expect(removed).toBe(false)
    expect(model.removingPeerId()).toBeNull()
    expect(model.statusText()).toBeNull()
    expect(model.errorText()).toBe('remove failed')
  })
})
