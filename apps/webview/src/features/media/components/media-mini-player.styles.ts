import {css} from 'lit'

export const mediaMiniPlayerStyles = css`
  :host {
    display: block;
    min-inline-size: 0;
    --media-mini-surface: var(--cv-color-media-mini-surface);
    --media-mini-surface-start: var(--cv-color-media-mini-surface-start);
    --media-mini-surface-end: var(--cv-color-media-mini-surface-end);
    --media-mini-border: var(--cv-color-media-mini-border);
    --media-mini-text: var(--cv-color-media-mini-text);
    --media-mini-text-secondary: var(--cv-color-media-mini-text-secondary);
    --media-mini-text-muted: var(--cv-color-media-mini-text-muted);
    --media-mini-accent: var(--cv-color-media-mini-accent);
    --media-mini-accent-muted: var(--cv-color-media-mini-accent-muted);
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
    background: var(--cv-gradient-media-mini-surface);
    color: var(--media-mini-text-secondary);
    box-shadow: var(--cv-shadow-media-mini);
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
    background: var(--cv-gradient-media-mini-accent-line);
    clip-path: polygon(0 0, 100% 3px, 100% calc(100% - 3px), 0 100%);
    opacity: 0.78;
    box-shadow: 0 0 8px var(--cv-color-media-mini-accent-glow);
    transform: translateY(-50%);
    transition: opacity 180ms var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1));
  }

  .media-mini[data-playing='true'] .media-mini-accent {
    opacity: 1;
  }

  .media-mini[data-error='true'] .media-mini-accent {
    background: var(--cv-gradient-media-mini-error-line);
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
    border: 1px solid var(--cv-color-media-mini-accent-border);
    border-radius: 10px;
    background: var(--cv-gradient-media-mini-fallback-tile);
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
    background: var(--cv-color-media-mini-track);
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
    box-shadow: 0 0 0 3px var(--cv-color-media-mini-accent-glow-strong);
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
    border: 1px solid var(--cv-color-media-mini-accent-border-strong);
    border-radius: 999px;
    background: var(--cv-color-media-mini-accent-soft);
    color: var(--media-mini-accent);
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    box-shadow:
      var(--cv-shadow-media-mini-control);
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
    --cv-menu-button-icon-overflow-menu-offset: 8px;
    --cv-menu-button-icon-overflow-menu-min-inline-size: 188px;
    --cv-menu-button-menu-z-index: var(--cv-z-overlay, 300);
    color: var(--media-mini-text-secondary);
  }

  .media-mini-menu::part(trigger) {
    box-sizing: border-box;
    inline-size: 46px;
    block-size: 46px;
    min-block-size: 46px;
    padding: 0;
    border: 1px solid var(--cv-alpha-white-8);
    border-radius: 999px;
    background: var(--cv-color-media-mini-control-surface);
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
    background: var(--media-mini-surface);
    box-shadow: var(--cv-shadow-media-mini-menu);
  }

  .media-mini-menu cv-menu-item {
    --cv-menu-item-border-radius: 10px;
    --cv-menu-item-padding-block: 9px;
    --cv-menu-item-padding-inline: 12px;
    color: var(--media-mini-text);
  }

  @media (hover: hover) and (pointer: fine) {
    .media-mini-open:hover .media-mini-title {
      color: var(--cv-color-media-mini-text);
    }

    .media-mini-button:hover {
      border-color: var(--cv-color-media-mini-accent-border-hover);
      background: var(--cv-color-media-mini-accent-surface-hover);
    }

    .media-mini-menu:hover::part(trigger) {
      border-color: var(--cv-color-media-mini-border-hover);
      background: var(--cv-color-media-mini-control-surface-hover);
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
