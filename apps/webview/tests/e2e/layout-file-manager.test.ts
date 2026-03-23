import {expect, test} from 'vitest'

declare global {
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

type MobileActionPanelState = {
  exists: boolean
  layoutFabMode: boolean
  layoutSelectionMode: boolean
  toolbarDisplay: string | null
  hasTopFiltersSlotContent: boolean
  hasSelectionToolbar: boolean
  hasFiltersButton: boolean
  hasCreateButton: boolean
  hasUploadButton: boolean
  fabActionOrder: string[]
  fabLayerPosition: string | null
  actionsPosition: string | null
  fabLayerRect: {left: number; right: number; top: number; bottom: number; width: number; height: number} | null
  actionsRect: {left: number; right: number; top: number; bottom: number; width: number; height: number} | null
  viewportW: number
  viewportH: number
}

async function getMobileActionPanelState(page: import('playwright').Page): Promise<MobileActionPanelState> {
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

    const viewportW = window.innerWidth
    const viewportH = window.innerHeight
    const header = deepFind(document, 'dashboard-header') as HTMLElement | null
    if (!header?.shadowRoot) {
      return {
        exists: false,
        layoutFabMode: false,
        layoutSelectionMode: false,
        toolbarDisplay: null,
        hasTopFiltersSlotContent: false,
        hasSelectionToolbar: false,
        hasFiltersButton: false,
        hasCreateButton: false,
        hasUploadButton: false,
        fabActionOrder: [],
        fabLayerPosition: null,
        actionsPosition: null,
        fabLayerRect: null,
        actionsRect: null,
        viewportW,
        viewportH,
      }
    }

    const layout = header.shadowRoot.querySelector('dashboard-header-mobile-layout') as HTMLElement | null
    const toolbarRow = layout?.shadowRoot?.querySelector('.toolbar-row') as HTMLElement | null
    const actions = header.shadowRoot.querySelector('.actions-group-mobile') as HTMLElement | null
    const fabLayer = header.shadowRoot.querySelector('.mobile-fab-actions') as HTMLElement | null
    const selectionToolbar = header.shadowRoot.querySelector('.selection-toolbar') as HTMLElement | null
    const filtersBtn = header.shadowRoot.querySelector('[data-action="filters"]') as HTMLElement | null
    const createBtn = header.shadowRoot.querySelector('[data-action="create-dir"]') as HTMLElement | null
    const uploadBtn = header.shadowRoot.querySelector('[data-action="upload"]') as HTMLElement | null
    const topFiltersSlotContent = header.shadowRoot.querySelector('[slot="filters"]') as HTMLElement | null
    const fabActionOrder = Array.from(fabLayer?.children ?? [])
      .map((el) => el.getAttribute('data-action'))
      .filter((value): value is string => Boolean(value))
    const rect = actions?.getBoundingClientRect() ?? null
    const fabRect = fabLayer?.getBoundingClientRect() ?? null

    return {
      exists: true,
      layoutFabMode: layout?.hasAttribute('fab-mode') ?? false,
      layoutSelectionMode: layout?.hasAttribute('selection-mode') ?? false,
      toolbarDisplay: toolbarRow ? getComputedStyle(toolbarRow).display : null,
      hasTopFiltersSlotContent: Boolean(topFiltersSlotContent),
      hasSelectionToolbar: Boolean(selectionToolbar),
      hasFiltersButton: Boolean(filtersBtn),
      hasCreateButton: Boolean(createBtn),
      hasUploadButton: Boolean(uploadBtn),
      fabActionOrder,
      fabLayerPosition: fabLayer ? getComputedStyle(fabLayer).position : null,
      actionsPosition: actions ? getComputedStyle(actions).position : null,
      fabLayerRect: fabRect
        ? {
            left: fabRect.left,
            right: fabRect.right,
            top: fabRect.top,
            bottom: fabRect.bottom,
            width: fabRect.width,
            height: fabRect.height,
          }
        : null,
      actionsRect: rect
        ? {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          }
        : null,
      viewportW,
      viewportH,
    }
  })
}

type UploadPillState = {
  exists: boolean
  barVisible: boolean
  barRect: {left: number; right: number; top: number; bottom: number; width: number; height: number} | null
}

