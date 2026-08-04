import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {render} from 'lit'

import type {Store} from '../../src/app/state/store'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {RemoteHostsFlowModel, type MobileHostStatus} from '../../src/routes/remote/remote-hosts-flow.model'
import {
  renderMobileRemoteHostPage,
  type MobileRemoteHostPageRenderContext,
} from '../../src/routes/remote/remote-mobile-host-page.render'
import {RemotePage} from '../../src/routes/remote/remote-page'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
  tauriListen: vi.fn().mockResolvedValue(() => {}),
}))

function createStatus(overrides: Partial<MobileHostStatus> = {}): MobileHostStatus {
  return {
    phase: 'Idle',
    platform: 'ios',
    relay_url: null,
    device_id: 'mobile-1',
    device_label: 'ChromVoid iPhone',
    pairing_pin: null,
    pairing_offer: null,
    expires_at_ms: null,
    presence: null,
    paired_peer_id: null,
    connected_peers: [],
    error: null,
    ...overrides,
  }
}

function createContext(
  model: RemoteHostsFlowModel,
  overrides: Partial<MobileRemoteHostPageRenderContext> = {},
): MobileRemoteHostPageRenderContext {
  return {
    model,
    canShareOffer: false,
    onStart: vi.fn(),
    onRetry: vi.fn(),
    onStop: vi.fn(),
    onCopyOffer: vi.fn(),
    onShareOffer: vi.fn(),
    onDeviceLabelInput: vi.fn(),
    onRefreshPairedComputers: vi.fn(),
    onRevokePairedComputer: vi.fn(),
    ...overrides,
  }
}

function renderPage(ctx: MobileRemoteHostPageRenderContext): HTMLDivElement {
  const container = document.createElement('div')
  document.body.append(container)
  render(renderMobileRemoteHostPage(ctx), container)
  return container
}

