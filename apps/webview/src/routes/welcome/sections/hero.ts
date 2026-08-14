import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing} from 'lit'
import {i18n} from 'root/i18n'

import type {WelcomeSectionLayout} from '../welcome-section-layout'
import {welcomeSectionHostStyles} from '../welcome-section.styles'
import type {WelcomeSetupModel} from '../welcome-setup.model'
import {WelcomeChromvoidIcon} from './welcome-icon'

export class WelcomeHeroSection extends ReatomLitElement {
  static properties = {
    model: {attribute: false},
    layout: {type: String, reflect: true},
  }

  static styles = [
    welcomeSectionHostStyles,
    css`
      .hero {
        display: grid;
        gap: var(--app-spacing-3);
        align-items: center;
        text-align: center;
        justify-items: center;
      }

      .hero-mark {
        display: grid;
        gap: var(--app-spacing-2);
        justify-items: center;
        inline-size: 100%;
      }

      .hero-kicker {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: 28px;
        min-inline-size: 140px;
        padding: 0 12px;
        border-radius: var(--cv-radius-pill);
        border: 1px solid var(--cv-color-primary-border);
        background: var(--cv-color-primary-surface);
        color: var(--cv-color-primary);
        font-family: var(--cv-font-family-code);
        font-size: 0.7rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .hero-icon-shell {
        position: relative;
        display: grid;
        place-items: center;
        inline-size: 76px;
        block-size: 76px;
        overflow: hidden;
      }

      welcome-chromvoid-icon {
        position: relative;
        z-index: 1;
        display: block;
        inline-size: 100%;
        block-size: 100%;
        border-radius: inherit;
      }

      .hero-title {
        font-family: var(--cv-font-family-display);
        font-size: 1.85rem;
        font-weight: 700;
        line-height: 1.12;
        color: var(--cv-color-text);
      }

      .hero-desc {
        color: var(--cv-color-text-muted);
        font-size: 1rem;
        line-height: 1.5;
      }

      .hero-copy {
        display: grid;
        gap: var(--app-spacing-2);
        justify-items: center;
        text-align: center;
        max-inline-size: 31ch;
        margin-inline: auto;
      }

      .hero-proof {
        display: grid;
        gap: var(--app-spacing-2);
        color: var(--cv-color-text-subtle);
        font-size: 0.8125rem;
        line-height: 1.5;
        text-align: center;
        max-inline-size: 34ch;
        margin-inline: auto;
        padding-top: var(--app-spacing-3);
        border-top: 1px solid var(--cv-color-border-soft);
      }

      :host([layout='desktop']) .hero {
        justify-items: start;
        gap: 10px;
        text-align: start;
      }

      :host([layout='desktop']) .hero-mark {
        display: block;
      }

      :host([layout='desktop']) .hero-icon-shell {
        display: none;
      }

      :host([layout='desktop']) .hero-kicker {
        min-block-size: auto;
        min-inline-size: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: var(--cv-color-primary);
        font-size: 0.6875rem;
        letter-spacing: 0.18em;
      }

      :host([layout='desktop']) .hero-copy {
        justify-items: start;
        max-inline-size: 46ch;
        margin-inline: 0;
        text-align: start;
      }

      :host([layout='desktop']) .hero-title {
        font-size: 1.6875rem;
        font-weight: 650;
        letter-spacing: 0;
      }

      :host([layout='desktop']) .hero-desc {
        max-inline-size: 52ch;
        font-size: 0.875rem;
        line-height: 1.5;
      }

      :host([layout='desktop']) .hero-proof {
        max-inline-size: 52ch;
        margin-inline: 0;
        padding-block-start: 12px;
        text-align: start;
      }

      :host([layout='desktop']) .hero.locked-vault {
        justify-items: center;
        text-align: center;
      }

      :host([layout='desktop']) .hero.locked-vault .hero-mark {
        display: grid;
        justify-items: center;
      }

      :host([layout='desktop']) .hero.locked-vault .hero-icon-shell {
        display: grid;
        inline-size: 66px;
        block-size: 66px;
        margin-block-end: 10px;
      }

      :host([layout='desktop']) .hero.locked-vault .hero-copy,
      :host([layout='desktop']) .hero.locked-vault .hero-proof {
        justify-items: center;
        margin-inline: auto;
        text-align: center;
      }

      @keyframes shake {
        0%,
        100% {
          transform: translateX(0);
        }
        10%,
        30%,
        50%,
        70%,
        90% {
          transform: translateX(-4px);
        }
        20%,
        40%,
        60%,
        80% {
          transform: translateX(4px);
        }
      }

      .animate-shake {
        animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        color: var(--cv-color-danger);
      }

      :host([layout='mobile']) .hero {
        justify-items: center;
        gap: var(--app-spacing-4);
      }

      :host([layout='mobile']) .hero-copy {
        max-inline-size: 100%;
      }

      :host([layout='mobile']) .hero-title {
        font-size: clamp(1.9rem, 8vw, 2.35rem);
        line-height: 1.06;
      }

      :host([layout='mobile']) .hero-desc {
        font-size: 0.9375rem;
        line-height: 1.55;
        max-inline-size: 31ch;
      }

      :host([layout='mobile']) .hero-proof {
        max-inline-size: 32ch;
      }

      :host([layout='mobile']) .hero.locked-vault {
        flex: 1 1 auto;
        align-content: center;
        justify-content: center;
        gap: 0;
        min-block-size: 320px;
      }

      :host([layout='mobile']) .hero.locked-vault .hero-icon-shell {
        inline-size: 88px;
        block-size: 88px;
        border-radius: 26px;
        overflow: visible;
        background: transparent;
      }

      :host([layout='mobile']) .hero.locked-vault.unlocking .hero-icon-shell {
        z-index: 3;
        pointer-events: none;
      }

      :host([layout='mobile']) .hero.locked-vault .hero-kicker {
        min-block-size: auto;
        min-inline-size: 0;
        margin-block-start: 26px;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: var(--welcome-lockscreen-foreground-subtle);
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.32em;
      }

      :host([layout='mobile']) .hero.locked-vault .hero-copy {
        margin-block-start: 13px;
        gap: 13px;
        max-inline-size: 282px;
      }

      :host([layout='mobile']) .hero.locked-vault .hero-title {
        color: var(--welcome-lockscreen-foreground-strong);
        font-size: 1.875rem;
        line-height: 1.08;
        letter-spacing: 0;
      }

      :host([layout='mobile']) .hero.locked-vault .hero-desc {
        max-inline-size: 282px;
        color: var(--welcome-lockscreen-foreground-muted);
        font-size: 0.9375rem;
        line-height: 1.55;
      }

      @media (min-width: 700px) {
        :host([layout='mobile'][tablet-viewport]) .hero {
          justify-items: center;
          gap: var(--app-spacing-4);
          text-align: center;
        }

        :host([layout='mobile'][tablet-viewport]) .hero-mark,
        :host([layout='mobile'][tablet-viewport]) .hero-copy,
        :host([layout='mobile'][tablet-viewport]) .hero-proof {
          justify-items: center;
          margin-inline: auto;
          text-align: center;
        }

        :host([layout='mobile'][tablet-viewport]) .hero.first-run .hero-kicker {
          display: none;
        }

        :host([layout='mobile'][tablet-viewport]) .hero-copy,
        :host([layout='mobile'][tablet-viewport]) .hero-proof {
          max-inline-size: 42ch;
        }

        :host([layout='mobile'][tablet-viewport]) .hero-title {
          font-size: clamp(2.35rem, 5vw, 2.75rem);
          line-height: 1.08;
        }

        :host([layout='mobile'][tablet-viewport]) .hero-desc {
          max-inline-size: 38ch;
          font-size: 1.0625rem;
        }

        :host([layout='mobile'][tablet-viewport]) .hero.locked-vault {
          min-block-size: 0;
          align-content: center;
          justify-content: center;
        }

        :host([layout='mobile'][tablet-viewport]) .hero.locked-vault .hero-icon-shell {
          inline-size: 88px;
          block-size: 88px;
        }

        :host([layout='mobile'][tablet-viewport]) .hero.locked-vault .hero-kicker {
          margin-block-start: 24px;
        }

        :host([layout='mobile'][tablet-viewport]) .hero.locked-vault .hero-copy {
          max-inline-size: 34ch;
        }

        :host([layout='mobile'][tablet-viewport]) .hero.locked-vault .hero-title {
          font-size: clamp(2rem, 4.5vw, 2.5rem);
        }

        :host([layout='mobile'][tablet-viewport]) .hero.locked-vault .hero-desc {
          max-inline-size: 34ch;
          font-size: 1rem;
        }
      }

      :host([layout='mobile'][viewport-profile='compact']) .hero.locked-vault,
      :host([layout='mobile'][viewport-profile='condensed']) .hero.locked-vault {
        min-block-size: 245px;
      }

      :host([layout='mobile'][viewport-profile='compact']) .hero.locked-vault .hero-icon-shell,
      :host([layout='mobile'][viewport-profile='condensed']) .hero.locked-vault .hero-icon-shell {
        inline-size: 66px;
        block-size: 66px;
        border-radius: 20px;
      }

      :host([layout='mobile'][viewport-profile='compact']) .hero.locked-vault .hero-kicker,
      :host([layout='mobile'][viewport-profile='condensed']) .hero.locked-vault .hero-kicker {
        margin-block-start: 18px;
        font-size: 0.625rem;
        letter-spacing: 0.26em;
      }

      :host([layout='mobile'][viewport-profile='compact']) .hero.locked-vault .hero-copy,
      :host([layout='mobile'][viewport-profile='condensed']) .hero.locked-vault .hero-copy {
        margin-block-start: 8px;
        gap: 8px;
      }

      :host([layout='mobile'][viewport-profile='compact']) .hero.locked-vault .hero-title,
      :host([layout='mobile'][viewport-profile='condensed']) .hero.locked-vault .hero-title {
        font-size: 1.55rem;
      }

      :host([layout='mobile'][viewport-profile='compact']) .hero.locked-vault .hero-desc,
      :host([layout='mobile'][viewport-profile='condensed']) .hero.locked-vault .hero-desc {
        font-size: 0.8125rem;
        line-height: 1.38;
      }

      :host([layout='mobile'][viewport-profile='condensed']) .hero.locked-vault {
        min-block-size: 190px;
      }

      :host([layout='mobile'][viewport-profile='condensed']) .hero.locked-vault .hero-icon-shell {
        inline-size: 54px;
        block-size: 54px;
        border-radius: 17px;
      }

      :host([layout='mobile'][viewport-profile='condensed']) .hero.locked-vault .hero-kicker {
        margin-block-start: 12px;
        font-size: 0.5625rem;
        letter-spacing: 0.22em;
      }

      :host([layout='mobile'][viewport-profile='condensed']) .hero.locked-vault .hero-copy {
        margin-block-start: 6px;
        gap: 6px;
      }

      :host([layout='mobile'][viewport-profile='condensed']) .hero.locked-vault .hero-title {
        font-size: 1.35rem;
      }

      :host([layout='mobile'][viewport-profile='condensed']) .hero.locked-vault .hero-desc {
        font-size: 0.75rem;
        line-height: 1.3;
      }
    `,
  ]

