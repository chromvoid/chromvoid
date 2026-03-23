import {XLitElement} from '@statx/lit'

import {css, html, nothing, type TemplateResult} from 'lit'

import {CVIcon} from '@chromvoid/uikit'
import {Group, i18n} from '@project/passmanager'
import {hostContentContainStyles} from 'root/shared/ui/shared-styles'

import type {GroupTreeNode} from '../../models/group-tree'
import {pmGroupTreeModel} from '../../models/pm-group-tree-model'
import {pmEntryMoveModel, type PMDragPayload} from '../../models/pm-entry-move-model'

export class GroupTreeView extends XLitElement {
  static define() {
    customElements.define('group-tree-view', this)
    CVIcon.define()
  }

  static styles = [
    hostContentContainStyles,
    css`
      :host {
        user-select: none;
      }

      .tree {
        display: grid;
        gap: 1px;
        padding: 2px;
      }

      .row {
        --indent: 0;
        position: relative;
        display: grid;
        grid-template-columns: 18px 1fr min-content;
        align-items: center;
        gap: calc(var(--cv-space-2) * 0.5);
        padding-block: calc(var(--cv-space-2) * 0.75);
        padding-inline-start: calc(var(--cv-space-2) + (var(--indent) * 12px));
        padding-inline-end: calc(var(--cv-space-2));
        border-radius: var(--cv-radius-2);
        border: 1px solid transparent;
        background: transparent;
        cursor: pointer;
        transition: background-color var(--cv-duration-fast) var(--cv-easing-standard);
      }

      .row * {
        -webkit-user-drag: none;
      }

      .row.empty-group {
        opacity: 0.55;
      }

      .row.empty-group .name {
        color: var(--cv-color-text-muted);
      }

      .row:hover {
        background: var(--cv-color-surface-2);
      }

      .row.selected {
        background: color-mix(in oklch, var(--cv-color-primary-muted) 15%, transparent);
      }

      .row.selected::before {
        content: '';
        position: absolute;
        left: -1px;
        top: 6px;
        bottom: 6px;
        width: 3px;
        border-radius: 3px;
        background: var(--cv-color-primary);
      }

      .row.drop-target {
        border-color: var(--cv-color-primary);
        background: color-mix(in oklch, var(--cv-color-primary) 18%, var(--cv-color-surface-2));
        box-shadow: 0 0 0 1px color-mix(in oklch, var(--cv-color-primary) 40%, transparent);
      }

      .row.selected:hover {
        background: color-mix(in oklch, var(--cv-color-primary-muted) 25%, transparent);
      }

      .label {
        display: flex;
        align-items: center;
        gap: calc(var(--cv-space-2) * 0.75);
        min-width: 0;
      }

      .name {
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-medium);
        color: var(--cv-color-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .group-icon-image {
        width: 18px;
        height: 18px;
        --pm-avatar-radius: 5px;
        --pm-avatar-image-fit: contain;
        --pm-avatar-image-padding: 2px;
        --pm-avatar-contrast: calc(var(--pm-avatar-contrast-base) + 2%);
        --pm-avatar-shadow-opacity: 30%;
        --pm-avatar-icon-size: 16px;
      }

      .row.selected .group-icon-image {
        --pm-avatar-contrast: calc(var(--pm-avatar-contrast-base) + 8%);
        --pm-avatar-border-source: transparent;
        --pm-avatar-shadow-opacity: 20%;
      }

      .row.selected .name {
        color: var(--cv-color-text);
        font-weight: 600;
      }

      .count {
        font-size: 0.65rem;
        color: var(--cv-color-text-muted);
        background: transparent;
        padding-block: 1px;
        padding-inline: 4px;
      }

      .row.selected .count {
        color: var(--cv-color-primary);
        background: color-mix(in oklch, var(--cv-color-primary) 15%, transparent);
        border-radius: var(--cv-radius-1);
      }

      .root {
        font-style: italic;
        opacity: 0.9;
      }

      .chevron {
        width: 18px;
        height: 18px;
        border: none;
        background: transparent;
        padding: 0;
        margin: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--cv-color-text-muted);
        cursor: pointer;
        transition: transform var(--cv-duration-fast) var(--cv-easing-standard);
      }

      .chevron.expanded {
        transform: rotate(90deg);
      }

      .chevron[aria-hidden='true'] {
        cursor: default;
      }

      .chevron cv-icon {
        width: 12px;
        height: 12px;
      }

      .actions {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        opacity: 0;
        pointer-events: none;
        transform: translateX(6px);
      }

      .row:hover .actions,
      .row:focus-within .actions {
        opacity: 1;
        pointer-events: auto;
        transform: translateX(0);
      }

      .action-btn {
        width: 22px;
        height: 22px;
        border-radius: var(--cv-radius-1);
        border: 1px solid transparent;
        background: color-mix(in oklch, var(--cv-color-surface-2) 80%, var(--cv-color-primary) 20%);
        color: var(--cv-color-text);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .action-btn:hover {
        background: var(--cv-color-primary);
        color: white;
        border-color: var(--cv-color-primary);
        transform: scale(1.08);
      }

      .action-btn cv-icon {
        width: 12px;
        height: 12px;
      }

      @container (max-width: 280px) {
        .count {
          display: none;
        }
      }
    `,
  ]

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

  private resolveTargetId(path: string | null): string | null {
    const root = window.passmanager
    if (!root) return null
    if (!path) return root.id

    const group = this.resolveGroupByPath(path)
    return group?.id ?? null
  }

