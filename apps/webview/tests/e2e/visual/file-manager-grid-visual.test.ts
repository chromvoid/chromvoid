import {expect, test} from 'vitest'

import type {Page} from 'playwright'

import {
  hasHorizontalOverflow,
  installFixedVisualClock,
  openFiles,
  seedVisualFilesGridFixture,
  selectFileGridItem,
  setFilesViewMode,
} from '../visual-fixtures'
import {assertVisualSnapshot} from '../visual-snapshot'

declare global {
  var __E2E_PAGE__: Page | undefined
}

function getPage(ctx: {skip: () => void}): Page | undefined {
  const page = globalThis.__E2E_PAGE__
  if (!page) ctx.skip()
  return page
}

async function setRootTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((nextTheme) => {
    document.documentElement.setAttribute('data-theme', nextTheme)
    document.documentElement.setAttribute('theme', nextTheme)
  }, theme)
}

async function waitForGridCards(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    function deepCollect(root: Document | ShadowRoot, selector: string, acc: Element[] = []): Element[] {
      acc.push(...root.querySelectorAll(selector))
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) deepCollect(element.shadowRoot, selector, acc)
      }
      return acc
    }

    return (
      deepCollect(document, 'file-item-desktop[view-mode="grid"], file-item-mobile[view-mode="grid"]')
        .length >= 8
    )
  })
}

async function focusSelectedGridCard(page: Page): Promise<void> {
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

    const selectedCard = deepFind(document, '[view-mode="grid"][selected]') as HTMLElement | null
    selectedCard?.focus()
  })
}

test('visual: desktop preview-first file grid', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualFilesGridFixture()
  await openFiles(page, 'desktop')
  await setFilesViewMode(page, 'grid')
  await waitForGridCards(page)

  expect(await hasHorizontalOverflow(page, 'file-manager-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-light-1280', {
    suite: 'file-manager-grid',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: constrained desktop file grid selection in dark theme', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualFilesGridFixture()
  await openFiles(page, 'desktop')
  await page.setViewportSize({width: 960, height: 720})
  await setRootTheme(page, 'dark')
  await setFilesViewMode(page, 'grid')
  await selectFileGridItem(page, 2)
  await focusSelectedGridCard(page)
  await waitForGridCards(page)

  expect(await hasHorizontalOverflow(page, 'file-manager-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-dark-selection-960', {
    suite: 'file-manager-grid',
    viewport: {width: 960, height: 720},
  })
})

test('visual: mobile preview-first file grid', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualFilesGridFixture()
  await openFiles(page, 'mobile', 390)
  await setFilesViewMode(page, 'grid')
  await waitForGridCards(page)

  expect(await hasHorizontalOverflow(page, 'file-manager-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-light-390', {
    suite: 'file-manager-grid',
    viewport: {width: 390, height: 844},
  })
})

test('visual: mobile RTL file grid selection in dark theme', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await page.addInitScript(() => localStorage.setItem('current-lang', 'ar'))
  await seedVisualFilesGridFixture()
  await openFiles(page, 'mobile', 360)
  await setRootTheme(page, 'dark')
  await setFilesViewMode(page, 'grid')
  await selectFileGridItem(page, 0)
  await waitForGridCards(page)

  await expect(
    page.evaluate(() => ({direction: document.documentElement.dir, language: document.documentElement.lang})),
  ).resolves.toEqual({direction: 'rtl', language: 'ar'})
  expect(await hasHorizontalOverflow(page, 'file-manager-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-rtl-dark-selection-360', {
    suite: 'file-manager-grid',
    viewport: {width: 360, height: 800},
  })
})
