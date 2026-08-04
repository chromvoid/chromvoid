import {describe, expect, it} from 'vitest'

import type {Entry} from '@project/passmanager/core'
import {PMListMutationMotionModel} from '../../src/features/passmanager/models/pm-list-mutation-motion.model'
import type {PMGroupEntryRow} from '../../src/features/passmanager/models/pm-root-search-projection'

const createRow = (id: string): PMGroupEntryRow => ({
  kind: 'entry',
  id,
  item: {id} as Entry,
})

const visibleRows = (rows: readonly PMGroupEntryRow[]) =>
  rows.map((row, index) => ({row, index}))

describe('PMListMutationMotionModel', () => {
  it('tracks the same deletion independently in content and desktop-tree scopes', () => {
    const model = new PMListMutationMotionModel()
    const rows = [createRow('entry-1'), createRow('entry-2')]

    model.syncProjection('content', rows, visibleRows(rows), {first: 0, last: 1})
    model.syncProjection('desktop-tree', rows, visibleRows(rows), {first: 0, last: 1})
    model.markPending([rows[0]!.item])
    model.syncProjection('content', rows, visibleRows(rows), {first: 0, last: 1})
    model.syncProjection('desktop-tree', rows, visibleRows(rows), {first: 0, last: 1})

    expect(model.hasExiting('entry-1', 'content')).toBe(true)
    expect(model.hasExiting('entry-1', 'desktop-tree')).toBe(true)

    model.completeExitBatch('content', ['entry-1'])

    expect(model.decorateProjection('content', rows).map((row) => row.id)).toEqual(['entry-2'])
    expect(model.decorateProjection('desktop-tree', rows)[0]).toMatchObject({
      id: 'entry-1',
      deleteExiting: true,
    })
  })

  it('does not let an offscreen scope consume a deletion needed by a visible scope', () => {
    const model = new PMListMutationMotionModel()
    const rows = Array.from({length: 5}, (_value, index) => createRow(`entry-${index}`))
    const target = rows[4]!

    model.syncProjection('offscreen-content', rows, visibleRows(rows.slice(0, 2)), {
      first: 0,
      last: 1,
    })
    model.syncProjection('visible-tree', rows, visibleRows(rows), {first: 0, last: 4})
    model.markPending([target.item])
    model.syncProjection('offscreen-content', rows, visibleRows(rows.slice(0, 2)), {
      first: 0,
      last: 1,
    })

    expect(model.hasExiting(target.id, 'offscreen-content')).toBe(false)

    model.syncProjection('visible-tree', rows, visibleRows(rows), {first: 0, last: 4})
    expect(model.hasExiting(target.id, 'visible-tree')).toBe(true)
  })

  it('completes a bulk exit as one projection batch', () => {
    const model = new PMListMutationMotionModel()
    const rows = [createRow('entry-1'), createRow('entry-2'), createRow('entry-3')]

    model.syncProjection('content', rows, visibleRows(rows), {first: 0, last: 2})
    model.markPending([rows[0]!.item, rows[1]!.item])
    model.syncProjection('content', rows, visibleRows(rows), {first: 0, last: 2})
    model.completeExitBatch('content', ['entry-1', 'entry-2'])

    expect(model.decorateProjection('content', rows).map((row) => row.id)).toEqual(['entry-3'])
  })

  it('does not animate initial data and stages a later visible insertion for one render cycle', () => {
    const model = new PMListMutationMotionModel()
    const initialRows = [createRow('entry-1')]
    const nextRows = [...initialRows, createRow('entry-2')]

    model.syncProjection('content', initialRows, [], {first: 0, last: 0})
    expect(model.getStagedEnterIds('content')).toEqual([])

    model.syncProjection('content', nextRows, visibleRows(initialRows), {first: 0, last: 1})
    expect(model.getStagedEnterIds('content')).toEqual(['entry-2'])
    expect(model.decorateProjection('content', nextRows).map((row) => row.id)).toEqual(['entry-1'])

    model.revealEnterBatch('content', ['entry-2'])
    expect(model.decorateProjection('content', nextRows)[1]).toMatchObject({
      id: 'entry-2',
      entering: 'add',
    })
    model.consumeEnter('content', 'entry-2')
    expect(model.decorateProjection('content', nextRows)).toEqual(nextRows)
  })

  it('consumes an offscreen insertion without replaying it when it later becomes visible', () => {
    const model = new PMListMutationMotionModel()
    const initialRows = Array.from({length: 5}, (_value, index) => createRow(`entry-${index}`))
    const inserted = createRow('entry-offscreen')
    const nextRows = [...initialRows, inserted]

    model.syncProjection('content', initialRows, visibleRows(initialRows.slice(0, 2)), {
      first: 0,
      last: 1,
    })
    model.syncProjection('content', nextRows, visibleRows(initialRows.slice(0, 2)), {
      first: 0,
      last: 1,
    })
    expect(model.getStagedEnterIds('content')).toEqual([])

    model.syncProjection('content', nextRows, [{row: inserted, index: 5}], {first: 5, last: 5})
    expect(model.getStagedEnterIds('content')).toEqual([])
    expect(model.decorateProjection('content', nextRows)).toEqual(nextRows)
  })

  it('restores a failed deletion with an explicit recovery phase', () => {
    const model = new PMListMutationMotionModel()
    const rows = [createRow('entry-1')]

    model.syncProjection('content', rows, visibleRows(rows), {first: 0, last: 0})
    model.markPending([rows[0]!.item])
    model.syncProjection('content', rows, visibleRows(rows), {first: 0, last: 0})
    model.completeExitBatch('content', ['entry-1'])
    model.clearPending(['entry-1'])

    expect(model.decorateProjection('content', rows)[0]).toMatchObject({
      id: 'entry-1',
      entering: 'restore',
    })
  })
})
