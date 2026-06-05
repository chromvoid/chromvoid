import {css} from 'lit'

import {listItemStyles} from '../../list/list-item-styles'
import {pmMobileListRowStyles} from '../../../styles/mobile-list-row'

export const pmEntryListItemBaseStyles = [
  listItemStyles,
  css`
    :host {
      display: block;
      --entry-accent: var(--cv-color-primary);
      container-type: inline-size;
      min-inline-size: 0;
    }

    .list-item {
      position: relative;
      background: var(--cv-color-surface);
      border: 1px solid var(--cv-color-border);
      border-radius: var(--cv-radius-2);
      padding: var(--cv-space-2) var(--cv-space-3);
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) minmax(0, auto) auto auto;
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
      color: var(--pm-entry-row-icon-color, var(--cv-color-primary));
      background: var(--pm-entry-row-icon-background, var(--cv-color-primary-surface));
      border-radius: var(--cv-radius-1);
      padding: 4px;
    }

    .entry-icon-shell {
      position: relative;
      display: inline-flex;
      inline-size: 32px;
      block-size: 32px;
      flex: 0 0 auto;
      min-inline-size: 0;
      min-block-size: 0;
    }

    .entry-favicon {
      width: var(--pm-avatar-list-size);
      height: var(--pm-avatar-list-size);
      display: inline-flex;
      flex-shrink: 0;
      --pm-avatar-radius: var(--pm-avatar-list-radius);
      --pm-avatar-image-fit: contain;
      --pm-avatar-image-padding: var(--pm-avatar-list-image-padding);
      --pm-avatar-image-shadow: var(--pm-avatar-list-image-shadow);
      --pm-avatar-contrast: var(--pm-avatar-contrast-base);
      --pm-avatar-shadow-opacity: var(--pm-avatar-list-shadow-opacity);
      --pm-avatar-letter-size: var(--pm-avatar-list-letter-size);
    }

    .entry-icon-shell .entry-favicon {
      width: 100%;
      height: 100%;
    }

    .entry-type-glyph {
      position: absolute;
      inset-inline-end: -4px;
      inset-block-end: -4px;
      inline-size: 16px;
      block-size: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--cv-color-primary-border-strong);
      border-radius: var(--cv-radius-pill);
      background: var(--cv-color-primary-surface-strong);
      color: var(--cv-color-primary);
      box-shadow:
        0 0 0 1px var(--cv-color-surface),
        0 2px 6px var(--cv-alpha-black-20);
      pointer-events: none;
    }

    .entry-type-glyph cv-icon {
      inline-size: 10px;
      block-size: 10px;
      display: block;
    }

    .item-content {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
      overflow: hidden;
    }

    .item-title {
      display: flex;
      align-items: center;
      gap: calc(var(--cv-space-2) * 0.75);
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-semibold);
      color: var(--cv-color-text);
      letter-spacing: 0;
      line-height: 1.3;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .item-subtitle {
      font-size: var(--cv-font-size-xs);
      color: var(--cv-color-text-muted);
      font-weight: var(--cv-font-weight-regular);
      line-height: 1.2;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .entry-badges {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      justify-content: flex-end;
      gap: 4px;
      min-inline-size: 0;
      max-inline-size: min(46cqw, 320px);
      overflow: hidden;
    }

    .entry-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      min-inline-size: 0;
      max-inline-size: 100%;
      min-block-size: 22px;
      padding: 2px 8px;
      border-radius: var(--cv-radius-1);
      border: 1px solid var(--cv-color-primary-border);
      background: var(--cv-color-primary-surface);
      color: var(--cv-color-primary);
      font-size: 11px;
      font-weight: var(--cv-font-weight-semibold);
      line-height: 1.2;
      white-space: nowrap;
    }

    .entry-badge[data-family='attribute'] {
      border-color: var(--cv-color-primary-border);
      background: var(--cv-color-primary-surface);
      color: var(--cv-color-primary);
    }

    .entry-badge.entry-type-chip {
      flex: 0 0 auto;
      border-color: var(--cv-color-primary-border-strong);
      background: var(--cv-color-primary-surface-strong);
      color: var(--cv-color-primary);
    }

    .entry-badge[data-family='meta'] {
      border-color: var(--cv-color-border);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text-muted);
    }

    .entry-badge[data-family='risk'][data-severity='warning'] {
      border-color: var(--cv-color-warning-border);
      background: var(--cv-color-warning-surface);
      color: var(--cv-color-warning);
    }

    .entry-badge[data-family='risk'][data-severity='critical'] {
      border-color: var(--cv-color-danger-border);
      background: var(--cv-color-danger-surface);
      color: var(--cv-color-danger);
    }

    .entry-badge-label {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .entry-badge cv-icon {
      inline-size: 12px;
      block-size: 12px;
      flex: 0 0 auto;
    }

    .entry-badge-overflow {
      border-style: dashed;
      color: var(--cv-color-text-muted);
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
      background: var(--cv-color-primary-surface-strong);
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

    .entry-menu-button {
      background: transparent;
      border-color: transparent;
      color: var(--cv-color-text-muted);
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
      background: var(--cv-gradient-success);
    }

    @container (width < 320px) {
      .list-item {
        padding: calc(var(--cv-space-2) * 0.75);
      }

      .item-icon,
      .entry-icon-shell,
      .entry-favicon {
        width: var(--pm-avatar-list-compact-size);
        height: var(--pm-avatar-list-compact-size);
      }

      .item-actions {
        display: none;
      }

      .item-subtitle {
        display: none;
      }

      .entry-badge {
        padding-inline: 6px;
      }
    }
  `,
]

