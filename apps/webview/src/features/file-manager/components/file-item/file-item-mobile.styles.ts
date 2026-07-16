import {css} from 'lit'

export const fileItemMobileStyles = css`
  :host([view-mode='list']) {
    /* Match the inner card radius plus its 2px inset so host outline hugs the mobile row. */
    border-radius: 18px;
    block-size: var(--file-list-item-block-size, 80px);
  }

  :host([view-mode='list'])::before {
    content: none;
  }

  :host([view-mode='list'][active]),
  :host([view-mode='list'][selected]) {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
    transform: none;
  }

  :host([view-mode='list'][active]:not(:focus):not(:focus-visible)),
  :host([view-mode='list'][selected]:not(:focus):not(:focus-visible)) {
    outline: none;
  }

  :host([view-mode='list']:focus),
  :host([view-mode='list']:focus-visible) {
    outline: 2px solid var(--cv-color-focus);
    outline-offset: 2px;
  }

  :host([view-mode='list']) .file-item {
    padding: 10px 12px;
    gap: 12px;
    block-size: calc(100% - 4px);
    margin-block: 2px;
    border-radius: 16px;
    background: var(--file-item-mobile-surface);
    box-shadow:
      inset 0 0 0 1px var(--cv-color-border-soft),
      var(--file-item-mobile-shadow);
  }

  :host([view-mode='list']) .thumbnail-shell {
    inline-size: 38px;
    block-size: 38px;
    min-inline-size: 38px;
    min-block-size: 38px;
    margin-inline-start: 4px;
    border-radius: 12px;
  }

  :host([view-mode='list']) .media-active-spectrum {
    inline-size: var(--file-media-spectrum-list-inline-size);
    block-size: var(--file-media-spectrum-list-block-size);
    gap: var(--file-media-spectrum-list-gap);
  }

  :host([view-mode='list']) .media-active-spectrum span {
    inline-size: var(--file-media-spectrum-list-bar-inline-size);
  }

  :host([view-mode='list'][selected]) .file-item {
    background: var(--cv-color-primary-surface-strong);
    outline: 1px solid var(--cv-color-primary-ring);
    outline-offset: -1px;
    box-shadow: none;
  }

  :host([view-mode='list'][active]) .file-item {
    background: var(--cv-color-primary-subtle);
    outline: 1px solid var(--cv-color-primary-ring);
    outline-offset: -1px;
    box-shadow: none;
  }

  :host([view-mode='list'][selected][active]) .file-item {
    background: var(--cv-color-primary-surface-strong);
  }

  :host([view-mode='list'][selected]) .name,
  :host([view-mode='list'][selected]) .meta {
    color: var(--cv-color-primary);
  }

  :host([view-mode='list'][media-active]) .file-item {
    background: var(--cv-gradient-surface-primary);
    box-shadow:
      inset 0 0 0 1px var(--cv-color-primary-border-strong),
      0 12px 28px var(--cv-color-primary-subtle);
  }

  :host([view-mode='list'][selected][media-active]) .file-item {
    background: var(--cv-color-primary-surface-strong);
    outline: 1px solid var(--cv-color-primary-ring);
    outline-offset: -1px;
    box-shadow: none;
  }

  :host([view-mode='list']) .icon {
    font-size: 19px;
    min-inline-size: 38px;
    min-height: auto;
    padding: 4px;
    block-size: 38px;
    border-radius: 12px;
    border: none;
    box-shadow: none;
  }

  :host([view-mode='list']) .info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }

  :host([view-mode='list']) .name {
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: 0;
  }

  :host([view-mode='list']) .meta {
    margin-block-start: 0;
    font-size: 0.8rem;
    line-height: 1.1;
  }

  :host([view-mode='list']) .file-type {
    align-self: center;
    padding: 4px 7px;
    border-radius: 999px;
    background: var(--cv-color-surface-tertiary-glass-strong);
    letter-spacing: 0;
  }

  :host([view-mode='grid']) {
    block-size: 154px;
    border: 1px solid var(--cv-color-border-muted);
    border-radius: 16px;
    background: linear-gradient(180deg, var(--cv-color-surface-2), var(--cv-color-surface));
    box-shadow:
      inset 0 1px 0 var(--cv-alpha-white-4),
      0 10px 24px var(--cv-alpha-black-8);
  }

  :host([view-mode='grid'])::after {
    border-radius: 16px;
  }

  :host([view-mode='grid']:hover) {
    transform: none;
    box-shadow:
      inset 0 0 0 1px var(--cv-color-primary-border),
      0 12px 28px var(--cv-alpha-black-10);
  }

  :host([view-mode='grid']) .file-item {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 8px;
    padding: 12px;
    text-align: start;
  }

  :host([view-mode='grid']) .thumbnail-shell {
    inline-size: 54px;
    block-size: 54px;
    margin-block-end: 2px;
    border-radius: 14px;
    font-size: 34px;
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
    font-size: 34px;
  }

  :host([view-mode='grid']) .info {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 4px;
    inline-size: 100%;
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
    line-height: 1.18;
    letter-spacing: 0;
  }

  :host([view-mode='grid']) .meta {
    margin-block-start: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 0.74rem;
    line-height: 1.15;
  }

  :host([view-mode='grid']) .file-type {
    inset-block-start: 8px;
    inset-inline-end: 8px;
    padding: 3px 6px;
    border-radius: 999px;
    background: var(--cv-color-surface-tertiary-glass-strong);
    font-size: 0.62rem;
    letter-spacing: 0;
  }

  :host([view-mode='grid']) .selection-indicator {
    inset-block-start: 8px;
    inset-inline-start: 8px;
  }

  :host([view-mode='grid'][selected]),
  :host([view-mode='grid'][active]) {
    background: var(--cv-color-primary-surface-strong);
    border-color: var(--cv-color-primary-border-strong);
  }

  :host([view-mode='grid'][selected]) .name,
  :host([view-mode='grid'][selected]) .meta {
    color: var(--cv-color-primary);
  }
`
