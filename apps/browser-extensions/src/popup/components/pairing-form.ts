import {ReatomLitElement, html} from '@chromvoid/uikit/reatom-lit'
import {css, nothing, type PropertyValues} from 'lit'

import {i18n} from '../i18n'

export class ExtPairingForm extends ReatomLitElement {
  static elementName = 'ext-pairing-form'

  static get properties() {
    return {
      pin: {type: String},
      pinError: {type: String, attribute: 'pin-error'},
      backendError: {type: String, attribute: 'backend-error'},
      pending: {type: Boolean},
      focusRequest: {type: Number, attribute: 'focus-request'},
    }
  }

  declare pin: string
  declare pinError?: string
  declare backendError?: string
  declare pending: boolean
  declare focusRequest: number

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  static styles = css`
    :host {
      display: block;
    }

    form {
      display: grid;
      gap: var(--cv-space-3);
    }

    label {
      color: var(--cv-color-text-muted);
      font-size: 11px;
      font-weight: 700;
    }

    .control {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--cv-space-2);
    }

    input,
    button {
      min-block-size: 42px;
      border-radius: var(--cv-radius-sm);
      font: inherit;
    }

    input {
      min-inline-size: 0;
      padding-inline: var(--cv-space-3);
      border: 1px solid var(--cv-color-border-muted);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      letter-spacing: 0.18em;
    }

    input[aria-invalid='true'] {
      border-color: var(--cv-color-danger-border-strong);
    }

    input:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--cv-color-focus);
      outline-offset: 2px;
    }

    button {
      padding-inline: var(--cv-space-4);
      border: 1px solid var(--cv-color-primary-border);
      background: var(--cv-color-primary-surface-strong);
      color: var(--cv-color-text-strong);
      font-weight: 750;
      cursor: pointer;
    }

    button:disabled {
      cursor: wait;
      opacity: 0.6;
    }

    .error {
      margin: 0;
      color: var(--cv-color-danger-text);
      font-size: 11px;
      line-height: 1.4;
    }

    .backend-error {
      padding: var(--cv-space-3);
      border: 1px solid var(--cv-color-danger-border);
      border-radius: var(--cv-radius-sm);
      background: var(--cv-color-danger-surface);
    }

    @media (max-width: 360px) {
      .control {
        grid-template-columns: 1fr;
      }
    }
  `

  protected override updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties)
    if (changedProperties.has('focusRequest') && this.pinError) {
      this.renderRoot.querySelector<HTMLInputElement>('#pairing-pin')?.focus()
    }
  }

  private handleInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    this.dispatchEvent(
      new CustomEvent('pairing-pin-input', {
        detail: {pin: input.value},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    this.dispatchEvent(new CustomEvent('pairing-submit', {bubbles: true, composed: true}))
  }

  protected override render() {
    return html`
      <form @submit=${this.handleSubmit} novalidate>
        <label for="pairing-pin">${i18n('pairing.pinLabel')}</label>
        <div class="control">
          <input
            id="pairing-pin"
            name="pairing-pin"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            required
            .value=${this.pin ?? ''}
            aria-invalid=${this.pinError ? 'true' : nothing}
            aria-describedby=${this.pinError ? 'pairing-pin-error' : nothing}
            @input=${this.handleInput}
          />
          <button type="submit" ?disabled=${this.pending}>
            ${this.pending ? i18n('pairing.progress') : i18n('pairing.action')}
          </button>
        </div>
        ${this.pinError ? html`<p class="error" id="pairing-pin-error">${this.pinError}</p>` : null}
        ${this.backendError
          ? html`<p class="error backend-error" role="alert">${this.backendError}</p>`
          : null}
      </form>
    `
  }
}
