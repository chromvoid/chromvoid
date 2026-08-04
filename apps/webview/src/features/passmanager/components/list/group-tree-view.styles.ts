import {css} from 'lit'

import {hostContentContainStyles} from 'root/shared/ui/shared-styles'

export const groupTreeViewStyles = [
  hostContentContainStyles,
  css`
    :host {
      user-select: none;
      display: block;
      min-block-size: 0;
    }

    .tree {
      display: grid;
      gap: 6px;
      padding: 0 0 12px;
      min-block-size: 0;
    }

    .tree-branch {
      display: grid;
      min-inline-size: 0;
    }

    .tree-branch[data-delete-exiting] {
      pointer-events: none;
      animation: pm-tree-branch-exit var(--cv-duration-fast) var(--cv-easing-accelerate) both;
      will-change: transform, opacity;
    }

    .tree-branch[data-entering] {
      animation: pm-tree-branch-enter var(--cv-duration-normal) var(--cv-easing-decelerate) both;
      will-change: transform, opacity;
    }

    .tree[data-pm-tree-transition='true'] {
      view-transition-name: none;
    }

    .tree[data-pm-tree-transition='true'] .tree-branch {
      view-transition-name: match-element;
      view-transition-class: pm-tree-branch;
    }

    .tree::view-transition-group(*.pm-tree-branch) {
      animation-duration: var(--cv-duration-normal);
      animation-timing-function: var(--cv-easing-decelerate);
    }

    @keyframes pm-tree-branch-exit {
      to {
        opacity: 0;
        transform: translateX(calc(-1 * var(--cv-space-2))) scale(0.985);
      }
    }

    @keyframes pm-tree-branch-enter {
      from {
        opacity: 0;
        transform: translateX(calc(-1 * var(--cv-space-2))) scale(0.985);
      }
    }

    .row {
      position: relative;
      display: grid;
      grid-template-columns: 18px 1fr min-content;
      align-items: center;
      gap: 8px;
      padding-block: 8px;
      padding-inline-start: calc(
        var(--pm-credentials-content-inset-start, 8px) + (attr(data-depth number, 0) * 12px)
      );
      padding-inline-end: var(--pm-credentials-content-inset-end, 10px);
      border-radius: 14px;
      border: 1px solid transparent;
      background: transparent;
      cursor: pointer;
      transition:
        background-color var(--cv-duration-fast) var(--cv-easing-standard),
        border-color var(--cv-duration-fast) var(--cv-easing-standard),
        transform var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .row::before {
      content: '';
      position: absolute;
      inset-inline-start: 0;
      inset-block: 9px;
      inline-size: 3px;
      border-radius: 999px;
      background: var(--cv-color-primary);
      opacity: 0;
      transform: scaleY(0.45);
      transition:
        opacity var(--cv-duration-fast) var(--cv-easing-standard),
        transform var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .row * {
      -webkit-user-drag: none;
    }

    .row.empty-group {
      opacity: 0.55;
    }

    .row.empty-group .name {
      color: var(--cv-color-text-muted);
    }

    .row:hover {
      transform: translateX(3px);
      background: var(--cv-color-surface-2);
    }

    .row.selected {
      background: var(--cv-color-surface-2);
    }

    .row.selected::before {
      opacity: 1;
      transform: scaleY(1);
    }

    .row.drop-target {
      transform: translateX(6px);
      border-color: transparent;
      background: var(--cv-color-primary-surface);
      outline: var(--pm-active-outline, 2px solid var(--cv-color-primary-ring));
      outline-offset: var(--pm-active-outline-offset, -2px);
    }

    .row.selected:hover {
      background: var(--cv-color-surface-3);
    }

    .row.drop-target::before {
      opacity: 1;
      transform: scaleY(1);
    }

    .label {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .name {
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-medium);
      color: var(--cv-color-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .group-icon-image {
      width: 18px;
      height: 18px;
      --pm-avatar-radius: 5px;
      --pm-avatar-image-fit: contain;
      --pm-avatar-image-padding: 0px;
      --pm-avatar-image-inset-shadow-color: transparent;
      --pm-avatar-contrast: calc(var(--pm-avatar-contrast-base) + 2%);
      --pm-avatar-shadow-opacity: 30%;
      --pm-avatar-icon-size: 16px;
    }

    .row.selected .group-icon-image {
      --pm-avatar-contrast: calc(var(--pm-avatar-contrast-base) + 8%);
      --pm-avatar-border-source: transparent;
      --pm-avatar-shadow-opacity: 20%;
    }

    .row.selected .name {
      color: var(--cv-color-text);
      font-weight: 600;
    }

    .count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-inline-size: auto;
      min-block-size: 16px;
      padding-inline: 4px;
      border-radius: 999px;
      font-size: 10px;
      font-family: var(--cv-font-family-code);
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--cv-color-text-secondary);
      background: transparent;
    }

    .row.selected .count {
      color: var(--cv-color-primary);
      background: var(--cv-color-primary-surface);
    }

    .root {
      font-style: italic;
      opacity: 0.9;
    }

    .chevron {
      width: 18px;
      height: 18px;
      border: none;
      background: transparent;
      padding: 0;
      margin: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--cv-color-text-muted);
      cursor: pointer;
      transition: transform var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .chevron.expanded {
      transform: rotate(90deg);
    }

    .chevron[aria-hidden='true'] {
      cursor: default;
    }

    .chevron cv-icon {
      width: 12px;
      height: 12px;
    }

    .actions {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      opacity: 0;
      pointer-events: none;
      transform: translateX(6px);
      transition:
        opacity var(--cv-duration-fast) var(--cv-easing-standard),
        transform var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .row:hover .actions,
    .row.selected .actions,
    .row:focus-within .actions {
      opacity: 1;
      pointer-events: auto;
      transform: translateX(0);
    }

    .action-btn {
      width: 22px;
      height: 22px;
      border-radius: var(--cv-radius-1);
      border: 1px solid transparent;
      background: var(--cv-color-primary-surface-strong);
      color: var(--cv-color-text);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .action-btn:hover {
      background: var(--cv-color-primary);
      color: white;
      border-color: var(--cv-color-primary);
      transform: scale(1.08);
    }

    .action-btn cv-icon {
      width: 12px;
      height: 12px;
    }

    .root-icon {
      width: 16px;
      height: 16px;
    }

    @container (max-width: 280px) {
      .count {
        display: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .tree-branch[data-delete-exiting],
      .tree-branch[data-entering] {
        animation: none;
        transform: none;
        will-change: auto;
      }
    }
  `,
]
