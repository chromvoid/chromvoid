import {XLitElement} from '@statx/lit'
import {html, nothing} from 'lit'
import {keyed} from 'lit/directives/keyed.js'

import '@lit-labs/virtualizer'

import {Entry, Group, i18n} from '@project/passmanager'
import type {ManagerRoot} from '@project/passmanager'
import {pmEntryMoveModel, type PMDragPayload} from '../../../models/pm-entry-move-model'
import {PMGroupModel, type PMGroupRow, type PMToolbarAction} from './group.model'

type PMEntryFocusableItem = HTMLElement & {
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

export abstract class PMGroupBase extends XLitElement implements EventListenerObject {
  protected readonly model = new PMGroupModel()

  private dropTargetEl: HTMLElement | null = null
  private pointerDrag: PMPointerDragState | null = null

  protected getCurrentGroup(): Group | ManagerRoot | null {
    return this.model.getCurrentGroup()
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

  protected setActiveItemById(id: string): void {
    this.model.setActiveItemById(id)
  }

  protected onEditClick(): void {
    this.model.enterEditMode()
  }

  protected onDeleteClick(group: Group): void {
    this.model.deleteGroup(group)
  }

  triggerEditAction(): void {
    this.model.enterEditMode()
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

  moveKeyboardFocus(step: number): boolean {
    const next = this.model.moveKeyboardFocus(step)
    if (next === null) return false

    this.ensureActiveItemVisible(next)
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
    super.disconnectedCallback()
    pmEntryMoveModel.unregisterDropZone(this.renderRoot as ShadowRoot)
    if (this.pointerDrag?.active) {
      this.endPointerDrag()
    }
    this.pointerDrag = null
    this.cleanupPointerListeners()
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
    }
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
      const inner = row.querySelector('.group-row') as HTMLElement | null
      inner?.focus()
      return
    }

    row.focus()
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
    return this.isManagerRoot(group) ? window.passmanager?.id : group.id
  }

  private isItemDragEnabled(item: Entry | Group): boolean {
    const root = window.passmanager
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
    if (drag.kind === 'entry') {
      pmEntryMoveModel.startDrag(drag.itemId)
    } else {
      pmEntryMoveModel.startGroupDrag(drag.itemId)
    }

    const label = this.getItemDragLabel(drag.itemId, drag.kind)
    const ghost = document.createElement('div')
    ghost.style.cssText = [
      'position:fixed;left:0;top:0;pointer-events:none;z-index:99999',
      `transform:translate(${drag.startX + 14}px,${drag.startY + 14}px)`,
      'background:var(--cv-color-surface-2,#222)',
      'border:1.5px solid var(--cv-color-primary,#6366f1)',
      'border-radius:8px;padding:5px 12px',
      'font-size:12px;font-weight:600',
      'color:var(--cv-color-text,#eee)',
      'box-shadow:0 6px 20px var(--cv-alpha-black-35)',
      'white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis',
    ].join(';')
    ghost.textContent = label
    document.body.appendChild(ghost)
    drag.ghost = ghost

    document.body.style.userSelect = 'none'
    ;(document.body.style as any).webkitUserSelect = 'none'
  }

  private getItemDragLabel(itemId: string, kind: 'entry' | 'group'): string {
    const root = window.passmanager
    if (!root) return ''

    if (kind === 'group') return root.getGroup(itemId)?.name || '?'
    return root.getEntry(itemId)?.title || i18n('no_title')
  }

  private pointerHitTest(x: number, y: number): void {
    const drag = this.pointerDrag
    if (!drag) return

    const payload: PMDragPayload = {kind: drag.kind, id: drag.itemId}
    const hit = pmEntryMoveModel.hitTestDropTarget(x, y)

    if (hit && pmEntryMoveModel.canDropToTarget(hit.id, payload)) {
      pmEntryMoveModel.setDropTarget(hit.id)
      if (this.renderRoot.contains(hit.el)) {
        this.setDropHighlight(hit.el)
      } else {
        this.clearDropHighlight()
      }
      return
    }

    this.clearDropHighlight()
    pmEntryMoveModel.setDropTarget(null)
  }

  private performPointerDrop(x: number, y: number): void {
    const drag = this.pointerDrag
    if (!drag) return

    const payload: PMDragPayload = {kind: drag.kind, id: drag.itemId}
    const hit = pmEntryMoveModel.hitTestDropTarget(x, y)

    if (hit && pmEntryMoveModel.canDropToTarget(hit.id, payload)) {
      pmEntryMoveModel.dropToTarget(hit.id, payload)
      return
    }

    pmEntryMoveModel.clearDragState()
  }

  private endPointerDrag(): void {
    if (this.pointerDrag?.ghost) {
      this.pointerDrag.ghost.remove()
    }

    this.clearDropHighlight()
    pmEntryMoveModel.clearDragState()
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
    pmEntryMoveModel.dropToTarget(targetId, dragPayload)
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
    pmEntryMoveModel.dropToTarget(targetId, dragPayload)
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
    pmEntryMoveModel.dropToTarget(targetId, dragPayload)
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

  private getToolbarActionTarget(event: Event): HTMLElement | null {
    for (const node of event.composedPath()) {
      if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'cv-toolbar-item') {
        return node
      }
    }

    return null
  }

  private handleToolbarItemClick(event: MouseEvent): void {
    const item = this.getToolbarActionTarget(event)
    if (!item || item.hasAttribute('disabled')) return

    const action = item.dataset['action']
    if (!this.model.isToolbarAction(action)) return

    this.model.executeToolbarAction(action)
  }

  private handleToolbarItemKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return

    const item = this.getToolbarActionTarget(event)
    if (!item || item.hasAttribute('disabled')) return

    const action = item.dataset['action']
    if (!this.model.isToolbarAction(action)) return

    if (event.key === ' ') {
      event.preventDefault()
    }

    this.model.executeToolbarAction(action)
  }

  private renderToolbarAction(
    action: PMToolbarAction,
    icon: string,
    label: string,
    isReadOnly: boolean,
    iconOnly = false,
  ) {
    const className = iconOnly ? 'group-action-item icon-only' : 'group-action-item'

    return html`
      <cv-toolbar-item
        value=${action}
        data-action=${action}
        class=${className}
        ?disabled=${isReadOnly}
        aria-label=${iconOnly ? label : nothing}
        title=${iconOnly ? label : nothing}
      >
        <span class="group-action-item-content">
          <cv-icon class="group-action-item-icon" name=${icon}></cv-icon>
          ${iconOnly ? nothing : html`${label}`}
        </span>
      </cv-toolbar-item>
    `
  }

  protected renderHeader(group: Group) {
    const {title, avatar} = this.getGroupMetadata(group)

    return html`
      <pm-card-header>
        <back-button slot="back"></back-button>
        <pm-avatar-icon
          slot="avatar"
          class="title-avatar-icon"
          .item=${group}
          .letter=${avatar}
        ></pm-avatar-icon>
        <div class="title-content">
          <h1 class="title-text">${title}</h1>
        </div>
      </pm-card-header>
    `
  }

  protected renderActions(isRoot: boolean) {
    const isReadOnly = this.model.isReadOnly()
    const toolbarKey = `${isRoot ? 'root' : 'group'}-${isReadOnly ? 'ro' : 'rw'}`

    return keyed(
      toolbarKey,
      html`
        <cv-toolbar
          aria-label=${i18n('group:actions')}
          @click=${this.handleToolbarItemClick}
          @keydown=${this.handleToolbarItemKeydown}
        >
          ${this.renderToolbarAction('create-entry', 'plus-lg', i18n('enrty:create'), isReadOnly)}
          ${this.renderToolbarAction('create-group', 'plus-lg', i18n('group:create'), isReadOnly)}
          ${isRoot
            ? nothing
            : html`
                <cv-toolbar-separator value="group-actions-separator"></cv-toolbar-separator>
                ${this.renderToolbarAction(
                  'edit-group',
                  'pencil-square',
                  i18n('button:edit'),
                  isReadOnly,
                  true,
                )}
                ${this.renderToolbarAction('remove-group', 'x-lg', i18n('button:remove'), isReadOnly, true)}
              `}
        </cv-toolbar>
      `,
    )
  }

  protected renderEntryItem(item: Entry, active: boolean) {
    const dragEnabled = this.isItemDragEnabled(item)

    return html`
      <div
        class="entry-row ${active ? 'active' : ''}"
        data-row-id=${item.id}
        @pointerenter=${() => this.setActiveItemById(item.id)}
        @pointerdown=${dragEnabled
          ? (event: PointerEvent) => this.onItemPointerDown(event, item.id, 'entry')
          : nothing}
        @dragstart=${this.preventNativeDrag}
        @click=${() => this.setActiveItemById(item.id)}
      >
        <pm-entry-list-item .entry=${item} group></pm-entry-list-item>
      </div>
    `
  }

  protected renderFolderItem(item: Group, active: boolean) {
    const dragEnabled = this.isItemDragEnabled(item)

    return html`
      <div class="group-row-wrap" data-row-id=${item.id}>
        <div
          class="group-row ${active ? 'active' : ''}"
          data-drop-target-id=${item.id}
          role="button"
          tabindex="-1"
          @pointerenter=${() => this.setActiveItemById(item.id)}
          @pointerdown=${dragEnabled
            ? (event: PointerEvent) => this.onItemPointerDown(event, item.id, 'group')
            : nothing}
          @click=${() => {
            this.setActiveItemById(item.id)
            this.model.selectByID(item.id)
          }}
          @dragstart=${this.preventNativeDrag}
          @dragover=${(event: DragEvent) => this.onDragOverFolder(event, item.id)}
          @dragenter=${(event: DragEvent) => this.onDragOverFolder(event, item.id)}
          @drop=${(event: DragEvent) => this.onDropFolder(event, item.id)}
        >
          <pm-avatar-icon class="folder-custom-icon" .item=${item} icon="folder"></pm-avatar-icon>
          <div class="group-name">${this.getGroupDisplayName(item)}</div>
          <cv-badge size="small" variant="neutral" pill>${item.entries().length}</cv-badge>
        </div>
      </div>
    `
  }

  protected renderGroupItem(item: Entry | Group, active: boolean) {
    return this.isGroup(item) ? this.renderFolderItem(item, active) : this.renderEntryItem(item, active)
  }

  protected renderGroupHeader(row: Extract<PMGroupRow, {kind: 'header'}>) {
    return html`
      <div class="group-header-row" data-row-id=${row.id}>
        <div class="group-header">
          ${row.icon ? html`<cv-icon name=${row.icon}></cv-icon>` : nothing}
          ${row.label}
          <span class="group-count">${row.count}</span>
        </div>
      </div>
    `
  }

  protected renderRow(row: PMGroupRow, active: boolean) {
    switch (row.kind) {
      case 'header':
        return this.renderGroupHeader(row)
      case 'group':
        return this.renderFolderItem(row.item, active)
      case 'entry':
        return this.renderEntryItem(row.item, active)
    }
  }

  protected renderEmptyState() {
    const group = this.getCurrentGroup()
    const targetId = group ? this.getDropTargetId(group) : undefined

    return html`
      <div
        class="empty"
        data-drop-target-id=${targetId ?? nothing}
        @dragover=${this.onDragOverEmpty}
        @dragenter=${this.onDragOverEmpty}
        @drop=${this.onDropEmpty}
        @dragleave=${this.onEmptyDragLeave}
      >
        ${i18n('group:no_entries')}
      </div>
    `
  }

  protected renderGroupsList(group: Group | ManagerRoot) {
    const items = this.model.getUniqueRows(this.model.getVisibleRows(group))

    if (!items.length) {
      this.model.resetKeyboardState()
      return this.renderEmptyState()
    }

    const contextKey = this.model.getListContextKey(group, items.length)
    const {restoredIndex} = this.model.syncKeyboardState(items, contextKey, group)
    if (restoredIndex !== null) {
      this.ensureActiveItemVisible(restoredIndex, true)
    }

    const activeId = this.model.getActiveItemId()
    const currentGroupId = this.getDropTargetId(group)

    return html`
      <lit-virtualizer
        class="group-virtual-list"
        data-drop-target-id=${currentGroupId ?? nothing}
        scroller
        .items=${items}
        .keyFunction=${(item: PMGroupRow) => item.id}
        .renderItem=${(item: PMGroupRow) => this.renderRow(item, item.id === activeId)}
        @dragover=${this.onDragOverContentArea}
        @dragenter=${this.onDragOverContentArea}
        @drop=${this.onDropContentArea}
        @dragleave=${this.onContentDragLeave}
      ></lit-virtualizer>
    `
  }

  protected renderMetadata(group: Group) {
    return html`
      <div class="metadata-section">
        <div>
          <label>${i18n('ts:modified')}</label>
          <strong>${group.updatedFormatted}</strong>
        </div>
        <div>
          <label>${i18n('ts:created')}</label>
          <strong>${group.createdFormatted}</strong>
        </div>
      </div>
    `
  }

  protected renderGroupContent(group: Group, isRoot: boolean) {
    return html`
      <div class="wrapper">
        ${this.renderHeader(group)} ${this.renderActions(isRoot)} ${this.renderGroupsList(group)}
        ${this.renderMetadata(group)}
      </div>
    `
  }

  protected renderRootContent(root: ManagerRoot) {
    const group = root as unknown as Group
    return this.renderGroupContent(group, true)
  }

  protected override render() {
    if (!window.passmanager) return nothing

    const group = this.getCurrentGroup()
    if (!group) return nothing

    if (this.model.isEditMode()) {
      return html`<pm-group-edit @editEnd=${this.handleEditEnd}></pm-group-edit>`
    }

    const isRoot = this.isManagerRoot(group)
    return isRoot ? this.renderRootContent(group) : this.renderGroupContent(group as Group, false)
  }
}
