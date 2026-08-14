import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {RemoteDesktopPairingModel} from '../../src/routes/remote/remote-desktop-pairing.model'
import {
  RemoteHostsFlowModel,
  type IosHostStatus,
  type MobileHostStatus,
} from '../../src/routes/remote/remote-hosts-flow.model'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import type {ModeInfo, NetworkPairedPeer} from '../../src/routes/remote/remote.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

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

const validPairingLink =
  'chromvoid://pair-mobile?session_id=s1&relay_base_url=https%3A%2F%2Frelay.chromvoid.com&device_label=ChromVoid%20Android&expires_at_ms=9999999999999&platform=android'

function networkPeer(overrides: Partial<NetworkPairedPeer> = {}): NetworkPairedPeer {
  return {
    peer_id: 'peer-1',
    label: 'Phone',
    relay_url: 'wss://relay.chromvoid.com',
    last_seen: 1,
    paired_at: 1,
    platform: 'ios',
    status: 'ready',
    presence_expires_at_ms: Date.now() + 60_000,
    ...overrides,
  }
}

describe('RemoteHostsFlowModel', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    showConfirmDialog.mockReset()
    vi.useRealTimers()
    resetRuntimeCapabilities()
    clearAppContext()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetRuntimeCapabilities()
    clearAppContext()
  })

  it('keeps desktop pairing errors hidden until enabled submit validates the first field', async () => {
    const submitPairing = vi.fn()
    const pairing = new RemoteDesktopPairingModel({submitPairing})

    expect(pairing.submitAttempted()).toBe(false)
    expect(pairing.offerError()).toBeNull()
    expect(pairing.pinError()).toBeNull()

    await expect(pairing.submit()).resolves.toEqual({
      status: 'validation_error',
      firstInvalid: 'offer',
    })

    expect(pairing.submitAttempted()).toBe(true)
    expect(pairing.offerError()).toBe('Enter the pairing link shown on your phone')
    expect(pairing.pinError()).toBe('Enter the PIN shown on your phone')
    expect(submitPairing).not.toHaveBeenCalled()
  })

  it('normalizes malformed JSON to the pairing-link format error', async () => {
    const pairing = new RemoteDesktopPairingModel({submitPairing: vi.fn()})
    pairing.setOfferInput('{"session_id":')
    pairing.setPinInput('123456')

    await expect(pairing.submit()).resolves.toEqual({
      status: 'validation_error',
      firstInvalid: 'offer',
    })
    expect(pairing.offerError()).toBe('Enter a valid ChromVoid pairing link')
    expect(pairing.offerError()).not.toContain('JSON')
  })

  it.each(['', '12345', '1234567', '12ab56'])(
    'requires exactly six digits for desktop pairing PIN %j',
    async (pin) => {
      const submitPairing = vi.fn()
      const pairing = new RemoteDesktopPairingModel({submitPairing})
      pairing.setOfferInput(validPairingLink)
      pairing.setPinInput(pin)

      await expect(pairing.submit()).resolves.toEqual({
        status: 'validation_error',
        firstInvalid: 'pin',
      })
      expect(pairing.pinError()).toBe(pin ? 'Enter the 6-digit PIN' : 'Enter the PIN shown on your phone')
      expect(submitPairing).not.toHaveBeenCalled()
    },
  )

  it('accepts JSON offers and applies the existing optional desktop label default', async () => {
    const submitPairing = vi.fn().mockResolvedValue(undefined)
    const pairing = new RemoteDesktopPairingModel({submitPairing})
    pairing.setOfferInput(
      JSON.stringify({
        session_id: 'json-session',
        relay_base_url: 'https://relay.chromvoid.com',
        device_label: 'ChromVoid iPhone',
        expires_at_ms: 9_999_999_999_999,
        platform: 'ios',
      }),
    )
    pairing.setPinInput('123456')

    await expect(pairing.submit()).resolves.toEqual({status: 'success'})
    expect(submitPairing).toHaveBeenCalledWith({
      offer: {
        session_id: 'json-session',
        relay_base_url: 'https://relay.chromvoid.com',
        device_label: 'ChromVoid iPhone',
        expires_at_ms: 9_999_999_999_999,
        platform: 'ios',
      },
      pin: '123456',
      deviceLabel: 'ChromVoid Desktop',
    })
  })

  it('returns busy for a duplicate desktop pairing submit without a second command', async () => {
    const pending = deferred<unknown>()
    const submitPairing = vi.fn(() => pending.promise)
    const pairing = new RemoteDesktopPairingModel({submitPairing})
    pairing.setOfferInput(validPairingLink)
    pairing.setPinInput('123456')

    const first = pairing.submit()
    expect(pairing.busy()).toBe(true)
    await expect(pairing.submit()).resolves.toEqual({status: 'busy'})
    expect(submitPairing).toHaveBeenCalledTimes(1)

    pending.resolve(undefined)
    await expect(first).resolves.toEqual({status: 'success'})
    expect(pairing.busy()).toBe(false)
  })

  it('keeps backend pairing failures global and separate from field errors', async () => {
    const pairing = new RemoteDesktopPairingModel({
      submitPairing: vi.fn().mockRejectedValue(new Error('pairing rejected')),
    })
    pairing.setOfferInput(validPairingLink)
    pairing.setPinInput('123456')

    await expect(pairing.submit()).resolves.toEqual({
      status: 'backend_error',
      error: 'pairing rejected',
    })
    expect(pairing.offerError()).toBeNull()
    expect(pairing.pinError()).toBeNull()
    expect(pairing.backendError()).toBe('pairing rejected')
  })

  it('exposes detailed desktop submit results through the shared flow compatibility model', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_network_remote: true,
    })
    const model = new RemoteHostsFlowModel()

    await expect(model.submitDesktopPairing()).resolves.toEqual({
      status: 'validation_error',
      firstInvalid: 'offer',
    })
    expect(model.pairPhase()).toBe('failed')
    expect(model.pairError()).toBe('Enter the pairing link shown on your phone')
    expect(model.statusText()).toBeNull()
  })

  it('tracks an initial peer load separately from the resolved list state', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_network_remote: true,
    })
    const pendingPeers = deferred<NetworkPairedPeer[]>()
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'network_list_paired_peers') return pendingPeers.promise
      if (command === 'mode_status') {
        return {
          mode: 'local',
          connection_state: 'disconnected',
          transport_type: null,
          remote_core_features: [],
        }
      }
      throw new Error(`unexpected command: ${command}`)
    })
    const model = new RemoteHostsFlowModel()
    const peer = networkPeer()

    const load = model.loadPeers('initial')
    expect(model.loadingPeers()).toBe(true)
    expect(model.peerListLoaded()).toBe(false)
    expect(model.peerListError()).toBeNull()

    pendingPeers.resolve([peer])
    await load

    expect(model.loadingPeers()).toBe(false)
    expect(model.peerListLoaded()).toBe(true)
    expect(model.peerListError()).toBeNull()
    expect(model.peers()).toEqual([peer])
    model.disconnect()
  })

  it('keeps stale peer rows and exposes a foreground refresh failure', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_network_remote: true,
    })
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'network_list_paired_peers') throw new Error('peer refresh failed')
      if (command === 'mode_status') {
        return {
          mode: 'local',
          connection_state: 'disconnected',
          transport_type: null,
          remote_core_features: [],
        }
      }
      throw new Error(`unexpected command: ${command}`)
    })
    const model = new RemoteHostsFlowModel()
    const stalePeer = networkPeer({peer_id: 'stale-peer'})
    model.peers.set([stalePeer])

    await model.loadPeers('manual')

    expect(model.peerListLoaded()).toBe(true)
    expect(model.peerListError()).toBe('peer refresh failed')
    expect(model.errorText()).toBe('peer refresh failed')
    expect(model.peers()).toEqual([stalePeer])
    model.disconnect()
  })

  it('keeps peer polling silent and nonblocking when a background refresh fails', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_network_remote: true,
    })
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'network_list_paired_peers') throw new Error('poll failed')
      if (command === 'mode_status') throw new Error('mode poll failed')
      throw new Error(`unexpected command: ${command}`)
    })
    const model = new RemoteHostsFlowModel()
    const stalePeer = networkPeer({peer_id: 'stale-peer'})
    model.peers.set([stalePeer])
    model.peerListLoaded.set(true)
    model.errorText.set('existing connection warning')

    const poll = model.loadPeers('poll')
    expect(model.loadingPeers()).toBe(false)
    await poll

    expect(model.loadingPeers()).toBe(false)
    expect(model.peerListLoaded()).toBe(true)
    expect(model.peerListError()).toBeNull()
    expect(model.errorText()).toBe('existing connection warning')
    expect(model.peers()).toEqual([stalePeer])
    model.disconnect()
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

  it('derives the mobile host page state from canonical host status', () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_network_remote: true,
    })

    const model = new RemoteHostsFlowModel()
    const status: MobileHostStatus = {
      phase: 'Idle',
      platform: 'android',
      relay_url: null,
      device_id: 'device-1',
      device_label: 'ChromVoid Android',
      pairing_pin: null,
      pairing_offer: null,
      expires_at_ms: null,
      presence: null,
      paired_peer_id: null,
      connected_peers: [],
      error: null,
    }

    expect(model.mobileHostPageState()).toBe('off')

    model.pairPhase.set('starting')
    expect(model.mobileHostPageState()).toBe('starting')

    model.pairPhase.set('waiting')
    model.hostStatus.set({...status, phase: 'Pairing'})
    expect(model.mobileHostPageState()).toBe('pairing')

    model.pairPhase.set('success')
    model.hostStatus.set({...status, phase: 'Ready'})
    expect(model.mobileHostPageState()).toBe('ready')

    model.hostStatus.set({
      ...status,
      phase: 'Ready',
      connected_peers: [
        {
          peer_id: 'desktop-1',
          label: 'Workstation',
          connected_at_ms: Date.now(),
          transport_type: 'usb_mobile',
        },
      ],
    })
    expect(model.mobileHostPageState()).toBe('ready')
    expect(model.connectedUsbPeers()).toHaveLength(1)
    expect(model.connectedNetworkPeers()).toHaveLength(0)

    model.hostStatus.set({
      ...status,
      phase: 'Idle',
      connected_peers: [
        {
          peer_id: 'desktop-1',
          label: 'Workstation',
          connected_at_ms: Date.now(),
          transport_type: 'usb_mobile',
        },
      ],
    })
    model.pairPhase.set('idle')
    expect(model.mobileHostPageState()).toBe('off')

    model.hostStatus.set({
      ...status,
      phase: 'Ready',
      connected_peers: [
        {
          peer_id: 'desktop-1',
          label: 'Workstation',
          connected_at_ms: Date.now(),
          transport_type: 'wss_relay',
        },
      ],
    })
    model.pairPhase.set('success')
    expect(model.mobileHostPageState()).toBe('connected')

    model.hostStatus.set({...status, phase: 'Error', error: 'host failed'})
    model.pairPhase.set('failed')
    expect(model.mobileHostPageState()).toBe('error')
  })

  it('stops an idle mobile host without confirmation and applies returned status', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_network_remote: true,
    })
    const idleStatus: MobileHostStatus = {
      phase: 'Idle',
      platform: 'ios',
      relay_url: null,
      device_id: 'device-1',
      device_label: 'ChromVoid iPhone',
      pairing_pin: null,
      pairing_offer: null,
      expires_at_ms: null,
      presence: null,
      paired_peer_id: null,
      connected_peers: [],
      error: null,
    }
    tauriInvoke.mockResolvedValue(idleStatus)

    const model = new RemoteHostsFlowModel()
    model.hostStatus.set({...idleStatus, phase: 'Ready'})
    model.pairPhase.set('success')

    await expect(model.stopMobileHost()).resolves.toBe(true)

    expect(showConfirmDialog).not.toHaveBeenCalled()
    expect(tauriInvoke).toHaveBeenCalledWith('mobile_host_stop')
    expect(model.mobileHostPageState()).toBe('off')
    expect(model.mobileHostStopping()).toBe(false)
  })

  it('confirms before disconnecting connected desktops from a mobile host', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_network_remote: true,
    })
    const connectedStatus: MobileHostStatus = {
      phase: 'Ready',
      platform: 'android',
      relay_url: 'wss://relay.chromvoid.com',
      device_id: 'device-1',
      device_label: 'ChromVoid Android',
      pairing_pin: null,
      pairing_offer: null,
      expires_at_ms: null,
      presence: null,
      paired_peer_id: 'desktop-1',
      connected_peers: [
        {
          peer_id: 'desktop-1',
          label: 'Desktop',
          connected_at_ms: Date.now(),
          transport_type: 'wss_relay',
        },
      ],
      error: null,
    }
    const idleStatus = {...connectedStatus, phase: 'Idle' as const, connected_peers: []}
    showConfirmDialog.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    tauriInvoke.mockResolvedValue(idleStatus)

    const model = new RemoteHostsFlowModel()
    model.hostStatus.set(connectedStatus)
    model.pairPhase.set('success')

    await expect(model.stopMobileHost()).resolves.toBe(false)
    expect(tauriInvoke).not.toHaveBeenCalled()
    expect(model.mobileHostPageState()).toBe('connected')

    await expect(model.stopMobileHost()).resolves.toBe(true)
    expect(showConfirmDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        confirmText: 'Stop',
        confirmVariant: 'danger',
      }),
    )
    expect(tauriInvoke).toHaveBeenCalledWith('mobile_host_stop')
    expect(model.mobileHostPageState()).toBe('off')
  })

  it('keeps the confirmed mobile host state when stopping fails', async () => {
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
      pairing_pin: null,
      pairing_offer: null,
      expires_at_ms: null,
      presence: null,
      paired_peer_id: 'desktop-1',
      connected_peers: [],
      error: null,
    }
    tauriInvoke.mockRejectedValue(new Error('stop failed'))

    const model = new RemoteHostsFlowModel()
    model.hostStatus.set(readyStatus)
    model.pairPhase.set('success')

    await expect(model.stopMobileHost()).resolves.toBe(false)

    expect(model.mobileHostPageState()).toBe('ready')
    expect(model.hostStatus()).toEqual(readyStatus)
    expect(model.pairError()).toBe('stop failed')
    expect(model.mobileHostStopping()).toBe(false)
  })

  it('does not stop mobile host mode when the route model disconnects', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_network_remote: true,
    })
    tauriInvoke.mockResolvedValue({
      phase: 'Idle',
      platform: 'ios',
      relay_url: null,
      device_id: null,
      device_label: null,
      pairing_pin: null,
      pairing_offer: null,
      expires_at_ms: null,
      presence: null,
      paired_peer_id: null,
      connected_peers: [],
      error: null,
    } satisfies MobileHostStatus)

    const model = new RemoteHostsFlowModel()
    model.connect()
    await Promise.resolve()
    model.disconnect()

    expect(tauriInvoke).toHaveBeenCalledWith('mobile_host_status')
    expect(tauriInvoke).not.toHaveBeenCalledWith('mobile_host_stop')
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

  it('keeps the full desktop pairing handoff atomic until the refreshed list arrives', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_network_remote: true,
    })
    const peers = deferred<NetworkPairedPeer[]>()
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'desktop_pair_mobile_host') return {peer_id: 'android-host-1'}
      if (command === 'network_list_paired_peers') return peers.promise
      if (command === 'mode_status') {
        return {mode: 'local', connection_state: 'disconnected', transport_type: null}
      }
      throw new Error(`unexpected command: ${command}`)
    })

    const model = new RemoteHostsFlowModel()
    model.setOfferInput(validPairingLink)
    model.setPinInput('123456')

    const firstSubmit = model.submitDesktopPairing()
    await vi.waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledWith('network_list_paired_peers')
    })

    expect(model.connectionOperationBusy()).toBe(true)
    await expect(model.submitDesktopPairing()).resolves.toEqual({status: 'busy'})
    expect(tauriInvoke.mock.calls.filter(([command]) => command === 'desktop_pair_mobile_host')).toHaveLength(
      1,
    )

    peers.resolve([])
    await expect(firstSubmit).resolves.toEqual({status: 'success'})
    expect(model.connectionOperationBusy()).toBe(false)
    model.disconnect()
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

  it('rejects programmatic exit and disconnect while another connection operation is active', async () => {
    setRuntimeCapabilities({desktop: true})
    const model = new RemoteHostsFlowModel()
    model.view.set('wait')
    model.activePeerId.set('peer-in-flight')

    await expect(model.disconnectTransport()).resolves.toBe(false)
    await expect(model.exitPreAuthRemote()).resolves.toBe(false)

    expect(model.view()).toBe('wait')
    expect(model.connectionOperationBusy()).toBe(true)
    expect(tauriInvoke).not.toHaveBeenCalled()
  })

  it('preserves the active remote flow when switching back to local mode fails', async () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_network_remote: true})
    const resetRemoteSession = vi.fn()
    initAppContext(
      createMockAppContext({
        store: {resetRemoteSession} as never,
      }),
    )
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'mode_status') {
        return {
          mode: {remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-active'}}},
          connection_state: 'ready',
          transport_type: 'wss',
          remote_core_features: [],
        }
      }
      if (command === 'mode_switch') throw new Error('local switch failed')
      throw new Error(`unexpected command: ${command}`)
    })

    const model = new RemoteHostsFlowModel()
    const activeHost = {type: 'tauri_remote_wss' as const, peer_id: 'peer-active'}
    model.view.set('wait')
    model.transportConnectedHost.set(activeHost)

    await expect(model.disconnectTransport()).resolves.toBe(false)
    await expect(model.exitPreAuthRemote()).resolves.toBe(false)

    expect(model.view()).toBe('wait')
    expect(model.transportConnectedHost()).toEqual(activeHost)
    expect(model.desktopActionErrorKind()).toBe('disconnect')
    expect(model.errorText()).toBe('local switch failed')
    expect(model.modeTransitionBusy()).toBe(false)
    expect(resetRemoteSession).not.toHaveBeenCalled()
  })

  it('uses bounded mobile USB disconnect when leaving the pre-approval wait flow', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_mobile_usb_remote: true,
    })
    const resetRemoteSession = vi.fn()
    initAppContext(
      createMockAppContext({
        store: {resetRemoteSession} as never,
      }),
    )
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'mode_status') {
        return {
          mode: {
            remote: {
              host: {
                type: 'mobile_usb',
                host_id: 'usb-host',
                label: 'Pixel',
                platform: 'android',
              },
            },
          },
          connection_state: 'ready',
          transport_type: 'usb_mobile',
          remote_core_features: [],
        }
      }
      if (command === 'mobile_usb_disconnect') {
        return {
          transport_family: 'usb_mobile',
          available_transports: ['usb_mobile'],
          selected_transport: null,
          session_state: 'disconnected',
          fallback_allowed: false,
          active_host: null,
          paired_hosts: [],
          in_flight: null,
          pairing_approval: null,
          error_code: null,
        }
      }
      throw new Error(`unexpected command: ${command}`)
    })

    const model = new RemoteHostsFlowModel()
    model.view.set('wait')
    model.transportConnectedHost.set({
      type: 'mobile_usb',
      host_id: 'usb-host',
      label: 'Pixel',
      platform: 'android',
    })

    await expect(model.disconnectTransport()).resolves.toBe(true)

    expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_disconnect')
    expect(tauriInvoke).not.toHaveBeenCalledWith('mode_switch', expect.anything())
    expect(model.transportConnectedHost()).toBeNull()
    expect(resetRemoteSession).toHaveBeenCalledOnce()
  })

  it('preserves the wait flow and reports a status error when local-mode restore cannot read mode', async () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_network_remote: true})
    const resetRemoteSession = vi.fn()
    initAppContext(
      createMockAppContext({
        store: {resetRemoteSession} as never,
      }),
    )
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'mode_status') throw new Error('mode status unavailable')
      throw new Error(`unexpected command: ${command}`)
    })

    const model = new RemoteHostsFlowModel()
    const activeHost = {type: 'tauri_remote_wss' as const, peer_id: 'peer-active'}
    model.view.set('wait')
    model.transportConnectedHost.set(activeHost)

    await expect(model.disconnectTransport()).resolves.toBe(false)

    expect(model.view()).toBe('wait')
    expect(model.transportConnectedHost()).toEqual(activeHost)
    expect(model.desktopActionErrorKind()).toBe('status')
    expect(model.errorText()).toBe('mode status unavailable')
    expect(model.modeTransitionBusy()).toBe(false)
    expect(resetRemoteSession).not.toHaveBeenCalled()
  })

  it('does not open network pairing while a connect, remove, or pair operation is active', () => {
    const markBusy = [
      (model: RemoteHostsFlowModel) => model.activePeerId.set('peer-in-flight'),
      (model: RemoteHostsFlowModel) => model.removingPeerId.set('peer-removing'),
      (model: RemoteHostsFlowModel) => model.desktopPairing.busy.set(true),
    ]

    for (const markOperationBusy of markBusy) {
      const model = new RemoteHostsFlowModel()
      model.errorText.set('existing operation status')
      markOperationBusy(model)

      model.openPairIos()

      expect(model.view()).toBe('hosts')
      expect(model.errorText()).toBe('existing operation status')
      expect(model.connectionOperationBusy()).toBe(true)
    }
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
    expect(showConfirmDialog).toHaveBeenCalledWith({
      title: 'Forget this phone?',
      message:
        'Forget Peer Cancel on this computer? This only removes the local pairing record. The phone will keep trusting this computer until access is revoked there.',
      confirmText: 'Forget phone',
      confirmVariant: 'danger',
    })
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
    expect(model.statusText()).toBe('Phone forgotten.')
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
