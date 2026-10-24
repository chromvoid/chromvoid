import {expect, test} from 'vitest'

import {clearMockPassmanagerState, writeMockPassmanagerState} from './utils'

import type {Page} from 'playwright'
declare global {
  var __E2E_PAGE__: Page | undefined
}

const BASE_URL = 'http://localhost:4400/index.html?layout=desktop'

type FixtureEntry = {
  entryId: string
  title: string
  otpLabel: string
  type: 'TOTP' | 'HOTP'
  groupPath?: string
}

type OtpQuickViewFixture = {
  topTotp: FixtureEntry
  groupedTotp: FixtureEntry
  hotp: FixtureEntry
  paymentCardTitle: string
}

type SeedOtpFixtureOptions = {
  extraTotpCount?: number
}

function getPage(): Page | undefined {
  return globalThis.__E2E_PAGE__
}

async function openPasswords(page: Page, pm?: string): Promise<void> {
  const nextUrl = new URL(BASE_URL)
  nextUrl.searchParams.set('surface', 'passwords')
  if (pm) {
    nextUrl.searchParams.set('pm', pm)
  }
  await page.goto(nextUrl.toString(), {waitUntil: 'domcontentloaded'})
  await waitForPasswordManager(page)
}

async function openPasswordsMobile(page: Page, pm?: string): Promise<void> {
  const nextUrl = new URL(BASE_URL)
  nextUrl.searchParams.set('layout', 'mobile')
  nextUrl.searchParams.set('surface', 'passwords')
  if (pm) {
    nextUrl.searchParams.set('pm', pm)
  }
  await page.setViewportSize({width: 390, height: 844})
  await page.goto(nextUrl.toString(), {waitUntil: 'domcontentloaded'})
  await waitForPasswordManager(page)
}

async function waitForPasswordManager(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind(el.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }

      const pm = deepFind(document, 'password-manager')
      return Boolean(pm?.shadowRoot && (window as unknown as {passmanager?: unknown}).passmanager)
    },
    undefined,
    {timeout: 10_000},
  )
}

