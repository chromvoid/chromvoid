import {expect, test} from 'vitest'

import type {Browser, CDPSession, Locator, Page} from 'playwright'
import type * as AppContextModule from '../../src/shared/services/app-context'
import type * as RuntimeCapabilitiesModule from '../../src/core/runtime/runtime-capabilities'
import {seedWalletFixture} from './wallet-fixture'
declare global {
  var __E2E_BROWSER__: Browser | undefined
  var __E2E_PAGE__: Page | undefined
}

const BASE_URL = 'http://localhost:4400/index.html'

async function deepQuerySelector(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
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
    return deepFind(document, sel) !== null
  }, selector)
}

async function deepQuerySelectorCount(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    function deepFindAll(root: Document | ShadowRoot, selector: string): Element[] {
      const found = Array.from(root.querySelectorAll(selector))
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          found.push(...deepFindAll(el.shadowRoot, selector))
        }
      }
      return found
    }
    return deepFindAll(document, sel).length
  }, selector)
}

async function waitForDeepSelector(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((sel) => {
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
    return deepFind(document, sel) !== null
  }, selector)
}

async function waitForMobileShellReady(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(
          () => !document.documentElement.hasAttribute('loading') && !document.body.hasAttribute('loading'),
        ),
      {timeout: 15_000},
    )
    .toBe(true)

  await Promise.all(
    [
      'file-app-shell-mobile-layout',
      'mobile-top-toolbar',
      'cv-drawer.mobile-nav-drawer',
      'navigation-rail.mobile-nav-rail',
      'mobile-top-toolbar [id="app.navigation.menu"]',
      'navigation-rail.mobile-nav-rail cv-button.item',
    ].map((selector) => page.locator(selector).first().waitFor({state: 'attached', timeout: 15_000})),
  )
}

async function waitForSidebarState(page: Page, open: boolean): Promise<void> {
  const shell = page.locator('file-app-shell').first()
  const drawer = page.locator('cv-drawer.mobile-nav-drawer').first()

  await expect
    .poll(
      async () => {
        const [shellOpen, drawerOpen] = await Promise.all([
          shell.evaluate((element) => element.hasAttribute('data-sidebar-open')),
          drawer.evaluate((element) => Boolean((element as HTMLElement & {open?: boolean}).open)),
        ])
        return shellOpen === open && drawerOpen === open
      },
      {timeout: 5_000},
    )
    .toBe(true)
}

async function waitForDrawerPresence(page: Page, open: boolean): Promise<void> {
  const drawer = page.locator('cv-drawer.mobile-nav-drawer').first()

  await expect
    .poll(
      () =>
        drawer.evaluate((element, expectedOpen) => {
          const overlay = element.shadowRoot?.querySelector('[part="overlay"]') as HTMLElement | null
          const panel = element.shadowRoot?.querySelector('[part="panel"]') as HTMLElement | null

          if (!expectedOpen) {
            return overlay?.hidden === true && panel?.dataset['state'] === 'closed'
          }
          if (overlay?.hidden !== false || panel?.dataset['state'] !== 'open') return false

          const panelStyles = getComputedStyle(panel)
          const transform = new DOMMatrixReadOnly(panelStyles.transform)
          const transitions = [...overlay.getAnimations(), ...panel.getAnimations()]
          return (
            Number.parseFloat(panelStyles.opacity) >= 0.999 &&
            Math.abs(transform.m41) < 0.5 &&
            Math.abs(transform.m42) < 0.5 &&
            transitions.every((animation) => animation.playState === 'finished')
          )
        }, open),
      {timeout: 5_000},
    )
    .toBe(true)
}

async function dispatchTouch(
  client: CDPSession,
  type: 'touchStart' | 'touchEnd' | 'touchCancel',
  point?: {x: number; y: number},
): Promise<void> {
  await client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: point ? [{x: point.x, y: point.y, id: 1, radiusX: 1, radiusY: 1, force: 1}] : [],
  })
}

async function dispatchEmulatedTouchPointer(
  client: CDPSession,
  type: 'mousePressed' | 'mouseReleased',
  point: {x: number; y: number},
): Promise<void> {
  await client.send('Input.emulateTouchFromMouseEvent', {
    type,
    x: Math.round(point.x),
    y: Math.round(point.y),
    button: 'left',
    clickCount: 1,
  })
}

interface InteractionVisualState {
  active: boolean
  background: string
  focusVisible: boolean
  hover: boolean
  outlineVisible: boolean
  transitionDuration: string
}

async function getInteractionVisualState(element: Locator): Promise<InteractionVisualState> {
  return element.evaluate((target) => {
    const styles = getComputedStyle(target)
    return {
      active: target.matches(':active'),
      background: styles.backgroundColor,
      focusVisible: target.matches(':focus-visible'),
      hover: target.matches(':hover'),
      outlineVisible: styles.outlineStyle !== 'none' && styles.outlineWidth !== '0px',
      transitionDuration: styles.transitionDuration,
    }
  })
}

