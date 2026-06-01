import {afterEach, describe, expect, it, vi} from 'vitest'

import {Entry, Group, ManagerRoot} from '@project/passmanager'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {
  PMOtpQuickView,
  PMOtpQuickViewMobile,
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
    otps: [{id: 'otp-github', label: 'Primary', type: 'TOTP'}],
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

afterEach(() => {
  document.querySelectorAll('pm-otp-quick-view, pm-otp-quick-view-mobile').forEach((el) => el.remove())
  pmOtpQuickViewModel.actions.clearFilters()
  setPassmanagerRoot(undefined)
  vi.restoreAllMocks()
})

describe('PMOtpQuickView render', () => {
  it('defines desktop and mobile elements idempotently', () => {
    ensureDefined()

    expect(() => PMOtpQuickView.define()).not.toThrow()
    expect(() => PMOtpQuickViewMobile.define()).not.toThrow()
    expect(customElements.get('pm-otp-quick-view')).toBe(PMOtpQuickView)
    expect(customElements.get('pm-otp-quick-view-mobile')).toBe(PMOtpQuickViewMobile)
  })

  it('renders desktop summary, controls, and one row per visible model row', async () => {
    setPassmanagerRoot(createRootWithOtps())

    const element = await renderDesktop()
    const summaryRail = element.shadowRoot?.querySelector('pm-summary-rail')
    await summaryRail?.updateComplete

    expect(element.shadowRoot?.querySelector('[data-layout="desktop"]')).not.toBeNull()
    expect(summaryRail?.shadowRoot?.textContent).toContain('Total')
    expect(summaryRail?.shadowRoot?.textContent).toContain('Visible')
    expect(summaryRail?.shadowRoot?.textContent).toContain('TOTP')
    expect(summaryRail?.shadowRoot?.textContent).toContain('HOTP')
    expect(summaryRail?.shadowRoot?.querySelector('[data-summary-id="total"]')?.textContent).toContain('2')
    expect(summaryRail?.classList.contains('quick-view__summary-rail')).toBe(true)
    expect(summaryRail?.previousElementSibling?.classList.contains('quick-view__header')).toBe(true)
    expect(element.shadowRoot?.querySelector('.quick-view__header pm-summary-rail')).toBeNull()
    expect(element.shadowRoot?.querySelector('cv-input[type="search"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.type-filter')).toBeNull()
    expect(element.shadowRoot?.textContent).not.toContain('Live codes from saved login entries.')
    expect(element.shadowRoot?.querySelectorAll('.row')).toHaveLength(2)
    expect(element.shadowRoot?.querySelectorAll('pm-entry-otp-item')).toHaveLength(2)
  })

  it('renders the mobile custom element with the mobile layout marker', async () => {
    setPassmanagerRoot(createRootWithOtps())

    const element = await renderMobile()
    const summaryRail = element.shadowRoot?.querySelector<HTMLElement & {updateComplete?: Promise<unknown>}>(
      '.quick-view > pm-summary-rail.quick-view__summary-rail',
    )
    await summaryRail?.updateComplete

    expect(element.shadowRoot?.querySelector('[data-layout="mobile"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('[data-layout="desktop"]')).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__header pm-summary-rail')).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__content')).not.toBeNull()
    expect(summaryRail?.shadowRoot?.querySelector('[data-summary-id="total"]')?.textContent).toContain('2')
    expect(element.shadowRoot?.querySelectorAll('.row')).toHaveLength(2)
  })

  it('renders distinct no-OTP and filtered empty states', async () => {
    const emptyRoot = new ManagerRoot({} as any)
    emptyRoot.entries.set([])
    setPassmanagerRoot(emptyRoot)

    const emptyElement = await renderDesktop()
    expect(emptyElement.shadowRoot?.querySelector('.empty-state')?.textContent).toContain(
      'No saved OTP codes',
    )

    emptyElement.remove()
    setPassmanagerRoot(createRootWithOtps())
    pmOtpQuickViewModel.actions.setQuery('missing-service')
    const filteredElement = await renderDesktop()

    expect(filteredElement.shadowRoot?.querySelector('.empty-state')?.textContent).toContain(
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
