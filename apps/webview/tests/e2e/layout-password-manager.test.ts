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

type PMMobileFabState = {
  exists: boolean
  actionsHidden: boolean
  fabOrder: string[]
  dropdownItems: string[]
  hasFilters: boolean
  hasCreateEntry: boolean
  hasCreateGroup: boolean
  hasEntryEdit: boolean
  hasEntryMove: boolean
  hasEntryDelete: boolean
  hasMore: boolean
  hasSearchComponent: boolean
  commandOpen: boolean
  commandIds: string[]
  actionsRect: {left: number; right: number; top: number; bottom: number; width: number; height: number} | null
  viewportW: number
  viewportH: number
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

type MenuButtonAlignment = {
  triggerCenterX: number
  iconCenterX: number
  deltaX: number
}

type RectSnapshot = {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

async function getMenuButtonAlignment(
  page: import('playwright').Page,
  layoutSelector: string,
  menuSelector: string,
): Promise<MenuButtonAlignment | null> {
  return page.evaluate(
    ({layoutSelector, menuSelector}) => {
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

      const layout = deepFind(document, layoutSelector) as HTMLElement | null
      const menu = layout?.shadowRoot?.querySelector(menuSelector) as HTMLElement | null
      const trigger = menu?.shadowRoot?.querySelector('[part="trigger"]') as HTMLElement | null
      const icon = menu?.querySelector('[slot="prefix"]') as HTMLElement | null
      if (!trigger || !icon) {
        return null
      }

      const triggerRect = trigger.getBoundingClientRect()
      const iconRect = icon.getBoundingClientRect()
      const triggerCenterX = triggerRect.left + triggerRect.width / 2
      const iconCenterX = iconRect.left + iconRect.width / 2
      return {
        triggerCenterX,
        iconCenterX,
        deltaX: iconCenterX - triggerCenterX,
      }
    },
    {layoutSelector, menuSelector},
  )
}

async function openMenuButton(
  page: import('playwright').Page,
  layoutSelector: string,
  menuSelector: string,
): Promise<boolean> {
  return page.evaluate(
    ({layoutSelector, menuSelector}) => {
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

      const layout = deepFind(document, layoutSelector) as HTMLElement | null
      const menu = layout?.shadowRoot?.querySelector(menuSelector) as HTMLElement | null
      const trigger = menu?.shadowRoot?.querySelector('[part="trigger"], [part="dropdown"]') as HTMLElement | null
      if (!trigger) {
        return false
      }

      trigger.click()
      return true
    },
    {layoutSelector, menuSelector},
  )
}

async function getMenuButtonPopupRect(
  page: import('playwright').Page,
  layoutSelector: string,
  menuSelector: string,
): Promise<RectSnapshot | null> {
  return page.evaluate(
    ({layoutSelector, menuSelector}) => {
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

      const layout = deepFind(document, layoutSelector) as HTMLElement | null
      const menu = layout?.shadowRoot?.querySelector(menuSelector) as HTMLElement | null
      const popup = menu?.shadowRoot?.querySelector('[part="menu"]') as HTMLElement | null
      const rect = popup?.getBoundingClientRect()
      if (!rect) {
        return null
      }

      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    },
    {layoutSelector, menuSelector},
  )
}

async function getMenuButtonTriggerRect(
  page: import('playwright').Page,
  layoutSelector: string,
  menuSelector: string,
): Promise<RectSnapshot | null> {
  return page.evaluate(
    ({layoutSelector, menuSelector}) => {
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

      const layout = deepFind(document, layoutSelector) as HTMLElement | null
      const menu = layout?.shadowRoot?.querySelector(menuSelector) as HTMLElement | null
      const trigger = menu?.shadowRoot?.querySelector('[part="trigger"], [part="dropdown"]') as HTMLElement | null
      const rect = trigger?.getBoundingClientRect()
      if (!rect) {
        return null
      }

      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    },
    {layoutSelector, menuSelector},
  )
}

async function getPMMobileFabState(page: import('playwright').Page): Promise<PMMobileFabState> {
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
    const layout = deepFind(document, 'password-manager-mobile-layout') as HTMLElement | null
    if (!layout?.shadowRoot) {
      return {
        exists: false,
        actionsHidden: true,
        fabOrder: [],
        dropdownItems: [],
        hasFilters: false,
        hasCreateEntry: false,
        hasCreateGroup: false,
        hasEntryEdit: false,
        hasEntryMove: false,
        hasEntryDelete: false,
        hasMore: false,
        hasSearchComponent: false,
        commandOpen: false,
        commandIds: [],
        actionsRect: null,
        viewportW,
        viewportH,
      }
    }

    const actions = layout.shadowRoot.querySelector('.actions') as HTMLElement | null
    const moreMenu = actions?.querySelector('cv-menu-button[data-action="pm-more"]') as HTMLElement | null
    const search = layout.shadowRoot.querySelector('pm-search-mobile') as HTMLElement | null
    const commandBar = deepFind(document, 'command-bar') as HTMLElement | null
    const commandRoot = commandBar?.shadowRoot ?? null
    const order: string[] = []
    for (const child of Array.from(actions?.children ?? [])) {
      const action = child.getAttribute('data-action')
      if (action) {
        order.push(action)
      }
    }

    const dropdownItems = Array.from(moreMenu?.querySelectorAll('cv-menu-item[data-action]') ?? [])
      .map((item) => item.getAttribute('data-action'))
      .filter((item): item is string => Boolean(item))
    const commandIds = Array.from(commandRoot?.querySelectorAll('.command[data-command-id]') ?? [])
      .map((item) => item.getAttribute('data-command-id'))
      .filter((item): item is string => Boolean(item))

    const rect = actions?.getBoundingClientRect() ?? null
    return {
      exists: true,
      actionsHidden: actions?.hasAttribute('hidden') ?? true,
      fabOrder: order,
      dropdownItems,
      hasFilters: Boolean(actions?.querySelector('[data-action="pm-filters"]')),
      hasCreateEntry: Boolean(actions?.querySelector('[data-action="pm-create-entry"]')),
      hasCreateGroup: Boolean(actions?.querySelector('[data-action="pm-create-group"]')),
      hasEntryEdit: Boolean(actions?.querySelector('[data-action="pm-entry-edit"]')),
      hasEntryMove: Boolean(actions?.querySelector('[data-action="pm-entry-move"]')),
      hasEntryDelete: Boolean(actions?.querySelector('[data-action="pm-entry-delete"]')),
      hasMore: Boolean(actions?.querySelector('[data-action="pm-more"]')),
      hasSearchComponent: Boolean(search),
      commandOpen: Boolean(commandBar?.hasAttribute('open')),
      commandIds,
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

async function enableAndWaitForPasswordManager(page: import('playwright').Page, url: string): Promise<void> {
  await page.goto(url)
  await page.evaluate(() => {
    localStorage.setItem('persist-local-storage-password-manager-mode', JSON.stringify({value: true}))
  })
  await page.reload()
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
      const pm = deepFind(document, 'password-manager')
      return !!pm?.shadowRoot
    },
    undefined,
    {timeout: 10_000},
  )
  await page.waitForTimeout(500)
}

test('desktop layout shows sidebar and resizer', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=desktop`)

  expect(await deepQuerySelector(page, 'password-manager-desktop-layout')).toBe(true)
  expect(await deepQuerySelector(page, '.sidebar')).toBe(true)
  expect(await deepQuerySelector(page, '.resizer')).toBe(true)
})

test('desktop more actions icon stays centered in trigger', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=desktop`)

  const alignment = await getMenuButtonAlignment(page, 'password-manager-desktop-layout', 'cv-menu-button.more-menu')
  expect(alignment).not.toBeNull()
  expect(Math.abs(alignment!.deltaX)).toBeLessThan(1)
})

