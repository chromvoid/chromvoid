import {css} from 'lit'

export const mediaMiniPlayerStyles = css`
  :host {
    display: block;
    min-inline-size: 0;
    --media-mini-surface: #101722;
    --media-mini-surface-start: #141c27;
    --media-mini-surface-end: #0b111a;
    --media-mini-border: rgba(255, 255, 255, 0.06);
    --media-mini-text: #f4f7fa;
    --media-mini-text-secondary: #9aa6b5;
    --media-mini-text-muted: #667080;
    --media-mini-accent: #27d9e8;
    --media-mini-accent-muted: rgba(39, 217, 232, 0.12);
  }

  :host([variant='statusbar']) {
    max-inline-size: min(440px, 42vw);
    flex: 0 1 min(440px, 42vw);
  }

  :host([variant='mobile']) {
    inline-size: 100%;
  }

  .media-mini {
    position: relative;
    box-sizing: border-box;
    min-inline-size: 0;
    --media-mini-artwork-size: 24px;
    --media-mini-content-gap: var(--app-spacing-2);
    display: grid;
    grid-template-columns: 3px minmax(0, 1fr) auto;
    grid-template-rows: minmax(0, 1fr);
    align-items: center;
    column-gap: 8px;
    border: 1px solid var(--media-mini-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0) 34%),
      linear-gradient(180deg, var(--media-mini-surface-start) 0%, var(--media-mini-surface-end) 100%);
    color: var(--media-mini-text-secondary);
    box-shadow:
      0 16px 40px rgba(0, 0, 0, 0.42),
      0 0 24px rgba(39, 217, 232, 0.06);
    cursor: pointer;
    overflow: visible;
    -webkit-tap-highlight-color: transparent;
    animation: media-mini-enter 220ms var(--cv-easing-decelerate, cubic-bezier(0, 0, 0.2, 1)) both;
  }

  .media-mini--statusbar {
    min-block-size: 38px;
    grid-template-columns: 3px minmax(0, 1fr) auto;
    grid-template-rows: minmax(0, 1fr);
    column-gap: var(--app-spacing-2);
    padding: 3px var(--app-spacing-2);
    border-radius: 999px;
    box-shadow: none;
  }

  .media-mini--mobile {
    min-block-size: 78px;
    max-block-size: 84px;
    grid-template-columns: 2px minmax(0, 1fr) auto;
    column-gap: 6px;
    padding: 9px 12px 9px 8px;
    border-radius: 20px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .media-mini-accent {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 0;
    inline-size: 1.5px;
    block-size: 44px;
    border-radius: 0 1px 1px 0;
    background: linear-gradient(180deg, var(--media-mini-accent), rgba(39, 217, 232, 0.35));
    clip-path: polygon(0 0, 100% 3px, 100% calc(100% - 3px), 0 100%);
    opacity: 0.78;
    box-shadow: 0 0 8px rgba(39, 217, 232, 0.08);
    transform: translateY(-50%);
    transition: opacity 180ms var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1));
  }

  .media-mini[data-playing='true'] .media-mini-accent {
    opacity: 1;
  }

  .media-mini[data-error='true'] .media-mini-accent {
    background: linear-gradient(180deg, rgba(154, 166, 181, 0.58), rgba(102, 112, 128, 0.24));
    box-shadow: none;
    opacity: 0.72;
  }

  .media-mini-open {
    grid-column: 2;
    grid-row: 1;
    min-inline-size: 0;
    align-self: center;
    display: flex;
    align-items: center;
    gap: var(--media-mini-content-gap);
    min-block-size: 32px;
    padding: 0;
    border: 0;
    border-radius: 14px;
    background: none;
    color: inherit;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .media-mini-open:focus-visible,
  .media-mini-button:focus-visible,
  .media-mini-progress:focus-visible,
  .media-mini-menu:focus-visible {
    outline: 2px solid var(--cv-color-focus, var(--media-mini-accent));
    outline-offset: 2px;
  }

  .media-mini-open::part(base) {
    display: flex;
    min-inline-size: 0;
    inline-size: 100%;
    align-items: center;
    gap: inherit;
    justify-content: flex-start;
  }

  .media-mini-open::part(prefix) {
    flex: 0 0 var(--media-mini-artwork-size);
    inline-size: var(--media-mini-artwork-size);
    min-inline-size: var(--media-mini-artwork-size);
    align-self: center;
  }

  .media-mini-open::part(label) {
    flex: 1 1 0;
    min-inline-size: 0;
    justify-content: flex-start;
    text-align: start;
  }

  .media-mini-artwork {
    inline-size: var(--media-mini-artwork-size);
    block-size: var(--media-mini-artwork-size);
    align-self: center;
    justify-self: center;
    border-radius: 10px;
    pointer-events: none;
  }

  .media-mini-fallback-tile {
    box-sizing: border-box;
    inline-size: var(--media-mini-artwork-size);
    block-size: var(--media-mini-artwork-size);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(39, 217, 232, 0.16);
    border-radius: 10px;
    background: linear-gradient(180deg, rgba(39, 217, 232, 0.1), #13212b);
    color: var(--media-mini-accent);
    pointer-events: none;
  }

  .media-mini-fallback-icon {
    opacity: 0.86;
    pointer-events: none;
  }

  .media-mini-copy {
    inline-size: 100%;
    min-inline-size: 0;
    max-inline-size: 100%;
    display: grid;
    gap: 2px;
    overflow: hidden;
    text-align: start;
  }

  .media-mini-title {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--media-mini-text);
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-semibold);
    letter-spacing: 0;
  }

  .media-mini-time {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--media-mini-text-secondary);
    font-family: var(--cv-font-body, Inter, system-ui, sans-serif);
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-regular, 400);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }

  .media-mini-time[data-error='true'] {
    color: var(--media-mini-text-secondary);
  }

  .media-mini-progress {
    grid-column: 2;
    grid-row: 1;
    inline-size: calc(100% - var(--media-mini-artwork-size) - var(--media-mini-content-gap));
    min-inline-size: 0;
    block-size: 32px;
    min-block-size: 32px;
    margin-inline-start: calc(var(--media-mini-artwork-size) + var(--media-mini-content-gap));
    align-self: end;
    cursor: pointer;
    touch-action: pan-y;
    -webkit-tap-highlight-color: transparent;
  }

  .media-mini-progress::part(base) {
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 32px;
    display: grid;
    align-items: end;
    justify-items: stretch;
  }

  .media-mini-progress::part(track) {
    inline-size: 100%;
    block-size: 3px;
    border: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    overflow: visible;
  }

  .media-mini-progress::part(range) {
    border-radius: inherit;
    background: var(--media-mini-accent);
    box-shadow: none;
    transition: inline-size 120ms var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1));
  }

  .media-mini-progress::part(thumb) {
    inline-size: 11px;
    block-size: 11px;
    border: 0;
    border-radius: 999px;
    background: var(--media-mini-accent);
    box-shadow: 0 0 0 3px rgba(39, 217, 232, 0.12);
  }

  .media-mini-progress[disabled] {
    cursor: default;
  }

  .media-mini-progress[disabled]::part(thumb) {
    opacity: 0;
  }

  .media-mini-controls {
    grid-column: 3;
    grid-row: 1;
    display: inline-flex;
    align-items: center;
    align-self: center;
    justify-content: flex-end;
    gap: 10px;
    min-inline-size: max-content;
  }

  .media-mini-button,
  .media-mini-menu {
    flex: none;
  }

  .media-mini-button {
    inline-size: 52px;
    block-size: 52px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(39, 217, 232, 0.38);
    border-radius: 999px;
    background: rgba(39, 217, 232, 0.09);
    color: var(--media-mini-accent);
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.06),
      inset 0 -8px 22px rgba(39, 217, 232, 0.04);
    transition:
      transform 140ms var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1)),
      border-color 140ms var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1)),
      background-color 140ms var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1)),
      color 140ms var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1));
  }

  .media-mini-button:active,
  .media-mini-menu:active {
    transform: scale(0.97);
  }

  .media-mini-menu {
    --cv-menu-button-menu-offset: 8px;
    --cv-menu-button-menu-min-inline-size: 188px;
    --cv-menu-button-menu-z-index: var(--cv-z-overlay, 300);
    color: var(--media-mini-text-secondary);
  }

  .media-mini-menu::part(trigger) {
    box-sizing: border-box;
    inline-size: 46px;
    block-size: 46px;
    min-block-size: 46px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.035);
    color: var(--media-mini-text-secondary);
    transition:
      transform 140ms var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1)),
      border-color 140ms var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1)),
      background-color 140ms var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1)),
      color 140ms var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1));
  }

  .media-mini-menu::part(label) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .media-mini-menu::part(prefix),
  .media-mini-menu::part(suffix),
  .media-mini-menu::part(dropdown-icon) {
    display: none;
  }

  .media-mini-menu::part(menu) {
    border: 1px solid var(--media-mini-border);
    border-radius: 14px;
    background: #101722;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.42);
  }

  .media-mini-menu cv-menu-item {
    --cv-menu-item-border-radius: 10px;
    --cv-menu-item-padding-block: 9px;
    --cv-menu-item-padding-inline: 12px;
    color: var(--media-mini-text);
  }

  @media (hover: hover) and (pointer: fine) {
    .media-mini-open:hover .media-mini-title {
      color: color-mix(in srgb, var(--media-mini-text) 88%, var(--media-mini-accent));
    }

    .media-mini-button:hover {
      border-color: rgba(39, 217, 232, 0.58);
      background: rgba(39, 217, 232, 0.13);
    }

    .media-mini-menu:hover::part(trigger) {
      border-color: rgba(255, 255, 255, 0.11);
      background: rgba(255, 255, 255, 0.055);
      color: var(--media-mini-text);
    }
  }

  :host([variant='mobile']) .media-mini-open {
    min-block-size: 52px;
  }

  :host([variant='mobile']) .media-mini {
    --media-mini-artwork-size: 52px;
    --media-mini-content-gap: 14px;
  }

  :host([variant='mobile']) .media-mini-title {
    font-size: 15px;
    line-height: 1.18;
  }

  :host([variant='mobile']) .media-mini-time {
    font-size: 12px;
    line-height: 1.2;
  }

  :host([variant='statusbar']) .media-mini-accent {
    block-size: 22px;
  }

  :host([variant='statusbar']) .media-mini-progress {
    display: none;
  }

  :host([variant='statusbar']) .media-mini-button {
    inline-size: 32px;
    block-size: 32px;
  }

  :host([variant='statusbar']) .media-mini-menu {
    display: none;
  }

  @media (max-width: 380px) {
    :host([variant='mobile']) .media-mini {
      grid-template-columns: 2px minmax(0, 1fr) auto;
      column-gap: 6px;
      padding-inline-start: 8px;
      padding-inline-end: 10px;
      --media-mini-artwork-size: 48px;
      --media-mini-content-gap: 12px;
    }

    :host([variant='mobile']) .media-mini-open {
      min-block-size: 48px;
    }

    :host([variant='mobile']) .media-mini-menu {
      display: none;
    }
  }

  @container statusbar (max-width: 400px) {
    :host([variant='statusbar']) {
      max-inline-size: 52vw;
    }

    :host([variant='statusbar']) .media-mini-time {
      display: none;
    }
  }

  @keyframes media-mini-enter {
    from {
      opacity: 0;
      transform: translateY(8px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .media-mini,
    .media-mini-accent,
    .media-mini-button,
    .media-mini-menu,
    .media-mini-progress::part(range) {
      animation: none;
      transition: none;
    }
  }
`
