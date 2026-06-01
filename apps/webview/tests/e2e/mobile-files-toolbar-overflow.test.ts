import {expect, test} from 'vitest'

declare global {
  var __E2E_BROWSER__: import('playwright').Browser | undefined
}

const BASE_URL = 'http://localhost:4400/index.html'

test('mobile Files toolbar overflow item executes from touch coordinates', async () => {
  const browser = globalThis.__E2E_BROWSER__!
  const context = await browser.newContext({
    viewport: {width: 390, height: 844},
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()

  try {
    await page.goto(`${BASE_URL}?surface=files&path=%2F&layout=mobile`, {
      waitUntil: 'domcontentloaded',
    })

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

        return (
          !document.documentElement.hasAttribute('loading') &&
          !document.body.hasAttribute('loading') &&
          Boolean(deepFind(document, 'mobile-top-toolbar')) &&
          Boolean(deepFind(document, 'dashboard-file-list'))
        )
      },
      undefined,
      {timeout: 15_000},
    )

    const folderName = `touch-overflow-${Date.now()}`
    await page.evaluate((nextName) => {
      ;(window as any).dialogService.showCreateFolderDialog = async () => nextName
    }, folderName)

    const triggerCenter = await page.evaluate(() => {
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
      const menu = toolbar?.shadowRoot?.querySelector('cv-menu-button.overflow-menu') as HTMLElement | null
      const trigger = menu?.shadowRoot?.querySelector('[part="trigger"]') as HTMLElement | null
      if (!trigger) return null

      const rect = trigger.getBoundingClientRect()
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
      }
    })

    expect(triggerCenter).not.toBeNull()
    await page.touchscreen.tap(triggerCenter!.x, triggerCenter!.y)

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

        const toolbar = deepFind(document, 'mobile-top-toolbar') as HTMLElement | null
        const menu = toolbar?.shadowRoot?.querySelector('cv-menu-button.overflow-menu') as
          | (HTMLElement & {open?: boolean})
          | null
        return Boolean(menu?.open)
      },
      undefined,
      {timeout: 3_000},
    )

    const itemCenter = await page.evaluate(() => {
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

      const portalItem = document.querySelector(
        '[data-cv-menu-button-portal] cv-menu-item[value="create-dir"]',
      ) as HTMLElement | null
      const toolbar = deepFind(document, 'mobile-top-toolbar') as HTMLElement | null
      const fallbackItem = toolbar?.shadowRoot
        ?.querySelector('cv-menu-button.overflow-menu')
        ?.querySelector('cv-menu-item[value="create-dir"]') as HTMLElement | null
      const item = portalItem ?? fallbackItem
      if (!item) return null

      const rect = item.getBoundingClientRect()
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
      }
    })

    expect(itemCenter).not.toBeNull()
    await page.touchscreen.tap(itemCenter!.x, itemCenter!.y)

    await page.waitForFunction(
      async (name) => {
        const dynamicImport = new Function('path', 'return import(path)') as (
          path: string,
        ) => Promise<typeof import('../../src/shared/services/app-context')>
        const {getAppContext} = await dynamicImport('/shared/services/app-context.ts')
        const children = getAppContext().catalog.catalog.getChildren('/')
        return Array.isArray(children) && children.some((node) => node?.name === name)
      },
      folderName,
      {timeout: 8_000},
    )
  } finally {
    await context.close()
  }
})
