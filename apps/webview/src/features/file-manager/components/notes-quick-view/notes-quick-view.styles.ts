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
      grid-template-rows: min-content minmax(0, 1fr);
      gap: var(--cv-space-3);
      min-block-size: 100%;
      min-inline-size: 0;
    }

    .quick-view--external-toolbar {
      grid-template-rows: minmax(0, 1fr);
    }

    .folder-toggle:focus-visible {
      outline: 2px solid var(--cv-color-accent);
      outline-offset: 2px;
    }

    .rows,
    .notes-grid {
      display: grid;
      align-content: start;
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    .notes-grid {
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
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
      min-inline-size: 0;
    }

    .note-card {
      display: grid;
      gap: var(--cv-space-2);
      border: 1px solid transparent;
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-secondary-glass-soft);
      box-sizing: border-box;
      cursor: pointer;
    }

    .note-card--list,
    .note-card--tree {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      border-color: var(--cv-color-border-muted);
      background: var(--cv-color-surface-secondary-glass-soft);
    }

    .note-card--list {
      align-items: center;
      grid-template-columns: 42px minmax(0, 1fr);
      gap: var(--cv-space-3);
      min-block-size: 94px;
      padding: 10px 14px;
    }

    .note-card--tree {
      gap: var(--cv-space-3);
      padding: var(--cv-space-3);
    }

    .note-card--grid {
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 0;
      min-block-size: 184px;
      overflow: hidden;
      padding: 0;
      border: 1px solid var(--cv-color-border);
    }

    .note-card--tree {
      background: var(--cv-color-surface-glass-subtle);
    }

    .note-card:hover {
      background: var(--cv-color-surface-2);
    }

    .note-card:active {
      background: var(--cv-color-active);
    }

    .note-card:focus-visible {
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

    .note-card__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 42px;
      block-size: 42px;
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-accent-surface-strong);
      color: var(--cv-color-accent);
    }

    .note-card__icon cv-icon {
      --cv-icon-size: 18px;
    }

    .note-card__body {
      display: grid;
      align-content: start;
      grid-template-rows: auto minmax(0, auto) auto;
      gap: 6px;
      min-inline-size: 0;
    }

    .note-card--list .note-card__body {
      gap: 4px;
      padding-block-start: 1px;
    }

    .note-card__heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    .note-card--list .note-card__heading {
      min-block-size: 18px;
    }

    .note-card__preview {
      display: grid;
      align-content: start;
      gap: 8px;
      min-block-size: 0;
      min-inline-size: 0;
      padding: var(--cv-space-3);
    }

    .note-card__preview-title {
      display: -webkit-box;
      min-inline-size: 0;
      margin: 0;
      overflow: hidden;
      color: var(--cv-color-accent);
      font-family: var(--cv-font-family-code);
      font-size: 11px;
      font-weight: 780;
      line-height: 1.35;
      text-overflow: ellipsis;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .note-card__preview-copy {
      display: -webkit-box;
      min-inline-size: 0;
      margin: 0;
      overflow: hidden;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      line-height: 1.45;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
    }

    .note-card__grid-footer {
      display: grid;
      gap: 6px;
      min-inline-size: 0;
      padding: var(--cv-space-3);
      border-block-start: 1px solid var(--cv-color-border);
      background: var(--cv-color-surface-glass-subtle);
    }

    .note-card__title {
      min-inline-size: 0;
      margin: 0;
      overflow: hidden;
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);
      font-weight: 760;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .note-card__title--grid {
      font-weight: 760;
    }

    .note-card__badge {
      flex: 0 0 auto;
      padding: 2px 5px;
      border: 1px solid var(--cv-color-accent-border);
      border-radius: var(--cv-radius-1);
      background: var(--cv-color-accent-surface-strong);
      color: var(--cv-color-accent);
      font-family: var(--cv-font-family-code);
      font-size: 10px;
      font-weight: 760;
      line-height: 1.1;
    }

    .note-card__excerpt {
      display: -webkit-box;
      min-inline-size: 0;
      margin: 0;
      overflow: hidden;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      line-height: 1.4;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .note-card--list .note-card__excerpt {
      line-height: 1.36;
    }

    .note-card__details {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 0;
      min-inline-size: 0;
      overflow: hidden;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      font-family: var(--cv-font-family-code);
      line-height: 1.2;
      white-space: nowrap;
    }

    .note-card--list .note-card__details {
      margin-block-start: 1px;
      font-size: 11px;
      line-height: 1.25;
    }

    .note-card__details--grid {
      min-block-size: 1.2em;
    }

    .note-card__detail + .note-card__detail::before {
      content: '·';
      margin-inline: 5px;
      color: var(--cv-color-text-muted);
    }

    .note-card__detail {
      flex: 0 1 auto;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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

    @container (width < 720px) {
      .folder-row {
        grid-template-columns: 28px 28px minmax(0, 1fr);
      }

      .folder-count {
        grid-column: 3;
      }
    }
  `,
]
