import {afterEach, describe, expect, it, vi} from 'vitest'

import {Entry, ManagerRoot} from '@project/passmanager/core'
import {filterValue, quickFilters, selectedCredentialTagFilters} from '@project/passmanager/select'
import {groupBy, sortDirection, sortField} from '../../src/features/passmanager/components/list/sort-controls'
import {PMQuickFilters} from '../../src/features/passmanager/components/list/quick-filters'
import {PMSearch} from '../../src/features/passmanager/components/list/search'
import {PMSearchMobile} from '../../src/features/passmanager/components/list/search-mobile'
import {pmMobileChromeModel} from '../../src/features/passmanager/models/pm-mobile-chrome.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'

let defined = false
let mobileDefined = false
let quickFiltersDefined = false

function ensureDefined() {
  if (defined) {
    return
  }

  PMSearch.define()
  defined = true
}

function ensureMobileDefined() {
  if (mobileDefined) {
    return
  }

  PMSearchMobile.define()
  mobileDefined = true
}

function ensureQuickFiltersDefined() {
  if (quickFiltersDefined) {
    return
  }

  PMQuickFilters.define()
  quickFiltersDefined = true
}

function installPassmanagerRoot() {
  ;(window as any).passmanager = {
    showElement: () => ({isRoot: true}),
    entriesList: () => [],
  }
}

function installRootWithTags() {
  const root = new ManagerRoot({} as any)
  root.entries.set([
    new Entry(root, {
      id: 'entry-work',
      title: 'Work Login',
      username: 'alice',
      urls: [],
      otps: [],
      sshKeys: [],
      tags: ['Work'],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    }),
  ])
  setPassmanagerRoot(root)
}

function installSearchResultRoot() {
  const root = new ManagerRoot({} as any)
  root.entries.set([
    new Entry(root, {
      id: 'entry-work',
      title: 'Work Login',
      username: 'alice',
      urls: [],
      otps: [],
      sshKeys: [],
      tags: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    }),
  ])
  setPassmanagerRoot(root)
}

