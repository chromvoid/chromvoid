import {css} from 'lit'

export const fileItemDesktopStyles = css`
  .name-line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-inline-size: 0;
  }

  .name-line .name {
    min-inline-size: 0;
  }

  .hidden-badge {
    flex: 0 0 auto;
    max-inline-size: 88px;
    overflow: hidden;
    padding: 1px 4px;
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-1);
    color: var(--cv-color-text-subtle);
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-medium);
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pending-open-badge {
    flex: 0 1 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-inline-size: 0;
    color: var(--cv-color-primary);
    font-size: var(--cv-font-size-xs);
    line-height: 1.2;
  }

  .pending-open-badge cv-spinner {
    flex: 0 0 auto;
  }

  .pending-open-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :host([view-mode='list']) {
    block-size: var(--file-list-item-block-size, 36px);
    border: 0;
    border-block-end: 1px solid var(--cv-color-border-muted);
    border-radius: 0;
  }

  :host([view-mode='list'])::before {
    inset-block: 5px;
    inset-inline-start: 0;
    inline-size: 2px;
    border-radius: var(--cv-radius-1);
    background: var(--cv-color-primary-border-strong);
  }

  :host([view-mode='list']) .file-item {
    gap: 8px;
    padding: 0 10px;
  }

  :host([view-mode='list']) .file-item {
    padding-inline-start: 34px;
  }

  :host([view-mode='list']) .selection-indicator {
    inset-inline-start: 10px;
    inline-size: 16px;
    block-size: 16px;
    border-radius: var(--cv-radius-1);
    box-shadow: none;
  }

  :host([view-mode='list']) .thumbnail-shell {
    inline-size: 18px;
    block-size: 18px;
    min-inline-size: 18px;
    min-block-size: 18px;
    min-width: 18px;
    min-height: 18px;
    border: 0;
    border-radius: var(--cv-radius-1);
    background: transparent;
  }

  :host([view-mode='list']) .thumbnail-shell.has-image {
    border: 1px solid var(--cv-color-border-muted);
  }

  :host([view-mode='list']) .icon {
    font-size: 17px;
  }

  :host([view-mode='list']) .info {
    display: flex;
    align-items: center;
    gap: 12px;
    min-inline-size: 0;
  }

  :host([view-mode='list']) .name-line {
    flex: 1 1 auto;
  }

  :host([view-mode='list']) .name {
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-medium);
  }

  :host([view-mode='list']) .meta {
    flex: 0 1 auto;
    min-inline-size: 96px;
    max-inline-size: 220px;
    overflow: hidden;
    margin-block-start: 0;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    font-variant-numeric: tabular-nums;
    text-align: end;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :host([view-mode='list']) .file-type {
    display: none;
  }

  :host([view-mode='list']:hover) {
    border-color: var(--cv-color-border-muted);
    background: var(--cv-color-hover);
    box-shadow: none;
    transform: none;
  }

  :host([view-mode='list']:hover)::before {
    opacity: 0;
  }

  :host([view-mode='list'][active]) {
    border-color: var(--cv-color-border-muted);
    background: var(--cv-color-surface-secondary-glass-soft);
    outline: none;
  }

  :host([view-mode='list'][active])::before {
    inline-size: 2px;
    background: var(--cv-color-primary-border-strong);
    opacity: 1;
  }

  :host([view-mode='list'][selected]),
  :host([view-mode='list'][selected][active]),
  :host([view-mode='list'][selected][pending-external-open]) {
    border-color: var(--cv-color-border-muted);
    background: var(--cv-color-primary-surface);
    outline: none;
    box-shadow: none;
  }

  :host([view-mode='list'][selected])::before,
  :host([view-mode='list'][selected][active])::before {
    inline-size: 3px;
    background: var(--cv-color-primary);
    opacity: 1;
  }

  :host([view-mode='list']:focus-visible) {
    outline: 2px solid var(--cv-color-focus);
    outline-offset: -2px;
  }

  :host([view-mode='list']:hover) .actions,
  :host([view-mode='list']:focus-visible) .actions,
  :host([view-mode='list'][active]) .actions {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  :host([view-mode='list']) .actions {
    flex: 0 0 auto;
    gap: 1px;
  }

  :host([view-mode='list']) .action-btn {
    inline-size: 24px;
    block-size: 24px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    background: transparent;
    color: var(--cv-color-text-subtle);
  }

  :host([view-mode='list']) .action-btn:hover {
    background: var(--cv-color-hover);
    color: var(--cv-color-text);
  }

  :host([view-mode='list']:hover) .thumbnail-shell.folder:not(.has-image) {
    background: transparent;
    box-shadow: none;
  }

  @media (prefers-reduced-motion: reduce) {
    :host,
    .file-item,
    .thumbnail-shell,
    .actions {
      transition-duration: 0ms;
    }
  }
`
