import {XLitElement} from '@statx/lit'
import {css, html} from 'lit'

import {biometricAppGateModel} from './biometric-app-gate.model'

export class BiometricAppGate extends XLitElement {
  static elementName = 'biometric-app-gate'

  static define(): void {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = [
    css`
      :host {
        display: grid;
        min-height: 100dvh;
        place-items: center;
        padding: 24px;
        box-sizing: border-box;
        background:
          radial-gradient(circle at top, color-mix(in oklch, var(--cv-color-primary-dark) 22%, transparent), transparent 42%),
          linear-gradient(180deg, var(--cv-color-surface) 0%, var(--cv-color-bg) 100%);
        color: var(--cv-color-text-strong);
      }

      .panel {
        width: min(100%, 420px);
        padding: 28px 24px;
        border: 1px solid var(--cv-alpha-white-20);
        border-radius: 24px;
        background: var(--cv-alpha-black-95);
        box-shadow: 0 24px 60px var(--cv-alpha-black-35);
      }

      .eyebrow {
        margin: 0 0 12px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--cv-color-text-muted);
      }

      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.1;
      }

      p {
        margin: 14px 0 0;
        color: var(--cv-color-text);
        line-height: 1.5;
      }

      button {
        margin-top: 22px;
        min-width: 148px;
        padding: 12px 18px;
        border: 0;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--cv-color-primary) 0%, var(--cv-color-primary-dark) 100%);
        color: var(--cv-color-on-primary);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      button:disabled {
        opacity: 0.6;
        cursor: default;
      }
    `,
  ]

  protected render() {
    return html`
      <section class="panel" aria-live="polite">
        <div class="eyebrow">App gate</div>
        <h1>${biometricAppGateModel.title()}</h1>
        <p>${biometricAppGateModel.message()}</p>
        ${biometricAppGateModel.showRetry()
          ? html`<button type="button" @click=${this.handleRetry}>Try again</button>`
          : ''}
      </section>
    `
  }

  private handleRetry() {
    biometricAppGateModel.retry()
  }
}