export const pmEntryListItemDesktopStyles = css`
  :host {
    block-size: 100%;
  }

  .list-item {
    block-size: var(--pm-desktop-entry-row-inner-height, auto);
    min-block-size: var(--pm-desktop-entry-row-inner-height, 44px);
    padding: var(--pm-entry-row-padding, var(--app-spacing-1) var(--app-spacing-2));
    background: var(--pm-entry-row-background, var(--cv-color-surface));
    border-color: var(--pm-entry-row-border, var(--cv-color-border));
    border-radius: var(--pm-entry-row-radius, var(--cv-radius-2));
    box-shadow: var(--pm-entry-row-shadow, none);
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
    background: var(--pm-entry-row-leading-accent, transparent);
    transition: background var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .list-item:hover {
    background: var(
      --pm-entry-row-hover-background,
      var(--cv-color-primary-surface)
    );
    border-color: var(
      --pm-entry-row-hover-border,
      var(--cv-color-primary-border-strong)
    );
    box-shadow: none;
  }

  .list-item:hover::before {
    background: var(--pm-entry-row-hover-leading-accent, var(--cv-color-primary));
  }

  .list-item.active-row,
  .list-item.selected {
    background: var(
      --pm-entry-row-active-background,
      var(--cv-color-primary-surface-strong)
    );
    border-color: var(--pm-entry-row-active-border, var(--cv-color-primary));
    outline: var(
      --pm-active-outline,
      2px solid var(--cv-color-primary-ring)
    );
    outline-offset: var(--pm-active-outline-offset, -2px);
    box-shadow: none;
  }

  .list-item.active-row::before,
  .list-item.selected::before {
    background: var(--pm-entry-row-active-leading-accent, var(--cv-color-primary));
    width: 4px;
  }

  .list-item:hover .item-icon {
    background: var(--cv-color-primary-surface-strong);
    transform: scale(1.05);
  }

  .list-item:hover .entry-favicon {
    transform: scale(1.02);
  }

  .entry-favicon {
    transition: transform var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .list-item.active-row .entry-favicon,
  .list-item.selected .entry-favicon {
    --pm-avatar-contrast: calc(var(--pm-avatar-contrast-base) + var(--pm-avatar-list-active-contrast-bump));
    --pm-avatar-border-source: var(--cv-color-border-accent);
    --pm-avatar-shadow-opacity: var(--pm-avatar-list-active-shadow-opacity);
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

  .list-item:hover .item-actions,
  .list-item:focus-within .item-actions,
  .list-item[data-secondary-actions='true'] .item-actions,
  .list-item.active-row .item-actions,
  .list-item.selected .item-actions {
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

  .entry-menu-button:hover {
    background: transparent;
    color: var(--cv-color-text);
    border-color: transparent;
    box-shadow: none;
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

  .list-item:hover .primary-action,
  .list-item:focus-within .primary-action,
  .list-item[data-secondary-actions='true'] .primary-action,
  .list-item.active-row .primary-action,
  .list-item.selected .primary-action {
    opacity: 1;
  }
`

