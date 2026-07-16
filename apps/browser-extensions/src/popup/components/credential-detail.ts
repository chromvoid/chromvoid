import type {CredentialCandidate} from '@chromvoid/scheme'
import {ReatomLitElement, html} from '@chromvoid/uikit/reatom-lit'
import {css} from 'lit'

import type {PopupActionKind} from '../popup.model'
import {i18n} from '../i18n'
import {autofillOtpOptions, otpDisplayLabel} from '../otp-selection'

export class CredentialDetail extends ReatomLitElement {
  static elementName = 'credential-detail'

  static get properties() {
    return {
      candidate: {attribute: false},
      currentSite: {type: Boolean, attribute: 'current-site'},
      selectedOtpId: {type: String, attribute: 'selected-otp-id'},
      pending: {type: Boolean},
    }
  }

  declare candidate: CredentialCandidate
  declare currentSite: boolean
  declare selectedOtpId?: string
  declare pending: boolean

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  static styles = css`
    :host {
      display: block;
    }

    .detail {
      padding: var(--cv-space-4);
    }

    .heading {
      margin: 0;
      color: var(--cv-color-text-strong);
      font-size: 20px;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .site-state {
      display: inline-flex;
      margin-block-start: var(--cv-space-2);
      color: var(--cv-color-text-muted);
      font-size: 11px;
      font-weight: 650;
    }

    .site-state.current {
      color: var(--cv-color-success-text);
    }

    dl {
      display: grid;
      gap: var(--cv-space-3);
      margin: var(--cv-space-5) 0;
    }

    .field {
      min-inline-size: 0;
    }

    dt {
      color: var(--cv-color-text-subtle);
      font-size: 10px;
      font-weight: 750;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    dd {
      margin: 4px 0 0;
      color: var(--cv-color-text);
      font-size: 13px;
      overflow-wrap: anywhere;
    }

    .otp-field {
      display: grid;
      gap: var(--cv-space-2);
    }

    select {
      min-block-size: 38px;
      inline-size: 100%;
      padding-inline: var(--cv-space-3);
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-sm);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      font: inherit;
    }

    select:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--cv-color-focus);
      outline-offset: 2px;
    }

    .actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--cv-space-2);
    }

    button {
      min-block-size: 40px;
      padding: var(--cv-space-2) var(--cv-space-3);
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-sm);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition:
        background-color var(--cv-duration-fast) var(--cv-easing-standard),
        border-color var(--cv-duration-fast) var(--cv-easing-standard);
    }

    button.primary {
      border-color: var(--cv-color-primary-border);
      background: var(--cv-color-primary-surface-strong);
    }

    button:hover:not(:disabled) {
      border-color: var(--cv-color-border-strong);
      background: var(--cv-color-surface-3);
    }

    button:disabled,
    select:disabled {
      cursor: wait;
      opacity: 0.58;
    }

    .security-note {
      margin: var(--cv-space-4) 0 0;
      padding: var(--cv-space-3);
      border-inline-start: 2px solid var(--cv-color-warning-border-strong);
      background: var(--cv-color-warning-surface);
      color: var(--cv-color-text-muted);
      font-size: 11px;
      line-height: 1.45;
    }

    @media (prefers-reduced-motion: reduce) {
      button {
        transition-duration: 0ms;
      }
    }
  `

  private dispatchAction(kind: PopupActionKind, otpId = this.selectedOtpId) {
    this.dispatchEvent(
      new CustomEvent('credential-action', {
        detail: {kind, candidate: this.candidate, otpId},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleCopyUsername() {
    this.dispatchAction('copy_username')
  }

  private handleOpenSite() {
    this.dispatchAction('open_site')
  }

  private handleFillPassword() {
    this.dispatchAction('fill_password')
  }

  private handleCopyPassword() {
    this.dispatchAction('copy_password')
  }

  private handleFillOtp() {
    this.dispatchAction('fill_otp')
  }

  private handleCopyOtp() {
    this.dispatchAction('copy_otp')
  }

  private handleOtpChange(event: Event) {
    const select = event.currentTarget as HTMLSelectElement
    this.dispatchEvent(
      new CustomEvent('credential-otp-change', {
        detail: {otpId: select.value},
        bubbles: true,
        composed: true,
      }),
    )
  }

  protected override render() {
    const candidate = this.candidate
    if (!candidate) {
      return html``
    }
    const otpOptions = autofillOtpOptions(candidate.otp_options ?? [])
    return html`
      <section class="detail" aria-labelledby="credential-detail-title">
        <h2 class="heading" id="credential-detail-title">${candidate.label || candidate.credential_id}</h2>
        <span class=${`site-state ${this.currentSite ? 'current' : ''}`}>
          ${this.currentSite ? i18n('credential.currentSite') : i18n('credential.otherSite')}
        </span>
        <dl>
          <div class="field">
            <dt>${i18n('credential.username')}</dt>
            <dd>${candidate.username}</dd>
          </div>
          <div class="field">
            <dt>${i18n('credential.savedDomain')}</dt>
            <dd>${candidate.domain ?? i18n('credential.unknownDomain')}</dd>
          </div>
          ${this.currentSite && otpOptions.length
            ? html`<div class="field otp-field">
                <dt>${i18n('credential.oneTimeCode')}</dt>
                <dd>
                  <select
                    aria-label=${i18n('credential.oneTimeCode')}
                    .value=${this.selectedOtpId ?? ''}
                    @change=${this.handleOtpChange}
                    ?disabled=${this.pending}
                  >
                    ${otpOptions.map(
                      (otp, index) => html`<option value=${otp.id}>${otpDisplayLabel(otp, index)}</option>`,
                    )}
                  </select>
                </dd>
              </div>`
            : null}
        </dl>
        <div class="actions">
          <button type="button" @click=${this.handleCopyUsername} ?disabled=${this.pending}>
            ${i18n('action.copyUsername')}
          </button>
          ${candidate.domain
            ? html`<button type="button" @click=${this.handleOpenSite} ?disabled=${this.pending}>
                ${i18n('action.openSite')}
              </button>`
            : null}
          ${this.currentSite
            ? html`
                <button
                  class="primary"
                  type="button"
                  @click=${this.handleFillPassword}
                  ?disabled=${this.pending}
                >
                  ${i18n('action.fillPassword')}
                </button>
                <button type="button" @click=${this.handleCopyPassword} ?disabled=${this.pending}>
                  ${i18n('action.copyPassword')}
                </button>
                ${otpOptions.length
                  ? html`
                      <button
                        class="primary"
                        type="button"
                        @click=${this.handleFillOtp}
                        ?disabled=${this.pending}
                      >
                        ${i18n('action.fillOtp')}
                      </button>
                      <button type="button" @click=${this.handleCopyOtp} ?disabled=${this.pending}>
                        ${i18n('action.copyOtp')}
                      </button>
                    `
                  : null}
              `
            : null}
        </div>
        ${this.currentSite ? null : html`<p class="security-note">${i18n('search.hint')}</p>`}
      </section>
    `
  }
}
