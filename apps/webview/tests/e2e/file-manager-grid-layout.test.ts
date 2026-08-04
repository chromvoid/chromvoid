import {expect, test} from 'vitest'

import type {Page} from 'playwright'

import {
  hasHorizontalOverflow,
  openFiles,
  seedVisualFilesGridFixture,
  selectFileGridItem,
  setFilesViewMode,
} from './visual-fixtures'

declare global {
  var __E2E_PAGE__: Page | undefined
}

type GridGeometry = {
  columns: number
  cardHeights: number[]
  actionCount: number
  fileTypeCount: number
  interactiveIndicatorCount: number
}

async function readGridGeometry(page: Page): Promise<GridGeometry> {
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

    const list = deepFind(document, 'virtual-file-list') as HTMLElement | null
    const grid = list?.shadowRoot?.querySelector<HTMLElement>('.grid-view')
    if (!grid) throw new Error('file grid was not rendered')

    const hosts = Array.from(
      grid.querySelectorAll<HTMLElement>(
        'file-item-desktop[view-mode="grid"], file-item-mobile[view-mode="grid"]',
      ),
    )
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length

    return {
      columns,
      cardHeights: hosts
        .slice(0, Math.max(columns * 2, 2))
        .map((host) => host.getBoundingClientRect().height),
      actionCount: hosts.reduce(
        (count, host) => count + (host.shadowRoot?.querySelectorAll('.actions').length ?? 0),
        0,
      ),
      fileTypeCount: hosts.reduce(
        (count, host) => count + (host.shadowRoot?.querySelectorAll('.file-type').length ?? 0),
        0,
      ),
      interactiveIndicatorCount: hosts.reduce(
        (count, host) =>
          count + (host.shadowRoot?.querySelectorAll('button.selection-indicator').length ?? 0),
        0,
      ),
    }
  })
}

test('desktop file grid uses uniform preview-first cards without inline controls', async () => {
  const page = globalThis.__E2E_PAGE__!
  await seedVisualFilesGridFixture()
  await openFiles(page, 'desktop')
  await setFilesViewMode(page, 'grid')

  const geometry = await readGridGeometry(page)

  expect(geometry.columns).toBeGreaterThanOrEqual(4)
  expect(geometry.cardHeights.length).toBeGreaterThanOrEqual(4)
  geometry.cardHeights.forEach((height) => expect(height).toBeCloseTo(208, 0))
  expect(geometry.actionCount).toBe(0)
  expect(geometry.fileTypeCount).toBe(0)
  expect(geometry.interactiveIndicatorCount).toBe(0)
  expect(await hasHorizontalOverflow(page, 'file-manager-desktop-layout')).toBe(false)
})

test.each([
  {width: 320, expectedColumns: 2, expectedCardHeight: 184},
  {width: 390, expectedColumns: 2, expectedCardHeight: 184},
  {width: 600, expectedColumns: 3, expectedCardHeight: 208},
  {width: 900, expectedColumns: 4, expectedCardHeight: 208},
])(
  'mobile file grid adapts at $width px without stretching cards',
  async ({width, expectedColumns, expectedCardHeight}) => {
    const page = globalThis.__E2E_PAGE__!
    await seedVisualFilesGridFixture()
    await openFiles(page, 'mobile', width)
    await setFilesViewMode(page, 'grid')

    const geometry = await readGridGeometry(page)

    expect(geometry.columns).toBe(expectedColumns)
    geometry.cardHeights.forEach((height) => expect(height).toBeCloseTo(expectedCardHeight, 0))
    expect(geometry.actionCount).toBe(0)
    expect(geometry.fileTypeCount).toBe(0)
    expect(geometry.interactiveIndicatorCount).toBe(0)
    expect(await hasHorizontalOverflow(page, 'file-manager-mobile-layout')).toBe(false)
  },
)

