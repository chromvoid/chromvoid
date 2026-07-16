import {html, nothing, type TemplateResult} from 'lit'

import {i18n} from 'root/i18n'

import {formatLastSyncTime, type NetworkPairedPeer} from './remote.model'
import type {MobileUsbDetectedDeviceView} from './remote-usb-flow.model'
import {
  createRenderContext,
  renderBackLink,
  renderRemoteFlowFrame,
  type RemoteHostsFlowPanelOptions,
  type RemoteHostsFlowRenderContext,
} from './remote-hosts-flow.render.shared'

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

function getPeerLastSeenLabel(peer: NetworkPairedPeer): string {
  if (!peer.last_seen) return '-'
  return formatLastSyncTime(peer.last_seen)
}

function renderWelcomeRemotePeerItem({
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
    <div class="remote-peer" data-peer-status=${peerStatus ?? 'unknown'}>
      <span class="remote-peer-status-dot" aria-hidden="true"></span>
      <div class="remote-peer-main">
        <div class="remote-peer-title-row">
          <div class="remote-peer-title">${peer.label || peer.peer_id}</div>
          <span class="mode-badge status-neutral" data-peer-transport=${transportKind}
            >${transportLabel}</span
          >
        </div>
        <div class="remote-peer-meta">${platformLabel} · ${peer.peer_id}</div>
      </div>
      <div class="remote-peer-state">
        ${statusLabel
          ? html`<strong class="remote-peer-state-label status-${statusClass || 'neutral'}"
              >${statusLabel}</strong
            >`
          : html`<strong class="remote-peer-state-label status-neutral"
              >${i18n('remote:platform-network')}</strong
            >`}
        <span>${getPeerLastSeenLabel(peer)}</span>
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
        <button
          type="button"
          class="remote-peer-remove"
          ?disabled=${isActive || isRemoving}
          aria-label=${i18n('remote:usb-mobile-remove-host', {label: peer.label || peer.peer_id})}
          @click=${() => onRemovePeer(peer)}
        >
          <cv-icon name="trash-2" size="s"></cv-icon>
        </button>
      </div>
    </div>
  `
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

function getFirstDetectedUsbDevice(ctx: RemoteHostsFlowRenderContext): MobileUsbDetectedDeviceView | null {
  return ctx.model.usb.detectedDeviceViews()[0] ?? null
}

function renderDesktopUsbEntryPanel(ctx: RemoteHostsFlowRenderContext): TemplateResult | typeof nothing {
  if (!ctx.model.isMobileUsbRemoteRuntime()) return nothing

  const detectedDevice = getFirstDetectedUsbDevice(ctx)
  const pairedHostCount = ctx.model.usb.pairedHostViews().length

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
        ${detectedDevice
          ? html`
              <span class="mode-badge status-success" data-usb-entry-detected>
                ${i18n('remote:usb-mobile-entry-detected-hint', {label: detectedDevice.label})}
              </span>
            `
          : nothing}
        ${!detectedDevice && pairedHostCount > 0
          ? html`
              <span class="mode-badge status-success" data-usb-entry-paired>
                ${i18n('remote:usb-mobile-entry-paired-count', {count: String(pairedHostCount)})}
              </span>
            `
          : nothing}
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

function renderWelcomeDesktopUsbEntryPanel(
  ctx: RemoteHostsFlowRenderContext,
): TemplateResult | typeof nothing {
  if (!ctx.model.isMobileUsbRemoteRuntime()) return nothing

  const detectedDevice = getFirstDetectedUsbDevice(ctx)
  const pairedHostCount = ctx.model.usb.pairedHostViews().length

  return html`
    <button
      type="button"
      class="remote-action-tile remote-action-tile--usb"
      ?disabled=${ctx.model.usb.busy()}
      @click=${ctx.actions.onOpenUsbMobile}
      aria-label=${i18n('remote:usb-mobile-entry-action')}
      data-usb-entry="desktop"
      data-usb-entry-action="open"
    >
      <span class="remote-action-tile-icon" aria-hidden="true">
        <cv-icon name="usb" size="s"></cv-icon>
      </span>
      <span class="remote-action-tile-copy">
        <strong>${i18n('remote:usb-mobile-entry-title')}</strong>
        <span>
          <span data-usb-entry-transport="usb_mobile">${i18n('remote:transport-usb-mobile')}</span>
          ·
          <span data-usb-entry-bridge="android_aoa">${i18n('remote:transport-android-aoa')}</span>
          ·
          <span data-usb-entry-fallback="disabled">${i18n('remote:network-fallback-disabled')}</span>
        </span>
        ${detectedDevice
          ? html`
              <span data-usb-entry-detected>
                ${i18n('remote:usb-mobile-entry-detected-hint', {label: detectedDevice.label})}
              </span>
            `
          : nothing}
        ${!detectedDevice && pairedHostCount > 0
          ? html`
              <span data-usb-entry-paired>
                ${i18n('remote:usb-mobile-entry-paired-count', {count: String(pairedHostCount)})}
              </span>
            `
          : nothing}
      </span>
    </button>
  `
}

function renderWelcomeRemoteHostsPanel(ctx: RemoteHostsFlowRenderContext): TemplateResult {
  const peers = ctx.model.peers()
  const statusText = ctx.model.statusText()
  const errorText = ctx.model.errorText()

  return html`
    ${renderBackLink(ctx.ui.hostsBackLink)}
    ${renderRemoteFlowFrame(
      ctx,
      'hosts',
      html`
        <div class="step active">
          <div class="remote-step-heading">
            <div>
              <div class="step-title">${i18n('welcome:remote-flow-local-title')}</div>
              <div class="step-desc">${i18n('welcome:remote-flow-local-desc')}</div>
            </div>
            <cv-button
              class="remote-rescan-button"
              variant="ghost"
              size="small"
              ?disabled=${ctx.model.loadingPeers()}
              @click=${ctx.actions.onRefreshPeers}
            >
              <cv-icon name="refresh-cw" slot="prefix"></cv-icon>
              ${ctx.model.loadingPeers() ? i18n('welcome:refreshing') : i18n('welcome:refresh-hosts')}
            </cv-button>
          </div>

          ${statusText ? html`<cv-callout variant="info">${statusText}</cv-callout>` : nothing}
          ${errorText ? html`<cv-callout variant="danger">${errorText}</cv-callout>` : nothing}

          <div class="remote-section-label">${i18n('welcome:remote-hosts-title')} · ${peers.length}</div>

          ${peers.length > 0
            ? html`<div class="remote-peer-list">
                ${peers.map((peer) =>
                  renderWelcomeRemotePeerItem({
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
                </div>
              `}

          <div class="remote-section-label">${i18n('welcome:remote-flow-add-host')}</div>
          <div class="remote-add-host-grid">
            <cv-guidance-anchor anchor-id="remote.pair-device" surface="remote" owner="remote">
              <button type="button" class="remote-action-tile" @click=${ctx.actions.onOpenPairIos}>
                <span class="remote-action-tile-icon" aria-hidden="true">
                  <cv-icon name="plus" size="s"></cv-icon>
                </span>
                <span class="remote-action-tile-copy">
                  <strong>${i18n('remote:pair-mobile-host')}</strong>
                  <span>${i18n('welcome:remote-flow-pair-network-meta')}</span>
                </span>
              </button>
            </cv-guidance-anchor>
            ${renderWelcomeDesktopUsbEntryPanel(ctx)}
          </div>
        </div>
      `,
    )}
  `
}

export function renderRemoteHostsPanel(options: RemoteHostsFlowPanelOptions): TemplateResult {
  const ctx = createRenderContext(options)
  const peers = ctx.model.peers()
  const statusText = ctx.model.statusText()
  const errorText = ctx.model.errorText()

  if (ctx.ui.welcomeFrame) {
    return renderWelcomeRemoteHostsPanel(ctx)
  }

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
