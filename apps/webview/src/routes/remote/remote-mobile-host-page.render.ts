import {html, nothing, type TemplateResult} from 'lit'
import {repeat} from 'lit/directives/repeat.js'

import {i18n} from 'root/i18n'

import type {MobileHostPageState, RemoteHostsFlowModel} from './remote-hosts-flow.model'
import {formatLastSyncTime} from './remote.model'

export interface MobileRemoteHostPageRenderContext {
  model: RemoteHostsFlowModel
  canShareOffer: boolean
  onStart: () => void
  onRetry: () => void
  onStop: () => void
  onCopyOffer: () => void
  onShareOffer: () => void
  onDeviceLabelInput: (event: Event) => void
  onRefreshPairedComputers: () => void
  onRevokePairedComputer: (event: Event) => void
}

type MobileHostPathState = 'after-start' | 'preparing' | 'ready' | 'connected' | 'degraded'

function getStateTitle(state: MobileHostPageState, connectedCount: number, platform: string): string {
  switch (state) {
    case 'off':
      return platform === 'android'
        ? i18n('remote:mobile-host-state-off-title-android')
        : i18n('remote:mobile-host-state-off-title')
    case 'starting':
      return i18n('remote:mobile-host-state-starting-title')
    case 'pairing':
      return i18n('remote:mobile-host-state-pairing-title')
    case 'ready':
      return i18n('remote:mobile-host-state-ready-title')
    case 'connected':
      return i18n('remote:mobile-host-state-connected-title', {count: connectedCount})
    case 'error':
      return i18n('remote:mobile-host-state-error-title')
  }
}

function getStateDescription(state: MobileHostPageState, platform: string): string {
  switch (state) {
    case 'off':
      return platform === 'android'
        ? i18n('remote:mobile-host-state-off-description-android')
        : i18n('remote:mobile-host-state-off-description')
    case 'starting':
      return i18n('remote:mobile-host-state-starting-description')
    case 'pairing':
      return i18n('remote:mobile-host-state-pairing-description')
    case 'ready':
      return i18n('remote:mobile-host-state-ready-description')
    case 'connected':
      return i18n('remote:mobile-host-state-connected-description')
    case 'error':
      return i18n('remote:mobile-host-state-error-description')
  }
}

function getPathStateLabel(state: MobileHostPathState): string {
  switch (state) {
    case 'after-start':
      return i18n('remote:mobile-host-path-after-start')
    case 'preparing':
      return i18n('remote:mobile-host-path-preparing')
    case 'ready':
      return i18n('remote:mobile-host-path-ready')
    case 'connected':
      return i18n('remote:mobile-host-path-connected')
    case 'degraded':
      return i18n('remote:mobile-host-path-degraded')
  }
}

function resolveNetworkPathState(ctx: MobileRemoteHostPageRenderContext): MobileHostPathState {
  const state = ctx.model.mobileHostPageState()
  if (ctx.model.connectedNetworkPeers().length > 0) return 'connected'
  if (state === 'off') return 'after-start'
  if (state === 'starting' || state === 'pairing') return 'preparing'
  if (ctx.model.hostStatus()?.presence?.status === 'ready') return 'ready'
  return 'degraded'
}

function resolveUsbPathState(ctx: MobileRemoteHostPageRenderContext): MobileHostPathState {
  return ctx.model.connectedUsbPeers().length > 0 ? 'connected' : 'ready'
}

function renderConnectionPath({
  kind,
  icon,
  title,
  description,
  state,
}: {
  kind: 'network' | 'usb'
  icon: string
  title: string
  description: string
  state: MobileHostPathState
}): TemplateResult {
  return html`
    <li class="mobile-host-path" data-mobile-host-path=${kind} data-path-state=${state}>
      <span class="mobile-host-path-icon" aria-hidden="true">
        <cv-icon name=${icon} size="m"></cv-icon>
      </span>
      <span class="mobile-host-path-copy">
        <strong>${title}</strong>
        <span>${description}</span>
      </span>
      <span class="mobile-host-path-status" data-state=${state}>${getPathStateLabel(state)}</span>
    </li>
  `
}

function renderConnectionPaths(ctx: MobileRemoteHostPageRenderContext): TemplateResult {
  const supportsUsb = ctx.model.mobileHostTransports().includes('usb_mobile')

  return html`
    <section class="mobile-host-section" aria-labelledby="mobile-host-paths-title">
      <h2 id="mobile-host-paths-title">${i18n('remote:mobile-host-connection-methods')}</h2>
      <ul class="mobile-host-paths">
        ${renderConnectionPath({
          kind: 'network',
          icon: 'network',
          title: i18n('remote:platform-network'),
          description: i18n('remote:mobile-host-network-description'),
          state: resolveNetworkPathState(ctx),
        })}
        ${supportsUsb
          ? renderConnectionPath({
              kind: 'usb',
              icon: 'usb',
              title: i18n('remote:transport-usb-mobile'),
              description: i18n('remote:mobile-host-usb-short-description'),
              state: resolveUsbPathState(ctx),
            })
          : nothing}
      </ul>
    </section>
  `
}

