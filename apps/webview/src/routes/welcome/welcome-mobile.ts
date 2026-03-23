import {css} from 'lit'

import {welcomeStyles} from './welcome.styles'
import {WelcomePageLayoutBase} from './welcome-layout-base'
import {renderWelcomeMobileToolsSection} from './sections/tools'
import type {WelcomeToolsSectionOptions} from './welcome-layout-base'

export class WelcomePageMobileLayout extends WelcomePageLayoutBase {
  static elementName = 'welcome-page-mobile-layout'

  static styles = [
    welcomeStyles,
    css`
      :host {
        display: block;
        min-height: 100%;
        place-items: initial;
        padding:
          calc(var(--safe-area-top, 0px) + var(--app-spacing-5))
          var(--app-spacing-4)
          calc(var(--safe-area-bottom, 0px) + var(--app-spacing-6));
        background:
          radial-gradient(circle at top left, color-mix(in oklch, var(--cv-color-brand) 9%, transparent), transparent 48%),
          radial-gradient(circle at top right, color-mix(in oklch, var(--cv-color-accent) 11%, transparent), transparent 42%),
          linear-gradient(
            180deg,
            color-mix(in oklch, var(--cv-color-surface) 54%, black) 0%,
            color-mix(in oklch, var(--cv-color-bg) 72%, black) 52%,
            var(--cv-color-bg) 100%
          );
      }

      .container {
        width: 100%;
        min-height: 100%;
        gap: var(--app-spacing-4);
        align-content: start;
      }

      .main-card {
        position: relative;
        overflow: hidden;
        padding: var(--app-spacing-6) var(--app-spacing-5) var(--app-spacing-5);
        border-radius: 18px;
        border: 1px solid color-mix(in oklch, var(--cv-color-border-strong) 72%, transparent);
        background:
          linear-gradient(180deg, color-mix(in oklch, var(--cv-color-surface-2) 96%, black) 0%, var(--cv-color-surface) 100%);
        box-shadow:
          0 18px 38px var(--cv-alpha-black-35),
          inset 0 1px 0 color-mix(in oklch, white 6%, transparent);
        gap: var(--app-spacing-5);
      }

      .main-card::before {
        content: '';
        position: absolute;
        inset: 0 auto auto 0;
        inline-size: 100%;
        block-size: 1px;
        background: linear-gradient(
          90deg,
          transparent 0%,
          color-mix(in oklch, var(--cv-color-brand) 65%, white) 24%,
          color-mix(in oklch, var(--cv-color-accent) 60%, white) 72%,
          transparent 100%
        );
        opacity: 0.8;
      }

      .hero {
        justify-items: center;
        align-items: center;
        text-align: center;
        gap: var(--app-spacing-4);
      }

      .hero-copy {
        gap: var(--app-spacing-2);
        max-inline-size: 100%;
      }

      .hero-title {
        font-size: clamp(1.9rem, 8vw, 2.35rem);
        line-height: 1.06;
      }

      .hero-desc {
        font-size: 0.9375rem;
        line-height: 1.55;
        max-inline-size: 31ch;
      }

      .hero-proof {
        max-inline-size: 32ch;
      }

      .hero-kicker {
        min-inline-size: 140px;
      }

      .welcome-actions,
      .step-footer,
      .remote-actions {
        gap: var(--app-spacing-3);
      }

      .welcome-actions cv-button::part(base),
      .remote-actions cv-button::part(base),
      .step cv-button::part(base),
      .mobile-panel-body cv-button::part(base) {
        min-block-size: 52px;
        justify-content: center;
      }

      .mobile-support {
        display: grid;
        gap: var(--app-spacing-3);
      }

      .mobile-panel {
        overflow: hidden;
        border-radius: 16px;
        border: 1px solid var(--cv-color-border);
        background: color-mix(in oklch, var(--cv-color-surface-2) 92%, black);
        box-shadow: var(--cv-shadow-1);
      }

      .mobile-panel[open] {
        border-color: var(--cv-color-border-accent);
      }

      .mobile-panel-summary {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: var(--app-spacing-2);
        align-items: center;
        padding: var(--app-spacing-4) var(--app-spacing-5);
        cursor: pointer;
        list-style: none;
      }

      .mobile-panel-summary::-webkit-details-marker {
        display: none;
      }

      .mobile-panel-title {
        display: grid;
        gap: 2px;
      }

      .mobile-panel-label {
        color: var(--cv-color-text);
        font-size: 0.95rem;
        font-weight: 600;
      }

      .mobile-panel-meta {
        color: var(--cv-color-text-subtle);
        font-size: 0.8rem;
        line-height: 1.4;
      }

      .mobile-panel-summary::after {
        content: '+';
        color: var(--cv-color-brand);
        font-size: 1.15rem;
        font-weight: 500;
      }

      .mobile-panel[open] .mobile-panel-summary::after {
        content: '−';
      }

      .mobile-panel-body {
        display: grid;
        gap: var(--app-spacing-3);
        padding: 0 var(--app-spacing-5) var(--app-spacing-5);
      }

      .mobile-panel-note {
        color: var(--cv-color-text-subtle);
        font-size: 0.85rem;
        line-height: 1.5;
      }

      .mobile-meta-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--app-spacing-3);
      }

      .mobile-meta-label {
        color: var(--cv-color-text-subtle);
        font-size: 0.75rem;
        font-family: var(--cv-font-family-code);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .mobile-meta-actions {
        display: grid;
        gap: var(--app-spacing-2);
      }

      .mobile-meta-actions cv-button::part(base) {
        min-block-size: 44px;
      }

      .tool-actions {
        gap: var(--app-spacing-2);
      }

      .tool-actions cv-button[variant='danger']::part(base) {
        background: color-mix(in oklch, var(--cv-color-danger) 12%, transparent);
      }

      .meta-info {
        min-block-size: 48px;
        display: flex;
        align-items: center;
      }

      .mode-cards {
        gap: var(--app-spacing-3);
      }

      .mode-card {
        padding: var(--app-spacing-4);
      }

      .step {
        border-radius: 14px;
      }

      .back-link {
        padding-inline-start: 2px;
      }

      @media (min-width: 768px) {
        :host {
          padding: var(--app-spacing-6);
        }

        .main-card {
          padding: var(--app-spacing-7);
        }
      }

      @media (min-width: 768px) {
        .container {
          grid-template-columns: 1fr;
        }
      }
    `,
  ]

  protected renderToolsSection(options: WelcomeToolsSectionOptions) {
    return renderWelcomeMobileToolsSection(options)
  }
}
