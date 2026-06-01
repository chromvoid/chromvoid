import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {FileSearch} from '../../src/features/file-manager/components/file-search.desktop'
import {createFileSearchFilterActions} from '../../src/features/file-manager/models/file-search-filters.model'

async function settle(element: FileSearch) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

describe('file-search desktop filters', () => {
  beforeEach(() => {
    FileSearch.define()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    resetRuntimeCapabilities()
    vi.restoreAllMocks()
  })

  it('renders active filters and reset controls with translated labels', async () => {
    const element = document.createElement('file-search') as FileSearch
    element.totalFiles = 10
    element.filteredFiles = 2
    element.filters = {
      query: 'report',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'grid',
      showHidden: true,
      fileTypes: ['documents'],
    }
    document.body.appendChild(element)
    await settle(element)

    const text = element.shadowRoot?.textContent ?? ''
    expect(text).toContain('2/10')
    expect(text).toContain('View: Grid')
    expect(text).toContain('Sort: Name ↑')
    expect(text).toContain('Search: report')
    expect(text).toContain('Show hidden')
    expect(text).toContain('Documents')
    expect(text).toContain('Reset')
  })

  it('emits updated filters when clearing the search chip', async () => {
    const element = document.createElement('file-search') as FileSearch
    element.filters = {
      query: 'report',
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

    const clearButton = element.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label=\"Clear search\"]')
    clearButton?.click()

    expect(changeSpy).toHaveBeenCalledTimes(1)
    expect((changeSpy.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: false,
      fileTypes: [],
    })
  })

  it('uses provided filter actions instead of owning filter mutation', async () => {
    const element = document.createElement('file-search') as FileSearch
    element.filters = {
      query: 'report',
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

    element.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label=\"Clear search\"]')?.click()

    expect(write).toHaveBeenCalledWith({
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: false,
      fileTypes: [],
    })
  })

  it('opens the command palette directly from active filter chips', async () => {
    const element = document.createElement('file-search') as FileSearch
    element.filters = {
      query: 'report',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: false,
      fileTypes: [],
    }
    document.body.appendChild(element)
    await settle(element)

    const openSpy = vi.fn()
    const keydownSpy = vi.fn()
    window.addEventListener('command-bar:open', openSpy as EventListener)
    window.addEventListener('keydown', keydownSpy as EventListener)

    try {
      element.shadowRoot?.querySelector<HTMLButtonElement>('.chipgroup__main')?.click()

      expect(openSpy).toHaveBeenCalledTimes(1)
      expect((openSpy.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({mode: 'all'})
      expect(keydownSpy).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('command-bar:open', openSpy as EventListener)
      window.removeEventListener('keydown', keydownSpy as EventListener)
    }
  })

  it('uses platform-aware command-palette titles for active filter chips', async () => {
    setRuntimeCapabilities({platform: 'windows', desktop: true})
    const element = document.createElement('file-search') as FileSearch
    element.filters = {
      query: 'report',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: false,
      fileTypes: [],
    }
    document.body.appendChild(element)
    await settle(element)

    const button = element.shadowRoot?.querySelector<HTMLButtonElement>('.chipgroup__main')
    expect(button?.title).toBe('Edit in Ctrl+K')

    setRuntimeCapabilities({platform: 'android', mobile: true})
    element.requestUpdate()
    await settle(element)
    expect(button?.title).toBe('Edit in command palette')
  })
})