function renderPairingLink(
  ctx: MobileRemoteHostPageRenderContext,
  showPreparingState: boolean,
): TemplateResult | typeof nothing {
  const offerText = ctx.model.offerText()
  if (!offerText) {
    return showPreparingState
      ? html`
          <p class="mobile-host-progress" role="status">
            <span class="mobile-host-spinner" aria-hidden="true"></span>
            ${i18n('remote:mobile-host-invitation-preparing')}
          </p>
        `
      : nothing
  }

  return html`
    <div class="mobile-host-invitation">
      <span class="mobile-host-invitation-copy">
        <strong id="mobile-host-pairing-link-title"> ${i18n('remote:mobile-host-pairing-link')} </strong>
        <span id="mobile-host-pairing-link-description">
          ${i18n('remote:mobile-host-pairing-link-description')}
        </span>
      </span>
      <cv-input
        class="mobile-host-pairing-link"
        data-mobile-host-pairing-link
        type="text"
        readonly
        size="small"
        dir="ltr"
        aria-labelledby="mobile-host-pairing-link-title"
        aria-describedby="mobile-host-pairing-link-description"
        .value=${offerText}
      ></cv-input>
    </div>
  `
}

function renderInvitationActions(ctx: MobileRemoteHostPageRenderContext): TemplateResult | typeof nothing {
  if (!ctx.model.offerText()) return nothing

  return html`
    <div class="mobile-host-actions mobile-host-actions--invitation">
      ${ctx.canShareOffer
        ? html`
            <cv-button
              variant="primary"
              size="large"
              data-mobile-host-action="share"
              @click=${ctx.onShareOffer}
            >
              <cv-icon slot="prefix" name="share-2" size="s"></cv-icon>
              ${i18n('button:share')}
            </cv-button>
          `
        : nothing}
      <cv-button
        variant=${ctx.canShareOffer ? 'default' : 'primary'}
        size="large"
        data-mobile-host-action="copy"
        @click=${ctx.onCopyOffer}
      >
        <cv-icon slot="prefix" name="copy" size="s"></cv-icon>
        ${i18n('button:copy')}
      </cv-button>
    </div>
  `
}

function renderStopButton(ctx: MobileRemoteHostPageRenderContext): TemplateResult {
  const stopping = ctx.model.mobileHostStopping()
  const pairedComputerBusy = ctx.model.pairedComputers.operationBusy()

  return html`
    <cv-button
      variant="danger"
      outline
      data-mobile-host-action="stop"
      ?disabled=${stopping || pairedComputerBusy}
      .loading=${stopping}
      @click=${ctx.onStop}
    >
      ${i18n('button:stop')}
    </cv-button>
  `
}

