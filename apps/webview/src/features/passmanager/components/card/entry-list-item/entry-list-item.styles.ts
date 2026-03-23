import {css} from 'lit'

import {listItemStyles} from '../../list/list-item-styles'

export const pmEntryListItemBaseStyles = [
  listItemStyles,
  css`
    :host {
      --entry-accent: var(--cv-color-primary);
      container-type: inline-size;
    }

    .list-item {
      position: relative;
      background: var(--cv-color-surface);
      border: 1px solid var(--cv-color-border);
      border-radius: var(--cv-radius-2);
      padding: var(--cv-space-2) var(--cv-space-3);
      display: grid;
      grid-template-columns: auto 1fr auto auto;
      align-items: center;
      gap: 12px;
      user-select: none;
    }

    .list-item * {
      -webkit-user-drag: none;
    }

    .item-icon {
      width: 24px;
      height: 24px;
      color: var(--cv-color-primary);
      background: color-mix(in oklch, var(--cv-color-primary) 12%, transparent);
      border-radius: var(--cv-radius-1);
      padding: 4px;
    }

    .entry-favicon {
      width: 24px;
      height: 24px;
      display: inline-flex;
      flex-shrink: 0;
      --pm-avatar-radius: var(--cv-radius-1);
      --pm-avatar-image-fit: contain;
      --pm-avatar-image-padding: 3px;
      --pm-avatar-contrast: var(--pm-avatar-contrast-base);
      --pm-avatar-shadow-opacity: 30%;
      --pm-avatar-letter-size: 11px;
    }

    .item-content {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }

    .item-title {
      display: flex;
      align-items: center;
      gap: calc(var(--cv-space-2) * 0.75);
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-semibold);
      color: var(--cv-color-text);
      letter-spacing: -0.01em;
      line-height: 1.3;
    }

    .item-subtitle {
      font-size: var(--cv-font-size-xs);
      color: var(--cv-color-text-muted);
      font-weight: var(--cv-font-weight-regular);
      line-height: 1.2;
    }

    .otp-indicator {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--cv-color-success), var(--cv-color-primary));
      box-shadow:
        0 0 0 1px var(--cv-color-surface-2),
        0 0 6px color-mix(in oklch, var(--cv-color-success) 50%, transparent);
      --motion-pulse-mid-opacity: 0.7;
      --motion-pulse-mid-scale: 1.1;
    }

    .ssh-indicator {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--cv-color-warning, #f59e0b), var(--cv-color-primary));
      box-shadow:
        0 0 0 1px var(--cv-color-surface-2),
        0 0 6px color-mix(in oklch, var(--cv-color-warning, #f59e0b) 50%, transparent);
    }

    .item-actions {
      display: flex;
      gap: calc(var(--cv-space-2) * 0.75);
    }

    .action-button {
      width: 24px;
      height: 24px;
      border-radius: var(--cv-radius-1);
      border: 1px solid transparent;
      background: color-mix(in oklch, var(--cv-color-surface-2) 80%, var(--cv-color-primary) 20%);
      color: var(--cv-color-text);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .action-button cv-icon {
      width: 14px;
      height: 14px;
      display: block;
    }

    .status-indicator {
      position: absolute;
      top: calc(var(--cv-space-2) * 0.75);
      right: calc(var(--cv-space-2) * 0.75);
      width: 6px;
      height: 6px;
      border-radius: 50%;
      box-shadow: 0 0 0 1px var(--cv-color-surface-2);
    }

    .status-indicator.has-otp {
      background: linear-gradient(135deg, var(--cv-color-success), var(--cv-color-info));
    }

    @container (width < 320px) {
      .list-item {
        padding: calc(var(--cv-space-2) * 0.75);
      }

      .item-icon,
      .entry-favicon {
        width: 20px;
        height: 20px;
      }

      .item-actions {
        display: none;
      }

      .item-subtitle {
        display: none;
      }
    }
  `,
]

