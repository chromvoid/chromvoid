import {css} from 'lit'

export const pmGroupCommonStyles = css`
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
  }

  .group-virtual-list {
    flex: 1;
    min-height: 0 !important;
    overflow-y: auto;
    contain: layout style !important;
    scrollbar-gutter: stable both-edges;
    padding-inline-start: var(--pm-scrollbar-safe-area-start);
    padding-inline-end: var(--pm-scrollbar-safe-area-end);
    padding-top: var(--cv-spacing-1);
  }
  .group-virtual-list > * {
    width: calc(100% - var(--pm-scrollbar-safe-area-start) - var(--pm-scrollbar-safe-area-end));
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
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-medium);
    color: var(--cv-color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-header-row {
    padding-block: 6px 2px;
  }
`

export const pmGroupDesktopStyles = css`
  .wrapper {
    gap: var(--cv-space-4);
    animation: var(--motion-fade-up-animation, fadeInUp 0.35s var(--cv-easing-standard) both);
  }

  pm-card-header {
    --cv-header-accent: var(--cv-color-primary);
    inline-size: calc(100% - var(--pm-scrollbar-safe-area));
  }

  .metadata-section {
    inline-size: calc(100% - var(--pm-scrollbar-safe-area));
  }

  .title-avatar-icon {
    --pm-avatar-fallback-bg: linear-gradient(
      135deg,
      var(--cv-color-primary),
      color-mix(in oklch, var(--cv-color-primary) 80%, black)
    );
    --pm-avatar-fallback-color: white;
    --pm-avatar-fallback-border: transparent;
    --pm-avatar-fallback-shadow: none;
  }

  .title-content {
    display: flex;
    flex-direction: column;
    gap: calc(var(--cv-space-2) * 0.75);
  }

  .title-text {
    font-size: var(--cv-font-size-lg);
    font-weight: var(--cv-font-weight-bold);
    color: var(--cv-color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: -0.02em;
    margin: 0;
    line-height: 1.2;
  }

  cv-toolbar {
    margin-block: var(--cv-space-2) 0;
  }

  .group-action-item {
    --cv-toolbar-item-min-height: 36px;
  }

  .group-action-item-content {
    display: inline-flex;
    align-items: center;
    gap: var(--cv-space-2);
  }

  .group-action-item-icon {
    inline-size: 16px;
    block-size: 16px;
    flex: 0 0 auto;
  }

  .group-action-item.icon-only {
    --cv-toolbar-item-padding-inline: var(--cv-space-2);
    min-inline-size: 36px;
  }

  .group-action-item.icon-only .group-action-item-content {
    justify-content: center;
  }

  @container (width < 480px) {
    .wrapper {
      gap: var(--cv-space-3);
    }

    .title-text {
      font-size: calc(var(--cv-font-size-base) * 1.125);
    }
  }

  @media (hover: none) and (pointer: coarse) {
    cv-toolbar {
      --cv-toolbar-gap: 6px;
    }

    .group-action-item {
      --cv-toolbar-item-min-height: 40px;
    }

    .group-action-item.icon-only {
      min-inline-size: 40px;
    }
  }

  @container (width >= 600px) {
    .title-text {
      font-size: 1.5rem;
    }
  }

  @container (width >= 1000px) {
    .title-text {
      font-size: 1.75rem;
    }
  }

  .entry-row,
  .group-row-wrap {
    user-select: none;
  }

  .group-row-wrap {
    padding: 2px 0;
  }

  .group-row * {
    -webkit-user-drag: none;
  }

  .entry-row {
    position: relative;
  }

  .entry-row.active {
    z-index: 1;
    outline: 2px solid color-mix(in oklch, var(--cv-color-primary) 55%, transparent);
    border-radius: var(--cv-radius-2);
  }

  .group-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--cv-space-3);
    padding: var(--app-spacing-1) var(--app-spacing-2);
    min-height: 44px;
    background: var(--cv-color-surface-2);
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-2);
    cursor: pointer;
    transition:
      background-color var(--cv-duration-fast) var(--cv-easing-standard),
      transform var(--cv-duration-fast) var(--cv-easing-standard),
      box-shadow var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .group-row:hover {
    background: var(--cv-color-primary-subtle);
    border-color: var(--cv-color-primary);
    transform: translateY(-1px);
    box-shadow: var(--cv-shadow-1);
  }

  .group-row.active {
    box-shadow: inset 0 0 0 2px color-mix(in oklch, var(--cv-color-primary) 55%, transparent);
    z-index: 1;
  }

  .group-row.drop-target {
    border-color: var(--cv-color-primary);
    background: color-mix(in oklch, var(--cv-color-primary) 18%, var(--cv-color-surface-2));
    box-shadow: 0 0 0 1px color-mix(in oklch, var(--cv-color-primary) 40%, transparent);
  }

  .empty.drop-active {
    border-color: var(--cv-color-primary);
    background: color-mix(in oklch, var(--cv-color-primary) 8%, transparent);
  }
`

