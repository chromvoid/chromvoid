import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, type TemplateResult} from 'lit'

import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {getAppContext} from 'root/shared/services/app-context'
import {WalletPageDesktopLayout} from './wallet-page-desktop'
import {WalletPageMobileLayout} from './wallet-page-mobile'

export class WalletPage extends ReatomLitElement {
  static elementName = 'wallet-page'
  static properties = {
    hideBackLink: {type: Boolean, attribute: 'hide-back-link'},
    externalToolbar: {type: Boolean, attribute: 'external-toolbar'},
  }

  static styles = css`
    :host {
      display: block;
      block-size: 100%;
      min-block-size: 0;
    }
  `

  declare hideBackLink: boolean
  declare externalToolbar: boolean

  constructor() {
    super()
    this.hideBackLink = false
    this.externalToolbar = false
  }

  static define(): void {
    WalletPageDesktopLayout.define()
    WalletPageMobileLayout.define()
    if (!customElements.get(this.elementName)) customElements.define(this.elementName, this)
  }

  protected render(): TemplateResult {
    const mobile = getAppContext().store.layoutMode() === 'mobile' || getRuntimeCapabilities().mobile
    return mobile
      ? html`<wallet-page-mobile-layout
          .hideBackLink=${this.hideBackLink}
          .externalToolbar=${this.externalToolbar}
        ></wallet-page-mobile-layout>`
      : html`<wallet-page-desktop-layout
          .hideBackLink=${this.hideBackLink}
          .externalToolbar=${this.externalToolbar}
        ></wallet-page-desktop-layout>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wallet-page': WalletPage
  }
}
