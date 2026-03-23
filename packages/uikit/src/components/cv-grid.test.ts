import {afterEach, describe, expect, it} from 'vitest'

import {CVGrid} from './cv-grid'
import {CVGridColumn} from './cv-grid-column'
import {CVGridRow} from './cv-grid-row'
import {CVGridCell} from './cv-grid-cell'

CVGrid.define()
CVGridColumn.define()
CVGridRow.define()
CVGridCell.define()

const settle = async (element: CVGrid) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

const createColumn = (value: string, label: string, params: {disabled?: boolean; index?: number} = {}) => {
  const column = document.createElement('cv-grid-column') as CVGridColumn
  column.value = value
  column.label = label
  column.textContent = label

  if (params.disabled) {
    column.disabled = true
  }

  if (params.index != null) {
    column.index = params.index
  }

  return column
}

const createCell = (column: string, text: string, params: {disabled?: boolean} = {}) => {
  const cell = document.createElement('cv-grid-cell') as CVGridCell
  cell.column = column
  cell.textContent = text

  if (params.disabled) {
    cell.disabled = true
  }

  return cell
}

const createRow = (
  value: string,
  cells: CVGridCell[],
  params: {disabled?: boolean; index?: number} = {},
) => {
  const row = document.createElement('cv-grid-row') as CVGridRow
  row.value = value

  if (params.disabled) {
    row.disabled = true
  }

  if (params.index != null) {
    row.index = params.index
  }

  row.append(...cells)
  return row
}

const createGrid = async (attrs?: Partial<CVGrid>) => {
  const el = document.createElement('cv-grid') as CVGrid
  el.ariaLabel = 'Test Grid'
  if (attrs) Object.assign(el, attrs)
  el.append(
    createColumn('c1', 'Col 1'),
    createColumn('c2', 'Col 2'),
    createColumn('c3', 'Col 3'),
    createRow('r1', [createCell('c1', 'A1'), createCell('c2', 'A2'), createCell('c3', 'A3')]),
    createRow('r2', [createCell('c1', 'B1'), createCell('c2', 'B2'), createCell('c3', 'B3')]),
    createRow('r3', [createCell('c1', 'C1'), createCell('c2', 'C2'), createCell('c3', 'C3')]),
  )
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVGrid) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

