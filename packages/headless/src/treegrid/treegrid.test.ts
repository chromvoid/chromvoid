import {describe, expect, it} from 'vitest'
import {createTreegrid} from './index'

const rows = [
  {
    id: 'r1',
    children: [
      {id: 'r1a'},
      {
        id: 'r1b',
        children: [{id: 'r1b1'}],
      },
    ],
  },
  {
    id: 'r2',
    children: [{id: 'r2a'}],
  },
] as const

const columns = [{id: 'c1'}, {id: 'c2'}, {id: 'c3'}] as const

describe('createTreegrid', () => {
  it('navigates vertically between visible rows in same column', () => {
    const treegrid = createTreegrid({
      idBase: 'tg-vertical',
      rows,
      columns,
      initialExpandedRowIds: ['r1'],
      initialActiveCellId: {rowId: 'r1', colId: 'c2'},
    })

    treegrid.actions.handleKeyDown({key: 'ArrowDown'})
    expect(treegrid.state.activeCellId()).toEqual({rowId: 'r1a', colId: 'c2'})

    treegrid.actions.handleKeyDown({key: 'ArrowDown'})
    expect(treegrid.state.activeCellId()).toEqual({rowId: 'r1b', colId: 'c2'})

    treegrid.actions.handleKeyDown({key: 'ArrowUp'})
    expect(treegrid.state.activeCellId()).toEqual({rowId: 'r1a', colId: 'c2'})
  })

  it('handles ArrowRight expand then move to first child in same column', () => {
    const treegrid = createTreegrid({
      idBase: 'tg-right',
      rows,
      columns,
      initialActiveCellId: {rowId: 'r1', colId: 'c2'},
    })

    treegrid.actions.handleKeyDown({key: 'ArrowRight'})
    expect(treegrid.state.expandedRowIds().has('r1')).toBe(true)
    expect(treegrid.state.activeCellId()).toEqual({rowId: 'r1', colId: 'c2'})

    treegrid.actions.handleKeyDown({key: 'ArrowRight'})
    expect(treegrid.state.activeCellId()).toEqual({rowId: 'r1a', colId: 'c2'})
  })

  it('handles ArrowLeft parent transition and collapse behavior', () => {
    const treegrid = createTreegrid({
      idBase: 'tg-left',
      rows,
      columns,
      initialExpandedRowIds: ['r1'],
      initialActiveCellId: {rowId: 'r1a', colId: 'c3'},
    })

    treegrid.actions.handleKeyDown({key: 'ArrowLeft'})
    expect(treegrid.state.activeCellId()).toEqual({rowId: 'r1', colId: 'c3'})

    treegrid.actions.handleKeyDown({key: 'ArrowLeft'})
    expect(treegrid.state.expandedRowIds().has('r1')).toBe(false)
    expect(treegrid.state.activeCellId()).toEqual({rowId: 'r1', colId: 'c3'})
  })

  it('moves active cell to collapsed ancestor when descendant is active', () => {
    const treegrid = createTreegrid({
      idBase: 'tg-collapse-invariant',
      rows,
      columns,
      initialExpandedRowIds: ['r1', 'r1b'],
      initialActiveCellId: {rowId: 'r1b1', colId: 'c2'},
    })

    treegrid.actions.collapseRow('r1')
    expect(treegrid.state.activeCellId()).toEqual({rowId: 'r1', colId: 'c2'})
  })

  it('maps hierarchical aria metadata and row/cell contracts', () => {
    const treegrid = createTreegrid({
      idBase: 'tg-aria',
      rows,
      columns: [
        {id: 'name', cellRole: 'rowheader'},
        {id: 'value', cellRole: 'gridcell'},
      ],
      initialExpandedRowIds: ['r1'],
      initialSelectedRowIds: ['r1a'],
      initialActiveCellId: {rowId: 'r1a', colId: 'name'},
      selectionMode: 'multiple',
    })

    const root = treegrid.contracts.getTreegridProps()
    expect(root).toMatchObject({
      role: 'treegrid',
      'aria-rowcount': 6,
      'aria-colcount': 2,
      'aria-multiselectable': 'true',
    })

    const row = treegrid.contracts.getRowProps('r1a')
    expect(row).toMatchObject({
      role: 'row',
      'aria-level': 2,
      'aria-posinset': 1,
      'aria-setsize': 2,
      'aria-selected': 'true',
    })

    const parentRow = treegrid.contracts.getRowProps('r1')
    expect(parentRow['aria-expanded']).toBe('true')

    const cell = treegrid.contracts.getCellProps('r1a', 'name')
    expect(cell).toMatchObject({
      role: 'rowheader',
      tabindex: '0',
      'aria-selected': 'true',
      'data-active': 'true',
    })
  })

  it('supports Home/End and Ctrl+Home/Ctrl+End boundaries', () => {
    const treegrid = createTreegrid({
      idBase: 'tg-home-end',
      rows,
      columns,
      initialExpandedRowIds: ['r1'],
      initialActiveCellId: {rowId: 'r1a', colId: 'c2'},
    })

    treegrid.actions.handleKeyDown({key: 'Home'})
    expect(treegrid.state.activeCellId()).toEqual({rowId: 'r1a', colId: 'c1'})

    treegrid.actions.handleKeyDown({key: 'End'})
    expect(treegrid.state.activeCellId()).toEqual({rowId: 'r1a', colId: 'c3'})

    treegrid.actions.handleKeyDown({key: 'Home', ctrlKey: true})
    expect(treegrid.state.activeCellId()).toEqual({rowId: 'r1', colId: 'c1'})

    treegrid.actions.handleKeyDown({key: 'End', ctrlKey: true})
    expect(treegrid.state.activeCellId()).toEqual({rowId: 'r2', colId: 'c3'})
  })

  it('skips disabled rows and cells while navigating', () => {
    const treegrid = createTreegrid({
      idBase: 'tg-disabled',
      rows: [{id: 'r1'}, {id: 'r2', disabled: true}, {id: 'r3'}],
      columns: [{id: 'c1'}, {id: 'c2'}],
      disabledCells: [{rowId: 'r3', colId: 'c2'}],
      initialActiveCellId: {rowId: 'r1', colId: 'c2'},
    })

    treegrid.actions.handleKeyDown({key: 'ArrowDown'})
    expect(treegrid.state.activeCellId()).toEqual({rowId: 'r1', colId: 'c2'})

    treegrid.actions.handleKeyDown({key: 'ArrowLeft'})
    expect(treegrid.state.activeCellId()).toEqual({rowId: 'r1', colId: 'c1'})

    treegrid.actions.handleKeyDown({key: 'ArrowDown'})
    expect(treegrid.state.activeCellId()).toEqual({rowId: 'r3', colId: 'c1'})
  })
})