async function getUploadPillState(page: import('playwright').Page): Promise<UploadPillState> {
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

    const upload = deepFind(document, 'upload-progress-mobile') as HTMLElement | null
    const bar = upload?.shadowRoot?.querySelector('.minimized-bar') as HTMLElement | null
    const rect = bar?.getBoundingClientRect() ?? null

    return {
      exists: Boolean(upload),
      barVisible: Boolean(bar),
      barRect: rect
        ? {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          }
        : null,
    }
  })
}

async function waitForFileManager(page: import('playwright').Page): Promise<void> {
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
    const fm = deepFind(document, 'chromvoid-file-manager')
    return !!fm?.shadowRoot
  }, undefined, {timeout: 10_000})
  await page.waitForTimeout(500)
}

test('file manager renders mobile layout when layout=mobile', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto(`${BASE_URL}?layout=mobile`)
  await waitForFileManager(page)

  expect(await deepQuerySelector(page, 'file-manager-mobile-layout')).toBe(true)
  expect(await deepQuerySelector(page, 'file-manager-desktop-layout')).toBe(false)
})

test('file manager renders desktop layout when layout=desktop', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto(`${BASE_URL}?layout=desktop`)
  await waitForFileManager(page)

  expect(await deepQuerySelector(page, 'file-manager-desktop-layout')).toBe(true)
  expect(await deepQuerySelector(page, 'file-manager-mobile-layout')).toBe(false)
})

test('file list is visible in mobile layout', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto(`${BASE_URL}?layout=mobile`)
  await waitForFileManager(page)

  expect(await deepQuerySelector(page, 'file-manager-mobile-layout')).toBe(true)
  expect(await deepQuerySelector(page, 'dashboard-file-list')).toBe(true)
})

test('file list is visible in desktop layout', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto(`${BASE_URL}?layout=desktop`)
  await waitForFileManager(page)

  expect(await deepQuerySelector(page, 'file-manager-desktop-layout')).toBe(true)
  expect(await deepQuerySelector(page, 'dashboard-file-list')).toBe(true)
})

test('navigation works in both layouts', async () => {
  const page = globalThis.__E2E_PAGE__!

  for (const layout of ['mobile', 'desktop'] as const) {
    await page.goto(`${BASE_URL}?layout=${layout}`)
    await waitForFileManager(page)

    const hasBreadcrumbs = await deepQuerySelector(page, 'dashboard-header')
    expect(hasBreadcrumbs, `dashboard-header should exist in ${layout} layout`).toBe(true)
  }
})

test('mobile FAB actions are fixed in right-bottom thumb zone', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto(`${BASE_URL}?layout=mobile`)
  await waitForFileManager(page)

  const panel = await getMobileActionPanelState(page)
  expect(panel.exists).toBe(true)
  expect(panel.layoutFabMode).toBe(true)
  expect(panel.layoutSelectionMode).toBe(false)
  expect(panel.toolbarDisplay).toBe('none')
  expect(panel.hasTopFiltersSlotContent).toBe(false)
  expect(panel.hasFiltersButton).toBe(true)
  expect(panel.hasCreateButton).toBe(true)
  expect(panel.hasUploadButton).toBe(true)
  expect(panel.fabActionOrder).toEqual(['filters', 'create-dir', 'upload'])
  expect(panel.fabLayerPosition).toBe('fixed')
  expect(panel.hasSelectionToolbar).toBe(false)

  expect(panel.fabLayerRect).not.toBeNull()
  const rect = panel.fabLayerRect!
  expect(rect.right).toBeGreaterThan(panel.viewportW * 0.8)
  expect(rect.bottom).toBeGreaterThan(panel.viewportH * 0.72)
})

