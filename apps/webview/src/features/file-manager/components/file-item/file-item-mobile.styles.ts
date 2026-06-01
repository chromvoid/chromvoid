import {css} from 'lit'

export const fileItemMobileStyles = css`
  :host([view-mode='list']) {
    --file-item-mobile-surface: linear-gradient(
      180deg,
      var(--cv-color-surface-2) 0%,
      var(--cv-color-surface) 100%
    );
    --file-item-mobile-selected-surface: var(--file-item-selected-background);
    --file-item-mobile-border: var(--cv-color-border-soft);
    --file-item-mobile-shadow: 0 10px 24px var(--cv-alpha-black-6);
    /* Match the inner card radius plus its 2px inset so host outline hugs the mobile row. */
    border-radius: 18px;
    height: 64px;
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
    outline: var(--file-item-focus-outline);
    outline-offset: var(--file-item-focus-outline-offset);
  }

  :host([view-mode='list']) .file-item {
    padding: 10px 12px;
    gap: 12px;
    block-size: calc(100% - 4px);
    margin-block: 2px;
    border-radius: 16px;
    background: var(--file-item-mobile-surface);
    box-shadow:
      inset 0 0 0 1px var(--file-item-mobile-border),
      var(--file-item-mobile-shadow);
  }

  :host([view-mode='list']) .thumbnail-shell {
    --file-media-spectrum-width: 22px;
    --file-media-spectrum-height: 22px;
    --file-media-spectrum-bar-width: 4px;
    --file-media-spectrum-gap: 3px;
    inline-size: 38px;
    block-size: 38px;
    min-inline-size: 38px;
    min-block-size: 38px;
    margin-inline-start: 4px;
    border-radius: 12px;
  }

  :host([view-mode='list'][selected]) .file-item {
    background: var(--file-item-mobile-selected-surface);
    outline: var(--file-item-selected-outline);
    outline-offset: var(--file-item-selected-outline-offset);
    box-shadow: none;
  }

  :host([view-mode='list'][active]) .file-item {
    background: var(--file-item-active-background);
    outline: var(--file-item-active-outline);
    outline-offset: var(--file-item-active-outline-offset);
    box-shadow: none;
  }

  :host([view-mode='list'][selected][active]) .file-item {
    background: var(--file-item-mobile-selected-surface);
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
    background: var(--file-item-mobile-selected-surface);
    outline: var(--file-item-selected-outline);
    outline-offset: var(--file-item-selected-outline-offset);
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
    letter-spacing: -0.01em;
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
  }
`
