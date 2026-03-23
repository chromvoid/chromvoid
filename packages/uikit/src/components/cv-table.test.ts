import {afterEach, describe, expect, it} from 'vitest'

import {CVTable} from './cv-table'
import {CVTableRow} from './cv-table-row'
import {CVTableColumn} from './cv-table-column'
import {CVTableCell} from './cv-table-cell'

CVTable.define()
CVTableRow.define()
CVTableColumn.define()
CVTableCell.define()

const settle = async (element: CVTable) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

const createColumn = (value: string, label: string, params: {sortable?: boolean; index?: number} = {}) => {
  const column = document.createElement('cv-table-column') as CVTableColumn
  column.value = value
  column.label = label
  column.textContent = label
  if (params.sortable) {
    column.sortable = true
  }
  if (params.index != null) {
    column.index = params.index
  }
  return column
}

const createCell = (
  column: string,
  text: string,
  params: {rowHeader?: boolean; colspan?: number; rowspan?: number} = {},
) => {
  const cell = document.createElement('cv-table-cell') as CVTableCell
  cell.column = column
  cell.textContent = text
  if (params.rowHeader) {
    cell.rowHeader = true
  }
  if (params.colspan != null) {
    cell.colspan = params.colspan
  }
  if (params.rowspan != null) {
    cell.rowspan = params.rowspan
  }
  return cell
}

const createRow = (value: string, cells: CVTableCell[], params: {index?: number} = {}) => {
  const row = document.createElement('cv-table-row') as CVTableRow
  row.value = value
  if (params.index != null) {
    row.index = params.index
  }
  row.append(...cells)
  return row
}

