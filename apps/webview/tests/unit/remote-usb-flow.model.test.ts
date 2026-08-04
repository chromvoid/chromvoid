import {atom} from '@reatom/core'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {html, render} from 'lit'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {dialogService} from '../../src/shared/services/dialog'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {RemoteHostsFlowModel} from '../../src/routes/remote/remote-hosts-flow.model'
import {renderRemoteHostsFlowPanel} from '../../src/routes/remote/remote-hosts-flow.render'
import {RemoteUsbFlowModel} from '../../src/routes/remote/remote-usb-flow.model'
import {
  type MobileUsbDetectedDevice,
  type MobileUsbHostView,
  type MobileUsbScannedHost,
  type MobileUsbStatus,
  type NetworkPairedPeer,
  mobileUsbConfirmPairing,
  mobileUsbConnect,
  mobileUsbDisconnect,
  mobileUsbListPaired,
  mobileUsbPair,
  mobileUsbRemovePaired,
  mobileUsbScan,
  mobileUsbStatus,
} from '../../src/routes/remote/remote.model'

const tauriInvoke = vi.fn()
const tauriListeners = new Map<string, (payload: unknown) => void>()

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return {promise, resolve}
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

const baseStatus = (override: Partial<MobileUsbStatus> = {}): MobileUsbStatus => ({
  transport_family: 'usb_mobile',
  available_transports: ['usb_mobile'],
  selected_transport: null,
  session_state: 'idle_usb_mobile',
  fallback_allowed: false,
  active_host: null,
  paired_hosts: [],
  pairing_approval: null,
  in_flight: null,
  error_code: null,
  ...override,
})

const pairedHost = (override: Partial<MobileUsbHostView> = {}): MobileUsbHostView => ({
  host_id: 'host-1',
  label: 'Pixel Host',
  platform: 'android',
  bridge_kind: 'android_aoa',
  pairing_state: 'paired',
  last_seen: null,
  ...override,
})

const scannedHost = (override: Partial<MobileUsbScannedHost> = {}): MobileUsbScannedHost => ({
  scan: {
    platform: 'android',
    bridge_kind: 'android_aoa',
    usb_hint: {
      manufacturer: 'Google',
      model: 'Pixel',
      serial_number: 'usb-1',
      protocol_id: null,
    },
    label: 'Pixel',
  },
  classification: 'unpaired',
  ...override,
})

const detectedDevice = (override: Partial<MobileUsbDetectedDevice> = {}): MobileUsbDetectedDevice => ({
  scan: scannedHost().scan,
  accessory_mode: false,
  paired_match: null,
  ...override,
})

const networkPeer = (override: Partial<NetworkPairedPeer> = {}): NetworkPairedPeer => ({
  peer_id: 'android-peer',
  label: 'ChromVoid Android',
  relay_url: 'wss://relay.chromvoid.com',
  last_seen: 0,
  paired_at: 0,
  platform: 'android',
  status: 'ready',
  presence_expires_at_ms: Date.now() + 60_000,
  ...override,
})

