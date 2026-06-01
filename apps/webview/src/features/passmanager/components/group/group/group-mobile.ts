import {nothing, css} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {Entry, Group, type ManagerRoot} from '@project/passmanager/core'
import {emptyStateCSS, folderItemCSS, listItemsCSS, pmSharedStyles} from '../../../styles/shared'
import {hostContainStyles, motionPrimitiveStyles} from 'root/shared/ui/shared-styles'
import {listGroupStyles} from '../../list/list-item-styles'
import {PMWorkspaceHeader} from '../../card/pm-workspace-header'
import {PMSummaryRail} from '../../summary-rail'
import {PMSearchMobile} from '../../list/search-mobile'
import {getPassmanagerRoot} from '../../../models/pm-root.adapter'
import {pmMobileDebug} from '../../../models/pm-mobile-debug'
import {passwordManagerMobileLayoutModel} from '../../password-manager-layout/password-manager-mobile-layout.model'
import {PMGroupBase} from './group-base'
import {PMGroupListItemMobile} from './group-list-item-mobile'
import type {PMGroupRow} from './group.model'
import {pmGroupCommonStyles} from './styles'

export const pmGroupMobileStyles = css`
  .wrapper {
    gap: 1px;
    position: relative;
    min-block-size: 0;
    --pm-scrollbar-safe-area-start: 6px;
    --pm-scrollbar-safe-area-end: 6px;
    display: grid;
    grid-template-rows: min-content auto min-content;
  }

  .group-virtual-list {
    padding-top: 0;
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
  .entry-row,
  .group-row-wrap {
    padding: 2px 0;
  }

  .mobile-search {
    inline-size: 100%;
    box-sizing: border-box;
    padding-inline: 0;
  }

  .group-metrics-strip {
    flex: 0 0 auto;
    inline-size: 100%;
    max-inline-size: none;
    box-sizing: border-box;
    background: var(--cv-color-bg);
    --pm-summary-rail-inline-size: 100%;
  }

  .mobile-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px;
  }

`


export class PMGroupMobile extends PMGroupBase {
  private groupTapToken: number | null = null
  private groupTapTokenId: string | null = null

  static define() {
    if (!customElements.get('pm-group-mobile')) {
      customElements.define('pm-group-mobile', this)
    }
    PMWorkspaceHeader.define()
    PMSummaryRail.define()
    PMGroupListItemMobile.define()
    PMSearchMobile.define()
  }

  static styles = [
    ...pmSharedStyles,
    hostContainStyles,
    motionPrimitiveStyles,
    listItemsCSS,
    listGroupStyles,
    folderItemCSS,
    emptyStateCSS,
    pmGroupCommonStyles,
    pmGroupMobileStyles,
  ]

  override disconnectedCallback(): void {
    passwordManagerMobileLayoutModel.cancelLongPress()
    this.clearGroupTapToken()
    super.disconnectedCallback()
  }

  protected override getVirtualListRenderKey(
    group: Group | ManagerRoot,
    items: PMGroupRow[],
  ): string {
    const snapshot = passwordManagerMobileLayoutModel.getSelectionSnapshot()
    const selectionKey = snapshot.active
      ? `sel:${snapshot.selectedEntryIds.join(',')}|${snapshot.selectedGroupIds.join(',')}`
      : 'sel:off'

    return `${super.getVirtualListRenderKey(group, items)}:${selectionKey}`
  }

  protected override renderEntryItem(item: Entry, active: boolean, deleteExiting = false) {
    const selectionState = passwordManagerMobileLayoutModel.getRowSelectionState('entry', item.id)

    return html`
      <div
        class="entry-row"
        data-row-id=${item.id}
        ?data-delete-exiting=${deleteExiting}
        aria-hidden=${deleteExiting ? 'true' : nothing}
        @click=${() => this.setActiveItemById(item.id)}
        @animationend=${deleteExiting
          ? (event: AnimationEvent) => this.onDeleteExitAnimationEnd(event, item.id)
          : undefined}
      >
        <pm-entry-list-item-mobile
          .entry=${item}
          .activeRow=${active}
          .rowTabIndex=${active ? 0 : -1}
          .manageActiveRowState=${true}
          .selectionStateManaged=${true}
          .selectionActive=${selectionState.selectionActive}
          .selectedInSelectionMode=${selectionState.selected}
          @pm-entry-row-focus=${() => this.setActiveItemById(item.id)}
          @entry-delete=${this.handleEntryDelete}
          group
        ></pm-entry-list-item-mobile>
      </div>
    `
  }

  private handleGroupRowClick(item: Group) {
    this.setActiveItemById(item.id)

    const token = this.groupTapTokenId === item.id ? this.groupTapToken : null
    const decision = passwordManagerMobileLayoutModel.handleGroupTap(item.id, token)
    pmMobileDebug('groupRow', 'click', {
      groupId: item.id,
      token,
      decision,
      selectionActive: passwordManagerMobileLayoutModel.selection.active(),
    })
    this.clearGroupTapToken()

    if (decision === 'noop') {
      return
    }

    if (decision === 'toggle') {
      return
    }

    this.model.selectByID(item.id)
  }

  private handleGroupTouchStart(event: TouchEvent, item: Group) {
    if (passwordManagerMobileLayoutModel.selection.active()) {
      pmMobileDebug('groupRow', 'touchStart.skip.selectionActive', {groupId: item.id})
      return
    }

    const touch = event.touches[0]
    if (!touch) return

    this.groupTapTokenId = item.id
    this.groupTapToken = passwordManagerMobileLayoutModel.beginGroupLongPress(item.id, {
      x: touch.clientX,
      y: touch.clientY,
    }, () => {
      try {
        event.preventDefault?.()
        event.stopPropagation?.()
      } catch {}
      this.setActiveItemById(item.id)
    })
    pmMobileDebug('groupRow', 'touchStart.arm', {groupId: item.id, token: this.groupTapToken})
  }

