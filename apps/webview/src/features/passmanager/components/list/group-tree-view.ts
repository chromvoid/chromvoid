import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {nothing, type PropertyValues, type TemplateResult} from 'lit'
import {repeat} from 'lit/directives/repeat.js'

import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {Group} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import type {GroupTreeNode} from '../../models/group-tree'
import {pmGroupTreeModel} from '../../models/pm-group-tree-model'
import {pmEntryMoveModel, type PMDragPayload} from '../../models/pm-entry-move-model'
import {
  pmListMutationMotionModel,
  type PMListMutationRow,
  type PMListMutationVisibleRow,
} from '../../models/pm-list-mutation-motion.model'
import type {PMGroupRow} from '../../models/pm-root-search-projection'
import {pmModel} from '../../password-manager.model'
import {
  elementScopedViewTransitionCoordinator,
  prefersReducedMotion,
} from 'root/utils/view-transitions'
import {groupTreeViewStyles} from './group-tree-view.styles'

type GroupTreeRenderItem = {
  node: GroupTreeNode
  depth: number
  row: PMListMutationRow
}

let nextGroupTreeMutationScope = 0

export class GroupTreeView extends ReatomLitElement {
  static define() {
    if (!customElements.get('group-tree-view')) {
      customElements.define('group-tree-view', this)
    }
    CVIcon.define()
  }

  static styles = groupTreeViewStyles

  private readonly mutationScopeId = `desktop-tree:${++nextGroupTreeMutationScope}`
  private lastTreeRows: PMListMutationRow[] = []
  private lastTreeItems = new Map<string, GroupTreeRenderItem>()
  private readonly pendingExitIds = new Set<string>()
  private exitFrame: number | null = null
  private enterFrame: number | null = null

  private onSelectRoot = () => {
    pmGroupTreeModel.select(null)
  }

  private onSelectGroup = (path: string) => {
    pmGroupTreeModel.select(path)
  }

  private onToggle = (e: Event, path: string) => {
    e.stopPropagation()
    pmGroupTreeModel.toggleExpanded(path)
  }

  private onCreateGroup = async (e: Event, parentPath: string | null) => {
    e.stopPropagation()
    e.preventDefault()
    await pmGroupTreeModel.createGroupUnder(parentPath)
  }

  private onRowKeyDown(event: KeyboardEvent, path: string | null): void {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) {
      return
    }

    event.preventDefault()
    if (path === null) {
      this.onSelectRoot()
      return
    }

