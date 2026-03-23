import {afterEach, describe, expect, it} from 'vitest'

import {CVTreegrid} from './cv-treegrid'
import {CVTreegridCell} from './cv-treegrid-cell'
import {CVTreegridColumn} from './cv-treegrid-column'
import {CVTreegridRow} from './cv-treegrid-row'

CVTreegrid.define()
CVTreegridColumn.define()
CVTreegridRow.define()
CVTreegridCell.define()

interface CVTreegridEventDetail {
  value: string | null
  activeCell: {rowId: string; colId: string} | null
  selectedValues: string[]
  expandedValues: string[]
}

const settle = async (element: CVTreegrid) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createColumn = (
  value: string,
  label: string,
  params: {cellRole?: 'rowheader' | 'columnheader' | 'gridcell'; disabled?: boolean} = {},
) => {
  const column = document.createElement('cv-treegrid-column') as CVTreegridColumn
  column.value = value
  column.label = label
  if (params.disabled) column.disabled = true
  if (params.cellRole) column.cellRole = params.cellRole
  column.textContent = label
  return column
}

const createCell = (column: string, text: string, params: {disabled?: boolean} = {}) => {
  const cell = document.createElement('cv-treegrid-cell') as CVTreegridCell
  cell.column = column
  cell.textContent = text
  if (params.disabled) cell.disabled = true
  return cell
}

const createRow = (
  value: string,
  cells: CVTreegridCell[],
  params: {children?: CVTreegridRow[]; disabled?: boolean; index?: number} = {},
) => {
  const row = document.createElement('cv-treegrid-row') as CVTreegridRow
  row.value = value
  if (params.disabled) row.disabled = true
  if (params.index != null) row.index = params.index
  row.append(...cells, ...(params.children ?? []))
  return row
}

