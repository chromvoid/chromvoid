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
        display: grid;
        min-height: 100%;
        grid-template-rows: auto 0px;
        place-items: initial;
        padding: 0;

        align-content: initial;
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
        grid-template-columns: minmax(0, 1fr);
        align-items: stretch;
      }

      .container.first-run-container {
        grid-template-rows: minmax(0, 1fr) auto;
        gap: 0;
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

      .main-card.first-run-card {
        min-block-size: 0;
        align-content: center;
        padding: clamp(32px, 8svh, 68px) clamp(22px, 6vw, 32px);
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        gap: clamp(24px, 5svh, 40px);
      }

      .main-card.first-run-card::before {
        content: none;
      }

      .main-card.first-run-card + welcome-tools-section {
        padding-inline: clamp(22px, 6vw, 32px);
        padding-block-end: calc(
          var(--app-runtime-safe-area-block-end-active, var(--app-runtime-safe-area-block-end, 0px)) +
            var(--app-spacing-4)
        );
      }

      .welcome-task {
        display: grid;
        gap: var(--app-spacing-5);
        min-inline-size: 0;
      }

      .container[data-viewport-profile='compact'] .main-card.first-run-card,
      .container[data-viewport-profile='condensed'] .main-card.first-run-card {
        padding-block-start: clamp(20px, 4svh, 28px);
        padding-block-end: clamp(16px, 3svh, 24px);
        gap: clamp(18px, 3svh, 24px);
      }

      .locked-vault {
        position: relative;
        isolation: isolate;
        box-sizing: border-box;
        inline-size: auto;
        block-size: calc(
          var(--app-runtime-visual-viewport-block-size, 100dvh) - var(
              --app-runtime-safe-area-block-start,
              0px
            )
        );
        min-block-size: 0;
        padding: var(--app-spacing-1) var(--app-spacing-6) var(--app-spacing-6);
        display: grid;
        gap: var(--app-spacing-5);
        background: var(--welcome-lockscreen-background-gradient);
        color: var(--welcome-lockscreen-foreground);
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior-y: contain;
        scroll-padding-block-end: calc(
          var(--app-runtime-keyboard-scroll-clearance, 0px) + var(--app-spacing-4)
        );
        -webkit-overflow-scrolling: touch;
        grid-template-rows: max-content max-content max-content;
        align-content: start;
      }

      .locked-vault > welcome-tools-section {
        margin-block-end: var(--app-runtime-keyboard-scroll-clearance, 0px);
      }

      .unlock-loading-scrim {
        position: absolute;
        z-index: 2;
        inset: 0;
        background: var(--cv-color-overlay);
        cursor: progress;
        pointer-events: auto;
        touch-action: none;
        animation: unlock-loading-scrim-in var(--cv-duration-normal) var(--cv-easing-decelerate) both;
      }

      @keyframes unlock-loading-scrim-in {
        from {
          opacity: 0;
        }

        to {
          opacity: 1;
        }
      }

      .locked-vault .lockscreen-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--app-spacing-3);
        margin-block-end: var(--app-spacing-4);
      }

      .lockscreen-brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-inline-size: 0;
        color: var(--welcome-lockscreen-foreground);
        font-weight: 650;
        font-size: 0.9375rem;
        letter-spacing: 0.02em;
      }

      .lockscreen-status {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        min-block-size: 28px;
        padding: 0 11px;
        border: 1px solid var(--welcome-lockscreen-border-muted);
        border-radius: var(--cv-radius-pill);
        color: var(--welcome-lockscreen-foreground-subtle);
        font-family: var(--cv-font-family-code);
        font-size: 0.625rem;
        font-weight: 700;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .lockscreen-status span {
        inline-size: 6px;
        block-size: 6px;
        border-radius: 50%;
        background: var(--cv-color-primary);
        box-shadow: 0 0 8px var(--cv-color-primary);
      }

      .locked-vault .main-card {
        display: grid;
        grid-template-rows: auto max-content;
        min-block-size: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        overflow: visible;
      }

      .locked-vault .main-card::before {
        content: none;
      }

      @media (min-width: 700px) {
        .container.first-run-container[data-tablet-viewport] {
          grid-template-rows: max-content max-content;
          align-content: center;
          gap: clamp(20px, 3svh, 32px);
          padding: clamp(48px, 8svh, 88px) clamp(48px, 8vw, 96px)
            calc(
              var(--app-runtime-safe-area-block-end-active, var(--app-runtime-safe-area-block-end, 0px)) +
                clamp(48px, 8svh, 88px)
            );
        }

        .container[data-tablet-viewport] .main-card.first-run-card,
        .locked-vault[data-tablet-viewport] .main-card {
          inline-size: min(560px, 100%);
          justify-self: center;
          grid-template-columns: minmax(0, 1fr);
          gap: clamp(28px, 4svh, 40px);
        }

        .container[data-tablet-viewport] .main-card.first-run-card {
          padding: 0;
        }

        .container[data-tablet-viewport] .main-card.first-run-card + welcome-tools-section {
          inline-size: min(560px, 100%);
          justify-self: center;
          padding-inline: 0;
          padding-block-end: 0;
        }

        .locked-vault[data-tablet-viewport] {
          grid-template-rows: max-content minmax(min-content, 1fr) max-content;
          align-content: stretch;
          gap: clamp(20px, 3svh, 32px);
          padding: max(var(--app-spacing-3), var(--app-runtime-safe-area-block-start, 0px))
            clamp(32px, 6vw, 72px)
            calc(
              var(--app-runtime-safe-area-block-end-active, var(--app-runtime-safe-area-block-end, 0px)) +
                var(--app-spacing-5)
            );
        }

        .locked-vault[data-tablet-viewport] .lockscreen-header,
        .locked-vault[data-tablet-viewport] > welcome-tools-section {
          inline-size: min(560px, 100%);
          justify-self: center;
        }

        .locked-vault[data-tablet-viewport] .lockscreen-header {
          margin-block-end: 0;
        }

        .locked-vault[data-tablet-viewport] .main-card {
          align-self: center;
          padding: clamp(28px, 4vw, 40px);
          border: 1px solid var(--welcome-lockscreen-border-muted);
          border-radius: 22px;
          background: var(--welcome-lockscreen-surface);
          box-shadow: var(--cv-shadow-2);
        }

        .locked-vault[data-tablet-viewport] .welcome-task {
          padding: 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .unlock-loading-scrim {
          animation: none;
        }
      }
    `,
  ]
}