function hasOnlyInstantTransitions(duration: string): boolean {
  return duration.split(',').every((entry) => entry.trim() === '0s')
}

function getMobileRailButton(page: Page, label: string): Locator {
  return page.locator('navigation-rail.mobile-nav-rail cv-button.item').filter({hasText: label}).first()
}

async function getDesktopNavigationRailMetrics(page: Page) {
  return page.evaluate(() => {
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

    const layout = deepFind(document, 'file-app-shell-desktop-layout') as HTMLElement | null
    const rail = layout?.shadowRoot?.querySelector('navigation-rail') as HTMLElement | null
    if (!rail) return null

    return {
      expanded: rail.hasAttribute('expanded'),
      width: rail.getBoundingClientRect().width,
    }
  })
}

async function getCollapsedNavigationRailIconAlignment(page: Page) {
  return page.evaluate(() => {
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

    const layout = deepFind(document, 'file-app-shell-desktop-layout') as HTMLElement | null
    const rail = layout?.shadowRoot?.querySelector('navigation-rail') as HTMLElement | null
    if (!rail) return []

    const buttons = Array.from(
      rail.shadowRoot?.querySelectorAll<HTMLElement>('cv-button.item, cv-button.theme-toggle') ?? [],
    )

    return buttons.flatMap((button) => {
      const base = button.shadowRoot?.querySelector<HTMLElement>('[part="base"]')
      const prefix = button.shadowRoot?.querySelector<HTMLElement>('[part="prefix"]')
      if (!base || !prefix || prefix.hasAttribute('hidden')) return []

      const baseRect = base.getBoundingClientRect()
      const prefixRect = prefix.getBoundingClientRect()
      if (baseRect.width === 0 || prefixRect.width === 0) return []

      return [
        {
          label: (button.textContent || '').replace(/\s+/g, ' ').trim(),
          centerDelta: Math.abs(prefixRect.left + prefixRect.width / 2 - (baseRect.left + baseRect.width / 2)),
        },
      ]
    })
  })
}

async function deepClick(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
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
    const target = deepFind(document, sel) as HTMLElement | null
    if (!target) return false
    target.click()
    return true
  }, selector)
}

async function clickMobileLeading(page: Page): Promise<boolean> {
  return page.evaluate(() => {
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

    const shell = deepFind(document, 'file-app-shell') as HTMLElement | null
    const toolbar = shell?.querySelector('mobile-top-toolbar[slot="mobile-topbar"]') as HTMLElement | null
    const button = toolbar?.shadowRoot?.querySelector('[data-action="mobile-leading"]') as HTMLElement | null
    if (!button) return false
    button.click()
    return true
  })
}

async function deepClickRailButton(page: Page, label: string): Promise<boolean> {
  return page.evaluate((targetLabel) => {
    function deepFindAll(root: Document | ShadowRoot, selector: string): Element[] {
      const found = Array.from(root.querySelectorAll(selector))
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          found.push(...deepFindAll(el.shadowRoot, selector))
        }
      }
      return found
    }

    const rails = deepFindAll(document, 'navigation-rail, navigation-rail-actions') as HTMLElement[]
    const buttons = rails.flatMap((rail) =>
      Array.from(rail.shadowRoot?.querySelectorAll('cv-button, button') ?? []),
    )
    const target = buttons.find((btn) =>
      (btn.textContent || '').replace(/\s+/g, ' ').trim().startsWith(targetLabel),
    ) as HTMLElement | undefined

    if (!target) return false
    target.click()
    return true
  }, label)
}

async function ensureToolbarMenuMode(page: Page): Promise<void> {
  await waitForMobileShellReady(page)
  await page.evaluate(async () => {
    const modulePath = '/shared/services/app-context.ts'
    const dynamicImport = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<typeof AppContextModule>
    const {getAppContext} = await dynamicImport(modulePath)
    const store = getAppContext().store
    store.closeDetailsPanel?.()
    store.setShowRemoteStoragePage?.(false)
    store.setShowGatewayPage?.(false)
    store.setShowRemotePage?.(false)
    store.setShowSettingsPage?.(false)
    store.isShowPasswordManager?.set?.(false)
    store.setSidebarOpen?.(false)
  })
  const shell = page.locator('file-app-shell').first()
  const toolbar = page.locator('mobile-top-toolbar').first()
  const drawer = page.locator('cv-drawer.mobile-nav-drawer').first()

  await expect
    .poll(
      async () => {
        const [leading, sidebarOpen, drawerState] = await Promise.all([
          toolbar.evaluate((element) => (element as HTMLElement & {leading?: string}).leading),
          shell.evaluate((element) => element.hasAttribute('data-sidebar-open')),
          drawer.evaluate((element) => ({
            open: Boolean((element as HTMLElement & {open?: boolean}).open),
            overlayHidden:
              (element.shadowRoot?.querySelector('[part="overlay"]') as HTMLElement | null)?.hidden ?? false,
          })),
        ])

        return (
          leading === 'menu' &&
          sidebarOpen === false &&
          drawerState.open === false &&
          drawerState.overlayHidden
        )
      },
      {timeout: 5_000},
    )
    .toBe(true)
}

