import type {CVTextareaInputEvent} from '@chromvoid/uikit/components/cv-textarea'
import {createAfterRenderScheduler, html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {nothing, type PropertyValues} from 'lit'

import {Entry, Group, type ManagerRoot} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {getPMDesktopToolbarKey, renderPMDesktopToolbarItems} from '../../desktop-toolbar'
import {renderGuidanceInline} from 'root/features/guidance/render-guidance-inline'
import {ScrollEdgeAffordanceModel} from 'root/shared/ui/scroll-edge-affordance.model'
import type {PMWorkspaceContextItem, PMWorkspaceHeaderDensity} from '../../card/pm-workspace-header'
import type {PMSummaryRailItem, PMSummaryRailTone} from '../../summary-rail'
import type {PMEntryListItemViewMode} from '../../card/entry-list-item'
import {groupBy, type GroupBy} from '../../list/sort-controls'
import {pmEntryMoveModel, type PMDragPayload} from '../../../models/pm-entry-move-model'
import {pmListViewportModel} from '../../../models/pm-list-viewport.model'
import {
  pmListMutationMotionModel,
  type PMListMutationPhase,
  type PMListMutationRow,
  type PMListMutationVisibleRow,
} from '../../../models/pm-list-mutation-motion.model'
import {getPassmanagerRoot} from '../../../models/pm-root.adapter'
import {passmanagerNavigationController} from '../../../passmanager-navigation.controller'
import {
  elementScopedViewTransitionCoordinator,
  prefersReducedMotion,
} from 'root/utils/view-transitions'
import {
  PMGroupModel,
  type PMGroupMetric,
  type PMGroupPresentation,
  type PMGroupRiskIndicator,
  type PMGroupRow,
} from './group.model'
import {GROUP_DESCRIPTION_MAX_LENGTH} from '../group-form.constants'

type PMEntryFocusableItem = HTMLElement & {
  focusRow?: () => void
}

type PMGroupFocusableItem = HTMLElement & {
  focusRow?: () => void
}

type PMPointerDragState = {
  pointerId: number
  itemId: string
  kind: 'entry' | 'group'
  startX: number
  startY: number
  ghost: HTMLElement | null
  active: boolean
}

type PMGroupEmptyStatePresentation = {
  kind: 'empty' | 'filtered'
  icon: string
  headline: string
  description: string
  ariaLabel: string
}

type PMListRange = {first: number; last: number}

type PMListScrollerElement = HTMLElement & {
  element?: (index: number) => {scrollIntoView(options?: ScrollIntoViewOptions): void} | undefined
  updateComplete?: Promise<unknown>
  layoutComplete?: Promise<void>
}

type PMListScrollerRenderState = {
  rows: PMListMutationRow[]
  activeId: string | null
  dropTargetId: string | undefined
}

type PMPendingGroupingAnchor = {
  entryId: string | null
  contextKey: string
  shouldFocus: boolean
}

export abstract class PMGroupBase extends ReatomLitElement implements EventListenerObject {
  static properties = {
    showToolbarActions: {type: Boolean, attribute: 'show-toolbar-actions'},
  }

  declare showToolbarActions: boolean

  protected readonly model = new PMGroupModel()
  private readonly scrollEdge = new ScrollEdgeAffordanceModel()

  private readonly afterRenderScheduler = createAfterRenderScheduler(this)
  private dropTargetEl: HTMLElement | null = null
  private pointerDrag: PMPointerDragState | null = null
  private renderedEditMode = false
  private listScroller: PMListScrollerElement | null = null
  private listScrollerContextKey: string | null = null
  private renderedListContextKey: string | null = null
  private renderedGroupBy: GroupBy | null = null
  private scrollSaveFrame: number | null = null
  private pendingScrollSnapshot: {contextKey: string; scrollTop: number} | null = null
  private viewportRestoreGeneration = 0
  private restoringScrollContextKey: string | null = null
  private lastListRows: PMListMutationRow[] = []
  private lastRenderedRange: PMListRange | null = null
  private lastVisibleRange: PMListRange | null = null
  private pendingGroupingAnchor: PMPendingGroupingAnchor | null = null
  private currentMutationScopeId: string | null = null
  private readonly ownedMutationScopes = new Set<string>()
  private readonly pendingExitCompletionIds = new Set<string>()
  private exitCompletionFrame: number | null = null
  private enterRevealFrame: number | null = null

  constructor() {
    super()
    this.showToolbarActions = false
  }

  protected getCurrentGroup(): Group | ManagerRoot | null {
    return this.model.getCurrentGroup()
  }

  protected usesBlockStartScrollEdge(): boolean {
    return false
  }

  protected getScrollEdgeTreatment(): 'mask' | 'shadow' {
    return 'mask'
  }

  protected getWorkspaceHeaderDensity(): PMWorkspaceHeaderDensity {
    return 'regular'
  }

  protected renderHeaderMeta(_summary: PMGroupPresentation): unknown {
    return nothing
  }

  protected getWorkspaceHeaderTitle(group: Group, _isRoot: boolean, isEditing: boolean): string {
    return isEditing ? this.model.editedName() : this.getGroupMetadata(group).title
  }

  protected getWorkspaceHeaderSupportText(
    group: Group,
    summary: PMGroupPresentation,
    _isRoot: boolean,
    isEditing: boolean,
  ): string {
    return isEditing ? '' : group.description?.trim() || summary.supportText
  }

  protected getWorkspaceHeaderContextLabel(summary: PMGroupPresentation, _isRoot: boolean): string {
    return summary.scopeLabel
  }

  protected getWorkspaceHeaderContextItems(group: Group, isRoot: boolean): PMWorkspaceContextItem[] {
    return this.getHeaderContextItems(group, isRoot)
  }

  protected getWorkspaceHeaderUpdatedFormatted(group: Group, _isRoot: boolean): string {
    return group.updatedFormatted
  }

  protected getWorkspaceHeaderCreatedFormatted(group: Group, _isRoot: boolean): string {
    return group.createdFormatted
  }

  protected renderWorkspaceHeaderContextEnd(summary: PMGroupPresentation): unknown {
    return html`<span slot="context-end" class="workspace-summary-value">${summary.visibleLabel}</span>`
  }

  protected getEmptyStatePresentation(): PMGroupEmptyStatePresentation {
    const headline = i18n('group:no_entries')
    return {
      kind: 'empty',
      icon: 'folder',
      headline,
      description: '',
      ariaLabel: headline,
    }
  }

  protected getEntryListItemViewMode(): PMEntryListItemViewMode {
    return 'default'
  }

  protected renderListHeader(_group: Group | ManagerRoot, _items: PMGroupRow[]): unknown {
    return nothing
  }

  protected renderListScroller({rows, activeId, dropTargetId}: PMListScrollerRenderState): unknown {
    return html`
      <lit-virtualizer
        class="group-virtual-list scroll-edge-scroller"
        tabindex="-1"
        data-drop-target-id=${dropTargetId ?? nothing}
        data-mobile-dnd-target-id=${dropTargetId ?? nothing}
        scroller
        .items=${rows}
        .keyFunction=${(item: PMListMutationRow) => item.id}
        .renderItem=${(item: PMListMutationRow) =>
          this.renderRow(item, item.deleteExiting === true ? false : item.id === activeId)}
        @rangeChanged=${this.onVirtualRangeChanged}
        @visibilityChanged=${this.onVirtualVisibilityChanged}
        @dragover=${this.onDragOverContentArea}
        @dragenter=${this.onDragOverContentArea}
        @drop=${this.onDropContentArea}
        @dragleave=${this.onContentDragLeave}
      ></lit-virtualizer>
    `
  }

  protected syncListScrollPosition(
    _rows: readonly PMListMutationRow[],
    _scrollTop: number,
    _force: boolean,
  ): void {}

  protected getListScrollTopForIndex(
    _rows: readonly PMListMutationRow[],
    _index: number,
    _block: 'nearest' | 'center',
    _currentScrollTop: number,
  ): number | null {
    return null
  }

  protected publishListRanges(rendered: PMListRange | null, visible: PMListRange | null): void {
    this.lastRenderedRange = rendered
    this.lastVisibleRange = visible
  }

  protected isManagerRoot(item: unknown): item is ManagerRoot {
    return this.model.isManagerRoot(item)
  }

  protected isGroup(item: unknown): item is Group {
    return this.model.isGroup(item)
  }

  protected getGroupMetadata(group: Group) {
    return this.model.getGroupMetadata(group)
  }

  protected getGroupDisplayName(group: Group): string {
    return this.model.getGroupDisplayName(group)
  }

  protected setActiveItemById(id: string, shouldFocus = false): void {
    const index = this.model.setActiveItemById(id)
    if (shouldFocus && index !== null) {
      this.ensureActiveItemVisible(index, true)
    }
  }

  protected onEditClick(): void {
    this.model.enterEditMode()
  }

  protected onDeleteClick(group: Group): void {
    this.model.deleteGroup(group)
  }

  protected handleEntryDelete(event: Event): void {
    event.stopPropagation()

    const entry = event instanceof CustomEvent ? event.detail : null
    if (entry instanceof Entry) {
      this.model.deleteEntry(entry)
    }
  }

  protected handleGroupDelete(event: Event): void {
    event.stopPropagation()

    const group = event instanceof CustomEvent ? event.detail : null
    if (group instanceof Group) {
      this.model.deleteGroup(group)
    }
  }

  triggerEditAction(): void {
    this.model.enterEditMode()
  }

  triggerMoveAction(): void {
    const group = this.getCurrentGroup()
    if (group && !this.isManagerRoot(group)) {
      void this.model.moveGroup(group as Group)
    }
  }

  triggerDeleteAction(): void {
    const group = this.getCurrentGroup()
    if (group && !this.isManagerRoot(group)) {
      this.model.deleteGroup(group as Group)
    }
  }

  protected onHeaderToolbarClick(event: MouseEvent): void {
    const item = this.getHeaderToolbarActionTarget(event)
    if (!item || item.hasAttribute('disabled')) return

    const action = item.dataset['action']
    if (!this.model.isToolbarAction(action)) return

    this.model.executeToolbarAction(action)
  }

  protected onHeaderToolbarKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return

    const item = this.getHeaderToolbarActionTarget(event)
    if (!item || item.hasAttribute('disabled')) return

    const action = item.dataset['action']
    if (!this.model.isToolbarAction(action)) return

    if (event.key === ' ') {
      event.preventDefault()
    }

    this.model.executeToolbarAction(action)
  }

  private getHeaderToolbarActionTarget(event: Event): HTMLElement | null {
    for (const node of event.composedPath()) {
      if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'cv-toolbar-item') {
        return node
      }
    }

    return null
  }

  protected handleEditEnd(): void {
    this.model.exitEditMode()
  }

  protected override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    this.syncListViewport()
    this.scrollEdge.scheduleMeasure()
    this.finishReducedMotionRows()
    this.scheduleStagedEnterReveal()

    const isEditMode = this.model.isEditMode()
    if (isEditMode === this.renderedEditMode) {
      return
    }

    this.renderedEditMode = isEditMode
    if (!isEditMode) {
      return
    }

    this.afterRenderScheduler.schedule(() => {
      const workspaceHeader = this.renderRoot.querySelector<HTMLElement & {focusTitleInput?: () => void}>(
        'pm-workspace-header',
      )
      workspaceHeader?.focusTitleInput?.()
    })
  }

  moveKeyboardFocus(step: number): boolean {
    const next = this.model.moveKeyboardFocus(step)
    if (next === null) return false

    this.ensureActiveItemVisible(next, true)
    return true
  }

  openActiveItem(): boolean {
    return this.model.openActiveItem()
  }

  public override connectedCallback(): void {
    super.connectedCallback()
    pmEntryMoveModel.registerDropZone(this.renderRoot as ShadowRoot)
  }

  public override disconnectedCallback(): void {
    if (this.exitCompletionFrame !== null) cancelAnimationFrame(this.exitCompletionFrame)
    if (this.enterRevealFrame !== null) cancelAnimationFrame(this.enterRevealFrame)
    this.exitCompletionFrame = null
    this.enterRevealFrame = null
    for (const scopeId of this.ownedMutationScopes) {
      pmListMutationMotionModel.resetScope(scopeId)
    }
    this.ownedMutationScopes.clear()
    this.flushScheduledListScrollSave()
    this.cancelListViewportRestore()
    this.afterRenderScheduler.cancel()
    this.model.exitEditMode()
    super.disconnectedCallback()
    pmEntryMoveModel.unregisterDropZone(this.renderRoot as ShadowRoot)
    if (this.pointerDrag?.active) {
      this.endPointerDrag()
    }
    this.pointerDrag = null
    this.cleanupPointerListeners()
    if (this.listScroller) {
      this.listScroller.removeEventListener('scroll', this)
      this.listScroller = null
      this.listScrollerContextKey = null
    }
    this.scrollEdge.dispose()
  }

  handleEvent(event: Event): void {
    if (event.type === 'pointermove') {
      this.onDocPointerMove(event as PointerEvent)
      return
    }

    if (event.type === 'pointerup') {
      this.onDocPointerUp(event as PointerEvent)
      return
    }

    if (event.type === 'pointercancel') {
      this.onDocPointerCancel()
      return
    }

    if (event.type === 'scroll') {
      if (this.listScroller) {
        this.syncListScrollPosition(this.lastListRows, this.listScroller.scrollTop, false)
      }
      this.scheduleListScrollSave()
    }
  }

  private syncListViewport(): void {
    const next = this.renderRoot.querySelector('.group-virtual-list') as PMListScrollerElement | null
    const nextContextKey = this.renderedListContextKey
    const nodeChanged = next !== this.listScroller
    const contextChanged = nextContextKey !== this.listScrollerContextKey
    if (!nodeChanged && !contextChanged) return

    this.flushScheduledListScrollSave()
    this.cancelListViewportRestore()
    if (nodeChanged) {
      this.listScroller?.removeEventListener('scroll', this)
    }
    this.listScroller = next
    this.listScrollerContextKey = nextContextKey
    if (nodeChanged) {
      this.listScroller?.addEventListener('scroll', this, {passive: true})
      this.scrollEdge.bindScroller(this.listScroller)
    }

    if (next && nextContextKey) {
      this.restoreListViewport(next, nextContextKey)
    }
  }

  private saveListScroll(): void {
    if (!this.listScroller || !this.listScrollerContextKey) return
    if (this.listScrollerContextKey === this.restoringScrollContextKey) return

    pmListViewportModel.saveScrollTop(this.listScrollerContextKey, this.listScroller.scrollTop)
  }

  private scheduleListScrollSave(): void {
    if (!this.listScroller || !this.listScrollerContextKey) return
    if (this.listScrollerContextKey === this.restoringScrollContextKey) return

    this.pendingScrollSnapshot = {
      contextKey: this.listScrollerContextKey,
      scrollTop: this.listScroller.scrollTop,
    }
    if (this.scrollSaveFrame !== null) return

    this.scrollSaveFrame = requestAnimationFrame(() => {
      this.scrollSaveFrame = null
      const snapshot = this.pendingScrollSnapshot
      this.pendingScrollSnapshot = null
      if (snapshot) {
        pmListViewportModel.saveScrollTop(snapshot.contextKey, snapshot.scrollTop)
      }
    })
  }

  private flushScheduledListScrollSave(): void {
    if (this.scrollSaveFrame !== null) {
      cancelAnimationFrame(this.scrollSaveFrame)
      this.scrollSaveFrame = null
    }
    const snapshot = this.pendingScrollSnapshot
    this.pendingScrollSnapshot = null
    if (snapshot) {
      pmListViewportModel.saveScrollTop(snapshot.contextKey, snapshot.scrollTop)
    }
  }

  private restoreListViewport(scroller: PMListScrollerElement, contextKey: string): void {
    const generation = ++this.viewportRestoreGeneration
    this.restoringScrollContextKey = contextKey
    void this.applyListViewportRestore(scroller, contextKey, generation)
  }

  private cancelListViewportRestore(): void {
    this.viewportRestoreGeneration += 1
    this.restoringScrollContextKey = null
  }

  private async applyListViewportRestore(
    scroller: PMListScrollerElement,
    contextKey: string,
    generation: number,
  ): Promise<void> {
    await this.updateComplete
    await this.waitForListLayout(scroller)
    if (!this.isCurrentViewportRestore(scroller, contextKey, generation)) return

    const groupingAnchor =
      this.pendingGroupingAnchor?.contextKey === contextKey ? this.pendingGroupingAnchor : null
    if (groupingAnchor) {
      const rows = this.lastListRows
      const index = this.model.resolveGroupingAnchorIndex(rows, groupingAnchor.entryId)
      if (index !== null) {
        this.scrollListIndexIntoView(scroller, rows, index, 'center')
        await this.updateComplete
        await this.waitForListLayout(scroller)
        if (!this.isCurrentViewportRestore(scroller, contextKey, generation)) return

        if (groupingAnchor.shouldFocus) {
          const rowId = rows[index]?.id
          if (rowId) this.focusRowElement(this.getRenderedRowById(rowId))
        }
      }
      if (this.pendingGroupingAnchor?.contextKey === contextKey) {
        this.pendingGroupingAnchor = null
      }
    } else {
      const scrollTop = pmListViewportModel.getScrollTop(contextKey) ?? 0
      scroller.scrollTop = scrollTop
      this.syncListScrollPosition(this.lastListRows, scrollTop, true)
      await this.updateComplete
      await this.waitForListLayout(scroller)
    }

    if (!this.isCurrentViewportRestore(scroller, contextKey, generation)) return
    this.restoringScrollContextKey = null
    this.scrollEdge.scheduleMeasure()
    this.saveListScroll()
  }

  private isCurrentViewportRestore(
    scroller: PMListScrollerElement,
    contextKey: string,
    generation: number,
  ): boolean {
    return (
      generation === this.viewportRestoreGeneration &&
      scroller === this.listScroller &&
      contextKey === this.listScrollerContextKey &&
      scroller.isConnected
    )
  }

  private getRenderedRowById(itemId: string): HTMLElement | null {
    const rows = this.renderRoot.querySelectorAll<HTMLElement>(
      '.entry-row, .group-row-wrap, .group-header-row',
    )
    for (const row of rows) {
      if (row.dataset['rowId'] === itemId) {
        return row
      }
    }

    return null
  }

  private focusRowElement(row: HTMLElement | null | undefined): void {
    if (!(row instanceof HTMLElement)) return

    if (row.classList.contains('entry-row')) {
      const entryItem = row.querySelector(
        'pm-entry-list-item, pm-entry-list-item-mobile',
      ) as PMEntryFocusableItem | null
      if (entryItem?.focusRow) {
        entryItem.focusRow()
        return
      }
    }

    if (row.classList.contains('group-row-wrap')) {
      const groupItem = row.querySelector('pm-group-list-item-mobile') as PMGroupFocusableItem | null
      if (groupItem?.focusRow) {
        groupItem.focusRow()
        return
      }

      const inner = row.querySelector('.group-row') as HTMLElement | null
      inner?.focus()
      return
    }

    row.focus()
  }

  private shouldPreserveListFocus(): boolean {
    const active = this.renderRoot instanceof ShadowRoot ? this.renderRoot.activeElement : null
    if (!(active instanceof HTMLElement)) {
      return false
    }

    if (
      active.matches('.group-row, pm-entry-list-item, pm-entry-list-item-mobile, pm-group-list-item-mobile')
    ) {
      return true
    }

    return active.closest('.entry-row, .group-row-wrap, .group-row') != null
  }

  private getFocusedListRowId(): string | undefined {
    const active = this.renderRoot instanceof ShadowRoot ? this.renderRoot.activeElement : null
    if (!(active instanceof HTMLElement)) return undefined

    const row = active.closest<HTMLElement>('.entry-row, .group-row-wrap')
    return row?.dataset['rowId']
  }

  private ensureActiveItemVisible(index: number, shouldFocus = false): void {
    const contextKey = this.renderedListContextKey
    const itemId = this.model.getKeyboardItemIdByIndex(index)
    if (!contextKey || !itemId || this.pendingGroupingAnchor?.contextKey === contextKey) return

    void this.scrollListItemIntoView(index, itemId, contextKey, shouldFocus)
  }

  private async scrollListItemIntoView(
    index: number,
    itemId: string,
    contextKey: string,
    shouldFocus: boolean,
  ): Promise<void> {
    await this.updateComplete
    const scroller = this.listScroller
    if (!scroller || contextKey !== this.listScrollerContextKey) return

    await this.waitForListLayout(scroller)
    if (scroller !== this.listScroller || contextKey !== this.listScrollerContextKey) return

    this.scrollListIndexIntoView(scroller, this.lastListRows, index, 'nearest')
    if (!shouldFocus) return

    await this.updateComplete
    await this.waitForListLayout(scroller)
    if (scroller !== this.listScroller || contextKey !== this.listScrollerContextKey) return
    this.focusRowElement(this.getRenderedRowById(itemId))
  }

  private scrollListIndexIntoView(
    scroller: PMListScrollerElement,
    rows: readonly PMListMutationRow[],
    index: number,
    block: 'nearest' | 'center',
  ): void {
    const scrollTop = this.getListScrollTopForIndex(rows, index, block, scroller.scrollTop)
    if (scrollTop === null) {
      scroller.element?.(index)?.scrollIntoView({block})
      return
    }

    scroller.scrollTop = scrollTop
    this.syncListScrollPosition(rows, scrollTop, true)
  }

  private focusListContainer(): void {
    requestAnimationFrame(() => {
      this.renderRoot
        .querySelector<HTMLElement>('.group-virtual-list')
        ?.focus({preventScroll: true})
    })
  }

  private getDropTargetId(group: Group | ManagerRoot): string | undefined {
    return this.isManagerRoot(group) ? getPassmanagerRoot()?.id : group.id
  }

  private isItemDragEnabled(item: Entry | Group): boolean {
    const root = getPassmanagerRoot()
    if (!root || root.isReadOnly()) return false
    if (!pmEntryMoveModel.isDesktopDragEnabled()) return false
    return Boolean(item.id)
  }

  private clearDropHighlight(): void {
    this.dropTargetEl?.classList.remove('drop-target')
    this.dropTargetEl = null
  }

  private setDropHighlight(el: HTMLElement): void {
    if (this.dropTargetEl === el) return

    this.clearDropHighlight()
    el.classList.add('drop-target')
    this.dropTargetEl = el
  }

  private addPointerListeners(): void {
    document.addEventListener('pointermove', this)
    document.addEventListener('pointerup', this)
    document.addEventListener('pointercancel', this)
  }

  private cleanupPointerListeners(): void {
    document.removeEventListener('pointermove', this)
    document.removeEventListener('pointerup', this)
    document.removeEventListener('pointercancel', this)
  }

  private onItemPointerDown(event: PointerEvent, itemId: string, kind: 'entry' | 'group'): void {
    if (event.button !== 0 || this.pointerDrag) return

    const first = event.composedPath()[0]
    if (first instanceof HTMLElement) {
      const skip = first.closest(
        '.item-actions, .action-button, .primary-action, cv-button, cv-toolbar-item, cv-tooltip',
      )
      if (skip) return
    }

    this.pointerDrag = {
      pointerId: event.pointerId,
      itemId,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      ghost: null,
      active: false,
    }

    this.addPointerListeners()
  }

  private onDocPointerMove(event: PointerEvent): void {
    const drag = this.pointerDrag
    if (!drag) return

    if (!drag.active) {
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      if (dx * dx + dy * dy < 64) return

      drag.active = true
      this.beginPointerDrag(drag)
    }

    if (drag.ghost) {
      drag.ghost.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 14}px)`
    }

    this.pointerHitTest(event.clientX, event.clientY)
  }

  private onDocPointerUp(event: PointerEvent): void {
    const drag = this.pointerDrag
    if (!drag) {
      this.cleanupPointerListeners()
      return
    }

    if (drag.active) {
      this.performPointerDrop(event.clientX, event.clientY)
      this.endPointerDrag()
      this.eatNextClick()
    } else {
      this.cleanupPointerListeners()
    }

    this.pointerDrag = null
  }

  private onDocPointerCancel(): void {
    if (this.pointerDrag?.active) {
      this.endPointerDrag()
    }
    this.pointerDrag = null
    this.cleanupPointerListeners()
  }

  private preventNativeDrag(event: DragEvent): void {
    if (this.pointerDrag) {
      event.preventDefault()
    }
  }

  private beginPointerDrag(drag: PMPointerDragState): void {
    const label = this.model.startPointerDrag(drag.itemId, drag.kind)
    const ghost = document.createElement('div')
    ghost.style.cssText = [
      'position:fixed;left:0;top:0;pointer-events:none;z-index:99999',
      `transform:translate(${drag.startX + 14}px,${drag.startY + 14}px)`,
      'background:var(--cv-color-surface-2)',
      'border:1.5px solid var(--cv-color-primary)',
      'border-radius:8px;padding:5px 12px',
      'font-size:12px;font-weight:600',
      'color:var(--cv-color-text)',
      'box-shadow:0 6px 20px var(--cv-alpha-black-35)',
      'white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis',
    ].join(';')
    ghost.textContent = label
    document.body.appendChild(ghost)
    drag.ghost = ghost

    document.body.style.userSelect = 'none'
    ;(document.body.style as any).webkitUserSelect = 'none'
  }

  private pointerHitTest(x: number, y: number): void {
    const drag = this.pointerDrag
    if (!drag) return

    const payload: PMDragPayload = {domain: 'passmanager', kind: drag.kind, id: drag.itemId}
    const hit = this.model.findPointerDropTarget(x, y, payload)

    if (hit) {
      this.model.setPointerDropTarget(hit.id)
      if (this.renderRoot.contains(hit.el)) {
        this.setDropHighlight(hit.el)
      } else {
        this.clearDropHighlight()
      }
      return
    }

    this.clearDropHighlight()
    this.model.setPointerDropTarget(null)
  }

  private performPointerDrop(x: number, y: number): void {
    const drag = this.pointerDrag
    if (!drag) return

    const payload: PMDragPayload = {domain: 'passmanager', kind: drag.kind, id: drag.itemId}
    const hit = this.model.findPointerDropTarget(x, y, payload)

    if (hit) {
      void this.model.dropPointerPayload(hit.id, payload)
      return
    }

    this.model.clearPointerDragState()
  }

  private endPointerDrag(): void {
    if (this.pointerDrag?.ghost) {
      this.pointerDrag.ghost.remove()
    }

    this.clearDropHighlight()
    this.model.clearPointerDragState()
    document.body.style.userSelect = ''
    ;(document.body.style as any).webkitUserSelect = ''
    this.cleanupPointerListeners()
  }

  private eatNextClick(): void {
    const handler = (event: Event) => {
      event.stopPropagation()
      event.preventDefault()
      document.removeEventListener('click', handler, true)
    }

    document.addEventListener('click', handler, true)
    setTimeout(() => document.removeEventListener('click', handler, true), 400)
  }

  private onDragOverFolder(event: DragEvent, targetId: string): void {
    const dragPayload = pmEntryMoveModel.readDragPayload(event.dataTransfer)
    const canDrop = pmEntryMoveModel.canDropToTarget(targetId, dragPayload)
    if (!canDrop) {
      this.clearDropHighlight()
      pmEntryMoveModel.setDropTarget(null)
      return
    }

    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }

    pmEntryMoveModel.setDropTarget(targetId)
    this.setDropHighlight(event.currentTarget as HTMLElement)
  }

  private onDropFolder(event: DragEvent, targetId: string): void {
    event.preventDefault()
    event.stopPropagation()
    this.clearDropHighlight()
    const dragPayload = pmEntryMoveModel.readDragPayload(event.dataTransfer)
    void pmEntryMoveModel.dropToTarget(targetId, dragPayload)
  }

  protected onDragOverContentArea(event: DragEvent): void {
    this.clearDropHighlight()
    const group = this.getCurrentGroup()
    if (!group) return

    const targetId = this.getDropTargetId(group)
    if (!targetId) return

    const dragPayload = pmEntryMoveModel.readDragPayload(event.dataTransfer)
    const canDrop = pmEntryMoveModel.canDropToTarget(targetId, dragPayload)
    if (!canDrop) return

    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }

    pmEntryMoveModel.setDropTarget(targetId)
  }

  protected onDropContentArea(event: DragEvent): void {
    this.clearDropHighlight()
    const group = this.getCurrentGroup()
    if (!group) return

    const targetId = this.getDropTargetId(group)
    if (!targetId) return

    event.preventDefault()
    const dragPayload = pmEntryMoveModel.readDragPayload(event.dataTransfer)
    void pmEntryMoveModel.dropToTarget(targetId, dragPayload)
  }

  private onDragOverEmpty(event: DragEvent): void {
    const group = this.getCurrentGroup()
    if (!group) return

    const targetId = this.getDropTargetId(group)
    if (!targetId) return

    const dragPayload = pmEntryMoveModel.readDragPayload(event.dataTransfer)
    const canDrop = pmEntryMoveModel.canDropToTarget(targetId, dragPayload)
    if (!canDrop) return

    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }

    pmEntryMoveModel.setDropTarget(targetId)
    ;(event.currentTarget as HTMLElement).classList.add('drop-active')
  }

  private onDropEmpty(event: DragEvent): void {
    const group = this.getCurrentGroup()
    if (!group) return

    const targetId = this.getDropTargetId(group)
    if (!targetId) return

    event.preventDefault()
    ;(event.currentTarget as HTMLElement).classList.remove('drop-active')
    const dragPayload = pmEntryMoveModel.readDragPayload(event.dataTransfer)
    void pmEntryMoveModel.dropToTarget(targetId, dragPayload)
  }

  private onEmptyDragLeave(event: DragEvent): void {
    const related = event.relatedTarget
    if (
      related instanceof Node &&
      event.currentTarget instanceof HTMLElement &&
      event.currentTarget.contains(related)
    ) {
      return
    }

    ;(event.currentTarget as HTMLElement).classList.remove('drop-active')
    pmEntryMoveModel.setDropTarget(null)
  }

  protected onContentDragLeave(event: DragEvent): void {
    const related = event.relatedTarget
    if (
      related instanceof Node &&
      event.currentTarget instanceof HTMLElement &&
      event.currentTarget.contains(related)
    ) {
      return
    }

    this.clearDropHighlight()
    pmEntryMoveModel.setDropTarget(null)
  }

  protected getHeaderContextItems(group: Group, isRoot: boolean): PMWorkspaceContextItem[] {
    if (isRoot) {
      return [{label: i18n('root:title-short'), value: '', current: true}]
    }

    const groupSegments = group.name.split('/').filter(Boolean)

    return [
      {label: i18n('root:title-short'), value: ''},
      ...groupSegments.map((segment, index) => ({
        label: segment,
        value: groupSegments.slice(0, index + 1).join('/'),
        current: index === groupSegments.length - 1,
      })),
    ]
  }

  protected onWorkspaceHeaderNavigate(event: CustomEvent<{value: string}>) {
    const path = event.detail.value
    passmanagerNavigationController.applyRoute(path ? {kind: 'group', groupPath: path} : {kind: 'root'})
  }

  protected onWorkspaceHeaderTitleInput(event: CustomEvent<{value: string}>) {
    this.model.setEditedName(event.detail.value)
  }

  protected onGroupDescriptionInput(event: CVTextareaInputEvent) {
    this.model.setEditedDescription(event.detail.value)
  }

  protected onGroupIconChange(event: CustomEvent<{iconRef: string | undefined}>) {
    this.model.setEditedIconRef(event.detail.iconRef)
  }

  protected onEditCancel() {
    void this.model.requestEditClose()
  }

  protected async onEditSave() {
    if (await this.model.saveEdit()) return
    if (!this.model.editNameError()) return

    const workspaceHeader = this.renderRoot.querySelector<HTMLElement & {focusTitleInput?: () => void}>(
      'pm-workspace-header',
    )
    workspaceHeader?.focusTitleInput?.()
  }

  protected renderTitleEditAction(isEditing: boolean) {
    if (isEditing || this.showToolbarActions || this.model.isReadOnly()) {
      return nothing
    }

    return html`
      <cv-button
        unstyled
        slot="title-end"
        class="group-title-edit-action edit-icon-action"
        type="button"
        @click=${() => this.onEditClick()}
        aria-label=${i18n('button:edit')}
        title=${i18n('button:edit')}
      >
        <cv-icon name="pencil-square" aria-hidden="true"></cv-icon>
      </cv-button>
    `
  }

  protected renderHeaderActions(group: Group, isRoot: boolean, isEditing: boolean) {
    if (!this.showToolbarActions || isRoot || isEditing) {
      return nothing
    }

    const actions = this.model.getDesktopToolbarActions(group)
    if (!actions.length) return nothing

    return html`
      <cv-toolbar
        slot="actions"
        class="group-header-actions"
        data-toolbar-key=${getPMDesktopToolbarKey('group-header', actions)}
        @click=${this.onHeaderToolbarClick}
        @keydown=${this.onHeaderToolbarKeydown}
      >
        ${renderPMDesktopToolbarItems(actions, {
          itemClass: 'group-action-item',
          contentClass: 'group-action-item-content',
          iconClass: 'group-action-item-icon',
          dangerClass: 'danger',
          iconOnlyClass: 'icon-only',
        })}
      </cv-toolbar>
    `
  }

  protected renderInlineEditSupport() {
    const descriptionError = this.model.editDescriptionError()
    const submitError = this.model.editSubmitError()
    const pending = this.model.editPending()
    const readOnly = this.model.isReadOnly()

    return html`
      <div slot="support" class="group-inline-edit-stack">
        <cv-field ?invalid=${Boolean(descriptionError)}>
          <span slot="label">${i18n('group:description')}</span>
          <cv-textarea
            class="group-inline-description-input"
            name="description"
            size="small"
            rows="3"
            maxlength=${GROUP_DESCRIPTION_MAX_LENGTH}
            .value=${this.model.editedDescription()}
            placeholder=${i18n('group:description:placeholder')}
            ?invalid=${Boolean(descriptionError)}
            ?disabled=${readOnly}
            @cv-input=${this.onGroupDescriptionInput}
          ></cv-textarea>
          ${descriptionError
            ? html`<div slot="error" class="error-text">${descriptionError}</div>`
            : nothing}
        </cv-field>
        ${submitError ? html`<div class="error-text" role="alert">${submitError}</div>` : nothing}
        <div class="group-inline-edit-actions">
          <cv-button
            unstyled
            class="inline-edit-cancel"
            type="button"
            ?disabled=${pending}
            @click=${this.onEditCancel}
          >
            ${i18n('button:cancel')}
          </cv-button>
          <cv-button
            unstyled
            class="inline-edit-save"
            type="button"
            .loading=${pending}
            ?disabled=${pending || readOnly}
            @click=${this.onEditSave}
          >
            ${i18n('button:save')}
          </cv-button>
        </div>
      </div>
    `
  }

  protected renderHeader(group: Group, summary: PMGroupPresentation, isRoot: boolean) {
    const isEditing = !isRoot && this.model.isEditMode()
    const headerTitle = this.getWorkspaceHeaderTitle(group, isRoot, isEditing)
    const supportText = this.getWorkspaceHeaderSupportText(group, summary, isRoot, isEditing)
    const avatarLetter = (headerTitle.trim().charAt(0) || '?').toUpperCase()

    return html`
      <pm-workspace-header
        .item=${group}
        .density=${this.getWorkspaceHeaderDensity()}
        .contextLabel=${this.getWorkspaceHeaderContextLabel(summary, isRoot)}
        .contextItems=${this.getWorkspaceHeaderContextItems(group, isRoot)}
        .title=${headerTitle}
        .titleError=${isEditing ? this.model.editNameError() : ''}
        .supportText=${supportText}
        .avatarLetter=${avatarLetter}
        .avatarIcon=${'camera'}
        .avatarIconRef=${isEditing ? this.model.editedIconRef() : group.iconRef}
        .avatarInteractive=${isEditing}
        .editableTitle=${isEditing}
        .titlePlaceholder=${i18n('group:name')}
        .updatedFormatted=${this.getWorkspaceHeaderUpdatedFormatted(group, isRoot)}
        .createdFormatted=${this.getWorkspaceHeaderCreatedFormatted(group, isRoot)}
        @pm-workspace-header-navigate=${this.onWorkspaceHeaderNavigate}
        @pm-workspace-header-title-input=${this.onWorkspaceHeaderTitleInput}
        @pm-icon-change=${this.onGroupIconChange}
      >
        ${this.renderWorkspaceHeaderContextEnd(summary)} ${this.renderHeaderMeta(summary)}
        ${isEditing ? this.renderInlineEditSupport() : this.renderTitleEditAction(isEditing)}
        ${this.renderHeaderActions(group, isRoot, isEditing)}
      </pm-workspace-header>
    `
  }

  protected renderGroupMetrics(summary: PMGroupPresentation, slotName?: string) {
    if (summary.metrics.length === 0) {
      return nothing
    }

    const busy = summary.securityStatus === 'idle' || summary.securityStatus === 'loading'
    const degraded = summary.securityStatus === 'degraded'
    const title = degraded ? `${i18n('metrics:title')}. ${i18n('metrics:degraded')}` : i18n('metrics:title')

    return html`
      <pm-summary-rail
        slot=${slotName ?? nothing}
        class="group-metrics-strip"
        .items=${this.getGroupMetricItems(summary.metrics)}
        .label=${title}
        .busy=${busy}
        data-security-status=${summary.securityStatus}
      ></pm-summary-rail>
      ${degraded
        ? html`<span slot=${slotName ?? nothing} class="group-metrics-status"
            >${i18n('metrics:degraded')}</span
          >`
        : nothing}
    `
  }

  private getGroupMetricItems(metrics: readonly PMGroupMetric[]): PMSummaryRailItem[] {
    return metrics.map((metric) => ({
      id: metric.id,
      label: metric.label,
      value: metric.value,
      tone: this.getGroupMetricTone(metric),
      loadingLabel: i18n('metrics:loading'),
    }))
  }

  private getGroupMetricTone(metric: PMGroupMetric): PMSummaryRailTone {
    if (metric.family === 'attribute') return 'primary'
    if (metric.severity === 'critical') return 'danger'
    if (metric.severity === 'warning') return 'warning'
    return 'neutral'
  }

  protected renderGroupRiskDot(indicator: PMGroupRiskIndicator) {
    if (!indicator) return nothing

    return html`
      <span
        class="group-risk-dot"
        data-severity=${indicator.severity}
        role="img"
        aria-label=${indicator.label}
        title=${indicator.label}
      ></span>
    `
  }

  protected renderEntryItem(
    item: Entry,
    active: boolean,
    deleteExiting = false,
    entering?: PMListMutationPhase,
  ) {
    const dragEnabled = this.isItemDragEnabled(item)

    return html`
      <div
        class="entry-row"
        data-row-id=${item.id}
        ?data-delete-exiting=${deleteExiting}
        data-entering=${entering ?? nothing}
        aria-hidden=${deleteExiting ? 'true' : nothing}
        @pointerdown=${dragEnabled
          ? (event: PointerEvent) => this.onItemPointerDown(event, item.id, 'entry')
          : nothing}
        @dragstart=${this.preventNativeDrag}
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
          <pm-entry-list-item
            .entry=${item}
            .viewMode=${this.getEntryListItemViewMode()}
            .activeRow=${active}
            .rowTabIndex=${active ? 0 : -1}
            .manageActiveRowState=${true}
            @pm-entry-row-focus=${() => this.setActiveItemById(item.id)}
            group
          ></pm-entry-list-item>
        </div>
      </div>
    `
  }

  protected renderFolderItem(
    item: Group,
    active: boolean,
    deleteExiting = false,
    entering?: PMListMutationPhase,
  ) {
    const dragEnabled = this.isItemDragEnabled(item)
    const presentation = this.model.getGroupRowPresentation(item)

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
          <div
            class="group-row ${active ? 'active' : ''}"
            data-drop-target-id=${item.id}
            role="button"
            tabindex=${active ? '0' : '-1'}
            @focus=${() => this.setActiveItemById(item.id)}
            @pointerdown=${dragEnabled
              ? (event: PointerEvent) => this.onItemPointerDown(event, item.id, 'group')
              : nothing}
            @click=${(event: MouseEvent) => {
              this.setActiveItemById(item.id)
              ;(event.currentTarget as HTMLElement | null)?.focus({preventScroll: true})
              this.model.selectByID(item.id)
            }}
            @dragstart=${this.preventNativeDrag}
            @dragover=${(event: DragEvent) => this.onDragOverFolder(event, item.id)}
            @dragenter=${(event: DragEvent) => this.onDragOverFolder(event, item.id)}
            @drop=${(event: DragEvent) => this.onDropFolder(event, item.id)}
          >
            <div class="group-main-cell">
              <pm-avatar-icon class="folder-custom-icon" .item=${item} icon="folder"></pm-avatar-icon>
              <div class="group-copy">
                <div class="group-name">${presentation.displayName}</div>
                ${presentation.description
                  ? html`<div class="group-description">${presentation.description}</div>`
                  : nothing}
              </div>
            </div>
            <div class="group-trail">
              <span class="group-size">${presentation.entryCount}</span>
              ${this.renderGroupRiskDot(presentation.riskIndicator)}
            </div>
            <time class="group-modified-cell" datetime=${item.updatedFormatted}>
              ${item.updatedFormatted}
            </time>
            <div class="group-actions-cell">
              <cv-icon class="group-chevron" name="chevron-right"></cv-icon>
            </div>
          </div>
        </div>
      </div>
    `
  }

  protected renderGroupItem(
    item: Entry | Group,
    active: boolean,
    deleteExiting = false,
    entering?: PMListMutationPhase,
  ) {
    return this.isGroup(item)
      ? this.renderFolderItem(item, active, deleteExiting, entering)
      : this.renderEntryItem(item, active, deleteExiting, entering)
  }

  protected renderGroupHeader(row: Extract<PMGroupRow, {kind: 'header'}>) {
    return html`
      <div class="group-header-row" data-row-id=${row.id}>
        <div class="group-header">
          ${row.icon ? html`<cv-icon name=${row.icon}></cv-icon>` : nothing}
          <span class="group-header-label">${row.label}</span>
          <span class="group-count">${row.count}</span>
        </div>
      </div>
    `
  }

  protected renderRow(row: PMListMutationRow, active: boolean) {
    const deleteExiting = row.deleteExiting === true
    switch (row.kind) {
      case 'header':
        return this.renderGroupHeader(row)
      case 'group':
        return this.renderFolderItem(row.item, active, deleteExiting, row.entering)
      case 'entry':
        return this.renderEntryItem(row.item, active, deleteExiting, row.entering)
    }
  }

  private getPreviousVisibleRows(): PMListMutationVisibleRow[] {
    if (this.lastListRows.length === 0) return []

    const fallbackLast = Math.min(this.lastListRows.length - 1, 39)
    const range = this.lastRenderedRange ?? {first: 0, last: fallbackLast}
    const first = Math.max(0, range.first)
    const last = Math.min(this.lastListRows.length - 1, range.last)
    const rows: PMListMutationVisibleRow[] = []
    for (let index = first; index <= last; index += 1) {
      const row = this.lastListRows[index]
      if (row) rows.push({row, index})
    }
    return rows
  }

  private onVirtualRangeChanged(event: Event): void {
    const detail = event as Event & {first?: number; last?: number}
    if (typeof detail.first !== 'number' || typeof detail.last !== 'number') return
    this.lastRenderedRange = {
      first: Math.max(0, Math.floor(detail.first)),
      last: Math.max(0, Math.floor(detail.last)),
    }
    this.scrollEdge.scheduleMeasure()
  }

  private onVirtualVisibilityChanged(event: Event): void {
    const detail = event as Event & {first?: number; last?: number}
    if (typeof detail.first !== 'number' || typeof detail.last !== 'number') return
    this.lastVisibleRange = {
      first: Math.max(0, Math.floor(detail.first)),
      last: Math.max(0, Math.floor(detail.last)),
    }
  }

  protected onDeleteExitAnimationEnd(event: AnimationEvent, id: string): void {
    if (event.target !== event.currentTarget) return
    this.pendingExitCompletionIds.add(id)
    if (this.exitCompletionFrame !== null) return
    this.exitCompletionFrame = requestAnimationFrame(() => {
      this.exitCompletionFrame = null
      const ids = [...this.pendingExitCompletionIds]
      this.pendingExitCompletionIds.clear()
      void this.runProjectionMutation(() => {
        if (this.currentMutationScopeId) {
          pmListMutationMotionModel.completeExitBatch(this.currentMutationScopeId, ids)
        }
      })
    })
  }

  protected onEnterAnimationEnd(event: AnimationEvent, id: string): void {
    if (event.target !== event.currentTarget || !this.currentMutationScopeId) return
    pmListMutationMotionModel.consumeEnter(this.currentMutationScopeId, id)
  }

  private finishReducedMotionRows(): void {
    if (!prefersReducedMotion() || !this.currentMutationScopeId) return

    const exitingIds = this.lastListRows
      .filter((row) => row.deleteExiting === true)
      .map((row) => row.id)
    const enteringIds = this.lastListRows.filter((row) => row.entering).map((row) => row.id)
    const stagedIds = pmListMutationMotionModel.getStagedEnterIds(this.currentMutationScopeId)
    if (exitingIds.length > 0) {
      pmListMutationMotionModel.completeExitBatch(this.currentMutationScopeId, exitingIds)
    }
    if (stagedIds.length > 0) {
      pmListMutationMotionModel.revealEnterBatch(this.currentMutationScopeId, stagedIds)
      for (const id of stagedIds) pmListMutationMotionModel.consumeEnter(this.currentMutationScopeId, id)
    }
    for (const id of enteringIds) {
      pmListMutationMotionModel.consumeEnter(this.currentMutationScopeId, id)
    }
  }

  private scheduleStagedEnterReveal(): void {
    if (prefersReducedMotion() || !this.currentMutationScopeId || this.enterRevealFrame !== null) return
    const ids = pmListMutationMotionModel.getStagedEnterIds(this.currentMutationScopeId)
    if (ids.length === 0) return

    const scopeId = this.currentMutationScopeId
    this.enterRevealFrame = requestAnimationFrame(() => {
      this.enterRevealFrame = null
      void this.runProjectionMutation(() => {
        pmListMutationMotionModel.revealEnterBatch(scopeId, ids)
      })
    })
  }

  private async runProjectionMutation(update: () => void): Promise<void> {
    const before = this.captureVisibleRowRects()
    const scope = this.renderRoot.querySelector<HTMLElement>('.pm-group-scroll-edge')
    if (scope) scope.dataset['pmListTransition'] = 'true'
    const result = await elementScopedViewTransitionCoordinator.run({
      scope,
      enabled: this.canUseScopedListTransition(),
      update,
      settle: async () => {
        await this.updateComplete
        await this.waitForListLayout()
      },
    })
    if (scope) delete scope.dataset['pmListTransition']

    if (result.state !== 'applied' && result.state !== 'joined-active' && !prefersReducedMotion()) {
      this.animateCompaction(before)
    }
    this.scrollEdge.scheduleMeasure()
  }

  private canUseScopedListTransition(): boolean {
    if (typeof CSS === 'undefined' || !CSS.supports('view-transition-name', 'match-element')) {
      return false
    }

    const scroller = this.renderRoot.querySelector<HTMLElement>('.group-virtual-list')
    if (!scroller || !window.matchMedia('(pointer: fine)').matches) return true
    return scroller.offsetWidth - scroller.clientWidth <= 2
  }

  private captureVisibleRowRects(): Map<string, DOMRect> {
    const rows = new Map<string, DOMRect>()
    for (const element of this.renderRoot.querySelectorAll<HTMLElement>(
      '.entry-row[data-row-id], .group-row-wrap[data-row-id]',
    )) {
      if (element.hasAttribute('data-delete-exiting')) continue
      const id = element.dataset['rowId']
      if (!id) continue
      rows.set(id, element.getBoundingClientRect())
    }
    return rows
  }

  private animateCompaction(before: Map<string, DOMRect>): void {
    if (before.size === 0) return

    const style = getComputedStyle(this)
    const duration = this.readCssTime(style.getPropertyValue('--cv-duration-normal'), 250)
    const easing = style.getPropertyValue('--cv-easing-decelerate').trim() || 'cubic-bezier(0, 0, 0.2, 1)'

    for (const element of this.renderRoot.querySelectorAll<HTMLElement>(
      '.entry-row[data-row-id], .group-row-wrap[data-row-id]',
    )) {
      if (element.hasAttribute('data-delete-exiting')) continue

      const id = element.dataset['rowId']
      const previous = id ? before.get(id) : undefined
      const motionSurface = element.querySelector<HTMLElement>(':scope > .pm-row-motion-surface')
      if (!previous || !motionSurface || typeof motionSurface.animate !== 'function') continue

      const next = element.getBoundingClientRect()
      const deltaX = previous.left - next.left
      const deltaY = previous.top - next.top
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue

      motionSurface.animate([{transform: `translate(${deltaX}px, ${deltaY}px)`}, {transform: 'translate(0, 0)'}], {
        duration,
        easing,
      })
    }
  }

  private readCssTime(value: string, fallback: number): number {
    const normalized = value.trim()
    if (normalized.endsWith('ms')) return Number.parseFloat(normalized) || fallback
    if (normalized.endsWith('s')) return (Number.parseFloat(normalized) || fallback / 1000) * 1000
    return fallback
  }

  private async waitForListLayout(scroller: PMListScrollerElement | null = this.listScroller): Promise<void> {
    await scroller?.updateComplete
    const frameFallback = new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    const layoutComplete = scroller?.layoutComplete
    await (layoutComplete ? Promise.race([layoutComplete.catch(() => {}), frameFallback]) : frameFallback)
  }

  protected renderEmptyState() {
    const group = this.getCurrentGroup()
    const targetId = group ? this.getDropTargetId(group) : undefined
    const presentation = this.getEmptyStatePresentation()
    const surface = html`
      <div
        id="passwords.empty-state"
        role="group"
        aria-label=${presentation.ariaLabel}
        data-empty-kind=${presentation.kind}
      >
        <cv-empty-state
          variant="dropzone"
          icon=${presentation.icon}
          headline=${presentation.headline}
          description=${presentation.description}
          data-empty-kind=${presentation.kind}
          data-drop-target-id=${targetId ?? nothing}
          data-mobile-dnd-target-id=${targetId ?? nothing}
          @dragover=${this.onDragOverEmpty}
          @dragenter=${this.onDragOverEmpty}
          @drop=${this.onDropEmpty}
          @dragleave=${this.onEmptyDragLeave}
        >
          ${presentation.kind === 'empty'
            ? renderGuidanceInline('passwords.create-entry', 'passwords')
            : nothing}
          ${presentation.kind === 'filtered'
            ? html`
                <cv-button
                  slot="actions"
                  type="button"
                  size="small"
                  variant="default"
                  @click=${this.handleClearContentFilters}
                >
                  ${i18n('credentials:clear_filters' as never)}
                </cv-button>
              `
            : nothing}
        </cv-empty-state>
      </div>
    `

    return presentation.kind === 'empty'
      ? html`
          <cv-guidance-anchor anchor-id="passwords.create-entry" surface="passwords" owner="passmanager">
            ${surface}
          </cv-guidance-anchor>
        `
      : surface
  }

  private handleClearContentFilters(): void {
    this.model.clearContentFilters()
  }

  protected renderGroupsList(group: Group | ManagerRoot, items: PMGroupRow[]) {
    const previousVisibleRows = this.getPreviousVisibleRows()
    const contextKey = this.model.getListContextKey(group, items.length)
    const currentGroupBy = groupBy()
    const groupingChanged = this.renderedGroupBy !== null && currentGroupBy !== this.renderedGroupBy
    const shouldPreserveListFocus = this.shouldPreserveListFocus()
    const focusedRowId = shouldPreserveListFocus ? this.getFocusedListRowId() : undefined

    if (groupingChanged) {
      const entryId =
        this.pendingGroupingAnchor?.entryId ??
        this.model.getGroupingAnchorEntryId(
          this.lastListRows,
          this.lastVisibleRange ?? this.lastRenderedRange,
          this.model.getActiveItemId(),
        )
      this.pendingGroupingAnchor = {
        entryId,
        contextKey,
        shouldFocus:
          this.pendingGroupingAnchor?.shouldFocus ?? Boolean(entryId && focusedRowId === entryId),
      }
    } else if (this.pendingGroupingAnchor && this.pendingGroupingAnchor.contextKey !== contextKey) {
      this.pendingGroupingAnchor = null
    }
    this.renderedGroupBy = currentGroupBy

    const mutationScopeId = `content:${contextKey}`
    this.currentMutationScopeId = mutationScopeId
    this.ownedMutationScopes.add(mutationScopeId)
    pmListMutationMotionModel.syncProjection(
      mutationScopeId,
      items,
      previousVisibleRows,
      this.lastRenderedRange,
    )
    const renderItems = pmListMutationMotionModel.decorateProjection(mutationScopeId, items)
    this.renderedListContextKey = contextKey

    if (!items.length && !renderItems.length) {
      this.model.resetKeyboardState()
      this.lastListRows = []
      this.lastRenderedRange = null
      this.lastVisibleRange = null
      this.pendingGroupingAnchor = null
      return this.renderEmptyState()
    }

    const focusedRowRemoved = Boolean(
      focusedRowId && !renderItems.some((row) => row.id === focusedRowId),
    )
    const {restoredIndex, activeIndex, contextChanged} = this.model.syncKeyboardState(
      items,
      contextKey,
      group,
    )
    if (restoredIndex !== null) {
      this.ensureActiveItemVisible(restoredIndex, true)
    } else if (focusedRowRemoved) {
      if (activeIndex >= 0) this.ensureActiveItemVisible(activeIndex, true)
      else this.focusListContainer()
    } else if (contextChanged && shouldPreserveListFocus && activeIndex >= 0) {
      this.ensureActiveItemVisible(activeIndex, true)
    }

    const activeId = this.model.getActiveItemId() ?? null
    const currentGroupId = this.getDropTargetId(group)
    const hasScrollBlockStart = this.usesBlockStartScrollEdge() && this.scrollEdge.hasBlockStartOverflow()
    const hasScrollBlockEnd = this.scrollEdge.hasBlockEndOverflow()
    this.lastListRows = renderItems

    return html`
      <div
        class="scroll-edge-frame pm-group-scroll-edge"
        data-scroll-edge-treatment=${this.getScrollEdgeTreatment()}
        data-scroll-block-start=${String(hasScrollBlockStart)}
        data-scroll-block-end=${String(hasScrollBlockEnd)}
      >
        ${this.renderListHeader(group, items)}
        ${this.renderListScroller({rows: renderItems, activeId, dropTargetId: currentGroupId})}
      </div>
    `
  }

  protected renderGroupContent(group: Group, isRoot: boolean) {
    const items = this.model.getUniqueRows(this.model.getVisibleRows(group))
    const summary = this.model.getGroupPresentation(group, items, isRoot)

    return html`
      <div class="wrapper">
        ${this.renderHeader(group, summary, isRoot)} ${this.renderGroupMetrics(summary)}
        <section class="content-shell">${this.renderGroupsList(group, items)}</section>
      </div>
    `
  }

  protected renderRootContent(root: ManagerRoot) {
    const group = root as unknown as Group
    return this.renderGroupContent(group, true)
  }

  protected override render() {
    if (!getPassmanagerRoot()) return nothing

    const group = this.getCurrentGroup()
    if (!group) return nothing

    const isRoot = this.isManagerRoot(group)
    return isRoot ? this.renderRootContent(group) : this.renderGroupContent(group as Group, false)
  }
}
