import {expect, test} from 'vitest'

declare global {
  var __E2E_BROWSER__: import('playwright').Browser | undefined
  var __E2E_PAGE__: import('playwright').Page | undefined
}

const BASE_URL = 'http://localhost:4400/index.html'

async function deepQuerySelector(page: import('playwright').Page, selector: string): Promise<boolean> {
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

async function deepQuerySelectorCount(page: import('playwright').Page, selector: string): Promise<number> {
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

async function waitForDeepSelector(page: import('playwright').Page, selector: string): Promise<void> {
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

async function getDesktopNavigationRailMetrics(page: import('playwright').Page) {
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
      pointerCoarse: matchMedia('(hover: none) and (pointer: coarse)').matches,
      width: rail.getBoundingClientRect().width,
    }
  })
}

async function getCollapsedNavigationRailIconAlignment(page: import('playwright').Page) {
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

async function deepClick(page: import('playwright').Page, selector: string): Promise<boolean> {
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

async function clickMobileLeading(page: import('playwright').Page): Promise<boolean> {
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

async function deepClickRailButton(page: import('playwright').Page, label: string): Promise<boolean> {
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

async function ensureToolbarMenuMode(page: import('playwright').Page): Promise<void> {
  await page.evaluate(async () => {
    const modulePath = '/shared/services/app-context.ts'
    const dynamicImport = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<typeof import('../../src/shared/services/app-context')>
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
  await page.waitForTimeout(80)
}

async function getToolbarLeadingMode(page: import('playwright').Page): Promise<string | null> {
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

async function isSidebarOpen(page: import('playwright').Page): Promise<boolean> {
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

async function dragMobileNavDrawerClosed(page: import('playwright').Page): Promise<boolean> {
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

async function clickMobileTab(page: import('playwright').Page, label: string): Promise<boolean> {
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

async function getMobileToolbarActionIds(page: import('playwright').Page): Promise<string[]> {
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
    expect(collapsed?.pointerCoarse).toBe(true)
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
  expect(await deepQuerySelector(page, '[data-action="mobile-command"]')).toBe(true)

  expect(await deepClick(page, '[data-action="mobile-command"]')).toBe(true)
  await page.waitForTimeout(120)
  const commandOpen = await page.evaluate(() => {
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
    const command = deepFind(document, 'command-bar') as HTMLElement | null
    return Boolean(command?.hasAttribute('open'))
  })
  expect(commandOpen).toBe(true)

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
  await page.goto(`${BASE_URL}?layout=mobile`)
  await page.waitForTimeout(900)

  await ensureToolbarMenuMode(page)
  expect(await getToolbarLeadingMode(page)).toBe('menu')

  expect(await clickMobileLeading(page)).toBe(true)
  await page.waitForTimeout(120)
  const sidebarOpenBeforeSelect = await isSidebarOpen(page)
  expect(sidebarOpenBeforeSelect).toBe(true)

  expect(await deepClickRailButton(page, 'Credentials')).toBe(true)
  await page.waitForTimeout(120)
  const sidebarOpenAfterSelect = await isSidebarOpen(page)
  expect(sidebarOpenAfterSelect).toBe(false)
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

test('global mobile toolbar hides local settings back-link and keeps menu behavior on settings', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 390, height: 844})
  await page.goto(`${BASE_URL}?layout=mobile`)
  await page.waitForTimeout(900)

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
    return Boolean(settings?.shadowRoot?.querySelector('.back-link'))
  })

  expect(hasLocalSettingsBack).toBe(false)
  expect(await getToolbarLeadingMode(page)).toBe('menu')
  expect(await deepClick(page, '[data-action="mobile-leading"]')).toBe(true)
  await page.waitForTimeout(180)
  const settingsOpen = await page.evaluate(async () => {
    const modulePath = '/shared/services/app-context.ts'
    const dynamicImport = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<typeof import('../../src/shared/services/app-context')>
    const {getAppContext} = await dynamicImport(modulePath)
    return Boolean(getAppContext().store.showSettingsPage())
  })
  expect(settingsOpen).toBe(true)
  expect(await isSidebarOpen(page)).toBe(true)
})
