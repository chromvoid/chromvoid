import {expect, test} from 'vitest'

import type {Page} from 'playwright'
import type * as AppContextModule from '../../src/shared/services/app-context'

declare global {
  var __E2E_PAGE__: Page | undefined
}

function getPage(ctx: {skip: () => void}): Page | undefined {
  const page = globalThis.__E2E_PAGE__
  if (!page) ctx.skip()
  return page
}

async function openMobileFirstRun(page: Page, viewport: {width: number; height: number}) {
  await page.setViewportSize(viewport)
  await page.goto('http://localhost:4400/index.html?preview=welcome&layout=mobile', {
    waitUntil: 'domcontentloaded',
  })

  await page.waitForFunction(() => {
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

    return Boolean(deepFind(document, 'welcome-page-mobile-layout'))
  })

  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule

    getAppContext().state.update({NeedUserInitialization: true, StorageOpened: false})
    document.documentElement.style.setProperty('--app-runtime-safe-area-block-end-native', '24px')
  })

  await page.waitForFunction(() => {
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

    const layout = deepFind(document, 'welcome-page-mobile-layout') as HTMLElement | null
    return Boolean(layout?.shadowRoot?.querySelector('.first-run-card'))
  })

  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

async function readFirstRunGeometry(page: Page) {
  return page.evaluate(() => {
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

    const route = deepFind(document, 'chromvoid-app') as HTMLElement | null
    const layout = deepFind(document, 'welcome-page-mobile-layout') as HTMLElement | null
    const container = layout?.shadowRoot?.querySelector<HTMLElement>('.container')
    const tools = layout?.shadowRoot?.querySelector<HTMLElement>('welcome-tools-section')
    const button = tools?.shadowRoot?.querySelector<HTMLElement>('.mobile-utilities-button')
    if (!route || !container || !button) throw new Error('First-run layout geometry is unavailable')

    const routeRect = route.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()

    return {
      buttonBottom: buttonRect.bottom,
      buttonTop: buttonRect.top,
      containerBottom: containerRect.bottom,
      footerClearance: containerRect.bottom - buttonRect.bottom,
      routeClientHeight: route.clientHeight,
      routeScrollHeight: route.scrollHeight,
      routeTop: routeRect.top,
      viewportHeight: window.innerHeight,
    }
  })
}

test.each([
  {height: 844, width: 390},
  {height: 640, width: 360},
])('mobile first-run keeps Device utilities visible at $width×$height', async (viewport, ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await openMobileFirstRun(page, viewport)
  const geometry = await readFirstRunGeometry(page)

  expect(geometry.routeScrollHeight).toBeLessThanOrEqual(geometry.routeClientHeight + 1)
  expect(geometry.buttonTop).toBeGreaterThanOrEqual(geometry.routeTop)
  expect(geometry.buttonBottom).toBeLessThanOrEqual(geometry.viewportHeight)
  expect(geometry.footerClearance).toBeGreaterThanOrEqual(40)
})
