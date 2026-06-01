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

      --pm-focus-outline: 2px solid var(--cv-color-focus, var(--cv-color-primary));
      --pm-focus-outline-offset: 0;
      --pm-focus-outline-outer-offset: 2px;
      --pm-focus-outline-inner-offset: -2px;
      --pm-focus-border-color: var(--cv-color-primary-border-strong);
      --pm-active-outline: 2px solid var(--cv-color-primary-ring);
      --pm-active-outline-offset: -2px;

      --pm-divider-gradient: var(--cv-gradient-divider-subtle);
      --pm-surface-gradient: var(--cv-gradient-surface);
      --pm-surface-gradient-primary: var(--cv-gradient-surface-primary);
      --pm-surface-gradient-danger: var(--cv-gradient-surface-danger);
      --pm-control-background: var(--cv-color-surface-3);
      --pm-control-background-hover: var(--cv-color-surface-4);
      --pm-control-background-active: var(--cv-color-primary-surface);
      --pm-control-border: var(--cv-color-border-strong);
      --pm-control-border-muted: var(--cv-color-border-muted);
      --pm-control-border-strong: var(--cv-color-border-strong);
      --pm-control-border-active: var(--cv-color-primary-border-strong);
      --pm-control-border-danger: var(--cv-color-danger-border);
      --pm-control-border-danger-active: var(--cv-color-danger-border-strong);
      --pm-entry-row-icon-color: var(--cv-color-primary);
      --pm-entry-row-icon-background: var(--cv-color-primary-surface);
      --pm-entry-row-background: transparent;
      --pm-entry-row-border: transparent;
      --pm-entry-row-shadow: inset 0 -1px 0 var(--cv-color-border-soft);
      --pm-entry-row-leading-accent: transparent;
      --pm-entry-row-hover-background: var(--cv-color-primary-surface);
      --pm-entry-row-hover-border: var(--cv-color-primary-border-strong);
      --pm-entry-row-hover-leading-accent: var(--cv-color-primary);
      --pm-entry-row-active-background: var(--cv-color-primary-surface-strong);
      --pm-entry-row-active-border: var(--cv-color-primary);
      --pm-entry-row-active-leading-accent: var(--cv-color-primary);
      --pm-list-row-hover-background: var(--cv-color-primary-surface);
      --pm-list-row-hover-border: var(--cv-color-primary-border);
      --pm-list-row-active-background: var(--cv-color-primary-surface-strong);
      --pm-list-row-active-border: var(--cv-color-primary-border-strong);
      --pm-otp-success-surface: var(--cv-color-success-surface-strong);
      --pm-otp-success-border: var(--cv-color-success-border-strong);
      --pm-otp-success-ring: var(--cv-color-success-ring);
      --pm-otp-warning-surface: var(--cv-color-warning-surface-strong);
      --pm-otp-warning-border: var(--cv-color-warning-border-strong);
      --pm-otp-warning-ring: var(--cv-color-warning-ring);
      --pm-otp-danger-surface: var(--cv-color-danger-surface-strong);
      --pm-otp-danger-border: var(--cv-color-danger-border-strong);
      --pm-otp-danger-ring: var(--cv-color-danger-ring);
      --pm-swipe-action-background: var(--cv-alpha-black-10);
      --pm-swipe-action-border: var(--cv-alpha-white-20);
      --pm-strength-color-0: var(--cv-color-danger);
      --pm-strength-color-1: var(--cv-color-warning-dark);
      --pm-strength-color-2: var(--cv-color-warning);
      --pm-strength-color-3: var(--cv-color-success-dark);
      --pm-strength-color-4: var(--cv-color-success);

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
    cv-button:not([unstyled]) {
      &:not([variant]),
      &[variant='default'],
      &[variant='ghost'] {
        &::part(base) {
          background: var(--pm-control-background);
          border: 1px solid var(--pm-control-border);
          color: var(--cv-color-text);
        }

        &:hover::part(base) {
          background: var(--pm-control-background-hover);
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
      background: var(--pm-divider-gradient);
      margin-block: var(--cv-space-3);
    }

    /* ===== FOCUS STATES ===== */
    *:focus-visible {
      outline: var(--pm-focus-outline);
      outline-offset: var(--pm-focus-outline-offset);
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
      outline-offset: var(--pm-focus-outline-inner-offset);
      box-shadow: none;
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
export {pmMobileListRowStyles} from './mobile-list-row'
