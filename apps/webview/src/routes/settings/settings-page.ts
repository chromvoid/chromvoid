import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, type TemplateResult} from 'lit'

import {runtimeCapabilitiesAtom} from 'root/core/runtime/runtime-capabilities'
import {tryGetAppContext} from 'root/shared/services/app-context'
import {SettingsPageDesktopLayout} from './settings-page-desktop'
import {SettingsPageMobileLayout} from './settings-page-mobile'

export class SettingsPage extends ReatomLitElement {
  static elementName = 'settings-page'

  static styles = css`
    :host {
      display: block;
      block-size: 100%;
      min-block-size: 0;
    }
  `

  static define(): void {
    SettingsPageDesktopLayout.define()
    SettingsPageMobileLayout.define()
    if (!customElements.get(this.elementName)) customElements.define(this.elementName, this)
  }

  protected render(): TemplateResult {
    const layoutMode = tryGetAppContext()?.store.layoutMode?.()
    const mobile = layoutMode === 'mobile' || runtimeCapabilitiesAtom().mobile
    return mobile
      ? html`<settings-page-mobile-layout></settings-page-mobile-layout>`
      : html`<settings-page-desktop-layout></settings-page-desktop-layout>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-page': SettingsPage
  }
}
