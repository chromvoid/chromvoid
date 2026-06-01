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

type TransferTaskParams = {name: string; total: number; direction: 'upload' | 'download'}
type TransferTaskUpdates = {
  loaded?: number
  total?: number
  speed?: number
  eta?: number
  status?: 'queued' | 'uploading' | 'done' | 'error' | 'paused'
}

async function createTransferTask(
  page: import('playwright').Page,
  params: TransferTaskParams,
  updates?: TransferTaskUpdates,
): Promise<boolean> {
  return page.evaluate(
    async ({nextParams, nextUpdates}) => {
      const modulePath = '/shared/services/app-context.ts'
      const dynamicImport = new Function('path', 'return import(path)') as (
        path: string,
      ) => Promise<typeof import('../../src/shared/services/app-context')>
      const {getAppContext} = await dynamicImport(modulePath)
      const store = getAppContext().store
      if (!store?.createTransferTask) return false
      const {id} = store.createTransferTask(nextParams)
      if (nextUpdates) {
        store.updateUploadTask(id, nextUpdates)
      }
      return true
    },
    {nextParams: params, nextUpdates: updates},
  )
}

async function seedScrollableFilesFixture(count = 80): Promise<void> {
  const now = Date.now()
  const ids = Array.from({length: count}, (_, index) => index + 1)
  const nodes = [
    [
      0,
      {
        id: 0,
        type: 0,
        name: '/',
        size: 0,
        modtime: now,
        parentId: null,
        children: ids,
      },
    ],
    ...ids.map((id) => [
      id,
      {
        id,
        type: 1,
        name: `scroll-fixture-${String(id).padStart(2, '0')}.md`,
        size: id * 128,
        modtime: now - id * 1000,
        parentId: 0,
        children: [],
        mimeType: 'text/markdown',
      },
    ]),
  ]

  await fetch(new URL('/api/mock-state', BASE_URL).toString(), {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      version: 1,
      nextId: count + 1,
      nodes,
      files: [],
      secrets: [],
      otpSecrets: [],
    }),
  })
}

type MobileActionPanelState = {
  exists: boolean
  layoutSelectionMode: boolean
  toolbarDisplay: string | null
  hasSelectionToolbar: boolean
  hasCreateButton: boolean
  hasUploadButton: boolean
  topToolbarActionIds: string[]
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
        layoutSelectionMode: false,
        toolbarDisplay: null,
        hasSelectionToolbar: false,
        hasCreateButton: false,
        hasUploadButton: false,
        topToolbarActionIds: [],
        viewportW,
        viewportH,
      }
    }

    const layout = header.shadowRoot.querySelector('dashboard-header-mobile-layout') as HTMLElement | null
    const toolbarRow = layout?.shadowRoot?.querySelector('.toolbar-row') as HTMLElement | null
    const selectionToolbar = header.shadowRoot.querySelector('.selection-toolbar') as HTMLElement | null
    const createBtn = header.shadowRoot.querySelector('[data-action="create-dir"]') as HTMLElement | null
    const uploadBtn = header.shadowRoot.querySelector('[data-action="upload"]') as HTMLElement | null
    const topToolbar = deepFind(document, 'mobile-top-toolbar') as
      | (HTMLElement & {actions?: Array<{id?: string}>})
      | null
    const topToolbarActionIds = Array.isArray(topToolbar?.actions)
      ? topToolbar.actions.map((action) => action.id).filter((id): id is string => typeof id === 'string')
      : []

    return {
      exists: true,
      layoutSelectionMode: layout?.hasAttribute('selection-mode') ?? false,
      toolbarDisplay: toolbarRow ? getComputedStyle(toolbarRow).display : null,
      hasSelectionToolbar: Boolean(selectionToolbar),
      hasCreateButton: Boolean(createBtn),
      hasUploadButton: Boolean(uploadBtn),
      topToolbarActionIds,
      viewportW,
      viewportH,
    }
  })
}

type RectState = {left: number; right: number; top: number; bottom: number; width: number; height: number}