    this.onSelectGroup(path)
  }

  private getRoot() {
    return pmModel.root()
  }

  private resolveTargetId(path: string | null): string | null {
    const root = this.getRoot()
    if (!root) return null
    if (!path) return root.id

    const group = this.resolveGroupByPath(path)
    return group?.id ?? null
  }

  private resolveGroupByPath(path: string): Group | null {
    const root = this.getRoot()
    if (!root) return null

    const group = root
      .entriesList()
      .find((item): item is Group => item instanceof Group && item.name === path)

    return group ?? null
  }

  private isGroupDragEnabled(path: string): boolean {
    const root = this.getRoot()
    if (!root || root.isReadOnly()) return false
    if (!pmEntryMoveModel.isDesktopDragEnabled()) return false

    const group = this.resolveGroupByPath(path)
    return Boolean(group?.id)
  }

  // --- Lifecycle ---

  connectedCallback() {
    super.connectedCallback()
    pmEntryMoveModel.registerDropZone(this.renderRoot as ShadowRoot)
  }

  disconnectedCallback() {
    if (this.exitFrame !== null) cancelAnimationFrame(this.exitFrame)
    if (this.enterFrame !== null) cancelAnimationFrame(this.enterFrame)
    this.exitFrame = null
    this.enterFrame = null
    pmListMutationMotionModel.resetScope(this.mutationScopeId)
    pmEntryMoveModel.unregisterDropZone(this.renderRoot as ShadowRoot)
    if (this.pointerDrag?.active) this.endPointerDrag()
    this.pointerDrag = null
    this.cleanupPointerListeners()
    super.disconnectedCallback()
  }

  protected override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    if (prefersReducedMotion()) {
      this.finishReducedMotionRows()
      return
    }
    this.scheduleStagedEnters()
  }

  // --- Pointer-based drag (initiation) ---

  private pointerDrag: {
    pointerId: number
    itemId: string
    startX: number
    startY: number
    ghost: HTMLElement | null
    active: boolean
  } | null = null

  private onRowPointerDown = (e: PointerEvent, path: string) => {
    if (e.button !== 0 || this.pointerDrag) return
    if (!this.isGroupDragEnabled(path)) return

    const first = e.composedPath()[0]
    if (first instanceof HTMLElement && first.closest('.actions, .action-btn, .chevron')) return

    const group = this.resolveGroupByPath(path)
    if (!group) return

    this.pointerDrag = {
      pointerId: e.pointerId,
      itemId: group.id,
      startX: e.clientX,
      startY: e.clientY,
      ghost: null,
      active: false,
    }

    document.addEventListener('pointermove', this.onDocPointerMove)
    document.addEventListener('pointerup', this.onDocPointerUp)
    document.addEventListener('pointercancel', this.onDocPointerCancel)
  }

  private onDocPointerMove = (e: PointerEvent) => {
    const drag = this.pointerDrag
    if (!drag) return

    if (!drag.active) {
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (dx * dx + dy * dy < 64) return
      drag.active = true
      this.beginPointerDrag(drag)
    }

    if (drag.ghost) {
      drag.ghost.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`
    }

    const payload: PMDragPayload = {domain: 'passmanager', kind: 'group', id: drag.itemId}
    const hit = pmEntryMoveModel.hitTestDropTarget(e.clientX, e.clientY)
    if (hit && pmEntryMoveModel.canDropToTarget(hit.id, payload)) {
      pmEntryMoveModel.setDropTarget(hit.id)
    } else {
      pmEntryMoveModel.setDropTarget(null)
    }
  }

  private onDocPointerUp = (e: PointerEvent) => {
    const drag = this.pointerDrag
    if (!drag) {
      this.cleanupPointerListeners()
      return
    }

    if (drag.active) {
      const payload: PMDragPayload = {domain: 'passmanager', kind: 'group', id: drag.itemId}
      const hit = pmEntryMoveModel.hitTestDropTarget(e.clientX, e.clientY)
      if (hit && pmEntryMoveModel.canDropToTarget(hit.id, payload)) {
        void pmEntryMoveModel.dropToTarget(hit.id, payload)
      } else {
        pmEntryMoveModel.clearDragState()
      }
      this.endPointerDrag()
      const h = (ev: Event) => {
        ev.stopPropagation()
        ev.preventDefault()
        document.removeEventListener('click', h, true)
      }
      document.addEventListener('click', h, true)
      setTimeout(() => document.removeEventListener('click', h, true), 400)
    } else {
      this.cleanupPointerListeners()
    }

    this.pointerDrag = null
  }

  private onDocPointerCancel = () => {
    if (this.pointerDrag?.active) this.endPointerDrag()
    this.pointerDrag = null
    this.cleanupPointerListeners()
  }

  private preventNativeDrag = (e: DragEvent) => {
    if (this.pointerDrag) e.preventDefault()
  }

  private beginPointerDrag(drag: NonNullable<typeof this.pointerDrag>) {
    pmEntryMoveModel.startGroupDrag(drag.itemId)

    const root = this.getRoot()
    const group = root?.getGroup(drag.itemId)
    const fullName = group?.name || '?'
    const label = fullName.includes('/') ? fullName.slice(fullName.lastIndexOf('/') + 1) : fullName

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

  private endPointerDrag() {
    if (this.pointerDrag?.ghost) this.pointerDrag.ghost.remove()
    pmEntryMoveModel.clearDragState()
    document.body.style.userSelect = ''
    ;(document.body.style as any).webkitUserSelect = ''
    this.cleanupPointerListeners()
  }

  private cleanupPointerListeners() {
    document.removeEventListener('pointermove', this.onDocPointerMove)
    document.removeEventListener('pointerup', this.onDocPointerUp)
    document.removeEventListener('pointercancel', this.onDocPointerCancel)
  }

  // --- Native DnD receiving (fallback for external drops) ---

  private onDragOverTarget = (event: DragEvent, path: string | null) => {
    const targetId = this.resolveTargetId(path)
    if (!targetId) return

    const dragPayload = pmEntryMoveModel.readDragPayload(event.dataTransfer)
    const canDrop = pmEntryMoveModel.canDropToTarget(targetId, dragPayload)
    if (!canDrop) {
      pmEntryMoveModel.setDropTarget(null)
      return
    }

    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
    pmEntryMoveModel.setDropTarget(targetId)
  }

  private onDropTarget = (event: DragEvent, path: string | null) => {
    const targetId = this.resolveTargetId(path)
    if (!targetId) return

    event.preventDefault()
    event.stopPropagation()
    const dragPayload = pmEntryMoveModel.readDragPayload(event.dataTransfer)
    void pmEntryMoveModel.dropToTarget(targetId, dragPayload)
  }

  private onTreeDragLeave = (event: DragEvent) => {
    const related = event.relatedTarget
    if (
      related instanceof Node &&
      event.currentTarget instanceof HTMLElement &&
      event.currentTarget.contains(related)
    ) {
      return
    }
    pmEntryMoveModel.setDropTarget(null)
  }

  private renderGroup(item: GroupTreeRenderItem): TemplateResult {
    const {node, depth, row} = item
    const selected = pmGroupTreeModel.selectedPath() === node.path
    const hasChildren = node.children.length > 0
    const isEmpty = node.totalEntryCount === 0
    const targetId = this.resolveTargetId(node.path)
    const isDropTarget = targetId ? pmEntryMoveModel.dropTargetId() === targetId : false

    return html`
      <div
        class="tree-branch"
        data-tree-id=${row.id}
        ?data-delete-exiting=${row.deleteExiting === true}
        data-entering=${row.entering ?? nothing}
        aria-hidden=${row.deleteExiting ? 'true' : nothing}
        @animationend=${row.deleteExiting
          ? (event: AnimationEvent) => this.onDeleteAnimationEnd(event, row.id)
          : row.entering
            ? (event: AnimationEvent) => this.onEnterAnimationEnd(event, row.id)
            : undefined}
      >
        <div
          class="row ${selected ? 'selected' : ''} ${isEmpty ? 'empty-group' : ''} ${isDropTarget
            ? 'drop-target'
            : ''}"
          data-depth=${String(depth)}
          data-kind="group"
          role="button"
          tabindex="0"
          data-drop-target-id=${targetId ?? nothing}
          @pointerdown=${(e: PointerEvent) => this.onRowPointerDown(e, node.path)}
          @click=${() => this.onSelectGroup(node.path)}
          @keydown=${(event: KeyboardEvent) => this.onRowKeyDown(event, node.path)}
          @contextmenu=${(e: Event) => void this.onCreateGroup(e, node.path)}
          @dragstart=${this.preventNativeDrag}
          @dragover=${(event: DragEvent) => this.onDragOverTarget(event, node.path)}
          @dragenter=${(event: DragEvent) => this.onDragOverTarget(event, node.path)}
          @drop=${(event: DragEvent) => this.onDropTarget(event, node.path)}
        >
          ${hasChildren
            ? html`
                <cv-button unstyled
                  class="chevron ${node.expanded ? 'expanded' : ''}"
                  aria-label=${node.expanded
                    ? i18n('button:collapse_group')
                    : i18n('button:expand_group')}
                  @click=${(e: Event) => this.onToggle(e, node.path)}
                >
                  <cv-icon name="chevron-right"></cv-icon>
                </cv-button>
              `
            : html`<cv-button unstyled class="chevron" aria-hidden="true" button-tabindex="-1"></cv-button>`}

          <div class="label">
            ${this.renderNodeIcon(node)}
            <span class="name">${node.name}</span>
            <span class="count">${node.totalEntryCount}</span>
          </div>

          <div class="actions">
            <cv-button unstyled
              class="action-btn"
              @click=${(e: Event) => void this.onCreateGroup(e, node.path)}
              aria-label=${i18n('group:create:subgroup')}
            >
              <cv-icon name="plus"></cv-icon>
            </cv-button>
          </div>
        </div>
      </div>
    `
  }

  render() {
    const root = this.getRoot()
    if (!root) return nothing

    const tree = pmGroupTreeModel.tree()
    const selected = pmGroupTreeModel.selectedPath()
    const isRootDropTarget = pmEntryMoveModel.dropTargetId() === root.id
    const sourceItems = this.createTreeProjection(tree.groups)
    const previousRows: PMListMutationVisibleRow[] = this.lastTreeRows.map((row, index) => ({
      row,
      index,
    }))
    const sourceRows = sourceItems.map(({row}) => row)
    pmListMutationMotionModel.syncProjection(
      this.mutationScopeId,
      sourceRows,
      previousRows,
      sourceRows.length > 0 ? {first: 0, last: sourceRows.length - 1} : null,
    )
    const decoratedRows = pmListMutationMotionModel.decorateProjection(
      this.mutationScopeId,
      sourceRows,
    )
    const currentItems = new Map(sourceItems.map((item) => [item.row.id, item]))
    const renderItems = decoratedRows.flatMap((row) => {
      const item = currentItems.get(row.id) ?? this.lastTreeItems.get(row.id)
      return item ? [{...item, row}] : []
    })
    this.lastTreeRows = decoratedRows
    this.lastTreeItems = new Map(renderItems.map((item) => [item.row.id, item]))

    return html`
      <div class="tree" @dragleave=${this.onTreeDragLeave}>
        <div
          class="row ${selected === null ? 'selected' : ''} ${isRootDropTarget ? 'drop-target' : ''}"
          data-depth="0"
          data-kind="root"
          role="button"
          tabindex="0"
          data-drop-target-id=${root.id}
          @click=${this.onSelectRoot}
          @keydown=${(event: KeyboardEvent) => this.onRowKeyDown(event, null)}
          @contextmenu=${(e: Event) => void this.onCreateGroup(e, null)}
          @dragover=${(event: DragEvent) => this.onDragOverTarget(event, null)}
          @dragenter=${(event: DragEvent) => this.onDragOverTarget(event, null)}
          @drop=${(event: DragEvent) => this.onDropTarget(event, null)}
        >
          <cv-button unstyled class="chevron" aria-hidden="true" button-tabindex="-1"></cv-button>
          <div class="label">
            <cv-icon class="root-icon" name="folder2-open"></cv-icon>
            <span class="name root">${i18n('root:title-short')}</span>
            <span class="count">${tree.rootEntries.length}</span>
          </div>
        </div>

        ${repeat(
          renderItems,
          (item) => item.row.id,
          (item) => this.renderGroup(item),
        )}
      </div>
    `
  }

  private createTreeProjection(nodes: readonly GroupTreeNode[]): GroupTreeRenderItem[] {
    const items: GroupTreeRenderItem[] = []
    const append = (node: GroupTreeNode, depth: number) => {
      const group = this.resolveGroupByPath(node.path)
      const row: PMGroupRow = group
        ? {kind: 'group', id: node.id, item: group}
        : {kind: 'header', id: node.id, label: node.name, count: node.totalEntryCount}
      items.push({node, depth, row})
      if (node.expanded) {
        for (const child of node.children) append(child, depth + 1)
      }
    }
    for (const node of nodes) append(node, 0)
    return items
  }

  private onDeleteAnimationEnd(event: AnimationEvent, id: string): void {
    if (event.target !== event.currentTarget) return
    this.pendingExitIds.add(id)
    if (this.exitFrame !== null) return

    this.exitFrame = requestAnimationFrame(() => {
      this.exitFrame = null
      const ids = [...this.pendingExitIds]
      this.pendingExitIds.clear()
      void this.runTreeMutation(() => {
        pmListMutationMotionModel.completeExitBatch(this.mutationScopeId, ids)
      })
    })
  }

  private onEnterAnimationEnd(event: AnimationEvent, id: string): void {
    if (event.target !== event.currentTarget) return
    pmListMutationMotionModel.consumeEnter(this.mutationScopeId, id)
  }

  private finishReducedMotionRows(): void {
    const exitingIds = this.lastTreeRows.filter((row) => row.deleteExiting).map((row) => row.id)
    const enteringIds = this.lastTreeRows.filter((row) => row.entering).map((row) => row.id)
    const stagedIds = pmListMutationMotionModel.getStagedEnterIds(this.mutationScopeId)
    if (exitingIds.length > 0) {
      pmListMutationMotionModel.completeExitBatch(this.mutationScopeId, exitingIds)
    }
    if (stagedIds.length > 0) {
      pmListMutationMotionModel.revealEnterBatch(this.mutationScopeId, stagedIds)
      for (const id of stagedIds) pmListMutationMotionModel.consumeEnter(this.mutationScopeId, id)
    }
    for (const id of enteringIds) pmListMutationMotionModel.consumeEnter(this.mutationScopeId, id)
  }

  private scheduleStagedEnters(): void {
    if (this.enterFrame !== null) return
    const ids = pmListMutationMotionModel.getStagedEnterIds(this.mutationScopeId)
    if (ids.length === 0) return

    this.enterFrame = requestAnimationFrame(() => {
      this.enterFrame = null
      void this.runTreeMutation(() => {
        pmListMutationMotionModel.revealEnterBatch(this.mutationScopeId, ids)
      })
    })
  }

  private async runTreeMutation(update: () => void): Promise<void> {
    const before = this.captureTreeRects()
    const scope = this.renderRoot.querySelector<HTMLElement>('.tree')
    if (scope) scope.dataset['pmTreeTransition'] = 'true'
    const result = await elementScopedViewTransitionCoordinator.run({
      scope,
      enabled:
        typeof CSS !== 'undefined' && CSS.supports('view-transition-name', 'match-element'),
      update,
      settle: async () => {
        await this.updateComplete
      },
    })
    if (scope) delete scope.dataset['pmTreeTransition']
    if (result.state !== 'applied' && result.state !== 'joined-active' && !prefersReducedMotion()) {
      this.animateTreeCompaction(before)
    }
  }

  private captureTreeRects(): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>()
    for (const element of this.renderRoot.querySelectorAll<HTMLElement>('.tree-branch[data-tree-id]')) {
      if (element.hasAttribute('data-delete-exiting')) continue
      const id = element.dataset['treeId']
      if (id) rects.set(id, element.getBoundingClientRect())
    }
    return rects
  }

  private animateTreeCompaction(before: Map<string, DOMRect>): void {
    if (before.size === 0) return
    const style = getComputedStyle(this)
    const durationValue = style.getPropertyValue('--cv-duration-normal').trim()
    const duration = durationValue.endsWith('ms')
      ? Number.parseFloat(durationValue) || 250
      : (Number.parseFloat(durationValue) || 0.25) * 1000
    const easing = style.getPropertyValue('--cv-easing-decelerate').trim() || 'cubic-bezier(0, 0, 0.2, 1)'

    for (const element of this.renderRoot.querySelectorAll<HTMLElement>('.tree-branch[data-tree-id]')) {
      const id = element.dataset['treeId']
      const previous = id ? before.get(id) : undefined
      if (!previous || typeof element.animate !== 'function') continue

      const next = element.getBoundingClientRect()
      const deltaX = previous.left - next.left
      const deltaY = previous.top - next.top
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue
      element.animate(
        [{transform: `translate(${deltaX}px, ${deltaY}px)`}, {transform: 'translate(0, 0)'}],
        {duration, easing},
      )
    }
  }

  private renderNodeIcon(node: GroupTreeNode): TemplateResult {
    const letter = (node.name.trim().charAt(0) || '?').toUpperCase()
    return html`<pm-avatar-icon
      class="group-icon-image"
      .iconRef=${node.iconRef || ''}
      .letter=${letter}
      icon="folder"
    ></pm-avatar-icon>`
  }
}