  private resolveGroupByPath(path: string): Group | null {
    const root = window.passmanager
    if (!root) return null

    const group = root
      .entriesList()
      .find((item): item is Group => item instanceof Group && item.name === path)

    return group ?? null
  }

  private isGroupDragEnabled(path: string): boolean {
    const root = window.passmanager
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
    super.disconnectedCallback()
    pmEntryMoveModel.unregisterDropZone(this.renderRoot as ShadowRoot)
    if (this.pointerDrag?.active) this.endPointerDrag()
    this.pointerDrag = null
    this.cleanupPointerListeners()
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

    const payload: PMDragPayload = {kind: 'group', id: drag.itemId}
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
      const payload: PMDragPayload = {kind: 'group', id: drag.itemId}
      const hit = pmEntryMoveModel.hitTestDropTarget(e.clientX, e.clientY)
      if (hit && pmEntryMoveModel.canDropToTarget(hit.id, payload)) {
        pmEntryMoveModel.dropToTarget(hit.id, payload)
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

    const root = window.passmanager
    const group = root?.getGroup(drag.itemId)
    const fullName = group?.name || '?'
    const label = fullName.includes('/') ? fullName.slice(fullName.lastIndexOf('/') + 1) : fullName

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
    pmEntryMoveModel.dropToTarget(targetId, dragPayload)
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

  private renderGroup(node: GroupTreeNode, depth: number): TemplateResult {
    const selected = pmGroupTreeModel.selectedPath() === node.path
    const hasChildren = node.children.length > 0
    const isEmpty = node.totalEntryCount === 0
    const targetId = this.resolveTargetId(node.path)
    const isDropTarget = targetId ? pmEntryMoveModel.dropTargetId() === targetId : false

    return html`
      <div
        class="row ${selected ? 'selected' : ''} ${isEmpty ? 'empty-group' : ''} ${isDropTarget
          ? 'drop-target'
          : ''}"
        style=${`--indent:${depth}`}
        role="button"
        tabindex="0"
        data-drop-target-id=${targetId ?? nothing}
        @pointerdown=${(e: PointerEvent) => this.onRowPointerDown(e, node.path)}
        @click=${() => this.onSelectGroup(node.path)}
        @contextmenu=${(e: Event) => void this.onCreateGroup(e, node.path)}
        @dragstart=${this.preventNativeDrag}
        @dragover=${(event: DragEvent) => this.onDragOverTarget(event, node.path)}
        @dragenter=${(event: DragEvent) => this.onDragOverTarget(event, node.path)}
        @drop=${(event: DragEvent) => this.onDropTarget(event, node.path)}
      >
        ${hasChildren
          ? html`
              <button
                class="chevron ${node.expanded ? 'expanded' : ''}"
                aria-label=${node.expanded ? i18n('button:collapse_group') : i18n('button:expand_group')}
                @click=${(e: Event) => this.onToggle(e, node.path)}
              >
                <cv-icon name="chevron-right"></cv-icon>
              </button>
            `
          : html`<button class="chevron" aria-hidden="true" tabindex="-1"></button>`}

        <div class="label">
          ${this.renderNodeIcon(node)}
          <span class="name">${node.name}</span>
          <span class="count">${node.totalEntryCount}</span>
        </div>

        <div class="actions">
          <button
            class="action-btn"
            @click=${(e: Event) => void this.onCreateGroup(e, node.path)}
            aria-label=${i18n('group:create:subgroup')}
          >
            <cv-icon name="plus"></cv-icon>
          </button>
        </div>
      </div>

      ${hasChildren && node.expanded
        ? html`${node.children.map((c) => this.renderGroup(c, depth + 1))}`
        : nothing}
    `
  }

  render() {
    if (!window.passmanager) return nothing

    const tree = pmGroupTreeModel.tree()
    const selected = pmGroupTreeModel.selectedPath()
    const isRootDropTarget = pmEntryMoveModel.dropTargetId() === window.passmanager.id

    return html`
      <div class="tree" @dragleave=${this.onTreeDragLeave}>
        <div
          class="row ${selected === null ? 'selected' : ''} ${isRootDropTarget ? 'drop-target' : ''}"
          style="--indent:0"
          role="button"
          tabindex="0"
          data-drop-target-id=${window.passmanager.id}
          @click=${this.onSelectRoot}
          @contextmenu=${(e: Event) => void this.onCreateGroup(e, null)}
          @dragover=${(event: DragEvent) => this.onDragOverTarget(event, null)}
          @dragenter=${(event: DragEvent) => this.onDragOverTarget(event, null)}
          @drop=${(event: DragEvent) => this.onDropTarget(event, null)}
        >
          <button class="chevron" aria-hidden="true" tabindex="-1"></button>
          <div class="label">
            <cv-icon name="folder2-open" style="width:16px;height:16px"></cv-icon>
            <span class="name root">/</span>
            <span class="count">${tree.rootEntries.length}</span>
          </div>
          <div class="actions">
            <button
              class="action-btn"
              @click=${(e: Event) => void this.onCreateGroup(e, null)}
              aria-label=${i18n('group:create:title')}
            >
              <cv-icon name="plus"></cv-icon>
            </button>
          </div>
        </div>

        ${tree.groups.map((g) => this.renderGroup(g, 0))}
      </div>
    `
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
