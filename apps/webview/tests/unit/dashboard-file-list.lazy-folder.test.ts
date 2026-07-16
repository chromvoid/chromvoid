import {afterEach, describe, expect, it, vi} from 'vitest'

import {DashboardFileList} from '../../src/features/file-manager/components/dashboard-file-list'
import {VirtualFileList} from '../../src/features/file-manager/components/virtual-file-list'
import type {FileListItem, SearchFilters} from '../../src/shared/contracts/file-manager'

const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: true,
  fileTypes: [],
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  const virtualList = element.shadowRoot?.querySelector<HTMLElement & {updateComplete?: Promise<unknown>}>(
    'virtual-file-list',
  )
  await virtualList?.updateComplete
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await element.updateComplete
  await virtualList?.updateComplete
}

function createItem(): FileListItem {
  return {
    id: 42,
    path: '/attachments/first-open.jpg',
    name: 'first-open.jpg',
    isDir: false,
    size: 4096,
    mimeType: 'image/jpeg',
  }
}

function mockListHeight(height: number) {
  return vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height)
}

describe('dashboard-file-list lazy folder rendering', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('renders files when the first lazy folder page arrives after an initially empty path render', async () => {
    mockListHeight(400)
    VirtualFileList.define()
    DashboardFileList.define()
    const element = document.createElement('dashboard-file-list') as DashboardFileList
    element.items = []
    element.filters = {...DEFAULT_FILTERS}
    element.currentPath = '/attachments/'
    element.itemsPreFiltered = true

    document.body.append(element)
    await settle(element)

    const virtualList = element.shadowRoot?.querySelector<HTMLElement & {updateComplete?: Promise<unknown>}>(
      'virtual-file-list',
    )
    expect(virtualList?.shadowRoot?.querySelector('file-item-desktop[data-id="42"]')).toBeNull()

    element.items = [createItem()]
    await settle(element)

    const renderedItem = virtualList?.shadowRoot?.querySelector<HTMLElement & {item?: FileListItem}>(
      'file-item-desktop[data-id="42"]',
    )
    expect(renderedItem).not.toBeNull()
    expect(renderedItem?.item?.name).toBe('first-open.jpg')
  })
})
