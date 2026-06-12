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
import {routeCardStyles} from 'root/shared/ui/route-card.styles'
import {routeCalloutStyles} from 'root/shared/ui/route-callout.styles'
import {routeEmptyStateStyles} from 'root/shared/ui/route-empty-state.styles'
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
  routeCardStyles,
  routeCalloutStyles,
  routeEmptyStateStyles,
  css`
    :host {
      --route-card-padding: 0;
      --route-card-shadow: inset 0 1px 0 var(--cv-color-surface-highlight);
      --route-callout-base-justify-content: center;
      --route-callout-text-align: center;
    }

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

    .device-name {
      font-weight: var(--cv-font-weight-semibold);
      font-size: var(--cv-font-size-sm);
    }

    .device-port {
      font-family: var(--cv-font-family-code);
      font-size: var(--cv-font-size-xs);
      color: var(--cv-color-text-muted);
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