test('mobile layout shows list/group FAB actions and no sidebar/resizer', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  expect(await deepQuerySelector(page, 'password-manager-mobile-layout')).toBe(true)
  expect(await deepQuerySelector(page, 'password-manager-desktop-layout')).toBe(false)

  const state = await getPMMobileFabState(page)
  expect(state.exists).toBe(true)
  expect(state.actionsHidden).toBe(false)
  expect(state.hasMore).toBe(true)
  expect(state.hasFilters).toBe(true)
  expect(state.hasCreateGroup).toBe(true)
  expect(state.hasCreateEntry).toBe(true)
  expect(state.hasEntryEdit).toBe(false)
  expect(state.fabOrder).toEqual(['pm-more', 'pm-filters', 'pm-create-group', 'pm-create-entry'])
  expect(state.dropdownItems).toEqual(['pm-export', 'pm-import', 'pm-clean'])
  expect(state.dropdownItems).not.toContain('pm-create-group')
  expect(state.dropdownItems).not.toContain('pm-create-entry')
  expect(state.hasSearchComponent).toBe(false)
  expect(state.actionsRect).not.toBeNull()
  expect(state.actionsRect!.right).toBeGreaterThan(state.viewportW * 0.78)
  expect(state.actionsRect!.bottom).toBeGreaterThan(state.viewportH * 0.7)
})

test('mobile more actions icon stays centered in trigger', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  const alignment = await getMenuButtonAlignment(
    page,
    'password-manager-mobile-layout',
    'cv-menu-button[data-action="pm-more"]',
  )
  expect(alignment).not.toBeNull()
  expect(Math.abs(alignment!.deltaX)).toBeLessThan(1)
})

