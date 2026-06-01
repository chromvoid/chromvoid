import {css} from 'lit'

import {welcomeStyles} from './welcome.styles'
import {WelcomePageLayoutBase} from './welcome-layout-base'

export class WelcomePageMobileLayout extends WelcomePageLayoutBase {
  static elementName = 'welcome-page-mobile-layout'
  protected readonly layoutVariant = 'mobile' as const

  static styles = [
    welcomeStyles,
    css`
      :host {
        display: block;
        min-height: 100%;
        place-items: initial;
        padding: var(--app-spacing-5) var(--app-spacing-4) var(--app-spacing-6);
        background:
          radial-gradient(circle at top left, var(--cv-color-primary-surface), transparent 48%),
          radial-gradient(circle at top right, var(--cv-color-accent-surface), transparent 42%),
          linear-gradient(
            180deg,
            var(--cv-color-surface-2) 0%,
            var(--cv-color-bg) 52%,
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
        border: 1px solid var(--cv-color-border-soft);
        background: linear-gradient(180deg, var(--cv-color-surface-2) 0%, var(--cv-color-surface) 100%);
        box-shadow:
          0 18px 38px var(--cv-alpha-black-35),
          inset 0 1px 0 var(--cv-alpha-white-6);
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
          var(--cv-color-primary-surface-strong) 24%,
          var(--cv-color-accent-surface-strong) 72%,
          transparent 100%
        );
        opacity: 0.8;
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
}