export const pmEntryListItemMobileStyles = css`
  ${pmMobileListRowStyles}

  .list-item {
    --pm-mobile-list-row-gap: 6px;
    grid-template-columns: auto minmax(0, 1fr) minmax(0, auto) auto;
    gap: var(--pm-mobile-list-row-gap);
    padding:
      var(--pm-mobile-list-row-padding-block)
      var(--pm-mobile-list-row-padding-inline);
    margin: 0;
  }

  .list-item:not(.selected):not(.active-row) {
    box-shadow: none;
  }

  .entry-favicon {
    width: var(--pm-mobile-list-row-icon-size);
    height: var(--pm-mobile-list-row-icon-size);
    --pm-avatar-radius: var(--pm-mobile-list-row-icon-radius);
    --pm-avatar-image-padding: var(--pm-mobile-list-row-icon-image-padding);
    --pm-avatar-letter-size: var(--pm-mobile-list-row-icon-letter-size);
  }

  .entry-icon-shell {
    inline-size: var(--pm-mobile-list-row-icon-size);
    block-size: var(--pm-mobile-list-row-icon-size);
  }

  .entry-type-glyph {
    inset-inline-end: -3px;
    inset-block-end: -3px;
    inline-size: 15px;
    block-size: 15px;
  }

  .entry-type-glyph cv-icon {
    inline-size: 9px;
    block-size: 9px;
  }

  .list-item.selected .item-title,
  .list-item.selected .item-subtitle {
    color: var(--cv-color-primary);
  }

  .list-item.selected .entry-favicon {
    --pm-avatar-contrast: calc(var(--pm-avatar-contrast-base) + var(--pm-avatar-list-active-contrast-bump));
    --pm-avatar-border-source: var(--cv-color-border-accent);
    --pm-avatar-shadow-opacity: var(--pm-avatar-list-active-shadow-opacity);
  }

  .item-title {
    font-size: 16px;
    font-weight: var(--cv-font-weight-semibold);
    line-height: 1.12;
  }

  .item-subtitle {
    font-size: 13px;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .entry-badges {
    gap: 3px;
    grid-column: 3;
    justify-self: end;
    max-inline-size: min(38cqw, 220px);
  }

  .list-item[data-entry-type='payment_card'] .entry-badges {
    max-inline-size: min(44cqw, 240px);
  }

  .entry-badge {
    min-block-size: 20px;
    padding-inline: 5px;
    font-size: 12px;
  }

  .entry-badge[data-family='meta'] {
    flex: 1 1 auto;
  }

  .entry-badge.entry-type-chip,
  .entry-badge.entry-badge-overflow {
    flex: 0 0 auto;
  }

  .entry-badge.entry-type-chip cv-icon {
    inline-size: 12px;
    block-size: 12px;
  }

  .entry-status-dots {
    position: absolute;
    inset-block-start: 8px;
    inset-inline-end: calc(var(--pm-mobile-list-row-padding-inline) + 34px);
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    pointer-events: none;
  }

  .entry-status-dot {
    --entry-status-dot-color: var(--cv-color-primary);
    --entry-status-dot-glow: var(--pm-entry-status-dot-glow);
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    background: var(--entry-status-dot-color);
    box-shadow:
      0 0 0 1px var(--cv-color-surface-2),
      0 0 6px var(--entry-status-dot-glow);
  }

  .entry-status-dot[data-severity='warning'],
  .entry-status-dot[data-badge-id='reused_password'],
  .entry-status-dot[data-badge-id='ssh'] {
    --entry-status-dot-color: var(--cv-color-warning);
    --entry-status-dot-glow: var(--pm-entry-status-dot-warning-glow);
  }

  .entry-status-dot[data-severity='critical'],
  .entry-status-dot[data-badge-id='weak_password'] {
    --entry-status-dot-color: var(--cv-color-danger);
    --entry-status-dot-glow: var(--pm-entry-status-dot-danger-glow);
  }

  .entry-status-dot[data-badge-id='two_factor'] {
    --entry-status-dot-color: var(--cv-color-primary);
  }

  .item-actions {
    display: none;
  }

  .action-button {
    inline-size: 28px;
    block-size: 36px;
  }

  .primary-action {
    opacity: 1;
  }

  .entry-menu-button {
    grid-column: 4;
    justify-self: end;
    color: var(--cv-color-text-muted);
  }

  .entry-menu-button cv-icon {
    inline-size: 18px;
    block-size: 18px;
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
    position: relative;
    z-index: 1;
    touch-action: pan-y;
    transform: translateX(var(--pm-entry-swipe-offset-x, 0px));
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
    background: var(--cv-gradient-surface-primary);
  }

  .swipe-actions-right {
    inset-inline-end: 0;
    background: var(--cv-gradient-surface-danger);
  }

  .swipe-action {
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--cv-alpha-black-10);
    border: 1px solid var(--cv-alpha-white-20);
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
`
