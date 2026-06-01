import {css} from 'lit'

import {hostLayoutPaintContainStyles, motionPrimitiveStyles} from 'root/shared/ui/shared-styles'

export const notesQuickViewStyles = [
  hostLayoutPaintContainStyles,
  motionPrimitiveStyles,
  css`
    :host {
      display: block;
      block-size: 100%;
      min-inline-size: 0;
      color: var(--cv-color-text);
    }

    .quick-view {
      display: grid;
      align-content: start;
      gap: var(--cv-space-3);
      min-block-size: 100%;
      min-inline-size: 0;
    }

    .quick-view__header {
      display: grid;
      gap: var(--cv-space-3);
      min-inline-size: 0;
      padding-inline: 0;
    }

    .quick-view__summary-rail {
      inline-size: 100%;
      box-sizing: border-box;
      --pm-summary-rail-inline-size: 100%;
    }

    .controls {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      inline-size: 100%;
      min-inline-size: 0;
      box-sizing: border-box;
    }

    .view-switch {
      display: inline-grid;
      grid-template-columns: repeat(2, 32px);
      gap: 2px;
      flex: 0 0 auto;
      min-block-size: 34px;
      padding: 2px;
      border: 1px solid var(--cv-color-border);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-2);
    }

    .view-switch__button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 100%;
      block-size: 28px;
      padding: 0;
      border: 0;
      border-radius: var(--cv-radius-2);
      background: transparent;
      color: var(--cv-color-text-muted);
      cursor: pointer;
    }

    .view-switch__button:hover {
      color: var(--cv-color-text);
    }

    .view-switch__button[aria-pressed='true'] {
      background: var(--cv-color-surface-secondary-glass-soft);
      color: var(--cv-color-text);
    }

    .search {
      flex: 1 1 auto;
      max-inline-size: none;
      min-inline-size: 0;
      block-size: 34px;
      padding: 0 var(--cv-space-3);
      border: 1px solid var(--cv-color-border);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      font: inherit;
      font-size: var(--cv-font-size-sm);
      outline: none;
    }

    .search:focus-visible {
      border-color: var(--cv-color-accent);
      box-shadow: 0 0 0 2px var(--cv-color-accent-ring);
    }

    .clear-filters,
    .folder-toggle {
      border: 0;
      color: var(--cv-color-text-muted);
      font: inherit;
      font-size: var(--cv-font-size-xs);
      cursor: pointer;
    }

    .clear-filters:focus-visible,
    .folder-toggle:focus-visible,
    .view-switch__button:focus-visible {
      outline: 2px solid var(--cv-color-accent);
      outline-offset: 2px;
    }

    .clear-filters {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--cv-space-1);
      min-block-size: 34px;
      padding: 0 var(--cv-space-3);
      border: 1px solid var(--cv-color-border);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-2);
    }

    .clear-filters--compact {
      flex: 0 0 auto;
      inline-size: 34px;
      padding: 0;
    }

    .rows {
      display: grid;
      gap: 6px;
      min-inline-size: 0;
    }

    .tree {
      display: grid;
      gap: 6px;
      min-inline-size: 0;
    }

    .tree-folder {
      display: grid;
      gap: 6px;
      min-inline-size: 0;
    }

    .tree-children {
      display: grid;
      gap: 6px;
      min-inline-size: 0;
      padding-inline-start: var(--cv-space-4);
      border-inline-start: 1px solid var(--cv-color-border);
      margin-inline-start: 15px;
    }

    .row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: var(--cv-space-2);
      min-inline-size: 0;
      padding: var(--cv-space-2);
      border: 0;
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-secondary-glass-soft);
      cursor: pointer;
    }

    .row--tree {
      background: color-mix(in oklab, var(--cv-color-surface-secondary-glass-soft), transparent 18%);
    }

    .row:hover {
      background: var(--cv-color-surface-2);
    }

    .row:active {
      background: color-mix(in oklab, var(--cv-color-surface-2), var(--cv-color-accent) 8%);
    }

    .row:focus-visible {
      outline: 2px solid var(--cv-color-accent);
      outline-offset: 2px;
    }

    .folder-row {
      display: grid;
      grid-template-columns: 28px 28px minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--cv-space-2);
      min-inline-size: 0;
      padding: var(--cv-space-2);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-2);
    }

    .folder-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 28px;
      block-size: 28px;
      padding: 0;
      border-radius: var(--cv-radius-2);
      background: transparent;
    }

    .folder-toggle:hover {
      background: var(--cv-color-surface-secondary-glass-soft);
      color: var(--cv-color-text);
    }

    .folder-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 28px;
      block-size: 28px;
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-secondary-glass-soft);
      color: var(--cv-color-text-muted);
    }

    .folder-icon cv-icon {
      --cv-icon-size: 18px;
    }

    .folder-name {
      min-inline-size: 0;
      overflow: hidden;
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);
      font-weight: 680;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .folder-count {
      color: var(--cv-color-text-muted);
      font-family: var(--cv-font-family-code);
      font-size: var(--cv-font-size-xs);
      line-height: 1.2;
      white-space: nowrap;
    }

    .row__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 32px;
      block-size: 32px;
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text-muted);
    }

    .row__meta {
      display: grid;
      align-content: center;
      gap: 5px;
      min-inline-size: 0;
    }

    .row__heading {
      display: grid;
      align-items: center;
      min-inline-size: 0;
    }

    .row__title {
      min-inline-size: 0;
      margin: 0;
      overflow: hidden;
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);
      font-weight: 680;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .row__details {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 6px;
      min-inline-size: 0;
      overflow: hidden;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      line-height: 1.2;
      white-space: nowrap;
    }

    .row__detail {
      flex: 0 1 auto;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .row__path {
      flex: 1 1 auto;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .empty-state {
      display: grid;
      justify-items: center;
      gap: var(--cv-space-2);
      padding: var(--cv-space-6);
      border: 1px solid var(--cv-color-border);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-2);
      text-align: center;
    }

    .empty-state__title,
    .empty-state__description {
      margin: 0;
    }

    .empty-state__title {
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);
      font-weight: 680;
    }

    .empty-state__description {
      max-inline-size: 42ch;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      line-height: 1.4;
    }

    @container (width < 720px) {
      .controls {
        justify-content: stretch;
      }

      .view-switch {
        order: 2;
      }

      .clear-filters--compact {
        order: 3;
      }

      .folder-row {
        grid-template-columns: 28px 28px minmax(0, 1fr);
      }

      .folder-count {
        grid-column: 3;
      }
    }
  `,
]