const createTreegrid = async (attrs?: Partial<CVTreegrid>) => {
  const el = document.createElement('cv-treegrid') as CVTreegrid
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (grid: CVTreegrid) => grid.shadowRoot!.querySelector('[part="base"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-treegrid', () => {
  // --- shadow DOM structure ---

  describe('shadow DOM structure', () => {
    describe('cv-treegrid', () => {
      it('renders [part="base"] as a div', async () => {
        const grid = await createTreegrid({ariaLabel: 'Test'})
        const base = getBase(grid)
        expect(base).not.toBeNull()
        expect(base.tagName.toLowerCase()).toBe('div')
      })

      it('[part="base"] has role="treegrid"', async () => {
        const grid = await createTreegrid({ariaLabel: 'Test'})
        expect(getBase(grid).getAttribute('role')).toBe('treegrid')
      })

      it('[part="base"] contains a default slot', async () => {
        const grid = await createTreegrid({ariaLabel: 'Test'})
        const slot = getBase(grid).querySelector('slot:not([name])')
        expect(slot).not.toBeNull()
      })
    })

    describe('cv-treegrid-row', () => {
      it('renders [part="row"] div', async () => {
        CVTreegridRow.define()
        const row = document.createElement('cv-treegrid-row') as CVTreegridRow
        document.body.append(row)
        await row.updateComplete
        const rowPart = row.shadowRoot!.querySelector('[part="row"]')
        expect(rowPart).not.toBeNull()
        expect(rowPart!.tagName.toLowerCase()).toBe('div')
      })

      it('renders [part="children"] div with default slot[name="children"]', async () => {
        CVTreegridRow.define()
        const row = document.createElement('cv-treegrid-row') as CVTreegridRow
        document.body.append(row)
        await row.updateComplete
        const childrenPart = row.shadowRoot!.querySelector('[part="children"]')
        expect(childrenPart).not.toBeNull()
        const childrenSlot = childrenPart!.querySelector('slot[name="children"]')
        expect(childrenSlot).not.toBeNull()
      })

      it('[part="row"] has a default slot for cv-treegrid-cell children', async () => {
        CVTreegridRow.define()
        const row = document.createElement('cv-treegrid-row') as CVTreegridRow
        document.body.append(row)
        await row.updateComplete
        const rowPart = row.shadowRoot!.querySelector('[part="row"]')
        const slot = rowPart!.querySelector('slot:not([name])')
        expect(slot).not.toBeNull()
      })
    })

    describe('cv-treegrid-cell', () => {
      it('renders a slot element for cell content', async () => {
        CVTreegridCell.define()
        const cell = document.createElement('cv-treegrid-cell') as CVTreegridCell
        document.body.append(cell)
        await cell.updateComplete
        const slot = cell.shadowRoot!.querySelector('slot')
        expect(slot).not.toBeNull()
      })
    })

    describe('cv-treegrid-column', () => {
      it('renders a span containing a slot', async () => {
        CVTreegridColumn.define()
        const col = document.createElement('cv-treegrid-column') as CVTreegridColumn
        document.body.append(col)
        await col.updateComplete
        const span = col.shadowRoot!.querySelector('span')
        expect(span).not.toBeNull()
        const slot = span!.querySelector('slot')
        expect(slot).not.toBeNull()
      })
    })
  })

  // --- default property values ---

  describe('default property values', () => {
    describe('cv-treegrid', () => {
      it('has correct defaults', async () => {
        const grid = await createTreegrid()
        expect(grid.value).toBe('')
        expect(grid.selectedValues).toEqual([])
        expect(grid.expandedValues).toEqual([])
        expect(grid.selectionMode).toBe('single')
        expect(grid.ariaLabel).toBe('')
        expect(grid.ariaLabelledBy).toBe('')
      })
    })

    describe('cv-treegrid-row', () => {
      it('has correct defaults', async () => {
        const row = document.createElement('cv-treegrid-row') as CVTreegridRow
        document.body.append(row)
        await row.updateComplete
        expect(row.value).toBe('')
        expect(row.index).toBe(0)
        expect(row.disabled).toBe(false)
        expect(row.active).toBe(false)
        expect(row.selected).toBe(false)
        expect(row.expanded).toBe(false)
        expect(row.branch).toBe(false)
        expect(row.level).toBe(1)
      })
    })

    describe('cv-treegrid-cell', () => {
      it('has correct defaults', async () => {
        const cell = document.createElement('cv-treegrid-cell') as CVTreegridCell
        document.body.append(cell)
        await cell.updateComplete
        expect(cell.column).toBe('')
        expect(cell.disabled).toBe(false)
        expect(cell.active).toBe(false)
        expect(cell.selected).toBe(false)
      })
    })

    describe('cv-treegrid-column', () => {
      it('has correct defaults', async () => {
        const col = document.createElement('cv-treegrid-column') as CVTreegridColumn
        document.body.append(col)
        await col.updateComplete
        expect(col.value).toBe('')
        expect(col.label).toBe('')
        expect(col.index).toBe(0)
        expect(col.disabled).toBe(false)
        expect(col.cellRole).toBe('gridcell')
      })
    })
  })

  // --- attribute reflection ---

  describe('attribute reflection', () => {
    it('cv-treegrid: value reflects to attribute', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(createColumn('name', 'Name'), createRow('r1', [createCell('name', 'Root')]))
      await settle(grid)
      expect(grid.hasAttribute('value')).toBe(true)
    })

    it('cv-treegrid: selection-mode reflects to attribute', async () => {
      const grid = await createTreegrid({selectionMode: 'multiple'})
      expect(grid.getAttribute('selection-mode')).toBe('multiple')
    })

    it('cv-treegrid-row: boolean attrs reflect — disabled, active, selected, expanded, branch', async () => {
      const row = document.createElement('cv-treegrid-row') as CVTreegridRow
      row.disabled = true
      row.active = true
      row.selected = true
      row.expanded = true
      row.branch = true
      document.body.append(row)
      await row.updateComplete
      expect(row.hasAttribute('disabled')).toBe(true)
      expect(row.hasAttribute('active')).toBe(true)
      expect(row.hasAttribute('selected')).toBe(true)
      expect(row.hasAttribute('expanded')).toBe(true)
      expect(row.hasAttribute('branch')).toBe(true)
    })

    it('cv-treegrid-row: level reflects as number attribute', async () => {
      const row = document.createElement('cv-treegrid-row') as CVTreegridRow
      row.level = 3
      document.body.append(row)
      await row.updateComplete
      expect(row.getAttribute('level')).toBe('3')
    })

    it('cv-treegrid-cell: boolean attrs reflect — disabled, active, selected', async () => {
      const cell = document.createElement('cv-treegrid-cell') as CVTreegridCell
      cell.disabled = true
      cell.active = true
      cell.selected = true
      document.body.append(cell)
      await cell.updateComplete
      expect(cell.hasAttribute('disabled')).toBe(true)
      expect(cell.hasAttribute('active')).toBe(true)
      expect(cell.hasAttribute('selected')).toBe(true)
    })

    it('cv-treegrid-column: boolean attr disabled reflects', async () => {
      const col = document.createElement('cv-treegrid-column') as CVTreegridColumn
      col.disabled = true
      document.body.append(col)
      await col.updateComplete
      expect(col.hasAttribute('disabled')).toBe(true)
    })

    it('cv-treegrid-column: cell-role attribute reflects', async () => {
      const col = document.createElement('cv-treegrid-column') as CVTreegridColumn
      col.cellRole = 'rowheader'
      document.body.append(col)
      await col.updateComplete
      expect(col.getAttribute('cell-role')).toBe('rowheader')
    })
  })

  // --- events ---

  describe('events', () => {
    it('emits "cv-input" event name on keyboard navigation change', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')]),
        createRow('r2', [createCell('name', 'B')]),
      )
      await settle(grid)

      const events: string[] = []
      grid.addEventListener('cv-input', () => events.push('cv-input'))

      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(grid)

      expect(events).toContain('cv-input')
    })

    it('emits "cv-change" event name on selection change', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(createColumn('name', 'Name'), createRow('r1', [createCell('name', 'A')]))
      await settle(grid)

      const events: string[] = []
      grid.addEventListener('cv-change', () => events.push('cv-change'))

      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(grid)

      expect(events).toContain('cv-change')
    })

    it('event detail has shape {value, activeCell, selectedValues, expandedValues}', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {
          children: [createRow('r1a', [createCell('name', 'A1')])],
        }),
      )
      await settle(grid)

      let inputDetail: unknown
      grid.addEventListener('cv-input', (e) => {
        inputDetail = (e as CustomEvent).detail
      })

      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)

      expect(inputDetail).toMatchObject({
        value: expect.any(String),
        activeCell: expect.objectContaining({rowId: expect.any(String), colId: expect.any(String)}),
        selectedValues: expect.any(Array),
        expandedValues: expect.any(Array),
      })
    })

    it('input detail.value is null when no cell is active', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      document.body.append(grid)
      // no rows — value stays ''
      await settle(grid)
      expect(grid.value).toBe('')
    })

    it('input fires on active-cell-only change (ArrowDown), change does NOT fire', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')]),
        createRow('r2', [createCell('name', 'B')]),
      )
      await settle(grid)

      let inputCount = 0
      let changeCount = 0
      grid.addEventListener('cv-input', () => inputCount++)
      grid.addEventListener('cv-change', () => changeCount++)

      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(grid)

      expect(inputCount).toBe(1)
      expect(changeCount).toBe(0)
    })

    it('both input and change fire when selection changes (Enter)', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(createColumn('name', 'Name'), createRow('r1', [createCell('name', 'A')]))
      await settle(grid)

      let inputCount = 0
      let changeCount = 0
      grid.addEventListener('cv-input', () => inputCount++)
      grid.addEventListener('cv-change', () => changeCount++)

      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(grid)

      expect(inputCount).toBe(1)
      expect(changeCount).toBe(1)
    })

    // RED: will pass after IMPL_UIKIT fix
    // Spec: "Programmatic changes via selectedValues, expandedValues, or value properties do not re-dispatch these events."
    // Currently the implementation dispatches input/change on programmatic selectedValues assignment.
    it('programmatic selectedValues change does not fire events', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(createColumn('name', 'Name'), createRow('r1', [createCell('name', 'A')]))
      await settle(grid)

      let inputCount = 0
      let changeCount = 0
      grid.addEventListener('cv-input', () => inputCount++)
      grid.addEventListener('cv-change', () => changeCount++)

      grid.selectedValues = ['r1']
      await settle(grid)

      // RED: currently fires 1 input event; after IMPL_UIKIT fix should be 0
      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('[part="base"] has role="treegrid"', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      expect(getBase(grid).getAttribute('role')).toBe('treegrid')
    })

    it('[part="base"] has aria-rowcount matching number of rows', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')]),
        createRow('r2', [createCell('name', 'B')]),
      )
      await settle(grid)
      const rowcount = getBase(grid).getAttribute('aria-rowcount')
      expect(rowcount).not.toBeNull()
      expect(Number(rowcount)).toBeGreaterThan(0)
    })

    it('[part="base"] has aria-colcount matching number of columns', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createColumn('size', 'Size'),
        createRow('r1', [createCell('name', 'A'), createCell('size', '1KB')]),
      )
      await settle(grid)
      expect(getBase(grid).getAttribute('aria-colcount')).toBe('2')
    })

    it('[part="base"] aria-multiselectable="false" in single mode', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test', selectionMode: 'single'})
      expect(getBase(grid).getAttribute('aria-multiselectable')).toBe('false')
    })

    it('[part="base"] aria-multiselectable="true" in multiple mode', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test', selectionMode: 'multiple'})
      expect(getBase(grid).getAttribute('aria-multiselectable')).toBe('true')
    })

    it('rows have aria-level, aria-posinset, aria-setsize, aria-rowindex, aria-selected', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')]),
        createRow('r2', [createCell('name', 'B')]),
      )
      await settle(grid)

      const row1 = grid.querySelector('cv-treegrid-row[value="r1"]') as CVTreegridRow
      expect(row1.getAttribute('aria-level')).not.toBeNull()
      expect(row1.getAttribute('aria-posinset')).not.toBeNull()
      expect(row1.getAttribute('aria-setsize')).not.toBeNull()
      expect(row1.getAttribute('aria-rowindex')).not.toBeNull()
      expect(row1.getAttribute('aria-selected')).not.toBeNull()
    })

    it('root rows have aria-level="1"', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(createColumn('name', 'Name'), createRow('r1', [createCell('name', 'A')]))
      await settle(grid)

      const row1 = grid.querySelector('cv-treegrid-row[value="r1"]') as CVTreegridRow
      expect(row1.getAttribute('aria-level')).toBe('1')
    })

    it('child rows have aria-level="2"', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {
          children: [createRow('r1a', [createCell('name', 'A1')])],
        }),
      )
      await settle(grid)

      const childRow = grid.querySelector('cv-treegrid-row[value="r1a"]') as CVTreegridRow
      expect(childRow.getAttribute('aria-level')).toBe('2')
    })

    it('branch rows have aria-expanded attribute', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {
          children: [createRow('r1a', [createCell('name', 'A1')])],
        }),
      )
      await settle(grid)

      const row1 = grid.querySelector('cv-treegrid-row[value="r1"]') as CVTreegridRow
      expect(row1.hasAttribute('aria-expanded')).toBe(true)
    })

    it('leaf rows do not have aria-expanded', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(createColumn('name', 'Name'), createRow('r1', [createCell('name', 'A')]))
      await settle(grid)

      const row1 = grid.querySelector('cv-treegrid-row[value="r1"]') as CVTreegridRow
      expect(row1.hasAttribute('aria-expanded')).toBe(false)
    })

    it('cells have aria-colindex', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createColumn('size', 'Size'),
        createRow('r1', [createCell('name', 'A'), createCell('size', '1KB')]),
      )
      await settle(grid)

      const cell1 = grid.querySelector('cv-treegrid-cell[column="name"]') as CVTreegridCell
      const cell2 = grid.querySelector('cv-treegrid-cell[column="size"]') as CVTreegridCell
      expect(cell1.getAttribute('aria-colindex')).not.toBeNull()
      expect(cell2.getAttribute('aria-colindex')).not.toBeNull()
    })

    it('disabled rows get aria-disabled="true"', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {disabled: true}),
      )
      await settle(grid)

      const row1 = grid.querySelector('cv-treegrid-row[value="r1"]') as CVTreegridRow
      expect(row1.getAttribute('aria-disabled')).toBe('true')
    })
  })

  // --- keyboard navigation ---

  describe('keyboard navigation', () => {
    it('ArrowDown moves active cell to next row', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')]),
        createRow('r2', [createCell('name', 'B')]),
      )
      await settle(grid)

      expect(grid.value).toBe('r1::name')
      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r2::name')
    })

    it('ArrowUp moves active cell to previous row', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')]),
        createRow('r2', [createCell('name', 'B')]),
      )
      await settle(grid)

      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r2::name')

      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::name')
    })

    it('ArrowRight on collapsed branch row expands it', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {
          children: [createRow('r1a', [createCell('name', 'A1')])],
        }),
      )
      await settle(grid)

      expect(grid.expandedValues).toEqual([])
      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)
      expect(grid.expandedValues).toContain('r1')
    })

    it('ArrowRight on expanded branch row moves to first child', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {
          children: [createRow('r1a', [createCell('name', 'A1')])],
        }),
      )
      await settle(grid)

      // Expand first
      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)
      // Move to child
      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1a::name')
    })

    it('ArrowLeft on child row moves to parent', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {
          children: [createRow('r1a', [createCell('name', 'A1')])],
        }),
      )
      await settle(grid)

      // Expand and navigate into child
      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)
      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1a::name')

      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::name')
    })

    it('ArrowLeft on expanded branch row collapses it', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {
          children: [createRow('r1a', [createCell('name', 'A1')])],
        }),
      )
      await settle(grid)

      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)
      expect(grid.expandedValues).toContain('r1')

      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
      await settle(grid)
      expect(grid.expandedValues).not.toContain('r1')
    })

    it('Home moves to first cell in current row', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createColumn('size', 'Size'),
        createRow('r1', [createCell('name', 'A'), createCell('size', '1KB')]),
      )
      await settle(grid)

      // Move right to second column
      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::size')

      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::name')
    })

    it('End moves to last cell in current row', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createColumn('size', 'Size'),
        createRow('r1', [createCell('name', 'A'), createCell('size', '1KB')]),
      )
      await settle(grid)

      expect(grid.value).toBe('r1::name')
      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true}))
      await settle(grid)
      expect(grid.value).toBe('r1::size')
    })

    it('Enter selects active row', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(createColumn('name', 'Name'), createRow('r1', [createCell('name', 'A')]))
      await settle(grid)

      expect(grid.selectedValues).toEqual([])
      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(grid)
      expect(grid.selectedValues).toContain('r1')
    })

    it('Space selects active row', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(createColumn('name', 'Name'), createRow('r1', [createCell('name', 'A')]))
      await settle(grid)

      expect(grid.selectedValues).toEqual([])
      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(grid)
      expect(grid.selectedValues).toContain('r1')
    })

    it('navigation keys are preventDefault()-ed', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(createColumn('name', 'Name'), createRow('r1', [createCell('name', 'A')]))
      await settle(grid)

      const event = new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true, cancelable: true})
      getBase(grid).dispatchEvent(event)
      await settle(grid)
      expect(event.defaultPrevented).toBe(true)
    })

    it('non-navigation keys are NOT preventDefault()-ed', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(createColumn('name', 'Name'), createRow('r1', [createCell('name', 'A')]))
      await settle(grid)

      const event = new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true})
      getBase(grid).dispatchEvent(event)
      await settle(grid)
      expect(event.defaultPrevented).toBe(false)
    })
  })

  // --- selection behavior ---

  describe('selection behavior', () => {
    describe('single-select mode', () => {
      it('Enter selects active row and deselects previously selected', async () => {
        const grid = await createTreegrid({ariaLabel: 'Test', selectionMode: 'single'})
        grid.append(
          createColumn('name', 'Name'),
          createRow('r1', [createCell('name', 'A')]),
          createRow('r2', [createCell('name', 'B')]),
        )
        await settle(grid)

        getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
        await settle(grid)
        expect(grid.selectedValues).toEqual(['r1'])

        getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
        await settle(grid)
        getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
        await settle(grid)
        expect(grid.selectedValues).toEqual(['r2'])
      })

      it('programmatic selectedValues replaces selection (single mode)', async () => {
        const grid = await createTreegrid({ariaLabel: 'Test', selectionMode: 'single'})
        grid.append(
          createColumn('name', 'Name'),
          createRow('r1', [createCell('name', 'A')]),
          createRow('r2', [createCell('name', 'B')]),
        )
        await settle(grid)

        grid.selectedValues = ['r1']
        await settle(grid)
        expect(grid.selectedValues).toEqual(['r1'])

        grid.selectedValues = ['r2']
        await settle(grid)
        expect(grid.selectedValues).toEqual(['r2'])
      })
    })

    describe('multiple-select mode', () => {
      it('Ctrl+Enter in multiple mode toggles row selection additively', async () => {
        const grid = await createTreegrid({ariaLabel: 'Test', selectionMode: 'multiple'})
        grid.append(
          createColumn('name', 'Name'),
          createRow('r1', [createCell('name', 'A')]),
          createRow('r2', [createCell('name', 'B')]),
        )
        await settle(grid)

        getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', ctrlKey: true, bubbles: true}))
        await settle(grid)
        expect(grid.selectedValues).toContain('r1')

        getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
        await settle(grid)
        getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', ctrlKey: true, bubbles: true}))
        await settle(grid)
        expect(grid.selectedValues).toContain('r1')
        expect(grid.selectedValues).toContain('r2')
      })

      it('programmatic selectedValues replaces (not accumulates) in multiple mode', async () => {
        const grid = await createTreegrid({ariaLabel: 'Test', selectionMode: 'multiple'})
        grid.append(
          createColumn('name', 'Name'),
          createRow('r1', [createCell('name', 'A')]),
          createRow('r2', [createCell('name', 'B')]),
        )
        await settle(grid)

        grid.selectedValues = ['r1']
        await settle(grid)
        expect(grid.selectedValues).toEqual(['r1'])

        grid.selectedValues = ['r2']
        await settle(grid)
        // programmatic assign replaces
        expect(grid.selectedValues).toEqual(['r2'])
      })

      // RED: will pass after IMPL_UIKIT fix
      // Spec states: "plain pointer click in multiple mode will call toggleRowSelection
      // unconditionally (accumulate), not selectRow". Currently plain click calls selectRow (replace).
      it('plain pointer click in multiple mode accumulates selection (toggleRowSelection)', async () => {
        const grid = await createTreegrid({ariaLabel: 'Test', selectionMode: 'multiple'})
        grid.append(
          createColumn('name', 'Name'),
          createRow('r1', [createCell('name', 'A')]),
          createRow('r2', [createCell('name', 'B')]),
        )
        await settle(grid)

        // Expand so r1 is accessible
        const cell1 = grid.querySelector('cv-treegrid-cell[column="name"]') as CVTreegridCell

        cell1.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
        await settle(grid)
        expect(grid.selectedValues).toContain('r1')

        const cells = grid.querySelectorAll('cv-treegrid-cell[column="name"]')
        const cell2 = cells[1] as CVTreegridCell
        // Plain click (no ctrl/meta) — after fix should accumulate, not replace
        cell2.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
        await settle(grid)
        // RED: currently this equals ['r2'] because plain click calls selectRow (replaces)
        // After IMPL_UIKIT fix it should be ['r1', 'r2']
        expect(new Set(grid.selectedValues)).toEqual(new Set(['r1', 'r2']))
      })

      it('Ctrl+click in multiple mode accumulates selection', async () => {
        const grid = await createTreegrid({ariaLabel: 'Test', selectionMode: 'multiple'})
        grid.append(
          createColumn('name', 'Name'),
          createRow('r1', [createCell('name', 'A')]),
          createRow('r2', [createCell('name', 'B')]),
        )
        await settle(grid)

        const cells = grid.querySelectorAll('cv-treegrid-cell[column="name"]')
        const cell1 = cells[0] as CVTreegridCell
        const cell2 = cells[1] as CVTreegridCell

        cell1.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
        await settle(grid)
        cell2.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true, ctrlKey: true}))
        await settle(grid)

        expect(new Set(grid.selectedValues)).toEqual(new Set(['r1', 'r2']))
      })
    })
  })

  // --- expand/collapse ---

  describe('expand/collapse', () => {
    it('ArrowRight on collapsed branch row expands it; children become visible', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {
          children: [createRow('r1a', [createCell('name', 'A1')])],
        }),
      )
      await settle(grid)

      const childRow = grid.querySelector('cv-treegrid-row[value="r1a"]') as CVTreegridRow
      expect(childRow.hidden).toBe(true)

      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)

      expect(grid.expandedValues).toContain('r1')
      expect(childRow.hidden).toBe(false)
    })

    it('ArrowLeft on expanded branch collapses it; children become hidden', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {
          children: [createRow('r1a', [createCell('name', 'A1')])],
        }),
      )
      await settle(grid)

      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)

      const childRow = grid.querySelector('cv-treegrid-row[value="r1a"]') as CVTreegridRow
      expect(childRow.hidden).toBe(false)

      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
      await settle(grid)

      expect(childRow.hidden).toBe(true)
    })

    it('leaf rows: ArrowRight moves to next cell (no expansion)', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createColumn('size', 'Size'),
        createRow('r1', [createCell('name', 'A'), createCell('size', '1KB')]),
      )
      await settle(grid)

      expect(grid.value).toBe('r1::name')
      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)
      // No branch child, so moves within row
      expect(grid.value).toBe('r1::size')
      expect(grid.expandedValues).toEqual([])
    })

    it('programmatic expandedValues expansion makes children visible', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {
          children: [createRow('r1a', [createCell('name', 'A1')])],
        }),
      )
      await settle(grid)

      const childRow = grid.querySelector('cv-treegrid-row[value="r1a"]') as CVTreegridRow
      expect(childRow.hidden).toBe(true)

      grid.expandedValues = ['r1']
      await settle(grid)
      expect(childRow.hidden).toBe(false)
    })

    it('nested children remain hidden when parent is expanded but grandparent is collapsed', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {
          children: [
            createRow('r1a', [createCell('name', 'A1')], {
              children: [createRow('r1a1', [createCell('name', 'A1.1')])],
            }),
          ],
        }),
      )
      await settle(grid)

      const grandchildRow = grid.querySelector('cv-treegrid-row[value="r1a1"]') as CVTreegridRow
      // expand r1a but not r1 — both r1a and r1a1 should be hidden (r1 still collapsed)
      grid.expandedValues = ['r1a']
      await settle(grid)
      expect(grandchildRow.hidden).toBe(true)

      // Now expand r1 too
      grid.expandedValues = ['r1', 'r1a']
      await settle(grid)
      expect(grandchildRow.hidden).toBe(false)
    })
  })

  // --- disabled rows and cells ---

  describe('disabled rows and cells', () => {
    it('navigation skips disabled rows (ArrowDown jumps over disabled)', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')]),
        createRow('r2', [createCell('name', 'B')], {disabled: true}),
        createRow('r3', [createCell('name', 'C')]),
      )
      await settle(grid)

      expect(grid.value).toBe('r1::name')
      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(grid)
      // Should skip disabled r2 and land on r3
      expect(grid.value).toBe('r3::name')
    })

    it('disabled cell click does not update active cell', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createColumn('size', 'Size'),
        createRow('r1', [createCell('name', 'A'), createCell('size', '1KB', {disabled: true})]),
        createRow('r2', [createCell('name', 'B'), createCell('size', '2KB')]),
      )
      await settle(grid)

      const disabledCell = grid.querySelector('cv-treegrid-row[value="r1"] cv-treegrid-cell[column="size"]') as CVTreegridCell
      const initialValue = grid.value
      disabledCell.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(grid)
      // Active cell should not have moved to disabled cell
      expect(grid.value).toBe(initialValue)
    })

    it('disabled row gets aria-disabled attribute', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {disabled: true}),
      )
      await settle(grid)

      const row1 = grid.querySelector('cv-treegrid-row[value="r1"]') as CVTreegridRow
      expect(row1.getAttribute('aria-disabled')).toBe('true')
    })
  })

  // --- level sync ---

  describe('level sync', () => {
    // RED: will pass after IMPL_UIKIT fix
    // Spec: "parent cv-treegrid.syncElementsFromModel() will auto-write level from aria-level.
    // Currently level is not written by the parent and defaults to 1 unless the consumer sets it manually"
    it('root rows have level=1 set by syncElementsFromModel', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(createColumn('name', 'Name'), createRow('r1', [createCell('name', 'A')]))
      await settle(grid)

      const row1 = grid.querySelector('cv-treegrid-row[value="r1"]') as CVTreegridRow
      // Level attribute on the element must equal nesting depth (1 for root)
      expect(row1.level).toBe(1)
    })

    // RED: will pass after IMPL_UIKIT fix
    // The fix: syncElementsFromModel() must write row.level = Number(rowProps['aria-level'])
    it('child rows have level=2 auto-written by syncElementsFromModel (not defaulting to 1)', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {
          children: [createRow('r1a', [createCell('name', 'A1')])],
        }),
      )
      await settle(grid)

      const childRow = grid.querySelector('cv-treegrid-row[value="r1a"]') as CVTreegridRow
      // RED: currently childRow.level defaults to 1 (not written by syncElementsFromModel)
      // After IMPL_UIKIT fix: syncElementsFromModel writes level from aria-level, so this should be 2
      expect(childRow.level).toBe(2)
    })

    // RED: will pass after IMPL_UIKIT fix
    it('grandchild rows have level=3 auto-written by syncElementsFromModel', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {
          children: [
            createRow('r1a', [createCell('name', 'A1')], {
              children: [createRow('r1a1', [createCell('name', 'A1.1')])],
            }),
          ],
        }),
      )
      await settle(grid)

      const grandchildRow = grid.querySelector('cv-treegrid-row[value="r1a1"]') as CVTreegridRow
      // RED: After IMPL_UIKIT fix, level should be 3
      expect(grandchildRow.level).toBe(3)
    })
  })

  // --- headless contract delegation ---

  describe('headless contract delegation', () => {
    it('aria-level on row element matches getRowProps() aria-level value (not hardcoded)', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {
          children: [createRow('r1a', [createCell('name', 'A1')])],
        }),
      )
      await settle(grid)

      const rootRow = grid.querySelector('cv-treegrid-row[value="r1"]') as CVTreegridRow
      const childRow = grid.querySelector('cv-treegrid-row[value="r1a"]') as CVTreegridRow

      // The aria-level attribute on the element is written from getRowProps()
      const rootAriaLevel = rootRow.getAttribute('aria-level')
      const childAriaLevel = childRow.getAttribute('aria-level')

      // Contract must return different levels for root vs child
      expect(rootAriaLevel).toBe('1')
      expect(childAriaLevel).toBe('2')
    })

    it('aria-rowcount on base matches total row count (all rows, including collapsed children)', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')], {
          children: [createRow('r1a', [createCell('name', 'A1')])],
        }),
        createRow('r2', [createCell('name', 'B')]),
      )
      await settle(grid)

      const rowcount = Number(getBase(grid).getAttribute('aria-rowcount'))
      // Total: r1, r1a, r2 = 3
      expect(rowcount).toBe(3)
    })

    it('aria-colcount matches number of defined columns', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createColumn('size', 'Size'),
        createColumn('type', 'Type'),
        createRow('r1', [createCell('name', 'A'), createCell('size', '1KB'), createCell('type', 'File')]),
      )
      await settle(grid)

      expect(getBase(grid).getAttribute('aria-colcount')).toBe('3')
    })

    it('aria-colindex on cells is 1-based and matches column position', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(
        createColumn('name', 'Name'),
        createColumn('size', 'Size'),
        createRow('r1', [createCell('name', 'A'), createCell('size', '1KB')]),
      )
      await settle(grid)

      const cellName = grid.querySelector('cv-treegrid-cell[column="name"]') as CVTreegridCell
      const cellSize = grid.querySelector('cv-treegrid-cell[column="size"]') as CVTreegridCell

      expect(cellName.getAttribute('aria-colindex')).toBe('1')
      expect(cellSize.getAttribute('aria-colindex')).toBe('2')
    })

    it('aria-selected on row reflects headless selection state', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(createColumn('name', 'Name'), createRow('r1', [createCell('name', 'A')]))
      await settle(grid)

      const row1 = grid.querySelector('cv-treegrid-row[value="r1"]') as CVTreegridRow
      expect(row1.getAttribute('aria-selected')).toBe('false')

      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(grid)
      expect(row1.getAttribute('aria-selected')).toBe('true')
    })
  })

  // --- slot-change rebuild ---

  describe('slot-change rebuild', () => {
    it('adding a cv-treegrid-row triggers model rebuild', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      grid.append(createColumn('name', 'Name'), createRow('r1', [createCell('name', 'A')]))
      await settle(grid)

      expect(getBase(grid).getAttribute('aria-rowcount')).toBe('1')

      const newRow = createRow('r2', [createCell('name', 'B')])
      grid.append(newRow)
      await settle(grid)

      const rowcount = Number(getBase(grid).getAttribute('aria-rowcount'))
      expect(rowcount).toBe(2)
    })

    it('removing a cv-treegrid-row triggers model rebuild', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      const row2 = createRow('r2', [createCell('name', 'B')])
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')]),
        row2,
      )
      await settle(grid)

      expect(Number(getBase(grid).getAttribute('aria-rowcount'))).toBe(2)

      row2.remove()
      await settle(grid)

      expect(Number(getBase(grid).getAttribute('aria-rowcount'))).toBe(1)
    })

    it('slot-change rebuild preserves valid state (active cell, selection)', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test', selectionMode: 'single'})
      grid.append(
        createColumn('name', 'Name'),
        createRow('r1', [createCell('name', 'A')]),
        createRow('r2', [createCell('name', 'B')]),
      )
      await settle(grid)

      // Select r1
      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(grid)
      expect(grid.selectedValues).toContain('r1')
      expect(grid.value).toBe('r1::name')

      // Add a new row
      const newRow = createRow('r3', [createCell('name', 'C')])
      grid.append(newRow)
      await settle(grid)

      // Valid state should be preserved
      expect(grid.selectedValues).toContain('r1')
      expect(grid.value).toBe('r1::name')
    })

    it('slot-change rebuild drops state for removed rows', async () => {
      const grid = await createTreegrid({ariaLabel: 'Test'})
      const row1 = createRow('r1', [createCell('name', 'A')], {
        children: [createRow('r1a', [createCell('name', 'A1')])],
      })
      const row2 = createRow('r2', [createCell('name', 'B')])
      grid.append(createColumn('name', 'Name'), row1, row2)
      await settle(grid)

      // Expand r1
      getBase(grid).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(grid)
      expect(grid.expandedValues).toContain('r1')

      // Navigate to r2 and select it
      const cell2 = grid.querySelector('cv-treegrid-row[value="r2"] cv-treegrid-cell[column="name"]') as CVTreegridCell
      cell2.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(grid)
      expect(grid.value).toBe('r2::name')

      // Remove r1 (and its children)
      row1.remove()
      await settle(grid)

      // r1 expansion should be gone (row no longer exists)
      expect(grid.expandedValues).toEqual([])
      // r2 still exists, state preserved
      expect(grid.value).toBe('r2::name')
    })
  })
})
