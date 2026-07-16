import {type CSSResult, css} from 'lit'

import {motionPrimitiveStyles} from 'root/shared/ui/shared-styles'
import {sharedStyles as baseSharedStyles} from 'root/shared/ui/base-shared-styles'

// Common styles and utilities for password manager
// .scrollable: common scrolling styles and thin-scrollbars
// - cv-button: button styles
// - focus / accessibility
export const pmSharedStyles: CSSResult[] = [
  ...baseSharedStyles,
  motionPrimitiveStyles,
  css`
    /* ===== DESIGN TOKENS ===== */
    :host {
      -webkit-tap-highlight-color: transparent;
    }

    :host *,
    :host *::before,
    :host *::after {
      -webkit-tap-highlight-color: transparent;
    }

    /* ===== CV-BUTTON STYLES ===== */
    cv-button:not([unstyled]) {
      --cv-button-font-weight-medium: var(--cv-font-weight-medium);

      &:not([variant]),
      &[variant='default'],
      &[variant='ghost'] {
        &::part(base) {
          background: var(--cv-color-surface-3);
          border: 1px solid var(--pm-control-border);
          color: var(--cv-color-text);
        }

        &:hover::part(base) {
          background: var(--cv-color-surface-4);
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
          background: var(--cv-color-primary-dark);
        }
      }

      &[variant='danger'] {
        &::part(base) {
          background: var(--cv-color-danger-surface-strong);
          border-color: var(--cv-color-danger);
          color: var(--cv-color-danger);
        }

        &:hover::part(base) {
          background: var(--cv-color-danger);
          color: var(--cv-color-danger-text);
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
      background: var(--cv-gradient-divider-subtle);
      margin-block: var(--cv-space-3);
    }

    /* ===== FOCUS STATES ===== */
    *:focus-visible {
      outline: var(--pm-focus-outline);
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
      border-color: var(--pm-focus-border-color);
      outline: var(--pm-focus-outline);
      outline-offset: -2px;
      box-shadow: none;
    }

    /*
     * iOS Safari zooms focused inputs when effective font-size is below 16px.
     * Force 16px for form controls on narrow iOS runtimes.
     */
    @supports (-webkit-touch-callout: none) {
      @media (max-width: 768px) {
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
export {pmMobileListRowStyles} from './mobile-list-row'