async function getToolbarLeadingMode(page: Page): Promise<string | null> {
  return page.evaluate(() => {
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

    const shell = deepFind(document, 'file-app-shell') as HTMLElement | null
    const toolbar = shell?.querySelector('mobile-top-toolbar[slot="mobile-topbar"]') as any
    return toolbar?.leading ?? null
  })
}

async function getMobileToolbarTitle(page: Page): Promise<string | null> {
  return page.evaluate(() => {
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

    const toolbar = deepFind(document, 'mobile-top-toolbar') as HTMLElement | null
    return toolbar?.shadowRoot?.querySelector('.title')?.textContent?.trim() ?? null
  })
}

async function isSidebarOpen(page: Page): Promise<boolean> {
  return page.evaluate(() => {
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

    const shell = deepFind(document, 'file-app-shell') as HTMLElement | null
    return shell?.hasAttribute('data-sidebar-open') ?? false
  })
}

async function dragMobileNavDrawerClosed(page: Page): Promise<boolean> {
  return page.evaluate(() => {
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

    const drawer = deepFind(document, 'cv-drawer.mobile-nav-drawer') as HTMLElement | null
    const panel = drawer?.shadowRoot?.querySelector('[part="panel"]') as HTMLElement | null
    if (!panel) return false

    const rect = panel.getBoundingClientRect()
    const startX = rect.left + Math.min(rect.width - 8, 220)
    const endX = startX - 140
    const y = rect.top + Math.min(rect.height / 2, 360)
    const init = {
      bubbles: true,
      composed: true,
      cancelable: true,
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
    }

    panel.dispatchEvent(new PointerEvent('pointerdown', {...init, clientX: startX, clientY: y}))
    panel.dispatchEvent(new PointerEvent('pointermove', {...init, clientX: endX, clientY: y}))
    panel.dispatchEvent(new PointerEvent('pointerup', {...init, clientX: endX, clientY: y}))
    return true
  })
}

async function clickMobileTab(page: Page, label: string): Promise<boolean> {
  return page.evaluate((targetLabel) => {
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

    const tabBar = deepFind(document, 'mobile-tab-bar') as HTMLElement | null
    const root = tabBar?.shadowRoot
    if (!root) return false

    const buttons = Array.from(root.querySelectorAll('cv-button, button'))
    const target = buttons.find((button) =>
      (button.textContent || button.getAttribute('aria-label') || '')
        .replace(/\s+/g, ' ')
        .trim()
        .startsWith(targetLabel),
    ) as HTMLElement | undefined

    if (!target) return false
    target.click()
    return true
  }, label)
}

async function getMobileToolbarActionIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
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

    const shell = deepFind(document, 'file-app-shell') as HTMLElement | null
    const toolbar = shell?.querySelector('mobile-top-toolbar[slot="mobile-topbar"]') as HTMLElement | null
    const root = toolbar?.shadowRoot
    if (!root) return []

    return Array.from(root.querySelectorAll<HTMLButtonElement>('.action-btn[data-action]'))
      .map((button) => button.dataset['action'] || '')
      .filter((actionId) => Boolean(actionId) && actionId !== 'mobile-leading' && actionId !== 'mobile-command')
  })
}

test('force mobile layout on desktop viewport shows mobile-tab-bar, no navigation-rail inline', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 1280, height: 720})
  await page.goto(`${BASE_URL}?layout=mobile`)

  await page.waitForTimeout(2000)

  const hasMobileTabBar = await deepQuerySelector(page, 'mobile-tab-bar')
  expect(hasMobileTabBar).toBe(true)

  const hasMobileLayout = await deepQuerySelector(page, 'file-app-shell-mobile-layout')
  expect(hasMobileLayout).toBe(true)

  const hasDesktopLayout = await deepQuerySelector(page, 'file-app-shell-desktop-layout')
  expect(hasDesktopLayout).toBe(false)

})

test('force desktop layout on mobile viewport shows navigation-rail, no mobile-tab-bar', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 375, height: 812})
  await page.goto(`${BASE_URL}?layout=desktop`)

  await page.waitForTimeout(2000)

  const hasDesktopLayout = await deepQuerySelector(page, 'file-app-shell-desktop-layout')
  expect(hasDesktopLayout).toBe(true)

  const hasNavigationRail = await deepQuerySelector(page, 'navigation-rail')
  expect(hasNavigationRail).toBe(true)

  const hasMobileLayout = await deepQuerySelector(page, 'file-app-shell-mobile-layout')
  expect(hasMobileLayout).toBe(false)

  const hasMobileTabBar = await deepQuerySelector(page, 'file-app-shell-desktop-layout mobile-tab-bar')
  expect(hasMobileTabBar).toBe(false)

})

