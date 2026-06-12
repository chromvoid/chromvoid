import {afterEach, describe, expect, it, vi} from 'vitest'

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

function createItems(count: number): FileListItem[] {
  return Array.from({length: count}, (_, index) => ({
    id: index + 1,
    path: `/Docs/file-${index + 1}.md`,
    name: `file-${index + 1}.md`,
    isDir: false,
    size: 1024,
    mimeType: 'text/markdown',
  }))
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await element.updateComplete
}

function mockListMetrics(metrics: {clientHeight: number; scrollHeight: number}) {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('list-container') ? metrics.clientHeight : 0
  })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('list-container') ? metrics.scrollHeight : 0
  })
}

function getFrame(element: VirtualFileList): HTMLElement {
  const frame = element.shadowRoot?.querySelector<HTMLElement>('.file-list-scroll-edge')
  expect(frame).not.toBeNull()
  return frame!
}

function getContainer(element: VirtualFileList): HTMLElement {
  const container = element.shadowRoot?.querySelector<HTMLElement>('.list-container')
  expect(container).not.toBeNull()
  return container!
}

describe('virtual-file-list scroll edge affordance', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('shows the bottom edge only when more file rows are below the viewport', async () => {
    mockListMetrics({clientHeight: 400, scrollHeight: 1200})
    VirtualFileList.define()
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = createItems(40)
    element.filters = {...DEFAULT_FILTERS}
    element.itemHeight = 80

    document.body.appendChild(element)
    await settle(element)

    const frame = getFrame(element)
    const container = getContainer(element)
    expect(container.classList.contains('scroll-edge-scroller')).toBe(true)
    expect(frame.getAttribute('data-scroll-block-start')).toBe('false')
    expect(frame.getAttribute('data-scroll-block-end')).toBe('true')

    container.scrollTop = 20
    container.dispatchEvent(new Event('scroll'))
    await settle(element)

    expect(frame.getAttribute('data-scroll-block-start')).toBe('true')
    expect(frame.getAttribute('data-scroll-block-end')).toBe('true')

    container.scrollTop = 800
    container.dispatchEvent(new Event('scroll'))
    await settle(element)

    expect(frame.getAttribute('data-scroll-block-start')).toBe('true')
    expect(frame.getAttribute('data-scroll-block-end')).toBe('false')
  })

  it('does not show the edge when the file list does not overflow', async () => {
    mockListMetrics({clientHeight: 400, scrollHeight: 400})
    VirtualFileList.define()
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = createItems(3)
    element.filters = {...DEFAULT_FILTERS}
    element.itemHeight = 80

    document.body.appendChild(element)
    await settle(element)

    expect(getFrame(element).getAttribute('data-scroll-block-start')).toBe('false')
    expect(getFrame(element).getAttribute('data-scroll-block-end')).toBe('false')
  })
})