test('grid selection mode keeps indicators visual and delegates selection to the card', async () => {
  const page = globalThis.__E2E_PAGE__!
  await seedVisualFilesGridFixture()
  await openFiles(page, 'desktop')
  await setFilesViewMode(page, 'grid')
  await selectFileGridItem(page, 1)

  const state = await page.evaluate(async () => {
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

    const list = deepFind(document, 'virtual-file-list') as HTMLElement | null
    const hosts = Array.from(
      list?.shadowRoot?.querySelectorAll<HTMLElement>('file-item-desktop[view-mode="grid"]') ?? [],
    )
    const nextHost = hosts[2]
    nextHost?.shadowRoot?.querySelector<HTMLElement>('.file-item')?.click()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    return {
      visibleIndicators: hosts.filter((host) => host.shadowRoot?.querySelector('.selection-indicator'))
        .length,
      interactiveIndicators: hosts.filter((host) =>
        host.shadowRoot?.querySelector('button.selection-indicator'),
      ).length,
      selectedCount: hosts.filter((host) => host.getAttribute('aria-selected') === 'true').length,
      cardCount: hosts.length,
    }
  })

  expect(state.visibleIndicators).toBe(state.cardCount)
  expect(state.interactiveIndicators).toBe(0)
  expect(state.selectedCount).toBe(2)
})

test('grid virtualization updates the mounted window after scrolling', async () => {
  const page = globalThis.__E2E_PAGE__!
  await seedVisualFilesGridFixture(48)
  await openFiles(page, 'mobile', 390)
  await setFilesViewMode(page, 'grid')

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

    const list = deepFind(document, 'virtual-file-list') as HTMLElement | null
    const root = list?.shadowRoot
    const container = root?.querySelector<HTMLElement>('.list-container')
    const spacer = root?.querySelector<HTMLElement>('.grid-virtual-spacer')
    return Boolean(
      container &&
      spacer &&
      Number(spacer.dataset['totalHeight'] ?? 0) > container.clientHeight &&
      container.scrollHeight > container.clientHeight,
    )
  })

  const initialFirstId = await page.evaluate(() => {
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

    const list = deepFind(document, 'virtual-file-list') as HTMLElement | null
    const container = list?.shadowRoot?.querySelector<HTMLElement>('.list-container')
    const firstHost = list?.shadowRoot?.querySelector<HTMLElement>('file-item-mobile[view-mode="grid"]')
    if (!container || !firstHost) throw new Error('scrollable file grid was not rendered')
    container.scrollTop = Math.min(220 * 8, container.scrollHeight - container.clientHeight - 1)
    container.dispatchEvent(new Event('scroll'))
    return firstHost.dataset['id'] ?? null
  })

  await page.waitForFunction((previousId) => {
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

    const list = deepFind(document, 'virtual-file-list') as HTMLElement | null
    const root = list?.shadowRoot
    const container = root?.querySelector<HTMLElement>('.list-container')
    const window = root?.querySelector<HTMLElement>('.grid-virtual-window')
    const firstHost = root?.querySelector<HTMLElement>('file-item-mobile[view-mode="grid"]')
    return Boolean(
      container &&
      container.scrollTop > 0 &&
      Number(window?.dataset['offsetY'] ?? 0) > 0 &&
      firstHost &&
      firstHost.dataset['id'] !== previousId,
    )
  }, initialFirstId)

  const result = await page.evaluate(() => {
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

    const list = deepFind(document, 'virtual-file-list') as HTMLElement | null
    const root = list?.shadowRoot
    const container = root?.querySelector<HTMLElement>('.list-container')
    const spacer = root?.querySelector<HTMLElement>('.grid-virtual-spacer')
    const window = root?.querySelector<HTMLElement>('.grid-virtual-window')
    const firstHost = root?.querySelector<HTMLElement>('file-item-mobile[view-mode="grid"]')
    return {
      firstId: firstHost?.dataset['id'] ?? null,
      scrollTop: container?.scrollTop ?? 0,
      viewportHeight: container?.clientHeight ?? 0,
      totalHeight: Number(spacer?.dataset['totalHeight'] ?? 0),
      offsetY: Number(window?.dataset['offsetY'] ?? 0),
    }
  })

  expect(result.scrollTop).toBeGreaterThan(0)
  expect(result.totalHeight).toBeGreaterThan(result.viewportHeight)
  expect(result.offsetY).toBeGreaterThan(0)
  expect(result.firstId).not.toBe(initialFirstId)
})
