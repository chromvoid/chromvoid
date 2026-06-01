import {afterEach, describe, expect, it} from 'vitest'

import {groupBy, sortDirection, sortField} from '../../src/features/passmanager/components/list/sort-controls'
import {PMMobileSortGroupSheet} from '../../src/features/passmanager/components/list/mobile-sort-group-sheet'
import {pmMobileChromeModel} from '../../src/features/passmanager/models/pm-mobile-chrome.model'

let defined = false

function ensureDefined(): void {
  if (defined) return
  PMMobileSortGroupSheet.define()
  defined = true
}

async function renderSheet(): Promise<PMMobileSortGroupSheet> {
  ensureDefined()
  const element = document.createElement('pm-mobile-sort-group-sheet') as PMMobileSortGroupSheet
  document.body.appendChild(element)
  await element.updateComplete
  return element
}

describe('PMMobileSortGroupSheet', () => {
  afterEach(() => {
    document.querySelectorAll('pm-mobile-sort-group-sheet').forEach((element) => element.remove())
    pmMobileChromeModel.closeSortGroupSheet()
    sortField.set('name')
    sortDirection.set('asc')
    groupBy.set('none')
    localStorage.clear()
  })

  it('renders active chips from sort/group atoms', async () => {
    pmMobileChromeModel.openSortGroupSheet()
    sortField.set('modified')
    sortDirection.set('desc')
    groupBy.set('security')

    const element = await renderSheet()

    const sheet = element.shadowRoot?.querySelector('cv-bottom-sheet') as HTMLElementTagNameMap['cv-bottom-sheet']
    const sortChip = element.shadowRoot?.querySelector('[data-value="modified"]') as HTMLElement | null
    const groupChip = element.shadowRoot?.querySelector('[data-value="security"]') as HTMLElement | null
    const directionChip = element.shadowRoot?.querySelector('.section:nth-of-type(2) [data-value="desc"]') as HTMLElement | null

    expect(sheet.open).toBe(true)
    expect(sortChip?.classList.contains('active')).toBe(true)
    expect(groupChip?.classList.contains('active')).toBe(true)
    expect(directionChip?.classList.contains('active')).toBe(true)
    expect(directionChip?.getAttribute('aria-checked')).toBe('true')
  })

  it('calls model methods from controls and closes on bottom sheet dismissal', async () => {
    pmMobileChromeModel.openSortGroupSheet()
    const element = await renderSheet()

    ;(element.shadowRoot?.querySelector('[data-value="website"]') as HTMLElement | null)?.click()
    await element.updateComplete
    expect(sortField()).toBe('website')

    ;(element.shadowRoot?.querySelector('.section:nth-of-type(2) [data-value="desc"]') as HTMLElement | null)?.click()
    await element.updateComplete
    expect(sortDirection()).toBe('desc')

    ;(element.shadowRoot?.querySelector('.section:last-of-type [data-value="modified"]') as HTMLElement | null)?.click()
    await element.updateComplete
    expect(groupBy()).toBe('modified')

    ;(element.shadowRoot?.querySelector('.footer-action[variant="ghost"]') as HTMLElement | null)?.click()
    await element.updateComplete
    expect(sortField()).toBe('name')
    expect(sortDirection()).toBe('asc')
    expect(groupBy()).toBe('none')

    const sheet = element.shadowRoot?.querySelector('cv-bottom-sheet') as HTMLElement | null
    sheet?.dispatchEvent(new CustomEvent('cv-change', {detail: {open: false}, bubbles: true, composed: true}))
    await element.updateComplete

    expect(pmMobileChromeModel.sortGroupSheetOpen()).toBe(false)
  })
})