test('desktop dashboard surfaces render one shell toolbar and no mobile toolbar', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 1280, height: 820})

  const surfaces = [
    'files',
    'notes',
    'passwords',
    'passkeys',
    'wallet',
    'settings',
    'remote',
    'gateway',
    'remote-storage',
  ]

  for (const surface of surfaces) {
    await page.goto(`${BASE_URL}?layout=desktop&surface=${surface}`, {waitUntil: 'domcontentloaded'})
    await waitForDeepSelector(page, 'file-app-shell-desktop-layout')
    await waitForDeepSelector(page, 'desktop-shell-toolbar')

    expect(await deepQuerySelectorCount(page, 'desktop-shell-toolbar'), surface).toBe(1)
    expect(await deepQuerySelector(page, 'mobile-top-toolbar'), surface).toBe(false)
    expect(await deepQuerySelector(page, 'file-app-shell-mobile-layout'), surface).toBe(false)

    if (['settings', 'remote', 'gateway', 'remote-storage'].includes(surface)) {
      expect(
        await deepQuerySelector(page, 'desktop-shell-toolbar [slot="leading"] .back-link'),
        surface,
      ).toBe(false)
    }
  }
})

test('desktop navigation rail stays collapsed on touch tablet until expanded', async () => {
  const browser = globalThis.__E2E_BROWSER__!
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    viewport: {width: 960, height: 600},
  })
  const page = await context.newPage()

  try {
    await page.goto(`${BASE_URL}?layout=desktop`, {waitUntil: 'domcontentloaded'})
    await waitForDeepSelector(page, 'file-app-shell-desktop-layout')
    await waitForDeepSelector(page, 'navigation-rail')

    const collapsed = await getDesktopNavigationRailMetrics(page)
    expect(collapsed?.expanded).toBe(false)
    expect(collapsed?.width).toBeLessThan(100)

    const clicked = await page.evaluate(() => {
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

      const layout = deepFind(document, 'file-app-shell-desktop-layout') as HTMLElement | null
      const rail = layout?.shadowRoot?.querySelector('navigation-rail') as HTMLElement | null
      const brandIcon = rail?.shadowRoot?.querySelector<HTMLElement>('.brand-icon')
      brandIcon?.click()
      return Boolean(brandIcon)
    })
    expect(clicked).toBe(true)

    await page.waitForFunction(() => {
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

      const layout = deepFind(document, 'file-app-shell-desktop-layout') as HTMLElement | null
      const rail = layout?.shadowRoot?.querySelector('navigation-rail') as HTMLElement | null
      return Boolean(rail?.hasAttribute('expanded') && rail.getBoundingClientRect().width > 150)
    })

    const expanded = await getDesktopNavigationRailMetrics(page)
    expect(expanded?.expanded).toBe(true)
    expect(expanded?.width).toBeGreaterThan(150)
  } finally {
    await context.close()
  }
})

test('desktop collapsed navigation rail centers icon-only actions', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 1280, height: 820})
  await page.goto(`${BASE_URL}?layout=desktop`, {waitUntil: 'domcontentloaded'})
  await waitForDeepSelector(page, 'file-app-shell-desktop-layout')
  await waitForDeepSelector(page, 'navigation-rail')

  const collapsed = await getDesktopNavigationRailMetrics(page)
  expect(collapsed?.expanded).toBe(false)

  const alignment = await getCollapsedNavigationRailIconAlignment(page)
  expect(alignment.length).toBeGreaterThan(0)
  for (const item of alignment) {
    expect(item.centerDelta, item.label).toBeLessThanOrEqual(1)
  }
})

test('mobile top toolbar appears on dashboard and wires menu + command actions', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 390, height: 844})
  await page.goto(`${BASE_URL}?layout=mobile`)
  await page.waitForTimeout(1200)

  expect(await deepQuerySelector(page, 'mobile-top-toolbar')).toBe(true)
  expect(await deepQuerySelector(page, '[data-action="mobile-leading"]')).toBe(true)
  expect(await deepQuerySelector(page, '[data-action="mobile-command"]')).toBe(false)

  await ensureToolbarMenuMode(page)
  expect(await getToolbarLeadingMode(page)).toBe('menu')

  expect(await clickMobileLeading(page)).toBe(true)
  await page.waitForTimeout(120)
  const sidebarOpen = await isSidebarOpen(page)
  expect(sidebarOpen).toBe(true)

  expect(await clickMobileLeading(page)).toBe(true)
  await page.waitForTimeout(120)
  const sidebarClosed = await isSidebarOpen(page)
  expect(sidebarClosed).toBe(false)
})

