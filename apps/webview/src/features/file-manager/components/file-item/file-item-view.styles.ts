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
    block-size: 200px;
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-3);
    overflow: hidden;
    background: linear-gradient(180deg, var(--cv-color-surface-2), var(--cv-color-surface));
    box-shadow:
      inset 0 1px 0 var(--cv-alpha-white-4),
      0 10px 24px var(--cv-alpha-black-8);
    position: relative;
  }

  :host([view-mode='grid'])::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--cv-gradient-subtle);
    opacity: 0;
    transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
    pointer-events: none;
    border-radius: var(--cv-radius-3);
  }

  :host([view-mode='grid']:hover) {
    transform: translateY(-2px);
    box-shadow:
      inset 0 1px 0 var(--cv-alpha-white-6),
      0 14px 30px var(--cv-alpha-black-14);
    border-color: var(--cv-color-primary-border);
  }

  :host([view-mode='grid']:hover)::after {
    opacity: 0.08;
  }

  :host([view-mode='grid'][active]) {
    background: linear-gradient(180deg, var(--cv-color-surface-2), var(--cv-color-primary-subtle));
    border-color: var(--cv-color-primary-border-strong);
    outline: 1px solid var(--cv-color-primary-ring);
    outline-offset: -1px;
    box-shadow: inset 0 0 0 1px var(--cv-color-primary-border);
    transform: none;
  }

  :host([view-mode='grid'][selected]) {
    background: linear-gradient(180deg, var(--cv-color-surface-2), var(--cv-color-primary-surface-strong));
    border-color: var(--cv-color-primary);
    outline: 1px solid var(--cv-color-primary-ring);
    outline-offset: -1px;
    box-shadow:
      inset 0 0 0 1px var(--cv-color-primary-border-strong),
      0 0 0 3px var(--cv-color-primary-ring);
    transform: none;
  }

  :host([view-mode='grid'][active])::after,
  :host([view-mode='grid'][selected])::after {
    opacity: 0;
  }

  :host([view-mode='grid']) .file-item {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    align-items: stretch;
    gap: 10px;
    block-size: 100%;
    text-align: start;
    padding: 10px;
  }

  :host([view-mode='grid']) .thumbnail-shell {
    font-size: 44px;
    inline-size: 100%;
    block-size: 110px;
    margin-block-end: 0;
    border-radius: calc(var(--cv-radius-3) - 2px);
    background:
      linear-gradient(135deg, var(--cv-color-surface-highlight), transparent 48%),
      var(--cv-color-surface-secondary-glass-soft);
    box-shadow: inset 0 1px 0 var(--cv-alpha-white-4);
  }

  :host([view-mode='grid']) .media-active-spectrum {
    inline-size: var(--file-media-spectrum-grid-inline-size);
    block-size: var(--file-media-spectrum-grid-block-size);
    gap: var(--file-media-spectrum-grid-gap);
  }

  :host([view-mode='grid']) .media-active-spectrum span {
    inline-size: var(--file-media-spectrum-grid-bar-inline-size);
  }

  :host([view-mode='grid']:hover) .thumbnail-shell {
    transform: scale(1.015);
  }

  :host([view-mode='grid']) .icon {
    font-size: 44px;
    block-size: 100%;
  }

  :host([view-mode='grid']) .info {
    inline-size: 100%;
    display: grid;
    gap: 4px;
    align-content: start;
    min-block-size: 0;
  }

  :host([view-mode='grid']) .name {
    display: -webkit-box;
    overflow: hidden;
    white-space: normal;
    text-overflow: ellipsis;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: var(--cv-font-size-sm);
    font-weight: 650;
    line-height: 1.2;
    letter-spacing: 0;
  }

  :host([view-mode='grid']) .meta {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: var(--cv-font-size-xs);
    line-height: 1.15;
    margin-block-start: 0;
  }

  :host([view-mode='grid']) .file-type {
    position: absolute;
    inset-block-start: 12px;
    inset-inline-end: 12px;
    z-index: 2;
    max-inline-size: calc(100% - 24px);
    overflow: hidden;
    text-overflow: ellipsis;
    border: 1px solid var(--cv-color-border-glass);
    background: var(--cv-color-surface-glass-strong);
    box-shadow: 0 4px 12px var(--cv-alpha-black-14);
  }

  :host([view-mode='grid']) .selection-indicator {
    inset-block-start: 12px;
    inset-inline-start: 12px;
  }

  :host([view-mode='grid']) .actions {
    position: absolute;
    z-index: 2;
    inset-block-start: 88px;
    inset-inline-end: 16px;
    inset-inline-start: auto;
    max-inline-size: calc(100% - 32px);
    padding: 3px;
    border: 1px solid var(--cv-color-border-glass);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-glass-strong);
    box-shadow: 0 8px 18px var(--cv-alpha-black-20);
    justify-content: flex-end;
  }

  :host([view-mode='grid']:hover) .actions,
  :host([view-mode='grid']:focus-visible) .actions,
  :host([view-mode='grid'][active]) .actions {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  :host([view-mode='grid']) .action-btn {
    inline-size: 28px;
    block-size: 28px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    background: var(--cv-color-surface-tertiary-glass);
  }

  :host([view-mode='grid'][media-active]) {
    border-color: var(--cv-color-primary-border-strong);
    box-shadow:
      inset 0 0 0 1px var(--cv-color-primary-border),
      0 14px 32px var(--cv-color-primary-ring);
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
