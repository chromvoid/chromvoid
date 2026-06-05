import {css} from 'lit'

import {
  hostLayoutPaintContainStyles,
  pageFadeInStyles,
  pageTransitionStyles,
  sharedStyles,
  spinIndicatorStyles,
  routeHostStyles,
  routePageStyles,
} from 'root/shared/ui/shared-styles'
import {remoteHostsFlowStyles} from './remote-hosts-flow.styles'

export const remotePageStyles = [
  sharedStyles,
  pageTransitionStyles,
  pageFadeInStyles,
  hostLayoutPaintContainStyles,
  routeHostStyles,
  routePageStyles,
  spinIndicatorStyles,
  remoteHostsFlowStyles,
  css`
    .page {
      max-inline-size: 920px;
      inline-size: 100%;
      padding-inline: var(--app-spacing-4);
      padding-block-end: var(--app-spacing-8);
    }

    .grid {
      display: grid;
      gap: var(--app-spacing-4);
    }

    .card {
      padding: 0;
      background: var(--cv-color-surface);
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-2);
      overflow: hidden;
      box-shadow: inset 0 1px 0 var(--cv-color-surface-highlight);
    }

    .card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--app-spacing-3);
      padding: var(--app-spacing-4);
      background: var(--cv-color-surface-2);
      border-bottom: 1px solid var(--cv-color-border-muted);
    }

    .card-header-actions {
      display: inline-flex;
      align-items: center;
      gap: var(--app-spacing-2);
    }

    .card-title {
      display: grid;
      gap: var(--app-spacing-1);

      .name {
        font-weight: var(--cv-font-weight-semibold);
        font-size: var(--cv-font-size-sm);
      }

      .hint {
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-xs);
      }
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-semibold);
      border: 1px solid var(--cv-color-border-muted);
      background: var(--cv-color-info-surface);
      color: var(--cv-color-text);
      white-space: nowrap;
    }

    .badge.success {
      background: var(--cv-color-success-surface);
      border-color: var(--cv-color-success-border);
    }

    .badge.warning {
      background: var(--cv-color-warning-surface);
      border-color: var(--cv-color-warning-border);
    }

    .badge.danger {
      background: var(--cv-color-danger-surface);
      border-color: var(--cv-color-danger-border);
    }

    .badge.switching {
      background: var(--cv-color-info-surface-strong);
      border-color: var(--cv-color-info-border-strong);
    }
    .card-body {
      padding: var(--app-spacing-4);
      display: grid;
      gap: var(--app-spacing-4);
    }

    .device-list {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .device-item {
      display: flex;
      gap: var(--app-spacing-3);
      align-items: flex-start;
      padding: var(--app-spacing-3);
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface);
    }

    .device-info {
      flex: 1;
      display: grid;
      gap: 4px;
      min-inline-size: 0;
    }

    .device-name {
      font-weight: var(--cv-font-weight-semibold);
      font-size: var(--cv-font-size-sm);
    }

    .device-meta {
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      line-height: 1.35;
    }

    .device-port {
      font-family: var(--cv-font-family-code);
      font-size: var(--cv-font-size-xs);
      color: var(--cv-color-text-muted);
    }

    .device-badges {
      display: flex;
      gap: var(--app-spacing-1);
      flex-shrink: 0;
    }

    .device-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--app-spacing-2);
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .empty-state {
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
      text-align: center;
      padding: var(--app-spacing-4) 0;
    }

    cv-callout.remote-callout {
      text-align: center;
    }

    cv-callout.remote-callout::part(base) {
      justify-content: center;
    }

    cv-callout.remote-callout::part(message) {
      display: grid;
      gap: var(--app-spacing-2);
      min-inline-size: 0;
    }

    .remote-callout-title {
      font-weight: var(--cv-font-weight-semibold);
      color: var(--cv-color-text);
    }

    .remote-callout-text {
      color: var(--cv-color-text-muted);
      line-height: 1.5;
    }

    .lock-polling {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--app-spacing-2);
      font-size: var(--cv-font-size-xs);
      color: var(--cv-color-text-muted);
    }

    .spinner {
      display: inline-block;
      inline-size: 14px;
      block-size: 14px;
      border: 2px solid var(--cv-color-border);
      border-top-color: var(--cv-color-danger);
      border-radius: 50%;
    }

    /* Mode card */

    .mode-card .card-header {
      border-bottom: 0;
    }

    .mode-card .card-body {
      border-top: 1px solid var(--cv-color-border-muted);
    }

    .mode-switching {
      display: flex;
      align-items: center;
      gap: var(--app-spacing-2);
      padding: var(--app-spacing-2) 0;
    }

    .switching-spinner {
      display: inline-block;
      inline-size: 16px;
      block-size: 16px;
      border: 2px solid var(--cv-color-border);
      border-top-color: var(--cv-color-info);
      border-radius: 50%;
    }

    .switching-label {
      font-size: var(--cv-font-size-sm);
      color: var(--cv-color-text-muted);
    }

    .mode-info-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--app-spacing-2);
      padding: var(--app-spacing-1) 0;
    }

    .mode-info-label {
      font-size: var(--cv-font-size-xs);
      color: var(--cv-color-text-muted);
    }

    .mode-info-value {
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-semibold);
    }

    .mode-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--app-spacing-2);
      padding-block-start: var(--app-spacing-2);
    }

    .step {
      display: grid;
      gap: var(--app-spacing-4);
      padding: var(--app-spacing-5);
      background: var(--cv-color-surface);
      border-radius: var(--cv-radius-2);
      border: 1px solid var(--cv-color-border-muted);
    }

    .step.active {
      border-color: var(--cv-color-primary-border-strong);
      box-shadow:
        inset 0 1px 0 var(--cv-color-surface-highlight),
        0 0 0 1px var(--cv-color-primary-ring);
    }

    .step-title {
      font-weight: var(--cv-font-weight-semibold);
      font-size: var(--cv-font-size-sm);
      color: var(--cv-color-text);
    }

    .step-desc {
      font-size: var(--cv-font-size-sm);
      color: var(--cv-color-text-muted);
      line-height: 1.5;
      max-inline-size: 54ch;
    }

    .mode-badge {
      font-size: 0.7rem;
      font-family: var(--cv-font-family-code);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 4px var(--app-spacing-2);
      background: var(--cv-color-surface-3);
      border-radius: var(--cv-radius-pill);
      color: var(--cv-color-text-subtle);
      justify-self: start;
      margin-top: var(--app-spacing-1);
    }

    .remote-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--app-spacing-3);
      margin-top: var(--app-spacing-2);
    }

    .remote-actions cv-button {
      width: auto;
      flex: 0 1 auto;
    }

    .remote-actions cv-button:first-child {
      flex: 1 1 180px;
      max-inline-size: 260px;
    }

    .remote-peer-list {
      display: grid;
      gap: var(--app-spacing-3);
      margin-top: var(--app-spacing-3);
    }

    .remote-peer {
      display: grid;
      gap: var(--app-spacing-3);
      padding: var(--app-spacing-4);
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface);
    }

    .remote-peer-main {
      display: grid;
      gap: var(--app-spacing-1);
    }

    .remote-peer-title {
      font-weight: var(--cv-font-weight-semibold);
      color: var(--cv-color-text);
    }

    .remote-peer-meta {
      font-size: var(--cv-font-size-xs);
      color: var(--cv-color-text-muted);
      word-break: break-all;
    }

    .remote-peer-badges {
      display: flex;
      flex-wrap: wrap;
      gap: var(--app-spacing-2);
    }

    .remote-peer-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--app-spacing-2);
    }

    .status-success {
      background: var(--cv-color-success-surface);
      color: var(--cv-color-success, #16a34a);
    }

    .status-warning {
      background: var(--cv-color-warning-surface);
      color: var(--cv-color-warning-text, #b45309);
    }

    .status-danger {
      background: var(--cv-color-danger-surface);
      color: var(--cv-color-danger-text, #b91c1c);
    }

    .status-neutral {
      background: var(--cv-color-surface-3);
      color: var(--cv-color-text-muted);
    }

    .empty-remote-state {
      display: grid;
      gap: var(--app-spacing-3);
      padding: var(--app-spacing-5);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface);
      border: 1px dashed var(--cv-color-border-muted);
      text-align: left;
      margin-top: var(--app-spacing-2);
    }

    .remote-form-grid {
      display: grid;
      gap: var(--app-spacing-3);
      margin-top: var(--app-spacing-1);
    }

    .remote-field {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .remote-field-label {
      font-size: var(--cv-font-size-xs);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--cv-color-text-muted);
      line-height: 1.3;
    }

    .remote-textarea {
      min-height: 160px;
    }

    cv-textarea::part(textarea) {
      min-height: 160px;
    }

    .pin-panel,
    .remote-presence-panel {
      display: grid;
      gap: var(--app-spacing-2);
      padding: var(--app-spacing-4);
      border-radius: var(--cv-radius-2);
      border: 1px solid var(--cv-color-border-muted);
      background: var(--cv-color-surface-2);
    }

    .pin-value,
    .mono {
      font-family: var(--cv-font-family-code);
    }

    /* Sync status card (Task 13) */

    .sync-status-card .card-header-actions {
      gap: var(--app-spacing-2);
    }

    .sync-spinner {
      display: inline-block;
      inline-size: 14px;
      block-size: 14px;
      border: 2px solid var(--cv-color-border);
      border-top-color: var(--cv-color-warning);
      border-radius: 50%;
    }

    /* Writer lock card (Task 13) */

    .writer-lock-info {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .writer-lock-holder {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--app-spacing-2);
    }

    .writer-lock-message {
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
      line-height: 1.5;
    }

    /* Writer access indicator (Task 13 QA fix) */

    .writer-access-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--app-spacing-2);
      padding: var(--app-spacing-2) var(--app-spacing-4);
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface);
    }

    .writer-access-label {
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-semibold);
    }

    .writer-access-label.unlocked {
      color: var(--cv-color-success);
    }

    .writer-access-label.locked {
      color: var(--cv-color-danger);
    }
  `,
]
