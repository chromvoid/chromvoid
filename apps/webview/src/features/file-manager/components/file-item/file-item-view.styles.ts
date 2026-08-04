import {css} from 'lit'

export const fileItemViewStyles = css`
  /* ========== LIST VIEW ========== */
  :host([view-mode='list']) {
    height: var(--file-list-item-block-size, 80px);
    position: relative;
  }

  :host([view-mode='list']) .file-item {
    gap: var(--app-spacing-4);
    padding: var(--app-spacing-4);
  }

  :host([view-mode='list'])::before {
    content: '';
    position: absolute;
    inset-block-start: 8px;
    inset-block-end: 8px;
    inset-inline-start: 0;
    inline-size: 3px;
    background: var(--cv-color-primary);
    opacity: 0;
    border-radius: 2px;
    transition:
      opacity var(--cv-duration-fast) var(--cv-easing-standard),
      inline-size var(--cv-duration-fast) var(--cv-easing-standard),
      background var(--cv-duration-fast) var(--cv-easing-standard);
  }

  :host([view-mode='list']:hover) {
    background: var(--cv-color-primary-surface);
    border-color: var(--cv-color-primary-border-strong);
    transform: translateX(calc(2px * var(--app-runtime-inline-end-direction-sign, 1)));
    box-shadow: var(--cv-shadow-1);
  }

  :host([view-mode='list']:hover)::before {
    opacity: 1;
  }

  :host([view-mode='list'][active]) {
    background: var(--cv-color-primary-subtle);
    border-color: var(--cv-color-primary-border-strong);
    outline: 1px solid var(--cv-color-primary-ring);
    outline-offset: -1px;
    transform: none;
  }

  :host([view-mode='list'][selected]) {
    background: var(--cv-color-primary-surface-strong);
    border-color: var(--cv-color-primary);
    outline: 1px solid var(--cv-color-primary-ring);
    outline-offset: -1px;
    box-shadow: none;
    transform: none;
  }

  :host([view-mode='list'][active])::before,
  :host([view-mode='list'][selected])::before {
    opacity: 1;
    inline-size: 4px;
  }

  /* ========== GRID VIEW ========== */
  :host([view-mode='grid']) {
    position: relative;
    block-size: 208px;
    overflow: hidden;
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-2);
    box-shadow: none;
  }

  :host([view-mode='grid'])::after {
    content: none;
  }

  :host([view-mode='grid']:hover) {
    border-color: var(--cv-color-border-soft);
    background: var(--cv-color-surface-highlight);
    box-shadow: none;
    transform: none;
  }

  :host([view-mode='grid'][active]) {
    border-color: var(--cv-color-primary-border-strong);
    background: var(--cv-color-surface-secondary-glass-soft);
    outline: 1px solid var(--cv-color-primary-ring);
    outline-offset: -1px;
    box-shadow: none;
    transform: none;
  }

  :host([view-mode='grid'][selected]),
  :host([view-mode='grid'][selected][active]) {
    border-color: var(--cv-color-primary-border-strong);
    background: var(--cv-color-primary-subtle);
    outline: none;
    box-shadow: inset 0 0 0 1px var(--cv-color-primary-border);
    transform: none;
  }

  :host([view-mode='grid'][media-active]) {
    border-color: var(--cv-color-primary-border-strong);
    box-shadow: inset 0 0 0 1px var(--cv-color-primary-border);
  }

  :host([view-mode='grid']:focus-visible) {
    outline: 2px solid var(--cv-color-focus);
    outline-offset: 2px;
  }

  :host([view-mode='grid']) .file-item {
    display: grid;
    grid-template-rows: 128px minmax(0, 1fr);
    align-items: stretch;
    gap: 8px;
    block-size: 100%;
    padding: 8px;
    text-align: start;
  }

  :host([view-mode='grid']) .thumbnail-shell {
    inline-size: 100%;
    block-size: 128px;
    min-inline-size: 0;
    min-block-size: 128px;
    margin-block-end: 0;
    border-radius: var(--cv-radius-1);
    background: var(--cv-color-surface);
    box-shadow: none;
    transform: none;
  }

  :host([view-mode='grid']) .thumbnail-shell.folder:not(.has-image) {
    background: var(--cv-color-primary-surface);
  }

  :host([view-mode='grid']) .media-active-spectrum {
    inline-size: var(--file-media-spectrum-grid-inline-size);
    block-size: var(--file-media-spectrum-grid-block-size);
    gap: var(--file-media-spectrum-grid-gap);
  }

  :host([view-mode='grid']) .media-active-spectrum span {
    inline-size: var(--file-media-spectrum-grid-bar-inline-size);
  }

  :host([view-mode='grid']) .icon {
    font-size: 48px;
    block-size: 100%;
    transform: none;
  }

  :host([view-mode='grid']) .info {
    display: grid;
    inline-size: 100%;
    min-block-size: 0;
    gap: 4px;
    align-content: start;
  }

  :host([view-mode='grid']) .name-line {
    inline-size: 100%;
    min-inline-size: 0;
  }

  :host([view-mode='grid']) .name {
    display: -webkit-box;
    overflow: hidden;
    white-space: normal;
    text-overflow: ellipsis;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-semibold);
    line-height: 1.2;
    letter-spacing: 0;
  }

  :host([view-mode='grid']) .meta {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    margin-block-start: 0;
    font-size: var(--cv-font-size-xs);
    line-height: 1.15;
  }

  :host([view-mode='grid']) .selection-indicator,
  :host([view-mode='grid']) .grid-pending-status {
    position: absolute;
    inset-block-start: 8px;
    z-index: 3;
    inline-size: 20px;
    block-size: 20px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--cv-color-border-soft);
    border-radius: var(--cv-radius-1);
    background: var(--cv-color-surface);
    color: var(--cv-color-primary);
    box-shadow: none;
  }

  :host([view-mode='grid']) .selection-indicator {
    inset-inline-start: 8px;
    cursor: default;
    pointer-events: none;
  }

  :host([view-mode='grid']) .selection-indicator.is-selected {
    border-color: transparent;
    background: var(--cv-color-primary);
    color: var(--cv-color-on-primary);
  }

  :host([view-mode='grid']) .grid-pending-status {
    inset-inline-end: 8px;
  }

  :host([view-mode='grid']) .grid-pending-status cv-spinner {
    display: block;
  }

  :host([view-mode='grid']:hover) .thumbnail-shell {
    transform: none;
  }

  :host([view-mode='grid']:hover) .thumbnail-shell.folder:not(.has-image) {
    background: var(--cv-color-primary-surface);
    box-shadow: none;
  }

  /* ========== TABLE VIEW ========== */
  :host([view-mode='table']) {
    border-radius: 0;
  }

  :host([view-mode='table'])::before {
    content: '';
    position: absolute;
    inset-block-start: 8px;
    inset-block-end: 8px;
    inset-inline-start: 0;
    inline-size: 3px;
    background: var(--cv-color-primary);
    opacity: 0;
    border-radius: 2px;
    transition:
      opacity var(--cv-duration-fast) var(--cv-easing-standard),
      inline-size var(--cv-duration-fast) var(--cv-easing-standard);
  }

  :host([view-mode='table']:hover) {
    background: var(--cv-color-primary-surface);
    border-color: var(--cv-color-primary-border-strong);
    transform: translateX(calc(2px * var(--app-runtime-inline-end-direction-sign, 1)));
    box-shadow: var(--cv-shadow-sm);
  }

  :host([view-mode='table']:hover)::before {
    opacity: 1;
  }

  :host([view-mode='table'][active]) {
    background: var(--cv-color-primary-subtle);
    border-color: var(--cv-color-primary-border-strong);
    outline: 1px solid var(--cv-color-primary-ring);
    outline-offset: -1px;
    transform: none;
  }

  :host([view-mode='table'][selected]) {
    background: var(--cv-color-primary-surface-strong);
    border-color: var(--cv-color-primary);
    outline: 1px solid var(--cv-color-primary-ring);
    outline-offset: -1px;
    box-shadow: none;
    transform: none;
  }

  :host([view-mode='table'][active])::before,
  :host([view-mode='table'][selected])::before {
    opacity: 1;
    inline-size: 4px;
  }

  @media (prefers-reduced-motion: reduce) {
    :host([view-mode='list']:hover),
    :host([view-mode='grid']:hover),
    :host([view-mode='grid']:hover) .thumbnail-shell,
    :host([view-mode='table']:hover) {
      transform: none;
    }
  }
`
