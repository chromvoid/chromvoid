import {
  createTreegrid,
  type TreegridCellId,
  type TreegridCellRole,
  type TreegridModel,
  type TreegridRow,
  type TreegridSelectionMode,
} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'
import {CVTreegridCell} from './cv-treegrid-cell'
import {CVTreegridColumn} from './cv-treegrid-column'
import {CVTreegridRow} from './cv-treegrid-row'

export interface CVTreegridEventDetail {
  value: string | null
  activeCell: TreegridCellId | null
  selectedValues: string[]
  expandedValues: string[]
}

interface TreegridColumnRecord {
  id: string
  index?: number
  disabled: boolean
  cellRole: TreegridCellRole
  element: CVTreegridColumn
}

interface TreegridRowRecord {
  id: string
  index?: number
  disabled: boolean
  parentId: string | null
  children: string[]
  element: CVTreegridRow
}

interface TreegridCellRecord {
  rowId: string
  colId: string
  disabled: boolean
  valid: boolean
  element: CVTreegridCell
}

interface TreegridSnapshot {
  activeCellId: TreegridCellId | null
  selectedRowIds: string[]
  expandedRowIds: string[]
}

const keysToPrevent = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ', 'Spacebar'])

const cellKey = (rowId: string, colId: string): string => `${rowId}::${colId}`

const sameSetMembers = (left: readonly string[], right: readonly string[]) => {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((value) => rightSet.has(value))
}

const sameCellId = (left: TreegridCellId | null, right: TreegridCellId | null) =>
  left?.rowId === right?.rowId && left?.colId === right?.colId

const unique = (values: readonly string[]): string[] => [...new Set(values)]

let cvTreegridNonce = 0