export const pmGroupMobileStyles = css`
  .wrapper {
    gap: 6px;
    position: relative;
    --pm-scrollbar-safe-area-start: 6px;
    --pm-scrollbar-safe-area-end: 6px;
  }

  .group-virtual-list {
    scrollbar-gutter: auto;
  }

  pm-card-header,
  pm-card-header-mobile {
    inline-size: calc(100% - var(--pm-scrollbar-safe-area));
  }

  
  .wrapper > * {
    position: relative;
    z-index: 1;
  }

  
  .entry-row,
  .group-row {
    margin: 0;
    padding: 0;
  }
  .entry-row, .group-row-wrap{
    padding: var(--app-spacing-1) 0;
  }

  .entry-row.active {
    outline: 2px solid color-mix(in oklch, var(--cv-color-primary) 55%, transparent);
    border-radius: 10px;
  }

  .group-row {
    display: grid;
    grid-template-columns: min-content 1fr auto;
    align-items: center;
    gap: var(--cv-space-3);
    padding: var(--cv-space-2);
    background: var(--cv-color-surface);
    border: 1px solid var(--cv-color-border-muted);
    border-radius: 12px;
    cursor: pointer;
    transition: background-color var(--cv-duration-fast) var(--cv-easing-standard),
      box-shadow var(--cv-duration-fast) var(--cv-easing-standard),
      border-color var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .group-row:not(.active) {
    border-top-color: color-mix(in oklch, var(--cv-color-primary) 15%, transparent);
  }

  .group-row:hover {
    background: color-mix(in oklch, var(--cv-color-primary) 6%, transparent);
    border-color: color-mix(in oklch, var(--cv-color-primary) 30%, transparent);
  }

  .group-row.active {
    background: color-mix(in oklch, var(--cv-color-primary) 10%, transparent);
    border: 2px solid var(--cv-color-primary);
    border-radius: 14px;
    box-shadow: 0 0 20px color-mix(in oklch, var(--cv-color-primary) 15%, transparent);
  }

  .group-row.active .group-name,
  .group-row.active .group-entry-count,
  .group-row.active .group-chevron {
    color: var(--cv-color-primary);
  }

  .group-row.active .group-icon-wrap {
    background: color-mix(in oklch, var(--cv-color-primary) 20%, transparent);
    border-color: transparent;
  }

  .group-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: min-content;
    border-radius: 10px;
    background: var(--cv-color-surface-3);
    border: 1px solid var(--cv-color-border-muted);
    flex-shrink: 0;
  }

  .group-name {
    font-size: var(--cv-font-size-base);
    font-weight: var(--cv-font-weight-semibold, 600);
  }

  .group-icon-wrap .folder-custom-icon {
    width: 28px;
    height: 28px;
  }

  .group-trail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .group-entry-count {
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-bold, 700);
    color: var(--cv-color-primary-dark);
    font-variant-numeric: tabular-nums;
  }

  .group-chevron {
    width: 14px;
    height: 14px;
    color: var(--cv-color-text-subtle);
    opacity: 0.6;
  }

  .header-entry-pill {
    font-size: 10px;
    font-weight: var(--cv-font-weight-semibold, 600);
    color: var(--cv-color-primary);
    background: var(--cv-color-bg);
    border: 1px solid var(--cv-color-border-muted);
    border-radius: 2px;
    padding: 4px 12px;
    white-space: nowrap;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .mobile-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px;
  }

  .compact-header {
    display: flex;
    align-items: center;
    gap: var(--cv-space-2);
    padding: var(--cv-space-5) var(--cv-space-3);
    min-height: 36px;
  }

  .header-info {
    flex: 1;
    min-inline-size: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .compact-header .group-title {
    font-size: calc(var(--cv-font-size-base) * 1.125);
    font-weight: var(--cv-font-weight-bold);
    color: var(--cv-color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.2;
    margin: 0;
  }

  .compact-header-root-icon {
    width: 20px;
    height: 20px;
    color: var(--cv-color-text-muted);
    flex-shrink: 0;
  }

  .compact-header-icon {
    width: 16px;
    height: 16px;
    --pm-avatar-radius: 4px;
    --pm-avatar-image-fit: contain;
    --pm-avatar-image-padding: 2px;
    --pm-avatar-contrast: calc(var(--pm-avatar-contrast-base) + 2%);
    --pm-avatar-shadow-opacity: 30%;
    --pm-avatar-icon-size: 16px;
  }

  .header-updated {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    white-space: nowrap;
    color: var(--cv-color-text-muted);
    padding: var(--app-spacing-2);

    cv-icon {
      font-size: 12px;
      opacity: 0.5;
    }
  }

  *:focus-visible {
    outline: 2px solid var(--cv-color-focus, var(--cv-color-primary));
    outline-offset: 2px;
  }
`