export const pmEntryListItemDesktopStyles = css`
  .list-item {
    padding: var(--app-spacing-1) var(--app-spacing-2);
    transition:
      transform var(--cv-duration-fast) var(--cv-easing-standard),
      box-shadow var(--cv-duration-fast) var(--cv-easing-standard),
      border-color var(--cv-duration-fast) var(--cv-easing-standard),
      background var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .list-item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 3px;
    border-radius: 2px;
    background: transparent;
    transition: background var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .list-item:hover {
    background: color-mix(in oklch, var(--cv-color-surface-2) 90%, var(--cv-color-primary) 10%);
    border-color: color-mix(in oklch, var(--cv-color-border) 60%, var(--cv-color-primary) 40%);
    transform: translateY(-1px);
    box-shadow:
      var(--cv-shadow-2),
      inset 4px 0 0 0 var(--cv-color-primary);
  }

  .list-item:hover::before {
    background: var(--cv-color-primary);
  }

  .list-item.selected {
    background: color-mix(in oklch, var(--cv-color-surface-2) 85%, var(--cv-color-primary) 15%);
    border-color: var(--cv-color-primary);
    box-shadow:
      var(--cv-shadow-2),
      0 0 0 2px color-mix(in oklch, var(--cv-color-primary) 20%, transparent);
  }

  .list-item.selected::before {
    background: var(--cv-color-primary);
    width: 4px;
  }

  .list-item:hover .item-icon {
    background: color-mix(in oklch, var(--cv-color-primary) 20%, transparent);
    transform: scale(1.05);
  }

  .list-item:hover .entry-favicon {
    transform: scale(1.05);
  }

  .entry-favicon {
    transition: transform var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .list-item.selected .entry-favicon {
    --pm-avatar-contrast: calc(var(--pm-avatar-contrast-base) + 8%);
    --pm-avatar-border-source: var(--cv-color-border-accent);
    --pm-avatar-shadow-opacity: 34%;
  }

  .item-actions {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateX(8px);
    transition:
      opacity var(--cv-duration-fast) var(--cv-easing-standard),
      transform var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .list-item:focus .item-actions {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transform: translateX(0);
  }

  @media (hover: none) and (pointer: coarse) {
    .item-actions {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translateX(0);
    }
  }

  .action-button {
    transition:
      background-color var(--cv-duration-fast) var(--cv-easing-standard),
      transform var(--cv-duration-fast) var(--cv-easing-standard),
      box-shadow var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .action-button:hover {
    background: var(--cv-color-primary);
    color: white;
    border-color: var(--cv-color-primary);
    transform: scale(1.1);
    box-shadow: var(--cv-shadow-1);
  }

  .action-button:active {
    transform: scale(0.95);
  }

  .primary-action {
    opacity: 0.6;
    transition:
      opacity var(--cv-duration-fast) var(--cv-easing-standard),
      background var(--cv-duration-fast) var(--cv-easing-standard),
      color var(--cv-duration-fast) var(--cv-easing-standard),
      transform var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .list-item:focus .primary-action {
    opacity: 1;
  }
`

export const pmEntryListItemMobileStyles = css`
  .list-item {
    grid-template-columns: auto 1fr auto;
    gap: var(--cv-space-2);
    padding: 8px 12px;
    margin: 0;
    border-radius: var(--cv-radius-2);
    touch-action: pan-y;
  }

  .item-subtitle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-actions {
    display: none;
  }

  .action-button {
    inline-size: 36px;
    block-size: 36px;
  }

  .primary-action {
    opacity: 1;
  }

  .status-indicator {
    display: none;
  }

  /* ── Swipe-to-reveal ── */

  .swipe-container {
    position: relative;
    overflow: hidden;
    border-radius: var(--cv-radius-2);
  }

  .swipe-container > .list-item {
    background: var(--cv-color-surface);
    position: relative;
    z-index: 1;
  }

  .swipe-actions-left,
  .swipe-actions-right {
    position: absolute;
    inset-block: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding-inline: 8px;
    visibility: hidden;
    pointer-events: none;
  }

  .swipe-container.swipe-right .swipe-actions-left,
  .swipe-container.swipe-left .swipe-actions-right {
    visibility: visible;
    pointer-events: auto;
  }

  .swipe-actions-left {
    inset-inline-start: 0;
    background: linear-gradient(
      90deg,
      color-mix(in oklch, var(--cv-color-danger) 28%, var(--cv-color-surface)) 0%,
      color-mix(in oklch, var(--cv-color-danger) 18%, var(--cv-color-surface)) 100%
    );
  }

  .swipe-actions-right {
    inset-inline-end: 0;
    background: linear-gradient(
      270deg,
      color-mix(in oklch, var(--cv-color-primary) 24%, var(--cv-color-surface)) 0%,
      color-mix(in oklch, var(--cv-color-primary) 16%, var(--cv-color-surface)) 100%
    );
  }

  .swipe-action {
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in oklch, black 14%, transparent);
    border: 1px solid color-mix(in oklch, white 20%, transparent);
    border-radius: var(--cv-radius-2);
    padding: 8px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .swipe-action cv-icon {
    width: 18px;
    height: 18px;
    display: block;
  }

  .list-item.swiping {
    transition: none;
  }

  .list-item.snap-back {
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* ── Context menu ── */

  .context-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
  }

  .context-menu {
    position: fixed;
    z-index: 1000;
    min-width: 180px;
    background: var(--cv-color-surface-2);
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-3);
    padding: 4px;
    box-shadow: var(--cv-shadow-3);
  }

  .context-menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--cv-radius-2);
    font-size: var(--cv-font-size-sm);
    color: var(--cv-color-text);
    background: none;
    border: none;
    width: 100%;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .context-menu-item:active {
    background: color-mix(in oklch, var(--cv-color-primary) 12%, transparent);
  }

  .context-menu-item[disabled] {
    opacity: 0.4;
    pointer-events: none;
  }

  .context-menu-item.destructive {
    color: var(--cv-color-danger);
  }

  .context-menu-item cv-icon {
    width: 16px;
    height: 16px;
    display: block;
    flex-shrink: 0;
  }

  .context-menu-separator {
    height: 1px;
    background: var(--cv-color-border);
    margin: 4px 8px;
  }
`
