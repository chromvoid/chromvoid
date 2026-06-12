import {css} from 'lit'

import {
  hostLayoutPaintContainStyles,
  pageFadeInStyles,
  pageTransitionStyles,
  routeHostStyles,
  routePageStyles,
  sharedStyles,
} from 'root/shared/ui/shared-styles'
import {routeCardStyles} from 'root/shared/ui/route-card.styles'
import {routeCalloutStyles} from 'root/shared/ui/route-callout.styles'
import {routeEmptyStateStyles} from 'root/shared/ui/route-empty-state.styles'

export const gatewayPageStyles = [
  sharedStyles,
  pageTransitionStyles,
  pageFadeInStyles,
  hostLayoutPaintContainStyles,
  routeHostStyles,
  routePageStyles,
  routeCardStyles,
  routeCalloutStyles,
  routeEmptyStateStyles,
  css`
    :host {
      --route-card-border-color: var(--cv-color-border);
      --route-card-radius: var(--cv-radius-3);
      --route-card-header-padding: var(--app-spacing-3) var(--app-spacing-4);
      --route-card-title-gap: 2px;
      --route-badge-border-color: var(--cv-color-border);
      --route-card-body-gap: var(--app-spacing-3);
      --route-callout-base-justify-content: center;
      --route-callout-text-align: center;
    }

    .page {
      max-inline-size: 920px;
    }

    .grid {
      display: grid;
      gap: var(--app-spacing-3);
    }

    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--app-spacing-3);
      min-block-size: 40px;
    }

    .setting-label {
      font-size: var(--cv-font-size-sm);
      color: var(--cv-color-text);
    }

    .setting-select {
      padding: 6px 12px;
      border-radius: var(--cv-radius-2);
      border: 1px solid var(--cv-color-border);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);
      cursor: pointer;

      &:focus {
        outline: none;
        border-color: var(--cv-color-brand);
      }
    }

    .toggle {
      position: relative;
      display: inline-block;
      inline-size: 44px;
      block-size: 24px;
      flex-shrink: 0;
    }

    .toggle input {
      opacity: 0;
      inline-size: 0;
      block-size: 0;
    }

    .toggle-track {
      position: absolute;
      inset: 0;
      border-radius: 12px;
      background: var(--cv-color-border);
      cursor: pointer;
      transition: background 0.2s;
    }

    .toggle-track::after {
      content: '';
      position: absolute;
      inset-block-start: 2px;
      inset-inline-start: 2px;
      inline-size: 20px;
      block-size: 20px;
      border-radius: 50%;
      background: var(--cv-color-text);
      transition: transform 0.2s;
    }

    .toggle input:checked + .toggle-track {
      background: var(--cv-color-success);
    }

    .toggle input:checked + .toggle-track::after {
      transform: translateX(20px);
    }

    .ext-id {
      font-family: var(--cv-font-family-code);
      font-size: var(--cv-font-size-sm);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .pin-display {
      display: flex;
      justify-content: center;
      gap: 8px;
      padding: var(--app-spacing-3) 0;
    }

    .pin-digit {
      display: flex;
      align-items: center;
      justify-content: center;
      inline-size: 48px;
      block-size: 56px;
      border: 2px solid var(--cv-color-brand);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-2);
      font-size: 1.5rem;
      font-weight: var(--cv-font-weight-bold);
      font-family: var(--cv-font-family-code);
      color: var(--cv-color-text);
      letter-spacing: 0;
    }

    .countdown {
      text-align: center;
      font-size: var(--cv-font-size-sm);
      color: var(--cv-color-text-muted);
    }

    .countdown.warn {
      color: var(--cv-color-warning);
    }

    .progress-bar {
      height: 6px;
      background: var(--cv-color-surface-2);
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      background: var(--cv-color-brand);
      border-radius: 3px;
      inline-size: var(--gateway-pairing-progress, 0%);
      transition: inline-size 1s linear;
    }

    .progress-bar-fill.warn {
      background: var(--cv-color-warning);
    }

    .progress-bar-fill.danger {
      background: var(--cv-color-danger);
    }

    .attempts {
      text-align: center;
      font-size: var(--cv-font-size-xs);
      color: var(--cv-color-text-muted);
    }

    .pairing-actions {
      display: flex;
      justify-content: center;
      gap: var(--app-spacing-2);
      padding-block-start: var(--app-spacing-2);
    }

    .ext-actions {
      --route-item-actions-gap: var(--app-spacing-1);
      --route-item-actions-wrap: nowrap;
    }

    .grant-list {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .grant-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--app-spacing-2);
      padding: var(--app-spacing-2) var(--app-spacing-3);
      background: var(--cv-color-surface-2);
      border-radius: var(--cv-radius-2);
      font-size: var(--cv-font-size-sm);
    }

    .grant-origin {
      font-family: var(--cv-font-family-code);
      font-size: var(--cv-font-size-xs);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .grant-ttl {
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      white-space: nowrap;
    }

    .policy-section {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .policy-section-title {
      font-weight: var(--cv-font-weight-semibold);
      font-size: var(--cv-font-size-sm);
      color: var(--cv-color-text-muted);
    }

    .allowlist-editor {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .allowlist-row {
      display: flex;
      align-items: center;
      gap: var(--app-spacing-2);
    }

    .allowlist-input {
      flex: 1;
      padding: 6px 12px;
      border-radius: var(--cv-radius-2);
      border: 1px solid var(--cv-color-border);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);
      font-family: var(--cv-font-family-code);
    }

    .allowlist-input:focus {
      outline: none;
      border-color: var(--cv-color-brand);
    }

    .allowlist-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--app-spacing-2);
      padding: 4px var(--app-spacing-2);
      background: var(--cv-color-surface-2);
      border-radius: var(--cv-radius-1);
      font-family: var(--cv-font-family-code);
      font-size: var(--cv-font-size-xs);
    }
  `,
]