test('mobile more actions menu stays inside the viewport', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  expect(
    await openMenuButton(page, 'password-manager-mobile-layout', 'cv-menu-button[data-action="pm-more"]'),
  ).toBe(true)
  await page.waitForTimeout(150)

  const rect = await getMenuButtonPopupRect(page, 'password-manager-mobile-layout', 'cv-menu-button[data-action="pm-more"]')
  const triggerRect = await getMenuButtonTriggerRect(
    page,
    'password-manager-mobile-layout',
    'cv-menu-button[data-action="pm-more"]',
  )
  const viewport = page.viewportSize()

  expect(rect).not.toBeNull()
  expect(triggerRect).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(rect!.left).toBeGreaterThanOrEqual(0)
  expect(rect!.top).toBeGreaterThanOrEqual(0)
  expect(rect!.right).toBeLessThanOrEqual(viewport!.width)
  expect(rect!.bottom).toBeLessThanOrEqual(viewport!.height)
  expect(rect!.bottom).toBeLessThanOrEqual(triggerRect!.top)
})

test('mobile filters FAB opens command palette in filters mode', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  expect(await deepClick(page, '[data-action="pm-filters"]')).toBe(true)
  await page.waitForTimeout(150)
  const state = await getPMMobileFabState(page)
  expect(state.commandOpen).toBe(true)
  expect(state.commandIds).toContain('pm-sort-direction-toggle')
  expect(state.commandIds).toContain('pm-group-by-none')
  expect(state.commandIds).not.toContain('pm-create-entry')
})

test('mobile switches FAB stacks by context and hides lane in create/edit/import', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  let state = await getPMMobileFabState(page)
  expect(state.actionsHidden).toBe(false)
  expect(state.fabOrder).toEqual(['pm-more', 'pm-filters', 'pm-create-group', 'pm-create-entry'])

  await page.evaluate(() => {
    const pm = (window as any).passmanager
    const entry = pm.createEntry({title: 'fab-hidden-entry', username: '', urls: []}, '', '', undefined)
    pm.showElement.set(entry)
  })
  await page.waitForTimeout(150)
  state = await getPMMobileFabState(page)
  expect(state.actionsHidden).toBe(false)
  expect(state.fabOrder).toEqual(['pm-more', 'pm-entry-edit', 'pm-entry-move', 'pm-entry-delete'])
  expect(state.hasCreateGroup).toBe(false)
  expect(state.hasCreateEntry).toBe(false)

  const entryHeaderActions = await page.evaluate(() => {
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

    const entry = deepFind(document, 'pm-entry-mobile') as HTMLElement | null
    const root = entry?.shadowRoot
    const header = root?.querySelector('.header-actions')
    return {
      headerButtonsCount: header?.querySelectorAll('button').length ?? 0,
      hasBackButton: Boolean(header?.querySelector('back-button')),
    }
  })

  expect(entryHeaderActions.headerButtonsCount).toBe(0)
  expect(entryHeaderActions.hasBackButton).toBe(false)

  await page.evaluate(() => {
    ;(window as any).passmanager.showElement.set('createEntry')
  })
  await page.waitForTimeout(150)
  state = await getPMMobileFabState(page)
  expect(state.actionsHidden).toBe(true)

  await page.evaluate(() => {
    ;(window as any).passmanager.showElement.set('createGroup')
  })
  await page.waitForTimeout(150)
  state = await getPMMobileFabState(page)
  expect(state.actionsHidden).toBe(true)

  await page.evaluate(() => {
    ;(window as any).passmanager.showElement.set('importDialog')
  })
  await page.waitForTimeout(150)
  state = await getPMMobileFabState(page)
  expect(state.actionsHidden).toBe(true)

  await page.evaluate(() => {
    const pm = (window as any).passmanager
    pm.showElement.set(pm)
    pm.isEditMode.set(true)
  })
  await page.waitForTimeout(150)
  state = await getPMMobileFabState(page)
  expect(state.actionsHidden).toBe(true)

  await page.evaluate(() => {
    const pm = (window as any).passmanager
    pm.isEditMode.set(false)
    pm.showElement.set(pm)
  })
  await page.waitForTimeout(150)
  state = await getPMMobileFabState(page)
  expect(state.actionsHidden).toBe(false)
  expect(state.fabOrder).toEqual(['pm-more', 'pm-filters', 'pm-create-group', 'pm-create-entry'])
})

test('desktop layout has group-tree-view in sidebar', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=desktop`)

  expect(await deepQuerySelector(page, 'group-tree-view')).toBe(true)
})
