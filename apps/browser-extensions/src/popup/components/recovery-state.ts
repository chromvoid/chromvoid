import {ReatomLitElement, html} from '@chromvoid/uikit/reatom-lit'
import {css} from 'lit'

import {i18n} from '../i18n'
import type {PopupRuntimeState} from '../popup.model'

const copyForState = (state: PopupRuntimeState): {title: string; body: string} => {
  switch (state.kind) {
    case 'gateway_offline':
      return {title: i18n('recovery.gatewayOfflineTitle'), body: i18n('recovery.gatewayOfflineBody')}
    case 'provider_disabled':
      return {title: i18n('recovery.providerDisabledTitle'), body: i18n('recovery.providerDisabledBody')}
    case 'vault_locked':
      return {title: i18n('recovery.vaultLockedTitle'), body: i18n('recovery.vaultLockedBody')}
    case 'load_error':
      return {title: i18n('recovery.loadErrorTitle'), body: state.message ?? i18n('error.loadSiteData')}
    default:
      return {title: i18n('recovery.gatewayOfflineTitle'), body: i18n('recovery.gatewayOfflineBody')}
  }
}

export class RecoveryState extends ReatomLitElement {
  static elementName = 'recovery-state'

  static get properties() {
    return {state: {attribute: false}}
  }

  declare state: PopupRuntimeState

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  static styles = css`
    :host {
      display: block;
    }

    section {
      display: grid;
      place-items: center;
      min-block-size: 240px;
      padding: var(--cv-space-6) var(--cv-space-5);
      text-align: center;
    }

    .content {
      max-inline-size: 300px;
    }

    .symbol {
      display: grid;
      place-items: center;
      inline-size: 42px;
      block-size: 42px;
      margin: 0 auto var(--cv-space-4);
      border: 1px solid var(--cv-color-border-muted);
      border-radius: 50%;
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text-muted);
      font-weight: 800;
    }

    h2 {
      margin: 0;
      color: var(--cv-color-text-strong);
      font-size: 17px;
    }

    p {
      margin: var(--cv-space-2) 0 var(--cv-space-4);
      color: var(--cv-color-text-muted);
      font-size: 12px;
      line-height: 1.5;
    }

    button {
      min-block-size: 40px;
      padding-inline: var(--cv-space-4);
      border: 1px solid var(--cv-color-primary-border);
      border-radius: var(--cv-radius-sm);
      background: var(--cv-color-primary-surface-strong);
      color: var(--cv-color-text-strong);
      font: inherit;
      font-weight: 750;
      cursor: pointer;
    }

    button:focus-visible {
      outline: 2px solid var(--cv-color-focus);
      outline-offset: 2px;
    }
  `

  private handleRetry() {
    this.dispatchEvent(new CustomEvent('recovery-retry', {bubbles: true, composed: true}))
  }

  protected override render() {
    const copy = copyForState(this.state)
    return html`
      <section aria-labelledby="recovery-title">
        <div class="content">
          <div class="symbol" aria-hidden="true">!</div>
          <h2 id="recovery-title">${copy.title}</h2>
          <p>${copy.body}</p>
          <button type="button" @click=${this.handleRetry}>${i18n('action.retry')}</button>
        </div>
      </section>
    `
  }
}
