import {html, nothing, type TemplateResult} from 'lit'

import {i18n} from 'root/i18n'

import type {NetworkPairedPeer} from './remote.model'
import type {RemoteHostsFlowModel} from './remote-hosts-flow.model'

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
  onBackToHosts?: () => void
  onConnectPeer?: (peerId: string) => void
  onRemovePeer?: (peer: NetworkPairedPeer) => void
  onOfferInput?: (event: Event) => void
  onPinInput?: (event: Event) => void
  onDeviceLabelInput?: (event: Event) => void
  onSubmitPairing?: () => void
  onRefreshPresence?: () => void
  onDisconnectTransport?: () => void
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
    onBackToHosts: overrides.onBackToHosts ?? (() => void model.closePairIos()),
    onConnectPeer: overrides.onConnectPeer ?? ((peerId) => void model.connectToPeer(peerId)),
    onRemovePeer: overrides.onRemovePeer ?? ((peer) => void model.removePeer(peer)),
    onOfferInput: overrides.onOfferInput ?? model.handleOfferInput,
    onPinInput: overrides.onPinInput ?? model.handlePinInput,
    onDeviceLabelInput: overrides.onDeviceLabelInput ?? model.handleDeviceLabelInput,
    onSubmitPairing: overrides.onSubmitPairing ?? (() => void model.submitPairing()),
    onRefreshPresence: overrides.onRefreshPresence ?? (() => void model.refreshPresence()),
    onDisconnectTransport: overrides.onDisconnectTransport ?? (() => void model.disconnectTransport()),
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

function getHostPlatformLabel(platform: string): string {
  if (platform === 'android') return i18n('remote:peer-android-host')
  if (platform === 'ios') return i18n('welcome:peer-iphone-host')
  return i18n('welcome:paired-network-peer')
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
  const peerStatus = peer.platform === 'ios' || peer.platform === 'android' ? peer.status ?? 'offline' : null
  const statusLabel = getRemotePeerStatusLabel(peerStatus)
  const statusClass =
    peerStatus === 'ready' ? 'success' : peerStatus === 'waking' ? 'warning' : peerStatus === 'offline' ? 'danger' : ''
  const isActive = activePeerId === peer.peer_id
  const isRemoving = removingPeerId === peer.peer_id
  const actionLabel =
    isActive
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
        ${statusLabel ? html`<span class="mode-badge status-${statusClass || 'neutral'}">${statusLabel}</span>` : nothing}
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
        <cv-button variant="primary" ?disabled=${ctx.model.loadingPeers()} @click=${ctx.actions.onRefreshPeers}>
          ${ctx.model.loadingPeers() ? i18n('welcome:refreshing') : i18n('welcome:refresh-hosts')}
        </cv-button>
        <cv-guidance-anchor anchor-id="remote.pair-device" surface="remote" owner="remote">
          <cv-button variant="ghost" @click=${ctx.actions.onOpenPairIos}>${i18n('remote:pair-mobile-host')}</cv-button>
        </cv-guidance-anchor>
      </div>

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
                <cv-button variant="primary" @click=${ctx.actions.onOpenPairIos}>${i18n('remote:pair-mobile-host')}</cv-button>
              </cv-guidance-anchor>
            </div>
          `}
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

      ${ctx.model.pairError() ? html`<cv-callout variant="danger">${ctx.model.pairError()}</cv-callout>` : nothing}

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
          <cv-button variant="primary" ?disabled=${pairBusy} .loading=${pairBusy} @click=${ctx.actions.onSubmitPairing}>
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
  const presence = hostStatus?.presence
  const pairError = ctx.model.pairError()
  const platform = ctx.model.hostPlatform()
  const platformName = getHostPlatformName(platform)

  return html`
    ${renderBackLink(ctx.ui.pairBackLink)}
    <div class="step active">
      <div class="step-title">${i18n('remote:mobile-host-title', {platform: platformName})}</div>
      <div class="step-desc">${i18n('network-pair:intro-mobile', {platform: platformName})}</div>

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

      ${hostStatus?.connected_peers?.length
        ? html`
            <div class="remote-presence-panel">
              <div class="remote-field-label">${i18n('remote:connected-desktops')}</div>
              <div class="remote-peer-list">
                ${hostStatus.connected_peers.map(
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
              <div class="mode-badge status-success mono">${presence.status} · ${presence.room_id.slice(0, 12)}...</div>
            </div>
          `
        : nothing}

      ${hostStatus?.paired_peer_id
        ? html`
            <div class="remote-presence-panel">
              <div class="remote-field-label">${i18n('network-pair:paired-desktop')}</div>
              <div class="remote-peer-meta">${hostStatus.paired_peer_id}</div>
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
              <cv-button variant="ghost" @click=${ctx.actions.onBackToHosts}>${i18n('button:stop')}</cv-button>
            `
          : html`
              <cv-button variant="ghost" @click=${ctx.actions.onBackToHosts}>${i18n('button:cancel')}</cv-button>
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
      <div class="step-title">${i18n('welcome:waiting-for-peer', {peer: ctx.model.connectedPeerLabel()})}</div>
      <div class="step-desc">${i18n('welcome:waiting-for-peer-desc')}</div>

      ${ctx.model.statusText() ? html`<cv-callout variant="info">${ctx.model.statusText()}</cv-callout>` : nothing}
      ${ctx.model.errorText() ? html`<cv-callout variant="danger">${ctx.model.errorText()}</cv-callout>` : nothing}

      <cv-callout class="remote-hosts-callout" variant="warning" density="compact">
        ${i18n('welcome:waiting-for-peer-hint')}
      </cv-callout>

      <div class="remote-actions">
        <cv-button variant="ghost" @click=${ctx.actions.onDisconnectTransport}>${i18n('button:disconnect')}</cv-button>
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

  return renderRemoteHostsPanel(options)
}
