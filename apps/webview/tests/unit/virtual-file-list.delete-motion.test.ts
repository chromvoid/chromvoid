import {afterEach, describe, expect, it, vi} from 'vitest'

import {VirtualFileList} from '../../src/features/file-manager/components/virtual-file-list'
import {FileDeletionMotionModel} from '../../src/features/file-manager/models/file-deletion-motion.model'
import type {FileListItem, SearchFilters} from '../../src/shared/contracts/file-manager'

const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: true,
  fileTypes: [],
}

const createItems = (count: number): FileListItem[] =>
  Array.from({length: count}, (_, index) => ({
    id: index + 1,
    path: `/Docs/file-${index + 1}.md`,
    name: `file-${index + 1}.md`,
    isDir: false,
    size: (index + 1) * 100,
    mimeType: 'text/markdown',
  }))

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await element.updateComplete
}

function mockListHeight(height: number) {
  return vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height)
}

describe('virtual-file-list delete motion', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('keeps a deleted list row until its exit animation completes', async () => {
    mockListHeight(400)
    VirtualFileList.define()
    const deletionMotion = new FileDeletionMotionModel()
    const items = createItems(5)
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = items
    element.filters = {...DEFAULT_FILTERS}
    element.itemHeight = 80
    element.currentPath = '/Docs'
    element.deletionMotion = deletionMotion

    document.body.appendChild(element)
    await settle(element)

    deletionMotion.markPending([items[1]!])
    element.items = items.filter((item) => item.id !== 2)
    await settle(element)

    const exiting = element.shadowRoot?.querySelector<HTMLElement>('file-item-desktop[data-id="2"]')
    expect(exiting?.hasAttribute('data-delete-exiting')).toBe(true)

    exiting!.dispatchEvent(new Event('animationend'))
    await settle(element)

    expect(element.shadowRoot?.querySelector('file-item-desktop[data-id="2"]')).toBeNull()
  })

  it('uses the same exit completion path for table rows', async () => {
    mockListHeight(400)
    VirtualFileList.define()
    const deletionMotion = new FileDeletionMotionModel()
    const items = createItems(5)
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = items
    element.filters = {...DEFAULT_FILTERS, viewMode: 'table'}
    element.itemHeight = 80
    element.currentPath = '/Docs'
    element.deletionMotion = deletionMotion

    document.body.appendChild(element)
    await settle(element)

    deletionMotion.markPending([items[1]!])
    element.items = items.filter((item) => item.id !== 2)
    await settle(element)

    const exiting = element.shadowRoot?.querySelector<HTMLElement>('.file-item-wrapper[data-id="2"]')
    expect(exiting?.hasAttribute('data-delete-exiting')).toBe(true)

    exiting!.dispatchEvent(new Event('animationend'))
    await settle(element)

    expect(element.shadowRoot?.querySelector('.file-item-wrapper[data-id="2"]')).toBeNull()
  })
})
