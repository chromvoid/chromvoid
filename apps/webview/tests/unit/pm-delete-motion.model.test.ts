import {describe, expect, it} from 'vitest'

import type {Entry, Group} from '@project/passmanager/core'
import {PMDeleteMotionModel} from '../../src/features/passmanager/models/pm-delete-motion.model'
import type {
  PMGroupEntryRow,
  PMGroupFolderRow,
} from '../../src/features/passmanager/models/pm-root-search-projection'

const createEntry = (id: string): Entry => ({id}) as Entry
const createGroup = (id: string): Group => ({id}) as Group

const createEntryRow = (id: string): PMGroupEntryRow => ({
  kind: 'entry',
  id,
  item: createEntry(id),
})

const createGroupRow = (id: string): PMGroupFolderRow => ({
  kind: 'group',
  id,
  item: createGroup(id),
})

describe('PMDeleteMotionModel', () => {
  it('retains pending visible entry rows after they disappear from source rows', () => {
    const model = new PMDeleteMotionModel()
    const rows = [createGroupRow('folder-1'), createEntryRow('entry-1'), createEntryRow('entry-2')]

    model.markPending([rows[1]!.item])
    model.syncVisibleExits(
      [rows[0]!, rows[2]!],
      rows.map((row, index) => ({row, index})),
      {first: 0, last: 2},
    )

    const decorated = model.decorateRows([rows[0]!, rows[2]!])

    expect(decorated.map((row) => row.id)).toEqual(['folder-1', 'entry-1', 'entry-2'])
    expect(decorated[1]).toMatchObject({id: 'entry-1', deleteExiting: true})
  })

  it('retains pending visible group rows after they disappear from source rows', () => {
    const model = new PMDeleteMotionModel()
    const rows = [createGroupRow('folder-1'), createEntryRow('entry-1')]

    model.markPending([rows[0]!.item])
    model.syncVisibleExits(
      [rows[1]!],
      rows.map((row, index) => ({row, index})),
      {first: 0, last: 1},
    )

    const decorated = model.decorateRows([rows[1]!])

    expect(decorated.map((row) => row.id)).toEqual(['folder-1', 'entry-1'])
    expect(decorated[0]).toMatchObject({id: 'folder-1', deleteExiting: true})
  })

  it('clears pending rows that were not in the visible snapshot', () => {
    const model = new PMDeleteMotionModel()
    const rows = [createEntryRow('entry-1'), createEntryRow('entry-2')]

    model.markPending([rows[1]!.item])
    model.syncVisibleExits([rows[0]!], [{row: rows[0]!, index: 0}], {first: 0, last: 0})

    expect(model.decorateRows([rows[0]!]).map((row) => row.id)).toEqual(['entry-1'])
    expect(model.hasExiting('entry-2')).toBe(false)
  })

  it('removes retained rows on completion', () => {
    const model = new PMDeleteMotionModel()
    const rows = [createEntryRow('entry-1'), createEntryRow('entry-2')]

    model.markPending([rows[1]!.item])
    model.syncVisibleExits([rows[0]!], rows.map((row, index) => ({row, index})), {first: 0, last: 1})
    expect(model.hasExiting('entry-2')).toBe(true)

    model.completeExit('entry-2')

    expect(model.hasExiting('entry-2')).toBe(false)
    expect(model.decorateRows([rows[0]!]).map((row) => row.id)).toEqual(['entry-1'])
  })
})