describe('mobile Remote host page', () => {
  beforeEach(() => {
    resetRuntimeCapabilities()
    tauriInvoke.mockReset()
    initAppContext(
      createMockAppContext({
        store: {
          remoteSessionState: () => 'idle',
        } as unknown as Store,
      }),
    )
  })

  afterEach(() => {
    document.body.replaceChildren()
    clearAppContext()
    resetRuntimeCapabilities()
    vi.clearAllMocks()
  })

  it('renders the mobile-host hierarchy on iOS without desktop-only or USB content', () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      desktop: false,
      supports_network_remote: true,
    })
    const model = new RemoteHostsFlowModel()
    const container = renderPage(createContext(model))

    expect(container.querySelector('[data-mobile-host-page]')?.getAttribute('data-mobile-host-state')).toBe(
      'off',
    )
    expect(container.querySelector('[data-mobile-host-platform="ios"]')).not.toBeNull()
    expect(container.querySelector('[data-mobile-host-path="network"]')).not.toBeNull()
    expect(container.querySelector('[data-mobile-host-path="usb"]')).toBeNull()
    expect(container.querySelector('[data-mobile-host-action="start"]')).not.toBeNull()
    expect(container.querySelector('cv-disclosure[open]')).toBeNull()
    expect(container.querySelector('cv-input')).not.toBeNull()
    expect(container.textContent).toContain('Use this phone from your computer')
    expect(container.textContent).not.toContain('Operating Mode')
    expect(container.textContent).not.toContain('Writer Lock')
    expect(container.textContent).not.toContain('Sync Status')
  })

  it('renders Android pairing with a visible link, PIN, and Copy/Share actions', () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      desktop: false,
      supports_network_remote: true,
    })
    const model = new RemoteHostsFlowModel()
    model.hostStatus.set(
      createStatus({
        phase: 'Pairing',
        platform: 'android',
        device_label: 'ChromVoid Android',
        pairing_pin: '654321',
        pairing_offer: {
          session_id: 'secret-session',
          relay_base_url: 'https://relay.chromvoid.com',
          device_label: 'ChromVoid Android',
          expires_at_ms: Date.now() + 60_000,
          platform: 'android',
        },
      }),
    )
    model.pairPhase.set('waiting')
    const onCopyOffer = vi.fn()
    const onShareOffer = vi.fn()
    const onStop = vi.fn()
    const container = renderPage(
      createContext(model, {
        canShareOffer: true,
        onCopyOffer,
        onShareOffer,
        onStop,
      }),
    )

    expect(container.querySelector('[data-mobile-host-state="pairing"]')).not.toBeNull()
    expect(container.querySelector('[data-mobile-host-path="usb"]')?.getAttribute('data-path-state')).toBe(
      'ready',
    )
    expect(container.textContent).toContain('654321')
    expect(container.querySelector('[data-mobile-host-action="share"]')).not.toBeNull()
    expect(container.querySelector('[data-mobile-host-action="copy"]')).not.toBeNull()
    const pairingLink = container.querySelector('[data-mobile-host-pairing-link]') as
      | (HTMLElement & {value: string})
      | null
    expect(pairingLink?.value).toContain('chromvoid://pair-mobile')
    expect(pairingLink?.value).toContain('session_id=secret-session')
    expect(pairingLink?.getAttribute('readonly')).not.toBeNull()
    expect(container.textContent).toContain('Pairing link')
    expect(container.textContent).toContain('paste it into Remote on your desktop')
    ;(container.querySelector('[data-mobile-host-action="share"]') as HTMLElement).click()
    ;(container.querySelector('[data-mobile-host-action="copy"]') as HTMLElement).click()
    ;(container.querySelector('[data-mobile-host-action="stop"]') as HTMLElement).click()

    expect(onShareOffer).toHaveBeenCalledTimes(1)
    expect(onCopyOffer).toHaveBeenCalledTimes(1)
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('keeps USB available and connected while Android Network Remote is off', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      desktop: false,
      supports_network_remote: true,
    })
    const currentStatus = createStatus({
      phase: 'Idle',
      platform: 'android',
      device_label: 'ChromVoid Android',
      connected_peers: [
        {
          peer_id: 'peer-usb-id',
          label: 'Cable desktop',
          connected_at_ms: Date.now(),
          transport_type: 'usb_mobile',
        },
      ],
    })
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'mobile_host_status') return currentStatus
      if (command === 'mobile_host_list_paired_computers') {
        return [
          {
            peer_id: 'peer-usb-id',
            label: 'Cable desktop',
            platform: 'macos',
            pairing_transport: 'usb_mobile',
            paired_at_ms: Date.now() - 10_000,
            last_seen_ms: Date.now(),
          },
        ]
      }
      throw new Error(`Unexpected command: ${command}`)
    })
    const model = new RemoteHostsFlowModel()
    model.connect()
    await vi.waitFor(() => expect(model.pairedComputers.loaded()).toBe(true))
    const container = renderPage(createContext(model))

    expect(container.querySelector('[data-mobile-host-state="off"]')).not.toBeNull()
    expect(
      container.querySelector('[data-mobile-host-path="network"]')?.getAttribute('data-path-state'),
    ).toBe('after-start')
    expect(container.querySelector('[data-mobile-host-path="usb"]')?.getAttribute('data-path-state')).toBe(
      'connected',
    )
    expect(container.querySelector('[data-mobile-host-transport="usb_mobile"]')).not.toBeNull()
    expect(container.querySelector('[data-mobile-host-action="start"]')?.textContent).toContain(
      'Start Network Remote',
    )
    expect(container.querySelector('[data-mobile-host-action="stop"]')).toBeNull()
    expect(container.textContent).toContain('Network Remote is off')
    expect(container.textContent).toContain('USB is still available')
    expect(container.textContent).toContain('tap Allow')
    model.disconnect()
  })

  it('promotes Copy when the system share sheet is unavailable', () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_network_remote: true,
    })
    const model = new RemoteHostsFlowModel()
    model.hostStatus.set(
      createStatus({
        phase: 'Ready',
        pairing_offer: {
          session_id: 'session-1',
          relay_base_url: 'https://relay.chromvoid.com',
          device_label: 'ChromVoid iPhone',
          expires_at_ms: Date.now() + 60_000,
          platform: 'ios',
        },
      }),
    )
    model.pairPhase.set('success')
    const container = renderPage(createContext(model, {canShareOffer: false}))
    const copy = container.querySelector('[data-mobile-host-action="copy"]')
    const pairingLink = container.querySelector('[data-mobile-host-pairing-link]') as
      | (HTMLElement & {value: string})
      | null

    expect(container.querySelector('[data-mobile-host-action="share"]')).toBeNull()
    expect(copy?.getAttribute('variant')).toBe('primary')
    expect(pairingLink?.value).toContain('chromvoid://pair-mobile')
  })

  it('lists paired computers with visible revoke actions and keeps identifiers in closed details', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_network_remote: true,
    })
    const currentStatus = createStatus({
      phase: 'Ready',
      platform: 'android',
      connected_peers: [
        {
          peer_id: 'peer-network-id',
          label: 'Office desktop',
          connected_at_ms: Date.now(),
          transport_type: 'wss_relay',
        },
        {
          peer_id: 'peer-usb-id',
          label: '',
          connected_at_ms: Date.now(),
          transport_type: 'usb_mobile',
        },
      ],
    })
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'mobile_host_status') return currentStatus
      if (command === 'mobile_host_list_paired_computers') {
        return [
          {
            peer_id: 'peer-network-id',
            label: 'Office desktop',
            platform: 'macos',
            pairing_transport: 'network',
            paired_at_ms: Date.now() - 20_000,
            last_seen_ms: Date.now() - 10_000,
          },
          {
            peer_id: 'peer-usb-id',
            label: '',
            platform: 'macos',
            pairing_transport: 'usb_mobile',
            paired_at_ms: Date.now() - 20_000,
            last_seen_ms: Date.now() - 5_000,
          },
        ]
      }
      throw new Error(`Unexpected command: ${command}`)
    })
    const model = new RemoteHostsFlowModel()
    model.connect()
    await vi.waitFor(() => expect(model.pairedComputers.loaded()).toBe(true))
    model.pairedComputers.statusText.set('Access revoked for Previous desktop.')
    const onRevokePairedComputer = vi.fn()
    const container = renderPage(createContext(model, {onRevokePairedComputer}))
    const disclosure = container.querySelector('cv-disclosure')

    expect(container.querySelector('[data-mobile-host-state="connected"]')).not.toBeNull()
    expect(container.querySelectorAll('.mobile-host-peer')).toHaveLength(2)
    expect(container.querySelectorAll('[data-mobile-host-revoke-peer-id]')).toHaveLength(2)
    expect(container.textContent).toContain('Office desktop')
    expect(container.textContent).toContain('Connected computer')
    expect(container.textContent).toContain('Paired computers')
    expect(container.textContent).not.toContain('Connected desktops')
    expect(container.querySelector('#mobile-host-peers-title')?.getAttribute('tabindex')).toBe('-1')
    expect(container.querySelector('.mobile-host-inline-message[role="status"]')?.textContent).toContain(
      'Access revoked for Previous desktop.',
    )
    expect(disclosure?.hasAttribute('open')).toBe(false)
    expect(disclosure?.textContent).toContain('peer-network-id')
    expect(disclosure?.textContent).toContain('peer-usb-id')
    expect(container.querySelector('cv-input')).toBeNull()
    ;(container.querySelector('[data-mobile-host-revoke-peer-id="peer-network-id"]') as HTMLElement).click()
    expect(onRevokePairedComputer).toHaveBeenCalledOnce()
    model.disconnect()
  })

  it('selects the dedicated renderer only for an actual mobile host runtime', async () => {
    RemotePage.define()
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'mobile_host_status') return createStatus()
      if (command === 'mobile_host_list_paired_computers') return []
      if (command === 'mode_get' || command === 'mode_status') {
        return {
          mode: 'local',
          connection_state: 'disconnected',
          transport_type: null,
          remote_core_features: [],
        }
      }
      if (command === 'network_list_paired_peers') return []
      throw new Error(`unexpected command: ${command}`)
    })

    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      desktop: false,
      supports_network_remote: true,
    })
    const mobilePage = document.createElement('remote-page') as RemotePage
    document.body.append(mobilePage)
    await mobilePage.updateComplete
    expect(mobilePage.shadowRoot?.querySelector('[data-mobile-host-page]')).not.toBeNull()
    mobilePage.remove()

    setRuntimeCapabilities({
      platform: 'macos',
      mobile: false,
      desktop: true,
      supports_network_remote: true,
    })
    const narrowDesktopPage = document.createElement('remote-page') as RemotePage
    document.body.append(narrowDesktopPage)
    await narrowDesktopPage.updateComplete
    expect(narrowDesktopPage.shadowRoot?.querySelector('[data-mobile-host-page]')).toBeNull()
    expect(narrowDesktopPage.shadowRoot?.querySelector('.mode-card')).not.toBeNull()
  })
})
