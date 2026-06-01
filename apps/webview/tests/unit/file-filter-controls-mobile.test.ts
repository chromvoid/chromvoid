import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {FileFilterControlsMobile} from '../../src/features/file-manager/components/file-filter-controls-mobile'
import {createFileSearchFilterActions} from '../../src/features/file-manager/models/file-search-filters.model'

async function settle(element: FileFilterControlsMobile) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

describe('file-filter-controls-mobile', () => {
  beforeEach(() => {
    FileFilterControlsMobile.define()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('renders translated mobile filter section labels', async () => {
    const element = document.createElement('file-filter-controls-mobile') as FileFilterControlsMobile
    element.filters = {
      query: '',
      sortBy: 'size',
      sortDirection: 'desc',
      viewMode: 'grid',
      showHidden: true,
      fileTypes: ['documents'],
    }
    document.body.appendChild(element)
    await settle(element)

    const text = element.shadowRoot?.textContent ?? ''
    expect(text).toContain('Sort by')
    expect(text).toContain('Direction')
    expect(text).toContain('View')
    expect(text).toContain('File type')
    expect(text).toContain('Hidden files')
    expect(text).toContain('Documents')
    expect(text).toContain('Show')
  })

  it('emits updated filters when toggling hidden files', async () => {
    const element = document.createElement('file-filter-controls-mobile') as FileFilterControlsMobile
    element.filters = {
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: false,
      fileTypes: [],
    }
    document.body.appendChild(element)
    await settle(element)

    const changeSpy = vi.fn()
    element.addEventListener('filters-change', changeSpy as EventListener)

    const showHideButton = [...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.chip') ?? [])].find(
      (button) => button.textContent?.includes('Hide'),
    )
    showHideButton?.click()

    expect(changeSpy).toHaveBeenCalledTimes(1)
    expect((changeSpy.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: true,
      fileTypes: [],
    })
  })

  it('delegates hidden-file changes to provided filter actions', async () => {
    const element = document.createElement('file-filter-controls-mobile') as FileFilterControlsMobile
    element.filters = {
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: false,
      fileTypes: [],
    }
    const write = vi.fn()
    element.filterActions = createFileSearchFilterActions({
      read: () => element.filters,
      write,
    })
    document.body.appendChild(element)
    await settle(element)

    const showHideButton = [...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.chip') ?? [])].find(
      (button) => button.textContent?.includes('Hide'),
    )
    showHideButton?.click()

    expect(write).toHaveBeenCalledWith({
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: true,
      fileTypes: [],
    })
  })
})
