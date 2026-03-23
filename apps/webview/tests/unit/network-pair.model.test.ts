import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {NetworkPairModel, type IosHostStatus} from '../../src/routes/network-pair/network-pair.model'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
  }
})

describe('NetworkPairModel', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
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

    const status: IosHostStatus = {
      phase: 'Pairing',
      relay_url: 'wss://relay.chromvoid.com',
      device_id: 'device-1',
      device_label: 'ChromVoid iPhone',
      pairing_pin: '123456',
      pairing_offer: null,
      expires_at_ms: null,
      presence: null,
      paired_peer_id: null,
      error: null,
    }

    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'network_list_server_profiles') {
        return []
      }
      if (cmd === 'start_ios_host_mode') {
        return status
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    const model = new NetworkPairModel()
    await model.startPairing()
    model.dispose()

    expect(tauriInvoke).toHaveBeenNthCalledWith(1, 'network_list_server_profiles')
    expect(tauriInvoke).toHaveBeenNthCalledWith(2, 'start_ios_host_mode', {
      relayUrl: 'wss://relay.chromvoid.com',
      deviceLabel: 'ChromVoid iPhone',
    })
    expect(model.phase()).toBe('waiting')
    expect(model.error()).toBeNull()
  })

  it('auto-refreshes ready host presence on iOS when cached presence is missing', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_network_remote: true,
    })

    const staleStatus: IosHostStatus = {
      phase: 'Ready',
      relay_url: 'wss://relay.chromvoid.com',
      device_id: 'device-1',
      device_label: 'ChromVoid iPhone',
      pairing_pin: '123456',
      pairing_offer: null,
      expires_at_ms: null,
      presence: null,
      paired_peer_id: 'desktop-1',
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
      if (cmd === 'ios_host_status') {
        return staleStatus
      }
      if (cmd === 'publish_ios_presence') {
        expect(args).toEqual({relayUrl: 'wss://relay.chromvoid.com'})
        return refreshedStatus
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    const model = new NetworkPairModel()
    await (model as any).refreshHostStatus()
    model.dispose()

    expect(tauriInvoke).toHaveBeenNthCalledWith(1, 'ios_host_status')
    expect(tauriInvoke).toHaveBeenNthCalledWith(2, 'publish_ios_presence', {
      relayUrl: 'wss://relay.chromvoid.com',
    })
    expect(model.phase()).toBe('success')
    expect(model.hostStatus()?.presence?.status).toBe('ready')
    expect(model.error()).toBeNull()
  })

  it('does not auto-refresh ready host presence while expiry is still well beyond the refresh threshold', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_network_remote: true,
    })

    const readyStatus: IosHostStatus = {
      phase: 'Ready',
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
      error: null,
    }

    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'ios_host_status') {
        return readyStatus
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    const model = new NetworkPairModel()
    await (model as any).refreshHostStatus()
    model.dispose()

    expect(tauriInvoke).toHaveBeenCalledTimes(1)
    expect(tauriInvoke).toHaveBeenCalledWith('ios_host_status')
    expect(model.phase()).toBe('success')
    expect(model.hostStatus()?.presence?.room_id).toBe('room-1')
  })
})
