import {css} from 'lit'

import {hostContentContainStyles, sharedStyles} from 'root/shared/ui/shared-styles'

export const fileMoveSharedStyles = [
  hostContentContainStyles,
  sharedStyles,
  css`
    :host {
      --file-move-indent-step: var(--pm-move-indent-step);
    }

    .layout {
      display: grid;
      gap: var(--cv-space-2);
    }

    .search {
      position: sticky;
      inset-block-start: 0;
      z-index: 2;
      padding-block-end: var(--cv-space-2);
      background: var(--cv-color-surface);
    }

    .recent {
      display: grid;
      gap: 6px;
    }

    .recent-label {
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-medium);
    }

    .recent-items {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .recent-btn {
      padding: 4px 8px;
      border: 1px solid var(--cv-color-border);
      border-radius: var(--cv-radius-1);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      cursor: pointer;
      font-size: var(--cv-font-size-xs);
    }

    .recent-btn:hover {
      border-color: var(--cv-color-primary);
      color: var(--cv-color-primary);
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

    .tree-wrap {
      max-block-size: min(45vh, 360px);
      overflow: auto;
      contain: content;
    }

    .tree {
      display: grid;
      gap: 2px;
      outline: none;
    }

    .tree:focus-visible {
      border-radius: var(--cv-radius-2);
      outline: 2px solid var(--cv-color-focus, var(--cv-color-primary));
      outline-offset: 2px;
    }

    .row {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) 18px;
      align-items: center;
      gap: calc(var(--cv-space-2) * 0.75);
      padding-block: var(--cv-space-2);
      padding-inline: var(--cv-space-3);
      border: 1px solid var(--cv-color-border);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      cursor: pointer;
      text-align: start;
    }

    .row:hover {
      border-color: var(--cv-color-primary);
      background: var(--cv-color-primary-surface);
    }

    .row.selected {
      border-color: var(--cv-color-primary);
      background: var(--cv-color-primary-surface-strong);
      font-weight: var(--cv-font-weight-medium);
    }

    .row.active {
      outline: 2px solid var(--cv-color-primary-ring);
      outline-offset: -2px;
    }

    .row[aria-disabled='true'] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .row[aria-disabled='true']:hover {
      border-color: var(--cv-color-border);
      background: var(--cv-color-surface-2);
    }

    .chevron {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      padding: 0;
      margin: 0;
      border: none;
      background: transparent;
      color: var(--cv-color-text-muted);
      cursor: pointer;
    }

    .chevron[aria-hidden='true'] {
      cursor: default;
    }

    .chevron cv-icon {
      width: 12px;
      height: 12px;
    }

    .label {
      display: flex;
      align-items: center;
      gap: calc(var(--cv-space-2) * 0.75);
      min-width: 0;
    }

    .label-text {
      display: grid;
      min-inline-size: 0;
      gap: 2px;
    }

    .indent {
      display: flex;
      flex: 0 0 auto;
      gap: 0;
      pointer-events: none;
    }

    .indent-step {
      width: var(--file-move-indent-step);
      min-width: var(--file-move-indent-step);
      height: 1px;
      flex: 0 0 var(--file-move-indent-step);
    }

    .folder-icon {
      width: 16px;
      height: 16px;
      flex: 0 0 auto;
    }

    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .subtitle {
      overflow: hidden;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .row-check,
    .row-check-spacer {
      inline-size: 16px;
      block-size: 16px;
    }

    .row-check {
      color: var(--cv-color-primary);
    }

    .root {
      font-weight: var(--cv-font-weight-medium);
    }
  `,
]
