import {describe, expect, it, afterEach, vi} from 'vitest'

import {FileSearchMobile} from '../../src/features/file-manager/components/file-search.mobile'
import {DEFAULT_FILTERS, type SearchFilters} from '../../src/features/file-manager/components/file-search.base'
import {createFileSearchFilterActions} from '../../src/features/file-manager/models/file-search-filters.model'

async function settle(element: FileSearchMobile) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

async function mountFileSearch(filters: SearchFilters = DEFAULT_FILTERS) {
  FileSearchMobile.define()
  const element = document.createElement('file-search-mobile') as FileSearchMobile
  element.filters = filters
  document.body.append(element)
  await settle(element)
  return element
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('file-search-mobile', () => {
  it('opens the filter controls in a bottom sheet', async () => {
    const element = await mountFileSearch()
    const trigger = element.shadowRoot?.querySelector('[data-action="filters"]') as HTMLElement | null
    expect(trigger).not.toBeNull()

    trigger?.click()
    await settle(element)

    const sheet = element.shadowRoot?.querySelector('cv-bottom-sheet') as {open?: boolean} | null
    expect(sheet?.open).toBe(true)
    expect(element.shadowRoot?.querySelector('cv-drawer')).toBeNull()
  })

  it('closes only when the sheet reports open=false', async () => {
    const element = await mountFileSearch()
    const trigger = element.shadowRoot?.querySelector('[data-action="filters"]') as HTMLElement | null
    trigger?.click()
    await settle(element)

    const sheet = element.shadowRoot?.querySelector('cv-bottom-sheet') as HTMLElement & {open?: boolean}
    sheet.dispatchEvent(new CustomEvent('cv-change', {detail: {value: 'name'}, bubbles: true, composed: true}))
    await settle(element)
    expect(sheet.open).toBe(true)

    sheet.dispatchEvent(new CustomEvent('cv-change', {detail: {open: false}, bubbles: true, composed: true}))
    await settle(element)
    expect((element.shadowRoot?.querySelector('cv-bottom-sheet') as {open?: boolean} | null)?.open).toBe(false)
  })

  it('forwards filter changes from the mobile controls', async () => {
    const element = await mountFileSearch()
    const listener = vi.fn()
    element.addEventListener('filters-change', listener)
    const nextFilters = {...DEFAULT_FILTERS, showHidden: true}

    const controls = element.shadowRoot?.querySelector('file-filter-controls-mobile')
    controls?.dispatchEvent(new CustomEvent('filters-change', {detail: nextFilters, bubbles: true, composed: true}))

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0]?.[0]).toMatchObject({detail: nextFilters})
  })

  it('passes provided filter actions into the sheet controls', async () => {
    const element = await mountFileSearch()
    const actions = createFileSearchFilterActions({
      read: () => element.filters,
      write: vi.fn(),
    })
    element.filterActions = actions
    element.requestUpdate()
    await settle(element)

    const controls = element.shadowRoot?.querySelector('file-filter-controls-mobile') as
      | {filterActions?: unknown}
      | null

    expect(controls?.filterActions).toBe(actions)
  })

  it('renders an active filter badge for non-default filters', async () => {
    const element = await mountFileSearch({...DEFAULT_FILTERS, fileTypes: ['image']})

    expect(element.shadowRoot?.querySelector('.filter-badge')).not.toBeNull()
  })
})
