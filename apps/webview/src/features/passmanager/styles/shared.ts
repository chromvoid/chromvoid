import {type CSSResult, css} from 'lit'

import {motionPrimitiveStyles} from 'root/shared/ui/shared-styles'
import {sharedStyles as baseSharedStyles} from 'root/shared/ui/base-shared-styles'

// Общие стили и утилиты для менеджера паролей
// - .scrollable: единые стили прокрутки и thin-скроллбары
// - cv-button: стили кнопок
// - focus / accessibility
export const pmSharedStyles: CSSResult[] = [
  ...baseSharedStyles,
  motionPrimitiveStyles,
  css`
    /* ===== DESIGN TOKENS ===== */
    :host {
      -webkit-tap-highlight-color: transparent;

      --cv-gradient-surface: linear-gradient(
        180deg,
        var(--cv-color-surface-2) 0%,
        color-mix(in oklch, var(--cv-color-surface-2) 97%, #0f172a 3%) 100%
      );

      --cv-shadow-subtle: var(--cv-shadow-1);
      --cv-shadow-card: var(--cv-shadow-2);

      /* cv-button specific */
      --cv-button-font-weight-medium: var(--cv-font-weight-medium);
    }

    :host *,
    :host *::before,
    :host *::after {
      -webkit-tap-highlight-color: transparent;
    }

    /* ===== CV-BUTTON STYLES ===== */
    cv-button {
      &:not([variant]),
      &[variant='default'],
      &[variant='ghost'] {
        &::part(base) {
          background: var(--cv-color-surface-3);
          border: 1px solid var(--cv-color-border-strong);
          color: var(--cv-color-text);
        }

        &:hover::part(base) {
          background: var(--cv-color-surface-4, color-mix(in oklch, var(--cv-color-surface-3) 80%, white));
          border-color: var(--cv-color-primary);
          color: var(--cv-color-primary);
        }
      }

      &[variant='primary'] {
        color: var(--cv-color-on-primary);

        &::part(base) {
          background: var(--cv-color-primary);
          border-color: var(--cv-color-primary);
          color: var(--cv-color-on-primary);
        }

        &:hover::part(base) {
          background: color-mix(in oklch, var(--cv-color-primary) 85%, black);
        }
      }

      &[variant='danger'] {
        &::part(base) {
          background: color-mix(in oklch, var(--cv-color-danger) 20%, var(--cv-color-surface-3));
          border-color: var(--cv-color-danger);
          color: var(--cv-color-danger);
        }

        &:hover::part(base) {
          background: var(--cv-color-danger);
          color: white;
        }
      }
    }

    /* ===== SCROLLABLE ===== */
    .scrollable {
      overflow-y: auto;
      overflow-x: hidden;
      contain: layout style;
      scrollbar-gutter: stable both-edges;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
      scrollbar-color: var(--cv-color-border) transparent;

      &::-webkit-scrollbar {
        width: 6px;
      }

      &::-webkit-scrollbar-track {
        background: transparent;
      }

      &::-webkit-scrollbar-thumb {
        background-color: var(--cv-color-border);
        border-radius: 3px;
      }
    }

    /* ===== DIVIDERS ===== */
    .divider {
      height: 1px;
      background: linear-gradient(
        90deg,
        transparent,
        var(--cv-color-border) 20%,
        var(--cv-color-border) 80%,
        transparent
      );
      margin-block: var(--cv-space-3);
    }

    /* ===== FOCUS STATES ===== */
    *:focus-visible {
      outline: 2px solid var(--cv-color-primary);
      outline-offset: 0;
      border-radius: var(--cv-radius-1);
    }

    /* Keep control focus rings inside bounds to avoid visual overflow on mobile cards */
    cv-input::part(base),
    cv-number::part(base),
    cv-textarea::part(base),
    cv-select::part(trigger) {
      outline: none;
      box-shadow: none;
    }

    cv-input:focus-within::part(base),
    cv-number:focus-within::part(base),
    cv-textarea:focus-within::part(base),
    cv-select:focus-within::part(trigger) {
      border-color: color-mix(in oklch, var(--cv-color-primary) 55%, var(--cv-color-border));
      box-shadow: inset 0 0 0 2px color-mix(in oklch, var(--cv-color-primary) 58%, transparent);
    }

    /*
     * iOS Safari zooms focused inputs when effective font-size is below 16px.
     * Force 16px for form controls on touch iOS runtimes.
     */
    @supports (-webkit-touch-callout: none) {
      @media (hover: none) and (pointer: coarse) {
        cv-input::part(input),
        cv-number::part(input),
        cv-textarea::part(textarea),
        cv-select::part(trigger) {
          font-size: 16px;
        }
      }
    }




    /* ===== ACCESSIBILITY ===== */
    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  `,
]

export default pmSharedStyles

// Re-export modular styles for granular imports
export {metadataSectionCSS} from './metadata-section'
export {listItemsCSS, folderItemCSS, emptyStateCSS} from './list-items'