type UploadPillState = {
  exists: boolean
  barVisible: boolean
  hostPosition: string | null
  barPosition: string | null
  barTone: string | null
  barBorderLeftWidth: string | null
  barBorderRightWidth: string | null
  barBorderRadius: string | null
  hostRect: RectState | null
  barRect: RectState | null
  statusBarRect: RectState | null
  tabBarRect: RectState | null
  viewportW: number
  viewportH: number
}

type UploadSheetState = {
  sheetOpen: boolean
  bodyDisplay: string | null
  headerRect: RectState | null
  tasksRect: RectState | null
  footerRect: RectState | null
  viewportW: number
  viewportH: number
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
    const fileList = deepFind(document, 'virtual-file-list') as HTMLElement | null
    const statusBar = fileList?.shadowRoot?.querySelector('.status-bar') as HTMLElement | null
    const tabBar = deepFind(document, 'mobile-tab-bar') as HTMLElement | null
    const rect = bar?.getBoundingClientRect() ?? null
    const statusRect = statusBar?.getBoundingClientRect() ?? null
    const tabRect = tabBar?.getBoundingClientRect() ?? null
    const serialize = (value: DOMRect | null) =>
      value
        ? {
            left: value.left,
            right: value.right,
            top: value.top,
            bottom: value.bottom,
            width: value.width,
            height: value.height,
          }
        : null

    return {
      exists: Boolean(upload),
      barVisible: Boolean(bar),
      hostPosition: upload ? getComputedStyle(upload).position : null,
      barPosition: bar ? getComputedStyle(bar).position : null,
      barTone: bar?.getAttribute('data-tone') ?? null,
      barBorderLeftWidth: bar ? getComputedStyle(bar).borderLeftWidth : null,
      barBorderRightWidth: bar ? getComputedStyle(bar).borderRightWidth : null,
      barBorderRadius: bar ? getComputedStyle(bar).borderTopLeftRadius : null,
      hostRect: serialize(upload?.getBoundingClientRect() ?? null),
      barRect: serialize(rect),
      statusBarRect: serialize(statusRect),
      tabBarRect: serialize(tabRect),
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
    }
  })
}

async function getUploadSheetState(page: import('playwright').Page): Promise<UploadSheetState> {
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

    const serialize = (element: Element | null) => {
      const rect = element?.getBoundingClientRect() ?? null
      return rect
        ? {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          }
        : null
    }

    const upload = deepFind(document, 'upload-progress-mobile') as HTMLElement | null
    const root = upload?.shadowRoot ?? null
    const sheet = root?.querySelector('cv-bottom-sheet') as HTMLElement | null
    const dialog = sheet?.shadowRoot?.querySelector('cv-dialog') as HTMLElement | null
    const body = dialog?.shadowRoot?.querySelector('[part="body"]') as HTMLElement | null

    return {
      sheetOpen: Boolean(sheet?.hasAttribute('open')),
      bodyDisplay: body ? getComputedStyle(body).display : null,
      headerRect: serialize(root?.querySelector('.sheet-header') ?? null),
      tasksRect: serialize(root?.querySelector('.tasks-container') ?? null),
      footerRect: serialize(root?.querySelector('.sheet-footer') ?? null),
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
    }
  })
}

async function hasVisibleMobileSwipeShell(page: import('playwright').Page): Promise<boolean> {
  return page.evaluate(() => {
    function deepCollect(root: Document | ShadowRoot, selector: string, acc: Element[] = []): Element[] {
      for (const el of root.querySelectorAll(selector)) {
        acc.push(el)
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          deepCollect(el.shadowRoot, selector, acc)
        }
      }
      return acc
    }

    return deepCollect(document, 'file-item-mobile').some((host) => {
      const swipeContainer = host.shadowRoot?.querySelector('.swipe-container')
      const rect = host.getBoundingClientRect()
      return Boolean(swipeContainer) && rect.width > 0 && rect.height > 0
    })
  })
}

type MobileSelectionScrollStart = {
  ok: boolean
  reason: string | null
  beforeScrollTop: number
  maxScrollTop: number
  selectedItemId: string | null
  beforeScrollOwners: MobileScrollOwnerSnapshot
}

type MobileSelectionScrollResult = {
  afterScrollTop: number
  topToolbarActionIds: string[]
  afterScrollOwners: MobileScrollOwnerSnapshot
}

