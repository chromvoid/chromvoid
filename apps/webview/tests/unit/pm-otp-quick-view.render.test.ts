import {afterEach, describe, expect, it, vi} from 'vitest'

import {Entry, Group, ManagerRoot} from '@project/passmanager'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {
  PMOtpQuickView,
  PMOtpQuickViewMobile,
  PMOtpQuickViewSearch,
  pmOtpQuickViewModel,
} from '../../src/features/passmanager/components/otp-quick-view'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

let defined = false

function ensureDefined() {
  if (defined) {
    return
  }

  PMOtpQuickView.define()
  PMOtpQuickViewMobile.define()
  PMOtpQuickViewSearch.define()
  defined = true
}

function createGroup(id: string, name: string) {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(
  parent: Group | ManagerRoot,
  id: string,
  input: {
    title: string
    username?: string
    urls?: Array<{value: string; match: 'base_domain'}>
    otps?: Array<{id: string; label: string; type?: 'TOTP' | 'HOTP'; counter?: number}>
  },
) {
  return new Entry(parent, {
    id,
    title: input.title,
    username: input.username ?? '',
    urls: input.urls ?? [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: (input.otps ?? []).map((otp) => ({
      algorithm: 'SHA1',
      encoding: 'base32',
      digits: 6,
      period: 30,
      counter: otp.counter ?? 0,
      ...otp,
    })),
  } as any)
}

function createRootWithOtps() {
  const root = new ManagerRoot({} as any)
  const group = createGroup('group-prod', 'Production')
  const github = createEntry(root, 'entry-github', {
    title: 'GitHub',
    username: 'alice@example.test',
    urls: [{value: 'https://github.com/login', match: 'base_domain'}],
    otps: [{id: 'otp-github', label: 'GitHub', type: 'TOTP'}],
  })
  const vpn = createEntry(group, 'entry-vpn', {
    title: 'VPN',
    username: 'ops',
    urls: [{value: 'https://vpn.example.test', match: 'base_domain'}],
    otps: [{id: 'otp-vpn', label: 'Hardware token', type: 'HOTP', counter: 4}],
  })

  group.entries.set([vpn])
  root.entries.set([github, group])
  return root
}

async function renderDesktop() {
  ensureDefined()
  const element = document.createElement('pm-otp-quick-view') as PMOtpQuickView
  document.body.appendChild(element)
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  return element
}

async function renderMobile() {
  ensureDefined()
  const element = document.createElement('pm-otp-quick-view-mobile') as PMOtpQuickViewMobile
  document.body.appendChild(element)
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  return element
}

async function renderSearch() {
  ensureDefined()
  const element = document.createElement('pm-otp-quick-view-search') as PMOtpQuickViewSearch
  document.body.appendChild(element)
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  return element
}

afterEach(() => {
  document.querySelectorAll('pm-otp-quick-view, pm-otp-quick-view-mobile, pm-otp-quick-view-search').forEach((el) => el.remove())
  pmOtpQuickViewModel.actions.clearFilters()
  setPassmanagerRoot(undefined)
  vi.restoreAllMocks()
})

describe('PMOtpQuickView render', () => {
  it('defines desktop and mobile elements idempotently', () => {
    ensureDefined()

    expect(() => PMOtpQuickView.define()).not.toThrow()
    expect(() => PMOtpQuickViewMobile.define()).not.toThrow()
    expect(() => PMOtpQuickViewSearch.define()).not.toThrow()
    expect(customElements.get('pm-otp-quick-view')).toBe(PMOtpQuickView)
    expect(customElements.get('pm-otp-quick-view-mobile')).toBe(PMOtpQuickViewMobile)
    expect(customElements.get('pm-otp-quick-view-search')).toBe(PMOtpQuickViewSearch)
  })

  it('renders desktop rows without a local summary rail', async () => {
    setPassmanagerRoot(createRootWithOtps())

    const element = await renderDesktop()
    const summaryRail = element.shadowRoot?.querySelector('pm-summary-rail')

    expect(element.shadowRoot?.querySelector('[data-layout="desktop"]')).not.toBeNull()
    expect(summaryRail).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view > .quick-view__content')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__header')).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__header pm-summary-rail')).toBeNull()
    expect(element.shadowRoot?.querySelector('pm-otp-quick-view-search')).toBeNull()
    expect(element.shadowRoot?.querySelector('cv-input[type="search"]')).toBeNull()
    expect(element.shadowRoot?.querySelector('.type-filter')).toBeNull()
    expect(element.shadowRoot?.textContent).not.toContain('Live codes from saved login entries.')
    expect(element.shadowRoot?.querySelectorAll('.row')).toHaveLength(2)
    expect(element.shadowRoot?.querySelectorAll('pm-entry-otp-item')).toHaveLength(2)

    const rows = Array.from(element.shadowRoot?.querySelectorAll('.row') ?? [])
    expect(rows[0]?.querySelector('.row__path')?.textContent?.trim()).toBe('GitHub')
    expect(rows[0]?.querySelector('.row__otp-label')).toBeNull()
    expect(rows[0]?.querySelector('.row__details')).toBeNull()
    expect(rows[0]?.querySelector('.row__type')?.textContent?.trim()).toBe('TOTP')
    expect(rows[0]?.querySelector('.row__type')?.hasAttribute('hidden')).toBe(true)
    expect(rows[0]?.querySelector('.open-entry cv-icon')).toBeNull()
    expect(rows[1]?.querySelector('.row__path')?.textContent?.trim()).toBe('VPN')
    expect(rows[1]?.querySelector('.row__otp-label')?.textContent?.trim()).toBe('Hardware token')
    expect(rows[1]?.querySelector('.row__details')).toBeNull()
    expect(rows[1]?.querySelector('.row__type')?.textContent?.trim()).toBe('HOTP')
    expect(rows[1]?.querySelector('.row__type')?.hasAttribute('hidden')).toBe(true)
    expect(rows[1]?.querySelector('.open-entry cv-icon')).toBeNull()
  })

  it('renders the mobile custom element with the mobile layout marker', async () => {
    setPassmanagerRoot(createRootWithOtps())

    const element = await renderMobile()
    const layout = element.shadowRoot?.querySelector('mobile-surface-layout[data-layout="mobile"]')
    const summaryRail = element.shadowRoot?.querySelector<HTMLElement & {updateComplete?: Promise<unknown>}>(
      'mobile-surface-layout > pm-summary-rail.quick-view__summary-rail',
    )
    await summaryRail?.updateComplete

    expect(layout).not.toBeNull()
    expect(element.shadowRoot?.querySelector('[data-layout="desktop"]')).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__header pm-summary-rail')).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__header pm-otp-quick-view-search')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__content')).not.toBeNull()
    expect(summaryRail?.getAttribute('slot')).toBe('footer')
    expect(summaryRail?.shadowRoot?.querySelector('[data-summary-id="total"]')?.textContent).toContain('2')
    expect(element.shadowRoot?.querySelectorAll('.row')).toHaveLength(2)
  })

  it('search control updates and clears the OTP quick view filters', async () => {
    setPassmanagerRoot(createRootWithOtps())

    const element = await renderSearch()
    const input = element.shadowRoot?.querySelector('cv-input')
    input?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'vpn'},
        bubbles: true,
        composed: true,
      }),
    )
    await element.updateComplete
    await Promise.resolve()
    await element.updateComplete

    expect(pmOtpQuickViewModel.state.query()).toBe('vpn')
    expect(element.shadowRoot?.querySelector('.clear-filters')).not.toBeNull()

    ;(element.shadowRoot?.querySelector('.clear-filters') as HTMLButtonElement | null)?.click()
    await element.updateComplete

    expect(pmOtpQuickViewModel.state.query()).toBe('')
  })

  it('renders distinct no-OTP and filtered empty states', async () => {
    const emptyRoot = new ManagerRoot({} as any)
    emptyRoot.entries.set([])
    setPassmanagerRoot(emptyRoot)

    const emptyElement = await renderDesktop()
    expect(emptyElement.shadowRoot?.querySelector('cv-empty-state')?.getAttribute('headline')).toBe(
      'No saved OTP codes',
    )

    emptyElement.remove()
    setPassmanagerRoot(createRootWithOtps())
    pmOtpQuickViewModel.actions.setQuery('missing-service')
    const filteredElement = await renderDesktop()

    expect(filteredElement.shadowRoot?.querySelector('cv-empty-state')?.getAttribute('headline')).toBe(
      'No matching OTP codes',
    )
    expect(filteredElement.shadowRoot?.querySelector('.clear-filters')).not.toBeNull()
  })

  it('open-entry button delegates to model navigation', async () => {
    setPassmanagerRoot(createRootWithOtps())
    const openRouteSpy = vi.spyOn(navigationModel, 'openPassmanagerRoute').mockImplementation(() => {})

    const element = await renderDesktop()
    const button = element.shadowRoot?.querySelector('.open-entry') as HTMLButtonElement | null
    button?.click()

    expect(openRouteSpy).toHaveBeenCalledWith({
      kind: 'entry',
      entryId: 'entry-github',
      groupPath: undefined,
    })
  })
})
