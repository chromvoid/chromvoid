import {describe, expect, it} from 'vitest'
import {createGrid} from './index'

describe('createGrid', () => {
  const baseRows = [{id: 'r1'}, {id: 'r2'}, {id: 'r3'}]
  const baseColumns = [{id: 'c1'}, {id: 'c2'}, {id: 'c3'}]

  it('supports 2D arrow navigation across rows and columns', () => {
    const grid = createGrid({
      idBase: 'grid-arrows',
      rows: baseRows,
      columns: baseColumns,
      initialActiveCellId: {rowId: 'r2', colId: 'c2'},
    })

    grid.actions.handleKeyDown({key: 'ArrowRight'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r2', colId: 'c3'})

    grid.actions.handleKeyDown({key: 'ArrowDown'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r3', colId: 'c3'})

    grid.actions.handleKeyDown({key: 'ArrowLeft'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r3', colId: 'c2'})

    grid.actions.handleKeyDown({key: 'ArrowUp'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r2', colId: 'c2'})
  })

  it('handles Home/End and Ctrl+Home/Ctrl+End boundaries', () => {
    const grid = createGrid({
      idBase: 'grid-boundaries',
      rows: baseRows,
      columns: baseColumns,
      initialActiveCellId: {rowId: 'r2', colId: 'c2'},
    })

    grid.actions.handleKeyDown({key: 'Home'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r2', colId: 'c1'})

    grid.actions.handleKeyDown({key: 'End'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r2', colId: 'c3'})

    grid.actions.handleKeyDown({key: 'Home', ctrlKey: true})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r1', colId: 'c1'})

    grid.actions.handleKeyDown({key: 'End', ctrlKey: true})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r3', colId: 'c3'})
  })

  it('skips disabled cells during navigation', () => {
    const grid = createGrid({
      idBase: 'grid-disabled',
      rows: baseRows,
      columns: baseColumns,
      disabledCells: [{rowId: 'r1', colId: 'c2'}],
      initialActiveCellId: {rowId: 'r1', colId: 'c1'},
    })

    grid.actions.handleKeyDown({key: 'ArrowRight'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r1', colId: 'c3'})
  })

  it('supports multiple selection toggles when enabled', () => {
    const grid = createGrid({
      idBase: 'grid-multi-select',
      rows: baseRows,
      columns: baseColumns,
      selectionMode: 'multiple',
    })

    grid.actions.toggleCellSelection({rowId: 'r1', colId: 'c1'})
    grid.actions.toggleCellSelection({rowId: 'r2', colId: 'c2'})

    expect(grid.state.selectedCellIds()).toEqual(new Set(['r1::c1', 'r2::c2']))

    grid.actions.toggleCellSelection({rowId: 'r1', colId: 'c1'})
    expect(grid.state.selectedCellIds()).toEqual(new Set(['r2::c2']))
  })

  it('maps virtualized total row/column counts in ARIA props', () => {
    const grid = createGrid({
      idBase: 'grid-virtual',
      rows: [{id: 'r20', index: 20}],
      columns: [{id: 'c10', index: 10}],
      totalRowCount: 200,
      totalColumnCount: 50,
    })

    expect(grid.contracts.getGridProps()).toMatchObject({
      role: 'grid',
      'aria-rowcount': 200,
      'aria-colcount': 50,
    })
    expect(grid.contracts.getRowProps('r20')['aria-rowindex']).toBe(20)
    expect(grid.contracts.getCellProps('r20', 'c10')['aria-colindex']).toBe(10)
  })

  it('skips disabled cells during vertical navigation', () => {
    const grid = createGrid({
      idBase: 'grid-vdisabled',
      rows: baseRows,
      columns: baseColumns,
      disabledCells: [{rowId: 'r2', colId: 'c1'}],
      initialActiveCellId: {rowId: 'r1', colId: 'c1'},
    })

    grid.actions.handleKeyDown({key: 'ArrowDown'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r3', colId: 'c1'})

    grid.actions.handleKeyDown({key: 'ArrowUp'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r1', colId: 'c1'})
  })

  it('handles PageUp and PageDown navigation', () => {
    const rows = Array.from({length: 25}, (_, i) => ({id: `r${i}`}))
    const grid = createGrid({
      idBase: 'grid-page',
      rows,
      columns: baseColumns,
      pageSize: 10,
      initialActiveCellId: {rowId: 'r12', colId: 'c2'},
    })

    grid.actions.handleKeyDown({key: 'PageUp'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r2', colId: 'c2'})

    grid.actions.handleKeyDown({key: 'PageDown'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r12', colId: 'c2'})

    // PageDown near end clamps to last row
    grid.actions.setActiveCell({rowId: 'r20', colId: 'c2'})
    grid.actions.handleKeyDown({key: 'PageDown'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r24', colId: 'c2'})
  })

  it('selectRow selects all enabled cells in a row', () => {
    const grid = createGrid({
      idBase: 'grid-selrow',
      rows: baseRows,
      columns: baseColumns,
      selectionMode: 'multiple',
      disabledCells: [{rowId: 'r2', colId: 'c2'}],
    })

    grid.actions.selectRow('r2')
    expect(grid.state.selectedCellIds()).toEqual(new Set(['r2::c1', 'r2::c3']))
  })

  it('selectColumn selects all enabled cells in a column', () => {
    const grid = createGrid({
      idBase: 'grid-selcol',
      rows: baseRows,
      columns: baseColumns,
      selectionMode: 'multiple',
      disabledCells: [{rowId: 'r1', colId: 'c2'}],
    })

    grid.actions.selectColumn('c2')
    expect(grid.state.selectedCellIds()).toEqual(new Set(['r2::c2', 'r3::c2']))
  })

  it('selectionFollowsFocus updates selection on navigation', () => {
    const grid = createGrid({
      idBase: 'grid-selfocus',
      rows: baseRows,
      columns: baseColumns,
      selectionFollowsFocus: true,
      initialActiveCellId: {rowId: 'r1', colId: 'c1'},
    })

    expect(grid.state.selectedCellIds()).toEqual(new Set())

    grid.actions.handleKeyDown({key: 'ArrowRight'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r1', colId: 'c2'})
    expect(grid.state.selectedCellIds()).toEqual(new Set(['r1::c2']))

    grid.actions.handleKeyDown({key: 'ArrowDown'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r2', colId: 'c2'})
    expect(grid.state.selectedCellIds()).toEqual(new Set(['r2::c2']))
  })

  it('Enter key moves focus to next row', () => {
    const grid = createGrid({
      idBase: 'grid-enter',
      rows: baseRows,
      columns: baseColumns,
      initialActiveCellId: {rowId: 'r1', colId: 'c2'},
    })

    grid.actions.handleKeyDown({key: 'Enter'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r2', colId: 'c2'})
  })

  it('Space key selects active cell in single mode', () => {
    const grid = createGrid({
      idBase: 'grid-space-single',
      rows: baseRows,
      columns: baseColumns,
      initialActiveCellId: {rowId: 'r2', colId: 'c1'},
    })

    grid.actions.handleKeyDown({key: ' '})
    expect(grid.state.selectedCellIds()).toEqual(new Set(['r2::c1']))
  })

  it('Space key toggles selection in multiple mode', () => {
    const grid = createGrid({
      idBase: 'grid-space-multi',
      rows: baseRows,
      columns: baseColumns,
      selectionMode: 'multiple',
      initialActiveCellId: {rowId: 'r1', colId: 'c1'},
    })

    grid.actions.handleKeyDown({key: ' '})
    expect(grid.state.selectedCellIds()).toEqual(new Set(['r1::c1']))

    grid.actions.setActiveCell({rowId: 'r2', colId: 'c2'})
    grid.actions.handleKeyDown({key: ' '})
    expect(grid.state.selectedCellIds()).toEqual(new Set(['r1::c1', 'r2::c2']))

    // Toggle off
    grid.actions.setActiveCell({rowId: 'r1', colId: 'c1'})
    grid.actions.handleKeyDown({key: ' '})
    expect(grid.state.selectedCellIds()).toEqual(new Set(['r2::c2']))
  })

  it('supports focus strategy parity for roving and activedescendant', () => {
    const roving = createGrid({
      idBase: 'grid-roving',
      rows: baseRows,
      columns: baseColumns,
      focusStrategy: 'roving-tabindex',
      initialActiveCellId: {rowId: 'r1', colId: 'c2'},
    })

    expect(roving.contracts.getGridProps()).toMatchObject({
      tabindex: '-1',
      'aria-activedescendant': undefined,
    })
    expect(roving.contracts.getCellProps('r1', 'c2').tabindex).toBe('0')

    const activeDesc = createGrid({
      idBase: 'grid-activedesc',
      rows: baseRows,
      columns: baseColumns,
      focusStrategy: 'aria-activedescendant',
      initialActiveCellId: {rowId: 'r2', colId: 'c3'},
    })

    expect(activeDesc.contracts.getGridProps()).toMatchObject({
      tabindex: '0',
      'aria-activedescendant': 'grid-activedesc-cell-r2-c3',
    })
    expect(activeDesc.contracts.getCellProps('r2', 'c3').tabindex).toBe('-1')
  })

  it('normalizes invalid initialActiveCellId to first enabled cell', () => {
    const grid = createGrid({
      idBase: 'grid-norm-invalid',
      rows: baseRows,
      columns: baseColumns,
      initialActiveCellId: {rowId: 'nonexistent', colId: 'c1'},
    })

    expect(grid.state.activeCellId()).toEqual({rowId: 'r1', colId: 'c1'})
  })

  it('normalizes disabled initialActiveCellId to first enabled cell', () => {
    const grid = createGrid({
      idBase: 'grid-norm-disabled',
      rows: baseRows,
      columns: baseColumns,
      disabledCells: [{rowId: 'r1', colId: 'c1'}],
      initialActiveCellId: {rowId: 'r1', colId: 'c1'},
    })

    expect(grid.state.activeCellId()).toEqual({rowId: 'r1', colId: 'c2'})
  })

  it('filters disabled cells from initialSelectedCellIds', () => {
    const grid = createGrid({
      idBase: 'grid-norm-sel',
      rows: baseRows,
      columns: baseColumns,
      disabledCells: [{rowId: 'r1', colId: 'c2'}],
      initialSelectedCellIds: [
        {rowId: 'r1', colId: 'c1'},
        {rowId: 'r1', colId: 'c2'},
        {rowId: 'r2', colId: 'c3'},
      ],
    })

    expect(grid.state.selectedCellIds()).toEqual(new Set(['r1::c1', 'r2::c3']))
  })

  it('filters non-existent cells from initialSelectedCellIds', () => {
    const grid = createGrid({
      idBase: 'grid-norm-sel-missing',
      rows: baseRows,
      columns: baseColumns,
      initialSelectedCellIds: [
        {rowId: 'r1', colId: 'c1'},
        {rowId: 'missing', colId: 'c1'},
      ],
    })

    expect(grid.state.selectedCellIds()).toEqual(new Set(['r1::c1']))
  })

  it('sets activeCellId to null when all cells are disabled', () => {
    const grid = createGrid({
      idBase: 'grid-all-disabled',
      rows: [{id: 'r1', disabled: true}],
      columns: [{id: 'c1'}],
    })

    expect(grid.state.activeCellId()).toBe(null)
  })

  it('throws for unknown rowId in getRowProps', () => {
    const grid = createGrid({
      idBase: 'grid-throw-row',
      rows: baseRows,
      columns: baseColumns,
    })

    expect(() => grid.contracts.getRowProps('unknown')).toThrow('Unknown grid row id: unknown')
  })

  it('throws for unknown cell in getCellProps', () => {
    const grid = createGrid({
      idBase: 'grid-throw-cell',
      rows: baseRows,
      columns: baseColumns,
    })

    expect(() => grid.contracts.getCellProps('r1', 'unknown')).toThrow()
    expect(() => grid.contracts.getCellProps('unknown', 'c1')).toThrow()
  })

  it('selectRow in single mode selects only the first enabled cell', () => {
    const grid = createGrid({
      idBase: 'grid-selrow-single',
      rows: baseRows,
      columns: baseColumns,
      selectionMode: 'single',
    })

    grid.actions.selectRow('r2')
    expect(grid.state.selectedCellIds()).toEqual(new Set(['r2::c1']))
  })

  it('selectColumn in single mode selects only the first enabled cell', () => {
    const grid = createGrid({
      idBase: 'grid-selcol-single',
      rows: baseRows,
      columns: baseColumns,
      selectionMode: 'single',
    })

    grid.actions.selectColumn('c2')
    expect(grid.state.selectedCellIds()).toEqual(new Set(['r1::c2']))
  })

  it('does not move past grid boundaries on arrow keys', () => {
    const grid = createGrid({
      idBase: 'grid-boundary',
      rows: baseRows,
      columns: baseColumns,
      initialActiveCellId: {rowId: 'r1', colId: 'c1'},
    })

    grid.actions.handleKeyDown({key: 'ArrowUp'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r1', colId: 'c1'})

    grid.actions.handleKeyDown({key: 'ArrowLeft'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r1', colId: 'c1'})

    grid.actions.setActiveCell({rowId: 'r3', colId: 'c3'})
    grid.actions.handleKeyDown({key: 'ArrowDown'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r3', colId: 'c3'})

    grid.actions.handleKeyDown({key: 'ArrowRight'})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r3', colId: 'c3'})
  })

  it('applies aria-readonly when isReadOnly is true', () => {
    const grid = createGrid({
      idBase: 'grid-readonly',
      rows: baseRows,
      columns: baseColumns,
      isReadOnly: true,
    })

    expect(grid.contracts.getCellProps('r1', 'c1')['aria-readonly']).toBe('true')
  })

  it('does not set aria-readonly when isReadOnly is false', () => {
    const grid = createGrid({
      idBase: 'grid-not-readonly',
      rows: baseRows,
      columns: baseColumns,
    })

    expect(grid.contracts.getCellProps('r1', 'c1')['aria-readonly']).toBeUndefined()
  })

  it('Ctrl+Home and Ctrl+End with Meta key work the same as Ctrl', () => {
    const grid = createGrid({
      idBase: 'grid-meta',
      rows: baseRows,
      columns: baseColumns,
      initialActiveCellId: {rowId: 'r2', colId: 'c2'},
    })

    grid.actions.handleKeyDown({key: 'Home', metaKey: true})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r1', colId: 'c1'})

    grid.actions.handleKeyDown({key: 'End', metaKey: true})
    expect(grid.state.activeCellId()).toEqual({rowId: 'r3', colId: 'c3'})
  })
})
