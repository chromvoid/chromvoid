import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {nothing, type PropertyValues} from 'lit'

import {markStartupContentReadyWhenStable} from 'root/app/bootstrap/startup-readiness'
import {getAppContext} from 'root/shared/services/app-context'
import {WelcomeHeroSection} from './sections/hero'
import {WelcomeSetupSection} from './sections/steps'
import {WelcomePrintKitSection, WelcomeToolsSection} from './sections/tools'
import {WelcomeModel} from './welcome.model'
import type {WelcomeSectionLayout} from './welcome-section-layout'

const WELCOME_STARTUP_READY_SELECTORS = [
  'welcome-hero-section >>> .hero-title',
  'welcome-setup-section >>> .welcome-actions, .mode-cards, .setup-card, .remote-actions, .remote-form-grid, .remote-presence-panel',
] as const

export abstract class WelcomePageLayoutBase extends ReatomLitElement {
  static elementName = 'welcome-page'

  static define() {
    WelcomeHeroSection.define()
    WelcomeSetupSection.define()
    WelcomeToolsSection.define()
    WelcomePrintKitSection.define()
    const elementName = (this as typeof WelcomePageLayoutBase).elementName
    if (!customElements.get(elementName)) {
      customElements.define(elementName, this as unknown as CustomElementConstructor)
    }
  }

  protected readonly model = new WelcomeModel()
  protected abstract readonly layoutVariant: WelcomeSectionLayout

  connectedCallback(): void {
    super.connectedCallback()
    this.model.connect()
  }

  disconnectedCallback(): void {
    this.model.disconnect()
    super.disconnectedCallback()
  }

  protected override firstUpdated(changedProperties: PropertyValues): void {
    super.firstUpdated(changedProperties)
    markStartupContentReadyWhenStable(this, {
      criticalSelectors: WELCOME_STARTUP_READY_SELECTORS,
    })
  }

  private getStatusVariant(type: 'success' | 'error' | 'warning' | 'info') {
    return type === 'error' ? 'danger' : type
  }

  protected render() {
    const statusMessage = getAppContext().store.statusMessage()

    return html`
      <div class="container">
        <div class="main-card">
          <welcome-hero-section
            .model=${this.model.setup}
            layout=${this.layoutVariant}
          ></welcome-hero-section>
          ${this.model.errorText()
            ? html`<cv-callout variant="danger" class="${this.model.shakeError() ? 'animate-shake' : ''}">
                ${this.model.errorText()}
              </cv-callout>`
            : nothing}
          ${statusMessage
            ? html`<cv-callout variant=${this.getStatusVariant(statusMessage.type)}>
                ${statusMessage.message}
              </cv-callout>`
            : nothing}
          <welcome-setup-section
            .model=${this.model.setup}
            layout=${this.layoutVariant}
          ></welcome-setup-section>
        </div>

        <welcome-tools-section
          .model=${this.model.tools}
          layout=${this.layoutVariant}
        ></welcome-tools-section>
      </div>

      <welcome-print-kit-section
        .model=${this.model.tools}
        layout=${this.layoutVariant}
      ></welcome-print-kit-section>
    `
  }
}
