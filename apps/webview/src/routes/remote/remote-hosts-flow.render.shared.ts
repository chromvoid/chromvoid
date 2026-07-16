import {html, nothing, type TemplateResult} from 'lit'

import {i18n} from 'root/i18n'

import type {MobileUsbScannedHost, NetworkPairedPeer} from './remote.model'
import type {RemoteFlowScreen, RemoteHostsFlowModel} from './remote-hosts-flow.model'

export interface RemoteHostsFlowBackLink {
  label: string
  onBack: () => void
}

export interface RemoteHostsFlowPanelUI {
  hostsBackLink?: RemoteHostsFlowBackLink
  pairBackLink?: RemoteHostsFlowBackLink
  waitBackLink?: RemoteHostsFlowBackLink
  waitReason?: 'host_unlock' | 'phone_approval'
  welcomeFrame?: boolean
}

export interface RemoteHostsFlowPanelActions {
  onRefreshPeers?: () => void
  onOpenPairIos?: () => void
  onOpenUsbMobile?: () => void
  onBackToHosts?: () => void
  onConnectPeer?: (peerId: string) => void
  onRemovePeer?: (peer: NetworkPairedPeer) => void
  onOfferInput?: (event: Event) => void
  onPinInput?: (event: Event) => void
  onDeviceLabelInput?: (event: Event) => void
  onSubmitPairing?: () => void
  onRefreshPresence?: () => void
  onDisconnectTransport?: () => void
  onUsbRefreshStatus?: () => void
  onUsbScan?: () => void
  onUsbLoadPaired?: () => void
  onUsbPairScannedHost?: (host: MobileUsbScannedHost) => void
  onUsbPairingPinInput?: (event: Event) => void
  onUsbConfirmPairing?: () => void
  onUsbConnectPairedHost?: (hostId: string) => void
  onUsbRemovePairedHost?: (hostId: string) => void
  onUsbDisconnect?: () => void
  onUsbDismissError?: () => void
}

export interface RemoteHostsFlowPanelOptions {
  model: RemoteHostsFlowModel
  actions?: RemoteHostsFlowPanelActions
  ui?: RemoteHostsFlowPanelUI
}

export type ResolvedRemoteHostsFlowPanelActions = Required<RemoteHostsFlowPanelActions>

export type RemoteHostsFlowRenderContext = {
  model: RemoteHostsFlowModel
  actions: ResolvedRemoteHostsFlowPanelActions
  ui: RemoteHostsFlowPanelUI
}

function resolveActions(
  model: RemoteHostsFlowModel,
  overrides: RemoteHostsFlowPanelActions = {},
): ResolvedRemoteHostsFlowPanelActions {
  return {
    onRefreshPeers: overrides.onRefreshPeers ?? (() => void model.loadPeers()),
    onOpenPairIos: overrides.onOpenPairIos ?? (() => model.openPairIos()),
    onOpenUsbMobile: overrides.onOpenUsbMobile ?? (() => model.openUsbMobile({scan: true})),
    onBackToHosts:
      overrides.onBackToHosts ??
      (() => {
        if (model.view() === 'usb-mobile') {
          void model.closeUsbMobile()
          return
        }
        void model.closePairIos()
      }),
    onConnectPeer: overrides.onConnectPeer ?? ((peerId) => void model.connectToPeer(peerId)),
    onRemovePeer: overrides.onRemovePeer ?? ((peer) => void model.removePeer(peer)),
    onOfferInput: overrides.onOfferInput ?? model.handleOfferInput,
    onPinInput: overrides.onPinInput ?? model.handlePinInput,
    onDeviceLabelInput: overrides.onDeviceLabelInput ?? model.handleDeviceLabelInput,
    onSubmitPairing: overrides.onSubmitPairing ?? (() => void model.submitPairing()),
    onRefreshPresence: overrides.onRefreshPresence ?? (() => void model.refreshPresence()),
    onDisconnectTransport: overrides.onDisconnectTransport ?? (() => void model.disconnectTransport()),
    onUsbRefreshStatus: overrides.onUsbRefreshStatus ?? (() => void model.usb.refreshStatus()),
    onUsbScan: overrides.onUsbScan ?? (() => void model.usb.scan()),
    onUsbLoadPaired: overrides.onUsbLoadPaired ?? (() => void model.usb.loadPaired()),
    onUsbPairScannedHost: overrides.onUsbPairScannedHost ?? ((host) => void model.usb.pairScannedHost(host)),
    onUsbPairingPinInput:
      overrides.onUsbPairingPinInput ??
      ((event) => {
        const target = event.target as {value?: string} | null
        model.usb.setPairingApprovalPin(target?.value ?? '')
      }),
    onUsbConfirmPairing: overrides.onUsbConfirmPairing ?? (() => void model.usb.confirmPairing()),
    onUsbConnectPairedHost:
      overrides.onUsbConnectPairedHost ?? ((hostId) => void model.usb.connectPairedHost(hostId)),
    onUsbRemovePairedHost:
      overrides.onUsbRemovePairedHost ?? ((hostId) => void model.removeUsbPairedHost(hostId)),
    onUsbDisconnect: overrides.onUsbDisconnect ?? (() => void model.usb.disconnect()),
    onUsbDismissError: overrides.onUsbDismissError ?? (() => model.usb.dismissError()),
  }
}