test('mobile wallet toolbar runs Send, Receive, switch, and transaction-safe actions', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 390, height: 844})
  await page.goto(`${BASE_URL}?surface=files&layout=mobile&e2eGuidance=1`, {
    waitUntil: 'domcontentloaded',
  })
  await waitForDeepSelector(page, 'file-app-shell-mobile-layout')
  await page.waitForFunction(() => Boolean(window.__chromvoidGuidanceE2E))
  await page.evaluate(() => {
    window.__chromvoidGuidanceE2E?.moduleAccessModel.rawStates.set([
      {feature_key: 'crypto-wallet', status: 'enabled', denial_code: null},
    ])
  })

  expect(await deepClickRailButton(page, 'Wallet')).toBe(true)
  await waitForDeepSelector(page, 'wallet-page-mobile-layout')
  await seedWalletFixture(page, {multipleWallets: true})

  const sendAction = page.locator('mobile-top-toolbar [data-action="send"]')
  const sendButton = sendAction.locator('button')
  const receiveAction = page.locator('mobile-top-toolbar [data-action="receive"]')
  const receiveButton = receiveAction.locator('button')
  const titleAction = page.locator('mobile-top-toolbar .title-action')
  const refreshAction = page.locator('mobile-top-toolbar cv-menu-item[value="refresh"]')

  expect(await getMobileToolbarTitle(page)).toBe('Personal Wallet')
  expect(await getMobileToolbarActionIds(page)).toEqual(['send', 'receive'])
  await sendButton.focus()
  await sendButton.click()
  await waitForDeepSelector(page, 'cv-bottom-sheet.send-sheet[open]')
  const sendSheet = page.locator('cv-bottom-sheet.send-sheet')
  const afterSendHide = sendSheet.evaluate(
    (sheet) => new Promise<void>((resolve) => sheet.addEventListener('cv-after-hide', () => resolve(), {once: true})),
  )
  await page.keyboard.press('Escape')
  await afterSendHide
  expect(await sendButton.evaluate((button) => button.matches(':focus'))).toBe(true)

  await receiveButton.focus()
  await receiveButton.click()
  await waitForDeepSelector(page, 'cv-bottom-sheet.receive-sheet[open]')
  const receiveSheet = page.locator('cv-bottom-sheet.receive-sheet')
  const afterReceiveHide = receiveSheet.evaluate(
    (sheet) => new Promise<void>((resolve) => sheet.addEventListener('cv-after-hide', () => resolve(), {once: true})),
  )
  await page.keyboard.press('Escape')
  await afterReceiveHide
  expect(await receiveButton.evaluate((button) => button.matches(':focus'))).toBe(true)

  await titleAction.click()
  await waitForDeepSelector(page, 'cv-bottom-sheet.wallet-sheet[open]')
  await page.locator('[data-wallet-id="wallet-travel"]').click()
  await page.locator('mobile-top-toolbar .title', {hasText: 'Travel Wallet'}).waitFor()

  await page.evaluate(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const inner = deepFind(element.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
    const layout = deepFind(document, 'wallet-page-mobile-layout') as
      | (HTMLElement & {model?: {preparing: {set(value: boolean): void}}})
      | null
    layout?.model?.preparing.set(true)
  })
  await page.locator('mobile-top-toolbar [data-action="receive"][disabled]').waitFor()
  expect(await sendAction.getAttribute('disabled')).toBeNull()
  expect(await receiveAction.getAttribute('disabled')).not.toBeNull()
  expect(await titleAction.getAttribute('disabled')).not.toBeNull()
  expect(await refreshAction.getAttribute('disabled')).not.toBeNull()
})

test('switching from files to passwords shows password toolbar actions without opening sidebar', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 390, height: 844})
  await page.goto(`${BASE_URL}?layout=mobile`)
  await page.waitForTimeout(1200)

  expect(await clickMobileTab(page, 'Credentials')).toBe(true)
  await page.waitForTimeout(250)

  const actionIds = await getMobileToolbarActionIds(page)

  expect(actionIds).toContain('pm-create-group')
  expect(actionIds).toContain('pm-create-entry')
})

test('navigation-rail selection auto-closes mobile drawer', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 390, height: 844})
  await page.goto(`${BASE_URL}?layout=mobile`, {waitUntil: 'domcontentloaded'})

  await ensureToolbarMenuMode(page)
  expect(await getToolbarLeadingMode(page)).toBe('menu')

  expect(await clickMobileLeading(page)).toBe(true)
  await waitForSidebarState(page, true)
  await waitForDrawerPresence(page, true)
  const sidebarOpenBeforeSelect = await isSidebarOpen(page)
  expect(sidebarOpenBeforeSelect).toBe(true)

  expect(await deepClickRailButton(page, 'Credentials')).toBe(true)
  await waitForSidebarState(page, false)
  await waitForDrawerPresence(page, false)
  const sidebarOpenAfterSelect = await isSidebarOpen(page)
  expect(sidebarOpenAfterSelect).toBe(false)
})

