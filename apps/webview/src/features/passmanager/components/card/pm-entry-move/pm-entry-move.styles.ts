import {css} from 'lit'

import {hostContentContainStyles, sharedStyles} from 'root/shared/ui/shared-styles'

import {pmSharedStyles} from '../../../styles/shared'

export const pmEntryMoveSharedStyles = [
  pmSharedStyles,
  hostContentContainStyles,
  sharedStyles,
  css`
    :host {
      --pm-entry-move-indent-step: 12px;
    }

    .layout {
      display: grid;
      gap: var(--cv-space-2);
    }

    .search {
      position: sticky;
      inset-block-start: 0;
      background: var(--cv-color-surface);
      z-index: 2;
      padding-block-end: var(--cv-space-2);
    }

    .recent {
      display: grid;
      gap: 6px;
    }

    .recent-label {
      font-size: var(--cv-font-size-xs);
      color: var(--cv-color-text-muted);
      font-weight: var(--cv-font-weight-medium);
    }

    .recent-items {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .recent-btn {
      border: 1px solid var(--cv-color-border);
      border-radius: var(--cv-radius-1);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      padding: 4px 8px;
      font-size: var(--cv-font-size-xs);
      cursor: pointer;
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
      box-shadow: 0 0 0 2px color-mix(in oklch, var(--cv-color-primary) 55%, transparent);
    }

    .row {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr);
      align-items: center;
      gap: calc(var(--cv-space-2) * 0.75);
      padding-block: var(--cv-space-2);
      padding-inline: var(--cv-space-3);
      border-radius: var(--cv-radius-2);
      border: 1px solid var(--cv-color-border);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      cursor: pointer;
      text-align: start;
    }

    .row:hover {
      border-color: var(--cv-color-primary);
      background: color-mix(in oklch, var(--cv-color-primary) 10%, var(--cv-color-surface-2));
    }

    .row.selected {
      border-color: var(--cv-color-primary);
      background: color-mix(in oklch, var(--cv-color-primary) 15%, var(--cv-color-surface-2));
      font-weight: var(--cv-font-weight-medium);
    }

    .row.active {
      box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--cv-color-primary) 45%, transparent);
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
      width: 18px;
      height: 18px;
      border: none;
      background: transparent;
      padding: 0;
      margin: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
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

    .indent {
      display: flex;
      flex: 0 0 auto;
      gap: 0;
      pointer-events: none;
    }

    .indent-step {
      width: var(--pm-entry-move-indent-step);
      min-width: var(--pm-entry-move-indent-step);
      height: 1px;
      flex: 0 0 var(--pm-entry-move-indent-step);
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

    .root {
      font-style: italic;
    }
  `,
]
