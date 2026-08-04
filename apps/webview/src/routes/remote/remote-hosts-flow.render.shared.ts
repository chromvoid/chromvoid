import {html, nothing, type TemplateResult} from 'lit'

import {i18n} from 'root/i18n'

import type {MobileUsbScannedHost, NetworkPairedPeer} from './remote.model'
import type {RemoteHostsFlowModel} from './remote-hosts-flow.model'

export interface RemoteHostsFlowBackLink {
  label: string
  onBack: () => void
}

export interface RemoteHostsFlowPanelUI {
  hostsBackLink?: RemoteHostsFlowBackLink
  pairBackLink?: RemoteHostsFlowBackLink
  waitBackLink?: RemoteHostsFlowBackLink
  waitReason?: 'host_unlock' | 'phone_approval'
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
  onSubmitPairing?: (event?: Event) => void | Promise<void>
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
    onSubmitPairing: async (event) => {
      const form = event?.currentTarget as ParentNode | null
      event?.preventDefault()
      if (overrides.onSubmitPairing) {
        await overrides.onSubmitPairing(event)
      } else {
        await model.submitPairing()
      }

      if (!model.desktopPairing.submitAttempted()) return
      const firstInvalid = model.desktopPairing.firstInvalid()
      const selector = firstInvalid === 'offer' ? '#remote-pairing-offer' : '#remote-pairing-pin'
      if (firstInvalid) (form?.querySelector<HTMLElement>(selector) ?? null)?.focus()
    },
    onRefreshPresence: overrides.onRefreshPresence ?? (() => void model.refreshPresence()),
    onDisconnectTransport: overrides.onDisconnectTransport ?? (() => void model.disconnectTransport()),
    onUsbRefreshStatus: overrides.onUsbRefreshStatus ?? (() => void model.refreshUsbStatus()),
    onUsbScan: overrides.onUsbScan ?? (() => void model.scanUsbHosts()),
    onUsbLoadPaired: overrides.onUsbLoadPaired ?? (() => void model.loadUsbPairedHosts()),
    onUsbPairScannedHost: overrides.onUsbPairScannedHost ?? ((host) => void model.pairUsbScannedHost(host)),
    onUsbPairingPinInput:
      overrides.onUsbPairingPinInput ??
      ((event) => {
        const target = event.target as {value?: string} | null
        model.usb.setPairingApprovalPin(target?.value ?? '')
      }),
    onUsbConfirmPairing: overrides.onUsbConfirmPairing ?? (() => void model.confirmUsbPairing()),
    onUsbConnectPairedHost:
      overrides.onUsbConnectPairedHost ?? ((hostId) => void model.connectUsbPairedHost(hostId)),
    onUsbRemovePairedHost:
      overrides.onUsbRemovePairedHost ?? ((hostId) => void model.removeUsbPairedHost(hostId)),
    onUsbDisconnect: overrides.onUsbDisconnect ?? (() => void model.disconnectUsb()),
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

export function getHostPlatformName(platform: string): string {
  if (platform === 'android') return i18n('remote:platform-android')
  if (platform === 'ios') return i18n('remote:platform-ios')
  return i18n('remote:platform-network')
}
