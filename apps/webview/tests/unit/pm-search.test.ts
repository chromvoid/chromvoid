import {afterEach, describe, expect, it, vi} from 'vitest'

import {Entry, ManagerRoot} from '@project/passmanager/core'
import {filterValue, quickFilters, selectedCredentialTagFilters} from '@project/passmanager/select'
import {groupBy, sortDirection, sortField} from '../../src/features/passmanager/components/list/sort-controls'
import {PMQuickFilters} from '../../src/features/passmanager/components/list/quick-filters'
import {PMSearch} from '../../src/features/passmanager/components/list/search'
import {PMSearchMobile} from '../../src/features/passmanager/components/list/search-mobile'
import {pmCredentialTagsModel} from '../../src/features/passmanager/models/pm-credential-tags.model'
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
  pmCredentialTagsModel.closeSheet()
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

  it('marks toolbar quick filters as pressed and active when selected', async () => {
    ensureQuickFiltersDefined()
    installPassmanagerRoot()

    const element = document.createElement('pm-quick-filters') as PMQuickFilters
    document.body.appendChild(element)
    await settle(element)

    const getQuickFilter = (name: 'recent' | 'otp' | 'ssh' | 'card' | 'files' | 'favorites' | 'nopass') =>
      element.shadowRoot?.querySelector(`[data-quick-filter="${name}"]`) as HTMLElement | null

    const recentBefore = getQuickFilter('recent')
    const otpBefore = getQuickFilter('otp')
    const sshBefore = getQuickFilter('ssh')
    const cardBefore = getQuickFilter('card')

    expect(recentBefore?.getAttribute('aria-pressed')).toBe('false')
    expect(otpBefore?.getAttribute('aria-pressed')).toBe('false')
    expect(sshBefore?.getAttribute('aria-pressed')).toBe('false')
    expect(cardBefore?.getAttribute('aria-pressed')).toBe('false')
    expect(getQuickFilter('files')).toBeNull()
    expect(getQuickFilter('favorites')).toBeNull()
    expect(getQuickFilter('nopass')).toBeNull()
    expect(recentBefore?.classList.contains('active')).toBe(false)
    expect(otpBefore?.classList.contains('active')).toBe(false)
    expect(sshBefore?.classList.contains('active')).toBe(false)
    expect(cardBefore?.classList.contains('active')).toBe(false)

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
    expect(recentActive?.getAttribute('aria-pressed')).toBe('true')
    expect(otpActive?.getAttribute('aria-pressed')).toBe('true')
    expect(sshActive?.getAttribute('aria-pressed')).toBe('true')
    expect(cardActive?.getAttribute('aria-pressed')).toBe('true')
    expect(recentActive?.classList.contains('active')).toBe(true)
    expect(otpActive?.classList.contains('active')).toBe(true)
    expect(sshActive?.classList.contains('active')).toBe(true)
    expect(cardActive?.classList.contains('active')).toBe(true)

    otpActive?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(element)

    const otpInactive = getQuickFilter('otp')
    const sshStillActive = getQuickFilter('ssh')

    expect(quickFilters()).toEqual(['recent', 'ssh', 'card'])
    expect(otpInactive?.getAttribute('aria-pressed')).toBe('false')
    expect(otpInactive?.classList.contains('active')).toBe(false)
    expect(sshStillActive?.getAttribute('aria-pressed')).toBe('true')
    expect(sshStillActive?.classList.contains('active')).toBe(true)
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

  it('keeps mobile tag selection available when no tags exist yet', async () => {
    ensureMobileDefined()
    const root = new ManagerRoot({} as any)
    root.entries.set([])
    setPassmanagerRoot(root)

    const element = document.createElement('pm-search-mobile') as PMSearchMobile
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('.tag-filter-row')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.tag-chip[aria-pressed="true"]')?.textContent).toContain('All')
    expect(element.shadowRoot?.querySelector('.tag-chip[data-tag-key]')).toBeNull()
    expect(element.shadowRoot?.querySelector('pm-mobile-tag-filter-sheet')).toBeNull()

    const sheetTrigger = element.shadowRoot?.querySelector('.tag-chip.manage') as HTMLElement | null
    sheetTrigger?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(element)

    expect(pmCredentialTagsModel.filterSheetOpen()).toBe(true)
    expect(pmCredentialTagsModel.sheetMode()).toBe('manage')
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

  it('renders mobile tag chips and management trigger when tags exist without desktop quick filters', async () => {
    ensureMobileDefined()
    installRootWithTags()

    const element = document.createElement('pm-search-mobile') as PMSearchMobile
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('.quick-filters')).toBeNull()
    expect(element.shadowRoot?.querySelector('cv-combobox.tag-filter-combobox')).toBeNull()
    expect(element.shadowRoot?.querySelector('.tag-chip[aria-pressed="true"]')?.textContent).toContain('All')
    const workChipText = element.shadowRoot
      ?.querySelector('.tag-chip[data-tag-key="work"]')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim()
    expect(workChipText).toContain('Work · 1')
    expect(element.shadowRoot?.querySelector('pm-mobile-tag-filter-sheet')).toBeNull()
  })

  it('updates mobile tag filters from chips and opens tag management from manage chip', async () => {
    ensureMobileDefined()
    installRootWithTags()

    const element = document.createElement('pm-search-mobile') as PMSearchMobile
    document.body.appendChild(element)
    await settle(element)

    const workChip = element.shadowRoot?.querySelector('.tag-chip[data-tag-key="work"]') as HTMLElement | null
    workChip?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(element)

    expect(selectedCredentialTagFilters()).toEqual(['work'])
    expect(
      element.shadowRoot?.querySelector('.tag-chip[data-tag-key="work"]')?.classList.contains('active'),
    ).toBe(true)

    const sheetTrigger = element.shadowRoot?.querySelector('.tag-chip.manage') as HTMLElement | null
    sheetTrigger?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(element)

    expect(pmCredentialTagsModel.filterSheetOpen()).toBe(true)
    expect(pmCredentialTagsModel.sheetMode()).toBe('manage')
  })
})
