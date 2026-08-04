import {CVField} from '@chromvoid/uikit/components/cv-field'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {nothing, type PropertyValues, type TemplateResult} from 'lit'
import {repeat} from 'lit/directives/repeat.js'

import {i18n} from 'root/i18n'
import type {
  DesktopNetworkPeerPresentation,
  DesktopUsbDetectedDevicePresentation,
} from 'root/routes/remote/remote-desktop-preauth.contract'
import type {RemoteDesktopActionErrorKind} from 'root/routes/remote/remote-hosts-flow.model'
import type {NetworkPairedPeer} from 'root/routes/remote/remote.model'
import {formatLastSyncTime} from 'root/routes/remote/remote.model'

import type {WelcomeSetupModel} from './welcome-setup.model'
import {renderDeviceLabelCopy} from './remote-desktop-preauth.copy'
import {renderDesktopPreauthUsb} from './remote-desktop-preauth-usb.render'
import {remoteDesktopPreauthStyles} from './remote-desktop-preauth.styles'

type DesktopPreauthScreen = 'hosts' | 'pair' | 'usb' | 'wait'

function renderBackIcon(): TemplateResult {
  return html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5M12 19l-7-7 7-7"></path>
    </svg>
  `
}

function renderChevronIcon(): TemplateResult {
  return html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6"></path>
    </svg>
  `
}

function peerStatusCopy(status: DesktopNetworkPeerPresentation['status']): string {
  if (status === 'ready') return i18n('remote:preauth-status-ready')
  if (status === 'waking') return i18n('remote:preauth-status-waking')
  if (status === 'offline') return i18n('remote:preauth-status-offline')
  return i18n('remote:preauth-status-unavailable')
}

function peerStatusTone(
  status: DesktopNetworkPeerPresentation['status'],
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'ready') return 'success'
  if (status === 'waking') return 'warning'
  if (status === 'offline') return 'danger'
  return 'neutral'
}

function actionErrorCopy(kind: RemoteDesktopActionErrorKind | null): string {
  if (kind === 'connect') return i18n('remote:preauth-network-error')
  if (kind === 'remove') return i18n('remote:preauth-remove-error')
  if (kind === 'transport_lost') return i18n('welcome:remote-transport-lost')
  return i18n('remote:preauth-action-error')
}

export class RemoteDesktopPreauth extends ReatomLitElement {
  static elementName = 'remote-desktop-preauth'

  static properties = {
    model: {attribute: false},
  }

  static styles = [remoteDesktopPreauthStyles]

  declare model?: WelcomeSetupModel

  private previousScreen: DesktopPreauthScreen | null = null
  private focusedPeerIdBeforeUpdate: string | null = null
  private detectedFocusTargetBeforeUpdate: HTMLElement | null = null
  private usbFocusTargetBeforeUpdate: HTMLElement | null = null
  private previousUsbPinFocusRequest = 0

