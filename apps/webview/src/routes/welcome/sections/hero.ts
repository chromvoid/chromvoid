import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing} from 'lit'

import type {WelcomeSectionLayout} from '../welcome-section-layout'
import {welcomeSectionHostStyles} from '../welcome-section.styles'
import type {WelcomeSetupModel} from '../welcome-setup.model'

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
        justify-items: center;
        gap: var(--app-spacing-3);
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
        border-radius: 22px;
        background: linear-gradient(180deg, var(--cv-color-surface-2) 0%, var(--cv-color-bg) 100%);
        overflow: hidden;
      }

      .hero-icon-shell::before {
        content: '';
        position: absolute;
        inset: -20%;
        background:
          radial-gradient(circle at center, var(--cv-color-primary-surface-strong), transparent 60%);
        opacity: 0.38;
        filter: blur(18px);
      }

      .hero-art {
        width: 100%;
        height: 100%;
        position: relative;
        z-index: 1;
        display: block;
        object-fit: cover;
        border-radius: inherit;
        filter: none;
      }

      .hero-art.locked {
        opacity: 0.9;
        filter: saturate(0.92) brightness(0.94);
      }

      .hero-art.unlocked {
        opacity: 1;
        transform: scale(1.02);
        filter: saturate(1.02) brightness(1.01);
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
    `,
  ]

  declare model?: WelcomeSetupModel
  declare layout: WelcomeSectionLayout

  constructor() {
    super()
    this.layout = 'desktop'
  }

  static define() {
    if (!customElements.get('welcome-hero-section')) {
      customElements.define('welcome-hero-section', this)
    }
  }

  protected render() {
    if (!this.model) {
      return nothing
    }

    return html`
      <div class="hero">
        <div class="hero-mark">
          <div class="hero-icon-shell" aria-hidden="true">
            <img
              class="hero-art ${this.model.shakeError() ? 'animate-shake' : ''} ${this.model.isNeedInit() ? 'locked' : 'unlocked'}"
              src="/assets/icon.png"
              alt=""
            />
          </div>

          <div class="hero-kicker">${this.model.heroEyebrow()}</div>
        </div>

        <div class="hero-copy">
          <div class="hero-title">${this.model.heroTitle()}</div>
          <div class="hero-desc">${this.model.heroDescription()}</div>
        </div>

        <div class="hero-proof">${this.model.heroProof()}</div>
      </div>
    `
  }
}
