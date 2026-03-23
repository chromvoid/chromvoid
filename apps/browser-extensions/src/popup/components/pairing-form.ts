import {css} from 'lit'
import {ReatomLitElement, html} from '@chromvoid/uikit'

import {i18n} from '../i18n'
import {store} from '../store'

export class ExtPairingForm extends ReatomLitElement {
  static elementName = 'ext-pairing-form'

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  static styles = css`
    :host {
      display: block;
    }

    .state-panel {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 10px;
      min-height: 212px;
      padding: 16px;
      border: 1px dashed rgb(148 163 184 / 24%);
      border-radius: 14px;
      text-align: center;
      color: rgb(226 232 240 / 94%);
    }

    .pairing-section {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
      width: 100%;
      max-width: 330px;
    }

    .pairing-hint {
      font-size: 12px;
      color: rgb(191 219 254 / 92%);
      text-align: center;
    }

    .pairing-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
    }

    cv-input {
      --cv-input-background: rgb(2 6 23 / 65%);
      --cv-input-border-color: rgb(148 163 184 / 38%);
      --cv-input-color: rgb(226 232 240);
      --cv-input-placeholder-color: rgb(148 163 184 / 85%);
    }
  `

  private handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    this.handlePair()
  }

  private handlePair() {
    const input = this.renderRoot.querySelector<HTMLElement & {value?: string}>('cv-input')
    if (!input) {
      return
    }

    this.dispatchEvent(
      new CustomEvent('ext-pair', {detail: {pin: input.value ?? ''}, bubbles: true, composed: true}),
    )
  }

  protected override render() {
    const error = store.error()
    const inProgress = store.pairingInProgress()

    return html`
      <div class="state-panel">
        <div>${error}</div>
        <div class="pairing-section">
          <div class="pairing-hint">${i18n('pairing.hint')}</div>
          <div class="pairing-actions">
            <cv-input size="small" placeholder="123456" @keydown=${this.handleKeydown}></cv-input>
            <cv-button size="small" @click=${this.handlePair} ?disabled=${inProgress}
              >${inProgress ? i18n('pairing.progress') : i18n('pairing.action')}</cv-button
            >
          </div>
        </div>
      </div>
    `
  }
}
