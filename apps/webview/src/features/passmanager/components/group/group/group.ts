import {hostContainStyles} from 'root/shared/ui/shared-styles'
import {CvEmptyState} from 'root/shared/ui/empty-state'
import {css, nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'
import {CVToolbar} from '@chromvoid/uikit/components/cv-toolbar'
import {CVToolbarItem} from '@chromvoid/uikit/components/cv-toolbar-item'
import type {Group, ManagerRoot} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'

import '@lit-labs/virtualizer'

import {folderItemCSS, listItemsCSS, metadataSectionCSS, pmSharedStyles} from '../../../styles/shared'
import {listGroupStyles} from '../../list/list-item-styles'
import {pmEntryCardStyles} from '../../card/entry-create/styles'
import {PMWorkspaceHeader} from '../../card/pm-workspace-header'
import {PMGroupBase} from './group-base'
import type {PMGroupPresentation, PMGroupRow} from './group.model'
import {pmGroupCommonStyles} from './styles'

export const pmGroupDesktopStyles = css`
  :host {
    container-type: inline-size;
  }

  .wrapper {
    display: grid;
    gap: var(--cv-space-2);
    grid-template-rows: min-content minmax(0, 1fr);
    block-size: 100%;
    min-height: 0;
    padding: 0;
  }

  pm-workspace-header {
    margin-inline: var(--pm-desktop-page-content-inset-start) var(--pm-desktop-page-content-inset-end);
  }

  pm-workspace-header {
    --pm-workspace-header-padding-inline: 0px;
  }

  .group-virtual-list {
    --pm-entry-row-radius: 18px;
    --pm-entry-row-padding: 0 var(--pm-desktop-list-row-padding-end) 0
      var(--pm-desktop-list-row-padding-start);
    block-size: 100%;
    padding: var(--app-surface-gutter-desktop) var(--pm-desktop-list-inline-padding);
    border-radius: 20px;
  }

  .pm-group-scroll-edge {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-block-size: 0;
  }

  .workbench-list-header {
    display: grid;
    grid-template-columns:
      minmax(240px, 1fr)
      minmax(150px, 240px)
      minmax(132px, 168px)
      minmax(72px, 92px);
    gap: 16px;
    align-items: center;
    margin-inline: var(--pm-desktop-list-inline-padding);
    padding-inline: var(--pm-desktop-list-row-padding-start) var(--pm-desktop-list-row-padding-end);
    padding-block: 0 6px;
    color: var(--cv-color-text-subtle);
    font-family: var(--cv-font-family-code);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .workbench-list-header__status,
  .workbench-list-header__modified,
  .workbench-list-header__actions {
    justify-self: start;
  }

  .workspace-summary-value {
    font-family: var(--cv-font-family-code);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--cv-color-text-secondary);
  }

  cv-toolbar {
    margin: 0;
    padding: 0;
    --cv-toolbar-gap: 8px;
    justify-content: flex-end;
  }

  .group-action-item {
    --cv-toolbar-item-min-height: 34px;
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
    min-inline-size: 34px;
  }

  .group-action-item.icon-only .group-action-item-content {
    justify-content: center;
  }

  .content-shell {
    flex: 1;
    display: flex;
    min-height: 0;
    min-block-size: 0;
    overflow: hidden;
    padding: 0 0;
  }

  [id='passwords.empty-state'] {
    display: grid;
    flex: 1 1 auto;
    inline-size: 100%;
    min-inline-size: 0;
    min-block-size: 0;
  }

  cv-empty-state {
    align-self: stretch;
    align-content: start;
    block-size: 100%;
    padding-block-start: clamp(var(--cv-space-6), 8vb, 72px);
    --cv-empty-state-border: 1px solid transparent;
    --cv-empty-state-background: transparent;
    --cv-empty-state-dropzone-border: transparent;
    --cv-empty-state-dropzone-background: transparent;
    --cv-empty-state-min-block-size: auto;
  }

  cv-empty-state::part(base) {
    inline-size: min(520px, calc(100% - var(--app-surface-gutter-desktop) * 2));
    justify-self: center;
  }

  cv-empty-state.drop-active {
    --cv-empty-state-drop-active-border: var(--cv-color-primary-border-strong);
    --cv-empty-state-drop-active-background: var(--cv-color-primary-surface);
  }

  .entry-row,
  .group-row-wrap {
    user-select: none;
    min-block-size: var(--pm-desktop-list-row-block-size);
  }

  .group-row-wrap {
    padding: 0;
    block-size: var(--pm-desktop-list-row-block-size);
  }

  .group-row * {
    -webkit-user-drag: none;
  }

  .entry-row {
    display: block;
    position: relative;
    block-size: var(--pm-desktop-list-row-block-size);
    --pm-desktop-entry-row-inner-block-size: calc(var(--pm-desktop-list-row-block-size) - 4px);
  }

  .group-row {
    display: grid;
    grid-template-columns:
      minmax(240px, 1fr)
      minmax(150px, 240px)
      minmax(132px, 168px)
      minmax(72px, 92px);
    align-items: center;
    gap: 16px;
    position: relative;
    isolation: isolate;
    padding-block: 0;
    padding-inline: var(--pm-desktop-list-row-padding-start) var(--pm-desktop-list-row-padding-end);
    block-size: calc(var(--pm-desktop-list-row-block-size) - 4px);
    background: transparent;
    border: none;
    border-radius: 18px;
    cursor: pointer;
    transition:
      color var(--cv-duration-fast) var(--cv-easing-standard),
      transform var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .group-main-cell {
    display: inline-grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--cv-space-3);
    min-inline-size: 0;
  }

  .group-trail {
    justify-content: flex-start;
  }

  .group-modified-cell {
    min-inline-size: 0;
    color: var(--cv-color-text-secondary);
    font-family: var(--cv-font-family-code);
    font-size: 12px;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .group-actions-cell {
    display: inline-flex;
    justify-content: flex-start;
    align-items: center;
    min-inline-size: 0;
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
    outline: var(--pm-active-outline, 2px solid var(--cv-color-primary-ring));
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
    outline: var(--pm-active-outline, 2px solid var(--cv-color-primary-ring));
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

  @container (width < 680px) {
    .wrapper {
      padding: 0;
      gap: 14px;
    }

    pm-workspace-header {
      margin-inline: calc(var(--app-surface-gutter-compact) + var(--app-surface-gutter-compact)) 14px;
    }

    .content-shell {
      border-radius: 22px;
    }

    .group-virtual-list {
      --pm-entry-row-padding: 0 var(--app-surface-gutter-compact);
      border-radius: 20px;
      padding: var(--app-surface-gutter-compact);
    }

    .workbench-list-header {
      margin-inline: var(--app-surface-gutter-compact);
      padding-inline: var(--app-surface-gutter-compact);
    }

    .workbench-list-header,
    .group-row {
      grid-template-columns: minmax(0, 1fr) minmax(92px, auto) auto;
    }

    .workbench-list-header__modified,
    .group-modified-cell {
      display: none;
    }
  }
`

export class PMGroup extends PMGroupBase {
  constructor() {
    super()
    this.showToolbarActions = true
  }

  static define() {
    CvEmptyState.define()
    if (!customElements.get('pm-group')) {
      customElements.define('pm-group', this)
    }
    CVToolbar.define()
    CVToolbarItem.define()
    PMWorkspaceHeader.define()
  }

  static styles = [
    ...pmSharedStyles,
    hostContainStyles,
    pmEntryCardStyles,
    listItemsCSS,
    listGroupStyles,
    folderItemCSS,
    metadataSectionCSS,
    pmGroupCommonStyles,
    pmGroupDesktopStyles,
  ]

  protected override getWorkspaceHeaderDensity() {
    return 'workbench' as const
  }

  protected override getWorkspaceHeaderTitle(group: Group, isRoot: boolean, isEditing: boolean) {
    if (isRoot) return i18n('root:title-short')
    return super.getWorkspaceHeaderTitle(group, isRoot, isEditing)
  }

  protected override getWorkspaceHeaderSupportText(
    group: Group,
    _summary: PMGroupPresentation,
    isRoot: boolean,
    isEditing: boolean,
  ) {
    if (isRoot || isEditing) return ''
    return group.description?.trim() ?? ''
  }

  protected override getWorkspaceHeaderContextLabel(summary: PMGroupPresentation, isRoot: boolean) {
    return isRoot ? '' : super.getWorkspaceHeaderContextLabel(summary, isRoot)
  }

  protected override getWorkspaceHeaderContextItems(group: Group, isRoot: boolean) {
    return isRoot ? [] : super.getWorkspaceHeaderContextItems(group, isRoot)
  }

  protected override getWorkspaceHeaderUpdatedFormatted() {
    return ''
  }

  protected override getWorkspaceHeaderCreatedFormatted() {
    return ''
  }

  protected override renderWorkspaceHeaderContextEnd() {
    return nothing
  }

  protected override getEmptyStatePresentation() {
    if (this.model.getEmptyStateKind() !== 'filtered') {
      return super.getEmptyStatePresentation()
    }

    const headline = i18n('credentials:empty_filtered:title' as never)
    return {
      kind: 'filtered' as const,
      icon: 'search',
      headline,
      description: i18n('credentials:empty_filtered:description' as never),
      ariaLabel: headline,
    }
  }

  protected override getEntryListItemViewMode() {
    return 'workbench' as const
  }

  protected override renderListHeader(_group: Group | ManagerRoot, _items: PMGroupRow[]) {
    return html`
      <div class="workbench-list-header" role="presentation">
        <span class="workbench-list-header__name">${i18n('credentials:list:column:name' as never)}</span>
        <span class="workbench-list-header__status">${i18n('credentials:list:column:status' as never)}</span>
        <span class="workbench-list-header__modified"
          >${i18n('credentials:list:column:modified' as never)}</span
        >
        <span class="workbench-list-header__actions"
          >${i18n('credentials:list:column:actions' as never)}</span
        >
      </div>
    `
  }

  protected override renderGroupContent(group: Group, isRoot: boolean) {
    const items = this.model.getUniqueRows(this.model.getVisibleRows(group))
    const summary = this.model.getGroupPresentation(group, items, isRoot)

    return html`
      <div class="wrapper">
        ${this.renderHeader(group, summary, isRoot)}
        <section class="content-shell">${this.renderGroupsList(group, items)}</section>
      </div>
    `
  }
}
