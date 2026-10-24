import {css} from 'lit'

import {
  hostLayoutPaintContainStyles,
  sharedStyles,
} from 'root/shared/ui/shared-styles'
import {routeCalloutStyles} from 'root/shared/ui/route-callout.styles'

export const settingsPageMobileStyles = [
  sharedStyles,
  hostLayoutPaintContainStyles,
  routeCalloutStyles,
  css`
    :host {
      display: block;
      block-size: 100%;
      min-block-size: 0;
      overflow: hidden;
      color: var(--cv-color-text);
      background: var(--cv-color-bg);
    }

    .mobile-page {
      box-sizing: border-box;
      block-size: 100%;
      min-block-size: 0;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-block: var(--app-spacing-3)
        calc(var(--app-spacing-6) + var(--app-mobile-shell-tab-bar-content-clearance, 64px));
      padding-inline-start: max(
        var(--app-spacing-4),
        var(--app-runtime-safe-area-inline-start, 0px)
      );
      padding-inline-end: max(
        var(--app-spacing-4),
        var(--app-runtime-safe-area-inline-end, 0px)
      );
      -webkit-overflow-scrolling: touch;
    }

    .sr-only {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    h1,
    h2,
    h3,
    p {
      margin: 0;
    }

    button,
    input {
      font: inherit;
    }

    a:focus-visible,
    button:focus-visible,
    input:focus-visible {
      outline: 2px solid var(--cv-color-focus-ring, var(--cv-color-info));
      outline-offset: 2px;
    }

    .overview,
    .detail,
    .task,
    .detail-stack,
    .sheet-list,
    .sheet-form {
      display: grid;
      min-inline-size: 0;
    }

    .overview,
    .detail,
    .task,
    .detail-stack {
      gap: var(--app-spacing-4);
    }

    .overview-group,
    .settings-group,
    .danger-zone {
      display: grid;
      min-inline-size: 0;
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface);
    }

    .group-label {
      padding-inline: var(--app-spacing-1);
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .overview-section {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .overview-row,
    .action-row,
    .picker-row {
      box-sizing: border-box;
      inline-size: 100%;
      min-block-size: var(--app-touch-target-min);
      border: 0;
      border-block-start: 1px solid var(--cv-color-border-muted);
      color: inherit;
      background: transparent;
      text-align: start;
      text-decoration: none;
      cursor: pointer;
    }

    .overview-row:first-child,
    .action-row:first-child,
    .picker-row:first-child,
    .preference-row:first-child {
      border-block-start: 0;
    }

    .overview-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: var(--app-spacing-3);
      align-items: center;
      padding: var(--app-spacing-3);
    }

    .overview-icon {
      display: inline-grid;
      place-items: center;
      inline-size: 36px;
      block-size: 36px;
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-2);
      color: var(--cv-color-primary);
      background: var(--cv-color-primary-surface);
    }

    .overview-copy,
    .row-copy,
    .status-copy {
      display: grid;
      gap: var(--app-spacing-1);
      min-inline-size: 0;
    }

    .overview-title,
    .row-title {
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-medium);
      line-height: 1.35;
    }

    .overview-summary,
    .row-description,
    .sheet-option-description {
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .overview-row > cv-icon,
    .action-row > cv-icon,
    .picker-row > cv-icon {
      color: var(--cv-color-text-muted);
      font-size: 18px;
    }

    .preference-row,
    .status-row,
    .action-row,
    .picker-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--app-spacing-3);
      align-items: center;
      min-inline-size: 0;
      padding: var(--app-spacing-3);
      border-block-start: 1px solid var(--cv-color-border-muted);
    }

    .preference-row cv-switch {
      box-sizing: border-box;
      min-block-size: var(--app-touch-target-min);
      padding-block: var(--app-spacing-2);
    }

    .preference-row cv-switch::part(label),
    .preference-row cv-switch::part(help-text) {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .preference-error,
    .sheet-error {
      color: var(--cv-color-danger, var(--cv-color-text-danger));
      font-size: var(--cv-font-size-xs);
      line-height: 1.4;
    }

    .preference-error {
      grid-column: 1 / -1;
    }

    .subsection-label {
      padding: var(--app-spacing-3) var(--app-spacing-3) var(--app-spacing-2);
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-semibold);
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: var(--app-spacing-2);
      max-inline-size: 100%;
      padding: var(--app-spacing-2) var(--app-spacing-3);
      border: 1px solid var(--cv-color-border-muted);
      border-radius: 999px;
      color: var(--cv-color-text);
      background: var(--cv-color-surface-2);
      font-size: var(--cv-font-size-xs);
      line-height: 1.35;
    }

    .status-pill[data-state='selected'] {
      border-color: var(--cv-color-success-border);
      background: var(--cv-color-success-surface);
    }

    .status-pill[data-state='missing'] {
      border-color: var(--cv-color-warning-border);
      background: var(--cv-color-warning-surface);
    }

    .status-dot {
      inline-size: 8px;
      block-size: 8px;
      flex: 0 0 auto;
      border-radius: 50%;
      background: currentColor;
    }

    .provider-capabilities {
      display: grid;
      gap: var(--app-spacing-3);
      margin: var(--app-spacing-3);
    }

    .provider-capability {
      display: grid;
      gap: var(--app-spacing-2);
      min-inline-size: 0;
      padding: var(--app-spacing-3);
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-2);
    }

    .provider-capability-title,
    .provider-note {
      margin: 0;
    }

    .provider-capability-title {
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-semibold);
    }

    .provider-note {
      margin: var(--app-spacing-3);
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
      line-height: 1.45;
    }

    .inline-actions,
    .sheet-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--app-spacing-2);
    }

    .inline-actions,
    .route-callout,
    .provider-steps,
    settings-vault-rekey-form {
      margin: var(--app-spacing-3);
    }

    .provider-steps {
      display: grid;
      gap: var(--app-spacing-2);
      padding-inline-start: var(--app-spacing-5);
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
      line-height: 1.45;
    }

    .danger-zone {
      border-color: var(--cv-color-danger-border, var(--cv-color-border-danger));
    }

    .danger-zone .group-label {
      padding: var(--app-spacing-3);
      color: var(--cv-color-danger, var(--cv-color-text-danger));
    }

    .danger-zone .action-row {
      color: var(--cv-color-danger, var(--cv-color-text-danger));
    }

    .sheet-input {
      box-sizing: border-box;
      inline-size: 100%;
      min-block-size: var(--app-touch-target-min);
      padding: var(--app-spacing-2) var(--app-spacing-3);
      border: 1px solid var(--cv-color-border);
      border-radius: var(--cv-radius-2);
      color: var(--cv-color-text);
      background: var(--cv-color-surface-2);
    }

    .import-success,
    .task-loading {
      display: grid;
      place-items: center;
      gap: var(--app-spacing-3);
      min-block-size: min(55dvh, 440px);
      padding: var(--app-spacing-5);
      text-align: center;
    }

    .import-success p,
    .task-loading p {
      max-inline-size: 34ch;
      color: var(--cv-color-text-muted);
      line-height: 1.5;
    }

    .sheet-list,
    .sheet-form {
      gap: var(--app-spacing-2);
    }

    .sheet-option {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--app-spacing-3);
      min-block-size: var(--app-touch-target-min);
      padding: var(--app-spacing-3);
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-2);
      color: var(--cv-color-text);
      background: var(--cv-color-surface-2);
      text-align: start;
      cursor: pointer;
    }

    .sheet-option[aria-checked='true'] {
      border-color: var(--cv-color-primary);
      background: var(--cv-color-primary-surface);
    }

    .sheet-actions {
      padding-block-start: var(--app-spacing-2);
    }

    @media (max-width: 380px) {
      .mobile-page {
        padding-inline-start: max(
          var(--app-spacing-3),
          var(--app-runtime-safe-area-inline-start, 0px)
        );
        padding-inline-end: max(
          var(--app-spacing-3),
          var(--app-runtime-safe-area-inline-end, 0px)
        );
      }

      .overview-row,
      .preference-row,
      .status-row,
      .action-row,
      .picker-row {
        padding-inline: var(--app-spacing-3);
      }
    }
  `,
]
