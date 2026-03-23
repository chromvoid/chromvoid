import {XLitElement} from '@statx/lit'
import {css, html, nothing} from 'lit'

import {NetworkPairModel, type NetworkPairPhase} from './network-pair.model'
import {navigationModel} from 'root/app/navigation/navigation.model'

export class NetworkPairPage extends XLitElement {
  static define() {
    if (!customElements.get('network-pair-page')) {
      customElements.define('network-pair-page', this)
    }
  }

  static properties = {
    hideBackLink: {type: Boolean, attribute: 'hide-back-link'},
  }

  declare hideBackLink: boolean

  static styles = [
    css`
      :host {
        display: block;
        contain: content;
        padding: 24px;
        max-width: 640px;
        margin: 0 auto;
      }

      .header {
        margin-block-end: 32px;
      }

      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: none;
        border: none;
        color: var(--cv-color-text-secondary, #888);
        cursor: pointer;
        font: inherit;
        padding: 0;
        margin-block-end: 16px;
      }

      .back-link:hover {
        color: var(--cv-color-text-primary, #fff);
      }

      .title {
        margin: 0;
        font-size: 1.75rem;
        font-weight: 650;
        color: var(--cv-color-text-primary, #fff);
      }

      .subtitle {
        margin: 8px 0 0;
        color: var(--cv-color-text-secondary, #888);
        font-size: 0.925rem;
      }

      .card {
        background:
          linear-gradient(180deg, color-mix(in oklch, var(--cv-color-surface-2) 98%, transparent), color-mix(in oklch, var(--cv-color-surface) 98%, transparent)),
          var(--cv-color-surface, #15181d);
        border: 1px solid var(--cv-alpha-white-8);
        border-radius: 18px;
        padding: 24px;
        box-shadow: 0 22px 48px var(--cv-alpha-black-25);
      }

      .stack {
        display: grid;
        gap: 16px;
      }

      .intro {
        color: var(--cv-color-text-secondary, #9aa2af);
        line-height: 1.5;
      }

      .field {
        display: grid;
        gap: 8px;
      }

      .field-label {
        font-size: 0.8125rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--cv-color-text-secondary, #8b93a0);
      }

      .field-input,
      .field-textarea {
        width: 100%;
        border-radius: 12px;
        border: 1px solid var(--cv-alpha-white-10);
        background: var(--cv-alpha-white-4);
        color: var(--cv-color-text-primary, #fff);
        font: inherit;
        box-sizing: border-box;
      }

      .field-input {
        min-height: 46px;
        padding: 0 14px;
      }

      .field-textarea {
        min-height: 132px;
        padding: 14px;
        resize: vertical;
      }

      .field-input:focus,
      .field-textarea:focus {
        outline: 1px solid color-mix(in oklch, var(--cv-color-primary) 80%, transparent);
        border-color: color-mix(in oklch, var(--cv-color-primary) 80%, transparent);
      }

      .pin-panel {
        display: grid;
        gap: 10px;
        padding: 18px;
        border-radius: 16px;
        background: var(--cv-alpha-white-4);
        text-align: center;
      }

      .pin-value {
        font-size: 2.6rem;
        font-weight: 700;
        letter-spacing: 0.28em;
        font-variant-numeric: tabular-nums;
        color: var(--cv-color-text-primary, #fff);
      }

      .status-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        width: fit-content;
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 0.8125rem;
        background: color-mix(in oklch, var(--cv-color-primary) 12%, transparent);
        color: var(--cv-color-primary);
      }

      .status-chip.success {
        background: color-mix(in oklch, var(--cv-color-success) 14%, transparent);
        color: var(--cv-color-success);
      }

      .status-chip.error {
        background: color-mix(in oklch, var(--cv-color-danger) 14%, transparent);
        color: var(--cv-color-danger);
      }

      .mono {
        font-family: 'SF Mono', 'IBM Plex Mono', ui-monospace, monospace;
      }

      .error-text {
        color: var(--cv-color-danger, #ff9e9e);
        line-height: 1.5;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      .btn {
        min-height: 44px;
        padding: 0 18px;
        border-radius: 12px;
        border: 1px solid var(--cv-alpha-white-10);
        background: var(--cv-alpha-white-5);
        color: var(--cv-color-text-primary, #fff);
        font: inherit;
        cursor: pointer;
      }

      .btn:hover {
        background: var(--cv-alpha-white-10);
      }

      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .btn-primary {
        background: linear-gradient(135deg, var(--cv-color-primary-dark), var(--cv-color-primary));
        border-color: transparent;
        color: var(--cv-color-on-primary);
        font-weight: 650;
      }

      .btn-primary:hover {
        background: linear-gradient(135deg, var(--cv-color-primary), var(--cv-color-primary));
      }
    `,
  ]

  private readonly model = new NetworkPairModel()

  constructor() {
    super()
    this.hideBackLink = false
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.model.initialize()
  }

  disconnectedCallback(): void {
    this.model.dispose()
    super.disconnectedCallback()
  }

  private handleBack() {
    navigationModel.goBack()
  }

  private handleStart() {
    void this.model.startPairing()
  }

  private handleCancel() {
    void this.model.cancelPairing()
  }

  private handleRetry() {
    void this.model.startPairing()
  }

  private handleRefreshPresence() {
    void this.model.refreshPresence()
  }

