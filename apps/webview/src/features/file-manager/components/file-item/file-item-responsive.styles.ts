import {css} from 'lit'

export const fileItemResponsiveStyles = css`
  @media (hover: none) and (pointer: coarse) {
    /* Remove active/focus outlines on touch — no keyboard nav */
    :host([active]) {
      outline: none;
    }

    /* Remove border-radius on list items to prevent swipe action bleed-through */
    :host([view-mode='list']) {
      border-radius: 0;
    }

    /* Hide inline actions on touch — context menu is used instead */
    .actions {
      display: none;
    }

    /* Disable hover transforms that look bad on touch */
    :host([view-mode='list']):hover {
      transform: none;
      box-shadow: none;
      background: inherit;

      &::before {
        opacity: 0;
      }
    }

    :host([view-mode='list'][selected]):hover::before {
      opacity: 1;
    }

    :host([view-mode='grid']):hover {
      transform: none;
      box-shadow: var(--cv-shadow-1);
    }

    :host([view-mode='table']):hover {
      transform: none;
      box-shadow: none;
    }

    /* Active press feedback for touch */
    :host(:active) {
      opacity: 0.85;
      transition-duration: 50ms;
    }

    /* Slightly reduce list item height on mobile for density */
    :host([view-mode='list']) {
      height: 64px;
    }

    :host([view-mode='list']) .file-item {
      padding: 8px 12px;
      gap: 10px;
    }

    :host([view-mode='list']) .icon {
      font-size: 20px;
      min-inline-size: 28px;
      block-size: 28px;
    }

    :host([view-mode='list']) .name {
      font-size: var(--cv-font-size-sm, 0.875rem);
    }

    :host([view-mode='list']) .meta {
      font-size: var(--cv-font-size-xs, 0.75rem);
    }

    /* Reduce grid card height on mobile */
    :host([view-mode='grid']) {
      block-size: 160px;
    }

    :host([view-mode='grid']) .icon {
      font-size: 36px;
      min-inline-size: 48px;
      block-size: 48px;
      margin-block-end: var(--app-spacing-2);
    }

    :host([view-mode='grid']) .file-item {
      padding: var(--app-spacing-3);
    }

    /* Larger selection indicator for touch */
    .selection-indicator {
      inline-size: 22px;
      block-size: 22px;
    }

    /* ========== SWIPE-TO-REVEAL ========== */
    .swipe-container {
      position: relative;
      overflow: hidden;
      border-radius: inherit;
      block-size: 100%;
    }

    .swipe-container > .file-item {
      background: var(--cv-color-surface, #1a1a2e);
      position: relative;
      z-index: 1;
      touch-action: pan-y;
    }

    .swipe-actions-left,
    .swipe-actions-right {
      position: absolute;
      inset-block: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      inline-size: 64px;
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
        color-mix(in oklch, var(--cv-color-brand, #00e5ff) 24%, var(--cv-color-surface, #0b1120)) 0%,
        color-mix(in oklch, var(--cv-color-brand, #00e5ff) 16%, var(--cv-color-surface, #0b1120)) 100%
      );
    }

    .swipe-actions-right {
      inset-inline-end: 0;
      background: linear-gradient(
        270deg,
        color-mix(in oklch, var(--cv-color-danger, #ff3b30) 28%, var(--cv-color-surface, #0b1120)) 0%,
        color-mix(in oklch, var(--cv-color-danger, #ff3b30) 18%, var(--cv-color-surface, #0b1120)) 100%
      );
    }

    .swipe-action {
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      background: color-mix(in oklch, black 14%, transparent);
      border: 1px solid color-mix(in oklch, white 20%, transparent);
      border-radius: var(--cv-radius-2);
      padding: 6px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .swipe-action cv-icon {
      font-size: 18px;
    }

    .file-item.swiping {
      transition: none;
    }

    .file-item.snap-back {
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
  }
`
