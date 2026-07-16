import type {CredentialCandidate} from '@chromvoid/scheme'
import {ReatomLitElement, html} from '@chromvoid/uikit/reatom-lit'
import {css} from 'lit'

import {i18n} from '../i18n'
import {autofillOtpOptions} from '../otp-selection'

export class CredentialRow extends ReatomLitElement {
  static elementName = 'credential-row'

  static get properties() {
    return {
      candidate: {attribute: false},
      currentSite: {type: Boolean, attribute: 'current-site'},
      pending: {type: Boolean},
    }
  }

  declare candidate: CredentialCandidate
  declare currentSite: boolean
  declare pending: boolean

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  static styles = css`
    :host {
      display: block;
      contain: content;
    }

    .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      min-block-size: 62px;
      border-block-end: 1px solid var(--cv-color-border-faint);
    }

    .identity,
    .fill {
      border: 0;
      font: inherit;
      color: inherit;
      cursor: pointer;
    }

    .identity {
      min-inline-size: 0;
      padding: var(--cv-space-3) var(--cv-space-2);
      background: transparent;
      text-align: start;
    }

    .identity:hover {
      background: var(--cv-color-surface-hover);
    }

    .identity:focus-visible,
    .fill:focus-visible {
      outline: 2px solid var(--cv-color-focus);
      outline-offset: -2px;
    }

    .label-line,
    .meta-line {
      display: flex;
      align-items: center;
      min-inline-size: 0;
    }

    .label-line {
      gap: var(--cv-space-2);
    }

    .label,
    .username,
    .domain {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .label {
      color: var(--cv-color-text-strong);
      font-size: 13px;
      font-weight: 700;
    }

    .meta-line {
      gap: 6px;
      margin-block-start: 3px;
      color: var(--cv-color-text-muted);
      font-size: 11px;
    }

    .domain::before {
      content: '·';
      margin-inline-end: 6px;
      color: var(--cv-color-text-subtle);
    }

    .otp {
      flex: none;
      color: var(--cv-color-primary);
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }

    .fill {
      min-block-size: 34px;
      margin-inline: var(--cv-space-2);
      padding-inline: var(--cv-space-3);
      border: 1px solid var(--cv-color-primary-border);
      border-radius: var(--cv-radius-sm);
      background: var(--cv-color-primary-surface);
      color: var(--cv-color-text-strong);
      font-size: 11px;
      font-weight: 750;
      transition:
        background-color var(--cv-duration-fast) var(--cv-easing-standard),
        border-color var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .fill:hover:not(:disabled) {
      border-color: var(--cv-color-primary-border-strong);
      background: var(--cv-color-primary-surface-strong);
    }

    .fill:disabled {
      cursor: wait;
      opacity: 0.58;
    }

    @media (prefers-reduced-motion: reduce) {
      .fill {
        transition-duration: 0ms;
      }
    }
  `

  focusPrimary(): void {
    this.renderRoot.querySelector<HTMLButtonElement>('.identity')?.focus()
  }

  private handleOpen() {
    this.dispatchEvent(
      new CustomEvent('credential-open', {
        detail: {candidate: this.candidate},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleFill() {
    this.dispatchEvent(
      new CustomEvent('credential-fill', {
        detail: {candidate: this.candidate},
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
    const hasOtp = autofillOtpOptions(candidate.otp_options ?? []).length > 0
    return html`
      <article class="row">
        <button
          class="identity"
          type="button"
          @click=${this.handleOpen}
          aria-label=${`${i18n('action.details')}: ${candidate.label}`}
        >
          <span class="label-line">
            <span class="label">${candidate.label || candidate.credential_id}</span>
            ${hasOtp ? html`<span class="otp">${i18n('credential.otp')}</span>` : null}
          </span>
          <span class="meta-line">
            <span class="username">${candidate.username}</span>
            <span class="domain">${candidate.domain ?? i18n('credential.unknownDomain')}</span>
          </span>
        </button>
        ${this.currentSite
          ? html`<button class="fill" type="button" @click=${this.handleFill} ?disabled=${this.pending}>
              ${this.pending ? i18n('action.working') : i18n('action.fill')}
            </button>`
          : null}
      </article>
    `
  }
}
