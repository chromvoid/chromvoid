import {XLitElement} from '@statx/lit'
import {css, html} from 'lit'

import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {getAppContext} from 'root/shared/services/app-context'
import {WelcomePageDesktopLayout} from './welcome/welcome-desktop'
import {WelcomePageMobileLayout} from './welcome/welcome-mobile'

class WelcomePage extends XLitElement {
  static define() {
    WelcomePageMobileLayout.define()
    WelcomePageDesktopLayout.define()

    if (!customElements.get('welcome-page')) {
      customElements.define('welcome-page', this as unknown as CustomElementConstructor)
    }
  }

  static styles = [
    css`
      :host {
        display: block;
        min-height: 100%;
      }
    `,
  ]

  protected render() {
    const isMobileLayout = getAppContext().store.layoutMode() === 'mobile' || getRuntimeCapabilities().mobile

    if (isMobileLayout) {
      return html`<welcome-page-mobile-layout></welcome-page-mobile-layout>`
    }

    return html`<welcome-page-desktop-layout></welcome-page-desktop-layout>`
  }
}

WelcomePage.define()

export {WelcomePage}
