import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVCallout} from '@chromvoid/uikit/components/cv-callout'
import {CVDialog} from '@chromvoid/uikit/components/cv-dialog'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing, type TemplateResult} from 'lit'

import {i18n} from 'root/i18n'
import type {
  MobileUsbHostPairingApprovalView,
  MobileUsbHostSessionApprovalView,
} from 'root/routes/remote/remote.model'
import {mobileUsbHostApprovalModel} from './mobile-usb-host-approval.model'

export class MobileUsbHostApproval extends ReatomLitElement {
  static elementName = 'mobile-usb-host-approval'

  static styles = css`
    :host {
      display: contents;
    }

    cv-dialog {
      --cv-dialog-width: min(100%, 440px);
      --cv-dialog-border-radius: var(--cv-radius-2, 8px);
      --cv-dialog-overlay-color: var(--cv-color-overlay);
    }

    cv-dialog::part(overlay) {
      backdrop-filter: blur(12px);
    }

    cv-dialog::part(content) {
      padding: 0;
      border-color: var(--cv-color-border-muted);
      box-shadow: var(--cv-shadow-xl);
    }

    .sheet {
      box-sizing: border-box;
      display: grid;
      gap: var(--app-spacing-4, 16px);
      inline-size: 100%;
      padding: var(--app-spacing-5, 20px);
      color: var(--cv-color-text);
    }

    .header {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      gap: var(--app-spacing-3, 12px);
    }

    .header-icon {
      display: grid;
      place-items: center;
      inline-size: 40px;
      block-size: 40px;
      border-radius: var(--cv-radius-2, 8px);
      background: var(--cv-color-primary-surface);
      color: var(--cv-color-primary);
    }

    .header-icon cv-icon {
      inline-size: 22px;
      block-size: 22px;
    }

    h2,
    p {
      margin: 0;
    }

    h2 {
      font-size: 1.125rem;
      font-weight: var(--cv-font-weight-bold, 700);
      line-height: 1.2;
      letter-spacing: 0;
    }

    .subtitle {
      margin-block-start: var(--app-spacing-1, 4px);
      color: var(--cv-color-text-muted);
      font-size: 0.9375rem;
      line-height: 1.45;
    }

    .pin-display {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: var(--app-spacing-2, 8px);
      inline-size: min(100%, 320px);
      margin-inline: auto;
    }

    .pin-digit {
      display: grid;
      place-items: center;
      min-inline-size: 0;
      block-size: 52px;
      border: 1px solid var(--cv-color-primary-border);
      border-radius: var(--cv-radius-2, 8px);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      font-family: var(--cv-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
      font-size: 1.5rem;
      font-weight: var(--cv-font-weight-bold, 700);
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    .meta {
      display: grid;
      gap: var(--app-spacing-2, 8px);
      padding: var(--app-spacing-3, 12px);
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-2, 8px);
      background: var(--cv-color-surface);
    }

    .meta-row {
      display: grid;
      gap: 2px;
      min-inline-size: 0;
    }

    .meta-label {
      color: var(--cv-color-text-muted);
      font-size: 0.75rem;
      line-height: 1.2;
    }

    .meta-value {
      min-inline-size: 0;
      color: var(--cv-color-text);
      font-size: 0.875rem;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }

    code.meta-value {
      font-family: var(--cv-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
      font-size: 0.8125rem;
    }

    cv-callout {
      --cv-callout-compact-border-radius: var(--cv-radius-2, 8px);
    }

    .actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--app-spacing-3, 12px);
    }

    .actions cv-button::part(base) {
      inline-size: 100%;
      min-block-size: 44px;
    }

    @media (width <= 520px) {
      cv-dialog {
        --cv-dialog-padding-block: var(--app-spacing-3, 12px);
        --cv-dialog-padding-inline: var(--app-spacing-3, 12px);
      }

      cv-dialog::part(overlay) {
        place-items: end stretch;
      }

      .sheet {
        inline-size: 100%;
        padding: var(--app-spacing-4, 16px);
      }

      .pin-digit {
        block-size: 48px;
        font-size: 1.375rem;
      }
    }
  `

  private readonly model = mobileUsbHostApprovalModel

  static define() {
    CVButton.define()
    CVCallout.define()
    CVDialog.define()
    CVIcon.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.model.connect()
  }

  disconnectedCallback(): void {
    this.model.disconnect()
    super.disconnectedCallback()
  }

  private renderPin(pin: string): TemplateResult {
    return html`
      <div class="pin-display" dir="ltr" aria-label=${`Pairing PIN ${pin}`}>
        ${pin.split('').map((digit) => html`<span class="pin-digit">${digit}</span>`)}
      </div>
    `
  }