  private handleGroupTouchMove(event: TouchEvent) {
    const touch = event.touches[0]
    if (!touch) return

    passwordManagerMobileLayoutModel.moveLongPress({
      x: touch.clientX,
      y: touch.clientY,
    })
  }

  private handleGroupTouchEnd() {
    const token = passwordManagerMobileLayoutModel.endLongPress()
    pmMobileDebug('groupRow', 'touchEnd', {
      token,
      selectionActive: passwordManagerMobileLayoutModel.selection.active(),
    })
  }

  private handleGroupPointerDown(event: PointerEvent, item: Group) {
    if (event.pointerType !== 'touch') return

    if (passwordManagerMobileLayoutModel.selection.active()) {
      pmMobileDebug('groupRow', 'pointerDown.skip.selectionActive', {groupId: item.id})
      return
    }

    this.groupTapTokenId = item.id
    this.groupTapToken = passwordManagerMobileLayoutModel.beginGroupLongPress(item.id, {
      x: event.clientX,
      y: event.clientY,
    }, () => {
      this.setActiveItemById(item.id)
    })
    pmMobileDebug('groupRow', 'pointerDown.arm', {groupId: item.id, token: this.groupTapToken})
  }

  private handleGroupPointerMove(event: PointerEvent) {
    if (event.pointerType !== 'touch') return

    passwordManagerMobileLayoutModel.moveLongPress({
      x: event.clientX,
      y: event.clientY,
    })
  }

  private handleGroupPointerEnd(event: PointerEvent) {
    if (event.pointerType !== 'touch') return

    const token = passwordManagerMobileLayoutModel.endLongPress()
    pmMobileDebug('groupRow', 'pointerEnd', {
      token,
      selectionActive: passwordManagerMobileLayoutModel.selection.active(),
    })
  }

  private handleGroupContextMenu(event: Event, item: Group) {
    event.preventDefault()
    event.stopPropagation()

    if (passwordManagerMobileLayoutModel.selection.active()) return

    this.clearGroupTapToken()
    this.setActiveItemById(item.id)
    this.groupTapTokenId = item.id
    this.groupTapToken = passwordManagerMobileLayoutModel.triggerGroupContextSelection(item.id)
    pmMobileDebug('groupRow', 'contextSelection', {groupId: item.id, token: this.groupTapToken})
  }

  private clearGroupTapToken() {
    this.groupTapToken = null
    this.groupTapTokenId = null
  }

  protected override renderFolderItem(item: Group, active: boolean, deleteExiting = false) {
    const selectionState = passwordManagerMobileLayoutModel.getRowSelectionState('group', item.id)

    return html`
      <div
        class="group-row-wrap"
        data-row-id=${item.id}
        ?data-delete-exiting=${deleteExiting}
        aria-hidden=${deleteExiting ? 'true' : nothing}
        @animationend=${deleteExiting
          ? (event: AnimationEvent) => this.onDeleteExitAnimationEnd(event, item.id)
          : undefined}
      >
        <pm-group-list-item-mobile
          .group=${item}
          .presentation=${this.model.getGroupRowPresentation(item)}
          .activeRow=${active}
          .rowTabIndex=${active ? 0 : -1}
          .selectionActive=${selectionState.selectionActive}
          .selectedInSelectionMode=${selectionState.selected}
          @pm-group-row-focus=${() => this.setActiveItemById(item.id)}
          @click=${() => this.handleGroupRowClick(item)}
          @touchstart=${(event: TouchEvent) => this.handleGroupTouchStart(event, item)}
          @touchmove=${(event: TouchEvent) => this.handleGroupTouchMove(event)}
          @touchend=${() => this.handleGroupTouchEnd()}
          @touchcancel=${() => this.handleGroupTouchEnd()}
          @pointerdown=${(event: PointerEvent) => this.handleGroupPointerDown(event, item)}
          @pointermove=${(event: PointerEvent) => this.handleGroupPointerMove(event)}
          @pointerup=${(event: PointerEvent) => this.handleGroupPointerEnd(event)}
          @pointercancel=${(event: PointerEvent) => this.handleGroupPointerEnd(event)}
          @contextmenu=${(event: Event) => this.handleGroupContextMenu(event, item)}
        ></pm-group-list-item-mobile>
      </div>
    `
  }

  private renderMobileSearch() {
    return html`<pm-search-mobile class="mobile-search"></pm-search-mobile>`
  }

  protected override usesBlockStartScrollEdge(): boolean {
    return true
  }

  protected override render() {
    if (!getPassmanagerRoot()) return nothing

    const group = this.getCurrentGroup()
    if (!group) return nothing

    const isRoot = this.isManagerRoot(group)
    const items = this.model.getUniqueRows(this.model.getVisibleRows(group))
    const summary = this.model.getGroupPresentation(group as unknown as Group, items, isRoot)
    const header =
      this.model.isEditMode() && !isRoot
        ? this.renderHeader(group as Group, summary, false)
        : nothing
    const search = this.model.isEditMode() && !isRoot ? nothing : this.renderMobileSearch()

    return html`
      <div class="wrapper">
        ${header} ${search} ${this.renderGroupsList(group, items)} ${this.renderGroupMetrics(summary)}
      </div>
    `
  }
}