  private handleOfferInput(event: Event) {
    this.model.setOfferInput((event.target as HTMLTextAreaElement).value)
  }

  private handlePinInput(event: Event) {
    this.model.setPinInput((event.target as HTMLInputElement).value)
  }

  private handleDeviceLabelInput(event: Event) {
    this.model.setDeviceLabel((event.target as HTMLInputElement).value)
  }

  private renderDesktopState(phase: NetworkPairPhase) {
    const error = this.model.error()
    return html`
      <div class="card stack">
        <div class="intro">
          Paste the iPhone pairing offer, enter the 6-digit PIN shown on iPhone, and this desktop will
          store the paired iOS host for remote mode.
        </div>
        <label class="field">
          <span class="field-label">Desktop Label</span>
          <input
            class="field-input"
            .value=${this.model.currentDeviceLabel()}
            @input=${this.handleDeviceLabelInput}
            placeholder="ChromVoid Desktop"
          />
        </label>
        <label class="field">
          <span class="field-label">Pairing Offer</span>
          <textarea
            class="field-textarea mono"
            .value=${this.model.offerInput()}
            @input=${this.handleOfferInput}
            placeholder="chromvoid://pair-ios?..."
          ></textarea>
        </label>
        <label class="field">
          <span class="field-label">PIN</span>
          <input
            class="field-input mono"
            .value=${this.model.pinInput()}
            @input=${this.handlePinInput}
            inputmode="numeric"
            placeholder="123456"
          />
        </label>
        ${error ? html`<div class="error-text">${error}</div>` : nothing}
        ${phase === 'success'
          ? html`<div class="status-chip success">Paired with iPhone</div>`
          : nothing}
        <div class="actions">
          <button class="btn btn-primary" @click=${this.handleStart} ?disabled=${phase === 'connecting'}>
            ${phase === 'connecting' ? 'Pairing...' : 'Pair with iPhone'}
          </button>
          ${phase === 'success'
            ? html`<button class="btn" @click=${this.handleBack}>Done</button>`
            : nothing}
          ${phase === 'failed'
            ? html`<button class="btn" @click=${this.handleCancel}>Reset</button>`
            : nothing}
        </div>
      </div>
    `
  }

  private renderIosState(phase: NetworkPairPhase) {
    const hostStatus = this.model.hostStatus()
    const offerText = this.model.offerText()
    const presence = hostStatus?.presence
    const error = this.model.error()

    return html`
      <div class="card stack">
        <div class="intro">
          Start iPhone host mode, share the offer with your desktop, then keep this screen available until
          pairing completes. After pairing, desktop will connect through the relay using this iPhone as the
          remote host.
        </div>
        <label class="field">
          <span class="field-label">iPhone Label</span>
          <input
            class="field-input"
            .value=${this.model.currentDeviceLabel()}
            @input=${this.handleDeviceLabelInput}
            placeholder="ChromVoid iPhone"
          />
        </label>
        ${phase === 'waiting' || phase === 'success'
          ? html`
              <div class="pin-panel">
                <div class="field-label">PIN for Desktop</div>
                <div class="pin-value mono">${this.model.pairingPin()}</div>
                <div class="status-chip ${phase === 'success' ? 'success' : ''}">
                  ${phase === 'success' ? 'Host Ready' : 'Waiting For Desktop'}
                </div>
              </div>
              <label class="field">
                <span class="field-label">Pairing Offer</span>
                <textarea class="field-textarea mono" readonly .value=${offerText}></textarea>
              </label>
            `
          : nothing}
        ${presence
          ? html`
              <div class="field">
                <span class="field-label">Presence</span>
                <div class="status-chip success mono">${presence.status} · ${presence.room_id.slice(0, 12)}...</div>
              </div>
            `
          : nothing}
        ${hostStatus?.paired_peer_id
          ? html`
              <div class="field">
                <span class="field-label">Paired Desktop</span>
                <div class="mono">${hostStatus.paired_peer_id}</div>
              </div>
            `
          : nothing}
        ${error ? html`<div class="error-text">${error}</div>` : nothing}
        <div class="actions">
          ${phase === 'idle' || phase === 'failed'
            ? html`
                <button class="btn btn-primary" @click=${this.handleStart}>Start iPhone Host</button>
              `
            : nothing}
          ${phase === 'success'
            ? html`<button class="btn btn-primary" @click=${this.handleRefreshPresence}>Refresh Presence</button>`
            : nothing}
          ${phase !== 'idle'
            ? html`<button class="btn" @click=${this.handleCancel}>Stop</button>`
            : nothing}
        </div>
      </div>
    `
  }

  protected render() {
    const phase = this.model.phase()
    const isIosRuntime = this.model.isIosRuntime()

    return html`
      <div class="page">
        <header class="header">
          ${this.hideBackLink
            ? nothing
            : html`<button class="back-link" @click=${this.handleBack}>
                <cv-icon name="arrow-left"></cv-icon>
                Back
              </button>`}
          <h1 class="title">${isIosRuntime ? 'iPhone Host Pairing' : 'Pair iPhone Host'}</h1>
          <p class="subtitle">
            ${isIosRuntime ? 'Create an iPhone host session for desktop remote mode' : 'Add an iPhone as a remote ChromVoid host'}
          </p>
        </header>
        ${isIosRuntime ? this.renderIosState(phase) : this.renderDesktopState(phase)}
      </div>
    `
  }
}

NetworkPairPage.define()