  static define(): void {
    CVField.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  protected override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)
    const activeElement = this.shadowRoot?.activeElement as HTMLElement | null
    this.focusedPeerIdBeforeUpdate =
      activeElement?.closest<HTMLElement>('[data-peer-id]')?.dataset['peerId'] ?? null
    this.detectedFocusTargetBeforeUpdate = activeElement?.closest('[data-usb-summary]') ? activeElement : null
    this.usbFocusTargetBeforeUpdate = activeElement?.closest('[data-remote-preauth-screen="usb"]')
      ? activeElement
      : null
  }

  protected override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    if (!this.model) return

    const screen = this.screen()
    if (screen !== this.previousScreen) {
      this.previousScreen = screen
      const focusTarget =
        screen === 'pair'
          ? this.shadowRoot?.querySelector<HTMLElement>('#remote-preauth-pair-link')
          : this.shadowRoot?.querySelector<HTMLElement>('[data-screen-heading]')
      this.focusWhenReady(focusTarget)
    }

    if (
      screen === 'hosts' &&
      this.detectedFocusTargetBeforeUpdate !== null &&
      !this.detectedFocusTargetBeforeUpdate.isConnected
    ) {
      const focusTarget =
        this.shadowRoot?.querySelector<HTMLElement>('[data-usb-summary] cv-button') ??
        this.shadowRoot?.querySelector<HTMLElement>('[data-usb-other-way]') ??
        this.shadowRoot?.querySelector<HTMLElement>('[data-screen-heading]')
      this.focusWhenReady(focusTarget)
    }

    const peerIds = new Set(this.model.remote.peers().map(({peer_id}) => peer_id))
    if (
      screen === 'hosts' &&
      this.focusedPeerIdBeforeUpdate !== null &&
      !peerIds.has(this.focusedPeerIdBeforeUpdate)
    ) {
      this.focusWhenReady(this.shadowRoot?.querySelector<HTMLElement>('[data-screen-heading]'))
    }

    if (
      screen === 'usb' &&
      this.usbFocusTargetBeforeUpdate !== null &&
      !this.usbFocusTargetBeforeUpdate.isConnected
    ) {
      const focusTarget =
        this.shadowRoot?.querySelector<HTMLElement>('#remote-preauth-usb-pin') ??
        this.shadowRoot?.querySelector<HTMLElement>(
          '.task-panel [data-usb-pair-index]:not([disabled]), .task-panel [data-usb-connect-host-id]:not([disabled]), .task-panel [data-usb-load-paired]:not([disabled]), .task-panel [data-usb-remove-host-id]:not([disabled]), .task-panel [data-usb-primary-action]:not([disabled])',
        ) ??
        this.shadowRoot?.querySelector<HTMLElement>('#remote-preauth-usb-task-title')
      this.focusWhenReady(focusTarget)
    }

    const usbPinFocusRequest = this.model.remote.usb.pairingApprovalPinFocusRequest()
    if (usbPinFocusRequest !== this.previousUsbPinFocusRequest) {
      this.previousUsbPinFocusRequest = usbPinFocusRequest
      this.focusWhenReady(this.shadowRoot?.querySelector<HTMLElement>('#remote-preauth-usb-pin'))
    }
  }

  private focusWhenReady(target: HTMLElement | null | undefined): void {
    if (!target) return
    const updateComplete = (target as HTMLElement & {updateComplete?: Promise<unknown>}).updateComplete
    if (updateComplete) {
      void updateComplete.then(() => {
        if (target.isConnected) target.focus({preventScroll: true})
      })
      return
    }
    target.focus({preventScroll: true})
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.model) return nothing
    void this.model.remote.usb.pairingApprovalPinFocusRequest()

    const screen = this.screen()
    if (screen === 'pair') return this.renderPairScreen()
    if (screen === 'usb') {
      return renderDesktopPreauthUsb(this.model, {
        onBack: this.model.onBackFromRemoteUsb,
        onPinInput: this.handleUsbPinInput,
        onPinSubmit: this.handleUsbPinSubmit,
        onPrimary: this.handleUsbPrimaryAction,
        onPairScanned: this.handleUsbPairScanned,
        onConnectHost: this.handleUsbConnectHost,
        onLoadPaired: this.handleUsbLoadPaired,
        onRemoveHost: this.handleUsbRemoveHost,
      })
    }
    if (screen === 'wait') return this.renderWaitScreen()
    return this.renderHostsScreen()
  }

  private screen(): DesktopPreauthScreen {
    if (!this.model) return 'hosts'
    const step = this.model.effectiveStep()
    const view = this.model.remote.view()
    if (step === 'remote-wait' || view === 'wait') return 'wait'
    if (step === 'remote-pair' || view === 'pair-ios') return 'pair'
    if (view === 'usb-mobile') return 'usb'
    return 'hosts'
  }

  private renderBackButton(label: string, onBack: () => void, disabled = false): TemplateResult {
    return html`
      <button class="back-button" type="button" ?disabled=${disabled} @click=${onBack}>
        ${renderBackIcon()}
        <span>${label}</span>
      </button>
    `
  }

  private renderHostsScreen(): TemplateResult {
    const model = this.model!
    const remote = model.remote
    const presentation = remote.desktopHostsPresentation()
    const usbSummary = presentation.usb
    const peers = presentation.networkPeers
    const initialLoading = !remote.peerListLoaded() && remote.loadingPeers()
    const operationBusy = remote.connectionOperationBusy()
    const actionErrorKind = remote.desktopActionErrorKind()
    const actionError = actionErrorKind ? remote.errorText() : null
    const networkActionError =
      actionErrorKind === 'connect' || actionErrorKind === 'remove' ? actionError : null
    const pageActionError = actionError && !networkActionError ? actionError : null

    return html`
      <main class="remote-preauth" data-remote-preauth-screen="hosts">
        <header class="screen-header">
          ${this.renderBackButton(
            model.isNeedInit() ? i18n('welcome:back-mode-selection') : i18n('remote:preauth-back-unlock'),
            model.onBackFromRemoteConnect,
            operationBusy,
          )}
          <div class="screen-copy">
            <h1 data-screen-heading tabindex="-1">${i18n('remote:preauth-title')}</h1>
            <p class="screen-description">${i18n('remote:preauth-description')}</p>
          </div>
        </header>

        ${pageActionError
          ? html`
              <div class="connection-error">
                <p class="form-error" role="alert">${actionErrorCopy(actionErrorKind)}</p>
                ${this.renderRawErrorDetails(pageActionError, 'connection')}
              </div>
            `
          : nothing}
        ${remote.statusText()
          ? html`<p class="inline-state" role="status" aria-live="polite">${remote.statusText()}</p>`
          : nothing}
        ${usbSummary.kind === 'checking'
          ? html`
              <section class="remote-section" aria-labelledby="remote-preauth-detected-title">
                <h2 id="remote-preauth-detected-title">${i18n('remote:preauth-detected-now')}</h2>
                <div class="inline-state" role="status" aria-live="polite" aria-atomic="true">
                  <span class="spinner" aria-hidden="true"></span>
                  <span>${i18n('remote:preauth-usb-scanning')}</span>
                </div>
              </section>
            `
          : usbSummary.kind === 'single'
            ? this.renderDetectedUsbPanel(usbSummary.device)
            : usbSummary.kind === 'multiple'
              ? this.renderMultipleUsbPanel(usbSummary.devices.length)
              : nothing}

        <section class="remote-section" aria-labelledby="remote-preauth-saved-title">
          <div class="section-heading">
            <div class="section-heading-copy">
              <h2 id="remote-preauth-saved-title">${i18n('remote:preauth-saved-title')}</h2>
            </div>
            <cv-button
              size="small"
              variant="ghost"
              ?disabled=${operationBusy || remote.loadingPeers()}
              .loading=${remote.loadingPeers() && remote.peerListLoaded()}
              @click=${this.handleRefreshPeers}
            >
              ${i18n('remote:preauth-saved-refresh')}
            </cv-button>
          </div>

          ${networkActionError
            ? html`
                <p class="form-error" role="alert">${actionErrorCopy(actionErrorKind)}</p>
                ${this.renderRawErrorDetails(networkActionError, 'network')}
              `
            : nothing}
          ${initialLoading
            ? html`
                <div class="inline-state" role="status" aria-live="polite" aria-atomic="true">
                  <span class="spinner" aria-hidden="true"></span>
                  <span>${i18n('remote:preauth-saved-loading')}</span>
                </div>
              `
            : nothing}
          ${remote.peerListError()
            ? html`
                <p class="inline-state" data-tone="danger" role="alert">
                  ${remote.peerListErrorKind() === 'initial'
                    ? i18n('remote:preauth-saved-load-error')
                    : i18n('remote:preauth-saved-stale-error')}
                </p>
              `
            : nothing}
          ${remote.peerListLoaded() && !remote.peerListError() && peers.length === 0
            ? html`
                <div class="empty-copy" data-network-empty>
                  <strong>${i18n('remote:preauth-saved-empty')}</strong>
                  <p>${i18n('remote:preauth-saved-empty-description')}</p>
                </div>
              `
            : nothing}
          ${peers.length > 0 ? this.renderNetworkPeers(peers) : nothing}
        </section>

        <section class="remote-section" aria-labelledby="remote-preauth-other-title">
          <h2 id="remote-preauth-other-title">${i18n('remote:preauth-other-ways')}</h2>
          <ul class="option-list">
            <li>
              <button
                class="option-button"
                type="button"
                ?disabled=${operationBusy}
                @click=${model.onOpenRemotePair}
              >
                <span class="option-copy">
                  <strong>${i18n('remote:preauth-pair-network')}</strong>
                  <span>${i18n('remote:preauth-pair-network-description')}</span>
                </span>
                ${renderChevronIcon()}
              </button>
            </li>
            ${usbSummary.kind === 'none'
              ? html`
                  <li>
                    <button
                      class="option-button"
                      type="button"
                      data-usb-other-way
                      ?disabled=${operationBusy}
                      @click=${model.onOpenRemoteUsb}
                    >
                      <span class="option-copy">
                        <strong>${i18n('remote:preauth-connect-android-usb')}</strong>
                        <span>${i18n('remote:preauth-connect-android-usb-description')}</span>
                      </span>
                      ${renderChevronIcon()}
                    </button>
                  </li>
                `
              : nothing}
          </ul>
        </section>
      </main>
    `
  }

  private renderDetectedUsbPanel(device: DesktopUsbDetectedDevicePresentation): TemplateResult {
    const pairedHostId = device.source.paired_match?.host_id ?? null
    const removing = pairedHostId === this.model!.remote.removingPeerId()
    const operationBusy = this.model!.remote.connectionOperationBusy()
    return html`
      <section class="remote-section" aria-labelledby="remote-preauth-detected-title">
        <h2 id="remote-preauth-detected-title">${i18n('remote:preauth-detected-now')}</h2>
        <div class="detected-panel" data-usb-summary="single">
          <div class="detected-copy">
            <h3><bdi dir="auto">${device.label}</bdi></h3>
            <p>${renderDeviceLabelCopy('remote:preauth-cable-detected', device.label)}</p>
          </div>
          <div class="device-actions">
            <cv-button variant="primary" ?disabled=${operationBusy} @click=${this.model!.onOpenRemoteUsb}>
              ${device.availability === 'available'
                ? i18n('remote:preauth-usb-continue')
                : i18n('remote:preauth-usb-review')}
            </cv-button>
            ${pairedHostId
              ? html`
                  <cv-button
                    variant="ghost"
                    data-forget-usb-host-id=${pairedHostId}
                    ?disabled=${operationBusy}
                    .loading=${removing}
                    @click=${this.handleForgetUsbHost}
                  >
                    ${i18n('remote:preauth-remove-confirm')}
                  </cv-button>
                `
              : nothing}
          </div>
        </div>
      </section>
    `
  }

  private renderMultipleUsbPanel(count: number): TemplateResult {
    return html`
      <section class="remote-section" aria-labelledby="remote-preauth-detected-title">
        <h2 id="remote-preauth-detected-title">${i18n('remote:preauth-detected-now')}</h2>
        <div class="detected-panel" data-usb-summary="multiple">
          <div class="detected-copy">
            <h3>${i18n('remote:preauth-usb-multiple-detected', {count: String(count)})}</h3>
            <p>${i18n('remote:preauth-connect-android-usb-description')}</p>
          </div>
          <cv-button
            variant="primary"
            ?disabled=${this.model!.remote.connectionOperationBusy()}
            @click=${this.model!.onOpenRemoteUsb}
          >
            ${i18n('remote:preauth-usb-choose')}
          </cv-button>
        </div>
      </section>
    `
  }

  private renderNetworkPeers(peers: DesktopNetworkPeerPresentation[]): TemplateResult {
    const remote = this.model!.remote
    const operationBusy = remote.connectionOperationBusy()

    return html`
      <ul class="device-list" data-network-peers>
        ${repeat(
          peers,
          ({source}) => source.peer_id,
          (peer) => {
            const {source} = peer
            const active = remote.activePeerId() === source.peer_id
            const removing = remote.removingPeerId() === source.peer_id
            const label = source.label || source.peer_id
            const connectLabel =
              peer.connectAction === 'wake_connect'
                ? i18n('remote:preauth-wake-connect')
                : i18n('remote:preauth-connect')

            return html`
              <li class="device-item" data-peer-id=${source.peer_id}>
                <div class="device-row">
                  <div class="device-main">
                    <div class="device-title-line">
                      <strong><bdi dir="auto">${label}</bdi></strong>
                      <span class="status-label" data-tone=${peerStatusTone(peer.status)}>
                        ${peerStatusCopy(peer.status)}
                      </span>
                    </div>
                    ${peer.lastSeenMs
                      ? html`<span class="row-meta">${formatLastSyncTime(peer.lastSeenMs)}</span>`
                      : nothing}
                  </div>
                  <div class="device-actions">
                    <cv-button
                      size="small"
                      variant="primary"
                      data-connect-peer-id=${source.peer_id}
                      ?disabled=${operationBusy}
                      .loading=${active}
                      @click=${this.handleConnectPeer}
                    >
                      ${active ? i18n('welcome:connecting') : connectLabel}
                    </cv-button>
                    <cv-button
                      size="small"
                      variant="ghost"
                      data-remove-peer-id=${source.peer_id}
                      ?disabled=${operationBusy}
                      .loading=${removing}
                      @click=${this.handleRemovePeer}
                    >
                      ${i18n('remote:preauth-remove-confirm')}
                    </cv-button>
                  </div>
                </div>
                ${this.renderNetworkDetails(source, peer)}
              </li>
            `
          },
        )}
      </ul>
    `
  }

  private renderNetworkDetails(
    peer: NetworkPairedPeer,
    presentation: DesktopNetworkPeerPresentation,
  ): TemplateResult {
    const label = peer.label || peer.peer_id

    return html`
      <cv-disclosure class="technical-details" data-peer-details=${peer.peer_id}>
        <span slot="trigger" class="details-trigger">
          <strong>${i18n('remote:preauth-details')}</strong>
          <small>${i18n('remote:preauth-details-summary')}</small>
        </span>
        <dl class="detail-list">
          <div>
            <dt>${i18n('remote:preauth-detail-phone')}</dt>
            <dd><bdi dir="auto">${label}</bdi></dd>
          </div>
          <div>
            <dt>${i18n('remote:preauth-detail-status')}</dt>
            <dd>
              ${peerStatusCopy(presentation.status)}${presentation.lastSeenMs
                ? ` · ${new Date(presentation.lastSeenMs).toLocaleString()}`
                : ''}
            </dd>
          </div>
          <div>
            <dt>${i18n('remote:preauth-detail-transport')}</dt>
            <dd>${i18n('remote:transport-wss-relay')} · <code dir="ltr">${peer.relay_url}</code></dd>
          </div>
          <div>
            <dt>${i18n('remote:preauth-detail-peer-id')}</dt>
            <dd><code dir="ltr">${peer.peer_id}</code></dd>
          </div>
        </dl>
      </cv-disclosure>
    `
  }

  private renderRawErrorDetails(error: string, context: 'connection' | 'network' | 'pair'): TemplateResult {
    return html`
      <cv-disclosure class="technical-details" data-error-context=${context}>
        <span slot="trigger" class="details-trigger">
          <strong>${i18n('remote:preauth-details')}</strong>
          <small>${i18n('remote:preauth-details-summary')}</small>
        </span>
        <dl class="detail-list">
          <div>
            <dt>${i18n('status:error')}</dt>
            <dd><code dir="ltr">${error}</code></dd>
          </div>
        </dl>
      </cv-disclosure>
    `
  }

  private renderPairScreen(): TemplateResult {
    const model = this.model!
    const pairing = model.remote.desktopPairing
    const busy = model.remote.connectionOperationBusy()
    const offerError = pairing.offerError()
    const pinError = pairing.pinError()

    return html`
      <main class="remote-preauth" data-remote-preauth-screen="pair">
        <header class="screen-header">
          ${this.renderBackButton(i18n('remote:preauth-back-phones'), model.onBackFromRemotePair, busy)}
          <div class="screen-copy">
            <h1 data-screen-heading tabindex="-1">${i18n('remote:preauth-pair-network')}</h1>
            <p class="screen-description">${i18n('remote:preauth-pair-description')}</p>
          </div>
        </header>

        <div class="pair-layout">
          <ol class="pair-steps">
            <li>${i18n('remote:preauth-pair-step-open')}</li>
            <li>${i18n('remote:preauth-pair-step-link')}</li>
            <li>${i18n('remote:preauth-pair-step-pin')}</li>
          </ol>

          <form class="pair-form" @submit=${this.handlePairSubmit} novalidate>
            <div class="form-grid">
              <cv-field class="span-all" required ?invalid=${Boolean(offerError)}>
                <span slot="label">${i18n('remote:preauth-pairing-link')}</span>
                <cv-textarea
                  id="remote-preauth-pair-link"
                  name="pairing-link"
                  dir="ltr"
                  enter-behavior="submit"
                  autocomplete="off"
                  .value=${pairing.offerInput()}
                  @cv-input=${model.remote.handleOfferInput}
                ></cv-textarea>
                ${offerError ? html`<span slot="error">${offerError}</span>` : nothing}
              </cv-field>

              <cv-field required ?invalid=${Boolean(pinError)}>
                <span slot="label">${i18n('remote:preauth-pairing-pin')}</span>
                <cv-input
                  id="remote-preauth-pair-pin"
                  name="pairing-pin"
                  type="text"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  maxlength="6"
                  dir="ltr"
                  .value=${pairing.pinInput()}
                  @cv-input=${model.remote.handlePinInput}
                ></cv-input>
                ${pinError ? html`<span slot="error">${pinError}</span>` : nothing}
              </cv-field>

              <cv-field>
                <span slot="label">${i18n('remote:preauth-computer-name')}</span>
                <cv-input
                  id="remote-preauth-computer-name"
                  name="computer-name"
                  type="text"
                  autocomplete="off"
                  placeholder=${i18n('remote:preauth-computer-name-placeholder')}
                  .value=${pairing.deviceLabel()}
                  @cv-input=${model.remote.handleDeviceLabelInput}
                ></cv-input>
              </cv-field>
            </div>

            ${pairing.backendError()
              ? html`
                  <p class="form-error" role="alert">${i18n('remote:preauth-pair-error')}</p>
                  ${this.renderRawErrorDetails(pairing.backendError()!, 'pair')}
                `
              : nothing}

            <div class="form-actions">
              <cv-button type="submit" variant="primary" ?disabled=${busy} .loading=${busy}>
                ${busy ? i18n('remote:preauth-pairing-phone') : i18n('remote:preauth-pair-phone')}
              </cv-button>
            </div>
          </form>
        </div>
      </main>
    `
  }

  private renderWaitScreen(): TemplateResult {
    const model = this.model!
    const remote = model.remote
    const label = remote.connectedPeerLabel()
    const phoneApproval = model.remoteWaitReason() === 'phone_approval'
    const waitActionErrorKind = remote.desktopActionErrorKind()
    const waitActionError = waitActionErrorKind ? remote.errorText() : null
    const operationBusy = remote.connectionOperationBusy()

    return html`
      <main class="remote-preauth" data-remote-preauth-screen="wait">
        <section class="wait-task" aria-labelledby="remote-preauth-wait-title">
          <span class="wait-eyebrow">
            ${phoneApproval ? i18n('remote:preauth-wait-tap-allow') : i18n('remote:preauth-wait-open-vault')}
          </span>
          <h1 id="remote-preauth-wait-title" data-screen-heading tabindex="-1">
            ${phoneApproval
              ? i18n('remote:preauth-wait-approval-title')
              : i18n('remote:preauth-wait-unlock-title')}
          </h1>
          <p class="screen-description">
            ${phoneApproval
              ? renderDeviceLabelCopy('remote:preauth-wait-approval-description', label)
              : renderDeviceLabelCopy('remote:preauth-wait-unlock-description', label)}
          </p>
          <div class="inline-state" role="status" aria-live="polite" aria-atomic="true">
            <span class="spinner" aria-hidden="true"></span>
            <span>${i18n('remote:preauth-usb-wait')}</span>
          </div>
          ${waitActionError
            ? html` <p class="form-error" role="alert">${actionErrorCopy(waitActionErrorKind)}</p> `
            : nothing}
          <div class="wait-actions">
            <cv-button
              variant="ghost"
              ?disabled=${operationBusy}
              .loading=${operationBusy}
              @click=${model.onBackFromRemoteWait}
            >
              ${i18n('remote:preauth-wait-disconnect')}
            </cv-button>
          </div>
        </section>
        ${this.renderWaitTechnicalDetails(waitActionError)}
      </main>
    `
  }

  private renderWaitTechnicalDetails(rawError: string | null): TemplateResult {
    const remote = this.model!.remote
    const host = remote.transportConnectedHost()
    const id = remote.transportConnectedPeerId()

    return html`
      <cv-disclosure class="technical-details">
        <span slot="trigger" class="details-trigger">
          <strong>${i18n('remote:preauth-details')}</strong>
          <small>${i18n('remote:preauth-details-summary')}</small>
        </span>
        <dl class="detail-list">
          <div>
            <dt>${i18n('remote:preauth-detail-phone')}</dt>
            <dd><bdi dir="auto">${remote.connectedPeerLabel()}</bdi></dd>
          </div>
          <div>
            <dt>${i18n('remote:preauth-detail-status')}</dt>
            <dd dir="ltr">${this.model!.remoteWaitReason()}</dd>
          </div>
          <div>
            <dt>${i18n('remote:preauth-detail-transport')}</dt>
            <dd dir="ltr">
              ${host?.type === 'mobile_usb'
                ? i18n('remote:transport-usb-mobile')
                : i18n('remote:transport-wss-relay')}
            </dd>
          </div>
          ${id
            ? html`
                <div>
                  <dt>${i18n('remote:preauth-detail-peer-id')}</dt>
                  <dd><code dir="ltr">${id}</code></dd>
                </div>
              `
            : nothing}
          ${rawError
            ? html`
                <div>
                  <dt>${i18n('status:error')}</dt>
                  <dd><code dir="ltr">${rawError}</code></dd>
                </div>
              `
            : nothing}
        </dl>
      </cv-disclosure>
    `
  }

  private handleRefreshPeers(): void {
    void this.model?.remote.loadPeers('manual')
  }

  private handleConnectPeer(event: Event): void {
    const peerId = (event.currentTarget as HTMLElement).dataset['connectPeerId']
    if (peerId) this.model?.onConnectRemotePeer(peerId)
  }

  private handleRemovePeer(event: Event): void {
    const peerId = (event.currentTarget as HTMLElement).dataset['removePeerId']
    const peer = this.model?.remote.peers().find((item) => item.peer_id === peerId)
    if (peer) this.model?.onRemoveRemotePeer(peer)
  }

  private handleForgetUsbHost(event: Event): void {
    const hostId = (event.currentTarget as HTMLElement).dataset['forgetUsbHostId']
    if (hostId) void this.model?.remote.removeUsbPairedHost(hostId)
  }

  private async handlePairSubmit(event: Event): Promise<void> {
    event.preventDefault()
    const result = await this.model?.submitRemotePairForDesktop()
    if (result?.status !== 'validation_error') return

    await this.updateComplete
    const targetId =
      result.firstInvalid === 'offer' ? '#remote-preauth-pair-link' : '#remote-preauth-pair-pin'
    this.shadowRoot?.querySelector<HTMLElement>(targetId)?.focus()
  }

  private handleUsbPinInput(event: Event): void {
    const customEvent = event as CustomEvent<{value?: string}>
    const target = event.target as {value?: string} | null
    this.model?.remote.usb.setPairingApprovalPin(customEvent.detail?.value ?? target?.value ?? '')
  }

  private async handleUsbPinSubmit(event: Event): Promise<void> {
    event.preventDefault()
    await this.model?.remote.confirmUsbPairing()
  }

  private handleUsbPrimaryAction(): void {
    void this.model?.remote.dispatchDesktopUsbAction()
  }

  private handleUsbPairScanned(event: Event): void {
    const rawIndex = (event.currentTarget as HTMLElement).dataset['usbPairIndex']
    const index = Number(rawIndex)
    const host = this.model?.remote.usb.scannedHostViews()[index]
    if (host) void this.model?.remote.pairUsbScannedHost(host.source)
  }

  private handleUsbConnectHost(event: Event): void {
    const hostId = (event.currentTarget as HTMLElement).dataset['usbConnectHostId']
    if (hostId) void this.model?.remote.connectUsbPairedHost(hostId)
  }

  private handleUsbLoadPaired(): void {
    void this.model?.remote.loadUsbPairedHosts()
  }

  private handleUsbRemoveHost(event: Event): void {
    const hostId = (event.currentTarget as HTMLElement).dataset['usbRemoveHostId']
    if (hostId) void this.model?.remote.removeUsbPairedHost(hostId)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'remote-desktop-preauth': RemoteDesktopPreauth
  }
}
