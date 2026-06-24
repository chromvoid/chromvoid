import {html, nothing, type TemplateResult} from 'lit'

import {i18n} from 'root/i18n'

import type {MobileUsbRecoveryAction, MobileUsbScannedHost, NetworkPairedPeer} from './remote.model'
import type {MobileHostTransportKind, RemoteHostsFlowModel} from './remote-hosts-flow.model'
import type {
  MobileUsbFlowState,
  MobileUsbPendingAction,
  MobileUsbScanClassificationKind,
} from './remote-usb-flow.model'

export interface RemoteHostsFlowBackLink {
  label: string
  onBack: () => void
}

export interface RemoteHostsFlowPanelUI {
  hostsBackLink?: RemoteHostsFlowBackLink
  pairBackLink?: RemoteHostsFlowBackLink
  waitBackLink?: RemoteHostsFlowBackLink
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

type ResolvedRemoteHostsFlowPanelActions = Required<RemoteHostsFlowPanelActions>

type RemoteHostsFlowRenderContext = {
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
          model.showHosts()
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
    onUsbConnectPairedHost:
      overrides.onUsbConnectPairedHost ?? ((hostId) => void model.usb.connectPairedHost(hostId)),
    onUsbRemovePairedHost:
      overrides.onUsbRemovePairedHost ?? ((hostId) => void model.usb.removePaired(hostId)),
    onUsbDisconnect: overrides.onUsbDisconnect ?? (() => void model.usb.disconnect()),
    onUsbDismissError: overrides.onUsbDismissError ?? (() => model.usb.dismissError()),
  }
}

function createRenderContext(options: RemoteHostsFlowPanelOptions): RemoteHostsFlowRenderContext {
  return {
    model: options.model,
    actions: resolveActions(options.model, options.actions),
    ui: options.ui ?? {},
  }
}

