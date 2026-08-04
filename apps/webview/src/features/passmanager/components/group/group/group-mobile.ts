import {nothing, css} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {Group, type Entry, type ManagerRoot} from '@project/passmanager/core'
import {hostContainStyles, motionPrimitiveStyles} from 'root/shared/ui/shared-styles'
import {CvEmptyState} from 'root/shared/ui/empty-state'
import {WorkspaceDashboardHeader} from 'root/features/file-manager/components/workspace-dashboard-header'
import {folderItemCSS, listItemsCSS, pmSharedStyles} from '../../../styles/shared'
import {listGroupStyles} from '../../list/list-item-styles'
import {PMWorkspaceHeader} from '../../card/pm-workspace-header'
import {PMSummaryRail} from '../../summary-rail'
import {createCredentialsHeaderControlsModel} from '../../list/credentials-header-controls'
import {getPassmanagerRoot} from '../../../models/pm-root.adapter'
import {pmMobileDebug} from '../../../models/pm-mobile-debug'
import type {PMListMutationPhase} from '../../../models/pm-list-mutation-motion.model'
import {passwordManagerMobileLayoutModel} from '../../password-manager-layout/password-manager-mobile-layout.model'
import {PMGroupBase} from './group-base'
import {PMGroupListItemMobile} from './group-list-item-mobile'
import {PMGroupEditMobile} from './group-edit-mobile'
import {pmGroupEditModel} from './group-edit.model'
import type {PMGroupPresentation, PMGroupRow} from './group.model'
import {pmGroupCommonStyles} from './styles'