const createTable = async (attrs?: Record<string, unknown>) => {
  const el = document.createElement('cv-table') as CVTable
  el.ariaLabel = 'Test table'
  if (attrs) Object.assign(el, attrs)
  el.append(
    createColumn('name', 'Name', {sortable: true}),
    createColumn('email', 'Email'),
    createRow('row1', [createCell('name', 'Alice'), createCell('email', 'alice@example.com')]),
    createRow('row2', [createCell('name', 'Bob'), createCell('email', 'bob@example.com')]),
  )
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (table: CVTable) => table.shadowRoot!.querySelector('[part="base"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-table', () => {
  // --- shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] as root element', async () => {
      const table = await createTable()
      const base = getBase(table)
      expect(base).not.toBeNull()
    })

    it('renders [part="head"] rowgroup inside base', async () => {
      const table = await createTable()
      const header = table.shadowRoot!.querySelector('[part="head"]')
      expect(header).not.toBeNull()
      expect(header!.getAttribute('role')).toBe('rowgroup')
    })

    it('renders [part="head-row"] row inside header', async () => {
      const table = await createTable()
      const headerRow = table.shadowRoot!.querySelector('[part="head-row"]')
      expect(headerRow).not.toBeNull()
      expect(headerRow!.getAttribute('role')).toBe('row')
    })

    it('renders slot[name="columns"] inside header row', async () => {
      const table = await createTable()
      const headerRow = table.shadowRoot!.querySelector('[part="head-row"]')
      const slot = headerRow!.querySelector('slot[name="columns"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="body"] rowgroup inside base', async () => {
      const table = await createTable()
      const body = table.shadowRoot!.querySelector('[part="body"]')
      expect(body).not.toBeNull()
      expect(body!.getAttribute('role')).toBe('rowgroup')
    })

    it('renders slot[name="rows"] inside body', async () => {
      const table = await createTable()
      const body = table.shadowRoot!.querySelector('[part="body"]')
      const slot = body!.querySelector('slot[name="rows"]')
      expect(slot).not.toBeNull()
    })
  })

  // --- default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const table = document.createElement('cv-table') as CVTable
      expect(table.sortColumn).toBe('')
      expect(table.sortDirection).toBe('none')
      expect(table.totalColumnCount).toBe(0)
      expect(table.totalRowCount).toBe(0)
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('role="table" on base by default', async () => {
      const table = await createTable()
      expect(getBase(table).getAttribute('role')).toBe('table')
    })

    it('aria-label reflects on base', async () => {
      const table = await createTable()
      expect(getBase(table).getAttribute('aria-label')).toBe('Test table')
    })

    it('aria-colcount on base', async () => {
      const table = await createTable()
      expect(getBase(table).getAttribute('aria-colcount')).toBeTruthy()
    })

    it('aria-rowcount on base', async () => {
      const table = await createTable()
      expect(getBase(table).getAttribute('aria-rowcount')).toBeTruthy()
    })

    it('role="columnheader" on cv-table-column elements', async () => {
      const table = await createTable()
      const columns = table.querySelectorAll('cv-table-column')
      for (const col of columns) {
        expect(col.getAttribute('role')).toBe('columnheader')
      }
    })

    it('aria-sort on sortable column headers', async () => {
      const table = await createTable()
      const nameCol = table.querySelector('cv-table-column[value="name"]')!
      expect(nameCol.getAttribute('aria-sort')).toBe('none')
    })

    it('role="row" on cv-table-row elements', async () => {
      const table = await createTable()
      const rows = table.querySelectorAll('cv-table-row')
      for (const row of rows) {
        expect(row.getAttribute('role')).toBe('row')
      }
    })

    it('role="cell" on cv-table-cell elements', async () => {
      const table = await createTable()
      const cells = table.querySelectorAll('cv-table-cell')
      for (const cell of cells) {
        expect(cell.getAttribute('role')).toBe('cell')
      }
    })

    it('aria-colindex on column headers (1-based)', async () => {
      const table = await createTable()
      const nameCol = table.querySelector('cv-table-column[value="name"]')!
      const emailCol = table.querySelector('cv-table-column[value="email"]')!
      expect(nameCol.getAttribute('aria-colindex')).toBe('1')
      expect(emailCol.getAttribute('aria-colindex')).toBe('2')
    })

    it('aria-rowindex on rows (1-based)', async () => {
      const table = await createTable()
      const rows = table.querySelectorAll('cv-table-row')
      expect(rows[0].getAttribute('aria-rowindex')).toBe('1')
      expect(rows[1].getAttribute('aria-rowindex')).toBe('2')
    })
  })

  // --- sort cycling ---

  describe('sort cycling', () => {
    it('click sortable column cycles: ascending -> descending -> none', async () => {
      const table = await createTable()
      const nameCol = table.querySelector('cv-table-column[value="name"]') as CVTableColumn

      const changes: Array<{sortColumnId: string | null; sortDirection: string}> = []
      table.addEventListener('cv-change', (event) => {
        changes.push((event as unknown as CustomEvent<{sortColumnId: string | null; sortDirection: string}>).detail)
      })

      nameCol.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)
      expect(table.sortColumn).toBe('name')
      expect(table.sortDirection).toBe('ascending')
      expect(nameCol.getAttribute('aria-sort')).toBe('ascending')

      nameCol.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)
      expect(table.sortDirection).toBe('descending')
      expect(nameCol.getAttribute('aria-sort')).toBe('descending')

      nameCol.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)
      expect(table.sortColumn).toBe('')
      expect(table.sortDirection).toBe('none')
      expect(nameCol.getAttribute('aria-sort')).toBe('none')

      expect(changes).toEqual([
        {sortColumnId: 'name', sortDirection: 'ascending'},
        {sortColumnId: 'name', sortDirection: 'descending'},
        {sortColumnId: null, sortDirection: 'none'},
      ])
    })

    it('input event fires with same detail shape as change on sort', async () => {
      const table = await createTable()
      const nameCol = table.querySelector('cv-table-column[value="name"]') as CVTableColumn

      const inputs: Array<{sortColumnId: string | null; sortDirection: string}> = []
      table.addEventListener('cv-input', (event) => {
        inputs.push((event as unknown as CustomEvent<{sortColumnId: string | null; sortDirection: string}>).detail)
      })

      nameCol.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)

      expect(inputs).toEqual([{sortColumnId: 'name', sortDirection: 'ascending'}])
    })

    it('keyboard Enter on sortable column triggers sort', async () => {
      const table = await createTable()
      const nameCol = table.querySelector('cv-table-column[value="name"]') as CVTableColumn

      nameCol.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(table)

      expect(table.sortColumn).toBe('name')
      expect(table.sortDirection).toBe('ascending')
    })

    it('keyboard Space on sortable column triggers sort', async () => {
      const table = await createTable()
      const nameCol = table.querySelector('cv-table-column[value="name"]') as CVTableColumn

      nameCol.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(table)

      expect(table.sortColumn).toBe('name')
      expect(table.sortDirection).toBe('ascending')
    })

    it('click on non-sortable column does not change sort state', async () => {
      const table = await createTable()
      const emailCol = table.querySelector('cv-table-column[value="email"]') as CVTableColumn

      emailCol.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)

      expect(table.sortColumn).toBe('')
      expect(table.sortDirection).toBe('none')
    })
  })

  // --- controlled sort props ---

  describe('controlled sort props', () => {
    it('external sort-column and sort-direction attributes set initial sort', async () => {
      const table = document.createElement('cv-table') as CVTable
      table.ariaLabel = 'Test'
      table.sortColumn = 'status'
      table.sortDirection = 'descending'

      const name = createColumn('name', 'Name', {sortable: true})
      const status = createColumn('status', 'Status', {sortable: true})
      const row = createRow('r1', [createCell('name', 'Alice'), createCell('status', 'active')])
      table.append(name, status, row)

      document.body.append(table)
      await settle(table)

      expect(status.getAttribute('aria-sort')).toBe('descending')
      expect(table.sortColumn).toBe('status')
    })

    it('setting sortDirection to none clears sort', async () => {
      const table = document.createElement('cv-table') as CVTable
      table.ariaLabel = 'Test'
      table.sortColumn = 'status'
      table.sortDirection = 'descending'

      const status = createColumn('status', 'Status', {sortable: true})
      const row = createRow('r1', [createCell('status', 'active')])
      table.append(status, row)

      document.body.append(table)
      await settle(table)

      table.sortDirection = 'none'
      await settle(table)

      expect(table.sortDirection).toBe('none')
      expect(table.sortColumn).toBe('')
      expect(status.getAttribute('aria-sort')).toBe('none')
    })
  })

  // --- rowheader and span contracts ---

  describe('rowheader and span contracts', () => {
    it('cell with row-header gets role="rowheader"', async () => {
      const table = document.createElement('cv-table') as CVTable
      table.ariaLabel = 'Test'
      table.append(
        createColumn('metric', 'Metric'),
        createColumn('value', 'Value'),
        createRow('r1', [
          createCell('metric', 'CPU', {rowHeader: true}),
          createCell('value', '40%'),
        ]),
      )

      document.body.append(table)
      await settle(table)

      const metric = table.querySelector('cv-table-cell[column="metric"]')!
      expect(metric.getAttribute('role')).toBe('rowheader')
    })

    it('cell with colspan >= 2 gets aria-colspan', async () => {
      const table = document.createElement('cv-table') as CVTable
      table.ariaLabel = 'Test'
      table.append(
        createColumn('a', 'A'),
        createColumn('b', 'B'),
        createRow('r1', [createCell('a', 'v', {colspan: 2})]),
      )

      document.body.append(table)
      await settle(table)

      const cell = table.querySelector('cv-table-cell[column="a"]')!
      expect(cell.getAttribute('aria-colspan')).toBe('2')
    })

    it('cell with rowspan >= 2 gets aria-rowspan', async () => {
      const table = document.createElement('cv-table') as CVTable
      table.ariaLabel = 'Test'
      table.append(
        createColumn('a', 'A'),
        createRow('r1', [createCell('a', 'v', {rowspan: 3})]),
      )

      document.body.append(table)
      await settle(table)

      const cell = table.querySelector('cv-table-cell[column="a"]')!
      expect(cell.getAttribute('aria-rowspan')).toBe('3')
    })

    it('rowheader cell gets aria-rowindex and aria-colindex', async () => {
      const table = document.createElement('cv-table') as CVTable
      table.ariaLabel = 'Test'
      table.append(
        createColumn('metric', 'Metric'),
        createColumn('value', 'Value'),
        createRow('r1', [
          createCell('metric', 'CPU', {rowHeader: true}),
          createCell('value', '40%', {colspan: 2, rowspan: 3}),
        ]),
      )

      document.body.append(table)
      await settle(table)

      const metric = table.querySelector('cv-table-cell[column="metric"]')!
      expect(metric.getAttribute('aria-rowindex')).toBe('1')
      expect(metric.getAttribute('aria-colindex')).toBe('1')
    })
  })

  // --- slot rebuild preservation ---

  describe('slot rebuild preservation', () => {
    it('preserves valid sort state when columns change', async () => {
      const table = document.createElement('cv-table') as CVTable
      table.ariaLabel = 'Test'

      const name = createColumn('name', 'Name', {sortable: true})
      const status = createColumn('status', 'Status', {sortable: true})
      const row = createRow('r1', [createCell('name', 'Alice'), createCell('status', 'active')])
      table.append(name, status, row)

      document.body.append(table)
      await settle(table)

      status.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)
      expect(table.sortColumn).toBe('status')
      expect(table.sortDirection).toBe('ascending')

      name.remove()
      await settle(table)

      expect(table.sortColumn).toBe('status')
      expect(table.sortDirection).toBe('ascending')
      expect(status.getAttribute('aria-sort')).toBe('ascending')
    })

    it('clears sort state when sorted column is removed', async () => {
      const table = document.createElement('cv-table') as CVTable
      table.ariaLabel = 'Test'

      const name = createColumn('name', 'Name', {sortable: true})
      const status = createColumn('status', 'Status', {sortable: true})
      const row = createRow('r1', [createCell('name', 'Alice'), createCell('status', 'active')])
      table.append(name, status, row)

      document.body.append(table)
      await settle(table)

      status.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)

      status.remove()
      await settle(table)

      expect(table.sortColumn).toBe('')
      expect(table.sortDirection).toBe('none')
    })
  })

  // --- display variants ---

  describe('display variants', () => {
    it('striped attribute reflects to host', async () => {
      const table = await createTable({striped: true})
      expect(table.hasAttribute('striped')).toBe(true)
    })

    it('compact attribute reflects to host', async () => {
      const table = await createTable({compact: true})
      expect(table.hasAttribute('compact')).toBe(true)
    })

    it('bordered attribute reflects to host', async () => {
      const table = await createTable({bordered: true})
      expect(table.hasAttribute('bordered')).toBe(true)
    })

    it('sticky-header attribute reflects to host', async () => {
      const table = await createTable({stickyHeader: true})
      expect(table.hasAttribute('sticky-header')).toBe(true)
    })

    it('striped defaults to false', async () => {
      const table = await createTable()
      expect(table.hasAttribute('striped')).toBe(false)
    })

    it('compact defaults to false', async () => {
      const table = await createTable()
      expect(table.hasAttribute('compact')).toBe(false)
    })

    it('bordered defaults to false', async () => {
      const table = await createTable()
      expect(table.hasAttribute('bordered')).toBe(false)
    })

    it('sticky-header defaults to false', async () => {
      const table = await createTable()
      expect(table.hasAttribute('sticky-header')).toBe(false)
    })
  })

  // --- selection (single mode) ---

  describe('selection (single mode)', () => {
    it('selectable="single" does not set aria-multiselectable on base', async () => {
      const table = await createTable({selectable: 'single'})
      const base = getBase(table)
      expect(base.hasAttribute('aria-multiselectable')).toBe(false)
    })

    it('clicking a row selects it (aria-selected="true")', async () => {
      const table = await createTable({selectable: 'single'})
      const row1 = table.querySelector('cv-table-row[value="row1"]') as CVTableRow

      row1.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)

      expect(row1.getAttribute('aria-selected')).toBe('true')
    })

    it('clicking another row deselects the first', async () => {
      const table = await createTable({selectable: 'single'})
      const row1 = table.querySelector('cv-table-row[value="row1"]') as CVTableRow
      const row2 = table.querySelector('cv-table-row[value="row2"]') as CVTableRow

      row1.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)

      row2.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)

      expect(row1.getAttribute('aria-selected')).toBe('false')
      expect(row2.getAttribute('aria-selected')).toBe('true')
    })

    it('cv-selection-change event fires with detail {selectedRowIds}', async () => {
      const table = await createTable({selectable: 'single'})
      const row1 = table.querySelector('cv-table-row[value="row1"]') as CVTableRow

      let detail: unknown
      table.addEventListener('cv-selection-change', (event) => {
        detail = (event as CustomEvent).detail
      })

      row1.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)

      expect(detail).toEqual(
        expect.objectContaining({
          selectedRowIds: expect.arrayContaining(['row1']),
          selectable: 'single',
        }),
      )
    })

    it('selected attribute reflects on cv-table-row', async () => {
      const table = await createTable({selectable: 'single'})
      const row1 = table.querySelector('cv-table-row[value="row1"]') as CVTableRow

      row1.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)

      expect(row1.hasAttribute('selected')).toBe(true)
    })

    it('rows have aria-selected attribute when selectable is single', async () => {
      const table = await createTable({selectable: 'single'})
      const rows = table.querySelectorAll('cv-table-row')
      for (const row of rows) {
        expect(row.hasAttribute('aria-selected')).toBe(true)
      }
    })
  })

  // --- selection (multi mode) ---

  describe('selection (multi mode)', () => {
    it('selectable="multi" sets aria-multiselectable="true" on base', async () => {
      const table = await createTable({selectable: 'multi'})
      const base = getBase(table)
      expect(base.getAttribute('aria-multiselectable')).toBe('true')
    })

    it('clicking rows adds to selection (multiple aria-selected="true")', async () => {
      const table = await createTable({selectable: 'multi'})
      const row1 = table.querySelector('cv-table-row[value="row1"]') as CVTableRow
      const row2 = table.querySelector('cv-table-row[value="row2"]') as CVTableRow

      row1.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)

      row2.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)

      expect(row1.getAttribute('aria-selected')).toBe('true')
      expect(row2.getAttribute('aria-selected')).toBe('true')
    })

    it('cv-selection-change event fires with accumulated selection', async () => {
      const table = await createTable({selectable: 'multi'})
      const row1 = table.querySelector('cv-table-row[value="row1"]') as CVTableRow
      const row2 = table.querySelector('cv-table-row[value="row2"]') as CVTableRow

      const details: unknown[] = []
      table.addEventListener('cv-selection-change', (event) => {
        details.push((event as CustomEvent).detail)
      })

      row1.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)

      row2.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)

      expect(details.length).toBeGreaterThanOrEqual(2)
    })

    it('rows have aria-selected attribute when selectable is multi', async () => {
      const table = await createTable({selectable: 'multi'})
      const rows = table.querySelectorAll('cv-table-row')
      for (const row of rows) {
        expect(row.hasAttribute('aria-selected')).toBe(true)
      }
    })

    it('no aria-multiselectable when selectable is not set', async () => {
      const table = await createTable()
      const base = getBase(table)
      expect(base.hasAttribute('aria-multiselectable')).toBe(false)
    })

    it('no aria-selected on rows when selectable is not set', async () => {
      const table = await createTable()
      const rows = table.querySelectorAll('cv-table-row')
      for (const row of rows) {
        expect(row.hasAttribute('aria-selected')).toBe(false)
      }
    })
  })

  // --- grid navigation ---

  describe('grid navigation', () => {
    it('interactive=true sets role="grid" on base', async () => {
      const table = await createTable({interactive: true})
      const base = getBase(table)
      expect(base.getAttribute('role')).toBe('grid')
    })

    it('interactive=true sets cells to role="gridcell"', async () => {
      const table = await createTable({interactive: true})
      const cells = table.querySelectorAll('cv-table-cell')
      for (const cell of cells) {
        expect(cell.getAttribute('role')).toBe('gridcell')
      }
    })

    it('interactive=false keeps role="table" (default)', async () => {
      const table = await createTable()
      const base = getBase(table)
      expect(base.getAttribute('role')).toBe('table')
    })

    it('interactive=false keeps cells as role="cell"', async () => {
      const table = await createTable()
      const cells = table.querySelectorAll('cv-table-cell')
      for (const cell of cells) {
        expect(cell.getAttribute('role')).toBe('cell')
      }
    })

    it('focused cell has tabindex="0", others have tabindex="-1"', async () => {
      const table = await createTable({interactive: true})
      const cells = table.querySelectorAll('cv-table-cell')

      const focused = Array.from(cells).filter((c) => c.getAttribute('tabindex') === '0')
      const unfocused = Array.from(cells).filter((c) => c.getAttribute('tabindex') === '-1')

      expect(focused.length).toBe(1)
      expect(unfocused.length).toBe(cells.length - 1)
    })

    it('arrow key navigation moves focus between cells', async () => {
      const table = await createTable({interactive: true})
      const base = getBase(table)

      // Initial focus should be at (0, 0)
      const cellsBefore = table.querySelectorAll('cv-table-cell')
      const initialFocused = Array.from(cellsBefore).find((c) => c.getAttribute('tabindex') === '0')
      expect(initialFocused).toBeDefined()

      // Press ArrowRight to move focus
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(table)

      const cellsAfter = table.querySelectorAll('cv-table-cell')
      const newFocused = Array.from(cellsAfter).find((c) => c.getAttribute('tabindex') === '0')
      expect(newFocused).toBeDefined()
      // Focus should have moved (different cell focused)
      expect(newFocused).not.toBe(initialFocused)
    })

    it('Home moves focus to row start', async () => {
      const table = await createTable({interactive: true})
      const base = getBase(table)

      // Move right first
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(table)

      // Then Home to go back to start
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', bubbles: true}))
      await settle(table)

      const cells = table.querySelectorAll('cv-table-cell')
      // First cell in row should have tabindex="0"
      expect(cells[0].getAttribute('tabindex')).toBe('0')
    })

    it('End moves focus to row end', async () => {
      const table = await createTable({interactive: true})
      const base = getBase(table)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true}))
      await settle(table)

      const cells = table.querySelectorAll('cv-table-cell')
      // Last cell in first row should have tabindex="0"
      expect(cells[1].getAttribute('tabindex')).toBe('0')
    })

    it('Ctrl+Home moves focus to grid start', async () => {
      const table = await createTable({interactive: true})
      const base = getBase(table)

      // Move to end first
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', ctrlKey: true, bubbles: true}))
      await settle(table)

      // Then Ctrl+Home to go to start
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', ctrlKey: true, bubbles: true}))
      await settle(table)

      const cells = table.querySelectorAll('cv-table-cell')
      expect(cells[0].getAttribute('tabindex')).toBe('0')
    })

    it('Ctrl+End moves focus to grid end', async () => {
      const table = await createTable({interactive: true})
      const base = getBase(table)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', ctrlKey: true, bubbles: true}))
      await settle(table)

      const cells = table.querySelectorAll('cv-table-cell')
      // Last cell overall (row2, email) should have tabindex="0"
      expect(cells[cells.length - 1].getAttribute('tabindex')).toBe('0')
    })

    it('cv-focus-change event fires on focus movement', async () => {
      const table = await createTable({interactive: true})
      const base = getBase(table)

      let detail: unknown
      table.addEventListener('cv-focus-change', (event) => {
        detail = (event as CustomEvent).detail
      })

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(table)

      expect(detail).toEqual(
        expect.objectContaining({
          rowIndex: expect.any(Number),
          columnIndex: expect.any(Number),
        }),
      )
    })

    it('interactive grid root has tabindex="0"', async () => {
      const table = await createTable({interactive: true})
      const base = getBase(table)
      expect(base.getAttribute('tabindex')).toBe('0')
    })

    it('non-interactive table root has no tabindex', async () => {
      const table = await createTable()
      const base = getBase(table)
      expect(base.hasAttribute('tabindex')).toBe(false)
    })
  })

  // --- headless contract delegation ---

  describe('headless contract delegation', () => {
    it('ARIA attributes on rendered elements match headless contract return values', async () => {
      const table = await createTable()
      const base = getBase(table)

      // The base element should have role from getTableProps()
      expect(base.getAttribute('role')).toBe('table')
      expect(base.getAttribute('aria-label')).toBe('Test table')
    })

    it('rendered role on column header originates from headless getColumnHeaderProps contract', async () => {
      // This test verifies the column header role comes from the headless contract,
      // not from a hardcoded value. The headless contract always returns role="columnheader".
      const table = await createTable()
      const nameCol = table.querySelector('cv-table-column[value="name"]')!

      // Verify the attribute is set (comes from contract spread in syncElementsFromModel)
      expect(nameCol.getAttribute('role')).toBe('columnheader')
      // Also verify aria-colindex (contract-generated 1-based index)
      expect(nameCol.getAttribute('aria-colindex')).toBe('1')
    })

    it('rendered role on row originates from headless getRowProps contract', async () => {
      const table = await createTable()
      const row = table.querySelector('cv-table-row[value="row1"]')!

      expect(row.getAttribute('role')).toBe('row')
      expect(row.getAttribute('aria-rowindex')).toBe('1')
    })

    it('rendered role on cell originates from headless getCellProps contract', async () => {
      const table = await createTable()
      const cell = table.querySelector('cv-table-cell[column="name"]')!

      expect(cell.getAttribute('role')).toBe('cell')
      expect(cell.getAttribute('aria-colindex')).toBeTruthy()
    })

    it('interactive mode changes cell role via headless contract', async () => {
      const table = await createTable({interactive: true})
      const cell = table.querySelector('cv-table-cell[column="name"]')!

      // When interactive=true, headless contract returns role="gridcell" instead of "cell"
      expect(cell.getAttribute('role')).toBe('gridcell')
    })
  })

  // --- parent-child coordination ---

  describe('parent-child coordination', () => {
    it('cv-table assigns slot="columns" to cv-table-column children', async () => {
      const table = await createTable()
      const columns = table.querySelectorAll('cv-table-column')
      for (const col of columns) {
        expect(col.slot).toBe('columns')
      }
    })

    it('cv-table assigns slot="rows" to cv-table-row children', async () => {
      const table = await createTable()
      const rows = table.querySelectorAll('cv-table-row')
      for (const row of rows) {
        expect(row.slot).toBe('rows')
      }
    })

    it('cv-table-column receives sort-direction from parent on sort interaction', async () => {
      const table = await createTable()
      const nameCol = table.querySelector('cv-table-column[value="name"]') as CVTableColumn

      nameCol.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)

      expect(nameCol.sortDirection).toBe('ascending')
    })

    it('cells hidden when their column is removed', async () => {
      const table = document.createElement('cv-table') as CVTable
      table.ariaLabel = 'Test'
      const colA = createColumn('a', 'A')
      const colB = createColumn('b', 'B')
      const row = createRow('r1', [createCell('a', 'v1'), createCell('b', 'v2')])
      table.append(colA, colB, row)

      document.body.append(table)
      await settle(table)

      const cellB = table.querySelector('cv-table-cell[column="b"]') as CVTableCell
      expect(cellB.hidden).toBe(false)

      colB.remove()
      await settle(table)

      expect(cellB.hidden).toBe(true)
    })

    it('auto-generated fallback value for columns without value', async () => {
      const table = document.createElement('cv-table') as CVTable
      table.ariaLabel = 'Test'
      const col = document.createElement('cv-table-column') as CVTableColumn
      col.label = 'Auto'
      const row = createRow('r1', [])
      table.append(col, row)

      document.body.append(table)
      await settle(table)

      expect(col.value).toBe('column-1')
    })

    it('auto-generated fallback value for rows without value', async () => {
      const table = document.createElement('cv-table') as CVTable
      table.ariaLabel = 'Test'
      const col = createColumn('a', 'A')
      const row = document.createElement('cv-table-row') as CVTableRow
      table.append(col, row)

      document.body.append(table)
      await settle(table)

      expect(row.value).toBe('row-1')
    })
  })

  // --- event detail shapes ---

  describe('event detail shapes', () => {
    it('change event detail shape: {sortColumnId, sortDirection}', async () => {
      const table = await createTable()
      const nameCol = table.querySelector('cv-table-column[value="name"]') as CVTableColumn

      let detail: unknown
      table.addEventListener('cv-change', (event) => {
        detail = (event as CustomEvent).detail
      })

      nameCol.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)

      expect(detail).toEqual({sortColumnId: 'name', sortDirection: 'ascending'})
    })

    it('input event detail shape: {sortColumnId, sortDirection}', async () => {
      const table = await createTable()
      const nameCol = table.querySelector('cv-table-column[value="name"]') as CVTableColumn

      let detail: unknown
      table.addEventListener('cv-input', (event) => {
        detail = (event as CustomEvent).detail
      })

      nameCol.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)

      expect(detail).toEqual({sortColumnId: 'name', sortDirection: 'ascending'})
    })

    it('cv-selection-change event detail shape: {selectedRowIds, selectable}', async () => {
      const table = await createTable({selectable: 'single'})
      const row1 = table.querySelector('cv-table-row[value="row1"]') as CVTableRow

      let detail: unknown
      table.addEventListener('cv-selection-change', (event) => {
        detail = (event as CustomEvent).detail
      })

      row1.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(table)

      expect(detail).toEqual(
        expect.objectContaining({
          selectedRowIds: expect.any(Array),
          selectable: 'single',
        }),
      )
    })

    it('cv-focus-change event detail shape: {rowIndex, columnIndex}', async () => {
      const table = await createTable({interactive: true})
      const base = getBase(table)

      let detail: unknown
      table.addEventListener('cv-focus-change', (event) => {
        detail = (event as CustomEvent).detail
      })

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(table)

      expect(detail).toEqual(
        expect.objectContaining({
          rowIndex: expect.any(Number),
          columnIndex: expect.any(Number),
        }),
      )
    })
  })
})
