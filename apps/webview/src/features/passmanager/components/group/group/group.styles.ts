import {css} from 'lit'

import {scrollEdgeAffordanceStyles} from 'root/shared/ui/scroll-edge-affordance.styles'

export const pmGroupCommonStyles = css`
  ${scrollEdgeAffordanceStyles}

  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  :host *,
  :host *::before,
  :host *::after {
    box-sizing: border-box;
  }

  .wrapper {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    --pm-scrollbar-safe-area-end: 14px;
    --pm-scrollbar-safe-area-start: 0px;
    --pm-scrollbar-safe-area: calc(var(--pm-scrollbar-safe-area-start) + var(--pm-scrollbar-safe-area-end));
  }

  .group-virtual-list {
    padding: 2px;
    flex: 1;
    block-size: 100%;
    min-height: 0 !important;
    overflow-y: auto;
    contain: layout style !important;
    scrollbar-gutter: stable both-edges;
    padding-inline-start: var(--pm-scrollbar-safe-area-start);
    padding-inline-end: var(--pm-scrollbar-safe-area-end);
    padding-top: var(--cv-space-1);
  }

  .pm-group-scroll-edge {
    flex: 1;
    min-block-size: 0;
    --cv-scroll-edge-block-size: 46px;
    --cv-scroll-edge-inline-start: var(--pm-scrollbar-safe-area-start);
    --cv-scroll-edge-inline-end: var(--pm-scrollbar-safe-area-end);
    --cv-scroll-edge-surface: var(--cv-color-surface);
  }

  .group-virtual-list > * {
    width: calc(100% - var(--pm-scrollbar-safe-area-start) - var(--pm-scrollbar-safe-area-end));
  }

  .entry-row[data-delete-exiting],
  .group-row-wrap[data-delete-exiting] {
    pointer-events: none;
    transform-origin: center;
    animation: pm-delete-row-exit var(--cv-duration-normal, 250ms)
      var(--cv-easing-decelerate, cubic-bezier(0, 0, 0.2, 1)) both;
    will-change: transform, opacity;
  }

  @keyframes pm-delete-row-exit {
    0% {
      opacity: 1;
      transform: scale(1);
    }

    35% {
      opacity: 0.92;
      transform: scale(1.025, 0.94);
    }

    100% {
      opacity: 0;
      transform: scale(0.96, 0.82);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .entry-row[data-delete-exiting],
    .group-row-wrap[data-delete-exiting] {
      animation: pm-delete-row-exit-reduced 1ms linear both;
      transform: none;
      will-change: opacity;
    }

    @keyframes pm-delete-row-exit-reduced {
      to {
        opacity: 0;
      }
    }
  }

  .folder-custom-icon {
    width: 24px;
    height: 24px;
    --pm-avatar-radius: var(--cv-radius-1);
    --pm-avatar-image-fit: contain;
    --pm-avatar-image-padding: 4px;
    --pm-avatar-contrast: var(--pm-avatar-contrast-base);
    --pm-avatar-shadow-opacity: 30%;
  }

  .group-name {
    min-width: 0;
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-medium);
    line-height: 1.15;
    color: var(--cv-color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
    align-content: center;
  }

  .group-description {
    min-width: 0;
    font-size: 11px;
    line-height: 1.1;
    color: var(--cv-color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-size {
    font-size: var(--cv-font-size-sm);
    opacity: 0.5;
    font-family: var(--cv-font-family-code, 'JetBrains Mono', monospace);
  }

  .group-trail {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--cv-space-2);
    min-inline-size: 0;
  }

  .group-chevron {
    inline-size: 14px;
    block-size: 14px;
    color: var(--cv-color-text-subtle);
    opacity: 0.7;
    flex: 0 0 auto;
  }

  .group-risk-dot {
    inline-size: 8px;
    block-size: 8px;
    flex: 0 0 8px;
    border-radius: 999px;
    border: 1px solid currentColor;
  }

  .group-risk-dot[data-severity='warning'] {
    color: var(--cv-color-warning);
    background: var(--cv-color-warning);
    box-shadow: 0 0 0 3px var(--cv-color-warning-ring);
  }

  .group-risk-dot[data-severity='critical'] {
    color: var(--cv-color-danger);
    background: var(--cv-color-danger);
    box-shadow: 0 0 0 3px var(--cv-color-danger-ring);
  }

  .group-metrics-strip {
    max-inline-size: 100%;
    min-inline-size: 0;
  }

  .group-metrics-status {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .group-title-edit-action {
    inline-size: 28px;
    block-size: 28px;
    flex: 0 0 28px;
  }

  .edit-icon-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--cv-color-text-muted);
    cursor: pointer;
    transition:
      color var(--cv-duration-fast),
      background-color var(--cv-duration-fast),
      transform var(--cv-duration-fast);
  }

  .edit-icon-action:hover:not(:disabled) {
    color: var(--cv-color-text);
    background: var(--cv-color-surface-tertiary-glass-strong);
    transform: translateY(-1px);
  }

  .edit-icon-action:focus-visible {
    outline: 2px solid var(--cv-color-primary);
    outline-offset: 2px;
  }

  .edit-icon-action:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .edit-icon-action cv-icon {
    font-size: 14px;
  }

  .group-inline-edit-stack {
    display: grid;
    gap: 12px;
    inline-size: min(100%, 52rem);
    max-inline-size: 100%;
  }

  .group-inline-description-input {
    --cv-textarea-background: transparent;
  }

  .group-inline-description-input::part(base) {
    min-block-size: 132px;
  }

  .group-inline-edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-block-start: 2px;
  }

  .inline-edit-cancel,
  .inline-edit-save {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-block-size: 34px;
    padding-inline: 12px;
    border-radius: var(--cv-radius-2);
    font: inherit;
    font-size: 0.82rem;
    font-weight: var(--cv-font-weight-semibold);
    cursor: pointer;
  }

  .inline-edit-cancel {
    border: 1px solid var(--cv-color-border-muted);
    background: transparent;
    color: var(--cv-color-text);
  }

  .inline-edit-save {
    border: 1px solid var(--cv-color-primary-border);
    background: var(--cv-color-primary);
    color: var(--cv-color-on-primary, var(--cv-color-text));
  }

  .error-text {
    color: var(--cv-color-danger);
    font-size: var(--cv-font-size-xs);
  }

  .group-header-row {
    padding-block: 8px 6px;
    padding-inline: 6px;
  }

  .group-header {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-block-size: 28px;
    padding-inline: 12px 10px;
    border-radius: 999px;
    background: var(--cv-color-surface-2);
    color: var(--cv-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .group-header-label {
    white-space: nowrap;
  }

  .group-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 22px;
    min-block-size: 22px;
    padding-inline: 7px;
    border-radius: 999px;
    background: var(--cv-color-primary-surface);
    color: var(--cv-color-primary);
    font-variant-numeric: tabular-nums;
  }
`