async function settle(element: HTMLElement & {updateComplete: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
}

afterEach(() => {
  document.querySelectorAll('pm-search').forEach((el) => el.remove())
  document.querySelectorAll('pm-search-mobile').forEach((el) => el.remove())
  document.querySelectorAll('pm-quick-filters').forEach((el) => el.remove())
  delete (window as any).passmanager
  setPassmanagerRoot(undefined)
  filterValue.set('')
  quickFilters.set([])
  selectedCredentialTagFilters.set([])
  sortField.set('name')
  sortDirection.set('asc')
  groupBy.set('none')
  resetRuntimeCapabilities()
  pmMobileChromeModel.closeSortGroupSheet()
  vi.useRealTimers()
})

describe('PMSearch', () => {
  it('toggles the slash hint from reactive focus state without DOM-derived render state', async () => {
    ensureDefined()
    installPassmanagerRoot()

    const element = document.createElement('pm-search') as PMSearch
    document.body.appendChild(element)
    await settle(element)

    const input = element.shadowRoot?.querySelector('cv-input') as HTMLElement | null
    expect(input).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.kbd-slash')).not.toBeNull()

    input?.dispatchEvent(new FocusEvent('focus'))
    await settle(element)

    expect(element.shadowRoot?.querySelector('.kbd-slash')).toBeNull()

    input?.dispatchEvent(new FocusEvent('blur'))
    await settle(element)

    expect(element.shadowRoot?.querySelector('.kbd-slash')).not.toBeNull()
  })

  it('hides the slash hint on Android runtime even in desktop search layout', async () => {
    ensureDefined()
    installPassmanagerRoot()
    setRuntimeCapabilities({platform: 'android', mobile: true, desktop: false})

    const element = document.createElement('pm-search') as PMSearch
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('.kbd-slash')).toBeNull()
  })

  it('tracks independent toolbar filters and clears quick filters with tags', async () => {
    ensureQuickFiltersDefined()
    installRootWithTags()

    const element = document.createElement('pm-quick-filters') as PMQuickFilters
    document.body.appendChild(element)
    await settle(element)

    type QuickFilterElement = HTMLElement & {checked: boolean}
    const getQuickFilter = (name: 'recent' | 'otp' | 'ssh' | 'card' | 'files' | 'favorites' | 'nopass') =>
      element.shadowRoot?.querySelector(`[data-quick-filter="${name}"]`) as QuickFilterElement | null

    const recentBefore = getQuickFilter('recent')
    const otpBefore = getQuickFilter('otp')
    const sshBefore = getQuickFilter('ssh')
    const cardBefore = getQuickFilter('card')

    expect(recentBefore?.checked).toBe(false)
    expect(otpBefore?.checked).toBe(false)
    expect(sshBefore?.checked).toBe(false)
    expect(cardBefore?.checked).toBe(false)
    expect(getQuickFilter('files')).toBeNull()
    expect(getQuickFilter('favorites')).toBeNull()
    expect(getQuickFilter('nopass')).toBeNull()

    recentBefore?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    otpBefore?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    sshBefore?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    cardBefore?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(element)

    const recentActive = getQuickFilter('recent')
    const otpActive = getQuickFilter('otp')
    const sshActive = getQuickFilter('ssh')
    const cardActive = getQuickFilter('card')

    expect(quickFilters()).toEqual(['recent', 'otp', 'ssh', 'card'])
    expect(recentActive?.checked).toBe(true)
    expect(otpActive?.checked).toBe(true)
    expect(sshActive?.checked).toBe(true)
    expect(cardActive?.checked).toBe(true)
    expect(element.shadowRoot?.querySelector('.trigger-count')?.textContent).toBe('4')

    otpActive?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(element)

    const otpInactive = getQuickFilter('otp')
    const sshStillActive = getQuickFilter('ssh')

    expect(quickFilters()).toEqual(['recent', 'ssh', 'card'])
    expect(otpInactive?.checked).toBe(false)
    expect(sshStillActive?.checked).toBe(true)

    selectedCredentialTagFilters.set(['work'])
    await settle(element)

    expect(element.shadowRoot?.querySelector('.trigger-count')?.textContent).toBe('4')
    ;(element.shadowRoot?.querySelector('.clear-button') as HTMLElement | null)?.click()
    await settle(element)

    expect(quickFilters()).toEqual([])
    expect(selectedCredentialTagFilters()).toEqual([])
    expect(element.shadowRoot?.querySelector('.trigger-count')).toBeNull()
  })

  it('shows the current external search query when the input is not focused', async () => {
    ensureDefined()
    installPassmanagerRoot()

    const element = document.createElement('pm-search') as PMSearch
    document.body.appendChild(element)
    await settle(element)

    filterValue.set('mail')
    await settle(element)

    const input = element.shadowRoot?.querySelector('cv-input') as {value?: string} | null
    expect(input?.value).toBe('mail')
  })

  it('renders focused draft input and restores the committed query on blur', async () => {
    ensureDefined()
    installPassmanagerRoot()
    filterValue.set('committed')

    const element = document.createElement('pm-search') as PMSearch
    document.body.appendChild(element)
    await settle(element)

    const input = element.shadowRoot?.querySelector('cv-input') as (HTMLElement & {value?: string}) | null
    input?.dispatchEvent(new FocusEvent('focus'))
    await settle(element)
    expect(input?.value).toBe('committed')

    input?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'draft'},
        bubbles: true,
        composed: true,
      }),
    )
    await settle(element)

    expect(input?.value).toBe('draft')
    expect(filterValue()).toBe('committed')

    input?.dispatchEvent(new FocusEvent('blur'))
    await settle(element)

    expect(input?.value).toBe('committed')
  })

  it('reconciles a focused draft when content filters are cleared externally', async () => {
    ensureDefined()
    installPassmanagerRoot()
    filterValue.set('committed')

    const element = document.createElement('pm-search') as PMSearch
    document.body.appendChild(element)
    await settle(element)

    const input = element.shadowRoot?.querySelector('cv-input') as
      | (HTMLElement & {
          value?: string
        })
      | null
    input?.dispatchEvent(new FocusEvent('focus'))
    input?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'draft'},
        bubbles: true,
        composed: true,
      }),
    )
    await settle(element)

    filterValue.set('')
    await settle(element)

    expect(input?.value).toBe('')
  })

  it('restores external filter reconciliation after reconnecting the same search element', async () => {
    ensureDefined()
    installPassmanagerRoot()
    filterValue.set('committed')

    const element = document.createElement('pm-search') as PMSearch
    document.body.appendChild(element)
    await settle(element)
    element.remove()
    document.body.appendChild(element)
    await settle(element)

    const input = element.shadowRoot?.querySelector('cv-input') as
      | (HTMLElement & {
          value?: string
        })
      | null
    input?.dispatchEvent(new FocusEvent('focus'))
    input?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'draft'},
        bubbles: true,
        composed: true,
      }),
    )
    await settle(element)

    filterValue.set('')
    await settle(element)

    expect(input?.value).toBe('')
  })

  it('submits the model draft without querying the input element', async () => {
    ensureDefined()
    installPassmanagerRoot()

    const element = document.createElement('pm-search') as PMSearch
    document.body.appendChild(element)
    await settle(element)

    const input = element.shadowRoot?.querySelector('cv-input') as HTMLElement | null
    input?.dispatchEvent(new FocusEvent('focus'))
    input?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'draft-submit'},
        bubbles: true,
        composed: true,
      }),
    )
    await settle(element)

    const shadowRoot = element.shadowRoot!
    const form = shadowRoot.querySelector('form') as HTMLFormElement
    const originalQuerySelector = shadowRoot.querySelector.bind(shadowRoot)
    vi.spyOn(shadowRoot, 'querySelector').mockImplementation(((selector: string) => {
      if (selector === 'cv-input') {
        throw new Error('submit should use PMSearchInputModel state')
      }
      return originalQuerySelector(selector)
    }) as typeof shadowRoot.querySelector)

    form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))

    expect(filterValue()).toBe('draft-submit')
  })

  it('derives success and invalid search classes from root result counts', async () => {
    ensureDefined()
    installSearchResultRoot()
    filterValue.set('Work')

    const element = document.createElement('pm-search') as PMSearch
    document.body.appendChild(element)
    await settle(element)

    const form = element.shadowRoot?.querySelector('form') as HTMLFormElement | null
    const input = element.shadowRoot?.querySelector('cv-input') as HTMLElement | null
    expect(form?.className).toBe('success')
    expect(input?.hasAttribute('invalid')).toBe(false)

    filterValue.set('Missing')
    await settle(element)

    expect(form?.className).toBe('fail')
    expect(input?.hasAttribute('invalid')).toBe(true)
  })

  it('clears pending debounced input when disconnected', async () => {
    ensureDefined()
    installPassmanagerRoot()
    vi.useFakeTimers()

    const element = document.createElement('pm-search') as PMSearch
    document.body.appendChild(element)
    await settle(element)

    const input = element.shadowRoot?.querySelector('cv-input') as HTMLElement | null
    input?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'stale'},
        bubbles: true,
        composed: true,
      }),
    )

    element.remove()
    vi.advanceTimersByTime(180)

    expect(filterValue()).toBe('')
  })

  it('keeps desktop toolbar controls outside the search component', async () => {
    ensureDefined()
    installPassmanagerRoot()

    const element = document.createElement('pm-search') as PMSearch
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('.toggle-filters')).toBeNull()
    expect(element.shadowRoot?.querySelector('.filters-panel')).toBeNull()
    expect(element.shadowRoot?.querySelector('pm-sort-controls')).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-filters')).toBeNull()
    expect(element.shadowRoot?.querySelector('pm-quick-filters')).toBeNull()
    expect(element.shadowRoot?.querySelector('cv-combobox.tag-filter-combobox')).toBeNull()
  })

  it('renders a compact mobile search without desktop quick filters', async () => {
    ensureMobileDefined()
    installPassmanagerRoot()

    const element = document.createElement('pm-search-mobile') as PMSearchMobile
    document.body.appendChild(element)
    await settle(element)

    const input = element.shadowRoot?.querySelector('cv-input') as (HTMLElement & {value?: string}) | null
    const sortGroupButton = element.shadowRoot?.querySelector('.sort-group-trigger') as HTMLElement | null
    expect(input?.getAttribute('placeholder')).toBe('Search entries and logins')
    expect(sortGroupButton?.getAttribute('aria-label')).toBe('Sort and group')
    expect(sortGroupButton?.getAttribute('aria-pressed')).toBe('false')
    expect(element.shadowRoot?.querySelector('.quick-filters')).toBeNull()
    expect(element.shadowRoot?.querySelector('.filters-panel')).toBeNull()
    expect(element.shadowRoot?.querySelector('.kbd-slash')).toBeNull()

    sortGroupButton?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(element)

    expect(pmMobileChromeModel.sortGroupSheetOpen()).toBe(true)

    filterValue.set('binance')
    await settle(element)

    expect(input?.value).toBe('binance')
  })

  it('marks the mobile sort/group trigger active when sort grouping differs from defaults', async () => {
    ensureMobileDefined()
    installPassmanagerRoot()
    groupBy.set('website')

    const element = document.createElement('pm-search-mobile') as PMSearchMobile
    document.body.appendChild(element)
    await settle(element)

    const sortGroupButton = element.shadowRoot?.querySelector('.sort-group-trigger') as HTMLElement | null
    expect(sortGroupButton?.getAttribute('aria-pressed')).toBe('true')
    expect(sortGroupButton?.classList.contains('active')).toBe(true)
  })

  it('renders no desktop tag combobox in quick filters when no tags exist', async () => {
    ensureQuickFiltersDefined()
    const root = new ManagerRoot({} as any)
    root.entries.set([])
    setPassmanagerRoot(root)

    const element = document.createElement('pm-quick-filters') as PMQuickFilters
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('cv-combobox.tag-filter-combobox')).toBeNull()
  })

  it('renders desktop tag combobox and updates selected filters from selectedIds', async () => {
    ensureQuickFiltersDefined()
    installRootWithTags()

    const element = document.createElement('pm-quick-filters') as PMQuickFilters
    document.body.appendChild(element)
    await settle(element)

    const combobox = element.shadowRoot?.querySelector(
      'cv-combobox.tag-filter-combobox',
    ) as HTMLElement | null
    expect(combobox).not.toBeNull()
    expect(combobox?.getAttribute('type')).not.toBe('select-only')
    expect(combobox?.getAttribute('placeholder')).toBe('Search tags')
    expect(element.shadowRoot?.querySelector('cv-combobox-option[value="work"]')?.textContent).toContain(
      'Work (1)',
    )

    combobox?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {selectedIds: ['work'], value: 'work', inputValue: '', activeId: null, open: false},
        bubbles: true,
        composed: true,
      }),
    )
    await settle(element)

    expect(selectedCredentialTagFilters()).toEqual(['work'])
  })

  it('clears selected tag filters from combobox selectedIds', async () => {
    ensureQuickFiltersDefined()
    installRootWithTags()
    selectedCredentialTagFilters.set(['work'])

    const element = document.createElement('pm-quick-filters') as PMQuickFilters
    document.body.appendChild(element)
    await settle(element)

    const combobox = element.shadowRoot?.querySelector(
      'cv-combobox.tag-filter-combobox',
    ) as HTMLElement | null
    combobox?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {selectedIds: [], value: null, inputValue: '', activeId: null, open: false},
        bubbles: true,
        composed: true,
      }),
    )
    await settle(element)

    expect(selectedCredentialTagFilters()).toEqual([])
  })
})
