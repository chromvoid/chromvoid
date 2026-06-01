import {describe, expect, it} from 'vitest'

import {FileDeletionMotionModel} from '../../src/features/file-manager/models/file-deletion-motion.model'
import type {FileListItem} from '../../src/shared/contracts/file-manager'

const createItem = (id: number): FileListItem => ({
  id,
  path: `/Docs/file-${id}.md`,
  name: `file-${id}.md`,
  isDir: false,
  size: id * 100,
  mimeType: 'text/markdown',
})

describe('FileDeletionMotionModel', () => {
  it('retains a pending visible row after it disappears from source rows', () => {
    const model = new FileDeletionMotionModel()
    const rows = [createItem(1), createItem(2), createItem(3)].map((item, virtualIndex) => ({
      ...item,
      virtualIndex,
    }))

    model.markPending([rows[1]!])
    model.syncVisibleExits([rows[0]!, rows[2]!], rows, [rows[0]!, rows[2]!])

    const decorated = model.decorateVisibleRows([rows[0]!, {...rows[2]!, virtualIndex: 1}], [
      rows[0]!,
      rows[2]!,
    ])

    expect(decorated.totalItemsCount).toBe(3)
    expect(decorated.items.map((item) => ('kind' in item ? item.placeholderKey : item.id))).toEqual([1, 2, 3])
    expect(decorated.items[1]).toMatchObject({id: 2, deleteExiting: true})
  })

  it('clears pending rows that were not in the visible snapshot', () => {
    const model = new FileDeletionMotionModel()
    const rows = [createItem(1), createItem(2)]

    model.markPending([rows[1]!])
    model.syncVisibleExits([rows[0]!], [], [rows[0]!])

    const decorated = model.decorateVisibleRows([rows[0]!], [rows[0]!])

    expect(decorated.items).toHaveLength(1)
    expect(model.hasExiting(2)).toBe(false)
  })

  it('removes retained rows on completion', () => {
    const model = new FileDeletionMotionModel()
    const rows = [createItem(1), createItem(2)].map((item, virtualIndex) => ({
      ...item,
      virtualIndex,
    }))

    model.markPending([rows[1]!])
    model.syncVisibleExits([rows[0]!], rows, [rows[0]!])
    expect(model.hasExiting(2)).toBe(true)

    model.completeExit(2)

    expect(model.hasExiting(2)).toBe(false)
    expect(model.decorateVisibleRows([rows[0]!], [rows[0]!]).totalItemsCount).toBe(1)
  })
})