test('mobile drawer interaction states: touch release, cancel, and focus restore', async () => {
  const browser = globalThis.__E2E_BROWSER__!
  const context = await browser.newContext({
    viewport: {width: 390, height: 844},
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()

  try {
    await page.goto(`${BASE_URL}?layout=mobile`, {waitUntil: 'domcontentloaded'})
    await ensureToolbarMenuMode(page)

    expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false)

    const opener = page.locator('mobile-top-toolbar [id="app.navigation.menu"]')
    await opener.tap()
    await waitForSidebarState(page, true)
    await waitForDrawerPresence(page, true)

    const client = await context.newCDPSession(page)
    const credentials = getMobileRailButton(page, 'Credentials')
    const credentialsBase = credentials.locator('[part="base"]')

    const themeToggle = page.locator('navigation-rail-actions.mobile-nav-actions cv-button.theme-toggle')
    const themeBase = themeToggle.locator('[part="base"]')
    const themeBox = await themeToggle.boundingBox()
    expect(themeBox).not.toBeNull()
    const themePoint = {
      x: themeBox!.x + themeBox!.width / 2,
      y: themeBox!.y + themeBox!.height / 2,
    }
    const themeRestingBackground = {
      host: (await getInteractionVisualState(themeToggle)).background,
      base: (await getInteractionVisualState(themeBase)).background,
    }

    await dispatchEmulatedTouchPointer(client, 'mousePressed', themePoint)
    await expect
      .poll(async () => {
        const [host, base] = await Promise.all([
          getInteractionVisualState(themeToggle),
          getInteractionVisualState(themeBase),
        ])
        return host.active && base.active
      })
      .toBe(true)

    const [heldTouchHost, heldTouchBase] = await Promise.all([
      getInteractionVisualState(themeToggle),
      getInteractionVisualState(themeBase),
    ])
    expect(
      heldTouchHost.background !== themeRestingBackground.host ||
        heldTouchBase.background !== themeRestingBackground.base,
    ).toBe(true)
    expect(
      hasOnlyInstantTransitions(heldTouchHost.transitionDuration) ||
        hasOnlyInstantTransitions(heldTouchBase.transitionDuration),
    ).toBe(true)

    await dispatchEmulatedTouchPointer(client, 'mouseReleased', themePoint)
    await expect
      .poll(async () => {
        const [host, base] = await Promise.all([
          getInteractionVisualState(themeToggle),
          getInteractionVisualState(themeBase),
        ])
        return (
          !host.active &&
          !base.active &&
          host.background === themeRestingBackground.host &&
          base.background === themeRestingBackground.base
        )
      })
      .toBe(true)

    await dispatchTouch(client, 'touchStart', themePoint)
    await dispatchTouch(client, 'touchCancel')
    await expect
      .poll(async () => {
        const [host, base] = await Promise.all([
          getInteractionVisualState(themeToggle),
          getInteractionVisualState(themeBase),
        ])
        return !host.active && !base.active
      })
      .toBe(true)

    expect(await isSidebarOpen(page)).toBe(true)
    const themeReleaseState = await getInteractionVisualState(themeBase)
    expect(themeReleaseState.focusVisible).toBe(false)
    expect(themeReleaseState.outlineVisible).toBe(false)

    await credentials.tap()
    await waitForSidebarState(page, false)
    await waitForDrawerPresence(page, false)

    const [credentialsBaseState, openerState] = await Promise.all([
      getInteractionVisualState(credentialsBase),
      getInteractionVisualState(opener),
    ])
    expect(credentialsBaseState.active).toBe(false)
    expect(await credentials.evaluate((element) => element.classList.contains('active'))).toBe(true)
    expect(credentialsBaseState.focusVisible).toBe(false)
    expect(await opener.evaluate((element) => element.matches(':focus'))).toBe(true)
    expect(openerState.focusVisible).toBe(false)
    expect(openerState.outlineVisible).toBe(false)
  } finally {
    await context.close()
  }
})

test('mobile drawer interaction states: keyboard focus and fine-pointer hover', async () => {
  const browser = globalThis.__E2E_BROWSER__!
  const context = await browser.newContext({viewport: {width: 390, height: 844}})
  const page = await context.newPage()

  try {
    await page.goto(`${BASE_URL}?layout=mobile`, {waitUntil: 'domcontentloaded'})
    await ensureToolbarMenuMode(page)

    expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(true)

    const opener = page.locator('mobile-top-toolbar [id="app.navigation.menu"]')
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    })

    for (
      let attempt = 0;
      attempt < 12 && !(await opener.evaluate((element) => element.matches(':focus')));
      attempt += 1
    ) {
      await page.keyboard.press('Tab')
    }

    const keyboardOpenerState = await getInteractionVisualState(opener)
    expect(await opener.evaluate((element) => element.matches(':focus'))).toBe(true)
    expect(keyboardOpenerState.focusVisible).toBe(true)
    expect(keyboardOpenerState.outlineVisible).toBe(true)

    await page.keyboard.press('Space')
    await waitForSidebarState(page, true)
    await waitForDrawerPresence(page, true)

    const credentials = getMobileRailButton(page, 'Credentials')
    const credentialsBase = credentials.locator('[part="base"]')
    await credentialsBase.focus()

    const focusedCredentialsState = await getInteractionVisualState(credentialsBase)
    expect(focusedCredentialsState.focusVisible).toBe(true)
    expect(focusedCredentialsState.outlineVisible).toBe(true)

    await page.keyboard.press('Enter')
    await waitForSidebarState(page, false)
    await waitForDrawerPresence(page, false)

    expect(await credentials.evaluate((element) => element.classList.contains('active'))).toBe(true)
    const restoredKeyboardOpenerState = await getInteractionVisualState(opener)
    expect(await opener.evaluate((element) => element.matches(':focus'))).toBe(true)
    expect(restoredKeyboardOpenerState.focusVisible).toBe(true)
    expect(restoredKeyboardOpenerState.outlineVisible).toBe(true)

    await opener.click()
    await waitForSidebarState(page, true)
    await waitForDrawerPresence(page, true)

    const selectedBackground = (await getInteractionVisualState(credentials)).background
    await credentials.hover()
    expect((await getInteractionVisualState(credentials)).background).toBe(selectedBackground)

    const files = getMobileRailButton(page, 'Files')
    const filesBase = files.locator('[part="base"]')
    const filesBackgroundBefore = (await getInteractionVisualState(files)).background

    await files.hover()
    await expect
      .poll(async () => (await getInteractionVisualState(files)).background)
      .not.toBe(filesBackgroundBefore)

    const hoveredFilesState = await getInteractionVisualState(files)
    expect(hoveredFilesState.hover).toBe(true)
    expect(hoveredFilesState.background).not.toBe(filesBackgroundBefore)

    const filesBox = await files.boundingBox()
    expect(filesBox).not.toBeNull()
    await page.mouse.move(filesBox!.x + filesBox!.width / 2, filesBox!.y + filesBox!.height / 2)
    await page.mouse.down()
    await expect
      .poll(async () => {
        const [host, base] = await Promise.all([
          getInteractionVisualState(files),
          getInteractionVisualState(filesBase),
        ])
        return host.active || base.active
      })
      .toBe(true)

    const [pressedFilesState, pressedFilesBaseState] = await Promise.all([
      getInteractionVisualState(files),
      getInteractionVisualState(filesBase),
    ])
    expect(
      hasOnlyInstantTransitions(pressedFilesState.transitionDuration) ||
        hasOnlyInstantTransitions(pressedFilesBaseState.transitionDuration),
    ).toBe(true)
    expect(pressedFilesBaseState.focusVisible).toBe(false)
    expect(pressedFilesBaseState.outlineVisible).toBe(false)

    await page.mouse.move(2, 2, {steps: 2})
    await page.mouse.up()
    await expect
      .poll(async () => {
        const [host, base] = await Promise.all([
          getInteractionVisualState(files),
          getInteractionVisualState(filesBase),
        ])
        return !host.active && !base.active
      })
      .toBe(true)
    expect(await isSidebarOpen(page)).toBe(true)

    await files.hover()
    await files.click()
    await waitForSidebarState(page, false)
    await waitForDrawerPresence(page, false)

    expect(await files.evaluate((element) => element.classList.contains('active'))).toBe(true)
    const [releasedFilesBaseState, pointerOpenerState] = await Promise.all([
      getInteractionVisualState(filesBase),
      getInteractionVisualState(opener),
    ])
    expect(releasedFilesBaseState.focusVisible).toBe(false)
    expect(await opener.evaluate((element) => element.matches(':focus'))).toBe(true)
    expect(pointerOpenerState.focusVisible).toBe(false)
    expect(pointerOpenerState.outlineVisible).toBe(false)
  } finally {
    await context.close()
  }
})