export const pmGroupMobileStyles = css`
  .wrapper {
    gap: var(--app-mobile-surface-gap);
    position: relative;
    min-block-size: 0;
    display: grid;
    grid-template-rows: min-content minmax(0, 1fr) min-content;
  }

  .group-virtual-list {
    padding-inline: var(--pm-mobile-group-inline-gutter);
    padding-top: 0;
    scrollbar-gutter: auto;
  }

  .group-virtual-list > * {
    width: calc(
      100% - var(--pm-mobile-group-inline-gutter) - var(--pm-mobile-group-inline-gutter)
    );
  }

  .pm-group-scroll-edge {
    --app-scroll-edge-block-size: var(--app-scroll-edge-mobile-block-size);
    --app-scroll-edge-inline-start: 0px;
    --app-scroll-edge-inline-end: 0px;
    --app-scroll-edge-surface: var(--cv-color-bg);
    --app-scroll-edge-surface-fade: var(--cv-color-surface-glass-subtle);
    inline-size: 100%;
  }

  pm-card-header,
  pm-card-header-mobile {
    inline-size: 100%;
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

  .mobile-credentials-header {
    inline-size: 100%;
    box-sizing: border-box;
    padding-inline: var(--pm-mobile-group-inline-gutter);
  }

  .mobile-credentials-header {
    --app-dashboard-header-control-block-size: 40px;
  }

  .mobile-credentials-shell {
    display: grid;
    min-inline-size: 0;
  }

  .group-metrics-strip {
    flex: 0 0 auto;
    inline-size: 100%;
    max-inline-size: none;
    box-sizing: border-box;
    padding: var(--cv-space-2) calc(var(--pm-mobile-group-inline-gutter) + var(--cv-space-4))
      max(var(--cv-space-2), env(safe-area-inset-bottom, 0px));
    background: var(--cv-color-bg);
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
    CvEmptyState.define()
    if (!customElements.get('pm-group-mobile')) {
      customElements.define('pm-group-mobile', this)
    }
    PMWorkspaceHeader.define()
    WorkspaceDashboardHeader.define()
    PMSummaryRail.define()
    PMGroupListItemMobile.define()
    PMGroupEditMobile.define()
  }

  static styles = [
    ...pmSharedStyles,
    hostContainStyles,
    motionPrimitiveStyles,
    listItemsCSS,
    listGroupStyles,
    folderItemCSS,
    pmGroupCommonStyles,
    pmGroupMobileStyles,
  ]

  protected override renderGroupsList(group: Group | ManagerRoot, items: PMGroupRow[]) {
    // renderItem executes inside the child virtualizer, so read selection here to keep this host reactive.
    passwordManagerMobileLayoutModel.getSelectionSnapshot()
    return super.renderGroupsList(group, items)
  }

  override disconnectedCallback(): void {
    passwordManagerMobileLayoutModel.cancelLongPress()
    this.clearGroupTapToken()
    super.disconnectedCallback()
  }

  protected override renderEntryItem(
    item: Entry,
    active: boolean,
    deleteExiting = false,
    entering?: PMListMutationPhase,
  ) {
    const selectionState = passwordManagerMobileLayoutModel.getRowSelectionState('entry', item.id)

    return html`
      <div
        class="entry-row"
        data-row-id=${item.id}
        ?data-delete-exiting=${deleteExiting}
        data-entering=${entering ?? nothing}
        aria-hidden=${deleteExiting ? 'true' : nothing}
        @click=${() => this.setActiveItemById(item.id)}
      >
        <div
          class="pm-row-motion-surface"
          @animationend=${
            deleteExiting
              ? (event: AnimationEvent) => this.onDeleteExitAnimationEnd(event, item.id)
              : entering
                ? (event: AnimationEvent) => this.onEnterAnimationEnd(event, item.id)
                : undefined
          }
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
            @entry-delete=${(event: Event) => this.handleEntryDelete(event)}
            group
          ></pm-entry-list-item-mobile>
        </div>
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

  protected override renderFolderItem(
    item: Group,
    active: boolean,
    deleteExiting = false,
    entering?: PMListMutationPhase,
  ) {
    const selectionState = passwordManagerMobileLayoutModel.getRowSelectionState('group', item.id)

    return html`
      <div
        class="group-row-wrap"
        data-row-id=${item.id}
        ?data-delete-exiting=${deleteExiting}
        data-entering=${entering ?? nothing}
        aria-hidden=${deleteExiting ? 'true' : nothing}
      >
        <div
          class="pm-row-motion-surface"
          @animationend=${
            deleteExiting
              ? (event: AnimationEvent) => this.onDeleteExitAnimationEnd(event, item.id)
              : entering
                ? (event: AnimationEvent) => this.onEnterAnimationEnd(event, item.id)
                : undefined
          }
        >
          <pm-group-list-item-mobile
            .group=${item}
            .presentation=${this.model.getGroupRowPresentation(item)}
            .activeRow=${active}
            .rowTabIndex=${active ? 0 : -1}
            .readOnly=${this.model.isReadOnly()}
            .selectionActive=${selectionState.selectionActive}
            .selectedInSelectionMode=${selectionState.selected}
            @pm-group-row-focus=${() => this.setActiveItemById(item.id)}
            @group-delete=${(event: Event) => this.handleGroupDelete(event)}
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
      </div>
    `
  }

  private renderMobileWorkspaceHeader(summary: PMGroupPresentation) {
    const controlsModel = createCredentialsHeaderControlsModel(() => summary)

    return html`
      <div class="mobile-credentials-shell">
        <workspace-dashboard-header
          class="mobile-credentials-header"
          surface="passwords"
          embedded
          .controlsModel=${controlsModel}
        ></workspace-dashboard-header>
      </div>
    `
  }

  protected override usesBlockStartScrollEdge(): boolean {
    return true
  }

  protected override getScrollEdgeTreatment(): 'shadow' {
    return 'shadow'
  }

  protected override render() {
    if (!getPassmanagerRoot()) return nothing

    const group = this.getCurrentGroup()
    if (!group) return nothing

    if (group instanceof Group && pmGroupEditModel.active()) {
      return html`<pm-group-edit-mobile></pm-group-edit-mobile>`
    }

    const isRoot = this.isManagerRoot(group)
    const items = this.model.getUniqueRows(this.model.getVisibleRows(group))
    const summary = this.model.getGroupPresentation(group as unknown as Group, items, isRoot)
    const search = this.renderMobileWorkspaceHeader(summary)

    return html`
      <div class="wrapper">
        ${search} ${this.renderGroupsList(group, items)} ${this.renderGroupMetrics(summary)}
      </div>
    `
  }
}
