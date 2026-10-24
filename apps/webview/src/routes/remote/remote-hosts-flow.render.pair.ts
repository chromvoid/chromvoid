import {html, nothing, type TemplateResult} from 'lit'

import {i18n} from 'root/i18n'

import {
  createRenderContext,
  getHostPlatformName,
  renderBackLink,
  type RemoteHostsFlowPanelOptions,
  type RemoteHostsFlowRenderContext,
} from './remote-hosts-flow.render.shared'

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
              ${i18n('remote:transport-wss-relay')}
            </span>
          `,
        )}
      </div>
    </div>
  `
}

function renderDesktopPairPanel(ctx: RemoteHostsFlowRenderContext): TemplateResult {
  const pairBusy =
    ctx.model.connectionOperationBusy() ||
    ctx.model.pairPhase() === 'connecting' ||
    ctx.model.pairPhase() === 'starting'
  const pairing = ctx.model.desktopPairing
  const offerError = pairing.offerError()
  const pinError = pairing.pinError()

  return html`
    ${renderBackLink(ctx.ui.pairBackLink)}
    <form class="step active" @submit=${ctx.actions.onSubmitPairing} novalidate>
      <div class="step-title">${i18n('remote:pair-mobile-host')}</div>
      <div class="step-desc">${i18n('network-pair:intro-desktop')}</div>

      ${pairing.backendError()
        ? html`<cv-callout variant="danger" role="alert">${pairing.backendError()}</cv-callout>`
        : nothing}

      <div class="remote-form-grid">
        <label class="remote-field">
          <span class="remote-field-label">${i18n('network-pair:pairing-offer')}</span>
          <cv-textarea
            id="remote-pairing-offer"
            class="remote-textarea"
            placeholder="chromvoid://pair-mobile?session_id=..."
            enter-behavior="submit"
            aria-describedby=${offerError ? 'remote-pairing-offer-error' : nothing}
            ?invalid=${Boolean(offerError)}
            .value=${ctx.model.offerInput()}
            @cv-input=${ctx.actions.onOfferInput}
          ></cv-textarea>
          ${offerError
            ? html`<span id="remote-pairing-offer-error" class="remote-field-error" role="alert"
                >${offerError}</span
              >`
            : nothing}
        </label>

        <label class="remote-field">
          <span class="remote-field-label">${i18n('network-pair:pin')}</span>
          <cv-input
            id="remote-pairing-pin"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="123456"
            aria-describedby=${pinError ? 'remote-pairing-pin-error' : nothing}
            ?invalid=${Boolean(pinError)}
            .value=${ctx.model.pinInput()}
            @cv-input=${ctx.actions.onPinInput}
          ></cv-input>
          ${pinError
            ? html`<span id="remote-pairing-pin-error" class="remote-field-error" role="alert"
                >${pinError}</span
              >`
            : nothing}
        </label>

        <label class="remote-field">
          <span class="remote-field-label">${i18n('network-pair:device-label')}</span>
          <cv-input
            id="remote-pairing-device-label"
            type="text"
            placeholder=${i18n('network-pair:default-device-desktop')}
            .value=${ctx.model.currentDeviceLabel()}
            @cv-input=${ctx.actions.onDeviceLabelInput}
          ></cv-input>
        </label>
      </div>

      <div class="remote-actions">
        <cv-guidance-anchor anchor-id="remote.pair-device" surface="remote" owner="remote">
          <cv-button type="submit" variant="primary" ?disabled=${pairBusy} .loading=${pairBusy}>
            ${i18n('remote:pair-mobile-host')}
          </cv-button>
        </cv-guidance-anchor>
        <cv-button type="button" variant="ghost" ?disabled=${pairBusy} @click=${ctx.actions.onBackToHosts}
          >${i18n('button:cancel')}</cv-button
        >
      </div>
    </form>
  `
}

export function renderMobileHostPanel(ctx: RemoteHostsFlowRenderContext): TemplateResult {
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
  const waitReason = ctx.ui.waitReason ?? 'host_unlock'
  const waitDescription =
    waitReason === 'phone_approval'
      ? i18n('welcome:waiting-for-phone-approval-desc')
      : i18n('welcome:waiting-for-peer-desc')
  const waitHint =
    waitReason === 'phone_approval'
      ? i18n('welcome:waiting-for-phone-approval-hint')
      : i18n('welcome:waiting-for-peer-hint')

  return html`
    ${renderBackLink(ctx.ui.waitBackLink)}
    <div class="step active">
      <div class="step-title">
        ${i18n('welcome:waiting-for-peer', {peer: ctx.model.connectedPeerLabel()})}
      </div>
      <div class="step-desc">${waitDescription}</div>

      ${ctx.model.statusText()
        ? html`<cv-callout variant="info">${ctx.model.statusText()}</cv-callout>`
        : nothing}
      ${ctx.model.errorText()
        ? html`<cv-callout variant="danger">${ctx.model.errorText()}</cv-callout>`
        : nothing}

      <cv-callout class="remote-hosts-callout" variant="warning" density="compact"> ${waitHint} </cv-callout>

      <div class="remote-actions">
        <cv-button variant="ghost" @click=${ctx.actions.onDisconnectTransport}
          >${i18n('button:disconnect')}</cv-button
        >
      </div>
    </div>
  `
}