export class CVTreegrid extends ReatomLitElement {
  static elementName = 'cv-treegrid'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      selectedValues: {attribute: false},
      expandedValues: {attribute: false},
      selectionMode: {type: String, attribute: 'selection-mode', reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
      ariaLabelledBy: {type: String, attribute: 'aria-labelledby'},
    }
  }

  declare value: string
  declare selectedValues: string[]
  declare expandedValues: string[]
  declare selectionMode: TreegridSelectionMode
  declare ariaLabel: string
  declare ariaLabelledBy: string

  private readonly idBase = `cv-treegrid-${++cvTreegridNonce}`
  private columnRecords: TreegridColumnRecord[] = []
  private rowRecords: TreegridRowRecord[] = []
  private cellRecords: TreegridCellRecord[] = []
  private columnById = new Map<string, TreegridColumnRecord>()
  private rowById = new Map<string, TreegridRowRecord>()
  private cellListeners = new WeakMap<CVTreegridCell, {focus: EventListener; click: EventListener}>()
  private model: TreegridModel
  private _programmaticChange = false

  constructor() {
    super()
    this.value = ''
    this.selectedValues = []
    this.expandedValues = []
    this.selectionMode = 'single'
    this.ariaLabel = ''
    this.ariaLabelledBy = ''
    this.model = createTreegrid({
      idBase: this.idBase,
      rows: [],
      columns: [],
    })
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      [part='base'] {
        display: block;
        border: 1px solid var(--cv-color-border, #2a3245);
        border-radius: var(--cv-radius-md, 10px);
        overflow: auto;
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
    this.detachCellListeners()
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('selectionMode') || changedProperties.has('ariaLabel') || changedProperties.has('ariaLabelledBy')) {
      this.rebuildModelFromSlot(true, false)
      return
    }

    if (changedProperties.has('value')) {
      const value = this.parseCellValue(this.value.trim())
      const next = value ?? null
      if (next && !sameCellId(next, this.model.state.activeCellId())) {
        const previous = this.captureSnapshot()
        this._programmaticChange = true
        this.setActiveCell(next)
        this.applyInteractionResult(previous)
        this._programmaticChange = false
      }
    }

    if (changedProperties.has('selectedValues')) {
      const previous = this.captureSnapshot()
      const next = this.normalizeRowIds(this.selectedValues)
      if (!sameSetMembers(next, previous.selectedRowIds)) {
        this._programmaticChange = true
        if (this.selectionMode === 'single') {
          const nextSingle = next.slice(0, 1)
          this.setSelectedRows(nextSingle)
        } else {
          this.setSelectedRows(next)
        }

        this.applyInteractionResult(previous)
        this._programmaticChange = false
      }
    }

    if (changedProperties.has('expandedValues')) {
      const previous = this.captureSnapshot()
      const next = this.normalizeExpandedValues(this.expandedValues)
      if (!sameSetMembers(next, previous.expandedRowIds)) {
        this._programmaticChange = true
        this.setExpandedRows(next)
        this.applyInteractionResult(previous)
        this._programmaticChange = false
      }
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)

    if (!changedProperties.has('value') && !changedProperties.has('selectedValues') && !changedProperties.has('expandedValues')) {
      this.syncElementsFromModel()
      return
    }

    if (!changedProperties.has('value')) {
      this.syncElementsFromModel()
    }
  }

  private getColumnElements(): CVTreegridColumn[] {
    return Array.from(this.children).filter(
      (element): element is CVTreegridColumn => element.tagName.toLowerCase() === CVTreegridColumn.elementName,
    )
  }

  private getRowElements(container: ParentNode): CVTreegridRow[] {
    return Array.from((container as Element).children).filter(
      (element): element is CVTreegridRow => element.tagName.toLowerCase() === CVTreegridRow.elementName,
    )
  }

  private getCellElements(row: CVTreegridRow): CVTreegridCell[] {
    return Array.from(row.children).filter(
      (element): element is CVTreegridCell => element.tagName.toLowerCase() === CVTreegridCell.elementName,
    )
  }

  private resolveIndex(value: number): number | undefined {
    if (!Number.isFinite(value) || value < 1) {
      return undefined
    }

    return Math.floor(value)
  }

  private ensureColumnValue(column: CVTreegridColumn, index: number): string {
    const normalized = column.value?.trim()
    if (normalized) return normalized

    const fallback = `column-${index + 1}`
    column.value = fallback
    return fallback
  }

  private ensureRowValue(row: CVTreegridRow, index: number): string {
    const normalized = row.value?.trim()
    if (normalized) return normalized

    const fallback = `row-${index + 1}`
    row.value = fallback
    return fallback
  }

  private resolveCellColumn(cell: CVTreegridCell, index: number): string {
    const normalized = cell.column?.trim()
    if (normalized && this.columnById.has(normalized)) {
      return normalized
    }

    const fallback = this.columnRecords[index]?.id
    return fallback ?? ''
  }

  private parseCellValue(value: string): TreegridCellId | null {
    const [rowId, colId, ...rest] = value.split('::')
    if (rest.length > 0 || !rowId || !colId) return null

    return {rowId, colId}
  }

  private cellIdToString(cell: TreegridCellId | null): string {
    if (!cell) return ''
    return cellKey(cell.rowId, cell.colId)
  }

  private normalizeRowIds(values: readonly string[]): string[] {
    const rows = values
      .map((value) => value.trim())
      .filter((value) => value.length > 0)

    return unique(rows).filter((id) => this.rowById.has(id))
  }

  private normalizeExpandedValues(values: readonly string[]): string[] {
    const ids = values
      .map((value) => value.trim())
      .filter((value) => value.length > 0)

    return unique(ids).filter((id) => this.rowById.has(id))
  }

  private captureSnapshot(): TreegridSnapshot {
    return {
      activeCellId: this.model.state.activeCellId(),
      selectedRowIds: [...this.model.state.selectedRowIds()],
      expandedRowIds: [...this.model.state.expandedRowIds()],
    }
  }

  private rebuildModelFromSlot(preserveState: boolean, requestUpdate = true): void {
    const fallbackSelection = this.normalizeRowIds(this.selectedValues)
    const fallbackExpanded = this.normalizeExpandedValues(this.expandedValues)
    const fallbackActive = this.parseCellValue(this.value.trim())
    const previous = preserveState
      ? this.captureSnapshot()
      : {
          activeCellId: fallbackActive,
          selectedRowIds: this.selectionMode === 'single' ? fallbackSelection.slice(0, 1) : fallbackSelection,
          expandedRowIds: fallbackExpanded,
        }

    this.detachCellListeners()
    this.columnRecords = []
    this.rowRecords = []
    this.cellRecords = []
    this.columnById.clear()
    this.rowById.clear()

    this.parseColumns()
    const rows = this.parseRows(this)

    const validCells = this.cellRecords.filter((record) => record.valid)

    const nextActive = previous.activeCellId
      ? previous.activeCellId
      : this.value.trim()
          ? this.parseCellValue(this.value)
          : null

    const selectedFromState = this.selectionMode === 'single' ? previous.selectedRowIds.slice(0, 1) : previous.selectedRowIds

    this.model = createTreegrid({
      idBase: this.idBase,
      rows,
      columns: this.columnRecords.map((column) => ({
        id: column.id,
        index: column.index,
        disabled: column.disabled,
        cellRole: column.cellRole,
      })),
      disabledCells: validCells
        .filter((cell) => cell.disabled)
        .map((cell) => ({rowId: cell.rowId, colId: cell.colId})),
      selectionMode: this.selectionMode,
      ariaLabel: this.ariaLabel || undefined,
      ariaLabelledBy: this.ariaLabelledBy || undefined,
      initialActiveCellId: this.normalizeActiveCell(nextActive, validCells),
      initialSelectedRowIds: this.selectionMode === 'single'
        ? this.normalizeRowIds(selectedFromState).slice(0, 1)
        : this.normalizeRowIds(selectedFromState),
      initialExpandedRowIds: this.normalizeExpandedValues(previous.expandedRowIds),
    })

    this.attachCellListeners()
    this.syncElementsFromModel()
    this.syncControlledValuesFromModel()

    if (requestUpdate) {
      this.requestUpdate()
    }
  }

  private parseColumns(): void {
    this.columnRecords = this.getColumnElements().map((element, index) => {
      const id = this.ensureColumnValue(element, index)

      return {
        id,
        index: this.resolveIndex(element.index),
        disabled: element.disabled,
        cellRole: element.cellRole,
        element,
      }
    })

    this.columnById = new Map(this.columnRecords.map((column) => [column.id, column]))
  }

  private parseRows(container: ParentNode, parentId: string | null = null): TreegridRow[] {
    return this.getRowElements(container).map((rowElement, rowIndex) => {
      const id = this.ensureRowValue(rowElement, rowIndex)
      const parsedChildren = this.parseRows(rowElement, id)
      const childIds = parsedChildren.map((child) => child.id)

      if (parentId != null) {
        rowElement.slot = 'children'
      } else {
        rowElement.slot = ''
      }

      const record: TreegridRowRecord = {
        id,
        index: this.resolveIndex(rowElement.index),
        disabled: rowElement.disabled,
        parentId,
        children: childIds,
        element: rowElement,
      }

      this.rowRecords.push(record)
      this.rowById.set(id, record)

      const rowCells = this.getCellElements(rowElement).map((cell, cellIndex) => {
        const colId = this.resolveCellColumn(cell, cellIndex)
        const valid = this.columnById.has(colId)

        return {
          rowId: id,
          colId,
          disabled: cell.disabled,
          valid,
          element: cell,
        }
      })

      this.cellRecords.push(...rowCells)
      return {
        id,
        index: this.resolveIndex(rowElement.index),
        disabled: rowElement.disabled,
        children: parsedChildren,
      } as TreegridRow
    })
  }

  private normalizeActiveCell(
    candidate: TreegridCellId | null,
    validCells: TreegridCellRecord[],
  ): TreegridCellId | null {
    if (!candidate) return null
    const key = this.cellKey(candidate)
    if (!validCells.some((cell) => this.cellKey(cell) === key && cell.valid)) {
      return null
    }

    return candidate
  }

  private cellKey(cell: Pick<TreegridCellRecord, 'rowId' | 'colId'>): string {
    return cellKey(cell.rowId, cell.colId)
  }

  private detachCellListeners(): void {
    for (const record of this.cellRecords) {
      const listeners = this.cellListeners.get(record.element)
      if (!listeners) continue

      record.element.removeEventListener('focus', listeners.focus)
      record.element.removeEventListener('click', listeners.click)
      this.cellListeners.delete(record.element)
    }
  }

  private attachCellListeners(): void {
    for (const record of this.cellRecords) {
      if (!record.valid) continue

      const focus = () => this.handleCellFocus(record)
      const click = (event: Event) => this.handleCellPointer(event as MouseEvent, record)

      record.element.addEventListener('focus', focus)
      record.element.addEventListener('click', click)
      this.cellListeners.set(record.element, {focus, click})
    }
  }

  private getVisibleRowIds(expandedRowIds: ReadonlySet<string>): Set<string> {
    const visible = new Set<string>()
    const roots = this.rowRecords.filter((record) => record.parentId == null)

    const visit = (rowId: string) => {
      const row = this.rowById.get(rowId)
      if (!row) return

      visible.add(rowId)
      if (!expandedRowIds.has(rowId)) return

      for (const childId of row.children) {
        visit(childId)
      }
    }

    for (const row of roots) {
      visit(row.id)
    }

    return visible
  }

  private syncElementsFromModel(): void {
    if (!this.model) return

    const visibleRows = this.getVisibleRowIds(this.model.state.expandedRowIds())
    const columnCount = String(this.model.state.columnCount())

    for (const record of this.rowRecords) {
      const rowProps = this.model.contracts.getRowProps(record.id)

      record.element.style.setProperty('--cv-treegrid-column-count', columnCount)
      record.element.id = rowProps.id
      record.element.setAttribute('role', rowProps.role)
      record.element.setAttribute('aria-level', String(rowProps['aria-level']))
      record.element.setAttribute('aria-posinset', String(rowProps['aria-posinset']))
      record.element.setAttribute('aria-setsize', String(rowProps['aria-setsize']))
      record.element.setAttribute('aria-rowindex', String(rowProps['aria-rowindex']))
      record.element.setAttribute('aria-selected', rowProps['aria-selected'])
      record.element.setAttribute('tabindex', '-1')

      if (rowProps['aria-expanded']) {
        record.element.setAttribute('aria-expanded', rowProps['aria-expanded'])
      } else {
        record.element.removeAttribute('aria-expanded')
      }

      if (rowProps['aria-disabled']) {
        record.element.setAttribute('aria-disabled', rowProps['aria-disabled'])
      } else {
        record.element.removeAttribute('aria-disabled')
      }

      record.element.active = this.model.state.activeCellId()?.rowId === record.id
      record.element.selected = rowProps['aria-selected'] === 'true'
      record.element.disabled = rowProps['aria-disabled'] === 'true'
      record.element.expanded = rowProps['aria-expanded'] === 'true'
      record.element.branch = record.children.length > 0
      record.element.hidden = !visibleRows.has(record.id)
      record.element.level = Number(rowProps['aria-level'])

      if (!record.element.expanded) {
        record.element.expanded = false
      }
    }

    for (const record of this.cellRecords) {
      if (!record.valid || !visibleRows.has(record.rowId)) {
        record.element.hidden = true
        continue
      }

      try {
        const cellProps = this.model.contracts.getCellProps(record.rowId, record.colId)
        record.element.id = cellProps.id
        record.element.setAttribute('role', cellProps.role)
        record.element.setAttribute('tabindex', cellProps.tabindex)
        record.element.setAttribute('aria-colindex', String(cellProps['aria-colindex']))
        record.element.setAttribute('aria-selected', cellProps['aria-selected'])

        if (cellProps['aria-disabled']) {
          record.element.setAttribute('aria-disabled', cellProps['aria-disabled'])
        } else {
          record.element.removeAttribute('aria-disabled')
        }

        record.element.active = cellProps['data-active'] === 'true'
        record.element.selected = cellProps['aria-selected'] === 'true'
        record.element.disabled = cellProps['aria-disabled'] === 'true'
        record.element.hidden = false
      } catch {
        record.element.hidden = true
      }
    }
  }

  private syncControlledValuesFromModel(): void {
    this.value = this.cellIdToString(this.model.state.activeCellId())
    this.selectedValues = [...this.model.state.selectedRowIds()]
    this.expandedValues = [...this.model.state.expandedRowIds()]
  }

  private getEventDetail(): CVTreegridEventDetail {
    return {
      value: this.value.trim() || null,
      activeCell: this.model.state.activeCellId(),
      selectedValues: [...this.model.state.selectedRowIds()],
      expandedValues: [...this.model.state.expandedRowIds()],
    }
  }

  private dispatchInput(detail: CVTreegridEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVTreegridEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private applyInteractionResult(previous: TreegridSnapshot): void {
    if (!this.model) return

    this.syncElementsFromModel()
    const next = this.captureSnapshot()
    this.syncControlledValuesFromModel()

    const activeChanged = !sameCellId(previous.activeCellId, next.activeCellId)
    const selectedChanged = !sameSetMembers(previous.selectedRowIds, next.selectedRowIds)
    const expandedChanged = !sameSetMembers(previous.expandedRowIds, next.expandedRowIds)
    if (!activeChanged && !selectedChanged && !expandedChanged) {
      return
    }

    if (!this._programmaticChange) {
      const detail = this.getEventDetail()
      this.dispatchInput(detail)

      if (selectedChanged || expandedChanged) {
        this.dispatchChange(detail)
      }
    }

    if (activeChanged) {
      this.focusActiveCell()
    }
  }

  private setActiveCell(cell: TreegridCellId): void {
    try {
      const props = this.model.contracts.getCellProps(cell.rowId, cell.colId)
      props.onFocus()
    } catch {
      // ignore invalid ids
    }
  }

  private focusActiveCell(): void {
    const activeCell = this.model.state.activeCellId()
    if (!activeCell) return

    const activeRecord = this.cellRecords.find((record) => {
      if (record.rowId !== activeCell.rowId || record.colId !== activeCell.colId || !record.valid) return false
      return true
    })
    if (!activeRecord || activeRecord.element.disabled) return

    activeRecord.element.focus()
  }

  private selectRowFromActive(additive: boolean): void {
    const activeCell = this.model.state.activeCellId()
    if (!activeCell) return

    const activeRowId = activeCell.rowId
    if (this.selectionMode === 'multiple' && additive) {
      this.model.actions.toggleRowSelection(activeRowId)
      return
    }

    this.model.actions.selectRow(activeRowId)
  }

  private setSelectedRows(next: readonly string[]): void {
    const valid = this.normalizeRowIds(next)
    const target = new Set(valid)

    if (this.selectionMode === 'single') {
      const selected = target.values().next().value
      if (selected) {
        this.model.actions.selectRow(selected)
      } else {
        this.model.state.selectedRowIds.set(new Set<string>())
      }
      return
    }

    const current = new Set(this.model.state.selectedRowIds())

    for (const id of current) {
      if (!target.has(id)) {
        this.model.actions.toggleRowSelection(id)
      }
    }

    for (const id of target) {
      if (!current.has(id)) {
        this.model.actions.toggleRowSelection(id)
      }
    }
  }

  private setExpandedRows(next: readonly string[]): void {
    const target = new Set(this.normalizeExpandedValues(next))
    const current = new Set(this.model.state.expandedRowIds())

    for (const id of current) {
      if (!target.has(id)) {
        this.model.actions.collapseRow(id)
      }
    }

    for (const id of target) {
      if (!current.has(id)) {
        this.model.actions.expandRow(id)
      }
    }
  }

  private handleCellFocus = (record: TreegridCellRecord) => {
    if (record.element.disabled) return

    const previous = this.captureSnapshot()
    this.model.contracts.getCellProps(record.rowId, record.colId).onFocus()
    this.applyInteractionResult(previous)
  }

  private handleCellPointer = (event: MouseEvent, record: TreegridCellRecord) => {
    if (record.element.disabled) return

    const previous = this.captureSnapshot()
    this.setActiveCellFromRecord(record)
    // In multiple mode, any pointer click (with or without Ctrl/Meta) accumulates
    // selection via toggleRowSelection. In single mode, plain click replaces selection.
    const additive = this.selectionMode === 'multiple'
    this.selectRowFromActive(additive)
    this.applyInteractionResult(previous)
    this.focusActiveCell()
  }

  private setActiveCellFromRecord(record: Pick<TreegridCellRecord, 'rowId' | 'colId'>): void {
    this.setActiveCell({rowId: record.rowId, colId: record.colId})
  }

  private handleTreegridKeyDown(event: KeyboardEvent) {
    if (!keysToPrevent.has(event.key)) {
      return
    }

    event.preventDefault()
    const previous = this.captureSnapshot()

    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      this.selectRowFromActive(event.ctrlKey || event.metaKey)
      this.applyInteractionResult(previous)
      return
    }

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
    const root = this.model.contracts.getTreegridProps()

    return html`
      <div
        part="base"
        role=${root.role}
        tabindex=${root.tabindex}
        aria-label=${root['aria-label'] ?? nothing}
        aria-labelledby=${root['aria-labelledby'] ?? nothing}
        aria-rowcount=${String(root['aria-rowcount'])}
        aria-colcount=${String(root['aria-colcount'])}
        aria-multiselectable=${root['aria-multiselectable']}
        @keydown=${this.handleTreegridKeyDown}
        @cv-treegrid-row-slotchange=${this.handleSlotChange}
      >
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
    `
  }
}