type ScrollOwnerState = {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  overflowY: string
}

type MobileScrollOwnerSnapshot = {
  listContainer: ScrollOwnerState | null
  shellContent: ScrollOwnerState | null
  appRoute: ScrollOwnerState | null
  document: ScrollOwnerState | null
  shellContentMode: string | null
}

async function startMobileSelectionFromScrolledRow(
  page: import('playwright').Page,
): Promise<MobileSelectionScrollStart> {
  return page.evaluate(async () => {
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

    function readScrollOwner(element: Element | null): ScrollOwnerState | null {
      if (!(element instanceof HTMLElement)) return null
      const style = getComputedStyle(element)
      return {
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflowY: style.overflowY,
      }
    }

    function readScrollOwners(): MobileScrollOwnerSnapshot {
      const shell = deepFind(document, 'file-app-shell-mobile-layout') as HTMLElement | null
      const list = deepFind(document, 'virtual-file-list') as HTMLElement | null
      const container = list?.shadowRoot?.querySelector('.list-container') ?? null
      const shellContent = shell?.shadowRoot?.querySelector('.content') ?? null
      const appRoute = deepFind(document, 'chromvoid-app')
      return {
        listContainer: readScrollOwner(container),
        shellContent: readScrollOwner(shellContent),
        appRoute: readScrollOwner(appRoute),
        document: readScrollOwner(document.scrollingElement),
        shellContentMode: shell?.getAttribute('content-scroll-mode') ?? null,
      }
    }

    const waitFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const list = deepFind(document, 'virtual-file-list') as HTMLElement | null
    const container = list?.shadowRoot?.querySelector('.list-container') as HTMLElement | null
    if (!list || !container) {
      return {
        ok: false,
        reason: 'missing-list-container',
        beforeScrollTop: 0,
        maxScrollTop: 0,
        selectedItemId: null,
        beforeScrollOwners: readScrollOwners(),
      }
    }

    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    const targetScrollTop = Math.min(1680, maxScrollTop)
    if (targetScrollTop < 120) {
      return {
        ok: false,
        reason: 'not-scrollable',
        beforeScrollTop: container.scrollTop,
        maxScrollTop,
        selectedItemId: null,
        beforeScrollOwners: readScrollOwners(),
      }
    }

    container.scrollTop = targetScrollTop
    container.dispatchEvent(new Event('scroll'))
    await waitFrame()
    await waitFrame()

    const containerRect = container.getBoundingClientRect()
    const visibleItem = Array.from(list.shadowRoot?.querySelectorAll<HTMLElement>('file-item-mobile') ?? [])
      .filter((item) => {
        const rect = item.getBoundingClientRect()
        return rect.bottom > containerRect.top && rect.top < containerRect.bottom
      })
      .at(0)
    const target = visibleItem?.shadowRoot?.querySelector('.file-item') as HTMLElement | null
    if (!visibleItem || !target) {
      return {
        ok: false,
        reason: 'missing-visible-item',
        beforeScrollTop: container.scrollTop,
        maxScrollTop,
        selectedItemId: null,
        beforeScrollOwners: readScrollOwners(),
      }
    }

    const rect = target.getBoundingClientRect()
    target.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: rect.left + 8,
        clientY: rect.top + 8,
      }),
    )

    return {
      ok: true,
      reason: null,
      beforeScrollTop: container.scrollTop,
      maxScrollTop,
      selectedItemId: visibleItem.getAttribute('data-id'),
      beforeScrollOwners: readScrollOwners(),
    }
  })
}