  private renderError(): TemplateResult | typeof nothing {
    const error = this.model.errorText()
    if (!error) return nothing
    return html`<cv-callout variant="danger" density="compact" role="alert">${error}</cv-callout>`
  }

  private renderMeta(label: string, value: string, code = false): TemplateResult {
    const valueContent = code
      ? html`<code class="meta-value" dir="ltr">${value}</code>`
      : html`<span class="meta-value"><bdi dir="auto">${value}</bdi></span>`

    return html`
      <div class="meta-row">
        <span class="meta-label">${label}</span>
        ${valueContent}
      </div>
    `
  }

  private renderApprovalDialog(title: string, description: string, content: TemplateResult): TemplateResult {
    return html`
      <cv-dialog
        open
        modal
        always-on-top
        type="alertdialog"
        no-header
        .closeOnEscape=${false}
        .closeOnOutsidePointer=${false}
        .closeOnOutsideFocus=${false}
      >
        <span slot="title">${title}</span>
        <span slot="description">${description}</span>
        ${content}
      </cv-dialog>
    `
  }

  private renderPairingApproval(approval: MobileUsbHostPairingApprovalView): TemplateResult {
    const busy = this.model.busy()
    const approved = approval.decision === 'approved'
    const description = approved
      ? 'This pairing request is approved on this phone.'
      : 'Use this PIN to verify the desktop request, then allow the pairing.'

    return this.renderApprovalDialog(
      'USB pairing request',
      description,
      html`
        <div class="sheet">
          <header class="header">
            <span class="header-icon" aria-hidden="true"><cv-icon name="usb"></cv-icon></span>
            <div>
              <h2>USB pairing request</h2>
              <p class="subtitle">${description}</p>
            </div>
          </header>

          ${this.renderPin(approval.approval_pin)}
          ${approved
            ? html`
                <cv-callout variant="success" density="compact" role="status">
                  Approved. Enter this PIN on the desktop to finish pairing.
                </cv-callout>
              `
            : nothing}

          <div class="meta">
            ${this.renderMeta('Desktop peer', approval.peer_label || 'Unknown desktop')}
            ${this.renderMeta('Peer fingerprint', approval.peer_fingerprint || 'Unavailable', true)}
            ${this.renderMeta('PIN attempts left', String(approval.attempts_left), true)}
          </div>

          ${this.renderError()}

          <div class="actions">
            <cv-button variant="default" ?disabled=${busy} @click=${this.handleRejectPairing}>
              ${i18n('button:deny')}
            </cv-button>
            <cv-button
              variant="primary"
              ?disabled=${busy || approved}
              .loading=${busy && !approved}
              @click=${this.handleApprovePairing}
            >
              ${approved ? 'Allowed' : i18n('button:allow')}
            </cv-button>
          </div>
        </div>
      `,
    )
  }

  private renderSessionApproval(approval: MobileUsbHostSessionApprovalView): TemplateResult {
    const busy = this.model.busy()
    const description = 'A paired desktop is requesting a remote session with this phone.'

    return this.renderApprovalDialog(
      'USB session request',
      description,
      html`
        <div class="sheet">
          <header class="header">
            <span class="header-icon" aria-hidden="true"><cv-icon name="shield-check"></cv-icon></span>
            <div>
              <h2>USB session request</h2>
              <p class="subtitle">${description}</p>
            </div>
          </header>

          <div class="meta">
            ${this.renderMeta('Desktop peer', approval.peer_label || approval.peer_id)}
            ${this.renderMeta('Peer ID', approval.peer_id, true)}
            ${this.renderMeta('Transport', approval.transport_type, true)}
          </div>

          ${this.renderError()}

          <div class="actions">
            <cv-button variant="default" ?disabled=${busy} @click=${this.handleRejectSession}>
              ${i18n('button:deny')}
            </cv-button>
            <cv-button
              variant="primary"
              ?disabled=${busy}
              .loading=${busy}
              @click=${this.handleApproveSession}
            >
              ${i18n('button:allow')}
            </cv-button>
          </div>
        </div>
      `,
    )
  }

  private handleApprovePairing(): void {
    void this.model.approvePairing()
  }

  private handleRejectPairing(): void {
    void this.model.rejectPairing()
  }

  private handleApproveSession(): void {
    void this.model.approveSession()
  }

  private handleRejectSession(): void {
    void this.model.rejectSession()
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this.model.visible()) return nothing

    const pairingApproval = this.model.pairingApproval()
    if (pairingApproval) return this.renderPairingApproval(pairingApproval)

    const sessionApproval = this.model.sessionApproval()
    if (sessionApproval) return this.renderSessionApproval(sessionApproval)

    return nothing
  }
}
