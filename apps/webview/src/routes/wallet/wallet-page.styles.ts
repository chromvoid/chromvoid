import {css} from 'lit'

import {
  hostLayoutPaintContainStyles,
  pageFadeInStyles,
  pageTransitionStyles,
  routeHostStyles,
  routePageStyles,
  sharedStyles,
} from 'root/shared/ui/shared-styles'
import {routeCalloutStyles} from 'root/shared/ui/route-callout.styles'
import {routeCardStyles} from 'root/shared/ui/route-card.styles'
import {walletReceiveStyles} from './wallet-receive.styles'

export const walletPageStyles = [
  sharedStyles,
  pageTransitionStyles,
  pageFadeInStyles,
  hostLayoutPaintContainStyles,
  routeHostStyles,
  routePageStyles,
  routeCardStyles,
  routeCalloutStyles,
  walletReceiveStyles,
  css`
    :host {
      display: block;
      block-size: 100%;
      min-block-size: 0;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      --app-route-card-background: var(--app-editorial-surface-elevated, var(--cv-color-surface-elevated));
      --app-route-card-border-color: var(--app-editorial-border-subtle, var(--cv-alpha-white-8));
      --app-route-card-radius: var(--cv-radius-md, 8px);
      --app-route-card-padding: var(--app-spacing-4);
    }

    .page {
      max-inline-size: 1180px;
      gap: var(--app-spacing-4);
    }

    .wallet-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--app-spacing-3);
      align-items: end;
    }

    .wallet-heading {
      display: grid;
      gap: var(--app-spacing-1);
      min-inline-size: 0;
    }

    .eyebrow,
    .meta,
    .label {
      color: var(--app-editorial-text-tertiary, var(--cv-alpha-white-50));
      font-size: var(--cv-font-size-xs);
    }

    h1,
    h2,
    h3,
    p {
      margin: 0;
    }

    h1 {
      color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
      font-size: var(--cv-font-size-2xl);
      font-weight: var(--cv-font-weight-semibold);
    }

    h2 {
      color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
      font-size: var(--cv-font-size-lg);
      font-weight: var(--cv-font-weight-semibold);
    }

    h3 {
      color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
      font-size: var(--cv-font-size-base);
      font-weight: var(--cv-font-weight-semibold);
    }

    .muted {
      color: var(--app-editorial-text-tertiary, var(--cv-alpha-white-50));
      font-size: var(--cv-font-size-sm);
      line-height: 1.5;
    }

    .toolbar,
    .actions,
    .tabs,
    .row-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--app-spacing-2);
      align-items: center;
    }

    .tabs {
      padding: var(--app-spacing-1);
      border: 1px solid var(--app-editorial-border-subtle, var(--cv-alpha-white-8));
      border-radius: var(--cv-radius-md, 8px);
      background: var(--app-editorial-surface-muted, var(--cv-color-surface-3));
    }

    button,
    select,
    input,
    textarea {
      font: inherit;
    }

    button {
      display: inline-flex;
      min-block-size: 36px;
      align-items: center;
      justify-content: center;
      gap: var(--app-spacing-2);
      border: 1px solid var(--app-editorial-border-subtle, var(--cv-alpha-white-8));
      border-radius: var(--cv-radius-md, 8px);
      padding: 0 var(--app-spacing-3);
      color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
      background: var(--app-editorial-surface-muted, var(--cv-color-surface-3));
      cursor: pointer;
    }

    button.primary {
      border-color: var(--cv-color-accent-border-strong, var(--cv-color-accent));
      color: var(--cv-color-accent-contrast, var(--cv-color-bg));
      background: var(--cv-color-accent);
    }

    button.ghost {
      background: transparent;
    }

    button.active {
      border-color: var(--cv-color-accent-border, var(--cv-color-accent));
      color: var(--cv-color-accent);
      background: var(--cv-color-accent-surface, var(--app-editorial-surface-muted));
    }

    button:disabled {
      cursor: default;
      opacity: 0.55;
    }

    cv-icon {
      font-size: 17px;
    }

    .wallet-grid {
      display: grid;
      grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
      gap: var(--app-spacing-4);
      align-items: start;
    }

    .account-list,
    .panel,
    .section,
    .form {
      display: grid;
      gap: var(--app-spacing-3);
    }

    .setup-fieldset {
      display: grid;
      min-inline-size: 0;
      gap: var(--app-spacing-2);
      margin: 0;
      border: 0;
      padding: 0;
    }

    .setup-fieldset legend {
      margin-block-end: var(--app-spacing-2);
      padding: 0;
      color: var(--app-editorial-text-secondary, var(--cv-color-text-muted));
      font-size: var(--cv-font-size-sm);
    }

    .profile-options,
    .network-options {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--app-spacing-2);
    }

    .network-options {
      grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    }

    .choice-option {
      display: flex;
      min-inline-size: 0;
      min-block-size: 44px;
      gap: var(--app-spacing-2);
      align-items: flex-start;
      border: 1px solid var(--app-editorial-border-subtle, var(--cv-alpha-white-8));
      border-radius: var(--cv-radius-md, 8px);
      padding: var(--app-spacing-3);
      color: var(--app-editorial-text-secondary, var(--cv-color-text-muted));
      background: var(--app-editorial-surface-muted, var(--cv-color-surface-3));
      cursor: pointer;
    }

    .choice-option:has(input:checked) {
      border-color: var(--cv-color-accent-border, var(--cv-color-accent));
      background: var(--cv-color-accent-surface, var(--app-editorial-surface-muted));
    }

    .choice-option:has(input:focus-visible) {
      outline: 2px solid var(--cv-color-accent);
      outline-offset: 2px;
    }

    .choice-option.compact {
      align-items: center;
      padding: var(--app-spacing-2) var(--app-spacing-3);
    }

    .choice-option input {
      flex: 0 0 auto;
      inline-size: auto;
      block-size: 1em;
      margin-block-start: 0.2em;
      border: 0;
      padding: 0;
      accent-color: var(--cv-color-accent);
    }

    .choice-copy {
      display: grid;
      min-inline-size: 0;
      gap: var(--app-spacing-1);
      line-height: 1.4;
    }

    .choice-copy strong,
    .profile-summary strong {
      color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
    }

    .field-hint {
      color: var(--app-editorial-text-tertiary, var(--cv-alpha-white-50));
      font-size: var(--cv-font-size-xs);
      line-height: 1.45;
    }

    .setup-note {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--app-spacing-2);
      align-items: start;
      margin: 0;
      color: var(--app-editorial-text-secondary, var(--cv-color-text-muted));
      font-size: var(--cv-font-size-sm);
      line-height: 1.45;
    }

    .setup-note cv-icon {
      margin-block-start: 0.15em;
      color: var(--cv-color-accent);
    }

    .setup-note span {
      display: grid;
      gap: var(--app-spacing-1);
    }

    .setup-note strong {
      color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
    }

    .loading-spinner {
      animation: spin var(--app-motion-spin-duration) linear infinite;
    }

    @media (prefers-reduced-motion: reduce) {
      .loading-spinner {
        animation: none;
      }
    }

    .profile-summary {
      display: grid;
      gap: var(--app-spacing-1);
      padding: var(--app-spacing-3);
      border-inline-start: 3px solid var(--cv-color-accent);
      color: var(--app-editorial-text-secondary, var(--cv-color-text-muted));
      background: var(--app-editorial-surface-muted, var(--cv-color-surface-3));
      font-size: var(--cv-font-size-sm);
    }

    .account-list-header {
      display: flex;
      flex-wrap: wrap;
      gap: var(--app-spacing-2);
      align-items: center;
      justify-content: space-between;
    }

    .account-add-button {
      flex: 0 0 auto;
      white-space: nowrap;
    }

    cv-dialog.wallet-dialog {
      --cv-dialog-width: var(--cv-dialog-width-s);
    }

    cv-dialog.receive-dialog {
      --cv-dialog-width: var(--cv-dialog-width-m);
    }

    .wallet-dialog .wallet-option-list {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .wallet-dialog .wallet-option {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      min-block-size: 68px;
      align-items: center;
      gap: var(--app-spacing-3);
      padding: var(--app-spacing-3);
      text-align: start;
    }

    .wallet-dialog .wallet-option > span:nth-child(2) {
      display: grid;
      min-inline-size: 0;
      gap: var(--app-spacing-1);
    }

    .wallet-dialog .wallet-option > span:nth-child(2) > span {
      overflow: hidden;
      color: var(--app-editorial-text-tertiary, var(--cv-color-text-muted));
      font-size: var(--cv-font-size-xs);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wallet-dialog .wallet-option.selected {
      border-color: var(--cv-color-accent);
      background: var(--cv-color-accent-surface, var(--cv-color-surface-secondary));
    }

    .wallet-dialog .wallet-avatar {
      display: inline-grid;
      inline-size: 40px;
      block-size: 40px;
      place-items: center;
      border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
      border-radius: var(--cv-radius-md);
      color: var(--cv-color-accent);
      background: var(--cv-color-accent-surface, var(--cv-color-surface-secondary));
    }

    .account-button {
      justify-content: start;
      min-block-size: auto;
      padding: var(--app-spacing-3);
      text-align: start;
    }

    .account-copy,
    .tx-ref,
    .mnemonic-grid {
      overflow-wrap: anywhere;
    }

    .summary-grid,
    .status-callouts,
    .send-preview,
    .activity-list {
      display: grid;
      gap: var(--app-spacing-3);
    }

    .summary-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .metric {
      display: grid;
      gap: var(--app-spacing-1);
      padding: var(--app-spacing-3);
      border: 1px solid var(--app-editorial-border-subtle, var(--cv-alpha-white-8));
      border-radius: var(--cv-radius-md, 8px);
      background: var(--app-editorial-surface-muted, var(--cv-color-surface-3));
    }

    .metric strong {
      color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
      font-size: var(--cv-font-size-xl);
      font-weight: var(--cv-font-weight-semibold);
    }

    .ton-preview .metric strong {
      font-size: var(--cv-font-size-base);
    }

    .status-callout {
      display: grid;
      gap: var(--app-spacing-1);
      padding: var(--app-spacing-3);
      border: 1px solid var(--cv-color-warning-border, var(--app-editorial-border-subtle));
      border-radius: var(--cv-radius-md, 8px);
      background: var(--cv-color-warning-surface, var(--app-editorial-surface-muted));
    }

    label {
      display: grid;
      gap: var(--app-spacing-1);
      color: var(--app-editorial-text-secondary, var(--cv-color-text-muted));
      font-size: var(--cv-font-size-sm);
    }

    input,
    select,
    textarea {
      box-sizing: border-box;
      inline-size: 100%;
      border: 1px solid var(--app-editorial-border-subtle, var(--cv-alpha-white-8));
      border-radius: var(--cv-radius-md, 8px);
      padding: var(--app-spacing-2) var(--app-spacing-3);
      color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
      background: var(--app-editorial-surface-muted, var(--cv-color-surface-3));
    }

    textarea {
      min-block-size: 96px;
      resize: vertical;
    }

    .mnemonic-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--app-spacing-2);
      padding: var(--app-spacing-3);
      border: 1px solid var(--cv-color-warning-border, var(--app-editorial-border-subtle));
      border-radius: var(--cv-radius-md, 8px);
      background: var(--cv-color-warning-surface, var(--app-editorial-surface-muted));
    }

    .mnemonic-word {
      display: grid;
      grid-template-columns: 2ch minmax(0, 1fr);
      gap: var(--app-spacing-2);
      font-family: var(--cv-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
      font-size: var(--cv-font-size-xs);
    }

    .notice {
      display: grid;
      gap: var(--app-spacing-1);
      padding: var(--app-spacing-3);
      border: 1px solid var(--cv-color-info-border);
      border-radius: var(--cv-radius-md, 8px);
      color: var(--cv-color-info);
      background: var(--cv-color-info-surface);
    }

    .error {
      display: grid;
      gap: var(--app-spacing-1);
      padding: var(--app-spacing-3);
      border: 1px solid var(--cv-color-danger-border, var(--cv-color-border-danger));
      border-radius: var(--cv-radius-md, 8px);
      color: var(--cv-color-danger, var(--cv-color-text-danger));
      background: var(--cv-color-danger-surface, transparent);
    }

    .activity-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--app-spacing-3);
      align-items: center;
      padding: var(--app-spacing-3);
      border: 1px solid var(--app-editorial-border-subtle, var(--cv-alpha-white-8));
      border-radius: var(--cv-radius-md, 8px);
      background: var(--app-editorial-surface-muted, var(--cv-color-surface-3));
    }

    .activity-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--app-spacing-2);
      justify-content: end;
    }

    .rebroadcast-confirmation {
      display: grid;
      grid-column: 1 / -1;
      gap: var(--app-spacing-3);
      padding-block-start: var(--app-spacing-2);
      border-block-start: 1px solid var(--app-editorial-border-subtle, var(--cv-alpha-white-8));
    }

    .check-row {
      display: flex;
      gap: var(--app-spacing-2);
      align-items: start;
      color: var(--app-editorial-text-secondary, var(--cv-color-text-muted));
      font-size: var(--cv-font-size-sm);
    }

    .check-row input {
      inline-size: auto;
      margin-block-start: 0.2em;
    }

    @media (max-width: 767px) {
      .page {
        box-sizing: border-box;
        padding-block-start: var(--app-spacing-4);
        padding-block-end: calc(
          var(--app-spacing-8) + var(--app-mobile-shell-tab-bar-content-clearance, 64px)
        );
        padding-inline-start: max(
          var(--app-spacing-4),
          var(--app-runtime-safe-area-inline-start, 0px)
        );
        padding-inline-end: max(
          var(--app-spacing-4),
          var(--app-runtime-safe-area-inline-end, 0px)
        );
      }

      .wallet-header,
      .wallet-grid,
      .summary-grid,
      .activity-row {
        grid-template-columns: minmax(0, 1fr);
      }

      .activity-actions {
        justify-content: stretch;
      }

      .activity-actions button {
        flex: 1 1 auto;
      }

      .tabs,
      .toolbar {
        align-items: stretch;
      }

      .tabs button,
      .toolbar button {
        flex: 1 1 auto;
        min-block-size: 44px;
      }

      .profile-options {
        grid-template-columns: minmax(0, 1fr);
      }

      .network-options {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .actions button,
      .row-actions button {
        min-block-size: 44px;
      }

      .mnemonic-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 359px) {
      .network-options {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
]