async function seedOtpFixture(options: SeedOtpFixtureOptions = {}): Promise<OtpQuickViewFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const extraTotps = Array.from({length: options.extraTotpCount ?? 0}, (_, index): FixtureEntry => {
    const position = index + 1

    return {
      entryId: `s24-extra-totp-${position}-${suffix}`,
      title: `S24 Overflow OTP ${String(position).padStart(2, '0')} ${suffix}`,
      otpLabel: `Extra ${position} ${suffix}`,
      type: 'TOTP',
    }
  })
  const fixture: OtpQuickViewFixture = {
    topTotp: {
      entryId: `s24-top-totp-${suffix}`,
      title: `S24 GitHub ${suffix}`,
      otpLabel: `Primary ${suffix}`,
      type: 'TOTP',
    },
    groupedTotp: {
      entryId: `s24-grouped-totp-${suffix}`,
      title: `S24 AWS Console ${suffix}`,
      otpLabel: `Admin ${suffix}`,
      type: 'TOTP',
      groupPath: `S24 Production/${suffix}`,
    },
    hotp: {
      entryId: `s24-hotp-${suffix}`,
      title: `S24 Legacy VPN ${suffix}`,
      otpLabel: `Hardware ${suffix}`,
      type: 'HOTP',
    },
    paymentCardTitle: `S24 Corporate Card ${suffix}`,
  }

  const topTotpId = `s24-top-otp-${suffix}`
  const groupedTotpId = `s24-grouped-otp-${suffix}`
  const hotpId = `s24-hotp-otp-${suffix}`
  const extraOtpSecrets = extraTotps.map(
    (entry): [string, {secret: string; digits: number; period: number}] => [
      `${entry.entryId}:${entry.otpLabel}`,
      {secret: 'JBSWY3DPEHPK3PXP', digits: 6, period: 60},
    ],
  )

  await writeMockPassmanagerState({
    version: 1,
    revision: 1,
    nextNodeId: extraTotps.length > 0 ? 6 + extraTotps.length : 5,
    folders: [fixture.groupedTotp.groupPath],
    foldersMeta: [],
    entries: [
      {
        nodeId: 2,
        meta: {
          id: fixture.topTotp.entryId,
          title: fixture.topTotp.title,
          username: 'alice@example.test',
          urls: [{value: 'https://github.com/login', match: 'base_domain'}],
          otps: [
            {
              id: topTotpId,
              label: fixture.topTotp.otpLabel,
              algorithm: 'SHA1',
              digits: 6,
              period: 60,
              encoding: 'base32',
              type: 'TOTP',
            },
          ],
        },
      },
      {
        nodeId: 3,
        meta: {
          id: fixture.groupedTotp.entryId,
          title: fixture.groupedTotp.title,
          username: 'root@example.test',
          folderPath: fixture.groupedTotp.groupPath,
          urls: [{value: 'https://console.aws.amazon.com', match: 'base_domain'}],
          otps: [
            {
              id: groupedTotpId,
              label: fixture.groupedTotp.otpLabel,
              algorithm: 'SHA1',
              digits: 6,
              period: 60,
              encoding: 'base32',
              type: 'TOTP',
            },
          ],
        },
      },
      {
        nodeId: 4,
        meta: {
          id: fixture.hotp.entryId,
          title: fixture.hotp.title,
          username: 'ops',
          urls: [{value: 'https://vpn.example.test', match: 'base_domain'}],
          otps: [
            {
              id: hotpId,
              label: fixture.hotp.otpLabel,
              algorithm: 'SHA1',
              digits: 6,
              counter: 7,
              encoding: 'base32',
              type: 'HOTP',
            },
          ],
        },
      },
      ...extraTotps.map((entry, index) => ({
        nodeId: 6 + index,
        meta: {
          id: entry.entryId,
          title: entry.title,
          username: `overflow-${index + 1}@example.test`,
          urls: [{value: `https://overflow-${index + 1}.example.test`, match: 'base_domain'}],
          otps: [
            {
              id: `s24-extra-otp-${index + 1}-${suffix}`,
              label: entry.otpLabel,
              algorithm: 'SHA1',
              digits: 6,
              period: 60,
              encoding: 'base32',
              type: 'TOTP',
            },
          ],
        },
      })),
      {
        nodeId: 5,
        meta: {
          id: `s24-card-${suffix}`,
          title: fixture.paymentCardTitle,
          entryType: 'payment_card',
          paymentCard: {
            holderName: 'S24 Tester',
            brand: 'visa',
            last4: '4242',
            expiryMonth: '12',
            expiryYear: '2030',
          },
        },
      },
    ],
    secrets: [],
    otpSecrets: [
      [`${fixture.topTotp.entryId}:${fixture.topTotp.otpLabel}`, {secret: 'JBSWY3DPEHPK3PXP', digits: 6, period: 60}],
      [
        `${fixture.groupedTotp.entryId}:${fixture.groupedTotp.otpLabel}`,
        {secret: 'JBSWY3DPEHPK3PXP', digits: 6, period: 60},
      ],
      [`${fixture.hotp.entryId}:${fixture.hotp.otpLabel}`, {secret: 'JBSWY3DPEHPK3PXP', digits: 6, period: 30}],
      ...extraOtpSecrets,
    ],
    icons: [],
  })

  return fixture
}

async function waitForQuickViewRows(page: Page, expectedCount: number): Promise<void> {
  await page.waitForFunction(
    (count) => {
      const host = findQuickViewHost()
      return (host?.shadowRoot?.querySelectorAll('.row').length ?? 0) === count

      function findQuickViewHost(): Element | null {
        return deepFind(document, 'pm-otp-quick-view, pm-otp-quick-view-mobile')
      }

      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind(el.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }
    },
    expectedCount,
    {timeout: 15_000},
  )
}

