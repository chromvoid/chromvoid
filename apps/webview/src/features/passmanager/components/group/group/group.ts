import {hostContainStyles, motionPrimitiveStyles} from 'root/shared/ui/shared-styles'
import {CvEmptyState} from 'root/shared/ui/empty-state'
import {css} from 'lit'

import {
  folderItemCSS,
  listItemsCSS,
  metadataSectionCSS,
  pmSharedStyles,
} from '../../../styles/shared'
import {listGroupStyles} from '../../list/list-item-styles'
import {pmEntryCardStyles} from '../../card/entry-create/styles'
import {PMWorkspaceHeader} from '../../card/pm-workspace-header'
import {PMSummaryRail} from '../../summary-rail'
import {PMGroupBase} from './group-base'
import {pmGroupCommonStyles} from './styles'

export const pmGroupDesktopStyles = css`
  .wrapper {
    --pm-desktop-list-inline-padding: var(--app-surface-gutter-desktop);
    --pm-desktop-list-row-padding-start: var(--app-surface-gutter-desktop);
    --pm-desktop-list-row-padding-end: var(--app-surface-gutter-desktop);
    --pm-desktop-content-shell-padding-block: 0px;
    --pm-desktop-content-shell-padding-inline: 0px;
    --pm-desktop-page-content-inset-start: calc(
      var(--pm-desktop-content-shell-padding-inline) +
        var(--pm-desktop-list-inline-padding) +
        var(--pm-desktop-list-row-padding-start)
    );
    --pm-desktop-page-content-inset-end: calc(
      var(--pm-desktop-content-shell-padding-inline) +
        var(--pm-scrollbar-safe-area-end) -
        var(--pm-desktop-list-inline-padding) +
        var(--pm-desktop-list-row-padding-end)
    );
    display: grid;
    gap: 18px;
    grid-template-rows: min-content auto;
    animation: var(--motion-fade-up-animation, fadeInUp 0.35s var(--cv-easing-standard) both);
    min-height: 0;
    padding: 0;
  }

  pm-workspace-header,
  .group-metrics-strip {
    margin-inline: var(--pm-desktop-page-content-inset-start) var(--pm-desktop-page-content-inset-end);
  }

  pm-workspace-header {
    --pm-workspace-header-padding-inline: 0px;
  }

  .group-metrics-strip {
    --pm-summary-rail-inline-size: 100%;
  }

  .group-virtual-list {
    --pm-desktop-list-row-height: 48px;
    --pm-entry-row-radius: 18px;
    --pm-entry-row-padding: 0 var(--pm-desktop-list-row-padding-end) 0 var(--pm-desktop-list-row-padding-start);
    block-size: 100%;
    padding: var(--app-surface-gutter-desktop) var(--pm-desktop-list-inline-padding);
    border-radius: 20px;

  }

  .workspace-back {
    flex: 0 0 auto;
  }

  .workspace-summary-value {
    font-family: var(--cv-font-family-code);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--cv-color-text-secondary);
  }

  .workspace-stats {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .workspace-actions {
    display: grid;
    gap: 8px;
    justify-items: end;
  }

  .workspace-actions-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--cv-color-text-subtle);
  }

  cv-toolbar {
    margin: 0;
    padding: 0;
    --cv-toolbar-gap: 8px;
    justify-content: flex-end;
  }

  .group-action-item {
    --cv-toolbar-item-min-height: 38px;
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

  .content-shell {
    flex: 1;
    display: flex;
    min-height: 0;
    padding: var(--pm-desktop-content-shell-padding-block) var(--pm-desktop-content-shell-padding-inline);
  }

  .entry-row,
  .group-row-wrap {
    user-select: none;
    min-block-size: var(--pm-desktop-list-row-height);
  }

  .group-row-wrap {
    padding: 0;
    block-size: var(--pm-desktop-list-row-height);
  }

  .group-row * {
    -webkit-user-drag: none;
  }

  .entry-row {
    display: block;
    position: relative;
    block-size: var(--pm-desktop-list-row-height);
    --pm-desktop-entry-row-inner-height: calc(var(--pm-desktop-list-row-height) - 4px);
  }

  .group-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--cv-space-3);
    position: relative;
    isolation: isolate;
    padding-block: 0;
    padding-inline: var(--pm-desktop-list-row-padding-start) var(--pm-desktop-list-row-padding-end);
    block-size: calc(var(--pm-desktop-list-row-height) - 4px);
    background: transparent;
    border: none;
    border-radius: 18px;
    cursor: pointer;
    transition:
      color var(--cv-duration-fast) var(--cv-easing-standard),
      transform var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .group-row::before,
  .group-row::after {
    content: '';
    position: absolute;
    pointer-events: none;
    transition:
      opacity var(--cv-duration-fast) var(--cv-easing-standard),
      transform var(--cv-duration-fast) var(--cv-easing-standard),
      border-color var(--cv-duration-fast) var(--cv-easing-standard),
      box-shadow var(--cv-duration-fast) var(--cv-easing-standard),
      background-color var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .group-row::before {
    inset: 0;
    z-index: -2;
    border-radius: 18px;
    border: 1px solid transparent;
    box-shadow: inset 0 -1px 0 var(--cv-color-border-soft);
  }

  .group-row::after {
    inset-inline-start: 0;
    inset-block: 12px;
    inline-size: 3px;
    z-index: -1;
    border-radius: 999px;
    opacity: 0;
    transform: scaleY(0.45);
  }

  .group-row:hover {
    transform: translateX(2px);
  }

  .group-row:hover::before {
    background: var(--cv-color-primary-surface);
    border-color: var(--cv-color-primary-border);
    box-shadow: none;
  }

  .group-row.active,
  .group-row:focus-visible {
    z-index: 1;
    color: var(--cv-color-text-strong);
    outline: var(
      --pm-active-outline,
      2px solid var(--cv-color-primary-ring)
    );
    outline-offset: var(--pm-active-outline-offset, -2px);
  }


  .group-row.active::after,
  .group-row:focus-visible::after {
    opacity: 1;
    transform: scaleY(1);
  }

  .group-row.active::before,
  .group-row:focus-visible::before {
    background: var(--cv-color-primary-surface);
    border-color: var(--cv-color-primary-border-strong);
    box-shadow: none;
  }

  .group-row.drop-target {
    transform: translateX(8px);
    outline: var(
      --pm-active-outline,
      2px solid var(--cv-color-primary-ring)
    );
    outline-offset: var(--pm-active-outline-offset, -2px);
  }

  .group-row.drop-target::before {
    border-color: var(--cv-color-primary-border-strong);
    background: var(--cv-gradient-surface-primary);
    box-shadow: none;
  }

  .group-row.drop-target::after {
    opacity: 1;
    transform: scaleY(1);
  }

  @container (width < 560px) {
    .wrapper {
      --pm-desktop-list-inline-padding: var(--app-surface-gutter-compact);
      --pm-desktop-list-row-padding-start: var(--app-surface-gutter-compact);
      --pm-desktop-list-row-padding-end: var(--app-surface-gutter-compact);
      --pm-desktop-content-shell-padding-block: 0px;
      --pm-desktop-content-shell-padding-inline: 0px;
      padding: 0;
      gap: 14px;
    }

    .content-shell {
      border-radius: 22px;
    }

    .group-virtual-list {
      border-radius: 20px;
      padding: var(--app-surface-gutter-compact);
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

    .group-row:hover {
      transform: none;
    }
  }
`

export class PMGroup extends PMGroupBase {
  static define() {
    CvEmptyState.define()
    if (!customElements.get('pm-group')) {
      customElements.define('pm-group', this)
    }
    PMWorkspaceHeader.define()
    PMSummaryRail.define()
  }

  static styles = [
    ...pmSharedStyles,
    hostContainStyles,
    motionPrimitiveStyles,
    pmEntryCardStyles,
    listItemsCSS,
    listGroupStyles,
    folderItemCSS,
    metadataSectionCSS,
    pmGroupCommonStyles,
    pmGroupDesktopStyles,
  ]
}