export function createRenderContext(options: RemoteHostsFlowPanelOptions): RemoteHostsFlowRenderContext {
  return {
    model: options.model,
    actions: resolveActions(options.model, options.actions),
    ui: options.ui ?? {},
  }
}

export function renderBackLink(backLink?: RemoteHostsFlowBackLink): TemplateResult | typeof nothing {
  if (!backLink) {
    return nothing
  }

  return html`
    <div class="back-link" @click=${backLink.onBack}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      ${backLink.label}
    </div>
  `
}

function getRemoteFlowScreenLabel(screen: RemoteFlowScreen): string {
  if (screen === 'hosts') return i18n('welcome:remote-hosts-title')
  if (screen === 'pair') return i18n('remote:pair-mobile-host')
  if (screen === 'usb') return i18n('remote:usb-mobile-title')
  return i18n('welcome:wait-iphone-title')
}

function getRemoteFlowTransportLabel(ctx: RemoteHostsFlowRenderContext, screen: RemoteFlowScreen): string {
  if (ctx.model.transportConnected()) return i18n('remote:transport-wss-relay')
  if (screen === 'usb' || ctx.model.view() === 'usb-mobile') return i18n('remote:transport-usb-mobile')
  return i18n('remote:transport-none')
}

function getRemoteFlowVaultState(ctx: RemoteHostsFlowRenderContext, screen: RemoteFlowScreen): string {
  if (screen === 'wait' || ctx.model.transportConnected())
    return i18n('welcome:remote-flow-vault-host-unlock')
  return i18n('welcome:remote-flow-vault-local')
}

function getRemoteFlowMode(screen: RemoteFlowScreen): 'local' | 'switching' | 'remote' {
  if (screen === 'wait') return 'switching'
  return 'local'
}

function renderRemoteFlowStatusbar(
  ctx: RemoteHostsFlowRenderContext,
  screen: RemoteFlowScreen,
): TemplateResult {
  const transportConnected = ctx.model.transportConnected()
  const mode = getRemoteFlowMode(screen)

  return html`
    <div class="remote-flow-statusbar" data-transport=${transportConnected ? 'connected' : 'idle'}>
      <div class="remote-flow-status-segment remote-flow-status-segment--mode">
        <span class="remote-flow-status-label">${i18n('welcome:remote-flow-mode-label')}</span>
        <div class="remote-flow-mode-control" aria-label=${getRemoteFlowScreenLabel(screen)}>
          <span data-state=${mode === 'local' ? 'active' : 'idle'}>
            ${i18n('welcome:remote-flow-mode-local')}
          </span>
          <span data-state=${mode === 'switching' ? 'active' : 'idle'}>
            ${i18n('welcome:remote-flow-mode-switching')}
          </span>
          <span data-state=${mode === 'remote' ? 'active' : 'idle'}>
            ${i18n('welcome:remote-flow-mode-remote')}
          </span>
        </div>
      </div>
      <div class="remote-flow-status-segment">
        <span class="remote-flow-status-label">${i18n('welcome:remote-flow-peer-label')}</span>
        <strong class="remote-flow-status-value remote-flow-status-value--mono">
          ${transportConnected ? ctx.model.connectedPeerLabel() : '-'}
        </strong>
      </div>
      <div class="remote-flow-status-segment">
        <span class="remote-flow-status-label">${i18n('remote:transport')}</span>
        <strong class="remote-flow-status-value remote-flow-status-value--mono">
          ${getRemoteFlowTransportLabel(ctx, screen)}
        </strong>
      </div>
      <div class="remote-flow-status-segment remote-flow-status-segment--sync">
        <span class="remote-flow-status-label">${i18n('welcome:remote-flow-sync-label')}</span>
        <strong class="remote-flow-status-value remote-flow-status-value--with-dot">
          <span class="remote-status-dot" aria-hidden="true"></span>
          ${getRemoteFlowVaultState(ctx, screen)}
        </strong>
      </div>
      <div class="remote-flow-status-segment remote-flow-status-segment--write">
        <span class="remote-flow-status-label">${i18n('welcome:remote-flow-write-access-label')}</span>
        <strong class="remote-flow-status-value remote-flow-status-value--mono">
          ${i18n('welcome:remote-flow-read-write')}
        </strong>
      </div>
    </div>
  `
}

export function renderRemoteFlowFrame(
  ctx: RemoteHostsFlowRenderContext,
  screen: RemoteFlowScreen,
  content: TemplateResult,
): TemplateResult {
  return html`
    <section class="remote-flow-frame" data-flow-screen=${screen}>
      ${renderRemoteFlowStatusbar(ctx, screen)}
      <div class="remote-flow-surface">${content}</div>
    </section>
  `
}

export function getHostPlatformName(platform: string): string {
  if (platform === 'android') return i18n('remote:platform-android')
  if (platform === 'ios') return i18n('remote:platform-ios')
  return i18n('remote:platform-network')
}