async function quickViewSnapshot(page: Page) {
  return page.evaluate(() => {
    const host = deepFind(document, 'pm-otp-quick-view, pm-otp-quick-view-mobile') as HTMLElement | null
    const root = host?.shadowRoot
    const rows = Array.from(root?.querySelectorAll('.row') ?? []).map((row) => {
      const otpItem = row.querySelector('pm-entry-otp-item') as HTMLElement | null
      return {
        rowId: row.getAttribute('data-row-id') ?? '',
        title: row.querySelector('.row__entry-title')?.textContent?.trim() ?? '',
        text: row.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        type: row.querySelector('.row__type')?.textContent?.trim() ?? '',
        hasTotp: Boolean(otpItem?.shadowRoot?.querySelector('pm-entry-totp-item')),
        hasHotp: Boolean(otpItem?.shadowRoot?.querySelector('pm-entry-hotp-item')),
      }
    })

    return {
      url: window.location.href,
      rows,
      text: root?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    }

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

async function quickViewMobileRailSnapshot(page: Page) {
  return page.evaluate(() => {
    const host = deepFind(document, 'pm-otp-quick-view-mobile') as HTMLElement | null
    const root = host?.shadowRoot
    const surfaceLayout = root?.querySelector('mobile-surface-layout') as HTMLElement | null
    const content = surfaceLayout?.shadowRoot?.querySelector('[part~="scroll"]') as HTMLElement | null
    const rail = root?.querySelector('.quick-view__summary-rail') as HTMLElement | null
    const headerRail = root?.querySelector('.quick-view__header pm-summary-rail') as HTMLElement | null
    const tabBar = deepFind(document, '[data-testid="mobile-tabs"]') as HTMLElement | null
    const hostRect = host?.getBoundingClientRect()
    const railRect = rail?.getBoundingClientRect()
    const tabBarRect = tabBar?.getBoundingClientRect()

    return {
      hostName: host?.localName ?? null,
      railExists: Boolean(rail),
      headerRailExists: Boolean(headerRail),
      hasHorizontalOverflow: host ? host.scrollWidth > host.clientWidth : null,
      contentScrollTop: content ? Math.round(content.scrollTop) : null,
      contentScrollHeight: content?.scrollHeight ?? null,
      contentClientHeight: content?.clientHeight ?? null,
      railToTabBarGap:
        railRect && tabBarRect ? Math.round(tabBarRect.top - railRect.bottom) : null,
      hostRect: hostRect
        ? {top: hostRect.top, bottom: hostRect.bottom, left: hostRect.left, right: hostRect.right}
        : null,
      railRect: railRect
        ? {top: railRect.top, bottom: railRect.bottom, left: railRect.left, right: railRect.right}
        : null,
      tabBarRect: tabBarRect
        ? {top: tabBarRect.top, bottom: tabBarRect.bottom, left: tabBarRect.left, right: tabBarRect.right}
        : null,
    }

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

async function scrollQuickViewMobileContentToBottom(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const host = deepFind(document, 'pm-otp-quick-view-mobile') as HTMLElement | null
    const surfaceLayout = host?.shadowRoot?.querySelector('mobile-surface-layout') as HTMLElement | null
    const content = surfaceLayout?.shadowRoot?.querySelector('[part~="scroll"]') as HTMLElement | null
    if (!content) throw new Error('OTP Quick View mobile surface scroller not found')

    content.scrollTop = content.scrollHeight
    content.dispatchEvent(new Event('scroll', {bubbles: true}))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

// Chromium 149 can collect an evaluate result while application-update microtasks are pending.
// Use Playwright input for user actions; locator clicks also bring targets into their scroll viewport.
async function openOtpQuickViewFromMobileTab(page: Page): Promise<void> {
  await waitForAppInput(page)
  await page.getByTestId('mobile-tabs').getByRole('button', {name: 'OTPs', exact: true}).click()
}

// Real input must wait until the startup splash releases the app.
async function waitForAppInput(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('loading'), undefined, {
    timeout: 10_000,
  })
}

// Use native text input instead of returning from evaluate with queued updates; see the GC note above.
async function setQuickViewSearch(page: Page, value: string): Promise<void> {
  await waitForAppInput(page)
  const input = page.locator('pm-otp-quick-view-search cv-input input')
  await input.scrollIntoViewIfNeeded()
  await input.fill(value)
}

// Keep the copy action outside evaluate, as described in the GC note above.
async function clickFirstTotpCard(page: Page): Promise<void> {
  await waitForAppInput(page)
  await page.locator('pm-otp-quick-view .totp-card, pm-otp-quick-view-mobile .totp-card').first().click()
}

async function waitForCopiedFeedback(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const host = deepFind(document, 'pm-otp-quick-view, pm-otp-quick-view-mobile') as HTMLElement | null
      const rows = Array.from(host?.shadowRoot?.querySelectorAll('.row') ?? [])
      return rows.some((row) => {
        const otpItem = row.querySelector('pm-entry-otp-item') as HTMLElement | null
        const totp = otpItem?.shadowRoot?.querySelector('pm-entry-totp-item') as HTMLElement | null
        return totp?.shadowRoot?.querySelector('.totp-feedback')?.textContent?.trim() === 'Copied'
      })

      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind(el.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }
    },
    undefined,
    {timeout: 5_000},
  )
}

async function openEntryFromQuickView(page: Page, title: string): Promise<void> {
  const row = page
    .locator('pm-otp-quick-view .row, pm-otp-quick-view-mobile .row')
    .filter({hasText: title})
  await row.locator('.open-entry').click()
}

async function waitForEntryRoute(page: Page, entry: FixtureEntry): Promise<void> {
  await page.waitForFunction(
    ({entryId}) => {
      const url = new URL(window.location.href)
      if (url.searchParams.get('surface') !== 'passwords') return false
      if (url.searchParams.get('pm') !== 'entry') return false
      if (url.searchParams.get('entry') !== entryId) return false
      const entryHost = deepFind(document, 'pm-entry, pm-entry-mobile') as
        | (HTMLElement & {entry?: {id?: string}})
        | null
      return entryHost?.entry?.id === entryId

      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind(el.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }
    },
    {entryId: entry.entryId},
    {timeout: 10_000},
  )
}

// Both entry and navigation actions use real clicks; see the GC note above.
async function openQuickViewFromEntrySnippet(page: Page): Promise<void> {
  await waitForAppInput(page)
  const entryButton = page.locator(
    'pm-entry [data-action="otp-quick-view"], pm-entry-mobile [data-action="otp-quick-view"]',
  )
  if ((await entryButton.count()) > 0) {
    await entryButton.click()
    return
  }

  await page.locator('navigation-rail cv-button').filter({hasText: /otp/i}).first().click()
}

async function waitForOtpRoute(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const url = new URL(window.location.href)
      return (
        url.searchParams.get('surface') === 'passwords' &&
        url.searchParams.get('pm') === 'otp' &&
        Boolean(deepFind(document, 'pm-otp-quick-view, pm-otp-quick-view-mobile'))
      )

      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind(el.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }
    },
    undefined,
    {timeout: 10_000},
  )
}

test('S24: OTP Quick View mobile summary rail stays compact after scrolling', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }

  await clearMockPassmanagerState()
  const extraTotpCount = 8
  await seedOtpFixture({extraTotpCount})
  const expectedRows = 3 + extraTotpCount

  await openPasswordsMobile(page)
  await openOtpQuickViewFromMobileTab(page)
  await waitForOtpRoute(page)
  await waitForQuickViewRows(page, expectedRows)
  await scrollQuickViewMobileContentToBottom(page)

  const rail = await quickViewMobileRailSnapshot(page)
  expect(rail.hostName).toBe('pm-otp-quick-view-mobile')
  expect(rail.railExists).toBe(true)
  expect(rail.hasHorizontalOverflow).toBe(false)
  expect(rail.contentScrollHeight).toBeGreaterThan(rail.contentClientHeight ?? 0)
  expect(rail.contentScrollTop).toBeGreaterThan(0)
  expect(rail.hostRect).not.toBeNull()
  expect(rail.railRect).not.toBeNull()
  expect(rail.tabBarRect).not.toBeNull()
  expect(rail.railRect!.bottom).toBeLessThanOrEqual(rail.hostRect!.bottom)
  expect(rail.railRect!.bottom).toBeLessThanOrEqual(rail.tabBarRect!.top + 1)
  expect(rail.railToTabBarGap).toBeGreaterThanOrEqual(-1)
  expect(rail.railToTabBarGap).toBeLessThanOrEqual(16)
})