async function getMobileSelectionScrollResult(
  page: import('playwright').Page,
): Promise<MobileSelectionScrollResult> {
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

    function readScrollOwner(element: Element | null): ScrollOwnerState | null {
      if (!(element instanceof HTMLElement)) return null
      const style = getComputedStyle(element)
      return {
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflowY: style.overflowY,
      }
    }

    function readScrollOwners(): MobileScrollOwnerSnapshot {
      const shell = deepFind(document, 'file-app-shell-mobile-layout') as HTMLElement | null
      const list = deepFind(document, 'virtual-file-list') as HTMLElement | null
      const container = list?.shadowRoot?.querySelector('.list-container') ?? null
      const shellContent = shell?.shadowRoot?.querySelector('.content') ?? null
      const appRoute = deepFind(document, 'chromvoid-app')
      return {
        listContainer: readScrollOwner(container),
        shellContent: readScrollOwner(shellContent),
        appRoute: readScrollOwner(appRoute),
        document: readScrollOwner(document.scrollingElement),
        shellContentMode: shell?.getAttribute('content-scroll-mode') ?? null,
      }
    }

    const list = deepFind(document, 'virtual-file-list') as HTMLElement | null
    const container = list?.shadowRoot?.querySelector('.list-container') as HTMLElement | null
    const topToolbar = deepFind(document, 'mobile-top-toolbar') as
      | (HTMLElement & {actions?: Array<{id?: string}>})
      | null
    const topToolbarActionIds = Array.isArray(topToolbar?.actions)
      ? topToolbar.actions.map((action) => action.id).filter((id): id is string => typeof id === 'string')
      : []

    return {
      afterScrollTop: container?.scrollTop ?? 0,
      topToolbarActionIds,
      afterScrollOwners: readScrollOwners(),
    }
  })
}

function expectScrollOwnerNotMovedUp(
  label: string,
  before: ScrollOwnerState | null,
  after: ScrollOwnerState | null,
) {
  expect(after, `${label} should exist after selection`).not.toBeNull()
  expect(before, `${label} should exist before selection`).not.toBeNull()
  expect(after!.scrollTop, `${label} should not jump upward`).toBeGreaterThanOrEqual(before!.scrollTop - 4)
}

function expectScrollOwnerStable(
  label: string,
  before: ScrollOwnerState | null,
  after: ScrollOwnerState | null,
) {
  expect(after, `${label} should exist after selection`).not.toBeNull()
  expect(before, `${label} should exist before selection`).not.toBeNull()
  expect(Math.abs(after!.scrollTop - before!.scrollTop), `${label} should not become the active scroll owner`).toBeLessThanOrEqual(4)
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

test('desktop runtime mobile layout does not expose swipe gutters on file rows', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto(`${BASE_URL}?layout=mobile`)
  await waitForFileManager(page)

  expect(await deepQuerySelector(page, 'file-item-mobile')).toBe(true)
  expect(await hasVisibleMobileSwipeShell(page)).toBe(false)
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

test('mobile header stays minimal outside selection mode', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto(`${BASE_URL}?layout=mobile`)
  await waitForFileManager(page)

  const panel = await getMobileActionPanelState(page)
  expect(panel.exists).toBe(true)
  expect(panel.layoutSelectionMode).toBe(false)
  expect(panel.toolbarDisplay).toBeNull()
  expect(panel.hasSelectionToolbar).toBe(false)
  expect(panel.hasCreateButton).toBe(false)
  expect(panel.hasUploadButton).toBe(false)
})

test('mobile selection mode keeps contextual actions in the shell toolbar only', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto(`${BASE_URL}?layout=mobile`)
  await waitForFileManager(page)

  const requestedSelection = await page.evaluate(() => {
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

    const item = deepFind(document, 'file-item-mobile') as HTMLElement | null
    const target = item?.shadowRoot?.querySelector('.file-item') as HTMLElement | null
    if (!target) return false

    target.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: target.getBoundingClientRect().left + 8,
        clientY: target.getBoundingClientRect().top + 8,
      }),
    )
    return true
  })
  expect(requestedSelection).toBe(true)

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
    const toolbar = deepFind(document, 'mobile-top-toolbar') as
      | (HTMLElement & {actions?: Array<{id?: string}>})
      | null
    return Boolean(toolbar?.actions?.some((action) => action.id === 'selection-done'))
  }, undefined, {timeout: 10_000})

  const panel = await getMobileActionPanelState(page)
  expect(panel.layoutSelectionMode).toBe(false)
  expect(panel.toolbarDisplay).toBeNull()
  expect(panel.hasSelectionToolbar).toBe(false)
  expect(panel.hasCreateButton).toBe(false)
  expect(panel.hasUploadButton).toBe(false)
  expect(panel.topToolbarActionIds).toContain('selection-done')
})

