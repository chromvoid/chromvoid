import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {html, render} from 'lit'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {RemoteHostsFlowModel} from '../../src/routes/remote/remote-hosts-flow.model'
import {renderRemoteHostsFlowPanel} from '../../src/routes/remote/remote-hosts-flow.render'
import {RemoteUsbFlowModel} from '../../src/routes/remote/remote-usb-flow.model'
import {
  type MobileUsbHostView,
  type MobileUsbScannedHost,
  type MobileUsbStatus,
  type NetworkPairedPeer,
  mobileUsbConnect,
  mobileUsbDisconnect,
  mobileUsbListPaired,
  mobileUsbPair,
  mobileUsbRemovePaired,
  mobileUsbScan,
  mobileUsbStatus,
} from '../../src/routes/remote/remote.model'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
    tauriListen: async () => () => {},
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
    resetRuntimeCapabilities()
  })

  afterEach(() => {
    resetRuntimeCapabilities()
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
    expect(usb.errorText()).toBe('Mobile USB remote is not available')
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
    expect(tauriInvoke).toHaveBeenNthCalledWith(3, 'mobile_usb_status')
    expect(tauriInvoke).toHaveBeenNthCalledWith(4, 'mobile_usb_connect', {hostId: 'host-1'})
    expect(tauriInvoke).toHaveBeenNthCalledWith(5, 'mobile_usb_disconnect')
    expect(tauriInvoke).toHaveBeenNthCalledWith(6, 'mobile_usb_list_paired')
    expect(tauriInvoke).toHaveBeenNthCalledWith(7, 'mobile_usb_remove_paired', {hostId: 'host-1'})
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

    usb.status.set(baseStatus({session_state: 'connecting_usb_mobile'}))
    expect(usb.flowState()).toBe('connecting')

    usb.status.set(baseStatus({session_state: 'remote_dashboard_open'}))
    expect(usb.flowState()).toBe('ready')

    usb.status.set(baseStatus({session_state: 'disconnected'}))
    expect(usb.flowState()).toBe('disconnected')
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
    expect(tauriInvoke.mock.calls.map(([command]) => command)).toEqual(['mobile_usb_connect'])
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
    expect(container.querySelector('cv-callout[role="status"]')?.textContent).toContain(
      'Connecting over USB',
    )
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

  it('opens the desktop USB flow from the explicit USB entry action', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    tauriInvoke.mockResolvedValueOnce(baseStatus()).mockResolvedValueOnce([])
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
      'mobile_usb_status',
      'mobile_usb_scan',
    ])
  })

  it('pairs a single unpaired Android AOA host from the USB entry action', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    tauriInvoke
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
      'mobile_usb_status',
      'mobile_usb_scan',
      'mobile_usb_pair',
    ])
  })

  it('connects a single paired Android AOA host from the USB entry action', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    tauriInvoke
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
      'mobile_usb_status',
      'mobile_usb_scan',
      'mobile_usb_connect',
    ])
    expect(tauriInvoke).toHaveBeenLastCalledWith('mobile_usb_connect', {hostId: 'host-1'})
  })

  it('does not scan from the USB entry action when status refresh fails', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    tauriInvoke.mockRejectedValueOnce(new Error('ERR_USB_MOBILE_BRIDGE_UNAVAILABLE: bridge unavailable'))
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
    expect(tauriInvoke.mock.calls.map(([command]) => command)).toEqual(['mobile_usb_status'])
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
