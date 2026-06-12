import {expect, test} from 'vitest'

import {
  installFixedVisualClock,
  openFiles,
  openNotes,
  openPasswords,
  seedVisualFilesFixture,
  seedVisualNotesFixture,
  seedVisualPassmanagerFixture,
  waitForDeepSelector,
  waitForOtpRows,
} from './visual-fixtures'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

type BottomTabSurface = 'files' | 'notes' | 'passwords' | 'otp'

type ElementLayoutState = {
  exists: boolean
  overflowY: string | null
  scrollDelta: number | null
  hasHorizontalOverflow: boolean | null
  rect: {
    top: number
    bottom: number
    height: number
  } | null
}

type BottomTabLayoutSnapshot = {
  shellContentMode: string | null
  tabBar: ElementLayoutState
  document: ElementLayoutState
  app: ElementLayoutState
  routeFrame: ElementLayoutState
  shellContent: ElementLayoutState
  surfaceHost: ElementLayoutState
  surfaceScroller: ElementLayoutState
  surfaceScrollerTabOverlap: number | null
}

function getPage(ctx: {skip: () => void}): import('playwright').Page | undefined {
  const page = globalThis.__E2E_PAGE__
  if (!page) {
    ctx.skip()
  }
  return page
}

async function readBottomTabLayout(
  page: import('playwright').Page,
  surface: BottomTabSurface,
): Promise<BottomTabLayoutSnapshot> {
  return page.evaluate((targetSurface) => {
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

    function readElement(element: Element | null): ElementLayoutState {
      if (!(element instanceof HTMLElement)) {
        return {
          exists: false,
          overflowY: null,
          scrollDelta: null,
          hasHorizontalOverflow: null,
          rect: null,
        }
      }

      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return {
        exists: true,
        overflowY: style.overflowY,
        scrollDelta: element.scrollHeight - element.clientHeight,
        hasHorizontalOverflow: element.scrollWidth > element.clientWidth + 1,
        rect: {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
        },
      }
    }

    function getSurfaceHost(): HTMLElement | null {
      switch (targetSurface) {
        case 'files':
          return deepFind(document, 'file-manager-mobile-layout') as HTMLElement | null
        case 'notes':
          return deepFind(document, 'notes-quick-view-mobile') as HTMLElement | null
        case 'passwords':
          return deepFind(document, 'password-manager-mobile-layout') as HTMLElement | null
        case 'otp':
          return deepFind(document, 'pm-otp-quick-view-mobile') as HTMLElement | null
      }
    }

    function getSurfaceScroller(): HTMLElement | null {
      if (targetSurface === 'files') {
        const list = deepFind(document, 'virtual-file-list') as HTMLElement | null
        return list?.shadowRoot?.querySelector('.list-container') as HTMLElement | null
      }

      const host = getSurfaceHost()
      if (!host?.shadowRoot) return null
      const surfaceLayout = host.shadowRoot.querySelector('mobile-surface-layout') as HTMLElement | null
      return surfaceLayout?.shadowRoot?.querySelector('[part~="scroll"]') as HTMLElement | null
    }

    const shell = deepFind(document, 'file-app-shell-mobile-layout') as HTMLElement | null
    const shellContent = shell?.shadowRoot?.querySelector('.content') ?? null
    const tabBar = deepFind(document, 'mobile-tab-bar') as HTMLElement | null
    const surfaceScrollerState = readElement(getSurfaceScroller())
    const tabBarState = readElement(tabBar)
    const surfaceScrollerTabOverlap =
      surfaceScrollerState.rect && tabBarState.rect
        ? surfaceScrollerState.rect.bottom - tabBarState.rect.top
        : null

    return {
      shellContentMode: shell?.getAttribute('content-scroll-mode') ?? null,
      tabBar: tabBarState,
      document: readElement(document.scrollingElement),
      app: readElement(deepFind(document, 'chromvoid-app')),
      routeFrame: readElement(deepFind(document, '.route-content[data-route="dashboard"]')),
      shellContent: readElement(shellContent),
      surfaceHost: readElement(getSurfaceHost()),
      surfaceScroller: surfaceScrollerState,
      surfaceScrollerTabOverlap,
    }
  }, surface)
}

function expectBottomTabLayout(snapshot: BottomTabLayoutSnapshot): void {
  expect(snapshot.shellContentMode).toBe('surface')
  expect(snapshot.tabBar.exists).toBe(true)
  expect(snapshot.surfaceHost.exists).toBe(true)
  expect(snapshot.surfaceScroller.exists).toBe(true)
  expect(snapshot.surfaceHost.hasHorizontalOverflow).toBe(false)
  expect(snapshot.surfaceScrollerTabOverlap ?? Number.NEGATIVE_INFINITY).toBeLessThanOrEqual(1)

  expect(snapshot.document.scrollDelta ?? 0).toBeLessThanOrEqual(1)
  expect(snapshot.app.scrollDelta ?? 0).toBeLessThanOrEqual(1)
  expect(snapshot.routeFrame.scrollDelta ?? 0).toBeLessThanOrEqual(1)
  expect(snapshot.shellContent.scrollDelta ?? 0).toBeLessThanOrEqual(1)
}

test('mobile Files uses surface-owned bottom-tab layout', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualFilesFixture()
  await openFiles(page, 'mobile', 390)

  expectBottomTabLayout(await readBottomTabLayout(page, 'files'))
})

test('mobile Notes uses surface-owned bottom-tab layout', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualNotesFixture()
  await openNotes(page, 'mobile', 390)

  expectBottomTabLayout(await readBottomTabLayout(page, 'notes'))
})

test('mobile Passwords uses surface-owned bottom-tab layout', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 390)
  await waitForDeepSelector(page, 'password-manager-mobile-layout')
  await waitForDeepSelector(page, 'pm-group-mobile')

  expectBottomTabLayout(await readBottomTabLayout(page, 'passwords'))
})

test('mobile OTP uses surface-owned bottom-tab layout', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', 'otp', 390)
  await waitForOtpRows(page, 3)

  expectBottomTabLayout(await readBottomTabLayout(page, 'otp'))
})