test('mobile selection mode preserves virtual file list scroll', async () => {
  const page = globalThis.__E2E_PAGE__!
  await seedScrollableFilesFixture()
  await page.setViewportSize({width: 390, height: 844})
  await page.goto(`${BASE_URL}?surface=files&path=%2F&layout=mobile`)
  await waitForFileManager(page)

  const started = await startMobileSelectionFromScrolledRow(page)
  expect(started.ok, started.reason ?? undefined).toBe(true)
  expect(started.beforeScrollTop).toBeGreaterThan(0)
  expect(started.selectedItemId).not.toBeNull()

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
    const toolbar = deepFind(document, 'mobile-top-toolbar') as
      | (HTMLElement & {actions?: Array<{id?: string}>})
      | null
    return Boolean(toolbar?.actions?.some((action) => action.id === 'selection-done'))
  }, undefined, {timeout: 10_000})

  const result = await getMobileSelectionScrollResult(page)
  expect(result.topToolbarActionIds).toContain('selection-done')
  expect(result.afterScrollTop).toBeGreaterThanOrEqual(started.beforeScrollTop - 4)
  expect(result.afterScrollTop).toBeGreaterThan(24)
  expect(started.beforeScrollOwners.shellContentMode).toBe('surface')
  expect(result.afterScrollOwners.shellContentMode).toBe('surface')
  expect(result.afterScrollOwners.shellContent?.overflowY).toBe('hidden')
  expectScrollOwnerNotMovedUp(
    'virtual file list',
    started.beforeScrollOwners.listContainer,
    result.afterScrollOwners.listContainer,
  )
  expectScrollOwnerStable(
    'mobile shell content',
    started.beforeScrollOwners.shellContent,
    result.afterScrollOwners.shellContent,
  )
  expectScrollOwnerStable('app route host', started.beforeScrollOwners.appRoute, result.afterScrollOwners.appRoute)
  expectScrollOwnerStable('document scroller', started.beforeScrollOwners.document, result.afterScrollOwners.document)
})

test('mobile upload strip stays above bottom tabs without changing minimal header state', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 390, height: 844})
  await page.goto(`${BASE_URL}?layout=mobile`)
  await waitForFileManager(page)

  const before = await getMobileActionPanelState(page)
  expect(before.layoutSelectionMode).toBe(false)
  expect(before.toolbarDisplay).toBeNull()
  expect(before.hasCreateButton).toBe(false)
  expect(before.hasUploadButton).toBe(false)

  const created = await createTransferTask(page, {name: 'fab-static.bin', total: 1024, direction: 'upload'})
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
  expect(after.layoutSelectionMode).toBe(false)
  expect(after.toolbarDisplay).toBeNull()
  expect(after.hasCreateButton).toBe(false)
  expect(after.hasUploadButton).toBe(false)

  const pill = await getUploadPillState(page)
  expect(pill.exists).toBe(true)
  expect(pill.barVisible).toBe(true)
  expect(pill.hostPosition).toBe('static')
  expect(pill.barPosition).toBe('static')
  expect(pill.barBorderLeftWidth).toBe('0px')
  expect(pill.barBorderRightWidth).toBe('0px')
  expect(pill.barBorderRadius).toBe('0px')
  expect(pill.hostRect).not.toBeNull()
  expect(pill.barRect).not.toBeNull()
  expect(pill.statusBarRect).not.toBeNull()
  expect(pill.tabBarRect).not.toBeNull()
  expect(pill.barRect!.left).toBeGreaterThanOrEqual(pill.hostRect!.left)
  expect(pill.barRect!.right).toBeLessThanOrEqual(pill.hostRect!.right)
  expect(pill.barRect!.top).toBeGreaterThanOrEqual(pill.hostRect!.top)
  expect(pill.barRect!.bottom).toBeLessThanOrEqual(pill.hostRect!.bottom)
  expect(pill.barRect!.left).toBeLessThanOrEqual(pill.hostRect!.left + 1)
  expect(pill.barRect!.right).toBeGreaterThanOrEqual(pill.hostRect!.right - 1)
  expect(pill.hostRect!.height).toBeLessThanOrEqual(pill.barRect!.height + 1)
  expect(pill.barRect!.left).toBeLessThanOrEqual(16)
  expect(pill.barRect!.right).toBeGreaterThanOrEqual(pill.viewportW - 16)
  expect(pill.barRect!.top).toBeGreaterThanOrEqual(pill.statusBarRect!.bottom - 1)
  expect(pill.barRect!.bottom).toBeLessThanOrEqual(pill.tabBarRect!.top)
  expect(pill.barTone).toBe('active')
  expect(pill.barRect!.height).toBeLessThanOrEqual(52)
  expect(pill.barRect!.height).toBeGreaterThanOrEqual(44)
})

