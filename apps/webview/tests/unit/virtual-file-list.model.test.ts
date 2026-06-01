import {describe, expect, it} from 'vitest'

import {VirtualFileListModel} from '../../src/features/file-manager/models/virtual-file-list.model'
import type {FileListItem} from '../../src/shared/contracts/file-manager'

const items: FileListItem[] = Array.from({length: 100}, (_, index) => ({
  id: index + 1,
  path: `/image-${index + 1}.jpg`,
  name: `image-${index + 1}.jpg`,
  isDir: false,
  size: 1024,
  lastModified: 1710000000000 + index,
  mimeType: 'image/jpeg',
}))

describe('virtual file list model', () => {
  it('bounds grid visible items to the viewport window plus overscan rows', () => {
    const model = new VirtualFileListModel()
    model.setGridViewportMetrics({columns: 4, rowHeight: 216})

    const visible = model.getVisibleItems(items, 'grid', 80, 216 * 5, 216 * 2, 4, 216)

    expect(visible.map((item) => item.id)).toEqual(items.slice(16, 36).map((item) => item.id))
    expect(visible[0]?.virtualIndex).toBe(16)
    expect(visible.length).toBeLessThan(items.length)
  })

  it('computes grid scroll positions for items outside the rendered window', () => {
    const model = new VirtualFileListModel()
    model.setGridViewportMetrics({columns: 4, rowHeight: 216})

    expect(model.getGridScrollTopForIndex(40, 432, 0)).toBe(1944)
    expect(model.getGridScrollTopForIndex(2, 432, 1944)).toBe(0)
  })

  it('computes visible ranges without requiring materialized file items', () => {
    const model = new VirtualFileListModel()

    expect(model.getVisibleRange(10_000, 'list', 80, 80 * 200, 400)).toEqual({
      startIndex: 200,
      endIndex: 207,
    })
  })

  it('maps unloaded slots to visible skeleton placeholders only', () => {
    const model = new VirtualFileListModel()
    const slots: Array<FileListItem | null> = Array.from({length: 10_000}, () => null)
    slots[202] = items[0] ?? null

    const visible = model.getVisibleItems(slots, 'list', 80, 80 * 200, 400)

    expect(visible).toHaveLength(7)
    expect(visible[0]).toMatchObject({kind: 'placeholder', virtualIndex: 200})
    expect(visible[2]).toMatchObject({id: 1, virtualIndex: 202})
  })
})