const getGridCell = (grid: CVGrid, rowId: string, colId: string) =>
  grid.querySelector(`cv-grid-row[value="${rowId}"] cv-grid-cell[column="${colId}"]`) as CVGridCell

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-grid', () => {
  // --- shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] with role="grid"', async () => {
      const grid = await createGrid()
      const base = getBase(grid)
      expect(base).not.toBeNull()
      expect(base.getAttribute('role')).toBe('grid')
    })

    it('renders [part="head"] with role="rowgroup"', async () => {
      const grid = await createGrid()
      const head = grid.shadowRoot!.querySelector('[part="head"]')
      expect(head).not.toBeNull()
      expect(head!.getAttribute('role')).toBe('rowgroup')
    })

    it('renders [part="head-row"] with role="row"', async () => {
      const grid = await createGrid()
      const headRow = grid.shadowRoot!.querySelector('[part="head-row"]')
      expect(headRow).not.toBeNull()
      expect(headRow!.getAttribute('role')).toBe('row')
    })

    it('renders [part="body"] with role="rowgroup"', async () => {
      const grid = await createGrid()
      const body = grid.shadowRoot!.querySelector('[part="body"]')
      expect(body).not.toBeNull()
      expect(body!.getAttribute('role')).toBe('rowgroup')
    })

    it('renders slot[name="columns"] inside head-row', async () => {
      const grid = await createGrid()
      const headRow = grid.shadowRoot!.querySelector('[part="head-row"]')
      const slot = headRow!.querySelector('slot[name="columns"]')
      expect(slot).not.toBeNull()
    })

    it('renders slot[name="rows"] inside body', async () => {
      const grid = await createGrid()
      const body = grid.shadowRoot!.querySelector('[part="body"]')
      const slot = body!.querySelector('slot[name="rows"]')
      expect(slot).not.toBeNull()
    })
  })

  // --- default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const grid = await createGrid()
      expect(grid.selectionMode).toBe('single')
      expect(grid.focusStrategy).toBe('roving-tabindex')
      expect(grid.selectionFollowsFocus).toBe(false)
      expect(grid.pageSize).toBe(10)
      expect(grid.readOnly).toBe(false)
      expect(grid.totalRowCount).toBe(0)
      expect(grid.totalColumnCount).toBe(0)
      expect(grid.selectedValues).toEqual([])
    })

    it('value defaults to first cell "r1::c1"', async () => {
      const grid = await createGrid()
      expect(grid.value).toBe('r1::c1')
    })
  })

  // --- attribute reflection ---

  describe('attribute reflection', () => {
    it('selection-mode attribute reflects', async () => {
      const grid = await createGrid({selectionMode: 'multiple'})
      expect(grid.getAttribute('selection-mode')).toBe('multiple')
    })

    it('focus-strategy attribute reflects', async () => {
      const grid = await createGrid({focusStrategy: 'aria-activedescendant'})
      expect(grid.getAttribute('focus-strategy')).toBe('aria-activedescendant')
    })

    it('selection-follows-focus boolean attribute reflects', async () => {
      const grid = await createGrid({selectionFollowsFocus: true})
      expect(grid.hasAttribute('selection-follows-focus')).toBe(true)
    })

    it('page-size attribute reflects', async () => {
      const grid = await createGrid({pageSize: 25})
      expect(grid.getAttribute('page-size')).toBe('25')
    })

    it('readonly boolean attribute reflects', async () => {
      const grid = await createGrid({readOnly: true})
      expect(grid.hasAttribute('readonly')).toBe(true)
    })

    it('value attribute reflects active cell key', async () => {
      const grid = await createGrid()
      expect(grid.getAttribute('value')).toBe('r1::c1')
    })

    it('total-row-count attribute reflects', async () => {
      const grid = await createGrid({totalRowCount: 100})
      expect(grid.getAttribute('total-row-count')).toBe('100')
    })

    it('total-column-count attribute reflects', async () => {
      const grid = await createGrid({totalColumnCount: 5})
      expect(grid.getAttribute('total-column-count')).toBe('5')
    })
  })

  // --- events ---

  describe('events', () => {
    it('emits input event with correct detail shape on keyboard navigation', async () => {
      const grid = await createGrid()
      const base = getBase(grid)
      let detail: unknown

      grid.addEventListener('cv-input', (e) => {
        detail = (e as CustomEvent).detail
      })

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)

      expect(detail).toEqual({
        value: 'r1::c2',
        activeCell: {rowId: 'r1', colId: 'c2'},
        selectedValues: expect.any(Array),
      })
    })

    it('emits change event with correct detail shape on keyboard navigation', async () => {
      const grid = await createGrid()
      const base = getBase(grid)
      let detail: unknown

      grid.addEventListener('cv-change', (e) => {
        detail = (e as CustomEvent).detail
      })

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)

      expect(detail).toEqual({
        value: 'r1::c2',
        activeCell: {rowId: 'r1', colId: 'c2'},
        selectedValues: expect.any(Array),
      })
    })

    it('emits input and change on cell click', async () => {
      const grid = await createGrid()
      let inputDetail: unknown
      let changeDetail: unknown

      grid.addEventListener('cv-input', (e) => {
        inputDetail = (e as CustomEvent).detail
      })
      grid.addEventListener('cv-change', (e) => {
        changeDetail = (e as CustomEvent).detail
      })

      const cell = getGridCell(grid, 'r2', 'c2')
      cell.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(grid)

      expect(inputDetail).toBeDefined()
      expect(changeDetail).toBeDefined()
      expect((inputDetail as {value: string}).value).toBe('r2::c2')
      expect((changeDetail as {value: string}).value).toBe('r2::c2')
    })

    it('event detail contains selectedValues as string[]', async () => {
      const grid = await createGrid({selectionMode: 'multiple'})
      let detail: {selectedValues: string[]} | undefined

      grid.addEventListener('cv-input', (e) => {
        detail = (e as CustomEvent).detail
      })

      const cell = getGridCell(grid, 'r1', 'c2')
      cell.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(grid)

      expect(detail).toBeDefined()
      expect(Array.isArray(detail!.selectedValues)).toBe(true)
    })

    it('both input and change fire together on interaction', async () => {
      const grid = await createGrid()
      const base = getBase(grid)
      const events: string[] = []

      grid.addEventListener('cv-input', () => events.push('cv-input'))
      grid.addEventListener('cv-change', () => events.push('cv-change'))

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(grid)

      expect(events).toEqual(['cv-input', 'cv-change'])
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('role="grid" on base', async () => {
      const grid = await createGrid()
      expect(getBase(grid).getAttribute('role')).toBe('grid')
    })

    it('aria-label on base from host aria-label', async () => {
      const grid = await createGrid()
      expect(getBase(grid).getAttribute('aria-label')).toBe('Test Grid')
    })

    it('aria-label falls back to "Grid" when no aria-label or aria-labelledby', async () => {
      const el = document.createElement('cv-grid') as CVGrid
      el.append(
        createColumn('c1', 'Col 1'),
        createRow('r1', [createCell('c1', 'A1')]),
      )
      document.body.append(el)
      await settle(el)

      expect(getBase(el).getAttribute('aria-label')).toBe('Grid')
    })

    it('aria-multiselectable="false" by default (single mode)', async () => {
      const grid = await createGrid()
      expect(getBase(grid).getAttribute('aria-multiselectable')).toBe('false')
    })

    it('aria-multiselectable="true" when selection-mode="multiple"', async () => {
      const grid = await createGrid({selectionMode: 'multiple'})
      expect(getBase(grid).getAttribute('aria-multiselectable')).toBe('true')
    })

    it('aria-colcount reflects number of columns', async () => {
      const grid = await createGrid()
      expect(getBase(grid).getAttribute('aria-colcount')).toBe('3')
    })

    it('aria-rowcount reflects number of rows', async () => {
      const grid = await createGrid()
      expect(getBase(grid).getAttribute('aria-rowcount')).toBe('3')
    })

    it('aria-colcount uses totalColumnCount when > 0', async () => {
      const grid = await createGrid({totalColumnCount: 20})
      expect(getBase(grid).getAttribute('aria-colcount')).toBe('20')
    })

    it('aria-rowcount uses totalRowCount when > 0', async () => {
      const grid = await createGrid({totalRowCount: 500})
      expect(getBase(grid).getAttribute('aria-rowcount')).toBe('500')
    })

    it('tabindex="-1" on base in roving-tabindex mode', async () => {
      const grid = await createGrid()
      expect(getBase(grid).getAttribute('tabindex')).toBe('-1')
    })

    it('tabindex="0" on base in aria-activedescendant mode', async () => {
      const grid = await createGrid({focusStrategy: 'aria-activedescendant'})
      expect(getBase(grid).getAttribute('tabindex')).toBe('0')
    })

    it('aria-activedescendant on base in aria-activedescendant mode', async () => {
      const grid = await createGrid({focusStrategy: 'aria-activedescendant'})
      const base = getBase(grid)
      expect(base.hasAttribute('aria-activedescendant')).toBe(true)
      expect(base.getAttribute('aria-activedescendant')).toContain('-cell-r1-c1')
    })

    it('no aria-activedescendant on base in roving-tabindex mode', async () => {
      const grid = await createGrid()
      expect(getBase(grid).hasAttribute('aria-activedescendant')).toBe(false)
    })

    it('rows have role="row" and aria-rowindex', async () => {
      const grid = await createGrid()
      const row = grid.querySelector('cv-grid-row[value="r1"]') as CVGridRow
      expect(row.getAttribute('role')).toBe('row')
      expect(row.getAttribute('aria-rowindex')).toBe('1')
    })

    it('cells have role="gridcell" and aria-colindex', async () => {
      const grid = await createGrid()
      const cell = getGridCell(grid, 'r1', 'c1')
      expect(cell.getAttribute('role')).toBe('gridcell')
      expect(cell.getAttribute('aria-colindex')).toBe('1')
    })

    it('active cell has data-active="true"', async () => {
      const grid = await createGrid()
      const cell = getGridCell(grid, 'r1', 'c1')
      expect(cell.getAttribute('data-active')).toBe('true')
    })

    it('non-active cells have data-active="false"', async () => {
      const grid = await createGrid()
      const cell = getGridCell(grid, 'r2', 'c2')
      expect(cell.getAttribute('data-active')).toBe('false')
    })

    it('cells have aria-selected="false" by default', async () => {
      const grid = await createGrid()
      const cell = getGridCell(grid, 'r2', 'c2')
      expect(cell.getAttribute('aria-selected')).toBe('false')
    })

    it('active cell has tabindex="0" in roving-tabindex mode', async () => {
      const grid = await createGrid()
      const cell = getGridCell(grid, 'r1', 'c1')
      expect(cell.getAttribute('tabindex')).toBe('0')
    })

    it('non-active cells have tabindex="-1" in roving-tabindex mode', async () => {
      const grid = await createGrid()
      const cell = getGridCell(grid, 'r2', 'c2')
      expect(cell.getAttribute('tabindex')).toBe('-1')
    })

    it('all cells have tabindex="-1" in aria-activedescendant mode', async () => {
      const grid = await createGrid({focusStrategy: 'aria-activedescendant'})
      const activeCell = getGridCell(grid, 'r1', 'c1')
      const otherCell = getGridCell(grid, 'r2', 'c2')
      expect(activeCell.getAttribute('tabindex')).toBe('-1')
      expect(otherCell.getAttribute('tabindex')).toBe('-1')
    })

    it('readonly sets aria-readonly="true" on cells', async () => {
      const grid = await createGrid({readOnly: true})
      const cell = getGridCell(grid, 'r1', 'c1')
      expect(cell.getAttribute('aria-readonly')).toBe('true')
    })

    it('no aria-readonly on cells when not readonly', async () => {
      const grid = await createGrid()
      const cell = getGridCell(grid, 'r1', 'c1')
      expect(cell.hasAttribute('aria-readonly')).toBe(false)
    })

    it('column headers have role="columnheader"', async () => {
      const grid = await createGrid()
      const col = grid.querySelector('cv-grid-column[value="c1"]') as CVGridColumn
      expect(col.getAttribute('role')).toBe('columnheader')
    })

    it('column headers have aria-colindex', async () => {
      const grid = await createGrid()
      const col1 = grid.querySelector('cv-grid-column[value="c1"]') as CVGridColumn
      const col2 = grid.querySelector('cv-grid-column[value="c2"]') as CVGridColumn
      expect(col1.getAttribute('aria-colindex')).toBe('1')
      expect(col2.getAttribute('aria-colindex')).toBe('2')
    })

    it('disabled column has aria-disabled="true"', async () => {
      const el = document.createElement('cv-grid') as CVGrid
      el.ariaLabel = 'Test Grid'
      el.append(
        createColumn('c1', 'Col 1', {disabled: true}),
        createColumn('c2', 'Col 2'),
        createRow('r1', [createCell('c1', 'A1'), createCell('c2', 'A2')]),
      )
      document.body.append(el)
      await settle(el)

      const col = el.querySelector('cv-grid-column[value="c1"]') as CVGridColumn
      expect(col.getAttribute('aria-disabled')).toBe('true')
    })
  })

  // --- keyboard navigation ---

  describe('keyboard navigation', () => {
    it('ArrowRight moves active cell right', async () => {
      const grid = await createGrid()
      const base = getBase(grid)
      expect(grid.value).toBe('r1::c1')

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::c2')
    })

    it('ArrowLeft moves active cell left', async () => {
      const grid = await createGrid()
      const base = getBase(grid)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::c2')

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::c1')
    })

    it('ArrowDown moves active cell down', async () => {
      const grid = await createGrid()
      const base = getBase(grid)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r2::c1')
    })

    it('ArrowUp moves active cell up', async () => {
      const grid = await createGrid()
      const base = getBase(grid)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(grid)
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::c1')
    })

    it('Home moves to first cell in current row', async () => {
      const grid = await createGrid()
      const base = getBase(grid)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::c3')

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::c1')
    })

    it('End moves to last cell in current row', async () => {
      const grid = await createGrid()
      const base = getBase(grid)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::c3')
    })

    it('Ctrl+Home moves to first cell in grid', async () => {
      const grid = await createGrid()
      const base = getBase(grid)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', ctrlKey: true, bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::c1')
    })

    it('Ctrl+End moves to last cell in grid', async () => {
      const grid = await createGrid()
      const base = getBase(grid)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', ctrlKey: true, bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r3::c3')
    })

    it('Meta+Home moves to first cell in grid', async () => {
      const grid = await createGrid()
      const base = getBase(grid)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(grid)
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', metaKey: true, bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::c1')
    })

    it('Meta+End moves to last cell in grid', async () => {
      const grid = await createGrid()
      const base = getBase(grid)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', metaKey: true, bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r3::c3')
    })

    it('PageDown moves down by page-size rows', async () => {
      const grid = await createGrid({pageSize: 2})
      const base = getBase(grid)
      expect(grid.value).toBe('r1::c1')

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'PageDown', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r3::c1')
    })

    it('PageUp moves up by page-size rows', async () => {
      const grid = await createGrid({pageSize: 2})
      const base = getBase(grid)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', ctrlKey: true, bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r3::c3')

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'PageUp', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::c3')
    })

    it('Enter moves active cell down', async () => {
      const grid = await createGrid()
      const base = getBase(grid)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r2::c1')
    })

    it('Space selects active cell in single mode', async () => {
      const grid = await createGrid()
      const base = getBase(grid)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(grid)
      expect(grid.selectedValues).toContain('r1::c1')
    })

    it('Space toggles selection in multiple mode', async () => {
      const grid = await createGrid({selectionMode: 'multiple'})
      const base = getBase(grid)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(grid)
      expect(grid.selectedValues).toContain('r1::c1')

      base.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(grid)
      expect(grid.selectedValues).not.toContain('r1::c1')
    })

    it('does not move beyond grid boundaries', async () => {
      const grid = await createGrid()
      const base = getBase(grid)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::c1')

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::c1')
    })

    it('skips disabled cells during navigation', async () => {
      const el = document.createElement('cv-grid') as CVGrid
      el.ariaLabel = 'Test Grid'
      el.append(
        createColumn('c1', 'Col 1'),
        createColumn('c2', 'Col 2'),
        createColumn('c3', 'Col 3'),
        createRow('r1', [
          createCell('c1', 'A1'),
          createCell('c2', 'A2', {disabled: true}),
          createCell('c3', 'A3'),
        ]),
      )
      document.body.append(el)
      await settle(el)

      const base = getBase(el)
      expect(el.value).toBe('r1::c1')

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)
      expect(el.value).toBe('r1::c3')
    })

    it('preventDefault is called on handled keys', async () => {
      const grid = await createGrid()
      const base = getBase(grid)
      const event = new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true, cancelable: true})

      base.dispatchEvent(event)
      await settle(grid)

      expect(event.defaultPrevented).toBe(true)
    })
  })

  // --- selection ---

  describe('selection', () => {
    it('plain click selects and activates a cell', async () => {
      const grid = await createGrid()
      const cell = getGridCell(grid, 'r2', 'c2')

      cell.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(grid)

      expect(grid.value).toBe('r2::c2')
      expect(grid.selectedValues).toContain('r2::c2')
    })

    it('Ctrl+click toggles selection in multiple mode', async () => {
      const grid = await createGrid({selectionMode: 'multiple'})

      const r1c1 = getGridCell(grid, 'r1', 'c1')
      const r2c2 = getGridCell(grid, 'r2', 'c2')

      r1c1.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(grid)
      expect(grid.selectedValues).toEqual(['r1::c1'])

      r2c2.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true, ctrlKey: true}))
      await settle(grid)
      expect(new Set(grid.selectedValues)).toEqual(new Set(['r1::c1', 'r2::c2']))
    })

    it('Meta+click toggles selection in multiple mode', async () => {
      const grid = await createGrid({selectionMode: 'multiple'})

      const r1c1 = getGridCell(grid, 'r1', 'c1')
      const r2c2 = getGridCell(grid, 'r2', 'c2')

      r1c1.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(grid)

      r2c2.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true, metaKey: true}))
      await settle(grid)
      expect(new Set(grid.selectedValues)).toEqual(new Set(['r1::c1', 'r2::c2']))

      r1c1.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true, metaKey: true}))
      await settle(grid)
      expect(grid.selectedValues).toEqual(['r2::c2'])
    })

    it('single mode replaces selection on click', async () => {
      const grid = await createGrid()

      getGridCell(grid, 'r1', 'c1').dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(grid)
      expect(grid.selectedValues).toEqual(['r1::c1'])

      getGridCell(grid, 'r2', 'c2').dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(grid)
      expect(grid.selectedValues).toEqual(['r2::c2'])
    })

    it('selectionFollowsFocus auto-selects on keyboard navigation', async () => {
      const grid = await createGrid({selectionFollowsFocus: true})
      const base = getBase(grid)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r2::c1')
      expect(grid.selectedValues).toEqual(['r2::c1'])

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r2::c2')
      expect(grid.selectedValues).toEqual(['r2::c2'])
    })

    it('selectedValues property can be set programmatically', async () => {
      const grid = await createGrid({selectionMode: 'multiple'})
      grid.selectedValues = ['r1::c1', 'r2::c2']
      await settle(grid)

      const cell1 = getGridCell(grid, 'r1', 'c1')
      const cell2 = getGridCell(grid, 'r2', 'c2')
      expect(cell1.getAttribute('aria-selected')).toBe('true')
      expect(cell2.getAttribute('aria-selected')).toBe('true')
    })
  })

  // --- disabled states ---

  describe('disabled states', () => {
    it('disabled cell ignores click', async () => {
      const el = document.createElement('cv-grid') as CVGrid
      el.ariaLabel = 'Test Grid'
      el.append(
        createColumn('c1', 'Col 1'),
        createColumn('c2', 'Col 2'),
        createRow('r1', [createCell('c1', 'A1'), createCell('c2', 'A2', {disabled: true})]),
        createRow('r2', [createCell('c1', 'B1'), createCell('c2', 'B2')]),
      )
      document.body.append(el)
      await settle(el)

      const disabledCell = getGridCell(el, 'r1', 'c2')
      let eventCount = 0
      el.addEventListener('cv-input', () => eventCount++)

      disabledCell.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(eventCount).toBe(0)
    })

    it('disabled cell has aria-disabled="true"', async () => {
      const el = document.createElement('cv-grid') as CVGrid
      el.ariaLabel = 'Test Grid'
      el.append(
        createColumn('c1', 'Col 1'),
        createRow('r1', [createCell('c1', 'A1', {disabled: true})]),
        createRow('r2', [createCell('c1', 'B1')]),
      )
      document.body.append(el)
      await settle(el)

      const cell = getGridCell(el, 'r1', 'c1')
      expect(cell.getAttribute('aria-disabled')).toBe('true')
    })

    it('disabled row makes all its cells disabled', async () => {
      const el = document.createElement('cv-grid') as CVGrid
      el.ariaLabel = 'Test Grid'
      el.append(
        createColumn('c1', 'Col 1'),
        createColumn('c2', 'Col 2'),
        createRow('r1', [createCell('c1', 'A1'), createCell('c2', 'A2')], {disabled: true}),
        createRow('r2', [createCell('c1', 'B1'), createCell('c2', 'B2')]),
      )
      document.body.append(el)
      await settle(el)

      const cell1 = getGridCell(el, 'r1', 'c1')
      const cell2 = getGridCell(el, 'r1', 'c2')
      expect(cell1.getAttribute('aria-disabled')).toBe('true')
      expect(cell2.getAttribute('aria-disabled')).toBe('true')
    })

    it('disabled column makes all its cells disabled', async () => {
      const el = document.createElement('cv-grid') as CVGrid
      el.ariaLabel = 'Test Grid'
      el.append(
        createColumn('c1', 'Col 1', {disabled: true}),
        createColumn('c2', 'Col 2'),
        createRow('r1', [createCell('c1', 'A1'), createCell('c2', 'A2')]),
        createRow('r2', [createCell('c1', 'B1'), createCell('c2', 'B2')]),
      )
      document.body.append(el)
      await settle(el)

      const cell1 = getGridCell(el, 'r1', 'c1')
      const cell2 = getGridCell(el, 'r2', 'c1')
      expect(cell1.getAttribute('aria-disabled')).toBe('true')
      expect(cell2.getAttribute('aria-disabled')).toBe('true')
    })

    it('readonly mode sets aria-readonly on all cells', async () => {
      const grid = await createGrid({readOnly: true})
      const cell1 = getGridCell(grid, 'r1', 'c1')
      const cell2 = getGridCell(grid, 'r2', 'c2')
      const cell3 = getGridCell(grid, 'r3', 'c3')
      expect(cell1.getAttribute('aria-readonly')).toBe('true')
      expect(cell2.getAttribute('aria-readonly')).toBe('true')
      expect(cell3.getAttribute('aria-readonly')).toBe('true')
    })
  })

  // --- headless contract delegation ---

  describe('headless contract delegation', () => {
    it('grid root attributes match getGridProps() output', async () => {
      const grid = await createGrid()
      const base = getBase(grid)

      expect(base.getAttribute('role')).toBe('grid')
      expect(base.hasAttribute('id')).toBe(true)
      expect(base.getAttribute('aria-label')).toBe('Test Grid')
      expect(base.getAttribute('aria-multiselectable')).toBe('false')
      expect(base.hasAttribute('aria-colcount')).toBe(true)
      expect(base.hasAttribute('aria-rowcount')).toBe(true)
    })

    it('row attributes match getRowProps() output', async () => {
      const grid = await createGrid()
      const row = grid.querySelector('cv-grid-row[value="r2"]') as CVGridRow

      expect(row.hasAttribute('id')).toBe(true)
      expect(row.getAttribute('id')).toContain('-row-r2')
      expect(row.getAttribute('role')).toBe('row')
      expect(row.getAttribute('aria-rowindex')).toBe('2')
    })

    it('cell attributes match getCellProps() output', async () => {
      const grid = await createGrid()
      const cell = getGridCell(grid, 'r1', 'c1')

      expect(cell.hasAttribute('id')).toBe(true)
      expect(cell.getAttribute('id')).toContain('-cell-r1-c1')
      expect(cell.getAttribute('role')).toBe('gridcell')
      expect(cell.getAttribute('tabindex')).toBe('0')
      expect(cell.getAttribute('aria-colindex')).toBe('1')
      expect(cell.getAttribute('aria-selected')).toBeDefined()
      expect(cell.getAttribute('data-active')).toBe('true')
    })

    it('ARIA attributes update when headless state changes', async () => {
      const grid = await createGrid()
      const base = getBase(grid)

      const cellBefore = getGridCell(grid, 'r1', 'c1')
      expect(cellBefore.getAttribute('data-active')).toBe('true')

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(grid)

      expect(cellBefore.getAttribute('data-active')).toBe('false')
      const cellAfter = getGridCell(grid, 'r2', 'c1')
      expect(cellAfter.getAttribute('data-active')).toBe('true')
    })

    it('aria-activedescendant updates with active cell in activedescendant mode', async () => {
      const grid = await createGrid({focusStrategy: 'aria-activedescendant'})
      const base = getBase(grid)

      const initialId = base.getAttribute('aria-activedescendant')
      expect(initialId).toContain('-cell-r1-c1')

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)

      expect(base.getAttribute('aria-activedescendant')).toContain('-cell-r1-c2')
    })
  })

  // --- cv-grid-column ---

  describe('cv-grid-column', () => {
    it('has correct default property values', () => {
      const col = document.createElement('cv-grid-column') as CVGridColumn
      expect(col.value).toBe('')
      expect(col.label).toBe('')
      expect(col.index).toBe(0)
      expect(col.disabled).toBe(false)
    })

    it('reflects value attribute', async () => {
      const col = document.createElement('cv-grid-column') as CVGridColumn
      col.value = 'test'
      document.body.append(col)
      await col.updateComplete
      expect(col.getAttribute('value')).toBe('test')
    })

    it('reflects label attribute', async () => {
      const col = document.createElement('cv-grid-column') as CVGridColumn
      col.label = 'Test Label'
      document.body.append(col)
      await col.updateComplete
      expect(col.getAttribute('label')).toBe('Test Label')
    })

    it('reflects disabled attribute', async () => {
      const col = document.createElement('cv-grid-column') as CVGridColumn
      col.disabled = true
      document.body.append(col)
      await col.updateComplete
      expect(col.hasAttribute('disabled')).toBe(true)
    })

    it('renders default slot with label fallback', async () => {
      const col = document.createElement('cv-grid-column') as CVGridColumn
      col.label = 'Fallback'
      document.body.append(col)
      await col.updateComplete
      const slot = col.shadowRoot!.querySelector('slot')
      expect(slot).not.toBeNull()
    })

    it('auto-generates column id when value is empty', async () => {
      const el = document.createElement('cv-grid') as CVGrid
      el.ariaLabel = 'Test'
      const col = document.createElement('cv-grid-column') as CVGridColumn
      col.textContent = 'Auto'
      el.append(col, createRow('r1', [createCell('', 'Cell')]))
      document.body.append(el)
      await settle(el)

      expect(col.value).toBe('column-1')
    })
  })

  // --- cv-grid-row ---

  describe('cv-grid-row', () => {
    it('has correct default property values', () => {
      const row = document.createElement('cv-grid-row') as CVGridRow
      expect(row.value).toBe('')
      expect(row.index).toBe(0)
      expect(row.disabled).toBe(false)
    })

    it('reflects value attribute', async () => {
      const row = document.createElement('cv-grid-row') as CVGridRow
      row.value = 'test-row'
      document.body.append(row)
      await row.updateComplete
      expect(row.getAttribute('value')).toBe('test-row')
    })

    it('reflects disabled attribute', async () => {
      const row = document.createElement('cv-grid-row') as CVGridRow
      row.disabled = true
      document.body.append(row)
      await row.updateComplete
      expect(row.hasAttribute('disabled')).toBe(true)
    })

    it('renders default slot for cell children', async () => {
      const row = document.createElement('cv-grid-row') as CVGridRow
      document.body.append(row)
      await row.updateComplete
      const slot = row.shadowRoot!.querySelector('slot')
      expect(slot).not.toBeNull()
    })

    it('dispatches cv-grid-row-slotchange on cell changes', async () => {
      const el = document.createElement('cv-grid') as CVGrid
      el.ariaLabel = 'Test'
      const row = createRow('r1', [createCell('c1', 'A1')])
      el.append(createColumn('c1', 'Col 1'), createColumn('c2', 'Col 2'), row)
      document.body.append(el)
      await settle(el)

      let eventFired = false
      el.addEventListener('cv-grid-row-slotchange', () => {
        eventFired = true
      })

      row.append(createCell('c2', 'A2'))
      await settle(el)

      expect(eventFired).toBe(true)
    })

    it('auto-generates row id when value is empty', async () => {
      const el = document.createElement('cv-grid') as CVGrid
      el.ariaLabel = 'Test'
      const row = document.createElement('cv-grid-row') as CVGridRow
      row.append(createCell('c1', 'Cell'))
      el.append(createColumn('c1', 'Col 1'), row)
      document.body.append(el)
      await settle(el)

      expect(row.value).toBe('row-1')
    })
  })

  // --- cv-grid-cell ---

  describe('cv-grid-cell', () => {
    it('has correct default property values', () => {
      const cell = document.createElement('cv-grid-cell') as CVGridCell
      expect(cell.column).toBe('')
      expect(cell.disabled).toBe(false)
      expect(cell.active).toBe(false)
      expect(cell.selected).toBe(false)
    })

    it('reflects column attribute', async () => {
      const cell = document.createElement('cv-grid-cell') as CVGridCell
      cell.column = 'test-col'
      document.body.append(cell)
      await cell.updateComplete
      expect(cell.getAttribute('column')).toBe('test-col')
    })

    it('reflects disabled attribute', async () => {
      const cell = document.createElement('cv-grid-cell') as CVGridCell
      cell.disabled = true
      document.body.append(cell)
      await cell.updateComplete
      expect(cell.hasAttribute('disabled')).toBe(true)
    })

    it('reflects active attribute', async () => {
      const cell = document.createElement('cv-grid-cell') as CVGridCell
      cell.active = true
      document.body.append(cell)
      await cell.updateComplete
      expect(cell.hasAttribute('active')).toBe(true)
    })

    it('reflects selected attribute', async () => {
      const cell = document.createElement('cv-grid-cell') as CVGridCell
      cell.selected = true
      document.body.append(cell)
      await cell.updateComplete
      expect(cell.hasAttribute('selected')).toBe(true)
    })

    it('renders default slot for cell content', async () => {
      const cell = document.createElement('cv-grid-cell') as CVGridCell
      document.body.append(cell)
      await cell.updateComplete
      const slot = cell.shadowRoot!.querySelector('slot')
      expect(slot).not.toBeNull()
    })

    it('cell referencing non-existent column is hidden', async () => {
      const el = document.createElement('cv-grid') as CVGrid
      el.ariaLabel = 'Test'
      el.append(
        createColumn('c1', 'Col 1'),
        createRow('r1', [createCell('c1', 'Valid'), createCell('nonexistent', 'Invalid')]),
      )
      document.body.append(el)
      await settle(el)

      const invalidCell = el.querySelector('cv-grid-cell[column="nonexistent"]') as CVGridCell
      expect(invalidCell.hidden).toBe(true)
    })

    it('active cell property is synced by parent grid', async () => {
      const grid = await createGrid()
      const activeCell = getGridCell(grid, 'r1', 'c1')
      const otherCell = getGridCell(grid, 'r2', 'c2')

      expect(activeCell.active).toBe(true)
      expect(otherCell.active).toBe(false)
    })

    it('selected cell property is synced by parent grid after click', async () => {
      const grid = await createGrid()
      const cell = getGridCell(grid, 'r2', 'c2')

      cell.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(grid)

      expect(cell.selected).toBe(true)
    })
  })

  // --- slot rebuild / model preservation ---

  describe('slot rebuild and state preservation', () => {
    it('preserves valid active and selected state on row removal', async () => {
      const grid = await createGrid({selectionMode: 'multiple'})

      const row1 = grid.querySelector('cv-grid-row[value="r1"]') as CVGridRow

      getGridCell(grid, 'r1', 'c2').dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      getGridCell(grid, 'r2', 'c1').dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true, ctrlKey: true}))
      await settle(grid)

      expect(new Set(grid.selectedValues)).toEqual(new Set(['r1::c2', 'r2::c1']))
      expect(grid.value).toBe('r2::c1')

      row1.remove()
      await settle(grid)

      expect(grid.selectedValues).toEqual(['r2::c1'])
      expect(grid.value).toBe('r2::c1')
    })

    it('rebuilds model on column addition', async () => {
      const grid = await createGrid()
      const initialColCount = getBase(grid).getAttribute('aria-colcount')
      expect(initialColCount).toBe('3')

      grid.append(createColumn('c4', 'Col 4'))
      await settle(grid)

      const newColCount = getBase(grid).getAttribute('aria-colcount')
      expect(newColCount).toBe('4')
    })

    it('rebuilds model on option attribute change', async () => {
      const grid = await createGrid()
      expect(getBase(grid).getAttribute('aria-multiselectable')).toBe('false')

      grid.selectionMode = 'multiple'
      await settle(grid)
      expect(getBase(grid).getAttribute('aria-multiselectable')).toBe('true')
    })
  })

  // --- dynamic state updates ---

  describe('dynamic state updates', () => {
    it('programmatic value change moves active cell', async () => {
      const grid = await createGrid()
      expect(grid.value).toBe('r1::c1')

      grid.value = 'r2::c3'
      await settle(grid)
      expect(grid.value).toBe('r2::c3')
      expect(getGridCell(grid, 'r2', 'c3').getAttribute('data-active')).toBe('true')
    })

    it('changing readonly at runtime updates aria-readonly on cells', async () => {
      const grid = await createGrid()
      expect(getGridCell(grid, 'r1', 'c1').hasAttribute('aria-readonly')).toBe(false)

      grid.readOnly = true
      await settle(grid)
      expect(getGridCell(grid, 'r1', 'c1').getAttribute('aria-readonly')).toBe('true')

      grid.readOnly = false
      await settle(grid)
      expect(getGridCell(grid, 'r1', 'c1').hasAttribute('aria-readonly')).toBe(false)
    })

    it('changing focus-strategy at runtime updates tabindex behavior', async () => {
      const grid = await createGrid()
      expect(getBase(grid).getAttribute('tabindex')).toBe('-1')

      grid.focusStrategy = 'aria-activedescendant'
      await settle(grid)
      expect(getBase(grid).getAttribute('tabindex')).toBe('0')
      expect(getBase(grid).hasAttribute('aria-activedescendant')).toBe(true)
    })

    it('changing aria-label at runtime updates base aria-label', async () => {
      const grid = await createGrid()
      expect(getBase(grid).getAttribute('aria-label')).toBe('Test Grid')

      grid.ariaLabel = 'Updated Label'
      await settle(grid)
      expect(getBase(grid).getAttribute('aria-label')).toBe('Updated Label')
    })
  })
})
