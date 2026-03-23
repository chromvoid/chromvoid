import {css} from 'lit'
import {ReatomLitElement, html} from '@chromvoid/uikit'

import {i18n} from '../i18n'
import {store} from '../store'

export class ExtStatusPanel extends ReatomLitElement {
  static elementName = 'ext-status-panel'

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  static styles = css`
    :host {
      display: block;
    }

    .status-panel {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .status-item {
      display: grid;
      grid-template-columns: max-content minmax(0, 100px);
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      min-height: 36px;
      padding: 8px 10px;
      border-radius: 12px;
      border: 1px solid rgb(148 163 184 / 16%);
      background: rgb(15 23 42 / 56%);
      box-shadow: inset 0 1px 0 rgb(255 255 255 / 4%);
      color: rgb(226 232 240 / 95%);
      font-size: 12px;
      font-weight: 600;
    }

    .status-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    cv-badge {
      display: block;
      width: 100%;
      max-width: 150px;
      min-width: 0;
      justify-self: end;
      --cv-badge-font-size: 11px;
    }

    cv-badge::part(base) {
      width: 100%;
      min-width: 0;
      justify-content: flex-start;
    }

    cv-badge::part(label) {
      display: block;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 700;
    }
  `

  protected override render() {
    const connected = store.gatewayConnected()
    const reachable = store.gatewayReachable()
    const vaultOpen = store.vaultOpen()

    const gatewayVariant = connected ? 'success' : reachable ? 'warning' : 'danger'
    const gatewayText = connected
      ? i18n('status.connected')
      : reachable
        ? i18n('status.unauthorized')
        : i18n('status.offline')

    let vaultVariant = 'warning'
    let vaultText: string = i18n('status.unknown')
    if (!connected) {
      vaultVariant = 'warning'
      vaultText = i18n('status.na')
    } else if (vaultOpen === true) {
      vaultVariant = 'success'
      vaultText = i18n('status.open')
    } else if (vaultOpen === false) {
      vaultVariant = 'danger'
      vaultText = i18n('status.locked')
    }

    return html`<div class="status-panel">
      <div class="status-item">
        <span class="status-label">${i18n('status.gateway')}</span>
        <cv-badge pill variant=${gatewayVariant}>${gatewayText}</cv-badge>
      </div>
      <div class="status-item">
        <span class="status-label">${i18n('status.vault')}</span>
        <cv-badge pill variant=${vaultVariant}>${vaultText}</cv-badge>
      </div>
    </div>`
  }
}