test('mobile navigation drawer closes when dragged left', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 390, height: 844})
  await page.goto(`${BASE_URL}?layout=mobile`)
  await page.waitForTimeout(900)

  expect(await getToolbarLeadingMode(page)).toBe('menu')
  expect(await clickMobileLeading(page)).toBe(true)
  await page.waitForTimeout(120)
  expect(await isSidebarOpen(page)).toBe(true)

  expect(await dragMobileNavDrawerClosed(page)).toBe(true)
  await page.waitForTimeout(180)

  expect(await isSidebarOpen(page)).toBe(false)
})

test('mobile Settings uses overview, category route, and toolbar back hierarchy', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 390, height: 844})
  await page.goto(`${BASE_URL}?layout=mobile`)
  await page.waitForTimeout(900)

  await page.evaluate(async () => {
    const modulePath = '/core/runtime/runtime-capabilities.ts'
    const dynamicImport = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<typeof RuntimeCapabilitiesModule>
    const {setRuntimeCapabilities} = await dynamicImport(modulePath)
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      desktop: false,
      supports_autofill: true,
      supports_biometric: true,
    })
  })

  await ensureToolbarMenuMode(page)
  expect(await clickMobileLeading(page)).toBe(true)
  await page.waitForTimeout(120)
  expect(await deepClickRailButton(page, 'Settings')).toBe(true)
  await page.waitForTimeout(180)

  const hasLocalSettingsBack = await page.evaluate(() => {
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

    const settings = deepFind(document, 'settings-page') as HTMLElement | null
    return Boolean(settings && deepFind(settings.shadowRoot!, '.back-link'))
  })

  expect(hasLocalSettingsBack).toBe(false)
  expect(await getToolbarLeadingMode(page)).toBe('menu')
  expect(await getMobileToolbarTitle(page)).toBe('Settings')
  expect(await deepQuerySelectorCount(page, '.overview-row')).toBe(6)
  expect(await deepClick(page, '[data-settings-route="security"]')).toBe(true)
  await page.waitForTimeout(180)

  expect(await getToolbarLeadingMode(page)).toBe('back')
  expect(await getMobileToolbarTitle(page)).toBe('Security & locking')
  expect(new URL(page.url()).searchParams.get('settings')).toBe('security')
  expect(await deepClick(page, '[data-action="mobile-leading"]')).toBe(true)
  await page.waitForTimeout(180)

  expect(await getToolbarLeadingMode(page)).toBe('menu')
  expect(await getMobileToolbarTitle(page)).toBe('Settings')
  expect(new URL(page.url()).searchParams.get('settings')).toBeNull()
  expect(await deepClick(page, '[data-action="mobile-leading"]')).toBe(true)
  await page.waitForTimeout(180)
  const settingsOpen = await page.evaluate(async () => {
    const modulePath = '/shared/services/app-context.ts'
    const dynamicImport = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<typeof AppContextModule>
    const {getAppContext} = await dynamicImport(modulePath)
    return Boolean(getAppContext().store.showSettingsPage())
  })
  expect(settingsOpen).toBe(true)
  expect(await isSidebarOpen(page)).toBe(true)

  await page.evaluate(async () => {
    const modulePath = '/core/runtime/runtime-capabilities.ts'
    const dynamicImport = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<typeof RuntimeCapabilitiesModule>
    const {resetRuntimeCapabilities} = await dynamicImport(modulePath)
    resetRuntimeCapabilities()
  })
})

