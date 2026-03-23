import {
  createGrid,
  type GridCellId,
  type GridFocusStrategy,
  type GridModel,
  type GridSelectionMode,
} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'
import {CVGridCell} from './cv-grid-cell'
import {CVGridColumn} from './cv-grid-column'
import {CVGridRow} from './cv-grid-row'

export interface CVGridEventDetail {
  value: string | null
  activeCell: GridCellId | null
  selectedValues: string[]
}

interface GridColumnRecord {
  id: string
  index?: number
  disabled: boolean
  element: CVGridColumn
}

interface GridCellRecord {
  key: string
  rowId: string
  colId: string
  disabled: boolean
  valid: boolean
  element: CVGridCell
}

interface GridRowRecord {
  id: string
  index?: number
  disabled: boolean
  cells: GridCellRecord[]
  element: CVGridRow
}

interface GridSnapshot {
  activeKey: string | null
  selectedKeys: string[]
}

const gridKeysToPrevent = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Enter',
  ' ',
  'Spacebar',
])

const cellKey = (rowId: string, colId: string) => `${rowId}::${colId}`

const parseCellKey = (value: string): GridCellId | null => {
  const [rowId, colId, ...rest] = value.split('::')
  if (rest.length > 0 || !rowId || !colId) return null

  return {rowId, colId}
}

const sameSetMembers = (left: readonly string[], right: readonly string[]) => {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((value) => rightSet.has(value))
}

let cvGridNonce = 0