test('mobile selection mode hides FAB and keeps top selection toolbar', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto(`${BASE_URL}?layout=mobile`)
  await waitForFileManager(page)

  await page.evaluate(() => {
    ;(window as any).getAppContext()?.store?.setSelectionMode?.(true)
  })

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
    const header = deepFind(document, 'dashboard-header') as HTMLElement | null
    const layout = header?.shadowRoot?.querySelector('dashboard-header-mobile-layout')
    return Boolean(layout?.hasAttribute('selection-mode'))
  }, undefined, {timeout: 10_000})

  const panel = await getMobileActionPanelState(page)
  expect(panel.layoutSelectionMode).toBe(true)
  expect(panel.layoutFabMode).toBe(false)
  expect(panel.toolbarDisplay).not.toBe('none')
  expect(panel.hasSelectionToolbar).toBe(true)
  expect(panel.hasFiltersButton).toBe(false)
  expect(panel.hasCreateButton).toBe(false)
  expect(panel.hasUploadButton).toBe(false)
})

test('mobile FAB remains static and upload pill stays in left lane', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto(`${BASE_URL}?layout=mobile`)
  await waitForFileManager(page)

  const before = await getMobileActionPanelState(page)
  expect(before.fabLayerRect).not.toBeNull()

  const created = await page.evaluate(() => {
    const store = (window as any).getAppContext?.()?.store
    if (!store?.createTransferTask) return false
    store.createTransferTask({name: 'fab-static.bin', total: 1024, direction: 'upload'})
    return true
  })
  expect(created).toBe(true)

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
    const upload = deepFind(document, 'upload-progress-mobile') as HTMLElement | null
    const minimized = upload?.shadowRoot?.querySelector('.minimized-bar')
    return Boolean(minimized)
  }, undefined, {timeout: 10_000})

  const after = await getMobileActionPanelState(page)
  expect(await deepQuerySelector(page, 'upload-progress-mobile')).toBe(true)
  expect(after.fabLayerRect).not.toBeNull()
  expect(before.fabLayerRect).not.toBeNull()
  expect(Math.abs(after.fabLayerRect!.bottom - before.fabLayerRect!.bottom)).toBeLessThanOrEqual(1.5)
  expect(Math.abs(after.fabLayerRect!.right - before.fabLayerRect!.right)).toBeLessThanOrEqual(1.5)

  const pill = await getUploadPillState(page)
  expect(pill.exists).toBe(true)
  expect(pill.barVisible).toBe(true)
  expect(pill.barRect).not.toBeNull()
  expect(pill.barRect!.right).toBeLessThan(after.fabLayerRect!.left - 6)
})

test('mobile upload pill auto-hides after successful completion', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto(`${BASE_URL}?layout=mobile`)
  await waitForFileManager(page)

  const created = await page.evaluate(() => {
    const store = (window as any).getAppContext?.()?.store
    if (!store?.createTransferTask || !store?.updateUploadTask) return false
    const {id} = store.createTransferTask({name: 'done-hide.bin', total: 1024, direction: 'upload'})
    store.updateUploadTask(id, {loaded: 1024, status: 'done'})
    return true
  })
  expect(created).toBe(true)
  expect(await deepQuerySelector(page, 'upload-progress-mobile')).toBe(true)

  await page.waitForFunction(() => {
    const store = (window as any).getAppContext?.()?.store
    return Boolean(store?.uploadTasks) && store.uploadTasks().length === 0
  }, undefined, {timeout: 10_000})

  expect(await deepQuerySelector(page, 'upload-progress-mobile')).toBe(false)
})

test('mobile upload pill is not auto-hidden when transfer fails', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto(`${BASE_URL}?layout=mobile`)
  await waitForFileManager(page)

  const created = await page.evaluate(() => {
    const store = (window as any).getAppContext?.()?.store
    if (!store?.createTransferTask || !store?.updateUploadTask) return false
    const {id} = store.createTransferTask({name: 'failed-keep.bin', total: 1024, direction: 'upload'})
    store.updateUploadTask(id, {status: 'error'})
    return true
  })
  expect(created).toBe(true)
  expect(await deepQuerySelector(page, 'upload-progress-mobile')).toBe(true)

  await page.waitForTimeout(4500)

  const remaining = await page.evaluate(() => {
    const store = (window as any).getAppContext?.()?.store
    if (!store?.uploadTasks) return -1
    return store.uploadTasks().length
  })
  expect(remaining).toBeGreaterThan(0)
  expect(await deepQuerySelector(page, 'upload-progress-mobile')).toBe(true)
})