test('mobile Settings keeps long copy and the attachment sheet keyboard-safe at 360px', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 360, height: 640})
  await page.goto(`${BASE_URL}?layout=mobile&surface=settings&settings=files`, {
    waitUntil: 'domcontentloaded',
  })
  await waitForDeepSelector(page, 'settings-page-mobile-layout')

  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<{setLang(value: string): void}>
    const {setLang} = await dynamicImport('/i18n/index.ts')
    setLang('ru')
  })
  await page.waitForTimeout(100)

  const hasOverflow = await page.evaluate(() => {
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
    const layout = deepFind(document, 'settings-page-mobile-layout') as HTMLElement | null
    return layout ? layout.scrollWidth > layout.clientWidth : true
  })
  expect(hasOverflow).toBe(false)

  expect(await deepClick(page, '.picker-row')).toBe(true)
  await page.waitForFunction(() => {
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
    const layout = deepFind(document, 'settings-page-mobile-layout') as HTMLElement | null
    const sheet = Array.from(layout?.shadowRoot?.querySelectorAll('cv-bottom-sheet') ?? []).find(
      (candidate) => candidate.querySelector('[slot="title"]')?.textContent?.includes('Markdown'),
    ) as (HTMLElement & {open?: boolean}) | undefined
    return sheet?.open === true
  })
  await page.locator('#settings-attachment-folder-input').click()
  await page.waitForTimeout(50)

  const sheetState = await page.evaluate(() => {
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
    const layout = deepFind(document, 'settings-page-mobile-layout') as HTMLElement | null
    const input = layout?.shadowRoot?.querySelector<HTMLInputElement>(
      '#settings-attachment-folder-input',
    )
    const sheet = input?.closest('cv-bottom-sheet') as (HTMLElement & {open?: boolean}) | null
    return {
      focused: input?.matches(':focus') ?? false,
      inputDisabled: input?.disabled ?? true,
      open: sheet?.open ?? false,
      horizontalOverflow: layout ? layout.scrollWidth > layout.clientWidth : true,
    }
  })

  expect(sheetState).toEqual({
    focused: true,
    inputDisabled: false,
    open: true,
    horizontalOverflow: false,
  })

  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<{setLang(value: string): void}>
    const {setLang} = await dynamicImport('/i18n/index.ts')
    setLang('en')
  })
})