function renderBackLink(backLink?: RemoteHostsFlowBackLink): TemplateResult | typeof nothing {
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

function getHostPlatformName(platform: string): string {
  if (platform === 'android') return i18n('remote:platform-android')
  if (platform === 'ios') return i18n('remote:platform-ios')
  return i18n('remote:platform-network')
}

function getRemotePeerStatusLabel(status: string | null): string | null {
  if (!status) return null
  if (status === 'ready') return i18n('status:ready')
  if (status === 'waking') return i18n('status:waking')
  if (status === 'offline') return i18n('status:offline')
  return status
}

function getNetworkPeerTransportLabel(peer: NetworkPairedPeer): string {
  if (peer.platform === 'ios' || peer.platform === 'android') return i18n('remote:transport-wss-relay')
  return i18n('remote:transport-network-fallback')
}

function getNetworkPeerTransportKind(peer: NetworkPairedPeer): string {
  if (peer.platform === 'ios' || peer.platform === 'android') return 'wss_relay'
  return 'network_fallback'
}

function renderRemotePeerItem({
  peer,
  activePeerId,
  removingPeerId,
  onConnectPeer,
  onRemovePeer,
}: {
  peer: NetworkPairedPeer
  activePeerId: string | null
  removingPeerId: string | null
  onConnectPeer: (peerId: string) => void
  onRemovePeer: (peer: NetworkPairedPeer) => void
}) {
  const platformLabel =
    peer.platform === 'ios'
      ? i18n('welcome:peer-iphone-host')
      : peer.platform === 'android'
        ? i18n('remote:peer-android-host')
        : i18n('welcome:peer-network-peer')
  const peerStatus =
    peer.platform === 'ios' || peer.platform === 'android' ? (peer.status ?? 'offline') : null
  const statusLabel = getRemotePeerStatusLabel(peerStatus)
  const statusClass =
    peerStatus === 'ready'
      ? 'success'
      : peerStatus === 'waking'
        ? 'warning'
        : peerStatus === 'offline'
          ? 'danger'
          : ''
  const transportLabel = getNetworkPeerTransportLabel(peer)
  const transportKind = getNetworkPeerTransportKind(peer)
  const isActive = activePeerId === peer.peer_id
  const isRemoving = removingPeerId === peer.peer_id
  const actionLabel = isActive
    ? i18n('welcome:connecting')
    : peer.platform === 'ios' && peerStatus !== 'ready'
      ? i18n('welcome:wake-connect')
      : i18n('button:connect')

  return html`
    <div class="remote-peer">
      <div class="remote-peer-main">
        <div class="remote-peer-title">${peer.label || peer.peer_id}</div>
        <div class="remote-peer-meta">${peer.peer_id}</div>
      </div>
      <div class="remote-peer-badges">
        <span class="mode-badge">${platformLabel}</span>
        <span class="mode-badge status-neutral" data-peer-transport=${transportKind}>${transportLabel}</span>
        ${statusLabel
          ? html`<span class="mode-badge status-${statusClass || 'neutral'}">${statusLabel}</span>`
          : nothing}
      </div>
      <div class="remote-peer-actions">
        <cv-button
          variant="primary"
          ?disabled=${isActive || isRemoving}
          .loading=${isActive}
          @click=${() => onConnectPeer(peer.peer_id)}
        >
          ${actionLabel}
        </cv-button>
        <cv-button
          variant="danger"
          ?disabled=${isActive || isRemoving}
          .loading=${isRemoving}
          @click=${() => onRemovePeer(peer)}
        >
          ${i18n('button:remove')}
        </cv-button>
      </div>
    </div>
  `
}

function renderDesktopUsbEntryPanel(ctx: RemoteHostsFlowRenderContext): TemplateResult | typeof nothing {
  if (!ctx.model.isMobileUsbRemoteRuntime()) return nothing

  return html`
    <div class="remote-presence-panel" data-usb-entry="desktop">
      <div class="remote-field-label">${i18n('remote:usb-mobile-title')}</div>
      <div class="step-title">${i18n('remote:usb-mobile-entry-title')}</div>
      <div class="step-desc">${i18n('remote:usb-mobile-entry-desc')}</div>
      <div class="remote-peer-badges">
        <span class="mode-badge status-success" data-usb-entry-transport="usb_mobile">
          ${i18n('remote:transport-usb-mobile')}
        </span>
        <span class="mode-badge status-success" data-usb-entry-bridge="android_aoa">
          ${i18n('remote:transport-android-aoa')}
        </span>
        <span class="mode-badge status-neutral" data-usb-entry-fallback="disabled">
          ${i18n('remote:network-fallback-disabled')}
        </span>
      </div>
      <div class="remote-actions">
        <cv-button
          variant="primary"
          ?disabled=${ctx.model.usb.busy()}
          @click=${ctx.actions.onOpenUsbMobile}
          aria-label=${i18n('remote:usb-mobile-entry-action')}
          data-usb-entry-action="open"
        >
          ${i18n('remote:usb-mobile-entry-action')}
        </cv-button>
      </div>
    </div>
  `
}

export function renderRemoteHostsPanel(options: RemoteHostsFlowPanelOptions): TemplateResult {
  const ctx = createRenderContext(options)
  const peers = ctx.model.peers()
  const statusText = ctx.model.statusText()
  const errorText = ctx.model.errorText()

  return html`
    ${renderBackLink(ctx.ui.hostsBackLink)}
    <div class="step active">
      <div class="step-title">${i18n('welcome:remote-hosts-title')}</div>
      <div class="step-desc">${i18n('welcome:remote-hosts-desc')}</div>

      ${statusText ? html`<cv-callout variant="info">${statusText}</cv-callout>` : nothing}
      ${errorText ? html`<cv-callout variant="danger">${errorText}</cv-callout>` : nothing}

      <div class="remote-actions">
        <cv-button
          variant="primary"
          ?disabled=${ctx.model.loadingPeers()}
          @click=${ctx.actions.onRefreshPeers}
        >
          ${ctx.model.loadingPeers() ? i18n('welcome:refreshing') : i18n('welcome:refresh-hosts')}
        </cv-button>
        <cv-guidance-anchor anchor-id="remote.pair-device" surface="remote" owner="remote">
          <cv-button variant="ghost" @click=${ctx.actions.onOpenPairIos}
            >${i18n('remote:pair-mobile-host')}</cv-button
          >
        </cv-guidance-anchor>
      </div>

      ${renderDesktopUsbEntryPanel(ctx)}

      ${peers.length > 0
        ? html`<div class="remote-peer-list">
            ${peers.map((peer) =>
              renderRemotePeerItem({
                peer,
                activePeerId: ctx.model.activePeerId(),
                removingPeerId: ctx.model.removingPeerId(),
                onConnectPeer: ctx.actions.onConnectPeer,
                onRemovePeer: ctx.actions.onRemovePeer,
              }),
            )}
          </div>`
        : html`
            <div class="empty-remote-state">
              <div class="step-title">${i18n('welcome:no-paired-hosts')}</div>
              <div class="step-desc">${i18n('welcome:no-paired-hosts-desc')}</div>
              <cv-guidance-anchor anchor-id="remote.pair-device" surface="remote" owner="remote">
                <cv-button variant="primary" @click=${ctx.actions.onOpenPairIos}
                  >${i18n('remote:pair-mobile-host')}</cv-button
                >
              </cv-guidance-anchor>
            </div>
          `}
    </div>
  `
}

function renderUsbMobilePanel(ctx: RemoteHostsFlowRenderContext): TemplateResult {
  const usb = ctx.model.usb
  const status = usb.status()
  const scanResults = usb.scannedHostViews()
  const pairedHosts = usb.pairedHostViews()
  const flowState = usb.flowState()
  const actionBusy = usb.actionBusy()
  const pendingAction = usb.pendingAction()
  const errorCode = usb.activeErrorCode()
  const recoveryAction = usb.recoveryAction()
  const activeHost = status ? status.active_host : null
  const selectedTransport = status ? status.selected_transport : 'none'
  const availableTransports = usb.availableTransports()
  const transportFamily = status ? status.transport_family : 'usb_mobile'
  const fallbackAllowed = status ? status.fallback_allowed : false

  return html`
    ${renderBackLink(ctx.ui.pairBackLink)}
    <div class="step active">
      <div class="step-title">${i18n('remote:usb-mobile-title')}</div>
      <div class="step-desc">${i18n('remote:usb-mobile-desc')}</div>

      <div class="remote-presence-panel" data-usb-flow-state=${flowState}>
        <div class="remote-field-label">${i18n('remote:usb-mobile-status')}</div>
        <div
          class="mode-badge status-${flowState === 'ready' || flowState === 'paired'
            ? 'success'
            : flowState === 'recovery' || flowState === 'error'
              ? 'danger'
              : 'warning'}"
          role="status"
          data-usb-selected-transport=${selectedTransport}
        >
          ${formatUsbFlowState(flowState)}
        </div>
      </div>

      <div
        class="remote-presence-panel"
        data-usb-transport-family=${transportFamily}
        data-usb-fallback-allowed=${String(fallbackAllowed)}
      >
        <div class="remote-field-label">${i18n('remote:transport-available')}</div>
        <div class="remote-peer-badges">
          ${availableTransports.length
            ? availableTransports.map(
                (transport) => html`
                  <span class="mode-badge status-success" data-usb-available-transport=${transport}>
                    ${formatUsbTransport(transport)}
                  </span>
                `,
              )
            : html`
                <span class="mode-badge status-warning" data-usb-available-transport="none">
                  ${i18n('remote:transport-none')}
                </span>
              `}
          <span class="mode-badge status-neutral" data-usb-network-fallback="disabled">
            ${fallbackAllowed
              ? i18n('remote:network-fallback-enabled')
              : i18n('remote:network-fallback-disabled')}
          </span>
        </div>
      </div>

      ${actionBusy
        ? html`<cv-callout variant="info" role="status">
            ${formatUsbPendingAction(pendingAction)}
          </cv-callout>`
        : nothing}
      ${usb.errorText()
        ? html`<cv-callout variant="danger" role="alert">${usb.errorText()}</cv-callout>`
        : nothing}
      ${errorCode
        ? html`
            <cv-callout variant="danger" role="alert" data-usb-error-code=${errorCode}>
              ${i18n('remote:usb-mobile-error-code', {code: errorCode})}
              ${recoveryAction
                ? html`<span data-usb-recovery-action=${recoveryAction}>
                    ${formatUsbRecoveryAction(recoveryAction)}
                  </span>`
                : nothing}
            </cv-callout>
          `
        : nothing}
      ${status
        ? html`
            <div class="remote-presence-panel">
              <div class="remote-field-label">${i18n('remote:usb-mobile-session')}</div>
              <div class="remote-peer-badges">
                <span
                  class="mode-badge status-${status.selected_transport === 'usb_mobile'
                    ? 'success'
                    : 'warning'}"
                >
                  ${status.session_state}
                </span>
                <span
                  class="mode-badge status-${status.selected_transport === 'usb_mobile'
                    ? 'success'
                    : 'warning'}"
                  data-usb-selected-transport-badge=${status.selected_transport ?? 'none'}
                >
                  ${formatUsbTransport(status.selected_transport)}
                </span>
              </div>
            </div>
          `
        : nothing}
      ${activeHost
        ? html`
            <div class="remote-presence-panel" data-usb-section="active-host">
              <div class="remote-field-label">${i18n('remote:usb-mobile-active-host')}</div>
              <div class="remote-peer">
                <div class="remote-peer-main">
                  <div class="remote-peer-title">${activeHost.label || activeHost.host_id}</div>
                  <div class="remote-peer-meta">
                    ${activeHost.platform} · ${formatUsbBridgeKind(activeHost.bridge_kind)} ·
                    ${activeHost.host_id}
                  </div>
                </div>
              </div>
            </div>
          `
        : nothing}
      ${pairedHosts.length
        ? html`
            <div class="remote-presence-panel" data-usb-section="paired-hosts">
              <div class="remote-field-label">${i18n('remote:usb-mobile-paired-hosts')}</div>
              <div class="remote-peer-list">
                ${pairedHosts.map(
                  (host) => html`
                    <div class="remote-peer" data-usb-pairing-state=${host.pairingState}>
                      <div class="remote-peer-main">
                        <div class="remote-peer-title">${host.label}</div>
                        <div class="remote-peer-meta">
                          ${host.platform} · ${formatUsbBridgeKind(host.source.bridge_kind)} ·
                          ${formatUsbPairingState(host.pairingState)}
                        </div>
                      </div>
                      <div class="remote-peer-actions">
                        <cv-button
                          variant="primary"
                          ?disabled=${actionBusy || !host.canConnect}
                          .loading=${pendingAction === 'connect'}
                          @click=${() => ctx.actions.onUsbConnectPairedHost(host.source.host_id)}
                          aria-label=${i18n('remote:usb-mobile-connect-host', {label: host.label})}
                        >
                          ${i18n('button:connect')}
                        </cv-button>
                        ${host.canRemove
                          ? html`
                              <cv-button
                                variant="danger"
                                ?disabled=${actionBusy}
                                .loading=${pendingAction === 'remove'}
                                @click=${() => ctx.actions.onUsbRemovePairedHost(host.source.host_id)}
                                aria-label=${i18n('remote:usb-mobile-remove-host', {label: host.label})}
                              >
                                ${i18n('button:remove')}
                              </cv-button>
                            `
                          : nothing}
                      </div>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
        : nothing}
      ${scanResults.length
        ? html`
            <div class="remote-presence-panel" data-usb-section="scan-results">
              <div class="remote-field-label">${i18n('remote:usb-mobile-scan-results')}</div>
              <div class="remote-peer-list">
                ${scanResults.map((result) => {
                  const pairedHostId = result.pairedHostId
                  const brokenHostId = result.brokenHostId

                  return html`
                    <div class="remote-peer" data-usb-scan-classification=${result.classification}>
                      <div class="remote-peer-main">
                        <div class="remote-peer-title">
                          ${result.label ?? i18n('remote:usb-mobile-device')}
                        </div>
                        <div class="remote-peer-meta">
                          ${result.platform} · ${formatUsbBridgeKind(result.source.scan.bridge_kind)} ·
                          ${formatUsbClassification(result.classification)}
                        </div>
                      </div>
                      <div class="remote-peer-actions">
                        ${result.canPair
                          ? html`
                              <cv-button
                                variant="primary"
                                ?disabled=${actionBusy}
                                .loading=${pendingAction === 'pair'}
                                @click=${() => ctx.actions.onUsbPairScannedHost(result.source)}
                                aria-label=${i18n('remote:usb-mobile-pair-device', {
                                  label: result.label ?? i18n('remote:usb-mobile-device'),
                                })}
                              >
                                ${i18n('remote:usb-mobile-pair')}
                              </cv-button>
                            `
                          : nothing}
                        ${result.canConnect && pairedHostId
                          ? html`
                              <cv-button
                                variant="primary"
                                ?disabled=${actionBusy}
                                .loading=${pendingAction === 'connect'}
                                @click=${() => ctx.actions.onUsbConnectPairedHost(pairedHostId)}
                                aria-label=${i18n('remote:usb-mobile-connect-host', {
                                  label: result.label ?? pairedHostId,
                                })}
                              >
                                ${i18n('button:connect')}
                              </cv-button>
                            `
                          : nothing}
                        ${result.canRemoveBroken && brokenHostId
                          ? html`
                              <cv-button
                                variant="danger"
                                ?disabled=${actionBusy}
                                .loading=${pendingAction === 'remove'}
                                @click=${() => ctx.actions.onUsbRemovePairedHost(brokenHostId)}
                                aria-label=${i18n('remote:usb-mobile-remove-host', {
                                  label: result.label ?? brokenHostId,
                                })}
                              >
                                ${i18n('button:remove')}
                              </cv-button>
                            `
                          : nothing}
                        ${result.canListPaired
                          ? html`
                              <cv-button
                                variant="ghost"
                                ?disabled=${actionBusy}
                                .loading=${pendingAction === 'load_paired'}
                                @click=${ctx.actions.onUsbLoadPaired}
                                aria-label=${i18n('remote:usb-mobile-list-paired')}
                              >
                                ${i18n('remote:usb-mobile-list-paired')}
                              </cv-button>
                            `
                          : nothing}
                      </div>
                    </div>
                  `
                })}
              </div>
            </div>
          `
        : nothing}

      <div class="remote-actions">
        <cv-button
          variant="primary"
          ?disabled=${actionBusy}
          .loading=${pendingAction === 'scan'}
          @click=${ctx.actions.onUsbScan}
          aria-label=${i18n('remote:usb-mobile-scan')}
        >
          ${i18n('remote:usb-mobile-scan')}
        </cv-button>
        <cv-button
          variant="ghost"
          ?disabled=${actionBusy}
          .loading=${pendingAction === 'refresh_status'}
          @click=${ctx.actions.onUsbRefreshStatus}
        >
          ${i18n('network-pair:button-refresh-presence')}
        </cv-button>
        <cv-button
          variant="ghost"
          ?disabled=${actionBusy}
          .loading=${pendingAction === 'disconnect'}
          @click=${ctx.actions.onUsbDisconnect}
        >
          ${i18n('button:disconnect')}
        </cv-button>
        ${usb.errorText()
          ? html`
              <cv-button variant="ghost" @click=${ctx.actions.onUsbDismissError}>
                ${i18n('remote:usb-mobile-dismiss-error')}
              </cv-button>
            `
          : nothing}
        <cv-button variant="ghost" @click=${ctx.actions.onBackToHosts}>${i18n('button:cancel')}</cv-button>
      </div>
    </div>
  `
}

function formatUsbPendingAction(action: MobileUsbPendingAction | null): string {
  switch (action) {
    case 'refresh_status':
      return i18n('remote:usb-mobile-busy-refresh')
    case 'scan':
      return i18n('remote:usb-mobile-busy-scan')
    case 'load_paired':
      return i18n('remote:usb-mobile-busy-load-paired')
    case 'pair':
      return i18n('remote:usb-mobile-busy-pair')
    case 'connect':
      return i18n('remote:usb-mobile-busy-connect')
    case 'disconnect':
      return i18n('remote:usb-mobile-busy-disconnect')
    case 'remove':
      return i18n('remote:usb-mobile-busy-remove')
    default:
      return i18n('remote:usb-mobile-busy')
  }
}

function formatUsbFlowState(state: MobileUsbFlowState): string {
  switch (state) {
    case 'unsupported':
      return i18n('remote:usb-mobile-state-unsupported')
    case 'idle':
      return i18n('remote:usb-mobile-state-idle')
    case 'scanning':
      return i18n('remote:usb-mobile-state-scanning')
    case 'unpaired':
      return i18n('remote:usb-mobile-state-unpaired')
    case 'paired':
      return i18n('remote:usb-mobile-state-paired')
    case 'pairing':
      return i18n('remote:usb-mobile-state-pairing')
    case 'connecting':
      return i18n('remote:usb-mobile-state-connecting')
    case 'waiting_host_unlock':
      return i18n('remote:usb-mobile-state-waiting-host-unlock')
    case 'ready':
      return i18n('status:ready')
    case 'disconnected':
      return i18n('status:offline')
    case 'recovery':
      return i18n('remote:usb-mobile-state-recovery')
    case 'error':
      return i18n('status:error')
  }
}

function formatUsbTransport(transport: string | null): string {
  if (transport === 'usb_mobile') return i18n('remote:transport-usb-mobile')
  return i18n('remote:transport-none')
}

function formatUsbBridgeKind(bridgeKind: string): string {
  if (bridgeKind === 'android_aoa') return i18n('remote:transport-android-aoa')
  if (bridgeKind === 'ios_external_accessory') return i18n('remote:transport-ios-external-accessory')
  return bridgeKind
}

function formatUsbPairingState(state: string): string {
  if (state === 'paired') return i18n('remote:usb-mobile-classification-paired')
  if (state === 'broken_local_state') return i18n('remote:usb-mobile-classification-broken')
  return state
}

function formatUsbClassification(classification: MobileUsbScanClassificationKind): string {
  if (classification === 'unpaired') return i18n('remote:usb-mobile-classification-unpaired')
  if (classification === 'paired') return i18n('remote:usb-mobile-classification-paired')
  if (classification === 'broken_local_state') return i18n('remote:usb-mobile-classification-broken')
  return i18n('remote:usb-mobile-classification-ambiguous')
}

function formatUsbRecoveryAction(action: MobileUsbRecoveryAction): string {
  switch (action) {
    case 'hide_usb_entry':
      return i18n('remote:usb-mobile-recovery-hide')
    case 'manual_retry':
    case 'keep_current_flow':
      return i18n('remote:usb-mobile-recovery-retry')
    case 'retry_scan':
    case 'retry_permission':
      return i18n('remote:usb-mobile-recovery-scan')
    case 'wait_in_flight':
      return i18n('remote:usb-mobile-recovery-wait')
    case 'list_paired':
      return i18n('remote:usb-mobile-recovery-list-paired')
    case 'pair_host':
      return i18n('remote:usb-mobile-recovery-pair')
    case 'connect_existing':
      return i18n('remote:usb-mobile-recovery-connect')
    case 'remove_and_repair':
      return i18n('remote:usb-mobile-recovery-remove')
    case 'disconnect_before_retry':
      return i18n('remote:usb-mobile-recovery-disconnect')
    case 'wait_for_host_unlock':
      return i18n('remote:usb-mobile-recovery-unlock')
    case 'ignore_stale_unlock':
      return i18n('remote:usb-mobile-recovery-ignore')
    case 'continue_read_only':
      return i18n('remote:usb-mobile-recovery-read-only')
  }
}

function formatMobileHostTransport(transport: MobileHostTransportKind): string {
  if (transport === 'usb_mobile') return i18n('remote:transport-usb-mobile')
  return i18n('remote:transport-wss-relay')
}

function renderMobileHostTransportPanel(ctx: RemoteHostsFlowRenderContext): TemplateResult | typeof nothing {
  const transports = ctx.model.mobileHostTransports()
  if (!transports.length) return nothing

  return html`
    <div class="remote-presence-panel" data-mobile-host-transports=${transports.join(',')}>
      <div class="remote-field-label">${i18n('remote:transport-available')}</div>
      <div class="remote-peer-badges">
        ${transports.map(
          (transport) => html`
            <span class="mode-badge status-success" data-mobile-host-transport=${transport}>
              ${formatMobileHostTransport(transport)}
            </span>
          `,
        )}
        ${transports.includes('usb_mobile')
          ? html`
              <span class="mode-badge status-neutral" data-mobile-host-usb-fallback="disabled">
                ${i18n('remote:network-fallback-disabled')}
              </span>
            `
          : nothing}
      </div>
    </div>
  `
}

function renderAndroidUsbHostPanel(ctx: RemoteHostsFlowRenderContext): TemplateResult | typeof nothing {
  if (!ctx.model.mobileHostTransports().includes('usb_mobile')) return nothing

  const activeUsbPeer = ctx
    .model
    .hostStatus()
    ?.connected_peers.find((peer) => peer.transport_type === 'usb_mobile')

  return html`
    <div
      class="remote-presence-panel"
      data-mobile-host-usb="android_aoa"
      data-mobile-host-usb-state=${activeUsbPeer ? 'connected' : 'waiting_accessory'}
    >
      <div class="remote-field-label">${i18n('remote:mobile-host-usb-title')}</div>
      <div class="remote-peer-badges">
        <span class="mode-badge status-success" data-mobile-host-transport="usb_mobile">
          ${i18n('remote:transport-usb-mobile')}
        </span>
        <span class="mode-badge status-success" data-mobile-host-usb-bridge="android_aoa">
          ${i18n('remote:transport-android-aoa')}
        </span>
        <span class="mode-badge status-neutral" data-mobile-host-usb-fallback="disabled">
          ${i18n('remote:network-fallback-disabled')}
        </span>
      </div>
      <div class="step-desc">${i18n('remote:mobile-host-usb-desc')}</div>
      <div class="mode-badge status-${activeUsbPeer ? 'success' : 'warning'}" role="status">
        ${activeUsbPeer
          ? i18n('remote:mobile-host-usb-connected')
          : i18n('remote:mobile-host-usb-waiting')}
      </div>
    </div>
  `
}

function renderDesktopPairPanel(ctx: RemoteHostsFlowRenderContext): TemplateResult {
  const pairBusy = ctx.model.pairPhase() === 'connecting' || ctx.model.pairPhase() === 'starting'

  return html`
    ${renderBackLink(ctx.ui.pairBackLink)}
    <div class="step active">
      <div class="step-title">${i18n('remote:pair-mobile-host')}</div>
      <div class="step-desc">${i18n('network-pair:intro-desktop')}</div>

      ${ctx.model.pairError()
        ? html`<cv-callout variant="danger">${ctx.model.pairError()}</cv-callout>`
        : nothing}

      <div class="remote-form-grid">
        <label class="remote-field">
          <span class="remote-field-label">${i18n('network-pair:pairing-offer')}</span>
          <cv-textarea
            class="remote-textarea"
            placeholder="chromvoid://pair-mobile?session_id=..."
            .value=${ctx.model.offerInput()}
            @cv-input=${ctx.actions.onOfferInput}
          ></cv-textarea>
        </label>

        <label class="remote-field">
          <span class="remote-field-label">${i18n('network-pair:pin')}</span>
          <cv-input
            type="text"
            inputmode="numeric"
            placeholder="123456"
            .value=${ctx.model.pinInput()}
            @cv-input=${ctx.actions.onPinInput}
          ></cv-input>
        </label>

        <label class="remote-field">
          <span class="remote-field-label">${i18n('network-pair:device-label')}</span>
          <cv-input
            type="text"
            placeholder=${i18n('network-pair:default-device-desktop')}
            .value=${ctx.model.currentDeviceLabel()}
            @cv-input=${ctx.actions.onDeviceLabelInput}
          ></cv-input>
        </label>
      </div>

      <div class="remote-actions">
        <cv-guidance-anchor anchor-id="remote.pair-device" surface="remote" owner="remote">
          <cv-button
            variant="primary"
            ?disabled=${pairBusy}
            .loading=${pairBusy}
            @click=${ctx.actions.onSubmitPairing}
          >
            ${i18n('remote:pair-mobile-host')}
          </cv-button>
        </cv-guidance-anchor>
        <cv-button variant="ghost" @click=${ctx.actions.onBackToHosts}>${i18n('button:cancel')}</cv-button>
      </div>
    </div>
  `
}

function renderMobileHostPanel(ctx: RemoteHostsFlowRenderContext): TemplateResult {
  const hostStatus = ctx.model.hostStatus()
  const phase = ctx.model.pairPhase()
  const presence = hostStatus ? hostStatus.presence : null
  const connectedPeers = hostStatus ? hostStatus.connected_peers : []
  const pairedPeerId = hostStatus ? hostStatus.paired_peer_id : null
  const pairError = ctx.model.pairError()
  const platform = ctx.model.hostPlatform()
  const platformName = getHostPlatformName(platform)

  return html`
    ${renderBackLink(ctx.ui.pairBackLink)}
    <div class="step active">
      <div class="step-title">${i18n('remote:mobile-host-title', {platform: platformName})}</div>
      <div class="step-desc">${i18n('network-pair:intro-mobile', {platform: platformName})}</div>

      ${renderMobileHostTransportPanel(ctx)}
      ${renderAndroidUsbHostPanel(ctx)}

      <label class="remote-field">
        <span class="remote-field-label">${i18n('network-pair:mobile-label', {platform: platformName})}</span>
        <cv-input
          type="text"
          placeholder=${ctx.model.currentDeviceLabel()}
          .value=${ctx.model.currentDeviceLabel()}
          @cv-input=${ctx.actions.onDeviceLabelInput}
        ></cv-input>
      </label>

      ${phase === 'waiting' || phase === 'success'
        ? html`
            <div class="pin-panel">
              <div class="remote-field-label">${i18n('network-pair:pin-for-desktop')}</div>
              <div class="pin-value mono">${ctx.model.pairingPin()}</div>
              <div class="mode-badge status-${phase === 'success' ? 'success' : 'warning'}">
                ${phase === 'success'
                  ? i18n('network-pair:status-host-ready')
                  : i18n('network-pair:status-waiting-desktop')}
              </div>
            </div>
            <label class="remote-field">
              <span class="remote-field-label">${i18n('network-pair:pairing-offer')}</span>
              <cv-textarea class="remote-textarea" readonly .value=${ctx.model.offerText()}></cv-textarea>
            </label>
          `
        : nothing}
      ${connectedPeers.length
        ? html`
            <div class="remote-presence-panel">
              <div class="remote-field-label">${i18n('remote:connected-desktops')}</div>
              <div class="remote-peer-list">
                ${connectedPeers.map(
                  (peer) => html`
                    <div class="remote-peer">
                      <div class="remote-peer-main">
                        <div class="remote-peer-title">${peer.label}</div>
                        <div class="remote-peer-meta">${peer.peer_id}</div>
                      </div>
                      <div class="remote-peer-badges">
                        <span class="mode-badge status-success">${peer.transport_type}</span>
                      </div>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
        : nothing}
      ${presence
        ? html`
            <div class="remote-presence-panel">
              <div class="remote-field-label">${i18n('network-pair:presence')}</div>
              <div class="mode-badge status-success mono">
                ${presence.status} · ${presence.room_id.slice(0, 12)}...
              </div>
            </div>
          `
        : nothing}
      ${pairedPeerId
        ? html`
            <div class="remote-presence-panel">
              <div class="remote-field-label">${i18n('network-pair:paired-desktop')}</div>
              <div class="remote-peer-meta">${pairedPeerId}</div>
            </div>
          `
        : nothing}
      ${pairError ? html`<cv-callout variant="danger">${pairError}</cv-callout>` : nothing}

      <div class="remote-actions">
        ${phase === 'idle' || phase === 'failed'
          ? html`
              <cv-guidance-anchor anchor-id="remote.pair-device" surface="remote" owner="remote">
                <cv-button variant="primary" @click=${ctx.actions.onSubmitPairing}>
                  ${i18n('network-pair:button-start-mobile-host')}
                </cv-button>
              </cv-guidance-anchor>
            `
          : nothing}
        ${phase === 'success'
          ? html`
              <cv-button variant="primary" @click=${ctx.actions.onRefreshPresence}>
                ${i18n('network-pair:button-refresh-presence')}
              </cv-button>
            `
          : nothing}
        ${phase !== 'idle'
          ? html`
              <cv-button variant="ghost" @click=${ctx.actions.onBackToHosts}
                >${i18n('button:stop')}</cv-button
              >
            `
          : html`
              <cv-button variant="ghost" @click=${ctx.actions.onBackToHosts}
                >${i18n('button:cancel')}</cv-button
              >
            `}
      </div>
    </div>
  `
}

export function renderRemotePairPanel(options: RemoteHostsFlowPanelOptions): TemplateResult {
  const ctx = createRenderContext(options)
  return ctx.model.isMobileHostRuntime() ? renderMobileHostPanel(ctx) : renderDesktopPairPanel(ctx)
}

export function renderRemoteWaitPanel(options: RemoteHostsFlowPanelOptions): TemplateResult {
  const ctx = createRenderContext(options)

  return html`
    ${renderBackLink(ctx.ui.waitBackLink)}
    <div class="step active">
      <div class="step-title">
        ${i18n('welcome:waiting-for-peer', {peer: ctx.model.connectedPeerLabel()})}
      </div>
      <div class="step-desc">${i18n('welcome:waiting-for-peer-desc')}</div>

      ${ctx.model.statusText()
        ? html`<cv-callout variant="info">${ctx.model.statusText()}</cv-callout>`
        : nothing}
      ${ctx.model.errorText()
        ? html`<cv-callout variant="danger">${ctx.model.errorText()}</cv-callout>`
        : nothing}

      <cv-callout class="remote-hosts-callout" variant="warning" density="compact">
        ${i18n('welcome:waiting-for-peer-hint')}
      </cv-callout>

      <div class="remote-actions">
        <cv-button variant="ghost" @click=${ctx.actions.onDisconnectTransport}
          >${i18n('button:disconnect')}</cv-button
        >
      </div>
    </div>
  `
}

export function renderRemoteHostsFlowPanel(options: RemoteHostsFlowPanelOptions): TemplateResult {
  const ctx = createRenderContext(options)

  if (ctx.model.isMobileHostRuntime()) {
    return renderMobileHostPanel(ctx)
  }

  if (ctx.model.view() === 'pair-ios') {
    return renderRemotePairPanel(options)
  }

  if (ctx.model.view() === 'wait') {
    return renderRemoteWaitPanel(options)
  }

  if (ctx.model.view() === 'usb-mobile') {
    return renderUsbMobilePanel(ctx)
  }

  return renderRemoteHostsPanel(options)
}
