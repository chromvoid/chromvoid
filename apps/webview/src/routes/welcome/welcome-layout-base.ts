import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {nothing, type PropertyValues} from 'lit'

import {markStartupContentReadyWhenStable} from 'root/app/bootstrap/startup-readiness'
import {i18n} from 'root/i18n'
import {WelcomeHeroSection} from './sections/hero'
import {WelcomeSetupSection} from './sections/steps'
import {WelcomeToolsSection} from './sections/tools'
import {WelcomeModel, type WelcomeSetupStep} from './welcome.model'
import type {WelcomeSectionLayout} from './welcome-section-layout'

const WELCOME_STARTUP_READY_SELECTORS = [
  'welcome-setup-section >>> .welcome-actions, .mode-cards, .setup-card, .remote-actions, .remote-step-heading, .remote-form-grid, .remote-presence-panel, .remote-wait-panel',
] as const

export abstract class WelcomePageLayoutBase extends ReatomLitElement {
  static elementName = 'welcome-page'

  static define() {
    WelcomeHeroSection.define()
    WelcomeSetupSection.define()
    WelcomeToolsSection.define()
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

  protected render() {
    if (this.layoutVariant === 'desktop') {
      return this.renderDesktopLayout()
    }

    return this.renderMobileLayout()
  }

  private renderMobileLayout() {
    const setupStep = this.model.setup.effectiveStep()
    const isRemoteFlow = this.isRemoteSetupStep(setupStep)
    const isMobileLockedVault = this.layoutVariant === 'mobile' && !this.model.setup.isNeedInit() && setupStep === null
    const unlockInProgress = isMobileLockedVault && this.model.setup.unlockInProgress()
    const containerClass = isMobileLockedVault ? 'container locked-vault' : 'container'

    return html`
      <div class=${containerClass} aria-busy=${unlockInProgress ? 'true' : nothing}>
        ${unlockInProgress
          ? html`
              <div class="unlock-loading-scrim" role="status" aria-live="polite" aria-atomic="true">
                <span class="sr-only">${i18n('status:unlocking')}</span>
              </div>
            `
          : nothing}
        ${isMobileLockedVault
          ? html`
              <header class="lockscreen-header">
                <div class="lockscreen-brand">
                  <span>ChromVoid</span>
                </div>
                <div class="lockscreen-status">
                  <span aria-hidden="true"></span>
                  ${this.model.setup.heroEyebrow()}
                </div>
              </header>
            `
          : nothing}
        <div class="main-card">
          ${isRemoteFlow
            ? nothing
            : html`
                <welcome-hero-section
                  .model=${this.model.setup}
                  layout=${this.layoutVariant}
                ></welcome-hero-section>
              `}
          ${this.model.errorText()
            ? html`<cv-callout variant="danger" class="${this.model.shakeError() ? 'animate-shake' : ''}">
                ${this.model.errorText()}
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
    `
  }

  private renderDesktopLayout() {
    const setupStep = this.model.setup.effectiveStep()
    const isRemoteFlow = this.isRemoteSetupStep(setupStep)
    const mainCardClass =
      isRemoteFlow
        ? 'main-card main-card--remote-flow'
        : 'main-card'

    return html`
      <section class="desktop-surface" aria-label="ChromVoid welcome">
        <div class=${mainCardClass}>
          ${this.renderMainCardContent(!isRemoteFlow)}
        </div>

        <welcome-tools-section
          .model=${this.model.tools}
          layout=${this.layoutVariant}
        ></welcome-tools-section>
      </section>
    `
  }

  private renderMainCardContent(showHero = true) {
    return html`
      ${showHero
        ? html`
            <welcome-hero-section
              .model=${this.model.setup}
              layout=${this.layoutVariant}
            ></welcome-hero-section>
          `
        : nothing}
      ${this.model.errorText()
        ? html`<cv-callout variant="danger" class="${this.model.shakeError() ? 'animate-shake' : ''}">
            ${this.model.errorText()}
          </cv-callout>`
        : nothing}
      <welcome-setup-section
        .model=${this.model.setup}
        layout=${this.layoutVariant}
      ></welcome-setup-section>
    `
  }

  private isRemoteSetupStep(step: WelcomeSetupStep): boolean {
    return step === 'remote-connect' || step === 'remote-pair' || step === 'remote-wait'
  }
}