  declare model?: WelcomeSetupModel
  declare layout: WelcomeSectionLayout

  constructor() {
    super()
    this.layout = 'desktop'
  }

  static define() {
    WelcomeChromvoidIcon.define()
    if (!customElements.get('welcome-hero-section')) {
      customElements.define('welcome-hero-section', this)
    }
  }

  protected render() {
    if (!this.model) {
      return nothing
    }

    const setupStep = this.model.effectiveStep()
    const isLockedVault = !this.model.isNeedInit() && setupStep === null
    const isMobileLockedVault = this.layout === 'mobile' && isLockedVault
    const isMobileFirstRun =
      this.layout === 'mobile' &&
      this.model.isNeedInit() &&
      (setupStep === 'mode-select' || setupStep === 'create-master')
    const isUnlocking = isMobileLockedVault && this.model.unlockInProgress()
    const eyebrow = isMobileFirstRun ? i18n('welcome:eyebrow-first-run') : this.model.heroEyebrow()
    const title = isMobileFirstRun ? i18n('onboard:hero:create') : this.model.heroTitle()
    const description = isMobileFirstRun ? i18n('welcome:create-master-desc') : this.model.heroDescription()
    const proof = isMobileFirstRun ? i18n('welcome:proof-create-master') : this.model.heroProof()

    return html`
      <div
        class="hero${isMobileFirstRun ? ' first-run' : ''}${isLockedVault ? ' locked-vault' : ''}${isUnlocking
          ? ' unlocking'
          : ''}"
      >
        <div class="hero-mark">
          <div class="hero-icon-shell" aria-hidden="true">
            <welcome-chromvoid-icon
              animated
              class=${this.model.shakeError() ? 'animate-shake' : ''}
              .model=${this.model.icon}
            ></welcome-chromvoid-icon>
          </div>

          <div class="hero-kicker">${isMobileLockedVault ? i18n('welcome:device-locked') : eyebrow}</div>
        </div>

        <div class="hero-copy">
          <div class="hero-title">${title}</div>
          <div class="hero-desc">${description}</div>
        </div>

        ${isMobileLockedVault ? nothing : html`<div class="hero-proof">${proof}</div>`}
      </div>
    `
  }
}
