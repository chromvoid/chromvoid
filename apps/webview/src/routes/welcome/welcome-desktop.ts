import {css} from 'lit'

import {welcomeStyles} from './welcome.styles'
import {WelcomePageLayoutBase} from './welcome-layout-base'

export class WelcomePageDesktopLayout extends WelcomePageLayoutBase {
  static elementName = 'welcome-page-desktop-layout'
  protected readonly layoutVariant = 'desktop' as const

  static styles = [
    welcomeStyles,
    css`
      :host {
        position: relative;
        block-size: 100%;
        min-block-size: 100%;
        align-content: stretch;
        justify-items: stretch;
        padding: 0;
        overflow-x: hidden;
        background: var(--cv-color-bg);
      }

      .desktop-surface {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-rows: minmax(0, 1fr) auto;
        inline-size: 100%;
        block-size: 100%;
        min-block-size: 100%;
        background:
          radial-gradient(900px 560px at 50% -12%, var(--cv-color-surface-2) 0%, transparent 58%),
          radial-gradient(460px 320px at 50% 12%, var(--cv-color-primary-surface) 0%, transparent 72%),
          linear-gradient(180deg, var(--cv-color-surface) 0%, var(--cv-color-bg) 100%);
      }

      .desktop-surface::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0.52;
        background-image:
          linear-gradient(var(--cv-alpha-white-4) 1px, transparent 1px),
          linear-gradient(90deg, var(--cv-alpha-white-4) 1px, transparent 1px);
        background-size: 46px 46px;
        mask-image: radial-gradient(680px 520px at 50% 40%, black 0%, transparent 78%);
      }

      .main-card {
        position: relative;
        z-index: 1;
        align-self: center;
        justify-self: center;
        inline-size: min(560px, calc(100% - 40px));
        padding: 40px 34px;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
      }

      .main-card--remote-flow {
        display: grid;
        align-self: stretch;
        align-content: start;
        justify-self: stretch;
        min-inline-size: 0;
        min-block-size: 0;
        inline-size: auto;
        margin: clamp(18px, 2.5dvh, 30px) clamp(18px, 2vw, 28px) 0;
        padding: 0 0 28px;
        gap: 14px;
      }

      .main-card--remote-flow > welcome-setup-section {
        inline-size: 100%;
      }

      welcome-tools-section {
        position: relative;
        z-index: 1;
      }

      @media (max-width: 760px) {
        .main-card {
          inline-size: min(560px, calc(100% - 24px));
          padding: 32px 18px;
        }

        .main-card--remote-flow {
          margin: 16px 12px 0;
          padding-block-end: 24px;
        }
      }
    `,
  ]
}
