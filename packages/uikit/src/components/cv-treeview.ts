import {createTreeview, type TreeNode, type TreeviewModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'
import {CVTreeItem} from './cv-treeitem'

export interface CVTreeviewEventDetail {
  value: string | null
  values: string[]
  activeId: string | null
  expandedValues: string[]
}

interface TreeItemRecord {
  id: string
  parentId: string | null
  branch: boolean
  element: CVTreeItem
}

interface TreeviewSnapshot {
  selectedIds: string[]
  activeId: string | null
  expandedIds: string[]
}

const treeviewKeysToPrevent = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'Enter',
  ' ',
  'Spacebar',
])

const arraysEqual = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

let cvTreeviewNonce = 0

export class CVTreeview extends ReatomLitElement {
  static elementName = 'cv-treeview'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      values: {attribute: false},
      expandedValues: {attribute: false},
      selectionMode: {type: String, attribute: 'selection-mode', reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
    }
  }

  declare value: string
  declare values: string[]
  declare expandedValues: string[]
  declare selectionMode: 'single' | 'multiple'
  declare ariaLabel: string

  private readonly idBase = `cv-treeview-${++cvTreeviewNonce}`
  private itemRecords: TreeItemRecord[] = []
  private itemListeners = new WeakMap<CVTreeItem, {click: EventListener; focus: EventListener; toggle: EventListener}>()
  private model: TreeviewModel

  constructor() {
    super()
    this.value = ''
    this.values = []
    this.expandedValues = []
    this.selectionMode = 'single'
    this.ariaLabel = ''
    this.model = createTreeview({
      idBase: this.idBase,
      nodes: [],
    })
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-space-1, 4px);
        padding: var(--cv-space-1, 4px);
        border-radius: var(--cv-radius-md, 10px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.rebuildModelFromSlot(false, false)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.detachItemListeners()
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('selectionMode') || changedProperties.has('ariaLabel')) {
      this.rebuildModelFromSlot(true, false)
      return
    }

    if (changedProperties.has('value') && this.selectionMode === 'single') {
      const normalized = this.value.trim()
      if (this.value !== normalized) {
        this.value = normalized
      }

      if (normalized.length === 0) {
        this.model.actions.clearSelected()
      } else {
        this.model.actions.select(normalized)
      }

      this.applyProgrammaticChange()
    }

    if (changedProperties.has('values') && this.selectionMode === 'multiple') {
      this.setSelectedIdsInModel(this.values)
      this.applyProgrammaticChange()
    }

    if (changedProperties.has('expandedValues')) {
      this.setExpandedIdsInModel(this.expandedValues)
      this.applyProgrammaticChange()
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    if (!changedProperties.has('value') && !changedProperties.has('values') && !changedProperties.has('expandedValues')) {
      this.syncItemElements()
    }
  }

  private getDirectChildTreeItems(container: ParentNode): CVTreeItem[] {
    return Array.from((container as Element).children ?? []).filter(
      (element): element is CVTreeItem => element.tagName.toLowerCase() === CVTreeItem.elementName,
    )
  }

  private ensureItemValue(item: CVTreeItem, index: number): string {
    const normalized = item.value?.trim()
    if (normalized) return normalized

    const fallback = `item-${index + 1}`
    item.value = fallback
    return fallback
  }

  private parseTreeNodes(container: ParentNode, parentId: string | null, depth: number): TreeNode[] {
    const items = this.getDirectChildTreeItems(container)

    return items.map((item, index) => {
      const id = this.ensureItemValue(item, index)
      const children = this.parseTreeNodes(item, id, depth + 1)

      this.itemRecords.push({
        id,
        parentId,
        branch: children.length > 0,
        element: item,
      })

      if (parentId != null) {
        item.slot = 'children'
      } else {
        item.slot = ''
      }

      return {
        id,
        label: item.label || item.textContent?.trim() || id,
        disabled: item.disabled,
        children,
      }
    })
  }

  private rebuildModelFromSlot(preserveState: boolean, requestRender = true): void {
    const previous = preserveState ? this.captureSnapshot() : null

    this.detachItemListeners()
    this.itemRecords = []

    const nodes = this.parseTreeNodes(this, null, 1)
    const validIds = new Set(this.itemRecords.map((record) => record.id))

    const initialExpandedIds = (previous?.expandedIds ?? this.expandedValues).filter((id) => validIds.has(id))
    const initialSelectedIds =
      this.selectionMode === 'multiple'
        ? (previous?.selectedIds ?? this.values).filter((id) => validIds.has(id))
        : [previous?.selectedIds[0] ?? this.value].filter((id): id is string => typeof id === 'string' && validIds.has(id))

    const initialActiveIdCandidate = previous?.activeId ?? initialSelectedIds[0] ?? null
    const initialActiveId = initialActiveIdCandidate && validIds.has(initialActiveIdCandidate) ? initialActiveIdCandidate : null

    this.model = createTreeview({
      idBase: this.idBase,
      nodes,
      selectionMode: this.selectionMode,
      ariaLabel: this.ariaLabel || undefined,
      initialExpandedIds,
      initialSelectedIds,
      initialActiveId,
    })

    this.attachItemListeners()
    this.syncItemElements()
    this.syncControlledValuesFromModel()

    if (requestRender) {
      this.requestUpdate()
    }
  }

  private detachItemListeners(): void {
    for (const record of this.itemRecords) {
      const listeners = this.itemListeners.get(record.element)
      if (!listeners) continue

      record.element.removeEventListener('click', listeners.click)
      record.element.removeEventListener('focus', listeners.focus)
      record.element.removeEventListener('cv-treeitem-toggle', listeners.toggle)
      this.itemListeners.delete(record.element)
    }
  }

  private attachItemListeners(): void {
    for (const record of this.itemRecords) {
      const click = () => {
        this.handleItemClick(record.id)
      }

      const focus = () => {
        this.handleItemFocus(record.id)
      }

      const toggle = (event: Event) => {
        event.stopPropagation()
        this.handleItemToggle(record.id)
      }

      record.element.addEventListener('click', click)
      record.element.addEventListener('focus', focus)
      record.element.addEventListener('cv-treeitem-toggle', toggle)
      this.itemListeners.set(record.element, {click, focus, toggle})
    }
  }

  private syncItemElements(): void {
    const visibleIds = new Set(this.model.contracts.getVisibleNodeIds())

    for (const record of this.itemRecords) {
      const props = this.model.contracts.getItemProps(record.id)

      record.element.id = props.id
      record.element.setAttribute('role', props.role)
      record.element.setAttribute('tabindex', props.tabindex)
      record.element.setAttribute('aria-level', String(props['aria-level']))
      record.element.setAttribute('aria-posinset', String(props['aria-posinset']))
      record.element.setAttribute('aria-setsize', String(props['aria-setsize']))
      record.element.setAttribute('aria-selected', props['aria-selected'])
      record.element.setAttribute('data-active', props['data-active'])

      if (props['aria-expanded']) {
        record.element.setAttribute('aria-expanded', props['aria-expanded'])
      } else {
        record.element.removeAttribute('aria-expanded')
      }

      if (props['aria-disabled']) {
        record.element.setAttribute('aria-disabled', props['aria-disabled'])
      } else {
        record.element.removeAttribute('aria-disabled')
      }

      if (props['data-expanded']) {
        record.element.setAttribute('data-expanded', props['data-expanded'])
      } else {
        record.element.removeAttribute('data-expanded')
      }

      record.element.active = props['data-active'] === 'true'
      record.element.selected = props['aria-selected'] === 'true'
      record.element.expanded = props['aria-expanded'] === 'true'
      record.element.branch = record.branch
      record.element.level = props['aria-level']
      record.element.disabled = props['aria-disabled'] === 'true'
      record.element.hidden = !visibleIds.has(record.id)
    }
  }

  private syncControlledValuesFromModel(): void {
    const selected = [...this.model.state.selectedIds()]
    const expanded = [...this.model.state.expandedIds()]

    this.values = selected
    this.value = selected[0] ?? ''
    this.expandedValues = expanded
  }

  private setSelectedIdsInModel(ids: readonly string[]): void {
    const deduped = [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))]

    if (this.selectionMode === 'single') {
      const id = deduped[0]
      if (!id) {
        this.model.actions.clearSelected()
        return
      }

      this.model.actions.select(id)
      return
    }

    const previousActiveId = this.model.state.activeId()
    this.model.actions.clearSelected()
    for (const id of deduped) {
      this.model.actions.toggleSelected(id)
    }

    if (previousActiveId) {
      this.model.actions.setActive(previousActiveId)
    }
  }

  private setExpandedIdsInModel(ids: readonly string[]): void {
    const nextSet = new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))
    const current = this.model.state.expandedIds()

    for (const id of current) {
      if (!nextSet.has(id)) {
        this.model.actions.collapse(id)
      }
    }

    for (const id of nextSet) {
      if (!current.includes(id)) {
        this.model.actions.expand(id)
      }
    }
  }

  private captureSnapshot(): TreeviewSnapshot {
    return {
      selectedIds: [...this.model.state.selectedIds()],
      activeId: this.model.state.activeId(),
      expandedIds: [...this.model.state.expandedIds()],
    }
  }

  private dispatchInput(detail: CVTreeviewEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVTreeviewEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private focusActiveItem(): void {
    const activeId = this.model.state.activeId()
    if (!activeId) return

    const activeRecord = this.itemRecords.find((record) => record.id === activeId)
    activeRecord?.element.focus()
  }

  private applyProgrammaticChange(): void {
    this.syncItemElements()
    this.syncControlledValuesFromModel()
  }

  private applyInteractionResult(previous: TreeviewSnapshot): void {
    this.syncItemElements()

    const next = this.captureSnapshot()
    this.syncControlledValuesFromModel()

    const selectedChanged = !arraysEqual(previous.selectedIds, next.selectedIds)
    const activeChanged = previous.activeId !== next.activeId
    const expandedChanged = !arraysEqual(previous.expandedIds, next.expandedIds)

    if (!selectedChanged && !activeChanged && !expandedChanged) return

    const detail: CVTreeviewEventDetail = {
      value: this.value || null,
      values: [...this.values],
      activeId: next.activeId,
      expandedValues: [...this.expandedValues],
    }

    this.dispatchInput(detail)
    if (selectedChanged || expandedChanged) {
      this.dispatchChange(detail)
    }

    if (activeChanged) {
      this.focusActiveItem()
    }
  }

  private handleItemClick(id: string): void {
    const previous = this.captureSnapshot()
    this.model.actions.setActive(id)

    if (this.selectionMode === 'multiple') {
      this.model.actions.toggleSelected(id)
    } else {
      this.model.actions.select(id)
    }

    this.applyInteractionResult(previous)
  }

  private handleItemFocus(id: string): void {
    const previous = this.captureSnapshot()
    this.model.actions.setActive(id)
    this.applyInteractionResult(previous)
  }

  private handleItemToggle(id: string): void {
    const previous = this.captureSnapshot()
    this.model.actions.toggleExpanded(id)
    this.applyInteractionResult(previous)
  }

  private handleTreeKeyDown(event: KeyboardEvent) {
    if (treeviewKeysToPrevent.has(event.key)) {
      event.preventDefault()
    }

    const previous = this.captureSnapshot()
    this.model.actions.handleKeyDown({
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
    })

    this.applyInteractionResult(previous)
  }

  private handleSlotChange() {
    this.rebuildModelFromSlot(true, true)
  }

  protected override render() {
    const treeProps = this.model.contracts.getTreeProps()

    return html`
      <div
        role=${treeProps.role}
        tabindex=${treeProps.tabindex}
        aria-label=${treeProps['aria-label'] ?? nothing}
        aria-multiselectable=${treeProps['aria-multiselectable'] ?? nothing}
        part="base"
        @keydown=${this.handleTreeKeyDown}
      >
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
    `
  }
}
