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

export const remotePageStyles = [
  sharedStyles,
  pageTransitionStyles,
  pageFadeInStyles,
  hostLayoutPaintContainStyles,
  routeHostStyles,
  routePageStyles,
  spinIndicatorStyles,
  css`
    .page {
      max-inline-size: 920px;
    }

    .grid {
      display: grid;
      gap: var(--app-spacing-3);
    }

    .card {
      background: var(--cv-color-surface);
      border: 1px solid var(--cv-color-border);
      border-radius: var(--cv-radius-3);
      overflow: hidden;
    }

    .card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--app-spacing-3);
      padding: var(--app-spacing-3) var(--app-spacing-4);
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
      gap: 2px;

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
      border: 1px solid var(--cv-color-border);
      background: color-mix(in oklch, var(--cv-color-info) 10%, var(--cv-color-surface));
      color: var(--cv-color-text);
      white-space: nowrap;
    }

    .badge.success {
      background: color-mix(in oklch, var(--cv-color-success) 15%, var(--cv-color-surface));
      border-color: color-mix(in oklch, var(--cv-color-success) 30%, var(--cv-color-border));
    }

    .badge.warning {
      background: color-mix(in oklch, var(--cv-color-warning) 15%, var(--cv-color-surface));
      border-color: color-mix(in oklch, var(--cv-color-warning) 30%, var(--cv-color-border));
    }

    .badge.danger {
      background: color-mix(in oklch, var(--cv-color-danger) 15%, var(--cv-color-surface));
      border-color: color-mix(in oklch, var(--cv-color-danger) 30%, var(--cv-color-border));
    }

    .badge.switching {
      background: color-mix(in oklch, var(--cv-color-info) 20%, var(--cv-color-surface));
      border-color: color-mix(in oklch, var(--cv-color-info) 40%, var(--cv-color-border));
    }
    .card-body {
      padding: var(--app-spacing-4);
      display: grid;
      gap: var(--app-spacing-3);
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

    .hint-block {
      display: grid;
      gap: var(--app-spacing-2);
      padding: var(--app-spacing-3);
      border-radius: var(--cv-radius-2);
      border: 1px solid color-mix(in oklch, var(--cv-color-warning) 30%, var(--cv-color-border));
      background: color-mix(in oklch, var(--cv-color-warning) 10%, var(--cv-color-surface));
      color: var(--cv-color-text);
      text-align: center;

      .hint-title {
        font-weight: var(--cv-font-weight-semibold);
      }

      .hint-text {
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-sm);
        line-height: 1.5;
      }
    }

    .hint-block.info {
      border-color: color-mix(in oklch, var(--cv-color-info) 30%, var(--cv-color-border));
      background: color-mix(in oklch, var(--cv-color-info) 10%, var(--cv-color-surface));
    }

    .hint-block.danger {
      border-color: color-mix(in oklch, var(--cv-color-danger) 30%, var(--cv-color-border));
      background: color-mix(in oklch, var(--cv-color-danger) 10%, var(--cv-color-surface));
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

    .peer-select-group {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .peer-list {
      display: flex;
      flex-wrap: wrap;
      gap: var(--app-spacing-1);
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
