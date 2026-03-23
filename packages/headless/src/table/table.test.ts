import {describe, expect, it} from 'vitest'
import {createTable} from './index'

describe('createTable', () => {
  // === Structural ARIA roles ===

  it('returns structural table roles and non-composite contracts', () => {
    const table = createTable({
      idBase: 'table-roles',
      columns: [{id: 'name'}, {id: 'status'}],
      rows: [{id: 'r1'}, {id: 'r2'}],
      ariaLabel: 'Test table',
    })

    expect(table.contracts.getTableProps().role).toBe('table')
    expect(table.contracts.getRowProps('r1').role).toBe('row')
    expect(table.contracts.getCellProps('r1', 'name').role).toBe('cell')
    expect(table.contracts.getColumnHeaderProps('name').role).toBe('columnheader')
    expect(table.contracts.getRowHeaderProps('r1', 'name').role).toBe('rowheader')
    // Table is non-composite: cells should not have tabindex
    expect('tabindex' in table.contracts.getCellProps('r1', 'name')).toBe(false)
  })

  // === 1-based index mapping ===

  it('uses 1-based aria-rowindex and aria-colindex mapping', () => {
    const table = createTable({
      idBase: 'table-index',
      columns: [{id: 'c1'}, {id: 'c2', index: 5}],
      rows: [{id: 'r1'}, {id: 'r2', index: 7}],
      ariaLabel: 'Test table',
    })

    expect(table.contracts.getRowProps('r1')['aria-rowindex']).toBe(1)
    expect(table.contracts.getRowProps('r2')['aria-rowindex']).toBe(7)
    expect(table.contracts.getCellProps('r1', 'c1')['aria-colindex']).toBe(1)
    expect(table.contracts.getCellProps('r1', 'c2')['aria-colindex']).toBe(5)
  })

  it('provides 1-based aria-colindex on columnheader props', () => {
    const table = createTable({
      idBase: 'table-header-index',
      columns: [{id: 'a'}, {id: 'b', index: 3}],
      rows: [{id: 'r1'}],
      ariaLabel: 'Test table',
    })

    expect(table.contracts.getColumnHeaderProps('a')['aria-colindex']).toBe(1)
    expect(table.contracts.getColumnHeaderProps('b')['aria-colindex']).toBe(3)
  })

  it('provides 1-based aria-rowindex and aria-colindex on rowheader props', () => {
    const table = createTable({
      idBase: 'table-rowheader-index',
      columns: [{id: 'c1', index: 2}],
      rows: [{id: 'r1', index: 5}],
      ariaLabel: 'Test table',
    })

    const props = table.contracts.getRowHeaderProps('r1', 'c1')
    expect(props['aria-rowindex']).toBe(5)
    expect(props['aria-colindex']).toBe(2)
  })

  // === aria-sort state transitions ===

  it('updates aria-sort by sortBy transitions', () => {
    const table = createTable({
      idBase: 'table-sort',
      columns: [{id: 'name'}, {id: 'status'}],
      rows: [{id: 'r1'}],
      ariaLabel: 'Test table',
    })

    expect(table.contracts.getColumnHeaderProps('name')['aria-sort']).toBe('none')

    table.actions.sortBy('name', 'ascending')
    expect(table.state.sortColumnId()).toBe('name')
    expect(table.state.sortDirection()).toBe('ascending')
    expect(table.contracts.getColumnHeaderProps('name')['aria-sort']).toBe('ascending')
    expect(table.contracts.getColumnHeaderProps('status')['aria-sort']).toBe('none')

    table.actions.sortBy('name', 'descending')
    expect(table.contracts.getColumnHeaderProps('name')['aria-sort']).toBe('descending')
  })

  it('clears sort via sortBy with direction none', () => {
    const table = createTable({
      idBase: 'table-sort-clear',
      columns: [{id: 'name'}, {id: 'status'}],
      rows: [{id: 'r1'}],
      ariaLabel: 'Test table',
    })

    table.actions.sortBy('name', 'ascending')
    expect(table.state.sortColumnId()).toBe('name')
    expect(table.state.sortDirection()).toBe('ascending')

    table.actions.sortBy('name', 'none')
    expect(table.state.sortColumnId()).toBeNull()
    expect(table.state.sortDirection()).toBe('none')
    expect(table.contracts.getColumnHeaderProps('name')['aria-sort']).toBe('none')
    expect(table.contracts.getColumnHeaderProps('status')['aria-sort']).toBe('none')
  })

  it('clears sort via clearSort action', () => {
    const table = createTable({
      idBase: 'table-sort-clear2',
      columns: [{id: 'name'}],
      rows: [{id: 'r1'}],
      ariaLabel: 'Test table',
    })

    table.actions.sortBy('name', 'ascending')
    expect(table.state.sortDirection()).toBe('ascending')

    table.actions.clearSort()
    expect(table.state.sortColumnId()).toBeNull()
    expect(table.state.sortDirection()).toBe('none')
  })

  it('ignores sortBy for unknown column id', () => {
    const table = createTable({
      idBase: 'table-sort-unknown',
      columns: [{id: 'name'}],
      rows: [{id: 'r1'}],
      ariaLabel: 'Test table',
    })

    table.actions.sortBy('nonexistent', 'ascending')
    expect(table.state.sortColumnId()).toBeNull()
    expect(table.state.sortDirection()).toBe('none')
  })

  it('supports initial sort state', () => {
    const table = createTable({
      idBase: 'table-initial-sort',
      columns: [{id: 'name'}, {id: 'status'}],
      rows: [{id: 'r1'}],
      initialSortColumnId: 'name',
      initialSortDirection: 'descending',
      ariaLabel: 'Test table',
    })

    expect(table.state.sortColumnId()).toBe('name')
    expect(table.state.sortDirection()).toBe('descending')
    expect(table.contracts.getColumnHeaderProps('name')['aria-sort']).toBe('descending')
    expect(table.contracts.getColumnHeaderProps('status')['aria-sort']).toBe('none')
  })

  // === colspan and rowspan metadata ===

  it('supports colspan and rowspan metadata for cells', () => {
    const table = createTable({
      idBase: 'table-span',
      columns: [{id: 'a'}, {id: 'b'}],
      rows: [{id: 'r1'}],
      ariaLabel: 'Test table',
    })

    expect(table.contracts.getCellProps('r1', 'a', {colspan: 2, rowspan: 3})).toEqual({
      id: 'table-span-cell-r1-a',
      role: 'cell',
      'aria-colindex': 1,
      'aria-colspan': 2,
      'aria-rowspan': 3,
    })
  })

  it('omits colspan and rowspan when not specified', () => {
    const table = createTable({
      idBase: 'table-no-span',
      columns: [{id: 'a'}],
      rows: [{id: 'r1'}],
      ariaLabel: 'Test table',
    })

    const props = table.contracts.getCellProps('r1', 'a')
    expect(props['aria-colspan']).toBeUndefined()
    expect(props['aria-rowspan']).toBeUndefined()
  })

  // === Virtualization support ===

  it('keeps total counts for virtualization scenarios', () => {
    const table = createTable({
      idBase: 'table-virtual',
      columns: [{id: 'name'}],
      rows: [{id: 'r20', index: 20}],
      totalColumnCount: 8,
      totalRowCount: 200,
      ariaLabel: 'Test table',
    })

    expect(table.state.columnCount()).toBe(8)
    expect(table.state.rowCount()).toBe(200)
    expect(table.contracts.getTableProps()['aria-colcount']).toBe(8)
    expect(table.contracts.getTableProps()['aria-rowcount']).toBe(200)
    expect(table.contracts.getRowProps('r20')['aria-rowindex']).toBe(20)
  })

  it('uses rendered count when total count is not provided', () => {
    const table = createTable({
      idBase: 'table-no-total',
      columns: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      rows: [{id: 'r1'}, {id: 'r2'}],
      ariaLabel: 'Test table',
    })

    expect(table.state.columnCount()).toBe(3)
    expect(table.state.rowCount()).toBe(2)
  })

  // === aria-label / aria-labelledby requirement ===

  it('requires aria-label or aria-labelledby', () => {
    expect(() =>
      createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
      }),
    ).toThrow('ariaLabel or ariaLabelledBy')
  })

  it('accepts ariaLabel', () => {
    const table = createTable({
      columns: [{id: 'a'}],
      rows: [{id: 'r1'}],
      ariaLabel: 'My table',
    })

    expect(table.contracts.getTableProps()['aria-label']).toBe('My table')
    expect(table.contracts.getTableProps()['aria-labelledby']).toBeUndefined()
  })

  it('accepts ariaLabelledBy', () => {
    const table = createTable({
      columns: [{id: 'a'}],
      rows: [{id: 'r1'}],
      ariaLabelledBy: 'heading-id',
    })

    expect(table.contracts.getTableProps()['aria-labelledby']).toBe('heading-id')
  })

  // === Error handling for unknown IDs ===

  it('throws for unknown row id in getRowProps', () => {
    const table = createTable({
      columns: [{id: 'a'}],
      rows: [{id: 'r1'}],
      ariaLabel: 'Test table',
    })

    expect(() => table.contracts.getRowProps('unknown')).toThrow('Unknown table row id')
  })

  it('throws for unknown column id in getCellProps', () => {
    const table = createTable({
      columns: [{id: 'a'}],
      rows: [{id: 'r1'}],
      ariaLabel: 'Test table',
    })

    expect(() => table.contracts.getCellProps('r1', 'unknown')).toThrow('Unknown table column id')
  })

  it('throws for unknown row id in getCellProps', () => {
    const table = createTable({
      columns: [{id: 'a'}],
      rows: [{id: 'r1'}],
      ariaLabel: 'Test table',
    })

    expect(() => table.contracts.getCellProps('unknown', 'a')).toThrow('Unknown table row id')
  })

  it('throws for unknown column id in getColumnHeaderProps', () => {
    const table = createTable({
      columns: [{id: 'a'}],
      rows: [{id: 'r1'}],
      ariaLabel: 'Test table',
    })

    expect(() => table.contracts.getColumnHeaderProps('unknown')).toThrow(
      'Unknown table column id',
    )
  })

  it('throws for unknown ids in getRowHeaderProps', () => {
    const table = createTable({
      columns: [{id: 'a'}],
      rows: [{id: 'r1'}],
      ariaLabel: 'Test table',
    })

    expect(() => table.contracts.getRowHeaderProps('unknown', 'a')).toThrow(
      'Unknown table row id',
    )
    expect(() => table.contracts.getRowHeaderProps('r1', 'unknown')).toThrow(
      'Unknown table column id',
    )
  })

  // === ID generation ===

  it('generates correct element ids', () => {
    const table = createTable({
      idBase: 'my-table',
      columns: [{id: 'col1'}],
      rows: [{id: 'row1'}],
      ariaLabel: 'Test table',
    })

    expect(table.contracts.getTableProps().id).toBe('my-table-root')
    expect(table.contracts.getRowProps('row1').id).toBe('my-table-row-row1')
    expect(table.contracts.getCellProps('row1', 'col1').id).toBe('my-table-cell-row1-col1')
    expect(table.contracts.getColumnHeaderProps('col1').id).toBe('my-table-column-header-col1')
    expect(table.contracts.getRowHeaderProps('row1', 'col1').id).toBe(
      'my-table-row-header-row1-col1',
    )
  })

  // === Selection: selectable=false (default) ===

  describe('selection: selectable=false (default)', () => {
    it('does not include aria-selected on rows when selectable is false', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        ariaLabel: 'Test table',
      })

      expect(table.contracts.getRowProps('r1')['aria-selected']).toBeUndefined()
    })

    it('does not include aria-multiselectable on table when selectable is false', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        ariaLabel: 'Test table',
      })

      expect(table.contracts.getTableProps()['aria-multiselectable']).toBeUndefined()
    })

    it('selection actions are no-ops when selectable is false', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        ariaLabel: 'Test table',
      })

      table.actions.selectRow('r1')
      expect(table.state.selectedRowIds().size).toBe(0)

      table.actions.toggleRowSelection('r1')
      expect(table.state.selectedRowIds().size).toBe(0)

      table.actions.selectAllRows()
      expect(table.state.selectedRowIds().size).toBe(0)

      table.actions.clearSelection()
      expect(table.state.selectedRowIds().size).toBe(0)
    })

    it('exposes selectable=false on state', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        ariaLabel: 'Test table',
      })

      expect(table.state.selectable).toBe(false)
    })
  })

  // === Selection: selectable='single' ===

  describe('selection: selectable=single', () => {
    it('selectRow in single mode selects that row and deselects others', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}, {id: 'r3'}],
        selectable: 'single',
        ariaLabel: 'Test table',
      })

      table.actions.selectRow('r1')
      expect(table.state.selectedRowIds().has('r1')).toBe(true)
      expect(table.state.selectedRowIds().size).toBe(1)

      table.actions.selectRow('r2')
      expect(table.state.selectedRowIds().has('r2')).toBe(true)
      expect(table.state.selectedRowIds().has('r1')).toBe(false)
      expect(table.state.selectedRowIds().size).toBe(1)
    })

    it('deselectRow removes from selection', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        selectable: 'single',
        ariaLabel: 'Test table',
      })

      table.actions.selectRow('r1')
      expect(table.state.selectedRowIds().has('r1')).toBe(true)

      table.actions.deselectRow('r1')
      expect(table.state.selectedRowIds().size).toBe(0)
    })

    it('toggleRowSelection toggles on and off in single mode', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        selectable: 'single',
        ariaLabel: 'Test table',
      })

      table.actions.toggleRowSelection('r1')
      expect(table.state.selectedRowIds().has('r1')).toBe(true)

      table.actions.toggleRowSelection('r1')
      expect(table.state.selectedRowIds().size).toBe(0)
    })

    it('toggleRowSelection in single mode clears other selections when toggling on', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        selectable: 'single',
        ariaLabel: 'Test table',
      })

      table.actions.selectRow('r1')
      table.actions.toggleRowSelection('r2')
      expect(table.state.selectedRowIds().has('r2')).toBe(true)
      expect(table.state.selectedRowIds().has('r1')).toBe(false)
      expect(table.state.selectedRowIds().size).toBe(1)
    })

    it('selectAllRows is a no-op in single mode', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        selectable: 'single',
        ariaLabel: 'Test table',
      })

      table.actions.selectAllRows()
      expect(table.state.selectedRowIds().size).toBe(0)
    })

    it('clearSelection empties selection in single mode', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        selectable: 'single',
        ariaLabel: 'Test table',
      })

      table.actions.selectRow('r1')
      expect(table.state.selectedRowIds().size).toBe(1)

      table.actions.clearSelection()
      expect(table.state.selectedRowIds().size).toBe(0)
    })

    it('getRowProps returns aria-selected when selectable is single', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        selectable: 'single',
        ariaLabel: 'Test table',
      })

      expect(table.contracts.getRowProps('r1')['aria-selected']).toBe('false')
      expect(table.contracts.getRowProps('r2')['aria-selected']).toBe('false')

      table.actions.selectRow('r1')
      expect(table.contracts.getRowProps('r1')['aria-selected']).toBe('true')
      expect(table.contracts.getRowProps('r2')['aria-selected']).toBe('false')
    })

    it('does not include aria-multiselectable on table in single mode', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        selectable: 'single',
        ariaLabel: 'Test table',
      })

      expect(table.contracts.getTableProps()['aria-multiselectable']).toBeUndefined()
    })

    it('selectRow is no-op for unknown rowId in single mode', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        selectable: 'single',
        ariaLabel: 'Test table',
      })

      table.actions.selectRow('unknown')
      expect(table.state.selectedRowIds().size).toBe(0)
    })

    it('single mode invariant: at most one selected', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}, {id: 'r3'}],
        selectable: 'single',
        ariaLabel: 'Test table',
      })

      table.actions.selectRow('r1')
      table.actions.selectRow('r2')
      table.actions.selectRow('r3')
      expect(table.state.selectedRowIds().size).toBe(1)
      expect(table.state.selectedRowIds().has('r3')).toBe(true)
    })

    it('exposes selectable=single on state', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        selectable: 'single',
        ariaLabel: 'Test table',
      })

      expect(table.state.selectable).toBe('single')
    })
  })

  // === Selection: selectable='multi' ===

  describe('selection: selectable=multi', () => {
    it('selectRow in multi mode adds to selection', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}, {id: 'r3'}],
        selectable: 'multi',
        ariaLabel: 'Test table',
      })

      table.actions.selectRow('r1')
      table.actions.selectRow('r2')
      expect(table.state.selectedRowIds().has('r1')).toBe(true)
      expect(table.state.selectedRowIds().has('r2')).toBe(true)
      expect(table.state.selectedRowIds().size).toBe(2)
    })

    it('deselectRow removes from selection in multi mode', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        selectable: 'multi',
        ariaLabel: 'Test table',
      })

      table.actions.selectRow('r1')
      table.actions.selectRow('r2')
      table.actions.deselectRow('r1')
      expect(table.state.selectedRowIds().has('r1')).toBe(false)
      expect(table.state.selectedRowIds().has('r2')).toBe(true)
      expect(table.state.selectedRowIds().size).toBe(1)
    })

    it('toggleRowSelection adds/removes individual row in multi mode', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        selectable: 'multi',
        ariaLabel: 'Test table',
      })

      table.actions.toggleRowSelection('r1')
      expect(table.state.selectedRowIds().has('r1')).toBe(true)

      table.actions.toggleRowSelection('r2')
      expect(table.state.selectedRowIds().has('r1')).toBe(true)
      expect(table.state.selectedRowIds().has('r2')).toBe(true)

      table.actions.toggleRowSelection('r1')
      expect(table.state.selectedRowIds().has('r1')).toBe(false)
      expect(table.state.selectedRowIds().has('r2')).toBe(true)
    })

    it('selectAllRows selects all known rows in multi mode', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}, {id: 'r3'}],
        selectable: 'multi',
        ariaLabel: 'Test table',
      })

      table.actions.selectAllRows()
      expect(table.state.selectedRowIds().size).toBe(3)
      expect(table.state.selectedRowIds().has('r1')).toBe(true)
      expect(table.state.selectedRowIds().has('r2')).toBe(true)
      expect(table.state.selectedRowIds().has('r3')).toBe(true)
    })

    it('clearSelection empties selection set in multi mode', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        selectable: 'multi',
        ariaLabel: 'Test table',
      })

      table.actions.selectAllRows()
      expect(table.state.selectedRowIds().size).toBe(2)

      table.actions.clearSelection()
      expect(table.state.selectedRowIds().size).toBe(0)
    })

    it('getTableProps returns aria-multiselectable=true in multi mode', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        selectable: 'multi',
        ariaLabel: 'Test table',
      })

      expect(table.contracts.getTableProps()['aria-multiselectable']).toBe('true')
    })

    it('aria-selected present on every row in multi mode', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        selectable: 'multi',
        ariaLabel: 'Test table',
      })

      expect(table.contracts.getRowProps('r1')['aria-selected']).toBe('false')
      expect(table.contracts.getRowProps('r2')['aria-selected']).toBe('false')

      table.actions.selectRow('r1')
      expect(table.contracts.getRowProps('r1')['aria-selected']).toBe('true')
      expect(table.contracts.getRowProps('r2')['aria-selected']).toBe('false')
    })

    it('selectRow is no-op for unknown rowId in multi mode', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        selectable: 'multi',
        ariaLabel: 'Test table',
      })

      table.actions.selectRow('unknown')
      expect(table.state.selectedRowIds().size).toBe(0)
    })

    it('exposes selectable=multi on state', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        selectable: 'multi',
        ariaLabel: 'Test table',
      })

      expect(table.state.selectable).toBe('multi')
    })
  })

  // === Selection: initialSelectedRowIds ===

  describe('selection: initialSelectedRowIds', () => {
    it('filters out unknown row ids from initialSelectedRowIds', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        selectable: 'multi',
        initialSelectedRowIds: ['r1', 'unknown', 'r2'],
        ariaLabel: 'Test table',
      })

      expect(table.state.selectedRowIds().size).toBe(2)
      expect(table.state.selectedRowIds().has('r1')).toBe(true)
      expect(table.state.selectedRowIds().has('r2')).toBe(true)
    })

    it('in single mode keeps only the first valid id from initialSelectedRowIds', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        selectable: 'single',
        initialSelectedRowIds: ['r1', 'r2'],
        ariaLabel: 'Test table',
      })

      expect(table.state.selectedRowIds().size).toBe(1)
      expect(table.state.selectedRowIds().has('r1')).toBe(true)
    })

    it('ignores initialSelectedRowIds when selectable is false', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        initialSelectedRowIds: ['r1'],
        ariaLabel: 'Test table',
      })

      expect(table.state.selectedRowIds().size).toBe(0)
    })
  })

  // === Grid navigation: interactive=false (default) ===

  describe('grid navigation: interactive=false (default)', () => {
    it('getTableProps returns role=table when interactive is false', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        ariaLabel: 'Test table',
      })

      expect(table.contracts.getTableProps().role).toBe('table')
    })

    it('getCellProps returns role=cell when interactive is false', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        ariaLabel: 'Test table',
      })

      expect(table.contracts.getCellProps('r1', 'a').role).toBe('cell')
    })

    it('cells have no tabindex when interactive is false', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        ariaLabel: 'Test table',
      })

      expect(table.contracts.getCellProps('r1', 'a')['tabindex']).toBeUndefined()
    })

    it('focusedRowIndex and focusedColumnIndex are null when interactive is false', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        ariaLabel: 'Test table',
      })

      expect(table.state.focusedRowIndex()).toBeNull()
      expect(table.state.focusedColumnIndex()).toBeNull()
    })

    it('navigation actions are no-ops when interactive is false', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        ariaLabel: 'Test table',
      })

      table.actions.moveFocus('down')
      table.actions.moveFocus('up')
      table.actions.moveFocus('left')
      table.actions.moveFocus('right')
      table.actions.moveFocusToStart()
      table.actions.moveFocusToEnd()
      table.actions.moveFocusToRowStart()
      table.actions.moveFocusToRowEnd()
      table.actions.setFocusedCell(0, 0)
      table.actions.pageUp()
      table.actions.pageDown()

      expect(table.state.focusedRowIndex()).toBeNull()
      expect(table.state.focusedColumnIndex()).toBeNull()
    })

    it('handleKeyDown is a no-op when interactive is false', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        ariaLabel: 'Test table',
      })

      table.actions.handleKeyDown({key: 'ArrowDown'})
      expect(table.state.focusedRowIndex()).toBeNull()
    })

    it('getTableProps has no tabindex when interactive is false', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        ariaLabel: 'Test table',
      })

      expect(table.contracts.getTableProps()['tabindex']).toBeUndefined()
    })

    it('exposes interactive=false on state', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        ariaLabel: 'Test table',
      })

      expect(table.state.interactive).toBe(false)
    })
  })

  // === Grid navigation: interactive=true ===

  describe('grid navigation: interactive=true', () => {
    it('getTableProps returns role=grid when interactive is true', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      expect(table.contracts.getTableProps().role).toBe('grid')
    })

    it('getTableProps includes tabindex=0 when interactive is true', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      expect(table.contracts.getTableProps()['tabindex']).toBe('0')
    })

    it('getCellProps returns role=gridcell when interactive is true', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      expect(table.contracts.getCellProps('r1', 'a').role).toBe('gridcell')
    })

    it('default focus is (0, 0) when interactive and no initial focus provided', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      expect(table.state.focusedRowIndex()).toBe(0)
      expect(table.state.focusedColumnIndex()).toBe(0)
    })

    it('respects initialFocusedRowIndex and initialFocusedColumnIndex', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        interactive: true,
        initialFocusedRowIndex: 1,
        initialFocusedColumnIndex: 1,
        ariaLabel: 'Test table',
      })

      expect(table.state.focusedRowIndex()).toBe(1)
      expect(table.state.focusedColumnIndex()).toBe(1)
    })

    it('roving tabindex: only focused cell has tabindex=0, others have tabindex=-1', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      // Default focus at (0,0) = r1, a
      expect(table.contracts.getCellProps('r1', 'a')['tabindex']).toBe('0')
      expect(table.contracts.getCellProps('r1', 'b')['tabindex']).toBe('-1')
      expect(table.contracts.getCellProps('r2', 'a')['tabindex']).toBe('-1')
      expect(table.contracts.getCellProps('r2', 'b')['tabindex']).toBe('-1')
    })

    it('data-active marks the focused cell', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      expect(table.contracts.getCellProps('r1', 'a')['data-active']).toBe('true')
      expect(table.contracts.getCellProps('r1', 'b')['data-active']).toBe('false')
    })

    it('moveFocus down increments focusedRowIndex', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}, {id: 'r3'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      expect(table.state.focusedRowIndex()).toBe(0)
      table.actions.moveFocus('down')
      expect(table.state.focusedRowIndex()).toBe(1)
      table.actions.moveFocus('down')
      expect(table.state.focusedRowIndex()).toBe(2)
    })

    it('moveFocus up decrements focusedRowIndex', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}, {id: 'r3'}],
        interactive: true,
        initialFocusedRowIndex: 2,
        ariaLabel: 'Test table',
      })

      table.actions.moveFocus('up')
      expect(table.state.focusedRowIndex()).toBe(1)
      table.actions.moveFocus('up')
      expect(table.state.focusedRowIndex()).toBe(0)
    })

    it('moveFocus right increments focusedColumnIndex', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
        rows: [{id: 'r1'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      expect(table.state.focusedColumnIndex()).toBe(0)
      table.actions.moveFocus('right')
      expect(table.state.focusedColumnIndex()).toBe(1)
      table.actions.moveFocus('right')
      expect(table.state.focusedColumnIndex()).toBe(2)
    })

    it('moveFocus left decrements focusedColumnIndex', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
        rows: [{id: 'r1'}],
        interactive: true,
        initialFocusedColumnIndex: 2,
        ariaLabel: 'Test table',
      })

      table.actions.moveFocus('left')
      expect(table.state.focusedColumnIndex()).toBe(1)
      table.actions.moveFocus('left')
      expect(table.state.focusedColumnIndex()).toBe(0)
    })

    it('focus stays within bounds at top-left edge', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      table.actions.moveFocus('up')
      expect(table.state.focusedRowIndex()).toBe(0)

      table.actions.moveFocus('left')
      expect(table.state.focusedColumnIndex()).toBe(0)
    })

    it('focus stays within bounds at bottom-right edge', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        interactive: true,
        initialFocusedRowIndex: 1,
        initialFocusedColumnIndex: 1,
        ariaLabel: 'Test table',
      })

      table.actions.moveFocus('down')
      expect(table.state.focusedRowIndex()).toBe(1)

      table.actions.moveFocus('right')
      expect(table.state.focusedColumnIndex()).toBe(1)
    })

    it('moveFocusToStart sets focus to first cell (0, 0)', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        interactive: true,
        initialFocusedRowIndex: 1,
        initialFocusedColumnIndex: 1,
        ariaLabel: 'Test table',
      })

      table.actions.moveFocusToStart()
      expect(table.state.focusedRowIndex()).toBe(0)
      expect(table.state.focusedColumnIndex()).toBe(0)
    })

    it('moveFocusToEnd sets focus to last cell', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
        rows: [{id: 'r1'}, {id: 'r2'}, {id: 'r3'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      table.actions.moveFocusToEnd()
      expect(table.state.focusedRowIndex()).toBe(2)
      expect(table.state.focusedColumnIndex()).toBe(2)
    })

    it('moveFocusToRowStart sets column to 0', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
        rows: [{id: 'r1'}],
        interactive: true,
        initialFocusedColumnIndex: 2,
        ariaLabel: 'Test table',
      })

      table.actions.moveFocusToRowStart()
      expect(table.state.focusedColumnIndex()).toBe(0)
    })

    it('moveFocusToRowEnd sets column to last', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
        rows: [{id: 'r1'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      table.actions.moveFocusToRowEnd()
      expect(table.state.focusedColumnIndex()).toBe(2)
    })

    it('setFocusedCell sets exact position', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
        rows: [{id: 'r1'}, {id: 'r2'}, {id: 'r3'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      table.actions.setFocusedCell(2, 1)
      expect(table.state.focusedRowIndex()).toBe(2)
      expect(table.state.focusedColumnIndex()).toBe(1)
    })

    it('setFocusedCell clamps to valid bounds', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      table.actions.setFocusedCell(-1, -1)
      expect(table.state.focusedRowIndex()).toBe(0)
      expect(table.state.focusedColumnIndex()).toBe(0)

      table.actions.setFocusedCell(100, 100)
      expect(table.state.focusedRowIndex()).toBe(1)
      expect(table.state.focusedColumnIndex()).toBe(1)
    })

    it('pageDown moves focus down by pageSize rows (clamped)', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}, {id: 'r3'}, {id: 'r4'}, {id: 'r5'}],
        interactive: true,
        pageSize: 2,
        ariaLabel: 'Test table',
      })

      expect(table.state.focusedRowIndex()).toBe(0)
      table.actions.pageDown()
      expect(table.state.focusedRowIndex()).toBe(2)
      table.actions.pageDown()
      expect(table.state.focusedRowIndex()).toBe(4)
      // Already at last row, clamped
      table.actions.pageDown()
      expect(table.state.focusedRowIndex()).toBe(4)
    })

    it('pageUp moves focus up by pageSize rows (clamped)', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}, {id: 'r3'}, {id: 'r4'}, {id: 'r5'}],
        interactive: true,
        pageSize: 2,
        initialFocusedRowIndex: 4,
        ariaLabel: 'Test table',
      })

      table.actions.pageUp()
      expect(table.state.focusedRowIndex()).toBe(2)
      table.actions.pageUp()
      expect(table.state.focusedRowIndex()).toBe(0)
      // Already at first row, clamped
      table.actions.pageUp()
      expect(table.state.focusedRowIndex()).toBe(0)
    })

    it('default pageSize is 10', () => {
      const rows = Array.from({length: 25}, (_, i) => ({id: `r${i}`}))
      const table = createTable({
        columns: [{id: 'a'}],
        rows,
        interactive: true,
        ariaLabel: 'Test table',
      })

      table.actions.pageDown()
      expect(table.state.focusedRowIndex()).toBe(10)
    })

    it('column headers participate in grid navigation (roving tabindex)', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}],
        rows: [{id: 'r1'}],
        interactive: true,
        initialFocusedRowIndex: 0,
        initialFocusedColumnIndex: 0,
        ariaLabel: 'Test table',
      })

      // Column headers have tabindex in interactive mode
      const headerA = table.contracts.getColumnHeaderProps('a')
      const headerB = table.contracts.getColumnHeaderProps('b')
      expect(headerA['tabindex']).toBeDefined()
      expect(headerB['tabindex']).toBeDefined()
    })

    it('exposes interactive=true on state', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      expect(table.state.interactive).toBe(true)
    })
  })

  // === handleKeyDown keyboard mapping (interactive mode) ===

  describe('handleKeyDown keyboard mapping', () => {
    it('ArrowDown maps to moveFocus(down)', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      table.actions.handleKeyDown({key: 'ArrowDown'})
      expect(table.state.focusedRowIndex()).toBe(1)
    })

    it('ArrowUp maps to moveFocus(up)', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        interactive: true,
        initialFocusedRowIndex: 1,
        ariaLabel: 'Test table',
      })

      table.actions.handleKeyDown({key: 'ArrowUp'})
      expect(table.state.focusedRowIndex()).toBe(0)
    })

    it('ArrowRight maps to moveFocus(right)', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}],
        rows: [{id: 'r1'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      table.actions.handleKeyDown({key: 'ArrowRight'})
      expect(table.state.focusedColumnIndex()).toBe(1)
    })

    it('ArrowLeft maps to moveFocus(left)', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}],
        rows: [{id: 'r1'}],
        interactive: true,
        initialFocusedColumnIndex: 1,
        ariaLabel: 'Test table',
      })

      table.actions.handleKeyDown({key: 'ArrowLeft'})
      expect(table.state.focusedColumnIndex()).toBe(0)
    })

    it('Home maps to moveFocusToRowStart', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
        rows: [{id: 'r1'}],
        interactive: true,
        initialFocusedColumnIndex: 2,
        ariaLabel: 'Test table',
      })

      table.actions.handleKeyDown({key: 'Home'})
      expect(table.state.focusedColumnIndex()).toBe(0)
    })

    it('End maps to moveFocusToRowEnd', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
        rows: [{id: 'r1'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      table.actions.handleKeyDown({key: 'End'})
      expect(table.state.focusedColumnIndex()).toBe(2)
    })

    it('Ctrl+Home maps to moveFocusToStart', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        interactive: true,
        initialFocusedRowIndex: 1,
        initialFocusedColumnIndex: 1,
        ariaLabel: 'Test table',
      })

      table.actions.handleKeyDown({key: 'Home', ctrlKey: true})
      expect(table.state.focusedRowIndex()).toBe(0)
      expect(table.state.focusedColumnIndex()).toBe(0)
    })

    it('Meta+Home maps to moveFocusToStart', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        interactive: true,
        initialFocusedRowIndex: 1,
        initialFocusedColumnIndex: 1,
        ariaLabel: 'Test table',
      })

      table.actions.handleKeyDown({key: 'Home', metaKey: true})
      expect(table.state.focusedRowIndex()).toBe(0)
      expect(table.state.focusedColumnIndex()).toBe(0)
    })

    it('Ctrl+End maps to moveFocusToEnd', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      table.actions.handleKeyDown({key: 'End', ctrlKey: true})
      expect(table.state.focusedRowIndex()).toBe(1)
      expect(table.state.focusedColumnIndex()).toBe(1)
    })

    it('Meta+End maps to moveFocusToEnd', () => {
      const table = createTable({
        columns: [{id: 'a'}, {id: 'b'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        interactive: true,
        ariaLabel: 'Test table',
      })

      table.actions.handleKeyDown({key: 'End', metaKey: true})
      expect(table.state.focusedRowIndex()).toBe(1)
      expect(table.state.focusedColumnIndex()).toBe(1)
    })

    it('PageUp maps to pageUp', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}, {id: 'r3'}, {id: 'r4'}, {id: 'r5'}],
        interactive: true,
        pageSize: 2,
        initialFocusedRowIndex: 4,
        ariaLabel: 'Test table',
      })

      table.actions.handleKeyDown({key: 'PageUp'})
      expect(table.state.focusedRowIndex()).toBe(2)
    })

    it('PageDown maps to pageDown', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}, {id: 'r3'}, {id: 'r4'}, {id: 'r5'}],
        interactive: true,
        pageSize: 2,
        ariaLabel: 'Test table',
      })

      table.actions.handleKeyDown({key: 'PageDown'})
      expect(table.state.focusedRowIndex()).toBe(2)
    })
  })

  // === Combined: interactive + selectable ===

  describe('combined: interactive + selectable', () => {
    it('Space key triggers toggleRowSelection for focused row when selectable', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        interactive: true,
        selectable: 'single',
        ariaLabel: 'Test table',
      })

      // Focus is on row 0 = r1
      table.actions.handleKeyDown({key: ' '})
      expect(table.state.selectedRowIds().has('r1')).toBe(true)
    })

    it('Space key in multi mode toggles focused row', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        interactive: true,
        selectable: 'multi',
        ariaLabel: 'Test table',
      })

      // Focus on r1
      table.actions.handleKeyDown({key: ' '})
      expect(table.state.selectedRowIds().has('r1')).toBe(true)

      // Move to r2
      table.actions.moveFocus('down')
      table.actions.handleKeyDown({key: ' '})
      expect(table.state.selectedRowIds().has('r1')).toBe(true)
      expect(table.state.selectedRowIds().has('r2')).toBe(true)
    })

    it('Ctrl+A selects all rows when selectable=multi in interactive mode', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}, {id: 'r3'}],
        interactive: true,
        selectable: 'multi',
        ariaLabel: 'Test table',
      })

      table.actions.handleKeyDown({key: 'a', ctrlKey: true})
      expect(table.state.selectedRowIds().size).toBe(3)
    })

    it('Meta+A selects all rows when selectable=multi in interactive mode', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}, {id: 'r3'}],
        interactive: true,
        selectable: 'multi',
        ariaLabel: 'Test table',
      })

      table.actions.handleKeyDown({key: 'a', metaKey: true})
      expect(table.state.selectedRowIds().size).toBe(3)
    })

    it('non-interactive + selectable: selection works without grid navigation', () => {
      const table = createTable({
        columns: [{id: 'a'}],
        rows: [{id: 'r1'}, {id: 'r2'}],
        selectable: 'multi',
        ariaLabel: 'Test table',
      })

      table.actions.selectRow('r1')
      table.actions.selectRow('r2')
      expect(table.state.selectedRowIds().size).toBe(2)
      expect(table.state.focusedRowIndex()).toBeNull()
    })
  })
})
