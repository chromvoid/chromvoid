import {css} from 'lit'

export const fileItemViewStyles = css`
  /* ========== LIST VIEW ========== */
  :host([view-mode='list']) {
    height: var(--file-list-item-height, 80px);
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
    inline-size: 3px;
    background: var(--file-item-selected-leading-accent);
    opacity: 0;
    border-radius: 2px;
    transition:
      opacity var(--cv-duration-fast) var(--cv-easing-standard),
      inline-size var(--cv-duration-fast) var(--cv-easing-standard),
      background var(--cv-duration-fast) var(--cv-easing-standard);
  }

  :host([view-mode='list']:hover) {
    background: var(--file-item-hover-background);
    border-color: var(--file-item-active-border);
    transform: translateX(2px);
    box-shadow: var(--cv-shadow-1);
  }

  :host([view-mode='list']:hover)::before {
    opacity: 1;
  }

  :host([view-mode='list'][active]) {
    background: var(--file-item-active-background);
    border-color: var(--file-item-active-border);
    outline: var(--file-item-selected-outline);
    outline-offset: var(--file-item-selected-outline-offset);
    transform: none;
  }

  :host([view-mode='list'][selected]) {
    background: var(--file-item-selected-background);
    border-color: var(--file-item-selected-border);
    outline: var(--file-item-selected-outline);
    outline-offset: var(--file-item-selected-outline-offset);
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
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-3);
    overflow: hidden;
    background: var(--cv-color-surface);
    position: relative;
  }

  :host([view-mode='grid'])::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--gradient-subtle);
    opacity: 0;
    transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
    pointer-events: none;
    border-radius: var(--cv-radius-3);
  }

  :host([view-mode='grid']:hover) {
    transform: translateY(-8px) scale(1.02);
    box-shadow: var(--cv-shadow-3);
    border-color: var(--cv-color-border-accent);
  }

  :host([view-mode='grid']:hover)::after {
    opacity: 0.1;
  }

  :host([view-mode='grid'][active]) {
    background: var(--file-item-active-background);
    border-color: var(--file-item-active-border);
    outline: var(--file-item-selected-outline);
    outline-offset: var(--file-item-selected-outline-offset);
    box-shadow: none;
    transform: none;
  }

  :host([view-mode='grid'][selected]) {
    background: var(--file-item-selected-background);
    border-color: var(--file-item-selected-border);
    outline: var(--file-item-selected-outline);
    outline-offset: var(--file-item-selected-outline-offset);
    box-shadow: none;
    transform: none;
  }

  :host([view-mode='grid'][active])::after,
  :host([view-mode='grid'][selected])::after {
    opacity: 0;
  }

  :host([view-mode='grid']) .file-item {
    flex-direction: column;
    justify-content: center;
    block-size: 100%;
    text-align: center;
    padding: var(--app-spacing-4);
  }

  :host([view-mode='grid']) .thumbnail-shell {
    --file-media-spectrum-width: var(--file-media-spectrum-grid-width);
    --file-media-spectrum-height: var(--file-media-spectrum-grid-height);
    --file-media-spectrum-bar-width: var(--file-media-spectrum-grid-bar-width);
    --file-media-spectrum-gap: var(--file-media-spectrum-grid-gap);
    font-size: 48px;
    inline-size: 72px;
    block-size: 72px;
    margin-block-end: var(--app-spacing-3);
  }

  :host([view-mode='grid']) .icon {
    font-size: 48px;
    block-size: 100%;
  }

  :host([view-mode='grid']) .info {
    inline-size: 100%;
  }

  :host([view-mode='grid']) .name {
    font-size: var(--cv-font-size-sm);
  }

  :host([view-mode='grid']) .meta {
    font-size: var(--cv-font-size-xs);
  }

  :host([view-mode='grid']) .file-type {
    position: absolute;
    inset-block-start: 8px;
    inset-inline-end: 8px;
  }

  :host([view-mode='grid']) .actions {
    position: absolute;
    inset-block-end: 8px;
    inset-inline-end: 8px;
    inset-inline-start: 8px;
    justify-content: flex-end;
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
    inline-size: 3px;
    background: var(--file-item-selected-leading-accent);
    opacity: 0;
    border-radius: 2px;
    transition:
      opacity var(--cv-duration-fast) var(--cv-easing-standard),
      inline-size var(--cv-duration-fast) var(--cv-easing-standard);
  }

  :host([view-mode='table']:hover) {
    background: var(--file-item-hover-background);
    border-color: var(--file-item-active-border);
    transform: translateX(2px);
    box-shadow: var(--cv-shadow-sm);
  }

  :host([view-mode='table']:hover)::before {
    opacity: 1;
  }

  :host([view-mode='table'][active]) {
    background: var(--file-item-active-background);
    border-color: var(--file-item-active-border);
    outline: var(--file-item-selected-outline);
    outline-offset: var(--file-item-selected-outline-offset);
    transform: none;
  }

  :host([view-mode='table'][selected]) {
    background: var(--file-item-selected-background);
    border-color: var(--file-item-selected-border);
    outline: var(--file-item-selected-outline);
    outline-offset: var(--file-item-selected-outline-offset);
    box-shadow: none;
    transform: none;
  }

  :host([view-mode='table'][active])::before,
  :host([view-mode='table'][selected])::before {
    opacity: 1;
    inline-size: 4px;
  }
`
