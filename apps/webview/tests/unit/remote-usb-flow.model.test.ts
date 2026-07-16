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

  it('keeps the welcome remote frame opt-in only', () => {
    const model = new RemoteHostsFlowModel()
    const container = document.createElement('div')

    render(html`${renderRemoteHostsFlowPanel({model})}`, container)
    expect(container.querySelector('.remote-flow-frame')).toBeNull()

    render(html`${renderRemoteHostsFlowPanel({model, ui: {welcomeFrame: true}})}`, container)
    expect(container.querySelector('.remote-flow-frame[data-flow-screen="hosts"]')).not.toBeNull()
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
    tauriInvoke.mockResolvedValue(baseStatus())
    const model = new RemoteHostsFlowModel()

    model.openUsbMobile()
    await Promise.resolve()

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
    tauriInvoke
      .mockResolvedValueOnce([]) // initial passive detect
      .mockResolvedValueOnce({
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

    model.disconnect()
    await Promise.resolve()
    expect(tauriListeners.has('mobile_usb_status_changed')).toBe(false)
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
    const remoteSessionState = atom<
      'inactive' | 'waiting_host_unlock' | 'waiting_phone_approval' | 'ready'
    >('inactive')
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
    expect(usb.scannedHostViews()[0]?.canRemoveBroken).toBe(true)

    usb.scanResults.set([])
    usb.pairedHosts.set([pairedHost({pairing_state: 'broken_local_state'})])
    expect(usb.flowState()).toBe('recovery')
    expect(usb.pairedHostViews()[0]?.canRemove).toBe(true)
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
    tauriInvoke.mockResolvedValue([])

    const removed = await model.removeUsbPairedHost('host-1')

    expect(removed).toBe(true)
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmVariant: 'danger',
      }),
    )
    expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_remove_paired', {hostId: 'host-1'})
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
    ;(container.querySelector('cv-button[aria-label="Remove Pixel"]') as HTMLElement).click()
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
