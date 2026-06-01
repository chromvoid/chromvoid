import {css} from 'lit'
import {
  hostLayoutPaintContainStyles,
  pageFadeInStyles,
  pageTransitionStyles,
  sharedStyles,
} from 'root/shared/ui/shared-styles'

export const welcomeStyles = [
  sharedStyles,
  pageTransitionStyles,
  pageFadeInStyles,
  hostLayoutPaintContainStyles,
  css`
    :host {
      display: grid;
      min-height: 100%;
      justify-items: center;
      align-content: start;
      padding: var(--app-spacing-7) var(--app-spacing-6);
      background: var(--cv-color-hover);
      box-sizing: border-box;
    }

    .container {
      display: grid;
      gap: var(--app-spacing-7);
      width: min(820px, 100%);
      grid-template-columns: 1fr;
    }

    @media (min-width: 768px) {
      .container {
        grid-template-columns: 1fr 320px;
        align-items: start;
      }
    }

    .main-card {
      background: var(--cv-color-surface);
      border-radius: 16px;
      padding: var(--app-spacing-7);
      box-shadow: var(--cv-shadow-2);
      display: grid;
      gap: var(--app-spacing-6);
    }

    .main-card > cv-callout {
      font-size: 0.875rem;
      line-height: 1.4;
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

    @media print {
      :host {
        display: block;
        background: white;
        color: black;
        padding: 0;
        height: auto;
        min-height: auto;
      }

      .container {
        display: none;
      }
    }
  `,
]
