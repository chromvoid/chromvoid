import type {CVTextareaInputEvent} from '@chromvoid/uikit/components/cv-textarea'
import {createAfterRenderScheduler, html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {nothing, type PropertyValues} from 'lit'
import {keyed} from 'lit/directives/keyed.js'

import '@lit-labs/virtualizer'

import {Entry, Group, type ManagerRoot} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {renderGuidanceInline} from 'root/features/guidance/render-guidance-inline'
import {ScrollEdgeAffordanceModel} from 'root/shared/ui/scroll-edge-affordance.model'
import type {PMWorkspaceContextItem} from '../../card/pm-workspace-header'
import type {PMSummaryRailItem, PMSummaryRailTone} from '../../summary-rail'
import {pmEntryMoveModel, type PMDragPayload} from '../../../models/pm-entry-move-model'
import {
  pmDeleteMotionModel,
  type PMDeleteMotionRow,
  type PMDeleteVisibleRow,
} from '../../../models/pm-delete-motion.model'
import {getPassmanagerRoot} from '../../../models/pm-root.adapter'
import {passmanagerNavigationController} from '../../../passmanager-navigation.controller'
import {
  PMGroupModel,
  type PMGroupMetric,
  type PMGroupPresentation,
  type PMGroupRiskIndicator,
  type PMGroupRow,
} from './group.model'

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

export abstract class PMGroupBase extends ReatomLitElement implements EventListenerObject {
  static properties = {
    showToolbarActions: {type: Boolean, attribute: 'show-toolbar-actions'},
  }

  protected readonly model = new PMGroupModel()
  private readonly scrollEdge = new ScrollEdgeAffordanceModel()

  private readonly afterRenderScheduler = createAfterRenderScheduler(this)
  private dropTargetEl: HTMLElement | null = null
  private pointerDrag: PMPointerDragState | null = null
  private renderedEditMode = false
  private rangeVirtualizer: HTMLElement | null = null
  private lastVirtualRows: PMGroupRow[] = []
  private lastVirtualRange: {first: number; last: number} | null = null

  protected getCurrentGroup(): Group | ManagerRoot | null {
    return this.model.getCurrentGroup()
  }

  protected usesBlockStartScrollEdge(): boolean {
    return false
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

  protected handleEditEnd(): void {
    this.model.exitEditMode()
  }

  protected override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    this.syncVirtualizerRangeListener()
    this.scrollEdge.scheduleMeasure()

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
    this.afterRenderScheduler.cancel()
    this.model.exitEditMode()
    super.disconnectedCallback()
    pmEntryMoveModel.unregisterDropZone(this.renderRoot as ShadowRoot)
    if (this.pointerDrag?.active) {
      this.endPointerDrag()
    }
    this.pointerDrag = null
    this.cleanupPointerListeners()
    if (this.rangeVirtualizer) {
      this.rangeVirtualizer.removeEventListener('rangeChanged', this)
      this.rangeVirtualizer = null
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

    if (event.type === 'rangeChanged') {
      this.onVirtualRangeChanged(event)
    }
  }

  private syncVirtualizerRangeListener(): void {
    const next = this.renderRoot.querySelector('lit-virtualizer') as HTMLElement | null
    if (next === this.rangeVirtualizer) return

    this.rangeVirtualizer?.removeEventListener('rangeChanged', this)
    this.rangeVirtualizer = next
    this.rangeVirtualizer?.addEventListener('rangeChanged', this)
    this.scrollEdge.bindScroller(this.rangeVirtualizer)
  }

  private getRowElementForIndex(index: number): HTMLElement | null {
    const virtualizer = this.renderRoot.querySelector('lit-virtualizer') as
      | ({element?: (index: number) => unknown} & HTMLElement)
      | null

    const rawElement = virtualizer?.element?.(index)
    if (rawElement instanceof HTMLElement) {
      if (
        rawElement.classList.contains('entry-row') ||
        rawElement.classList.contains('group-row-wrap') ||
        rawElement.classList.contains('group-header-row')
      ) {
        return rawElement
      }

      const closestRow = rawElement.closest('.entry-row, .group-row-wrap, .group-header-row')
      if (closestRow instanceof HTMLElement) {
        return closestRow
      }
    }

    const itemId = this.model.getKeyboardItemIdByIndex(index)
    if (!itemId) return null

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

    if (active.matches('.group-row, pm-entry-list-item, pm-entry-list-item-mobile, pm-group-list-item-mobile')) {
      return true
    }

    return active.closest('.entry-row, .group-row-wrap, .group-row') != null
  }

  private ensureActiveItemVisible(index: number, shouldFocus = false): void {
    requestAnimationFrame(() => {
      const row = this.getRowElementForIndex(index)
      row?.scrollIntoView({block: 'nearest'})
      if (shouldFocus && row) {
        this.focusRowElement(row)
      }
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

  private onDragOverContentArea(event: DragEvent): void {
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

  private onDropContentArea(event: DragEvent): void {
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

  private onContentDragLeave(event: DragEvent): void {
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

    const parentSegments = group.name.split('/').filter(Boolean).slice(0, -1)
    if (parentSegments.length === 0) {
      return [{label: i18n('root:title-short'), value: ''}]
    }

    return [
      {label: i18n('root:title-short'), value: ''},
      ...parentSegments.map((segment, index) => ({
        label: segment,
        value: parentSegments.slice(0, index + 1).join('/'),
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
    this.model.syncEditDrafts()
    this.model.exitEditMode()
  }

  protected onEditSave() {
    void this.model.saveEdit()
  }

  protected renderTitleEditAction(isEditing: boolean) {
    if (isEditing || this.model.isReadOnly()) {
      return nothing
    }

    return html`
      <cv-button unstyled
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

  protected renderInlineEditSupport() {
    const error = this.model.editError()

    return html`
      <div slot="support" class="group-inline-edit-stack">
        <cv-textarea
          class="group-inline-description-input"
          name="description"
          size="small"
          rows="3"
          .value=${this.model.editedDescription()}
          placeholder=${i18n('group:description:placeholder')}
          @cv-input=${this.onGroupDescriptionInput}
        >
          <span slot="label">${i18n('group:description')}</span>
          ${error ? html`<div slot="help-text" class="error-text">${error}</div>` : nothing}
        </cv-textarea>
        <div class="group-inline-edit-actions">
          <cv-button unstyled class="inline-edit-cancel" type="button" @click=${this.onEditCancel}>
            ${i18n('button:cancel')}
          </cv-button>
          <cv-button unstyled class="inline-edit-save" type="button" @click=${this.onEditSave}>
            ${i18n('button:save')}
          </cv-button>
        </div>
      </div>
    `
  }

  protected renderHeader(group: Group, summary: PMGroupPresentation, isRoot: boolean) {
    const {title} = this.getGroupMetadata(group)
    const isEditing = !isRoot && this.model.isEditMode()
    const headerTitle = isEditing ? this.model.editedName() : title
    const supportText = isEditing ? '' : group.description?.trim() || summary.supportText
    const avatarLetter = (headerTitle.trim().charAt(0) || '?').toUpperCase()

    return html`
      <pm-workspace-header
        .item=${group}
        .contextLabel=${summary.scopeLabel}
        .contextItems=${this.getHeaderContextItems(group, isRoot)}
        .title=${headerTitle}
        .supportText=${supportText}
        .avatarLetter=${avatarLetter}
        .avatarIcon=${'camera'}
        .avatarIconRef=${isEditing ? this.model.editedIconRef() : group.iconRef}
        .avatarInteractive=${isEditing}
        .editableTitle=${isEditing}
        .titlePlaceholder=${i18n('group:name')}
        .updatedFormatted=${group.updatedFormatted}
        .createdFormatted=${group.createdFormatted}
        @pm-workspace-header-navigate=${this.onWorkspaceHeaderNavigate}
        @pm-workspace-header-title-input=${this.onWorkspaceHeaderTitleInput}
        @pm-icon-change=${this.onGroupIconChange}
      >
        <span slot="context-end" class="workspace-summary-value">${summary.visibleLabel}</span>
        ${isEditing ? this.renderInlineEditSupport() : this.renderTitleEditAction(isEditing)}
      </pm-workspace-header>
    `
  }

  protected renderGroupMetrics(summary: PMGroupPresentation) {
    if (summary.metrics.length === 0) {
      return nothing
    }

    const busy = summary.securityStatus === 'idle' || summary.securityStatus === 'loading'
    const degraded = summary.securityStatus === 'degraded'
    const title = degraded
      ? `${i18n('metrics:title')}. ${i18n('metrics:degraded')}`
      : i18n('metrics:title')

    return html`
      <pm-summary-rail
        class="group-metrics-strip"
        .items=${this.getGroupMetricItems(summary.metrics)}
        .label=${title}
        .busy=${busy}
        data-security-status=${summary.securityStatus}
      ></pm-summary-rail>
      ${degraded ? html`<span class="group-metrics-status">${i18n('metrics:degraded')}</span>` : nothing}
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


  protected renderEntryItem(item: Entry, active: boolean, deleteExiting = false) {
    const dragEnabled = this.isItemDragEnabled(item)

    return html`
      <div
        class="entry-row"
        data-row-id=${item.id}
        ?data-delete-exiting=${deleteExiting}
        aria-hidden=${deleteExiting ? 'true' : nothing}
        @pointerdown=${dragEnabled
          ? (event: PointerEvent) => this.onItemPointerDown(event, item.id, 'entry')
          : nothing}
        @dragstart=${this.preventNativeDrag}
        @click=${() => this.setActiveItemById(item.id)}
        @animationend=${deleteExiting
          ? (event: AnimationEvent) => this.onDeleteExitAnimationEnd(event, item.id)
          : undefined}
      >
        <pm-entry-list-item
          .entry=${item}
          .activeRow=${active}
          .rowTabIndex=${active ? 0 : -1}
          .manageActiveRowState=${true}
          @pm-entry-row-focus=${() => this.setActiveItemById(item.id)}
          group
        ></pm-entry-list-item>
      </div>
    `
  }

  protected renderFolderItem(item: Group, active: boolean, deleteExiting = false) {
    const dragEnabled = this.isItemDragEnabled(item)
    const presentation = this.model.getGroupRowPresentation(item)

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
          <pm-avatar-icon class="folder-custom-icon" .item=${item} icon="folder"></pm-avatar-icon>
          <div class="group-copy">
            <div class="group-name">${presentation.displayName}</div>
            ${presentation.description
              ? html`<div class="group-description">${presentation.description}</div>`
              : nothing}
          </div>
          <div class="group-trail">
            <span class="group-size">${presentation.entryCount}</span>
            ${this.renderGroupRiskDot(presentation.riskIndicator)}
            <cv-icon class="group-chevron" name="chevron-right"></cv-icon>
          </div>
        </div>
      </div>
    `
  }

  protected renderGroupItem(item: Entry | Group, active: boolean, deleteExiting = false) {
    return this.isGroup(item)
      ? this.renderFolderItem(item, active, deleteExiting)
      : this.renderEntryItem(item, active, deleteExiting)
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

  protected renderRow(row: PMDeleteMotionRow, active: boolean) {
    const deleteExiting = row.deleteExiting === true
    switch (row.kind) {
      case 'header':
        return this.renderGroupHeader(row)
      case 'group':
        return this.renderFolderItem(row.item, active, deleteExiting)
      case 'entry':
        return this.renderEntryItem(row.item, active, deleteExiting)
    }
  }

  protected getVirtualListRenderKey(
    group: Group | ManagerRoot,
    items: PMGroupRow[],
  ): string {
    // Active-row changes must update rows in place; remounting the list resets scroll on focus/click.
    return this.model.getListContextKey(group, items.length)
  }

  private getPreviousVisibleRows(): PMDeleteVisibleRow[] {
    if (this.lastVirtualRows.length === 0) return []

    const fallbackLast = Math.min(this.lastVirtualRows.length - 1, 39)
    const range = this.lastVirtualRange ?? {first: 0, last: fallbackLast}
    const first = Math.max(0, range.first)
    const last = Math.min(this.lastVirtualRows.length - 1, range.last)
    const rows: PMDeleteVisibleRow[] = []
    for (let index = first; index <= last; index += 1) {
      const row = this.lastVirtualRows[index]
      if (row) rows.push({row, index})
    }
    return rows
  }

  private onVirtualRangeChanged(event: Event): void {
    const detail = event as Event & {first?: number; last?: number}
    if (typeof detail.first !== 'number' || typeof detail.last !== 'number') return
    this.lastVirtualRange = {
      first: Math.max(0, Math.floor(detail.first)),
      last: Math.max(0, Math.floor(detail.last)),
    }
    this.scrollEdge.scheduleMeasure()
  }

  protected onDeleteExitAnimationEnd(event: AnimationEvent, id: string): void {
    if (event.target !== event.currentTarget) return

    const before = this.captureVisibleRowRects()
    pmDeleteMotionModel.completeExit(id)

    if (this.prefersReducedMotion()) return
    void this.updateComplete.then(async () => {
      await this.waitForVirtualizerLayout()
      this.animateCompaction(before)
      this.scrollEdge.scheduleMeasure()
    })
  }

  private captureVisibleRowRects(): Map<string, DOMRect> {
    const rows = new Map<string, DOMRect>()
    for (const element of this.renderRoot.querySelectorAll<HTMLElement>('.entry-row[data-row-id], .group-row-wrap[data-row-id]')) {
      if (element.hasAttribute('data-delete-exiting')) continue
      const id = element.dataset['rowId']
      if (!id) continue
      rows.set(id, element.getBoundingClientRect())
    }
    return rows
  }

  private animateCompaction(before: Map<string, DOMRect>): void {
    if (before.size === 0) return

    for (const element of this.renderRoot.querySelectorAll<HTMLElement>('.entry-row[data-row-id], .group-row-wrap[data-row-id]')) {
      if (element.hasAttribute('data-delete-exiting')) continue

      const id = element.dataset['rowId']
      const previous = id ? before.get(id) : undefined
      if (!previous || typeof element.animate !== 'function') continue

      const next = element.getBoundingClientRect()
      const deltaX = previous.left - next.left
      const deltaY = previous.top - next.top
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue

      element.animate(
        [
          {transform: `translate(${deltaX}px, ${deltaY}px)`},
          {transform: 'translate(0, 0)'},
        ],
        {
          duration: 180,
          easing: 'cubic-bezier(0, 0, 0.2, 1)',
        },
      )
    }
  }

  private async waitForVirtualizerLayout(): Promise<void> {
    const virtualizer = this.renderRoot.querySelector('lit-virtualizer') as
      | ({layoutComplete?: Promise<void>} & HTMLElement)
      | null
    await virtualizer?.layoutComplete?.catch(() => {})
  }

  private prefersReducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  }

  protected renderEmptyState() {
    const group = this.getCurrentGroup()
    const targetId = group ? this.getDropTargetId(group) : undefined

    return html`
      <cv-guidance-anchor anchor-id="passwords.create-entry" surface="passwords" owner="passmanager">
        <cv-empty-state
          variant="dropzone"
          icon="folder"
          headline=${i18n('group:no_entries')}
          data-drop-target-id=${targetId ?? nothing}
          data-mobile-dnd-target-id=${targetId ?? nothing}
          @dragover=${this.onDragOverEmpty}
          @dragenter=${this.onDragOverEmpty}
          @drop=${this.onDropEmpty}
          @dragleave=${this.onEmptyDragLeave}
        >
          ${renderGuidanceInline('passwords.create-entry', 'passwords')}
        </cv-empty-state>
      </cv-guidance-anchor>
    `
  }

  protected renderGroupsList(group: Group | ManagerRoot, items: PMGroupRow[]) {
    const previousVisibleRows = this.getPreviousVisibleRows()
    pmDeleteMotionModel.syncVisibleExits(items, previousVisibleRows, this.lastVirtualRange)
    const renderItems = pmDeleteMotionModel.decorateRows(items)

    if (!items.length && !renderItems.length) {
      this.model.resetKeyboardState()
      this.lastVirtualRows = []
      return this.renderEmptyState()
    }

    const shouldPreserveListFocus = this.shouldPreserveListFocus()
    const contextKey = this.model.getListContextKey(group, items.length)
    const {restoredIndex, activeIndex, contextChanged} = this.model.syncKeyboardState(
      items,
      contextKey,
      group,
    )
    if (restoredIndex !== null) {
      this.ensureActiveItemVisible(restoredIndex, true)
    } else if (contextChanged && shouldPreserveListFocus && activeIndex >= 0) {
      this.ensureActiveItemVisible(activeIndex, true)
    }

    const activeId = this.model.getActiveItemId()
    const currentGroupId = this.getDropTargetId(group)
    const renderKey = this.getVirtualListRenderKey(group, renderItems)
    const hasScrollBlockStart = this.usesBlockStartScrollEdge() && this.scrollEdge.hasBlockStartOverflow()
    const hasScrollBlockEnd = this.scrollEdge.hasBlockEndOverflow()
    this.lastVirtualRows = items

    return html`
      <div
        class="scroll-edge-frame pm-group-scroll-edge"
        data-scroll-block-start=${String(hasScrollBlockStart)}
        data-scroll-block-end=${String(hasScrollBlockEnd)}
      >
        ${keyed(renderKey, html`
          <lit-virtualizer
            class="group-virtual-list"
            data-drop-target-id=${currentGroupId ?? nothing}
            data-mobile-dnd-target-id=${currentGroupId ?? nothing}
            scroller
            .items=${renderItems}
            .keyFunction=${(item: PMDeleteMotionRow) => item.id}
            .renderItem=${(item: PMDeleteMotionRow) => this.renderRow(item, item.id === activeId)}
            @rangeChanged=${this.onVirtualRangeChanged}
            @dragover=${this.onDragOverContentArea}
            @dragenter=${this.onDragOverContentArea}
            @drop=${this.onDropContentArea}
            @dragleave=${this.onContentDragLeave}
          ></lit-virtualizer>
        `)}
      </div>
    `
  }

  protected renderGroupContent(group: Group, isRoot: boolean) {
    const items = this.model.getUniqueRows(this.model.getVisibleRows(group))
    const summary = this.model.getGroupPresentation(group, items, isRoot)

    return html`
      <div class="wrapper">
        ${this.renderHeader(group, summary, isRoot)}
        ${this.renderGroupMetrics(summary)}
        <section class="content-shell">
          ${this.renderGroupsList(group, items)}
        </section>
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