function renderPairingPanel(ctx: MobileRemoteHostPageRenderContext): TemplateResult {
  const pin = ctx.model.pairingPin()
  const expiresAt = ctx.model.offer()?.expires_at_ms ?? ctx.model.hostStatus()?.expires_at_ms

  return html`
    <section class="mobile-host-pairing" aria-labelledby="mobile-host-pairing-title">
      <h2 id="mobile-host-pairing-title">${i18n('remote:mobile-host-pairing-instruction')}</h2>
      ${renderPairingLink(ctx, true)}
      ${pin
        ? html`
            <div class="mobile-host-pin" aria-label=${i18n('network-pair:pin-for-desktop')}>
              <span>${i18n('network-pair:pin-for-desktop')}</span>
              <strong dir="ltr">${pin}</strong>
            </div>
          `
        : html`
            <p class="mobile-host-progress" role="status">
              <span class="mobile-host-spinner" aria-hidden="true"></span>
              ${i18n('remote:mobile-host-invitation-preparing')}
            </p>
          `}
      ${renderInvitationActions(ctx)}
      ${expiresAt
        ? html`
            <p class="mobile-host-expiry">
              ${i18n('remote:mobile-host-invitation-expires', {
                time: new Date(expiresAt).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </p>
          `
        : nothing}
    </section>
  `
}

function renderPairedComputers(ctx: MobileRemoteHostPageRenderContext): TemplateResult {
  const paired = ctx.model.pairedComputers
  const rows = paired.rows()
  const operationBusy = paired.operationBusy()
  return html`
    <section class="mobile-host-section" aria-labelledby="mobile-host-peers-title">
      <div class="mobile-host-section-heading">
        <h2 id="mobile-host-peers-title" tabindex="-1">${i18n('remote:mobile-paired-title')}</h2>
        <cv-button
          size="small"
          variant="ghost"
          data-mobile-host-action="refresh-paired"
          ?disabled=${operationBusy || paired.loading() || paired.refreshing()}
          .loading=${paired.refreshing()}
          @click=${ctx.onRefreshPairedComputers}
        >
          ${i18n('remote:mobile-paired-refresh')}
        </cv-button>
      </div>
      ${!paired.loaded() && !paired.errorText()
        ? html`
            <p class="mobile-host-progress" role="status" aria-live="polite">
              ${paired.loading()
                ? html`<span class="mobile-host-spinner" aria-hidden="true"></span>`
                : nothing}
              ${i18n('remote:mobile-paired-loading')}
            </p>
          `
        : nothing}
      ${paired.errorText()
        ? html`<p class="mobile-host-inline-message" data-tone="danger" role="alert">
            ${paired.loaded()
              ? i18n('remote:mobile-paired-stale-error')
              : i18n('remote:mobile-paired-load-error')}
          </p>`
        : nothing}
      ${paired.recoveryWarning()
        ? html`<p class="mobile-host-inline-message" data-tone="warning" role="alert">
            ${paired.recoveryWarning()}
          </p>`
        : nothing}
      ${paired.statusText()
        ? html`<p class="mobile-host-inline-message" role="status" aria-live="polite">
            ${paired.statusText()}
          </p>`
        : nothing}
      ${paired.loaded() && rows.length === 0
        ? html`<div class="mobile-host-empty">
            <strong>${i18n('remote:mobile-paired-empty')}</strong>
            <p>${i18n('remote:mobile-paired-empty-description')}</p>
          </div>`
        : nothing}
      ${rows.length > 0
        ? html`
            <ul class="mobile-host-peers">
              ${repeat(
                rows,
                ({peer_id}) => peer_id,
                (row) => {
                  const label = row.label.trim() || i18n('remote:mobile-host-connected-computer')
                  const transport =
                    row.display_transport === 'usb_mobile'
                      ? i18n('remote:transport-usb-mobile')
                      : i18n('remote:platform-network')
                  const revoking = paired.revokingPeerId() === row.peer_id
                  return html`
                    <li
                      class="mobile-host-peer"
                      data-mobile-host-paired-peer-id=${row.peer_id}
                      data-mobile-host-transport=${row.display_transport}
                    >
                      <span class="mobile-host-peer-icon" aria-hidden="true">
                        <cv-icon name="monitor" size="m"></cv-icon>
                      </span>
                      <span class="mobile-host-peer-copy">
                        <strong><bdi dir="auto">${label}</bdi></strong>
                        <span>
                          ${row.connected
                            ? i18n('remote:mobile-paired-connected-meta', {transport})
                            : i18n('remote:mobile-paired-last-used-meta', {
                                transport,
                                time: formatLastSyncTime(row.last_seen_ms),
                              })}
                        </span>
                      </span>
                      <cv-button
                        size="small"
                        variant="danger"
                        outline
                        data-mobile-host-revoke-peer-id=${row.peer_id}
                        ?disabled=${operationBusy}
                        .loading=${revoking}
                        @click=${ctx.onRevokePairedComputer}
                      >
                        ${i18n('remote:mobile-paired-revoke-action')}
                      </cv-button>
                    </li>
                  `
                },
              )}
            </ul>
          `
        : nothing}
    </section>
  `
}

function renderTechnicalDetails(ctx: MobileRemoteHostPageRenderContext): TemplateResult {
  const model = ctx.model
  const status = model.hostStatus()
  const editableLabel = model.mobileHostPageState() === 'off' || model.mobileHostPageState() === 'error'
  const rawError = model.pairError() ?? model.pairedComputers.errorText()
  const peerIds = model.pairedComputers.rows().map((peer) => peer.peer_id)

  return html`
    <cv-disclosure class="mobile-host-details">
      <span slot="trigger" class="mobile-host-details-trigger">
        <strong>${i18n('remote:mobile-host-technical-details')}</strong>
        <small>${i18n('remote:mobile-host-technical-summary')}</small>
      </span>
      <dl class="mobile-host-detail-list">
        <div>
          <dt>${i18n('remote:mobile-host-platform')}</dt>
          <dd>
            ${model.hostPlatform() === 'android'
              ? i18n('remote:platform-android')
              : i18n('remote:platform-ios')}
          </dd>
        </div>
        <div class="mobile-host-detail-device">
          <dt>${i18n('network-pair:device-label')}</dt>
          <dd>
            ${editableLabel
              ? html`
                  <cv-input
                    type="text"
                    .value=${model.currentDeviceLabel()}
                    @cv-input=${ctx.onDeviceLabelInput}
                  ></cv-input>
                `
              : html`<bdi dir="auto">${model.currentDeviceLabel()}</bdi>`}
          </dd>
        </div>
        ${status?.presence?.room_id
          ? html`
              <div>
                <dt>${i18n('remote:mobile-host-room-id')}</dt>
                <dd><code dir="ltr">${status.presence.room_id}</code></dd>
              </div>
            `
          : nothing}
        ${status?.paired_peer_id
          ? html`
              <div>
                <dt>${i18n('network-pair:paired-desktop')}</dt>
                <dd><code dir="ltr">${status.paired_peer_id}</code></dd>
              </div>
            `
          : nothing}
        ${peerIds.map(
          (peerId) => html`
            <div>
              <dt>${i18n('remote:connected-peer')}</dt>
              <dd><code dir="ltr">${peerId}</code></dd>
            </div>
          `,
        )}
        ${rawError
          ? html`
              <div>
                <dt>${i18n('status:error')}</dt>
                <dd><code dir="auto">${rawError}</code></dd>
              </div>
            `
          : nothing}
      </dl>
    </cv-disclosure>
  `
}

function renderPrimaryStateContent(ctx: MobileRemoteHostPageRenderContext): TemplateResult {
  const state = ctx.model.mobileHostPageState()

  if (state === 'pairing') {
    return html`
      ${renderPairingPanel(ctx)}
      <div class="mobile-host-actions">${renderStopButton(ctx)}</div>
    `
  }

  if (state === 'ready') {
    return html`
      ${renderPairingLink(ctx, false)} ${renderInvitationActions(ctx)}
      <p class="mobile-host-security-note">${i18n('remote:mobile-host-security-note')}</p>
      <div class="mobile-host-actions">${renderStopButton(ctx)}</div>
    `
  }

  if (state === 'connected') {
    return html`
      <p class="mobile-host-security-note">${i18n('remote:mobile-host-security-note')}</p>
      <div class="mobile-host-actions">${renderStopButton(ctx)}</div>
    `
  }

  if (state === 'error') {
    return html`
      <div class="mobile-host-actions">
        <cv-button
          variant="primary"
          size="large"
          data-mobile-host-action="retry"
          ?disabled=${ctx.model.pairedComputers.operationBusy()}
          @click=${ctx.onRetry}
        >
          ${i18n('button:retry')}
        </cv-button>
        ${ctx.model.hostStatus()?.phase !== 'Idle' ? renderStopButton(ctx) : nothing}
      </div>
    `
  }

  if (state === 'starting') {
    return html`
      <p class="mobile-host-progress" role="status">
        <span class="mobile-host-spinner" aria-hidden="true"></span>
        ${i18n('remote:mobile-host-state-starting-description')}
      </p>
    `
  }

  return html`
    <div class="mobile-host-actions">
      <cv-button
        variant="primary"
        size="large"
        data-mobile-host-action="start"
        ?disabled=${ctx.model.pairedComputers.operationBusy()}
        @click=${ctx.onStart}
      >
        ${i18n('remote:mobile-host-start-network')}
      </cv-button>
    </div>
  `
}

export function renderMobileRemoteHostPage(ctx: MobileRemoteHostPageRenderContext): TemplateResult {
  const state = ctx.model.mobileHostPageState()
  const connectedCount = ctx.model.hostStatus()?.connected_peers.length ?? 0
  const platform = ctx.model.hostPlatform()
  const busy =
    state === 'starting' || ctx.model.mobileHostStopping() || ctx.model.pairedComputers.operationBusy()

  return html`
    <div
      class="page mobile-host-page"
      data-mobile-host-page
      data-mobile-host-state=${state}
      data-mobile-host-platform=${ctx.model.hostPlatform()}
      aria-busy=${busy ? 'true' : 'false'}
    >
      <header class="mobile-host-hero">
        <div class="mobile-host-hero-icon" aria-hidden="true">
          <cv-icon name="smartphone" size="l"></cv-icon>
        </div>
        <div class="mobile-host-status" role="status" aria-live="polite">
          <span class="mobile-host-status-dot" data-state=${state} aria-hidden="true"></span>
          ${getStateTitle(state, connectedCount, platform)}
        </div>
        <h1>${i18n('remote:mobile-host-page-title')}</h1>
        <p>${getStateDescription(state, platform)}</p>
      </header>

      ${renderPrimaryStateContent(ctx)} ${renderConnectionPaths(ctx)} ${renderPairedComputers(ctx)}
      ${renderTechnicalDetails(ctx)}
    </div>
  `
}