describe('Remote USB flow model', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    tauriListeners.clear()
    resetRuntimeCapabilities()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    resetRuntimeCapabilities()
    clearAppContext()
    document.body.replaceChildren()
  })

  it('keeps USB hidden and blocks actions when capability is disabled', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: false})
    const model = new RemoteHostsFlowModel()
    const usb = new RemoteUsbFlowModel()

    model.openUsbMobile()
    await usb.scan()
    await usb.refreshStatus()
    await usb.pairScannedHost(scannedHost())
    await usb.connectPairedHost('host-1')
    await usb.disconnect()
    await usb.loadPaired()
    await usb.removePaired('host-1')

    expect(model.view()).toBe('hosts')
    expect(usb.flowState()).toBe('unsupported')
    expect(usb.activeErrorCode()).toBe('ERR_USB_MOBILE_UNSUPPORTED_PLATFORM')
    expect(usb.errorText()).toContain('Mobile USB remote is not available')
    expect(usb.errorText()).toContain('ERR_USB_MOBILE_UNSUPPORTED_PLATFORM')
    expect(tauriInvoke).not.toHaveBeenCalled()
  })

  it('opens the gated USB panel when capability is enabled', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'mobile_usb_detect') return []
      if (command === 'mobile_usb_status') return baseStatus()
      throw new Error(`Unexpected command: ${command}`)
    })
    const model = new RemoteHostsFlowModel()

    model.openUsbMobile()
    await vi.waitFor(() => expect(tauriInvoke).toHaveBeenCalledTimes(2))

    expect(model.view()).toBe('usb-mobile')
  })

  it('uses mobile_usb IPC command names', async () => {
    tauriInvoke.mockResolvedValue({})

    await mobileUsbScan()
    await mobileUsbPair({
      platform: 'android',
      bridge_kind: 'android_aoa',
      usb_hint: {},
      label: 'Pixel',
    })
    await mobileUsbConfirmPairing({attempt_id: 'attempt-1', approval_pin: '123456'})
    await mobileUsbStatus()
    await mobileUsbConnect('host-1')
    await mobileUsbDisconnect()
    await mobileUsbListPaired()
    await mobileUsbRemovePaired('host-1')

    expect(tauriInvoke).toHaveBeenNthCalledWith(1, 'mobile_usb_scan')
    expect(tauriInvoke).toHaveBeenNthCalledWith(2, 'mobile_usb_pair', {
      request: {
        platform: 'android',
        bridge_kind: 'android_aoa',
        usb_hint: {},
        label: 'Pixel',
      },
    })
    expect(tauriInvoke).toHaveBeenNthCalledWith(3, 'mobile_usb_confirm_pairing', {
      request: {attempt_id: 'attempt-1', approval_pin: '123456'},
    })
    expect(tauriInvoke).toHaveBeenNthCalledWith(4, 'mobile_usb_status')
    expect(tauriInvoke).toHaveBeenNthCalledWith(5, 'mobile_usb_connect', {hostId: 'host-1'})
    expect(tauriInvoke).toHaveBeenNthCalledWith(6, 'mobile_usb_disconnect')
    expect(tauriInvoke).toHaveBeenNthCalledWith(7, 'mobile_usb_list_paired')
    expect(tauriInvoke).toHaveBeenNthCalledWith(8, 'mobile_usb_remove_paired', {hostId: 'host-1'})
  })

  it('maps backend status into frontend USB flow states without fallback', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    tauriInvoke.mockResolvedValue(
      baseStatus({selected_transport: 'usb_mobile', session_state: 'transport_ready_host_locked'}),
    )
    const usb = new RemoteUsbFlowModel()

    await usb.refreshStatus()

    expect(usb.selectedTransport()).toBe('usb_mobile')
    expect(usb.availableTransports()).toEqual(['usb_mobile'])
    expect(usb.fallbackAllowed()).toBe(false)
    expect(usb.flowState()).toBe('waiting_host_unlock')

    usb.status.set(baseStatus({session_state: 'scanning_usb_mobile'}))
    expect(usb.flowState()).toBe('scanning')

    usb.status.set(baseStatus({session_state: 'pairing_usb_mobile'}))
    expect(usb.flowState()).toBe('pairing')

    usb.status.set(
      baseStatus({
        session_state: 'pairing_approval_required',
        pairing_approval: {
          attempt_id: 'attempt-1',
          peer_label: 'Pixel',
          peer_fingerprint: 'abcdef12',
          attempts_left: 5,
          locked_until_ms: null,
          expires_at_ms: Date.now() + 300_000,
        },
      }),
    )
    expect(usb.flowState()).toBe('pairing_approval')

    usb.status.set(baseStatus({session_state: 'connecting_usb_mobile'}))
    expect(usb.flowState()).toBe('connecting')

    usb.status.set(baseStatus({session_state: 'session_approval_required'}))
    expect(usb.flowState()).toBe('session_approval')

    usb.status.set(baseStatus({session_state: 'remote_dashboard_open'}))
    expect(usb.flowState()).toBe('ready')

    usb.status.set(baseStatus({session_state: 'disconnected'}))
    expect(usb.flowState()).toBe('disconnected')
  })

  it('applies backend mobile_usb_status_changed events without manual refresh', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    tauriInvoke.mockResolvedValue({
      mode: 'local',
      connection_state: 'disconnected',
      transport_type: null,
      remote_core_features: [],
    })
    const model = new RemoteHostsFlowModel()

    model.connect()
    await Promise.resolve()
    tauriListeners.get('mobile_usb_status_changed')?.(
      baseStatus({
        selected_transport: 'usb_mobile',
        session_state: 'remote_dashboard_open',
        active_host: pairedHost(),
        paired_hosts: [pairedHost()],
      }),
    )
    await Promise.resolve()

    expect(model.usb.flowState()).toBe('ready')
    expect(model.usb.selectedTransport()).toBe('usb_mobile')
    expect(model.usb.pairedHosts()).toEqual([pairedHost()])
    expect(tauriInvoke.mock.calls.map(([command]) => command)).toContain('mode_status')
    expect(tauriInvoke).not.toHaveBeenCalledWith('mobile_usb_detect')

    model.disconnect()
    await Promise.resolve()
    expect(tauriListeners.has('mobile_usb_status_changed')).toBe(false)
  })

  it('routes a writer-locked USB dashboard back to focused recovery', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    tauriInvoke.mockResolvedValue({
      mode: 'local',
      connection_state: 'disconnected',
      transport_type: null,
      remote_core_features: [],
    })
    const onUsbRecoveryRequired = vi.fn()
    const model = new RemoteHostsFlowModel()
    model.view.set('wait')
    model.connect({onUsbRecoveryRequired})
    await Promise.resolve()

    tauriListeners.get('mobile_usb_status_changed')?.(
      baseStatus({
        session_state: 'remote_dashboard_open',
        active_host: pairedHost(),
        error_code: 'ERR_USB_MOBILE_WRITER_LOCKED',
      }),
    )
    await Promise.resolve()

    expect(model.view()).toBe('usb-mobile')
    expect(onUsbRecoveryRequired).toHaveBeenCalledTimes(1)
    expect(model.usb.desktopPresentation().recoveryCta?.action).toEqual({kind: 'continue_read_only'})
    model.disconnect()
  })

  it('shows connecting immediately while mobile_usb_connect is in flight', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    let resolveConnect: (status: MobileUsbStatus) => void = () => {}

    tauriInvoke.mockReturnValue(
      new Promise<MobileUsbStatus>((resolve) => {
        resolveConnect = resolve
      }),
    )

    const connectPromise = usb.connectPairedHost('host-1')

    expect(usb.pendingAction()).toBe('connect')
    expect(usb.busy()).toBe(true)
    expect(usb.flowState()).toBe('connecting')

    resolveConnect(
      baseStatus({
        selected_transport: 'usb_mobile',
        session_state: 'transport_ready_host_locked',
        paired_hosts: [pairedHost()],
      }),
    )
    await connectPromise

    expect(usb.pendingAction()).toBeNull()
    expect(usb.busy()).toBe(false)
    expect(usb.flowState()).toBe('waiting_host_unlock')
  })

  it('marks the remote session as waiting for phone approval from USB status', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const remoteSessionState = atom<'inactive' | 'waiting_host_unlock' | 'waiting_phone_approval' | 'ready'>(
      'inactive',
    )
    const remoteSessionPeerId = atom<string | null>(null)
    const setRemoteSessionPhoneApproval = vi.fn((peerId: string | null) => {
      remoteSessionPeerId.set(peerId)
      remoteSessionState.set('waiting_phone_approval')
    })
    const resetRemoteSession = vi.fn(() => {
      remoteSessionPeerId.set(null)
      remoteSessionState.set('inactive')
    })

    initAppContext(
      createMockAppContext({
        store: {
          remoteSessionState,
          remoteSessionPeerId,
          resetRemoteSession,
          setRemoteSessionPhoneApproval,
        } as never,
      }),
    )

    tauriInvoke.mockResolvedValue(
      baseStatus({
        selected_transport: 'usb_mobile',
        session_state: 'session_approval_required',
        active_host: pairedHost(),
        paired_hosts: [pairedHost()],
      }),
    )
    const usb = new RemoteUsbFlowModel()

    await usb.connectPairedHost('host-1')

    expect(usb.flowState()).toBe('session_approval')
    expect(setRemoteSessionPhoneApproval).toHaveBeenCalledWith('host-1')
    expect(remoteSessionState()).toBe('waiting_phone_approval')
    expect(remoteSessionPeerId()).toBe('host-1')

    usb.applyStatusEvent(baseStatus({session_state: 'disconnected'}))
    expect(resetRemoteSession).toHaveBeenCalledTimes(1)
    expect(remoteSessionState()).toBe('inactive')
    expect(remoteSessionPeerId()).toBeNull()
  })

  it('retains the last active USB host across cable loss until the session is explicitly cleared', () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    const host = pairedHost({label: 'OnePlus 13'})

    usb.applyStatusEvent(
      baseStatus({
        selected_transport: 'usb_mobile',
        session_state: 'transport_ready_host_locked',
        active_host: host,
        paired_hosts: [host],
      }),
    )
    usb.applyStatusEvent(baseStatus({session_state: 'disconnected'}))

    expect(usb.lastActiveHost()).toEqual(host)

    usb.clearLastActiveHost()
    expect(usb.lastActiveHost()).toBeNull()
  })

  it('uses USB host metadata and a platform-neutral fallback for connected labels', () => {
    const model = new RemoteHostsFlowModel()

    model.transportConnectedHost.set({
      type: 'mobile_usb',
      host_id: 'host-1',
      label: 'OnePlus 13',
      platform: 'android',
    })
    expect(model.connectedPeerLabel()).toBe('OnePlus 13')

    model.transportConnectedHost.set({type: 'tauri_remote_wss', peer_id: 'unknown-peer'})
    expect(model.connectedPeerLabel()).toBe('Remote host')
  })

  it('ignores overlapping programmatic USB actions while busy', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    let resolveScan: (hosts: MobileUsbScannedHost[]) => void = () => {}
    tauriInvoke.mockReturnValueOnce(
      new Promise<MobileUsbScannedHost[]>((resolve) => {
        resolveScan = resolve
      }),
    )

    const first = usb.scan()
    const second = await usb.connectPairedHost('host-1')

    expect(second).toBe(false)
    expect(tauriInvoke).toHaveBeenCalledTimes(1)
    resolveScan([])
    await first
  })

  it('keeps USB pairing approval submit enabled until pending and validates inline before IPC', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    usb.status.set(
      baseStatus({
        session_state: 'pairing_approval_required',
        pairing_approval: {
          attempt_id: 'attempt-1',
          peer_label: 'Pixel',
          peer_fingerprint: 'abcdef12',
          attempts_left: 5,
          locked_until_ms: null,
          expires_at_ms: Date.now() + 300_000,
        },
      }),
    )

    expect(usb.canConfirmPairing()).toBe(true)
    expect(usb.pairingApprovalPinError()).toBeNull()
    await expect(usb.confirmPairing()).resolves.toBe(false)
    expect(usb.pairingApprovalSubmitAttempted()).toBe(true)
    expect(usb.pairingApprovalPinError()).toBe('Enter the PIN shown on your phone')
    expect(usb.pairingApprovalPinFocusRequest()).toBe(1)
    expect(tauriInvoke).not.toHaveBeenCalled()

    usb.setPairingApprovalPin('123')
    await expect(usb.confirmPairing()).resolves.toBe(false)
    expect(usb.pairingApprovalPinError()).toBe('Enter the 6-digit PIN')
    expect(tauriInvoke).not.toHaveBeenCalled()
  })

  it('clears and requests focus for a rejected USB pairing approval attempt', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    usb.status.set(
      baseStatus({
        session_state: 'pairing_approval_required',
        pairing_approval: {
          attempt_id: 'attempt-1',
          peer_label: 'Pixel',
          peer_fingerprint: 'abcdef12',
          attempts_left: 5,
          locked_until_ms: null,
          expires_at_ms: Date.now() + 300_000,
        },
      }),
    )
    usb.setPairingApprovalPin('123456')
    tauriInvoke.mockRejectedValue(new Error('ERR_USB_MOBILE_PAIRING_APPROVAL_REJECTED: wrong PIN'))

    await expect(usb.confirmPairing()).resolves.toBe(false)

    expect(usb.pairingApprovalPin()).toBe('')
    expect(usb.pairingApprovalSubmitAttempted()).toBe(true)
    expect(usb.pairingApprovalPinError()).toBe('Enter the PIN shown on your phone')
    expect(usb.pairingApprovalPinFocusRequest()).toBe(1)
    expect(tauriInvoke).toHaveBeenCalledTimes(1)
  })

  it('blocks pair, connect, and remove while the backend reports a noncancelable operation', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    usb.status.set(baseStatus({in_flight: 'connect'}))

    await expect(usb.pairScannedHost(scannedHost())).resolves.toBe(false)
    await expect(usb.connectPairedHost('host-1')).resolves.toBe(false)
    await expect(usb.removePaired('host-1')).resolves.toBe(false)

    expect(usb.actionBusy()).toBe(true)
    expect(tauriInvoke).not.toHaveBeenCalled()

    tauriInvoke.mockResolvedValue(baseStatus())
    await expect(usb.refreshStatus()).resolves.toBe(true)
    expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_status')
  })

  it('keeps multiple passive USB devices explicit without auto-selecting a host', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    usb.activateDetectedInventory()
    tauriInvoke.mockResolvedValue([
      detectedDevice({scan: {...scannedHost().scan, label: 'Pixel 1'}}),
      detectedDevice({scan: {...scannedHost().scan, label: 'Pixel 2'}}),
    ])

    await expect(usb.refreshDetectedDevices()).resolves.toBe(true)

    expect(usb.desktopSummary()).toMatchObject({
      kind: 'multiple',
      devices: [{label: 'Pixel 1'}, {label: 'Pixel 2'}],
    })
    expect(tauriInvoke.mock.calls.map(([command]) => command)).toEqual(['mobile_usb_detect'])
  })

  it('opens a passive multiple-device summary with scan only and never auto-advances', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new RemoteHostsFlowModel()
    const devices = [
      detectedDevice({scan: {...scannedHost().scan, label: 'Pixel 1'}}),
      detectedDevice({scan: {...scannedHost().scan, label: 'Pixel 2'}}),
    ]
    model.usb.detectedDevices.set(devices)
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'mobile_usb_detect') return devices
      if (command === 'mobile_usb_status') return baseStatus()
      if (command === 'mobile_usb_scan') return [scannedHost()]
      throw new Error(`Unexpected command: ${command}`)
    })

    model.openUsbMobile({scan: true})

    await vi.waitFor(() => {
      expect(tauriInvoke.mock.calls.map(([command]) => command)).toContain('mobile_usb_scan')
    })
    expect(tauriInvoke.mock.calls.map(([command]) => command)).toEqual([
      'mobile_usb_detect',
      'mobile_usb_status',
      'mobile_usb_scan',
    ])
    expect(model.usb.flowState()).toBe('unpaired')
  })

  it('reconciles deferred passive detection before deciding whether scan may auto-advance', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const detected = deferred<MobileUsbDetectedDevice[]>()
    const status = deferred<MobileUsbStatus>()
    tauriInvoke.mockImplementation((command: string) => {
      if (command === 'mobile_usb_detect') return detected.promise
      if (command === 'mobile_usb_status') return status.promise
      if (command === 'mobile_usb_scan') return Promise.resolve([scannedHost()])
      if (command === 'mobile_usb_pair') return Promise.resolve(baseStatus())
      throw new Error(`Unexpected command: ${command}`)
    })
    const model = new RemoteHostsFlowModel()

    model.openUsbMobile({scan: true})
    detected.resolve([
      detectedDevice({scan: {...scannedHost().scan, label: 'Pixel 1'}}),
      detectedDevice({scan: {...scannedHost().scan, label: 'Pixel 2'}}),
    ])
    await Promise.resolve()
    status.resolve(baseStatus())

    await vi.waitFor(() => expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_scan'))
    expect(model.usb.desktopSummary().kind).toBe('multiple')
    expect(tauriInvoke).not.toHaveBeenCalledWith('mobile_usb_pair', expect.anything())
    expect(tauriInvoke).not.toHaveBeenCalledWith('mobile_usb_connect', expect.anything())
    expect(model.usb.flowState()).toBe('unpaired')
  })

  it('invalidates a deferred USB open when its owning model disconnects', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const detected = deferred<MobileUsbDetectedDevice[]>()
    const status = deferred<MobileUsbStatus>()
    tauriInvoke.mockImplementation((command: string) => {
      if (command === 'mobile_usb_detect') return detected.promise
      if (command === 'mobile_usb_status') return status.promise
      if (command === 'mobile_usb_scan') return Promise.resolve([scannedHost()])
      if (command === 'mobile_usb_pair') return Promise.resolve(baseStatus())
      throw new Error(`Unexpected command: ${command}`)
    })
    const model = new RemoteHostsFlowModel()

    model.openUsbMobile({scan: true})
    await vi.waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_detect')
      expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_status')
    })
    model.disconnect()
    detected.resolve([detectedDevice()])
    status.resolve(baseStatus())
    await Promise.resolve()
    await Promise.resolve()

    expect(tauriInvoke).not.toHaveBeenCalledWith('mobile_usb_scan')
    expect(tauriInvoke).not.toHaveBeenCalledWith('mobile_usb_pair', expect.anything())
    expect(tauriInvoke).not.toHaveBeenCalledWith('mobile_usb_connect', expect.anything())
  })

  it('never auto-advances while an earlier passive detection is still in flight', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const detected = deferred<MobileUsbDetectedDevice[]>()
    tauriInvoke.mockImplementation((command: string) => {
      if (command === 'mobile_usb_detect') return detected.promise
      if (command === 'mobile_usb_status') return Promise.resolve(baseStatus())
      if (command === 'mobile_usb_scan') return Promise.resolve([scannedHost()])
      if (command === 'mobile_usb_pair') return Promise.resolve(baseStatus())
      throw new Error(`Unexpected command: ${command}`)
    })
    const model = new RemoteHostsFlowModel()
    model.usb.activateDetectedInventory()
    const initialDetect = model.usb.refreshDetectedDevices()
    expect(model.usb.desktopSummary().kind).toBe('checking')

    model.openUsbMobile({scan: true})

    await vi.waitFor(() => expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_scan'))
    expect(tauriInvoke).not.toHaveBeenCalledWith('mobile_usb_pair', expect.anything())
    expect(tauriInvoke).not.toHaveBeenCalledWith('mobile_usb_connect', expect.anything())

    detected.resolve([
      detectedDevice({scan: {...scannedHost().scan, label: 'Pixel 1'}}),
      detectedDevice({scan: {...scannedHost().scan, label: 'Pixel 2'}}),
    ])
    await initialDetect

    expect(model.usb.desktopSummary().kind).toBe('multiple')
    expect(tauriInvoke).not.toHaveBeenCalledWith('mobile_usb_pair', expect.anything())
    expect(tauriInvoke).not.toHaveBeenCalledWith('mobile_usb_connect', expect.anything())
  })

  it('represents paired, unpaired, ambiguous, and broken recovery scan states', () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()

    usb.scanResults.set([scannedHost()])
    expect(usb.flowState()).toBe('unpaired')
    expect(usb.scannedHostViews()[0]?.canPair).toBe(true)

    usb.scanResults.set([scannedHost({classification: {paired: {host_id: 'host-1'}}})])
    expect(usb.flowState()).toBe('paired')
    expect(usb.scannedHostViews()[0]?.pairedHostId).toBe('host-1')

    usb.scanResults.set([scannedHost({classification: 'ambiguous'})])
    expect(usb.flowState()).toBe('recovery')
    expect(usb.scannedHostViews()[0]?.canListPaired).toBe(true)

    usb.scanResults.set([scannedHost({classification: {broken_local_state: {host_id: 'host-1'}}})])
    expect(usb.flowState()).toBe('recovery')
    expect(usb.recoveryAction()).toBe('remove_and_repair')
    expect(usb.scannedHostViews()[0]?.canRemoveBroken).toBe(true)
    expect(usb.desktopPresentation()).toMatchObject({
      primaryAction: {kind: 'remove', hostId: 'host-1'},
      recoveryCta: {action: {kind: 'remove', hostId: 'host-1'}},
      showPrimaryAction: true,
    })

    usb.scanResults.set([])
    usb.pairedHosts.set([pairedHost({pairing_state: 'broken_local_state'})])
    expect(usb.flowState()).toBe('recovery')
    expect(usb.recoveryAction()).toBe('remove_and_repair')
    expect(usb.pairedHostViews()[0]?.canRemove).toBe(true)
    expect(usb.desktopPresentation()).toMatchObject({
      primaryAction: {kind: 'remove', hostId: 'host-1'},
      showPrimaryAction: true,
    })
  })

  it('maps canonical backend error codes to recovery actions', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()

    usb.status.set(
      baseStatus({
        session_state: 'error',
        error_code: 'ERR_USB_MOBILE_STALE_PAIRING',
      }),
    )
    expect(usb.flowState()).toBe('recovery')
    expect(usb.recoveryAction()).toBe('remove_and_repair')

    usb.status.set(
      baseStatus({
        session_state: 'error',
        error_code: 'ERR_USB_MOBILE_PERMISSION_DENIED',
      }),
    )
    expect(usb.recoveryAction()).toBe('retry_permission')

    tauriInvoke.mockRejectedValue(new Error('ERR_USB_MOBILE_CABLE_DISCONNECTED: cable detached'))

    await usb.connectPairedHost('host-1')

    expect(usb.activeErrorCode()).toBe('ERR_USB_MOBILE_CABLE_DISCONNECTED')
    expect(usb.recoveryAction()).toBe('disconnect_before_retry')
    expect(usb.errorText()).toContain('USB session ended')
    expect(tauriInvoke.mock.calls.map(([command]) => command)).toEqual(['mobile_usb_connect'])
  })

  it('maps a unique USB recovery target to a model-owned command and dispatches it', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    usb.status.set(
      baseStatus({
        session_state: 'error',
        error_code: 'ERR_USB_MOBILE_PAIRING_DUPLICATE',
      }),
    )
    usb.scanResults.set([scannedHost({classification: {paired: {host_id: 'host-1'}}})])
    tauriInvoke.mockResolvedValue(
      baseStatus({
        selected_transport: 'usb_mobile',
        session_state: 'transport_ready_host_locked',
        active_host: pairedHost(),
        paired_hosts: [pairedHost()],
      }),
    )

    expect(usb.desktopPresentation().recoveryCommand).toEqual({kind: 'connect', hostId: 'host-1'})
    expect(usb.desktopPresentation()).toMatchObject({
      primaryAction: {kind: 'connect', hostId: 'host-1'},
      primaryActionEnabled: true,
      recoveryAction: 'connect_existing',
    })
    await expect(usb.dispatchDesktopAction()).resolves.toBe(true)
    expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_connect', {hostId: 'host-1'})
  })

  it('dispatches scan, pair, and stale-record recovery through typed model commands', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})

    const scanRecovery = new RemoteUsbFlowModel()
    scanRecovery.status.set(
      baseStatus({
        session_state: 'error',
        error_code: 'ERR_USB_MOBILE_PERMISSION_DENIED',
      }),
    )
    tauriInvoke.mockResolvedValueOnce([])
    expect(scanRecovery.desktopPresentation().recoveryCommand).toEqual({kind: 'scan'})
    await expect(scanRecovery.dispatchDesktopAction()).resolves.toBe(true)

    const pairRecovery = new RemoteUsbFlowModel()
    const unpaired = scannedHost()
    pairRecovery.status.set(baseStatus({session_state: 'error', error_code: 'ERR_USB_MOBILE_NOT_PAIRED'}))
    pairRecovery.scanResults.set([unpaired])
    tauriInvoke.mockResolvedValueOnce(baseStatus())
    expect(pairRecovery.desktopPresentation().recoveryCommand).toEqual({kind: 'pair', host: unpaired})
    await expect(pairRecovery.dispatchDesktopAction()).resolves.toBe(true)

    const removeRecovery = new RemoteUsbFlowModel()
    const broken = pairedHost({pairing_state: 'broken_local_state'})
    removeRecovery.status.set(
      baseStatus({session_state: 'error', error_code: 'ERR_USB_MOBILE_STALE_PAIRING'}),
    )
    removeRecovery.pairedHosts.set([broken])
    removeRecovery.activateDetectedInventory()
    tauriInvoke.mockResolvedValueOnce([])
    expect(removeRecovery.desktopPresentation().recoveryCommand).toEqual({kind: 'remove', hostId: 'host-1'})
    await expect(removeRecovery.dispatchDesktopAction()).resolves.toBe(true)

    expect(tauriInvoke.mock.calls.map(([command]) => command)).toEqual([
      'mobile_usb_scan',
      'mobile_usb_pair',
      'mobile_usb_remove_paired',
      'mobile_usb_detect',
    ])
  })

  it('maps manual retry to model-owned Scan again instead of replaying the failed action', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    usb.status.set(baseStatus({session_state: 'error', error_code: 'ERR_USB_MOBILE_BRIDGE_UNAVAILABLE'}))
    usb.scanResults.set([scannedHost({classification: {paired: {host_id: 'host-1'}}})])
    usb.lastFailedAction.set({kind: 'connect', hostId: 'host-1'})
    tauriInvoke.mockResolvedValueOnce([])

    expect(usb.desktopPresentation().recoveryCta).toEqual({
      action: {kind: 'scan'},
      label: 'Scan again',
    })
    expect(usb.desktopPresentation()).toMatchObject({
      primaryAction: {kind: 'scan'},
      showPrimaryAction: true,
    })

    await expect(usb.dispatchDesktopAction()).resolves.toBe(true)
    expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_scan')
  })

  it('turns confirmed remove-and-repair into a distinct Scan again step and clears stale status', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new RemoteHostsFlowModel()
    model.usb.activateDetectedInventory()
    const broken = pairedHost({pairing_state: 'broken_local_state'})
    model.usb.applyStatusEvent(
      baseStatus({
        session_state: 'error',
        error_code: 'ERR_USB_MOBILE_STALE_PAIRING',
        paired_hosts: [broken],
      }),
    )
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    tauriInvoke.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([scannedHost()])

    expect(model.usb.desktopPresentation().recoveryCta?.action).toEqual({kind: 'remove', hostId: 'host-1'})
    expect(model.usb.desktopPresentation().recoveryCta?.label).toBe('Forget phone')
    expect(model.usb.desktopPresentation().showPrimaryAction).toBe(true)
    await expect(model.dispatchDesktopUsbAction()).resolves.toBe(true)

    expect(dialogService.showConfirmDialog).toHaveBeenCalledOnce()
    expect(tauriInvoke.mock.calls.map(([command]) => command)).toEqual([
      'mobile_usb_remove_paired',
      'mobile_usb_detect',
    ])
    expect(model.usb.activeErrorCode()).toBeNull()
    expect(model.usb.status()).toMatchObject({session_state: 'idle_usb_mobile', error_code: null})
    expect(model.usb.desktopPresentation().recoveryCta).toEqual({
      action: {kind: 'scan'},
      label: 'Scan again',
    })
    expect(model.usb.desktopPresentation().showPrimaryAction).toBe(true)

    await expect(model.dispatchDesktopUsbAction()).resolves.toBe(true)
    expect(tauriInvoke.mock.calls.map(([command]) => command)).toEqual([
      'mobile_usb_remove_paired',
      'mobile_usb_detect',
      'mobile_usb_scan',
    ])
    expect(model.usb.desktopPresentation().recoveryAction).toBeNull()
    expect(model.usb.flowState()).toBe('unpaired')
  })

  it('deduplicates paired rows represented by paired and broken scan results', () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    usb.scanResults.set([
      scannedHost({classification: {paired: {host_id: 'host-1'}}}),
      scannedHost({classification: {broken_local_state: {host_id: 'host-2'}}}),
    ])
    usb.pairedHosts.set([
      pairedHost(),
      pairedHost({host_id: 'host-2', label: 'Broken Pixel', pairing_state: 'broken_local_state'}),
      pairedHost({host_id: 'host-3', label: 'Third Pixel'}),
    ])

    const presentation = usb.desktopPresentation()

    expect(presentation.scannedRows).toHaveLength(2)
    expect(presentation.pairedRows.map(({source}) => source.host_id)).toEqual(['host-3'])
  })

  it('normalizes USB technical last-seen seconds for exact date rendering', () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    const lastSeenSeconds = Math.floor(Date.now() / 1_000)
    usb.pairedHosts.set([pairedHost({last_seen: lastSeenSeconds})])

    expect(usb.desktopPresentation().detailRows[0]).toMatchObject({
      lastSeenMs: lastSeenSeconds * 1_000,
      canRemove: true,
    })
  })

  it('owns technical Remove availability in the USB presentation contract', () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    usb.status.set(baseStatus({active_host: pairedHost({host_id: 'active-only'})}))

    expect(usb.desktopPresentation().detailRows).toEqual([
      expect.objectContaining({hostId: 'active-only', canRemove: false}),
    ])

    usb.pairedHosts.set([pairedHost({host_id: 'active-only'})])

    expect(usb.desktopPresentation().detailRows).toEqual([
      expect.objectContaining({hostId: 'active-only', canRemove: true}),
    ])
  })

  it('suppresses a global CTA when an explicit row already owns the action', () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    usb.scanResults.set([scannedHost({classification: {paired: {host_id: 'host-1'}}})])

    const presentation = usb.desktopPresentation()

    expect(presentation.primaryAction).toEqual({kind: 'connect', hostId: 'host-1'})
    expect(presentation.showPrimaryAction).toBe(false)
  })

  it('does not dispatch USB recovery when more than one target is possible', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    usb.status.set(
      baseStatus({
        session_state: 'error',
        error_code: 'ERR_USB_MOBILE_PAIRING_DUPLICATE',
      }),
    )
    usb.scanResults.set([
      scannedHost({classification: {paired: {host_id: 'host-1'}}}),
      scannedHost({classification: {paired: {host_id: 'host-2'}}}),
    ])

    expect(usb.desktopPresentation().recoveryCommand).toBeNull()
    expect(usb.desktopPresentation().primaryAction).toBeNull()
    await expect(usb.dispatchDesktopAction()).resolves.toBe(false)
    expect(tauriInvoke).not.toHaveBeenCalled()
  })

  it('exposes and dispatches model-owned CTAs for non-command USB recovery states', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    initAppContext(createMockAppContext())
    const model = new RemoteHostsFlowModel()
    model.view.set('usb-mobile')

    model.usb.status.set(
      baseStatus({session_state: 'error', error_code: 'ERR_USB_MOBILE_UNSUPPORTED_PLATFORM'}),
    )
    expect(model.usb.desktopPresentation().recoveryCta).toEqual({
      action: {kind: 'back_to_hosts'},
      label: 'Back to phones',
    })
    await expect(model.dispatchDesktopUsbAction()).resolves.toBe(true)
    expect(model.view()).toBe('hosts')

    model.usb.status.set(baseStatus())
    model.usb.lastErrorCode.set('ERR_USB_MOBILE_INVALID_STATE')
    expect(model.usb.desktopPresentation().recoveryCta).toEqual({
      action: {kind: 'dismiss_error'},
      label: 'Close',
    })
    await expect(model.usb.dispatchDesktopAction()).resolves.toBe(true)
    expect(model.usb.activeErrorCode()).toBeNull()

    model.usb.status.set(
      baseStatus({
        session_state: 'transport_ready_host_locked',
        error_code: 'ERR_USB_MOBILE_UNLOCK_NOT_AUTHENTICATED',
      }),
    )
    tauriInvoke.mockResolvedValueOnce(
      baseStatus({session_state: 'transport_ready_host_locked', active_host: pairedHost()}),
    )
    expect(model.usb.desktopPresentation().recoveryCta).toEqual({
      action: {kind: 'refresh_status'},
      label: 'Refresh',
    })
    await expect(model.dispatchDesktopUsbAction()).resolves.toBe(true)
    expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_status')

    model.usb.status.set(
      baseStatus({
        session_state: 'remote_dashboard_open',
        active_host: pairedHost(),
        error_code: 'ERR_USB_MOBILE_WRITER_LOCKED',
      }),
    )
    expect(model.usb.desktopPresentation().recoveryCta).toEqual({
      action: {kind: 'continue_read_only'},
      label: 'Continue read-only until the writer lock clears',
    })
    await expect(model.dispatchDesktopUsbAction()).resolves.toBe(true)
    expect(model.usb.activeErrorCode()).toBeNull()

    model.usb.status.set(
      baseStatus({
        session_state: 'transport_ready_host_locked',
        error_code: 'ERR_USB_MOBILE_HOST_LOCKED',
      }),
    )
    expect(model.usb.desktopPresentation().recoveryCta).toBeNull()
  })

  it('does not publish writer-locked USB access as ready before explicit consent', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const setRemoteSessionReady = vi.fn()
    initAppContext(
      createMockAppContext({
        store: {setRemoteSessionReady} as never,
      }),
    )
    const usb = new RemoteUsbFlowModel()

    usb.applyStatusEvent(
      baseStatus({
        session_state: 'remote_dashboard_open',
        active_host: pairedHost(),
        error_code: 'ERR_USB_MOBILE_WRITER_LOCKED',
      }),
    )

    expect(setRemoteSessionReady).not.toHaveBeenCalled()
    expect(usb.desktopPresentation().recoveryCta?.action).toEqual({kind: 'continue_read_only'})

    await expect(usb.dispatchDesktopAction()).resolves.toBe(true)
    expect(setRemoteSessionReady).toHaveBeenCalledTimes(1)
    expect(setRemoteSessionReady).toHaveBeenCalledWith('host-1')
  })

  it('dismisses keep-current-flow errors into the underlying actionable state', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    usb.applyStatusEvent(baseStatus({session_state: 'error', error_code: 'ERR_USB_MOBILE_INVALID_STATE'}))

    expect(usb.flowState()).toBe('recovery')
    expect(usb.desktopPresentation().recoveryCta?.action).toEqual({kind: 'dismiss_error'})

    await expect(usb.dispatchDesktopAction()).resolves.toBe(true)

    expect(usb.activeErrorCode()).toBeNull()
    expect(usb.flowState()).toBe('idle')
    expect(usb.desktopPresentation().primaryAction).toEqual({kind: 'scan'})
  })

  it('does not target an unrelated saved host for ambiguous recovery', () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    usb.status.set(baseStatus({session_state: 'error', error_code: 'ERR_USB_MOBILE_PAIRING_DUPLICATE'}))
    usb.scanResults.set([scannedHost()])
    usb.pairedHosts.set([pairedHost({host_id: 'unrelated-host'})])

    expect(usb.desktopPresentation().recoveryCommand).toBeNull()
    expect(usb.desktopPresentation().showPrimaryAction).toBe(false)
    expect(usb.desktopPresentation().scannedRows[0]).toMatchObject({canPair: true})
    expect(usb.desktopPresentation().pairedRows[0]).toMatchObject({
      source: {host_id: 'unrelated-host'},
      canConnect: true,
    })
  })

  it('explains broken local pairing recovery without making the raw code primary', () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()

    usb.applyStatusEvent(
      baseStatus({
        session_state: 'error',
        error_code: 'ERR_USB_MOBILE_STALE_PAIRING',
      }),
    )

    expect(usb.errorText()).toContain('Remove the paired host, then pair again')
    tauriInvoke.mockRejectedValue(new Error('ERR_USB_MOBILE_STALE_PAIRING: stale pairing'))
    return usb.connectPairedHost('host-1').then(() => {
      expect(usb.errorText()).toContain('Remove the paired host, then pair again')
      expect(usb.errorText()).toContain('ERR_USB_MOBILE_STALE_PAIRING')
    })
  })

  it('model actions pair, connect, disconnect, list, and remove through mobile USB wrappers', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    const scan = scannedHost()

    tauriInvoke
      .mockResolvedValueOnce([scan])
      .mockResolvedValueOnce(baseStatus({paired_hosts: [pairedHost()]}))
      .mockResolvedValueOnce(baseStatus({selected_transport: 'usb_mobile', active_host: pairedHost()}))
      .mockResolvedValueOnce(baseStatus({session_state: 'disconnected'}))
      .mockResolvedValueOnce([pairedHost({host_id: 'host-2'})])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await usb.scan()
    await usb.pairScannedHost(usb.scannedHostViews()[0]!.source)
    await usb.connectPairedHost('host-1')
    await usb.disconnect()
    await usb.loadPaired()
    await usb.removePaired('host-2')

    expect(tauriInvoke.mock.calls.map(([command]) => command)).toEqual([
      'mobile_usb_scan',
      'mobile_usb_pair',
      'mobile_usb_connect',
      'mobile_usb_disconnect',
      'mobile_usb_list_paired',
      'mobile_usb_remove_paired',
    ])
    expect(usb.pairedHosts()).toEqual([])
  })

  it('confirms before removing a paired USB host through the hosts model', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new RemoteHostsFlowModel()
    const confirm = vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    model.usb.pairedHosts.set([pairedHost()])
    model.usb.detectedDevices.set([
      detectedDevice({
        paired_match: {host_id: 'host-1', label: 'Pixel Host', pairing_state: 'confirmed'},
      }),
    ])
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'mobile_usb_remove_paired') return []
      if (command === 'mobile_usb_detect') {
        return [detectedDevice({paired_match: null})]
      }
      throw new Error(`Unexpected command: ${command}`)
    })
    model.usb.activateDetectedInventory()

    const removed = await model.removeUsbPairedHost('host-1')

    expect(removed).toBe(true)
    expect(confirm).toHaveBeenCalledWith({
      title: 'Forget this phone?',
      message:
        'Forget Pixel Host on this computer? This only removes the local pairing record. The phone will keep trusting this computer until access is revoked there.',
      confirmText: 'Forget phone',
      confirmVariant: 'danger',
    })
    expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_remove_paired', {hostId: 'host-1'})
    expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_detect')
    expect(model.usb.detectedDevices()[0]?.paired_match).toBeNull()
    expect(model.statusText()).toBe('Phone forgotten.')
  })

  it('invalidates a late passive detect result after inventory deactivation', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const detected = deferred<MobileUsbDetectedDevice[]>()
    tauriInvoke.mockReturnValue(detected.promise)
    const model = new RemoteHostsFlowModel()

    model.activateDesktopInventory()
    expect(model.usb.desktopSummary().kind).toBe('checking')
    model.deactivateDesktopInventory()
    detected.resolve([detectedDevice()])
    await Promise.resolve()
    await Promise.resolve()

    expect(model.usb.detectedDevices()).toEqual([])
    expect(model.usb.desktopSummary().kind).toBe('none')
  })

  it('does not remove a paired USB host when confirmation is rejected', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new RemoteHostsFlowModel()
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(false)
    model.usb.pairedHosts.set([pairedHost()])

    const removed = await model.removeUsbPairedHost('host-1')

    expect(removed).toBe(false)
    expect(tauriInvoke).not.toHaveBeenCalledWith('mobile_usb_remove_paired', expect.anything())
  })

  it.each([
    ['single', ['scan-broken-1'], 'Broken Pixel 1'],
    ['multiple', ['scan-broken-1', 'scan-broken-2'], 'Broken Pixel 2'],
  ] as const)('removes a %s scan-only broken pairing row', async (_case, hostIds, selectedLabel) => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new RemoteHostsFlowModel()
    model.usb.scanResults.set(
      hostIds.map((hostId, index) =>
        scannedHost({
          scan: {...scannedHost().scan, label: `Broken Pixel ${index + 1}`},
          classification: {broken_local_state: {host_id: hostId}},
        }),
      ),
    )
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    tauriInvoke.mockResolvedValue([])
    const selectedHostId = hostIds.at(-1)!

    await expect(model.removeUsbPairedHost(selectedHostId)).resolves.toBe(true)

    expect(dialogService.showConfirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({message: expect.stringContaining(selectedLabel)}),
    )
    expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_remove_paired', {
      hostId: selectedHostId,
    })
  })

  it('cancels pending USB pairing approval before leaving the USB panel', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new RemoteHostsFlowModel()
    model.view.set('usb-mobile')
    model.usb.status.set(
      baseStatus({
        session_state: 'pairing_approval_required',
        pairing_approval: {
          attempt_id: 'attempt-1',
          peer_label: 'Pixel',
          peer_fingerprint: 'abcdef12',
          attempts_left: 5,
          locked_until_ms: null,
          expires_at_ms: Date.now() + 300_000,
        },
      }),
    )
    tauriInvoke.mockResolvedValue(baseStatus({session_state: 'disconnected'}))

    await model.closeUsbMobile()

    expect(model.view()).toBe('hosts')
    expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_disconnect')
  })

  it('confirms PIN-bound pairing approval through a separate IPC command', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const usb = new RemoteUsbFlowModel()
    usb.status.set(
      baseStatus({
        session_state: 'pairing_approval_required',
        pairing_approval: {
          attempt_id: 'attempt-1',
          peer_label: 'Pixel',
          peer_fingerprint: 'abcdef12',
          attempts_left: 5,
          locked_until_ms: null,
          expires_at_ms: Date.now() + 300_000,
        },
      }),
    )
    usb.setPairingApprovalPin('12-34 56')
    tauriInvoke.mockResolvedValue(
      baseStatus({
        selected_transport: 'usb_mobile',
        session_state: 'transport_ready_host_locked',
        paired_hosts: [pairedHost()],
      }),
    )

    await usb.confirmPairing()

    expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_confirm_pairing', {
      request: {attempt_id: 'attempt-1', approval_pin: '123456'},
    })
    expect(usb.pairingApprovalPin()).toBe('')
    expect(usb.flowState()).toBe('waiting_host_unlock')
  })

  it('renders real-device USB states and actions through DOM contracts', () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new RemoteHostsFlowModel()
    const pair = vi.fn()
    const connect = vi.fn()
    const remove = vi.fn()
    const loadPaired = vi.fn()
    const scan = scannedHost()

    model.view.set('usb-mobile')
    model.usb.busy.set(true)
    model.usb.status.set(
      baseStatus({
        selected_transport: 'usb_mobile',
        session_state: 'transport_ready_host_locked',
        active_host: pairedHost(),
        error_code: 'ERR_USB_MOBILE_STALE_PAIRING',
      }),
    )
    model.usb.scanResults.set([
      scan,
      scannedHost({classification: {paired: {host_id: 'host-1'}}}),
      scannedHost({classification: {broken_local_state: {host_id: 'host-2'}}}),
      scannedHost({classification: 'ambiguous'}),
    ])
    model.usb.pairedHosts.set([
      pairedHost(),
      pairedHost({host_id: 'host-2', pairing_state: 'broken_local_state'}),
    ])

    const container = document.createElement('div')
    document.body.append(container)
    render(
      html`${renderRemoteHostsFlowPanel({
        model,
        actions: {
          onUsbPairScannedHost: pair,
          onUsbConnectPairedHost: connect,
          onUsbRemovePairedHost: remove,
          onUsbLoadPaired: loadPaired,
        },
      })}`,
      container,
    )

    expect(container.querySelector('[data-usb-flow-state="waiting_host_unlock"]')).not.toBeNull()
    expect(container.querySelector('[data-usb-selected-transport="usb_mobile"]')).not.toBeNull()
    expect(container.querySelector('[data-usb-available-transport="usb_mobile"]')).not.toBeNull()
    expect(container.querySelector('[data-usb-fallback-allowed="false"]')).not.toBeNull()
    expect(container.querySelector('[data-usb-network-fallback="disabled"]')).not.toBeNull()
    expect(container.querySelector('[data-usb-recovery-action="remove_and_repair"]')).not.toBeNull()
    expect(container.textContent).toContain('Waiting for host unlock')
    expect(container.textContent).toContain('USB Mobile')
    expect(container.textContent).toContain('Android AOA')
    expect(container.textContent).toContain('No network fallback')
    expect(container.textContent).toContain('Unpaired')
    expect(container.textContent).toContain('Broken local state')
    expect(container.querySelector('cv-callout[role="status"]')?.textContent).toContain(
      'USB operation in progress',
    )

    const pairButton = container.querySelector('cv-button[aria-label="Pair Pixel"]') as HTMLElement | null
    expect(pairButton?.hasAttribute('disabled')).toBe(true)

    model.usb.busy.set(false)
    render(
      html`${renderRemoteHostsFlowPanel({
        model,
        actions: {
          onUsbPairScannedHost: pair,
          onUsbConnectPairedHost: connect,
          onUsbRemovePairedHost: remove,
          onUsbLoadPaired: loadPaired,
        },
      })}`,
      container,
    )
    ;(container.querySelector('cv-button[aria-label="Pair Pixel"]') as HTMLElement).click()
    ;(container.querySelector('cv-button[aria-label="Connect Pixel"]') as HTMLElement).click()
    ;(container.querySelector('cv-button[aria-label="Forget Pixel"]') as HTMLElement).click()
    ;(container.querySelector('cv-button[aria-label="List paired"]') as HTMLElement).click()

    expect(pair).toHaveBeenCalledWith(scan)
    expect(connect).toHaveBeenCalledWith('host-1')
    expect(remove).toHaveBeenCalledWith('host-2')
    expect(loadPaired).toHaveBeenCalledTimes(1)
  })

  it('renders USB connect pending state and loading affordance', () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new RemoteHostsFlowModel()

    model.view.set('usb-mobile')
    model.usb.busy.set(true)
    model.usb.pendingAction.set('connect')
    model.usb.status.set(
      baseStatus({
        selected_transport: 'usb_mobile',
        session_state: 'idle_usb_mobile',
        paired_hosts: [pairedHost()],
      }),
    )
    model.usb.pairedHosts.set([pairedHost()])

    const container = document.createElement('div')
    document.body.append(container)
    render(html`${renderRemoteHostsFlowPanel({model})}`, container)

    expect(container.querySelector('[data-usb-flow-state="connecting"]')).not.toBeNull()
    expect(container.querySelector('cv-callout[role="status"]')?.textContent).toContain('Connecting over USB')
    expect(
      (container.querySelector('cv-button[aria-label="Connect Pixel Host"]') as {loading?: boolean} | null)
        ?.loading,
    ).toBe(true)
  })

  it('renders network Android hosts as WSS relay transport instead of USB', () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new RemoteHostsFlowModel()
    model.peers.set([networkPeer()])

    const container = document.createElement('div')
    document.body.append(container)
    render(html`${renderRemoteHostsFlowPanel({model})}`, container)

    expect(container.querySelector('[data-peer-transport="wss_relay"]')).not.toBeNull()
    expect(container.querySelector('[data-usb-entry="desktop"]')).not.toBeNull()
    expect(container.querySelector('[data-usb-entry-transport="usb_mobile"]')).not.toBeNull()
    expect(container.querySelector('[data-usb-entry-bridge="android_aoa"]')).not.toBeNull()
    expect(container.querySelector('[data-usb-entry-fallback="disabled"]')).not.toBeNull()
    expect(container.querySelector('[data-usb-entry-action="open"]')).not.toBeNull()
    expect(container.textContent).toContain('WSS Relay')
    expect(container.textContent).toContain('Connect via USB')
    expect(container.textContent).toContain('USB Mobile')
    expect(container.textContent).toContain('Android AOA')
    expect(container.textContent).toContain('No network fallback')
  })

  it('separates empty network hosts from known USB-paired devices', () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new RemoteHostsFlowModel()
    model.usb.pairedHosts.set([pairedHost()])

    const container = document.createElement('div')
    document.body.append(container)
    render(html`${renderRemoteHostsFlowPanel({model})}`, container)

    expect(container.textContent).toContain('Network / Relay Hosts')
    expect(container.textContent).toContain('No network hosts paired')
    expect(container.textContent).toContain('This list only shows WSS/WebRTC remote hosts')
    expect(container.textContent).toContain('USB Android Device')
    expect(container.textContent).toContain('USB-paired devices: 1')
  })

  it('opens the desktop USB flow from the explicit USB entry action', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    tauriInvoke
      .mockResolvedValueOnce([]) // mobile_usb_detect (passive inventory)
      .mockResolvedValueOnce(baseStatus())
      .mockResolvedValueOnce([])
    const model = new RemoteHostsFlowModel()

    const container = document.createElement('div')
    document.body.append(container)
    render(html`${renderRemoteHostsFlowPanel({model})}`, container)

    const entryAction = container.querySelector('[data-usb-entry-action="open"]') as HTMLElement
    const innerButton = entryAction.shadowRoot?.querySelector('button') as HTMLElement | null

    ;(innerButton ?? entryAction).click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(model.view()).toBe('usb-mobile')
    expect(tauriInvoke.mock.calls.map(([command]) => command)).toEqual([
      'mobile_usb_detect',
      'mobile_usb_status',
      'mobile_usb_scan',
    ])
  })

  it('pairs a single unpaired Android AOA host from the USB entry action', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    tauriInvoke
      .mockResolvedValueOnce([]) // mobile_usb_detect (passive inventory)
      .mockResolvedValueOnce(baseStatus())
      .mockResolvedValueOnce([scannedHost()])
      .mockResolvedValueOnce(
        baseStatus({
          selected_transport: 'usb_mobile',
          session_state: 'transport_ready_host_locked',
          paired_hosts: [pairedHost()],
          active_host: pairedHost(),
        }),
      )
    const model = new RemoteHostsFlowModel()

    const container = document.createElement('div')
    document.body.append(container)
    render(html`${renderRemoteHostsFlowPanel({model})}`, container)

    const entryAction = container.querySelector('[data-usb-entry-action="open"]') as HTMLElement
    const innerButton = entryAction.shadowRoot?.querySelector('button') as HTMLElement | null

    ;(innerButton ?? entryAction).click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(model.view()).toBe('usb-mobile')
    expect(model.usb.flowState()).toBe('waiting_host_unlock')
    expect(tauriInvoke.mock.calls.map(([command]) => command)).toEqual([
      'mobile_usb_detect',
      'mobile_usb_status',
      'mobile_usb_scan',
      'mobile_usb_pair',
    ])
  })

  it('connects a single paired Android AOA host from the USB entry action', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    tauriInvoke
      .mockResolvedValueOnce([]) // mobile_usb_detect (passive inventory)
      .mockResolvedValueOnce(baseStatus())
      .mockResolvedValueOnce([scannedHost({classification: {paired: {host_id: 'host-1'}}})])
      .mockResolvedValueOnce(
        baseStatus({
          selected_transport: 'usb_mobile',
          session_state: 'transport_ready_host_locked',
          paired_hosts: [pairedHost()],
          active_host: pairedHost(),
        }),
      )
    const model = new RemoteHostsFlowModel()

    const container = document.createElement('div')
    document.body.append(container)
    render(html`${renderRemoteHostsFlowPanel({model})}`, container)

    const entryAction = container.querySelector('[data-usb-entry-action="open"]') as HTMLElement
    const innerButton = entryAction.shadowRoot?.querySelector('button') as HTMLElement | null

    ;(innerButton ?? entryAction).click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(model.view()).toBe('usb-mobile')
    expect(model.usb.flowState()).toBe('waiting_host_unlock')
    expect(tauriInvoke.mock.calls.map(([command]) => command)).toEqual([
      'mobile_usb_detect',
      'mobile_usb_status',
      'mobile_usb_scan',
      'mobile_usb_connect',
    ])
    expect(tauriInvoke).toHaveBeenLastCalledWith('mobile_usb_connect', {hostId: 'host-1'})
  })

  it('does not scan from the USB entry action when status refresh fails', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    tauriInvoke
      .mockResolvedValueOnce([]) // mobile_usb_detect (passive inventory)
      .mockRejectedValueOnce(new Error('ERR_USB_MOBILE_BRIDGE_UNAVAILABLE: bridge unavailable'))
    const model = new RemoteHostsFlowModel()

    const container = document.createElement('div')
    document.body.append(container)
    render(html`${renderRemoteHostsFlowPanel({model})}`, container)

    const entryAction = container.querySelector('[data-usb-entry-action="open"]') as HTMLElement
    const innerButton = entryAction.shadowRoot?.querySelector('button') as HTMLElement | null

    ;(innerButton ?? entryAction).click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(model.view()).toBe('usb-mobile')
    expect(model.usb.activeErrorCode()).toBe('ERR_USB_MOBILE_BRIDGE_UNAVAILABLE')
    expect(tauriInvoke.mock.calls.map(([command]) => command)).toEqual([
      'mobile_usb_detect',
      'mobile_usb_status',
    ])
  })

  it('renders Android mobile host USB/AOA readiness without desktop scan actions', () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_network_remote: true,
    })
    const model = new RemoteHostsFlowModel()

    const container = document.createElement('div')
    document.body.append(container)
    render(html`${renderRemoteHostsFlowPanel({model})}`, container)

    expect(model.mobileHostTransports()).toEqual(['wss_relay', 'usb_mobile'])
    expect(container.querySelector('[data-mobile-host-transports="wss_relay,usb_mobile"]')).not.toBeNull()
    expect(container.querySelector('[data-mobile-host-transport="wss_relay"]')).not.toBeNull()
    expect(container.querySelector('[data-mobile-host-usb="android_aoa"]')).not.toBeNull()
    expect(container.querySelector('[data-mobile-host-usb-state="waiting_accessory"]')).not.toBeNull()
    expect(container.querySelector('[data-mobile-host-usb-bridge="android_aoa"]')).not.toBeNull()
    expect(container.querySelector('[data-mobile-host-usb-fallback="disabled"]')).not.toBeNull()
    expect(container.textContent).toContain('Android Remote Host')
    expect(container.textContent).toContain('USB Mobile Host')
    expect(container.textContent).toContain('WSS Relay')
    expect(container.textContent).toContain('Android AOA')
    expect(container.textContent).toContain('No network fallback')
    expect(container.textContent).toContain('Waiting for USB accessory')
    expect(container.textContent).not.toContain('Scan USB')
  })
})