test('mobile upload sheet opens with vertical header list footer layout', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 390, height: 844})
  await page.goto(`${BASE_URL}?layout=mobile`)
  await waitForFileManager(page)

  const created = await createTransferTask(page, {name: 'sheet-layout.bin', total: 2048, direction: 'upload'})
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
    return Boolean(upload?.shadowRoot?.querySelector('.minimized-bar'))
  }, undefined, {timeout: 10_000})

  await page.evaluate(() => {
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
    bar?.click()
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
    const upload = deepFind(document, 'upload-progress-mobile') as HTMLElement | null
    const root = upload?.shadowRoot
    const sheet = root?.querySelector('cv-bottom-sheet') as HTMLElement | null
    const footer = root?.querySelector('.sheet-footer') as HTMLElement | null
    return Boolean(sheet?.hasAttribute('open') && footer?.getBoundingClientRect().height)
  }, undefined, {timeout: 10_000})

  const sheet = await getUploadSheetState(page)
  expect(sheet.sheetOpen).toBe(true)
  expect(sheet.bodyDisplay).toBe('grid')
  expect(sheet.headerRect).not.toBeNull()
  expect(sheet.tasksRect).not.toBeNull()
  expect(sheet.footerRect).not.toBeNull()
  expect(sheet.headerRect!.bottom).toBeLessThanOrEqual(sheet.tasksRect!.top + 1)
  expect(sheet.tasksRect!.bottom).toBeLessThanOrEqual(sheet.footerRect!.top + 1)
  expect(sheet.footerRect!.left).toBeLessThanOrEqual(sheet.headerRect!.left + 1)
  expect(sheet.footerRect!.right).toBeGreaterThanOrEqual(sheet.headerRect!.right - 1)
  expect(sheet.footerRect!.width).toBeGreaterThan(sheet.viewportW * 0.8)
})

test('mobile upload pill auto-hides after successful completion', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 390, height: 844})
  await page.goto(`${BASE_URL}?layout=mobile`)
  await waitForFileManager(page)

  const created = await createTransferTask(
    page,
    {name: 'done-hide.bin', total: 1024, direction: 'upload'},
    {loaded: 1024, status: 'done'},
  )
  expect(created).toBe(true)
  expect(await deepQuerySelector(page, 'upload-progress-mobile')).toBe(true)

  await page.waitForFunction(async () => {
    const modulePath = '/shared/services/app-context.ts'
    const dynamicImport = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<typeof import('../../src/shared/services/app-context')>
    const {getAppContext} = await dynamicImport(modulePath)
    const store = getAppContext().store
    return Boolean(store?.uploadTasks) && store.uploadTasks().length === 0
  }, undefined, {timeout: 15_000})

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
    return !deepFind(document, 'upload-progress-mobile')
  }, undefined, {timeout: 15_000})

  expect(await deepQuerySelector(page, 'upload-progress-mobile')).toBe(false)
})

test('mobile upload pill is not auto-hidden when transfer fails', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 390, height: 844})
  await page.goto(`${BASE_URL}?layout=mobile`)
  await waitForFileManager(page)

  const created = await createTransferTask(
    page,
    {name: 'failed-keep.bin', total: 1024, direction: 'upload'},
    {status: 'error'},
  )
  expect(created).toBe(true)
  expect(await deepQuerySelector(page, 'upload-progress-mobile')).toBe(true)

  await page.waitForTimeout(4500)

  const pill = await getUploadPillState(page)
  expect(pill.exists).toBe(true)
  expect(pill.barVisible).toBe(true)
  expect(pill.barTone).toBe('danger')
  expect(await deepQuerySelector(page, 'upload-progress-mobile')).toBe(true)
})