test('S24: OTP Quick View lists, searches, copies, opens source entry, and preserves back return', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }

  await clearMockPassmanagerState()
  const fixture = await seedOtpFixture()

  await openPasswords(page, 'otp')
  await waitForOtpRoute(page)
  await waitForQuickViewRows(page, 3)

  const initial = await quickViewSnapshot(page)
  expect(initial.url).toContain('pm=otp')
  expect(initial.rows.map((row) => row.title).sort()).toEqual(
    [fixture.groupedTotp.title, fixture.hotp.title, fixture.topTotp.title].sort(),
  )
  expect(initial.rows.filter((row) => row.hasTotp)).toHaveLength(2)
  expect(initial.rows.filter((row) => row.hasHotp)).toHaveLength(1)
  expect(initial.text).not.toContain(fixture.paymentCardTitle)

  await setQuickViewSearch(page, fixture.groupedTotp.title)
  await waitForQuickViewRows(page, 1)
  expect((await quickViewSnapshot(page)).rows[0]?.title).toBe(fixture.groupedTotp.title)

  await setQuickViewSearch(page, '')
  await setQuickViewSearch(page, 'totp')
  await waitForQuickViewRows(page, 2)
  expect((await quickViewSnapshot(page)).rows.every((row) => row.type === 'TOTP')).toBe(true)

  await setQuickViewSearch(page, 'hotp')
  await waitForQuickViewRows(page, 1)
  expect((await quickViewSnapshot(page)).rows[0]?.title).toBe(fixture.hotp.title)

  await setQuickViewSearch(page, '')
  await waitForQuickViewRows(page, 3)
  await clickFirstTotpCard(page)
  await waitForCopiedFeedback(page)

  await openEntryFromQuickView(page, fixture.groupedTotp.title)
  await waitForEntryRoute(page, fixture.groupedTotp)

  await openQuickViewFromEntrySnippet(page)
  await waitForOtpRoute(page)
  await waitForQuickViewRows(page, 3)

  await page.goBack()
  await waitForEntryRoute(page, fixture.groupedTotp)
})
