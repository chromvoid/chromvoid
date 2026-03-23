import {expect, test} from 'vitest'
import fs from 'fs'
import path from 'path'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

const BASE_URL = 'http://localhost:4400/index.html'
const EVIDENCE_DIR = path.resolve(__dirname, '../../../../.artifacts/evidence')
fs.mkdirSync(EVIDENCE_DIR, {recursive: true})

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

    const rail = deepFind(document, 'navigation-rail') as HTMLElement | null
    const root = rail?.shadowRoot
    if (!root) return false

    const buttons = Array.from(root.querySelectorAll('button'))
    const target = buttons.find((btn) =>
      (btn.textContent || '').replace(/\s+/g, ' ').trim().startsWith(targetLabel),
    ) as HTMLElement | undefined

    if (!target) return false
    target.click()
    return true
  }, label)
}

async function ensureToolbarMenuMode(page: import('playwright').Page): Promise<void> {
  await page.evaluate(() => {
    const store = (window as any).getAppContext().store
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

  await page.screenshot({path: path.join(EVIDENCE_DIR, 'layout-force-mobile.png'), fullPage: true})
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

  await page.screenshot({path: path.join(EVIDENCE_DIR, 'layout-force-desktop.png'), fullPage: true})
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

  expect(await deepClickRailButton(page, 'Passwords')).toBe(true)
  await page.waitForTimeout(120)
  const sidebarOpenAfterSelect = await isSidebarOpen(page)
  expect(sidebarOpenAfterSelect).toBe(false)
})

test('global mobile toolbar hides local settings back-link and handles back navigation', async () => {
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
  expect(await deepClick(page, '[data-action="mobile-leading"]')).toBe(true)
  await page.waitForTimeout(180)

  const settingsOpen = await page.evaluate(() =>
    Boolean((window as any).getAppContext().store.showSettingsPage()),
  )
  expect(settingsOpen).toBe(false)
})