export class CVGrid extends ReatomLitElement {
  static elementName = 'cv-grid'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      selectedValues: {attribute: false},
      selectionMode: {type: String, attribute: 'selection-mode', reflect: true},
      focusStrategy: {type: String, attribute: 'focus-strategy', reflect: true},
      selectionFollowsFocus: {type: Boolean, attribute: 'selection-follows-focus', reflect: true},
      pageSize: {type: Number, attribute: 'page-size', reflect: true},
      readOnly: {type: Boolean, attribute: 'readonly', reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
      ariaLabelledBy: {type: String, attribute: 'aria-labelledby'},
      totalRowCount: {type: Number, attribute: 'total-row-count', reflect: true},
      totalColumnCount: {type: Number, attribute: 'total-column-count', reflect: true},
    }
  }

  declare value: string
  declare selectedValues: string[]
  declare selectionMode: GridSelectionMode
  declare focusStrategy: GridFocusStrategy
  declare selectionFollowsFocus: boolean
  declare pageSize: number
  declare readOnly: boolean
  declare ariaLabel: string
  declare ariaLabelledBy: string
  declare totalRowCount: number
  declare totalColumnCount: number

  private readonly idBase = `cv-grid-${++cvGridNonce}`
  private columnRecords: GridColumnRecord[] = []
  private rowRecords: GridRowRecord[] = []
  private cellRecords: GridCellRecord[] = []
  private validCellMap = new Map<string, GridCellRecord>()
  private cellListeners = new WeakMap<CVGridCell, {focus: EventListener; click: EventListener}>()
  private childObserver: MutationObserver | null = null
  private model: GridModel

  constructor() {
    super()
    this.value = ''
    this.selectedValues = []
    this.selectionMode = 'single'
    this.focusStrategy = 'roving-tabindex'
    this.selectionFollowsFocus = false
    this.pageSize = 10
    this.readOnly = false
    this.ariaLabel = ''
    this.ariaLabelledBy = ''
    this.totalRowCount = 0
    this.totalColumnCount = 0
    this.model = createGrid({
      idBase: this.idBase,
      rows: [],
      columns: [],
      ariaLabel: 'Grid',
    })
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      [part='base'] {
        display: table;
        inline-size: 100%;
        border-collapse: collapse;
        border-spacing: 0;
        border: 1px solid var(--cv-color-border, #2a3245);
        border-radius: var(--cv-radius-md, 10px);
        overflow: hidden;
        background: var(--cv-color-surface, #141923);
      }

      [part='head'] {
        display: table-header-group;
      }

      [part='head-row'] {
        display: table-row;
      }

      [part='body'] {
        display: table-row-group;
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
    this.observeChildren()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.detachCellListeners()
    this.disconnectChildObserver()
  }

  private observeChildren(): void {
    this.disconnectChildObserver()
    this.childObserver = new MutationObserver((mutations) => {
      let needsRebuild = false
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            const tag = node.tagName.toLowerCase()
            if (tag === CVGridColumn.elementName || tag === CVGridRow.elementName) {
              needsRebuild = true
            }
          }
        }
        for (const node of mutation.removedNodes) {
          if (node instanceof HTMLElement) {
            const tag = node.tagName.toLowerCase()
            if (tag === CVGridColumn.elementName || tag === CVGridRow.elementName) {
              needsRebuild = true
            }
          }
        }
      }
      if (needsRebuild) {
        this.rebuildModelFromSlot(true, true)
      }
    })
    this.childObserver.observe(this, {childList: true})
  }

  private disconnectChildObserver(): void {
    if (this.childObserver) {
      this.childObserver.disconnect()
      this.childObserver = null
    }
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (
      changedProperties.has('selectionMode') ||
      changedProperties.has('focusStrategy') ||
      changedProperties.has('selectionFollowsFocus') ||
      changedProperties.has('pageSize') ||
      changedProperties.has('readOnly') ||
      changedProperties.has('ariaLabel') ||
      changedProperties.has('ariaLabelledBy') ||
      changedProperties.has('totalRowCount') ||
      changedProperties.has('totalColumnCount')
    ) {
      this.rebuildModelFromSlot(true, false)
      return
    }

    if (changedProperties.has('value')) {
      const normalized = this.value.trim()
      if (this.value !== normalized) {
        this.value = normalized
      }

      const nextCell = parseCellKey(normalized)
      const modelActiveKey = this.captureSnapshot().activeKey
      const nextKey = nextCell ? cellKey(nextCell.rowId, nextCell.colId) : null

      if (nextCell && nextKey != null && nextKey !== modelActiveKey && this.validCellMap.has(nextKey)) {
        const previous = this.captureSnapshot()
        this.model.actions.setActiveCell(nextCell)
        this.applyInteractionResult(previous)
      }
    }

    if (changedProperties.has('selectedValues')) {
      const modelSelected = this.captureSnapshot().selectedKeys
      const normalized = [...new Set(this.selectedValues.map((value) => value.trim()).filter((value) => value.length > 0))]
      if (sameSetMembers(normalized, modelSelected)) {
        return
      }

      const previous = this.captureSnapshot()
      this.setSelectedValuesInModel(normalized)
      this.applyInteractionResult(previous)
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    if (!changedProperties.has('value') && !changedProperties.has('selectedValues')) {
      this.syncElementsFromModel()
    }
  }

  private resolveIndex(value: number): number | undefined {
    if (!Number.isFinite(value) || value < 1) {
      return undefined
    }

    return Math.floor(value)
  }

  private getColumnElements(): CVGridColumn[] {
    return Array.from(this.children).filter(
      (element): element is CVGridColumn => element.tagName.toLowerCase() === CVGridColumn.elementName,
    )
  }

  private getRowElements(): CVGridRow[] {
    return Array.from(this.children).filter(
      (element): element is CVGridRow => element.tagName.toLowerCase() === CVGridRow.elementName,
    )
  }

  private getCellElements(row: CVGridRow): CVGridCell[] {
    return Array.from(row.children).filter(
      (element): element is CVGridCell => element.tagName.toLowerCase() === CVGridCell.elementName,
    )
  }

  private ensureColumnValue(column: CVGridColumn, index: number): string {
    const normalized = column.value?.trim()
    if (normalized) return normalized

    const fallback = `column-${index + 1}`
    column.value = fallback
    return fallback
  }

  private ensureRowValue(row: CVGridRow, index: number): string {
    const normalized = row.value?.trim()
    if (normalized) return normalized

    const fallback = `row-${index + 1}`
    row.value = fallback
    return fallback
  }

  private resolveCellColumnId(cell: CVGridCell, index: number): string {
    const normalized = cell.column?.trim()
    if (normalized) return normalized

    const fallback = this.columnRecords[index]?.id ?? ''
    cell.column = fallback
    return fallback
  }

  private cellFromKey(key: string): GridCellId | null {
    return parseCellKey(key)
  }

  private keyFromCell(cell: GridCellId | null): string | null {
    if (!cell) return null
    return cellKey(cell.rowId, cell.colId)
  }

  private captureSnapshot(): GridSnapshot {
    return {
      activeKey: this.keyFromCell(this.model.state.activeCellId()),
      selectedKeys: [...this.model.state.selectedCellIds()],
    }
  }

  private rebuildModelFromSlot(preserveState: boolean, requestRender = true): void {
    const previous = preserveState
      ? this.captureSnapshot()
      : {
          activeKey: this.value.trim() || null,
          selectedKeys: [...new Set(this.selectedValues.map((value) => value.trim()).filter((value) => value.length > 0))],
        }

    this.detachCellListeners()
    this.columnRecords = []
    this.rowRecords = []
    this.cellRecords = []
    this.validCellMap.clear()

    this.columnRecords = this.getColumnElements().map((element, index) => {
      const id = this.ensureColumnValue(element, index)
      element.slot = 'columns'

      return {
        id,
        index: this.resolveIndex(element.index),
        disabled: element.disabled,
        element,
      }
    })

    const validColumnIds = new Set(this.columnRecords.map((column) => column.id))
    const disabledCells: GridCellId[] = []

    this.rowRecords = this.getRowElements().map((row, rowIndex) => {
      const id = this.ensureRowValue(row, rowIndex)
      row.slot = 'rows'

      const cells = this.getCellElements(row).map((cell, cellIndex) => {
        const colId = this.resolveCellColumnId(cell, cellIndex)
        const key = cellKey(id, colId)
        const valid = validColumnIds.has(colId)

        const record: GridCellRecord = {
          key,
          rowId: id,
          colId,
          disabled: cell.disabled,
          valid,
          element: cell,
        }

        this.cellRecords.push(record)
        if (valid) {
          this.validCellMap.set(key, record)
          if (record.disabled) {
            disabledCells.push({rowId: id, colId})
          }
        }

        return record
      })

      return {
        id,
        index: this.resolveIndex(row.index),
        disabled: row.disabled,
        cells,
        element: row,
      }
    })

    const initialActiveCell =
      previous.activeKey && this.validCellMap.has(previous.activeKey) ? this.cellFromKey(previous.activeKey) : null

    const initialSelectedCells = previous.selectedKeys
      .filter((key) => this.validCellMap.has(key))
      .slice(0, this.selectionMode === 'single' ? 1 : undefined)
      .map((key) => this.cellFromKey(key))
      .filter((cell): cell is GridCellId => cell != null)

    const normalizedAriaLabel = this.ariaLabel.trim()
    const normalizedAriaLabelledBy = this.ariaLabelledBy.trim()

    this.model = createGrid({
      idBase: this.idBase,
      rows: this.rowRecords.map((row) => ({
        id: row.id,
        index: row.index,
        disabled: row.disabled,
      })),
      columns: this.columnRecords.map((column) => ({
        id: column.id,
        index: column.index,
        disabled: column.disabled,
      })),
      disabledCells,
      ariaLabel: normalizedAriaLabel || (!normalizedAriaLabelledBy ? 'Grid' : undefined),
      ariaLabelledBy: normalizedAriaLabelledBy || undefined,
      focusStrategy: this.focusStrategy,
      selectionMode: this.selectionMode,
      selectionFollowsFocus: this.selectionFollowsFocus,
      pageSize: this.pageSize > 0 ? this.pageSize : 1,
      totalRowCount: this.totalRowCount > 0 ? this.totalRowCount : undefined,
      totalColumnCount: this.totalColumnCount > 0 ? this.totalColumnCount : undefined,
      initialActiveCellId: initialActiveCell,
      initialSelectedCellIds: initialSelectedCells,
      isReadOnly: this.readOnly,
    })

    this.attachCellListeners()
    this.syncElementsFromModel()
    this.syncControlledValuesFromModel()

    if (requestRender) {
      this.requestUpdate()
    }
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

      const focus = () => this.handleCellFocus(record.rowId, record.colId)
      const click = (event: Event) => this.handleCellClick(event as MouseEvent, record.rowId, record.colId)

      record.element.addEventListener('focus', focus)
      record.element.addEventListener('click', click)
      this.cellListeners.set(record.element, {focus, click})
    }
  }

  private syncControlledValuesFromModel(): void {
    const activeKey = this.keyFromCell(this.model.state.activeCellId()) ?? ''
    const selectedKeys = [...this.model.state.selectedCellIds()]

    this.value = activeKey
    this.selectedValues = selectedKeys
  }

  private syncElementsFromModel(): void {
    const gridProps = this.model.contracts.getGridProps()

    for (const [index, column] of this.columnRecords.entries()) {
      column.element.slot = 'columns'
      column.element.setAttribute('role', 'columnheader')
      column.element.setAttribute('aria-colindex', String(column.index ?? index + 1))

      if (column.disabled) {
        column.element.setAttribute('aria-disabled', 'true')
      } else {
        column.element.removeAttribute('aria-disabled')
      }
    }

    for (const row of this.rowRecords) {
      const rowProps = this.model.contracts.getRowProps(row.id)

      row.element.id = rowProps.id
      row.element.slot = 'rows'
      row.element.setAttribute('role', rowProps.role)
      row.element.setAttribute('aria-rowindex', String(rowProps['aria-rowindex']))

      for (const cell of row.cells) {
        cell.element.hidden = !cell.valid
        if (!cell.valid) continue

        const cellProps = this.model.contracts.getCellProps(cell.rowId, cell.colId)

        cell.element.id = cellProps.id
        cell.element.setAttribute('role', cellProps.role)
        cell.element.setAttribute('tabindex', cellProps.tabindex)
        cell.element.setAttribute('aria-colindex', String(cellProps['aria-colindex']))
        cell.element.setAttribute('aria-selected', cellProps['aria-selected'])
        cell.element.setAttribute('data-active', cellProps['data-active'])

        if (cellProps['aria-readonly']) {
          cell.element.setAttribute('aria-readonly', cellProps['aria-readonly'])
        } else {
          cell.element.removeAttribute('aria-readonly')
        }

        if (cellProps['aria-disabled']) {
          cell.element.setAttribute('aria-disabled', cellProps['aria-disabled'])
        } else {
          cell.element.removeAttribute('aria-disabled')
        }

        cell.element.active = cellProps['data-active'] === 'true'
        cell.element.selected = cellProps['aria-selected'] === 'true'
        cell.element.disabled = cellProps['aria-disabled'] === 'true'
      }
    }

    const root = this.shadowRoot?.querySelector('[part="base"]') as HTMLElement | null
    if (root) {
      root.id = gridProps.id
    }
  }

  private getEventDetail(): CVGridEventDetail {
    return {
      value: this.value.trim() || null,
      activeCell: this.model.state.activeCellId(),
      selectedValues: [...this.model.state.selectedCellIds()],
    }
  }

  private dispatchInput(detail: CVGridEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVGridEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private applyInteractionResult(previous: GridSnapshot): void {
    this.syncElementsFromModel()

    const next = this.captureSnapshot()
    this.syncControlledValuesFromModel()

    const activeChanged = previous.activeKey !== next.activeKey
    const selectionChanged = !sameSetMembers(previous.selectedKeys, next.selectedKeys)
    if (!activeChanged && !selectionChanged) return

    const detail = this.getEventDetail()
    this.dispatchInput(detail)
    this.dispatchChange(detail)
  }

  private setSelectedValuesInModel(values: readonly string[]): void {
    const parsed = values
      .map((key) => this.cellFromKey(key))
      .filter((cell): cell is GridCellId => cell != null)
      .filter((cell) => this.validCellMap.has(cellKey(cell.rowId, cell.colId)))

    this.model.state.selectedCellIds.set(new Set<string>())
    if (parsed.length === 0) return

    if (this.selectionMode === 'single') {
      const first = parsed[0]
      if (first) {
        this.model.actions.selectCell(first)
      }
      return
    }

    for (const cell of parsed) {
      this.model.actions.toggleCellSelection(cell)
    }
  }

  private focusActiveCell(): void {
    if (this.focusStrategy !== 'roving-tabindex') return

    const activeKey = this.keyFromCell(this.model.state.activeCellId())
    if (!activeKey) return

    const record = this.validCellMap.get(activeKey)
    if (!record || record.element.disabled) return

    record.element.focus()
  }

  private handleCellFocus(rowId: string, colId: string): void {
    const previous = this.captureSnapshot()
    this.model.contracts.getCellProps(rowId, colId).onFocus()
    this.applyInteractionResult(previous)
  }

  private handleCellClick(event: MouseEvent, rowId: string, colId: string): void {
    const props = this.model.contracts.getCellProps(rowId, colId)
    if (props['aria-disabled'] === 'true') return

    const previous = this.captureSnapshot()
    const cell: GridCellId = {rowId, colId}

    this.model.actions.setActiveCell(cell)
    if (this.selectionMode === 'multiple' && (event.metaKey || event.ctrlKey)) {
      this.model.actions.toggleCellSelection(cell)
    } else {
      this.model.actions.selectCell(cell)
    }

    this.applyInteractionResult(previous)
    this.focusActiveCell()
  }

  private handleGridKeyDown(event: KeyboardEvent) {
    if (gridKeysToPrevent.has(event.key)) {
      event.preventDefault()
    }

    const previous = this.captureSnapshot()
    this.model.actions.handleKeyDown(event)
    this.applyInteractionResult(previous)
    this.focusActiveCell()
  }

  private handleColumnsSlotChange() {
    this.rebuildModelFromSlot(true, true)
  }

  private handleRowsSlotChange() {
    this.rebuildModelFromSlot(true, true)
  }

  private handleRowSlotChange() {
    this.rebuildModelFromSlot(true, true)
  }

  protected override render() {
    const gridProps = this.model.contracts.getGridProps()

    return html`
      <div
        id=${gridProps.id}
        role=${gridProps.role}
        tabindex=${gridProps.tabindex}
        aria-label=${gridProps['aria-label'] ?? nothing}
        aria-labelledby=${gridProps['aria-labelledby'] ?? nothing}
        aria-multiselectable=${gridProps['aria-multiselectable']}
        aria-colcount=${String(gridProps['aria-colcount'])}
        aria-rowcount=${String(gridProps['aria-rowcount'])}
        aria-activedescendant=${gridProps['aria-activedescendant'] ?? nothing}
        part="base"
        @keydown=${this.handleGridKeyDown}
      >
        <div role="rowgroup" part="head">
          <div role="row" part="head-row">
            <slot name="columns" @slotchange=${this.handleColumnsSlotChange}></slot>
          </div>
        </div>

        <div role="rowgroup" part="body" @cv-grid-row-slotchange=${this.handleRowSlotChange}>
          <slot name="rows" @slotchange=${this.handleRowsSlotChange}></slot>
        </div>
      </div>
    `
  }
}
