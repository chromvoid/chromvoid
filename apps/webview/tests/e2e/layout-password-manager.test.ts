import {expect, test} from 'vitest'

import {clearMockPassmanagerState, writeMockPassmanagerState} from './utils'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

const BASE_URL = 'http://localhost:4400/index.html'

async function seedLayoutPassmanagerFixture(): Promise<void> {
  await clearMockPassmanagerState()
  await writeMockPassmanagerState({
    version: 1,
    revision: 1,
    nextNodeId: 4,
    folders: ['layout-fixture-group'],
    foldersMeta: [],
    entries: [
      {
        nodeId: 2,
        meta: {
          id: 'layout-root-login',
          title: 'Layout Root Login',
          username: 'layout-user',
          urls: [{value: 'https://layout.example.test/login', match: 'base_domain'}],
        },
      },
      {
        nodeId: 3,
        meta: {
          id: 'layout-group-login',
          title: 'Layout Group Login',
          username: 'layout-group-user',
          folderPath: 'layout-fixture-group',
          urls: [],
        },
      },
    ],
    secrets: [['layout-root-login:password', 'layout-password']],
    otpSecrets: [],
    icons: [],
  })
}

async function applyLayoutEmulation(
  page: import('playwright').Page,
  layout: 'mobile' | 'desktop' | null,
  mobileWidth = 390,
): Promise<void> {
  const client = await page.context().newCDPSession(page)

  if (layout === 'mobile') {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: mobileWidth,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    })
    await client.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 1,
    })
    await page.waitForTimeout(50)
    return
  }

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await client.send('Emulation.setTouchEmulationEnabled', {
    enabled: false,
    maxTouchPoints: 1,
  })
  await page.waitForTimeout(50)
}

async function deepQuerySelector(page: import('playwright').Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      let match: Element | null = null
      const found = root.querySelector(selector)
      if (found instanceof Element && found.isConnected) {
        match = found
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner instanceof Element && inner.isConnected) {
            match = inner
          }
        }
      }
      return match
    }
    return deepFind(document, sel) !== null
  }, selector)
}

type PMMobileFabState = {
  exists: boolean
  actionsHidden: boolean
  fabOrder: string[]
  dropdownItems: string[]
  hasSortGroup: boolean
  hasSearchSortGroup: boolean
  searchSortGroupActive: boolean
  sortGroupSheetOpen: boolean
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

type PMMobileSelectionState = {
  showId: string | null
  showType: string | null
  kind: string | null
  selectedCount: number | null
  actionIds: string[]
  entrySelected: boolean
}

async function deepClick(page: import('playwright').Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      let match: Element | null = null
      const found = root.querySelector(selector)
      if (found instanceof Element && found.isConnected) {
        match = found
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner instanceof Element && inner.isConnected) {
            match = inner
          }
        }
      }
      return match
    }

    const target = deepFind(document, sel) as HTMLElement | null
    if (!target) return false
    target.click()
    return true
  }, selector)
}

async function getDeepRect(
  page: import('playwright').Page,
  selector: string,
): Promise<{x: number; y: number; width: number; height: number} | null> {
  return page.evaluate((sel) => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      let match: Element | null = null
      const found = root.querySelector(selector)
      if (found instanceof Element && found.isConnected) {
        match = found
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner instanceof Element && inner.isConnected) {
            match = inner
          }
        }
      }
      return match
    }

    const target = deepFind(document, sel) as HTMLElement | null
    if (!target) return null
    const rect = target.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
    }
  }, selector)
}

async function dispatchTrustedLongPress(
  page: import('playwright').Page,
  selector: string,
  holdMs = 650,
): Promise<void> {
  const client = await page.context().newCDPSession(page)
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await client.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 1,
  })
  await page.waitForTimeout(50)

  const rect = await getDeepRect(page, selector)
  if (!rect) {
    throw new Error(`long-press target not found: ${selector}`)
  }

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: rect.x, y: rect.y, radiusX: 3, radiusY: 3, force: 1, id: 1}],
  })
  await page.waitForTimeout(holdMs)
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
}

async function getPMMobileSelectionState(page: import('playwright').Page): Promise<PMMobileSelectionState> {
  return page.evaluate(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      let match: Element | null = null
      const found = root.querySelector(selector)
      if (found instanceof Element && found.isConnected) {
        match = found
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner instanceof Element && inner.isConnected) {
            match = inner
          }
        }
      }
      return match
    }

    function deepQueryAll(root: Document | ShadowRoot, selector: string): Element[] {
      const matches = Array.from(root.querySelectorAll(selector))
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          matches.push(...deepQueryAll(el.shadowRoot, selector))
        }
      }
      return matches
    }

    const toolbar = deepFind(document, 'mobile-top-toolbar') as (HTMLElement & {
      actions?: Array<{id: string}>
    }) | null
    const showElement = (window as any).passmanager?.showElement?.()
    const actionIds = Array.isArray(toolbar?.actions) ? toolbar.actions.map((action) => action.id) : []
    const selectedCount = deepQueryAll(document, '.list-item.selected').length

    return {
      showId: showElement?.id ?? null,
      showType: showElement?.constructor?.name ?? null,
      kind: actionIds.includes('pm-selection-done') ? 'passwords-selection' : null,
      selectedCount,
      actionIds,
      entrySelected: selectedCount > 0,
    }
  })
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

type PasswordDialogKeyboardSnapshot = {
  appRect: RectSnapshot | null
  contentRect: RectSnapshot | null
  debugActive: boolean
  footerRect: RectSnapshot | null
  inputFocused: boolean
  layoutRect: RectSnapshot | null
  passwordDialogKeyboardOffset: string
  primaryActionRect: RectSnapshot | null
  rootKeyboardInset: string
  sheetKeyboardInset: string | null
  sheetRect: RectSnapshot | null
  viewportHeight: number
}

async function getMobilePasswordDialogKeyboardSnapshot(
  page: import('playwright').Page,
): Promise<PasswordDialogKeyboardSnapshot> {
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

    function rectOf(element: Element | null | undefined): RectSnapshot | null {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    }

    const inputDialog = deepFind(document, 'cv-input-dialog') as HTMLElement | null
    const sheet = inputDialog?.shadowRoot?.querySelector(
      'cv-bottom-sheet.password-input-dialog',
    ) as HTMLElement | null
    const dialog = sheet?.shadowRoot?.querySelector('cv-dialog') as HTMLElement | null
    const content = dialog?.shadowRoot?.querySelector('[part="content"]') as HTMLElement | null
    const footer = inputDialog?.shadowRoot?.querySelector('.dialog-footer') as HTMLElement | null
    const primaryAction = footer?.querySelector('cv-button[variant="primary"]') as HTMLElement | null
    const input = inputDialog?.shadowRoot?.querySelector('cv-input') as
      | (HTMLElement & {shadowRoot?: ShadowRoot})
      | null
    const nativeInput = input?.shadowRoot?.querySelector('input')
    const layout = deepFind(document, 'password-manager-mobile-layout') as HTMLElement | null
    const app = document.querySelector('chromvoid-app') as HTMLElement | null

    return {
      appRect: rectOf(app),
      contentRect: rectOf(content),
      debugActive: document.documentElement.hasAttribute('data-password-input-dialog-debug'),
      footerRect: rectOf(footer),
      inputFocused:
        Boolean(input)
        && inputDialog?.shadowRoot?.activeElement === input
        && input?.shadowRoot?.activeElement === nativeInput,
      layoutRect: rectOf(layout),
      passwordDialogKeyboardOffset: getComputedStyle(document.documentElement).getPropertyValue(
        '--password-input-dialog-keyboard-offset',
      ),
      primaryActionRect: rectOf(primaryAction),
      rootKeyboardInset: getComputedStyle(document.documentElement).getPropertyValue(
        '--visual-viewport-bottom-inset',
      ),
      sheetKeyboardInset: sheet
        ? getComputedStyle(sheet).getPropertyValue('--cv-bottom-sheet-keyboard-inset')
        : null,
      sheetRect: rectOf(sheet),
      viewportHeight: window.innerHeight,
    }
  })
}

type DesktopVirtualRowLayout = {
  groupRowHeight: number | null
  entryWithSubtitleHeight: number | null
  entryWithoutSubtitleHeight: number | null
  headerRowHeight: number | null
  titleOverflow: boolean
  subtitleOverflow: boolean
}

type DesktopEntryClickPoint = {
  x: number
  y: number
  scrollTop: number
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

async function showFirstMobileLoginEntry(page: import('playwright').Page): Promise<string> {
  const entryId = await findFirstLoginEntryId(page)

  if (!entryId) {
    throw new Error('No login entry found for mobile entry test')
  }

  await page.evaluate((id) => {
    const pm = (window as any).passmanager
    const entry = pm?.getCardByID?.(id)
    if (!entry) return
    pm.showElement.set(entry)
  }, entryId)

  await page.waitForFunction(
    (id) => {
      const pm = (window as any).passmanager
      const current = pm?.showElement?.()
      return current?.id === id && pm?.isEditMode?.() === false
    },
    entryId,
    {timeout: 10_000},
  )

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

      const entry = deepFind(document, 'pm-entry-mobile') as HTMLElement | null
      return Boolean(entry?.shadowRoot?.querySelector('.primary-card'))
    },
    undefined,
    {timeout: 10_000},
  )

  return entryId
}

async function findFirstLoginEntryId(page: import('playwright').Page): Promise<string | null> {
  return page.evaluate(() => {
    const pm = (window as any).passmanager

    const isLoginEntry = (item: unknown): item is {id?: string; entryType?: string; title?: string} =>
      Boolean(
        item &&
          typeof item === 'object' &&
          'title' in item &&
          !('entriesList' in item) &&
          (item as {entryType?: string}).entryType !== 'payment_card',
      )

    const findEntry = (items: unknown[]): {id?: string; entryType?: string; title?: string} | null => {
      for (const item of items) {
        if (isLoginEntry(item)) return item
      }
      for (const item of items) {
        const children =
          item && typeof item === 'object' && 'entriesList' in item
            ? (item as {entriesList?: () => unknown[]}).entriesList?.()
            : undefined
        if (!Array.isArray(children)) continue
        const found = findEntry(children)
        if (found) return found
      }
      return null
    }

    return findEntry(pm?.entriesList?.() ?? [])?.id ?? null
  })
}

async function getDesktopVirtualRowLayout(
  page: import('playwright').Page,
  target: {
    groupRowLabel: string
    entryWithSubtitleTitle: string
    entryWithoutSubtitleTitle: string
  },
): Promise<DesktopVirtualRowLayout | null> {
  return page.evaluate((target) => {
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

    function deepText(node: Node | null | undefined): string {
      if (!node) return ''
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent ?? ''
      }

      let text = ''
      if (node instanceof Element && node.shadowRoot) {
        text += deepText(node.shadowRoot)
      }

      for (const child of Array.from(node.childNodes)) {
        text += deepText(child)
      }

      return text
    }

    const layout = deepFind(document, 'password-manager-desktop-layout') as HTMLElement | null
    const group = layout?.shadowRoot?.querySelector('pm-group') as HTMLElement | null
    const root = group?.shadowRoot
    if (!root) return null

    const rows = Array.from(root.querySelectorAll('.group-row-wrap, .group-header-row, .entry-row')) as HTMLElement[]
    const findRow = (className: string, needle: string) =>
      rows.find((row) => row.classList.contains(className) && deepText(row).includes(needle)) ?? null

    const groupRow = findRow('group-row-wrap', target.groupRowLabel)
    const entryWithSubtitle = findRow('entry-row', target.entryWithSubtitleTitle)
    const entryWithoutSubtitle = findRow('entry-row', target.entryWithoutSubtitleTitle)
    const headerRow = rows.find((row) => row.classList.contains('group-header-row')) ?? null

    const entryHost = entryWithSubtitle?.querySelector('pm-entry-list-item') as HTMLElement | null
    const entryRoot = entryHost?.shadowRoot
    const title = entryRoot?.querySelector('.item-title') as HTMLElement | null
    const subtitle = entryRoot?.querySelector('.item-subtitle') as HTMLElement | null

    return {
      groupRowHeight: groupRow?.getBoundingClientRect().height ?? null,
      entryWithSubtitleHeight: entryWithSubtitle?.getBoundingClientRect().height ?? null,
      entryWithoutSubtitleHeight: entryWithoutSubtitle?.getBoundingClientRect().height ?? null,
      headerRowHeight: headerRow?.getBoundingClientRect().height ?? null,
      titleOverflow: title ? title.scrollWidth > title.clientWidth : false,
      subtitleOverflow: subtitle ? subtitle.scrollWidth > subtitle.clientWidth : false,
    }
  }, target)
}

async function getDesktopEntryClickPoint(
  page: import('playwright').Page,
  targetTitle: string,
): Promise<DesktopEntryClickPoint | null> {
  return page.evaluate((targetTitle) => {
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

    function deepText(node: Node | null | undefined): string {
      if (!node) return ''
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent ?? ''
      }

      let text = ''
      if (node instanceof Element && node.shadowRoot) {
        text += deepText(node.shadowRoot)
      }

      for (const child of Array.from(node.childNodes)) {
        text += deepText(child)
      }

      return text
    }

    const layout = deepFind(document, 'password-manager-desktop-layout') as HTMLElement | null
    const group = layout?.shadowRoot?.querySelector('pm-group') as HTMLElement | null
    const root = group?.shadowRoot
    const virtualizer = root?.querySelector('lit-virtualizer') as HTMLElement | null
    if (!root || !virtualizer) return null

    const targetRow = Array.from(root.querySelectorAll('.entry-row')).find((row) => deepText(row).includes(targetTitle))
    if (!(targetRow instanceof HTMLElement)) return null

    const entryHost = targetRow.querySelector('pm-entry-list-item') as HTMLElement | null
    const targetSurface = entryHost?.shadowRoot?.querySelector('.list-item') as HTMLElement | null
    const rect = targetSurface?.getBoundingClientRect()
    if (!rect) return null

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      scrollTop: virtualizer.scrollTop,
    }
  }, targetTitle)
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
        hasSortGroup: false,
        hasSearchSortGroup: false,
        searchSortGroupActive: false,
        sortGroupSheetOpen: false,
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

    const toolbar = deepFind(document, 'mobile-top-toolbar') as HTMLElement | null
    const toolbarRoot = toolbar?.shadowRoot ?? null
    const actions = toolbarRoot?.querySelector('.trailing') as HTMLElement | null
    const moreMenu = toolbarRoot?.querySelector('cv-menu-button.overflow-menu') as HTMLElement | null
    const search = deepFind(layout.shadowRoot, 'pm-search-mobile') as HTMLElement | null
    const searchSortGroup = search?.shadowRoot?.querySelector('.sort-group-trigger') as HTMLElement | null
    const sortGroupSheet = layout.shadowRoot.querySelector('pm-mobile-sort-group-sheet') as HTMLElement | null
    const sortGroupBottomSheet = sortGroupSheet?.shadowRoot?.querySelector('cv-bottom-sheet') as HTMLElement | null
    const commandBar = deepFind(document, 'command-bar') as HTMLElement | null
    const commandRoot = commandBar?.shadowRoot ?? null
    const order: string[] = []
    for (const child of Array.from(actions?.querySelectorAll('[data-action]') ?? [])) {
      const action = child.getAttribute('data-action')
      if (action && action !== 'mobile-leading' && action !== 'mobile-command') {
        order.push(action)
      }
    }

    const dropdownItems = Array.from(moreMenu?.querySelectorAll('cv-menu-item[value]') ?? [])
      .map((item) => item.getAttribute('value'))
      .filter((item): item is string => Boolean(item))
    const commandIds = Array.from(commandRoot?.querySelectorAll('.command[data-command-id]') ?? [])
      .map((item) => item.getAttribute('data-command-id'))
      .filter((item): item is string => Boolean(item))

    const rect = actions?.getBoundingClientRect() ?? null
    return {
      exists: true,
      actionsHidden: !toolbar || order.length === 0,
      fabOrder: order,
      dropdownItems,
      hasSortGroup: Boolean(toolbarRoot?.querySelector('[data-action="pm-sort-group"]')),
      hasSearchSortGroup: Boolean(searchSortGroup),
      searchSortGroupActive: Boolean(searchSortGroup?.classList.contains('active')),
      sortGroupSheetOpen: Boolean(sortGroupBottomSheet?.hasAttribute('open')),
      hasCreateEntry: Boolean(toolbarRoot?.querySelector('[data-action="pm-create-entry"]')),
      hasCreateGroup: Boolean(toolbarRoot?.querySelector('[data-action="pm-create-group"]')),
      hasEntryEdit:
        Boolean(toolbarRoot?.querySelector('[data-action="pm-entry-edit"]')) ||
        dropdownItems.includes('pm-entry-edit'),
      hasEntryMove:
        Boolean(toolbarRoot?.querySelector('[data-action="pm-entry-move"]')) ||
        dropdownItems.includes('pm-entry-move'),
      hasEntryDelete:
        Boolean(toolbarRoot?.querySelector('[data-action="pm-entry-delete"]')) ||
        dropdownItems.includes('pm-entry-delete'),
      hasMore: Boolean(moreMenu),
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
  await seedLayoutPassmanagerFixture()
  const nextUrl = new URL(url)
  nextUrl.searchParams.set('surface', 'passwords')
  const mobileWidth = Number.parseInt(nextUrl.searchParams.get('e2eWidth') ?? '', 10)
  await applyLayoutEmulation(
    page,
    (nextUrl.searchParams.get('layout') as 'mobile' | 'desktop' | null) ?? null,
    Number.isFinite(mobileWidth) ? mobileWidth : 390,
  )
  await page.goto(nextUrl.toString(), {waitUntil: 'domcontentloaded'})
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
  await page.waitForFunction(() => Boolean((window as unknown as {passmanager?: unknown}).passmanager), undefined, {
    timeout: 10_000,
  })
  await page.waitForFunction(
    () => ((window as any).passmanager?.entriesList?.()?.length ?? 0) > 0,
    undefined,
    {timeout: 10_000},
  )
  await page.waitForTimeout(150)
}

test('desktop layout shows sidebar and resizer', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=desktop`)

  expect(await deepQuerySelector(page, 'password-manager-desktop-layout')).toBe(true)
  expect(await deepQuerySelector(page, '.sidebar')).toBe(true)
  expect(await deepQuerySelector(page, '.resizer')).toBe(true)
})

test('desktop toolbar keeps passwords maintenance and OTP actions', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=desktop`)

  const actionIds = await page.evaluate(() => {
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

    const toolbar = deepFind(document, 'pm-desktop-toolbar') as HTMLElement | null
    return Array.from(toolbar?.shadowRoot?.querySelectorAll<HTMLElement>('[data-action]') ?? [])
      .map((button) => button.dataset['action'])
      .filter((id): id is string => Boolean(id))
  })

  expect(actionIds).toEqual(expect.arrayContaining(['pm-otp-view', 'pm-import', 'pm-export', 'pm-clean']))
})

test('mobile layout shows list/group FAB actions and no sidebar/resizer', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  expect(await deepQuerySelector(page, 'password-manager-mobile-layout')).toBe(true)
  expect(await deepQuerySelector(page, 'password-manager-desktop-layout')).toBe(false)

  const state = await getPMMobileFabState(page)
  expect(state.exists).toBe(true)
  expect(state.actionsHidden).toBe(false)
  expect(state.hasMore).toBe(false)
  expect(state.hasSortGroup).toBe(false)
  expect(state.hasSearchSortGroup).toBe(true)
  expect(state.searchSortGroupActive).toBe(false)
  expect(state.hasCreateGroup).toBe(true)
  expect(state.hasCreateEntry).toBe(true)
  expect(state.hasEntryEdit).toBe(false)
  expect(state.fabOrder).toEqual(['pm-create-group', 'pm-create-entry'])
  expect(state.dropdownItems).toEqual([])
  expect(state.dropdownItems).not.toContain('pm-otp-view')
  expect(state.dropdownItems).not.toContain('pm-export')
  expect(state.dropdownItems).not.toContain('pm-import')
  expect(state.dropdownItems).not.toContain('pm-clean')
  expect(state.dropdownItems).not.toContain('pm-create-group')
  expect(state.dropdownItems).not.toContain('pm-create-entry')
  expect(state.hasSearchComponent).toBe(true)
  expect(state.actionsRect).not.toBeNull()
  expect(state.actionsRect!.right).toBeGreaterThan(state.viewportW * 0.78)
  expect(state.actionsRect!.top).toBeLessThan(state.viewportH * 0.2)
})

test('mobile selection delete confirmation stays inside viewport', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile&e2eWidth=390`)

  const entryId = await findFirstLoginEntryId(page)
  const commandState = await page.evaluate(async (id) => {
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

    const {pmMobileSelectionModel} = await (
      0,
      eval
    )('import("/features/passmanager/models/pm-mobile-selection.model.ts")')
    const {pmMobileChromeModel} = await (
      0,
      eval
    )('import("/features/passmanager/models/pm-mobile-chrome.model.ts")')
    if (!id) {
      return {hasEntry: false, commandResult: false, selectedCount: 0}
    }

    pmMobileSelectionModel.enterWithEntry(id)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const toolbar = deepFind(document, 'mobile-top-toolbar') as (HTMLElement & {
      actions?: Array<{id: string}>
    }) | null
    const actionIds = Array.isArray(toolbar?.actions) ? toolbar.actions.map((action) => action.id) : []

    return {
      hasEntry: true,
      commandResult: pmMobileChromeModel.executeCommand('pm-selection-delete'),
      actionIds,
      selectedCount: pmMobileSelectionModel.selectedCount(),
    }
  }, entryId)

  expect(commandState).toMatchObject({
    hasEntry: true,
    commandResult: true,
    selectedCount: 1,
  })

  const dialogBounds = await page.waitForFunction(
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

      const confirm = deepFind(document, 'cv-confirm-dialog') as HTMLElement | null
      const dialog = confirm?.shadowRoot?.querySelector('cv-dialog') as HTMLElement | null
      const content = dialog?.shadowRoot?.querySelector('[part="content"]') as HTMLElement | null
      if (!content) return null

      const rect = content.getBoundingClientRect()
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }
    },
    undefined,
    {timeout: 7_000},
  )

  const bounds = await dialogBounds.jsonValue()
  expect(bounds.left).toBeGreaterThanOrEqual(0)
  expect(bounds.top).toBeGreaterThanOrEqual(0)
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth)
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight)
  expect(bounds.hasHorizontalOverflow).toBe(false)
})

test('mobile entry overflow actions icon stays centered in trigger', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)
  await showFirstMobileLoginEntry(page)

  const state = await getPMMobileFabState(page)
  expect(state.hasMore).toBe(true)
  expect(state.dropdownItems).toEqual(['pm-entry-move'])

  const alignment = await getMenuButtonAlignment(
    page,
    'mobile-top-toolbar',
    'cv-menu-button.overflow-menu',
  )
  expect(alignment).not.toBeNull()
  expect(Math.abs(alignment!.deltaX)).toBeLessThan(1)
})

test('mobile entry overflow actions menu stays inside the viewport', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)
  await showFirstMobileLoginEntry(page)

  expect(
    await openMenuButton(page, 'mobile-top-toolbar', 'cv-menu-button.overflow-menu'),
  ).toBe(true)
  await page.waitForTimeout(150)

  const rect = await getMenuButtonPopupRect(page, 'mobile-top-toolbar', 'cv-menu-button.overflow-menu')
  const triggerRect = await getMenuButtonTriggerRect(
    page,
    'mobile-top-toolbar',
    'cv-menu-button.overflow-menu',
  )
  const viewport = page.viewportSize()

  expect(rect).not.toBeNull()
  expect(triggerRect).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(rect!.left).toBeGreaterThanOrEqual(0)
  expect(rect!.top).toBeGreaterThanOrEqual(0)
  expect(rect!.right).toBeLessThanOrEqual(viewport!.width)
  expect(rect!.bottom).toBeLessThanOrEqual(viewport!.height)
  expect(rect!.top).toBeGreaterThanOrEqual(triggerRect!.bottom)
})

test('mobile search sort/group button opens the bottom sheet', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  expect(await deepClick(page, '.sort-group-trigger')).toBe(true)
  await page.waitForTimeout(150)
  const state = await getPMMobileFabState(page)
  expect(state.commandOpen).toBe(false)
  expect(state.sortGroupSheetOpen).toBe(true)
})

test('mobile switches toolbar stacks by context and hides actions in create/import surfaces', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  let state = await getPMMobileFabState(page)
  expect(state.actionsHidden).toBe(false)
  expect(state.fabOrder).toEqual(['pm-create-group', 'pm-create-entry'])

  await showFirstMobileLoginEntry(page)
  state = await getPMMobileFabState(page)
  expect(state.actionsHidden).toBe(false)
  expect(state.fabOrder).toEqual(['pm-entry-copy-all', 'pm-entry-delete'])
  expect(state.dropdownItems).toEqual(['pm-entry-move'])
  expect(state.hasCreateGroup).toBe(false)
  expect(state.hasCreateEntry).toBe(false)

  const entryActionState = await page.evaluate(() => {
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
    return {
      hasActionRail: Boolean(root?.querySelector('.action-rail')),
      inlineActionCount: root?.querySelectorAll('.quick-action').length ?? 0,
      hasPrimaryCard: Boolean(root?.querySelector('.primary-card')),
      hasWebsiteRow: Boolean(root?.querySelector('.website-row')),
    }
  })

  expect(entryActionState.hasActionRail).toBe(false)
  expect(entryActionState.hasPrimaryCard).toBe(true)
  expect(entryActionState.hasWebsiteRow).toBe(true)
  expect(entryActionState.inlineActionCount).toBeGreaterThan(0)

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

  expect(await deepClick(page, '.entry-edit-entry-action')).toBe(true)
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

      const entry = deepFind(document, 'pm-entry-mobile') as HTMLElement | null
      const root = entry?.shadowRoot
      return Boolean(root?.querySelector('mobile-bottom-action-footer.entry-action-footer[columns="2"]'))
        && Boolean(root?.querySelector('.entry-edit-save-action'))
        && Boolean(root?.querySelector('.entry-edit-note-input'))
    },
    undefined,
    {timeout: 10_000},
  )

  await page.evaluate(() => {
    ;(window as any).passmanager.showElement.set('createEntry')
  })
  await page.waitForFunction(() => (window as any).passmanager?.showElement?.() === 'createEntry', undefined, {
    timeout: 10_000,
  })
  state = await getPMMobileFabState(page)
  expect(state.actionsHidden).toBe(true)

  await page.evaluate(() => {
    ;(window as any).passmanager.showElement.set('createGroup')
  })
  await page.waitForFunction(() => (window as any).passmanager?.showElement?.() === 'createGroup', undefined, {
    timeout: 10_000,
  })
  state = await getPMMobileFabState(page)
  expect(state.actionsHidden).toBe(true)

  await page.evaluate(() => {
    ;(window as any).passmanager.showElement.set('importDialog')
  })
  await page.waitForFunction(() => (window as any).passmanager?.showElement?.() === 'importDialog', undefined, {
    timeout: 10_000,
  })
  state = await getPMMobileFabState(page)
  expect(state.actionsHidden).toBe(true)

  await page.evaluate(() => {
    const pm = (window as any).passmanager
    pm.showElement.set(pm)
  })
  await page.waitForFunction(
    () => {
      const pm = (window as any).passmanager
      const current = pm?.showElement?.()
      return current === pm && pm?.isEditMode?.() === false
    },
    undefined,
    {timeout: 10_000},
  )
  state = await getPMMobileFabState(page)
  expect(state.actionsHidden).toBe(false)
  expect(state.fabOrder).toEqual(['pm-create-group', 'pm-create-entry'])
})

test('mobile create entry footer uses ios native scroll-action offset without a second keyboard lift', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  await page.evaluate(() => {
    ;(window as any).passmanager.showElement.set('createEntry')
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

      const createEntry = deepFind(document, 'pm-entry-create-mobile') as HTMLElement | null
      return Boolean(createEntry?.shadowRoot?.querySelector('.create-footer cv-button'))
    },
    undefined,
    {timeout: 10_000},
  )

  const footerState = await page.evaluate(async () => {
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

    const createEntry = deepFind(document, 'pm-entry-create-mobile') as HTMLElement | null
    const footer = createEntry?.shadowRoot?.querySelector('.create-footer') as HTMLElement | null
    const button = footer?.querySelector('cv-button') as HTMLElement | null
    const buttonBase = button?.shadowRoot?.querySelector('[part="base"]') as HTMLElement | null
    if (!footer || !buttonBase) {
      return null
    }

    const root = document.documentElement
    root.toggleAttribute('data-mobile-keyboard-expanded', true)
    root.toggleAttribute('data-native-keyboard-insets', true)
    root.toggleAttribute('data-ios-native-keyboard-insets', true)
    root.toggleAttribute('data-mobile-keyboard-native-resize', true)
    root.style.setProperty('--native-keyboard-bottom-inset', '286px')
    root.style.setProperty('--visual-viewport-bottom-inset', '0px')
    root.style.setProperty('--mobile-keyboard-bottom-inset', '286px')
    root.style.setProperty('--mobile-keyboard-scroll-action-offset', '0px')
    root.style.setProperty('--mobile-keyboard-scroll-clearance', '0px')
    root.style.setProperty('--mobile-keyboard-overlay-offset', '0px')

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const buttonBaseStyle = getComputedStyle(buttonBase)
    const footerStyle = getComputedStyle(footer)
    return {
      buttonBaseBackground: buttonBaseStyle.backgroundColor,
      footerScrollActionOffset: footerStyle.getPropertyValue('--mobile-keyboard-scroll-action-offset'),
      visualViewportInset: root.style.getPropertyValue('--visual-viewport-bottom-inset'),
    }
  })

  expect(footerState).not.toBeNull()
  expect(footerState!.footerScrollActionOffset.trim()).toBe('0px')
  expect(footerState!.visualViewportInset.trim()).toBe('0px')
  expect(footerState!.buttonBaseBackground).not.toBe('rgba(0, 0, 0, 0)')
})

test('mobile entry password double tap opens full edit mode and focuses password', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  await showFirstMobileLoginEntry(page)
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

    const entry = deepFind(document, 'pm-entry-mobile') as HTMLElement | null
    return Boolean(entry?.shadowRoot?.querySelector('.primary-card'))
  }, undefined, {timeout: 10_000})

  const readSurface = await page.evaluate(() => {
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
    return {
      hasActionRail: Boolean(root?.querySelector('.action-rail')),
      hasPasswordLongPressTarget: Boolean(root?.querySelector('[data-credential-edit-field="password"]')),
      hasPasswordValueTarget: Boolean(root?.querySelector('[data-credential-edit-value="password"]')),
      hasPrimaryCard: Boolean(root?.querySelector('.primary-card')),
    }
  })

  expect(readSurface.hasActionRail).toBe(false)
  expect(readSurface.hasPasswordLongPressTarget).toBe(true)
  expect(readSurface.hasPasswordValueTarget).toBe(true)
  expect(readSurface.hasPrimaryCard).toBe(true)

  expect(
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

      const target = deepFind(document, '[data-credential-edit-field="password"]') as HTMLElement | null
      if (!target) return false
      target.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, composed: true}))
      return true
    }),
  ).toBe(true)
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

      const entry = deepFind(document, 'pm-entry-mobile') as HTMLElement | null
      const root = entry?.shadowRoot
      const passwordInput = root?.querySelector('cv-input[name="inline-password"]') as
        | (HTMLElement & {shadowRoot?: ShadowRoot})
        | null
      const nativeInput = passwordInput?.shadowRoot?.querySelector('input')

      return Boolean(passwordInput)
        && Boolean(root?.querySelector('.entry-edit-save-action'))
        && Boolean(root?.querySelector('.entry-edit-cancel-action'))
        && root?.activeElement === passwordInput
        && passwordInput?.shadowRoot?.activeElement === nativeInput
    },
    undefined,
    {timeout: 10_000},
  )
  expect(await deepQuerySelector(page, '.inline-edit-save')).toBe(false)
  expect(await deepQuerySelector(page, '.inline-edit-cancel')).toBe(false)
  expect(await deepQuerySelector(page, 'pm-entry-edit-mobile')).toBe(false)
})

test('mobile entry title double tap opens full edit mode and focuses title', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  await showFirstMobileLoginEntry(page)
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

    return Boolean(deepFind(document, '[data-entry-title-edit-field="title"]'))
  }, undefined, {timeout: 10_000})

  expect(
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

      const target = deepFind(document, '[data-entry-title-edit-field="title"]') as HTMLElement | null
      if (!target) return false
      target.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, cancelable: true, composed: true}))
      return true
    }),
  ).toBe(true)
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

      const entry = deepFind(document, 'pm-entry-mobile') as HTMLElement | null
      const root = entry?.shadowRoot
      const titleInput = root?.querySelector('cv-input[name="inline-title"]') as
        | (HTMLElement & {shadowRoot?: ShadowRoot})
        | null
      const nativeInput = titleInput?.shadowRoot?.querySelector('input')

      return Boolean(titleInput)
        && Boolean(root?.querySelector('.entry-edit-save-action'))
        && Boolean(root?.querySelector('.entry-edit-cancel-action'))
        && root?.activeElement === titleInput
        && titleInput?.shadowRoot?.activeElement === nativeInput
    },
    undefined,
    {timeout: 10_000},
  )
  expect(await deepQuerySelector(page, '.inline-edit-save')).toBe(false)
  expect(await deepQuerySelector(page, '.inline-edit-cancel')).toBe(false)
  expect(await deepQuerySelector(page, 'pm-entry-edit-mobile')).toBe(false)
})

test('mobile entry edit keeps bottom clearance when the keyboard inset is active', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  await showFirstMobileLoginEntry(page)

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

      const entry = deepFind(document, 'pm-entry-mobile') as HTMLElement | null
      return Boolean(entry?.shadowRoot?.querySelector('.entry-edit-entry-action'))
    },
    undefined,
    {timeout: 10_000},
  )

  expect(await deepClick(page, '.entry-edit-entry-action')).toBe(true)
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

      const entry = deepFind(document, 'pm-entry-mobile') as HTMLElement | null
      const root = entry?.shadowRoot
      return Boolean(root?.querySelector('mobile-bottom-action-footer.entry-action-footer[columns="2"]'))
        && Boolean(root?.querySelector('.entry-edit-save-action'))
        && Boolean(root?.querySelector('.entry-edit-note-input'))
    },
    undefined,
    {timeout: 10_000},
  )

  const clearance = await page.evaluate(async () => {
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

    const rootElement = document.documentElement
    const mobileShell = deepFind(document, 'file-app-shell-mobile-layout') as HTMLElement | null
    const entry = deepFind(document, 'pm-entry-mobile') as HTMLElement | null
    const entryRoot = entry?.shadowRoot
    const footer = entryRoot?.querySelector('.entry-action-footer') as HTMLElement | null
    const entryScroll = entryRoot?.querySelector('.entry-scroll') as HTMLElement | null
    const noteInput = entryRoot?.querySelector('.entry-edit-note-input') as HTMLElement | null
    const saveAction = entryRoot?.querySelector('.entry-edit-save-action') as HTMLElement | null
    const cancelAction = entryRoot?.querySelector('.entry-edit-cancel-action') as HTMLElement | null
    if (!mobileShell || !entry || !footer || !entryScroll || !saveAction || !cancelAction) {
      return null
    }

    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const bottomChromeClearance = 64
    const previousInset = rootElement.style.getPropertyValue('--visual-viewport-bottom-inset')
    const hadKeyboardExpanded = rootElement.hasAttribute('data-mobile-keyboard-expanded')
    const previousKeyboardExpanded = rootElement.getAttribute('data-mobile-keyboard-expanded')
    const previousShellBottomChrome = mobileShell.style.getPropertyValue('--mobile-tab-bar-content-clearance')

    try {
      rootElement.style.setProperty('--visual-viewport-bottom-inset', '240px')
      rootElement.setAttribute('data-mobile-keyboard-expanded', '')
      mobileShell.style.setProperty('--mobile-tab-bar-content-clearance', `${bottomChromeClearance}px`)
      await nextFrame()
      const beforeRect = footer.getBoundingClientRect()

      entryScroll.scrollTop = entryScroll.scrollHeight
      await nextFrame()
      const afterRect = footer.getBoundingClientRect()
      const entryRect = entry.getBoundingClientRect()
      const saveRect = saveAction.getBoundingClientRect()
      const cancelRect = cancelAction.getBoundingClientRect()
      const bodyStyle = getComputedStyle(document.body)
      const keyboardTop = entryRect.bottom - 240
      const viewportKeyboardTop = window.innerHeight - 240
      const maxScroll = entryScroll.scrollHeight - entryScroll.clientHeight
      return {
        bodyPaddingBottom: Number.parseFloat(bodyStyle.paddingBottom),
        bottomChromeClearance,
        cancelButtonKeyboardGap: keyboardTop - cancelRect.bottom,
        cancelButtonViewportKeyboardGap: viewportKeyboardTop - cancelRect.bottom,
        footerBottomClearance: entryRect.bottom - afterRect.bottom,
        footerDeltaBottom: Math.abs(afterRect.bottom - beforeRect.bottom),
        footerDeltaTop: Math.abs(afterRect.top - beforeRect.top),
        hostOverflowY: getComputedStyle(entry).overflowY,
        keyboardExpanded: rootElement.hasAttribute('data-mobile-keyboard-expanded'),
        maxScroll,
        noteInputExists: Boolean(noteInput),
        saveButtonKeyboardGap: keyboardTop - saveRect.bottom,
        saveButtonViewportKeyboardGap: viewportKeyboardTop - saveRect.bottom,
        scrollAtBottom: Math.abs(entryScroll.scrollTop - maxScroll) <= 1,
        scrollOverflowY: getComputedStyle(entryScroll).overflowY,
      }
    } finally {
      if (previousInset) {
        rootElement.style.setProperty('--visual-viewport-bottom-inset', previousInset)
      } else {
        rootElement.style.removeProperty('--visual-viewport-bottom-inset')
      }

      if (hadKeyboardExpanded) {
        rootElement.setAttribute('data-mobile-keyboard-expanded', previousKeyboardExpanded ?? '')
      } else {
        rootElement.removeAttribute('data-mobile-keyboard-expanded')
      }

      if (previousShellBottomChrome) {
        mobileShell.style.setProperty('--mobile-tab-bar-content-clearance', previousShellBottomChrome)
      } else {
        mobileShell.style.removeProperty('--mobile-tab-bar-content-clearance')
      }
    }
  })

  expect(clearance).not.toBeNull()
  expect(clearance!.keyboardExpanded).toBe(true)
  expect(clearance!.noteInputExists).toBe(true)
  expect(clearance!.hostOverflowY).toBe('hidden')
  expect(clearance!.scrollOverflowY).toBe('auto')
  expect(clearance!.maxScroll).toBeGreaterThan(0)
  expect(clearance!.scrollAtBottom).toBe(true)
  expect(clearance!.footerDeltaTop).toBeLessThanOrEqual(1)
  expect(clearance!.footerDeltaBottom).toBeLessThanOrEqual(1)
  expect(clearance!.footerBottomClearance).toBeLessThanOrEqual(1)
  expect(clearance!.bodyPaddingBottom).toBeGreaterThanOrEqual(230)
  expect(clearance!.bodyPaddingBottom).toBeLessThan(240 + clearance!.bottomChromeClearance)
  expect(clearance!.saveButtonViewportKeyboardGap).toBeGreaterThanOrEqual(10)
  expect(clearance!.cancelButtonViewportKeyboardGap).toBeGreaterThanOrEqual(10)
})

test('mobile entry create keeps bottom action in flow above active keyboard inset', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  await page.evaluate(() => {
    ;(window as any).passmanager.showElement.set('createEntry')
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

      const create = deepFind(document, 'pm-entry-create-mobile') as HTMLElement | null
      const root = create?.shadowRoot
      return Boolean(root?.querySelector('.create-scroll'))
        && Boolean(root?.querySelector('.create-footer'))
        && Boolean(root?.querySelector('.create-footer cv-button'))
    },
    undefined,
    {timeout: 10_000},
  )

  const clearance = await page.evaluate(async () => {
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

    const rootElement = document.documentElement
    const mobileShell = deepFind(document, 'file-app-shell-mobile-layout') as HTMLElement | null
    const create = deepFind(document, 'pm-entry-create-mobile') as HTMLElement | null
    const createRoot = create?.shadowRoot
    const scroll = createRoot?.querySelector('.create-scroll') as HTMLElement | null
    const footer = createRoot?.querySelector('.create-footer') as HTMLElement | null
    const submit = footer?.querySelector('cv-button') as HTMLElement | null
    if (!mobileShell || !create || !scroll || !footer || !submit) {
      return null
    }

    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const bottomChromeClearance = 64
    const previousInset = rootElement.style.getPropertyValue('--visual-viewport-bottom-inset')
    const hadKeyboardExpanded = rootElement.hasAttribute('data-mobile-keyboard-expanded')
    const previousKeyboardExpanded = rootElement.getAttribute('data-mobile-keyboard-expanded')
    const previousShellBottomChrome = mobileShell.style.getPropertyValue('--mobile-tab-bar-content-clearance')

    try {
      await nextFrame()
      const closedCreateRect = create.getBoundingClientRect()
      const closedSubmitRect = submit.getBoundingClientRect()

      rootElement.style.setProperty('--visual-viewport-bottom-inset', '240px')
      rootElement.setAttribute('data-mobile-keyboard-expanded', '')
      mobileShell.style.setProperty('--mobile-tab-bar-content-clearance', `${bottomChromeClearance}px`)
      await nextFrame()

      scroll.scrollTop = scroll.scrollHeight
      await nextFrame()

      const createRect = create.getBoundingClientRect()
      const submitRect = submit.getBoundingClientRect()
      const keyboardTop = createRect.bottom - 240
      const viewportKeyboardTop = window.innerHeight - 240
      const maxScroll = scroll.scrollHeight - scroll.clientHeight

      return {
        closedButtonBottomGap: closedCreateRect.bottom - closedSubmitRect.bottom,
        footerOutsideScroll: !scroll.contains(footer),
        footerPosition: getComputedStyle(footer).position,
        footerUsesFlowAttribute: footer.hasAttribute('flow'),
        hostOverflowY: getComputedStyle(create).overflowY,
        keyboardExpanded: rootElement.hasAttribute('data-mobile-keyboard-expanded'),
        maxScroll,
        scrollAtBottom: Math.abs(scroll.scrollTop - maxScroll) <= 1,
        scrollOverflowY: getComputedStyle(scroll).overflowY,
        submitButtonKeyboardGap: keyboardTop - submitRect.bottom,
        submitButtonViewportKeyboardGap: viewportKeyboardTop - submitRect.bottom,
      }
    } finally {
      if (previousInset) {
        rootElement.style.setProperty('--visual-viewport-bottom-inset', previousInset)
      } else {
        rootElement.style.removeProperty('--visual-viewport-bottom-inset')
      }

      if (hadKeyboardExpanded) {
        rootElement.setAttribute('data-mobile-keyboard-expanded', previousKeyboardExpanded ?? '')
      } else {
        rootElement.removeAttribute('data-mobile-keyboard-expanded')
      }

      if (previousShellBottomChrome) {
        mobileShell.style.setProperty('--mobile-tab-bar-content-clearance', previousShellBottomChrome)
      } else {
        mobileShell.style.removeProperty('--mobile-tab-bar-content-clearance')
      }
    }
  })

  expect(clearance).not.toBeNull()
  expect(clearance!.keyboardExpanded).toBe(true)
  expect(clearance!.footerOutsideScroll).toBe(true)
  expect(clearance!.footerPosition).toBe('relative')
  expect(clearance!.footerUsesFlowAttribute).toBe(true)
  expect(clearance!.hostOverflowY).toBe('hidden')
  expect(clearance!.scrollOverflowY).toBe('auto')
  expect(clearance!.closedButtonBottomGap).toBeLessThanOrEqual(16)
  expect(clearance!.maxScroll).toBeGreaterThan(0)
  expect(clearance!.scrollAtBottom).toBe(true)
  expect(clearance!.submitButtonKeyboardGap).toBeGreaterThanOrEqual(10)
  expect(clearance!.submitButtonViewportKeyboardGap).toBeGreaterThanOrEqual(10)
})

test('mobile unlock password dialog uses sheet keyboard clearance without moving the app shell', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  await page.waitForFunction(() => Boolean((window as any).dialogService?.showInputDialog), undefined, {
    timeout: 10_000,
  })
  await page.evaluate(() => {
    void (window as any).dialogService.showInputDialog({
      title: 'Unlock vault',
      label: 'Vault password',
      type: 'password',
      required: true,
    })
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

      const inputDialog = deepFind(document, 'cv-input-dialog') as HTMLElement | null
      const sheet = inputDialog?.shadowRoot?.querySelector(
        'cv-bottom-sheet.password-input-dialog',
      ) as HTMLElement | null
      const dialog = sheet?.shadowRoot?.querySelector('cv-dialog') as HTMLElement | null
      return Boolean(dialog?.shadowRoot?.querySelector('[part="content"]'))
    },
    undefined,
    {timeout: 10_000},
  )
  await page.waitForTimeout(240)

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

    const inputDialog = deepFind(document, 'cv-input-dialog') as HTMLElement | null
    const body = inputDialog?.shadowRoot?.querySelector('.dialog-body') as HTMLElement | null
    const filler = document.createElement('div')
    filler.className = 'keyboard-footer-regression-filler'
    filler.style.blockSize = '960px'
    filler.textContent = 'Keyboard footer regression filler'
    body?.append(filler)
  })

  const beforeKeyboard = await getMobilePasswordDialogKeyboardSnapshot(page)
  expect(beforeKeyboard.appRect).not.toBeNull()
  expect(beforeKeyboard.layoutRect).not.toBeNull()
  expect(beforeKeyboard.contentRect).not.toBeNull()
  expect(beforeKeyboard.sheetRect).not.toBeNull()
  expect(beforeKeyboard.footerRect).not.toBeNull()
  expect(beforeKeyboard.primaryActionRect).not.toBeNull()
  expect(beforeKeyboard.debugActive).toBe(false)

  await page.evaluate(async () => {
    const root = document.documentElement
    root.style.setProperty('--visual-viewport-bottom-inset', '280px')
    root.style.setProperty('--password-input-dialog-keyboard-offset', '280px')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })

  const afterKeyboard = await getMobilePasswordDialogKeyboardSnapshot(page)
  expect(afterKeyboard.appRect).not.toBeNull()
  expect(afterKeyboard.layoutRect).not.toBeNull()
  expect(afterKeyboard.contentRect).not.toBeNull()
  expect(afterKeyboard.footerRect).not.toBeNull()
  expect(afterKeyboard.primaryActionRect).not.toBeNull()
  expect(afterKeyboard.inputFocused).toBe(true)
  expect(afterKeyboard.debugActive).toBe(false)
  expect(afterKeyboard.rootKeyboardInset.trim()).toBe('280px')
  expect(
    afterKeyboard.sheetKeyboardInset?.trim() === '280px'
      || Boolean(afterKeyboard.sheetKeyboardInset?.includes('--password-input-dialog-keyboard-offset')),
  ).toBe(true)
  expect(Math.abs(afterKeyboard.appRect!.top - beforeKeyboard.appRect!.top)).toBeLessThanOrEqual(1)
  expect(Math.abs(afterKeyboard.appRect!.bottom - beforeKeyboard.appRect!.bottom)).toBeLessThanOrEqual(1)
  expect(Math.abs(afterKeyboard.layoutRect!.top - beforeKeyboard.layoutRect!.top)).toBeLessThanOrEqual(1)
  expect(Math.abs(afterKeyboard.layoutRect!.bottom - beforeKeyboard.layoutRect!.bottom)).toBeLessThanOrEqual(1)
  const keyboardInset = Number.parseFloat(afterKeyboard.rootKeyboardInset)
  expect(afterKeyboard.contentRect!.bottom).toBeLessThanOrEqual(afterKeyboard.viewportHeight - keyboardInset + 1)
  expect(afterKeyboard.footerRect!.bottom).toBeLessThanOrEqual(afterKeyboard.contentRect!.bottom + 1)
  expect(afterKeyboard.footerRect!.top).toBeGreaterThanOrEqual(afterKeyboard.contentRect!.top - 1)
  expect(afterKeyboard.primaryActionRect!.bottom).toBeLessThanOrEqual(afterKeyboard.contentRect!.bottom + 1)
  expect(afterKeyboard.viewportHeight - afterKeyboard.primaryActionRect!.bottom).toBeGreaterThanOrEqual(260)

  await page.evaluate(async () => {
    const root = document.documentElement
    root.style.setProperty('--visual-viewport-bottom-inset', '0px')
    const dynamicImport = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<typeof import('../../src/shared/services/mobile-dialog-keyboard-stabilization')>
    const {syncPasswordInputDialogKeyboardOffset} = await dynamicImport(
      '/shared/services/mobile-dialog-keyboard-stabilization.ts',
    )
    syncPasswordInputDialogKeyboardOffset(0)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  await page.waitForTimeout(220)

  const afterKeyboardClosed = await getMobilePasswordDialogKeyboardSnapshot(page)
  expect(afterKeyboardClosed.contentRect).not.toBeNull()
  expect(afterKeyboardClosed.rootKeyboardInset.trim()).toBe('0px')
  expect(afterKeyboardClosed.passwordDialogKeyboardOffset.trim()).toBe('0px')
  expect(afterKeyboardClosed.contentRect!.bottom).toBeGreaterThan(afterKeyboard.contentRect!.bottom)
  expect(afterKeyboardClosed.contentRect!.bottom).toBeLessThanOrEqual(afterKeyboardClosed.viewportHeight + 1)
})

test('mobile context selection on entry enters selection mode without bootstrap reinit and done restores navigation', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  const logs: string[] = []
  const onConsole = (msg: import('playwright').ConsoleMessage) => {
    logs.push(msg.text())
  }
  page.on('console', onConsole)

  try {
    logs.length = 0

    const entryId = await findFirstLoginEntryId(page)
    if (!entryId) {
      throw new Error('No login entry found for mobile selection test')
    }

    expect(
      await page.evaluate((id) => {
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

        const row = deepFind(document, `[data-entry-id="${id}"]`) as HTMLElement | null
        if (!row) return false
        row.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, composed: true, cancelable: true}))
        return true
      }, entryId),
    ).toBe(true)
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

        const toolbar = deepFind(document, 'mobile-top-toolbar') as (HTMLElement & {
          actions?: Array<{id: string}>
        }) | null
        const actionIds = Array.isArray(toolbar?.actions) ? toolbar.actions.map((action) => action.id) : []
        const selectedCount = deepQueryAll(document, '.list-item.selected').length
        return actionIds.includes('pm-selection-done') && selectedCount === 1

        function deepQueryAll(root: Document | ShadowRoot, selector: string): Element[] {
          const matches = Array.from(root.querySelectorAll(selector))
          for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) {
              matches.push(...deepQueryAll(el.shadowRoot, selector))
            }
          }
          return matches
        }
      },
      undefined,
      {timeout: 5_000},
    )

    let state = await getPMMobileSelectionState(page)
    expect(state).toMatchObject({
      showType: 'ManagerRoot',
      kind: 'passwords-selection',
      selectedCount: 1,
      entrySelected: true,
    })
    expect(state.actionIds).toEqual([
      'pm-selection-done',
      'pm-selection-edit',
      'pm-selection-move',
      'pm-selection-delete',
    ])
    expect(logs.some((line) => line.includes('[dashboard] init()'))).toBe(false)
    expect(logs.some((line) => line.includes('AppContext already initialized'))).toBe(false)
    expect(logs.some((line) => line.includes('runPassmanagerReload: start'))).toBe(false)

    expect(
      await page.evaluate(async (id) => {
        const {pmMobileSelectionModel} = await (
          0,
          eval
        )('import("/features/passmanager/models/pm-mobile-selection.model.ts")')
        pmMobileSelectionModel.toggleEntry(id)
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        return {
          selectedCount: pmMobileSelectionModel.selectedCount(),
          entrySelected: pmMobileSelectionModel.isEntrySelected(id),
        }
      }, entryId),
    ).toMatchObject({selectedCount: 0, entrySelected: false})

    state = await getPMMobileSelectionState(page)
    expect(state).toMatchObject({
      showType: 'ManagerRoot',
      kind: 'passwords-selection',
      selectedCount: 0,
      entrySelected: false,
    })

    await page.waitForTimeout(300)
    expect(
      await page.evaluate(async () => {
        const {pmMobileChromeModel} = await (0, eval)('import("/features/passmanager/models/pm-mobile-chrome.model.ts")')
        // Let evaluate resolve before the command updates route state.
        window.setTimeout(() => {
          pmMobileChromeModel.executeCommand('pm-selection-done')
        }, 0)
        return true
      }),
    ).toBe(true)
    await page.waitForTimeout(500)

    expect(await deepClick(page, '.list-item')).toBe(true)
    await page.waitForFunction(
      () => {
        const current = (window as any).passmanager?.showElement?.()
        return current?.constructor?.name === 'Entry'
      },
      undefined,
      {timeout: 5_000},
    )

    state = await getPMMobileSelectionState(page)
    expect(state.showType).toBe('Entry')
  } finally {
    page.off('console', onConsole)
  }
})

test('desktop layout has group-tree-view in sidebar', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=desktop`)

  expect(await deepQuerySelector(page, 'group-tree-view')).toBe(true)
})

test('desktop virtual list keeps entry and group rows at 48px', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=desktop`)

  const suffix = Date.now()
  const target = {
    parentGroupName: `row-height-parent-${suffix}`,
    childGroupName: `row-height-parent-${suffix}/row-height-child`,
    groupRowLabel: 'row-height-child',
    entryWithSubtitleTitle: `row-height-entry-with-subtitle-${suffix}-${'title'.repeat(20)}`,
    entryWithoutSubtitleTitle: `row-height-entry-plain-${suffix}`,
  }

  await page.evaluate(async (target) => {
    const pm = (window as unknown as {passmanager?: unknown}).passmanager as
      | {
          load: () => Promise<void>
          entriesList: () => Array<{
            name?: string
          }>
          showElement?: {set?: (value: unknown) => void}
          managerSaver?: {secrets?: {catalog?: {transport?: {sendCatalog?: (action: string, payload: unknown) => Promise<unknown>}}}}
        }
      | undefined

    if (!pm) {
      throw new Error('passmanager is not initialized')
    }

    const transport = pm.managerSaver?.secrets?.catalog?.transport
    if (!transport?.sendCatalog) {
      throw new Error('passmanager transport is unavailable')
    }

    const ensureParent = (await transport.sendPassmanager('passmanager:group:ensure', {
      path: target.parentGroupName,
    })) as {ok?: boolean; error?: string}
    if (ensureParent?.ok === false) {
      throw new Error(`passmanager:group:ensure(parent) failed: ${String(ensureParent.error ?? 'unknown')}`)
    }

    const ensureChild = (await transport.sendPassmanager('passmanager:group:ensure', {
      path: target.childGroupName,
    })) as {ok?: boolean; error?: string}
    if (ensureChild?.ok === false) {
      throw new Error(`passmanager:group:ensure(child) failed: ${String(ensureChild.error ?? 'unknown')}`)
    }

    const saveWithSubtitle = (await transport.sendPassmanager('passmanager:entry:save', {
      title: target.entryWithSubtitleTitle,
      username: `${'very-long-username-'.repeat(12)}@example.com`,
      urls: [],
      group_path: target.parentGroupName,
    })) as {ok?: boolean; error?: string}
    if (saveWithSubtitle?.ok === false) {
      throw new Error(`passmanager:entry:save(withSubtitle) failed: ${String(saveWithSubtitle.error ?? 'unknown')}`)
    }

    const savePlain = (await transport.sendPassmanager('passmanager:entry:save', {
      title: target.entryWithoutSubtitleTitle,
      username: '',
      urls: [],
      group_path: target.parentGroupName,
    })) as {ok?: boolean; error?: string}
    if (savePlain?.ok === false) {
      throw new Error(`passmanager:entry:save(plain) failed: ${String(savePlain.error ?? 'unknown')}`)
    }

    await pm.load()

    const parentGroup = pm.entriesList().find((item) => item?.name === target.parentGroupName)
    if (!parentGroup) {
      throw new Error(`parent group ${target.parentGroupName} was not loaded`)
    }

    pm.showElement?.set?.(parentGroup)
  }, target)

  await page.waitForFunction(
    (target) => {
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

      function deepText(node: Node | null | undefined): string {
        if (!node) return ''
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent ?? ''
        }

        let text = ''
        if (node instanceof Element && node.shadowRoot) {
          text += deepText(node.shadowRoot)
        }

        for (const child of Array.from(node.childNodes)) {
          text += deepText(child)
        }

        return text
      }

      const layout = deepFind(document, 'password-manager-desktop-layout') as HTMLElement | null
      const group = layout?.shadowRoot?.querySelector('pm-group') as HTMLElement | null
      const root = group?.shadowRoot
      if (!root) return false

      const rows = Array.from(root.querySelectorAll('.group-row-wrap, .entry-row'))
      const hasGroup = rows.some(
        (row) => row.classList.contains('group-row-wrap') && deepText(row).includes(target.groupRowLabel),
      )
      const hasEntryWithSubtitle = rows.some(
        (row) => row.classList.contains('entry-row') && deepText(row).includes(target.entryWithSubtitleTitle),
      )
      const hasEntryWithoutSubtitle = rows.some(
        (row) => row.classList.contains('entry-row') && deepText(row).includes(target.entryWithoutSubtitleTitle),
      )
      return hasGroup && hasEntryWithSubtitle && hasEntryWithoutSubtitle
    },
    target,
    {timeout: 10_000},
  )

  await page.waitForFunction(
    (target) => {
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

      function deepText(node: Node | null | undefined): string {
        if (!node) return ''
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent ?? ''
        }

        let text = ''
        if (node instanceof Element && node.shadowRoot) {
          text += deepText(node.shadowRoot)
        }

        for (const child of Array.from(node.childNodes)) {
          text += deepText(child)
        }

        return text
      }

      const layout = deepFind(document, 'password-manager-desktop-layout') as HTMLElement | null
      const group = layout?.shadowRoot?.querySelector('pm-group') as HTMLElement | null
      const root = group?.shadowRoot
      if (!root) return false

      const rows = Array.from(root.querySelectorAll('.group-row-wrap, .entry-row')) as HTMLElement[]
      const findRow = (className: string, needle: string) =>
        rows.find((row) => row.classList.contains(className) && deepText(row).includes(needle)) ?? null

      const groupRow = findRow('group-row-wrap', target.groupRowLabel)
      const entryWithSubtitle = findRow('entry-row', target.entryWithSubtitleTitle)
      const entryWithoutSubtitle = findRow('entry-row', target.entryWithoutSubtitleTitle)

      return Boolean(
        groupRow?.getBoundingClientRect().height &&
          entryWithSubtitle?.getBoundingClientRect().height &&
          entryWithoutSubtitle?.getBoundingClientRect().height,
      )
    },
    target,
    {timeout: 10_000},
  )

  const layout = await getDesktopVirtualRowLayout(page, target)
  expect(layout).not.toBeNull()
  expect(layout?.groupRowHeight).not.toBeNull()
  expect(layout?.entryWithSubtitleHeight).not.toBeNull()
  expect(layout?.entryWithoutSubtitleHeight).not.toBeNull()

  expect(layout!.groupRowHeight).toBeCloseTo(48, 0)
  expect(layout!.entryWithSubtitleHeight).toBeCloseTo(48, 0)
  expect(layout!.entryWithoutSubtitleHeight).toBeCloseTo(48, 0)
  expect(layout!.titleOverflow).toBe(true)
  expect(layout!.subtitleOverflow).toBe(true)

  if (layout!.headerRowHeight !== null) {
    expect(Math.round(layout!.headerRowHeight)).not.toBe(48)
  }
})

test('desktop first click opens a lower entry row after scrolling the virtual list', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=desktop`)

  const suffix = Date.now()
  const target = {
    groupName: `scroll-open-group-${suffix}`,
    targetTitle: `scroll-open-target-${suffix}`,
    entryCount: 28,
  }

  await page.evaluate(async (target) => {
    const pm = (window as unknown as {passmanager?: unknown}).passmanager as
      | {
          load: () => Promise<void>
          entriesList: () => Array<{name?: string}>
          showElement?: {set?: (value: unknown) => void}
          managerSaver?: {secrets?: {catalog?: {transport?: {sendPassmanager?: (action: string, payload: unknown) => Promise<unknown>}}}}
        }
      | undefined

    if (!pm) {
      throw new Error('passmanager is not initialized')
    }

    const transport = pm.managerSaver?.secrets?.catalog?.transport
    if (!transport?.sendPassmanager) {
      throw new Error('passmanager transport is unavailable')
    }

    const ensureGroup = (await transport.sendPassmanager('passmanager:group:ensure', {
      path: target.groupName,
    })) as {ok?: boolean; error?: string}
    if (ensureGroup?.ok === false) {
      throw new Error(`passmanager:group:ensure failed: ${String(ensureGroup.error ?? 'unknown')}`)
    }

    for (let index = 0; index < target.entryCount; index += 1) {
      const saveResult = (await transport.sendPassmanager('passmanager:entry:save', {
        title: index === target.entryCount - 1 ? target.targetTitle : `scroll-open-entry-${target.groupName}-${index}`,
        username: `scroll-open-user-${index}`,
        urls: [],
        group_path: target.groupName,
      })) as {ok?: boolean; error?: string}

      if (saveResult?.ok === false) {
        throw new Error(`passmanager:entry:save(${index}) failed: ${String(saveResult.error ?? 'unknown')}`)
      }
    }

    await pm.load()

    const group = pm.entriesList().find((item) => item?.name === target.groupName)
    if (!group) {
      throw new Error(`group ${target.groupName} was not loaded`)
    }

    pm.showElement?.set?.(group)
  }, target)

  await page.waitForFunction(
    (target) => {
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

      const current = (window as any).passmanager?.showElement?.()
      const layout = deepFind(document, 'password-manager-desktop-layout') as HTMLElement | null
      const group = layout?.shadowRoot?.querySelector('pm-group') as HTMLElement | null
      const virtualizer = group?.shadowRoot?.querySelector('lit-virtualizer') as HTMLElement | null

      return current?.name === target.groupName && virtualizer != null
    },
    target,
    {timeout: 10_000},
  )

  await page.evaluate((targetTitle) => {
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

    const layout = deepFind(document, 'password-manager-desktop-layout') as HTMLElement | null
    const group = layout?.shadowRoot?.querySelector('pm-group') as HTMLElement | null
    const virtualizer = group?.shadowRoot?.querySelector('lit-virtualizer') as HTMLElement | null
    if (!virtualizer) {
      throw new Error('desktop virtualizer was not found')
    }

    virtualizer.scrollTop = 48 * 24
    virtualizer.dispatchEvent(new Event('scroll'))
    virtualizer.dispatchEvent(new Event('scrollend'))
  }, target.targetTitle)

  await page.waitForFunction(
    (targetTitle) => {
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

      function deepText(node: Node | null | undefined): string {
        if (!node) return ''
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent ?? ''
        }

        let text = ''
        if (node instanceof Element && node.shadowRoot) {
          text += deepText(node.shadowRoot)
        }

        for (const child of Array.from(node.childNodes)) {
          text += deepText(child)
        }

        return text
      }

      const layout = deepFind(document, 'password-manager-desktop-layout') as HTMLElement | null
      const group = layout?.shadowRoot?.querySelector('pm-group') as HTMLElement | null
      const root = group?.shadowRoot
      if (!root) return false

      return Array.from(root.querySelectorAll('.entry-row')).some((row) => deepText(row).includes(targetTitle))
    },
    target.targetTitle,
    {timeout: 10_000},
  )

  const clickPoint = await getDesktopEntryClickPoint(page, target.targetTitle)
  expect(clickPoint).not.toBeNull()
  expect(clickPoint!.scrollTop).toBeGreaterThan(0)

  expect(
    await page.evaluate((targetTitle) => {
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

      function deepText(node: Node | null | undefined): string {
        if (!node) return ''
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent ?? ''
        }

        let text = ''
        if (node instanceof Element && node.shadowRoot) {
          text += deepText(node.shadowRoot)
        }

        for (const child of Array.from(node.childNodes)) {
          text += deepText(child)
        }

        return text
      }

      const layout = deepFind(document, 'password-manager-desktop-layout') as HTMLElement | null
      const group = layout?.shadowRoot?.querySelector('pm-group') as HTMLElement | null
      const root = group?.shadowRoot
      if (!root) return false

      const targetRow = Array.from(root.querySelectorAll('.entry-row')).find((row) => deepText(row).includes(targetTitle))
      if (!(targetRow instanceof HTMLElement)) return false

      const entryHost = targetRow.querySelector('pm-entry-list-item') as HTMLElement | null
      const targetSurface = entryHost?.shadowRoot?.querySelector('.list-item') as HTMLElement | null
      if (!targetSurface) return false

      targetSurface.click()
      return true
    }, target.targetTitle),
  ).toBe(true)

  await page.waitForFunction(
    (targetTitle) => {
      const current = (window as any).passmanager?.showElement?.()
      return current?.constructor?.name === 'Entry' && current?.title === targetTitle
    },
    target.targetTitle,
    {timeout: 10_000},
  )
})

test('desktop backspace exits nested groups even when sidebar tree row keeps focus', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=desktop`)

  const suffix = Date.now()
  const labels = {
    parent: `nav-parent-${suffix}`,
    child: `nav-parent-${suffix}/nav-child`,
    sibling: `nav-sibling-${suffix}`,
  }

  await page.evaluate((labels) => {
    const pm = (window as unknown as {passmanager?: unknown}).passmanager as
      | {
          createGroup: (data: {name: string; icon?: unknown; entries: unknown[]}) => void
          entriesList: () => Array<{name?: string}>
          showElement?: {set?: (value: unknown) => void}
          managerSaver?: {save?: (key: string, value: unknown) => Promise<boolean>}
        }
      | undefined

    if (!pm) {
      throw new Error('passmanager is not initialized')
    }

    if (pm.managerSaver?.save) {
      pm.managerSaver.save = async () => true
    }

    pm.showElement?.set?.(pm)
    pm.createGroup({name: labels.parent, icon: undefined, entries: []})
    pm.createGroup({name: labels.child, icon: undefined, entries: []})
    pm.createGroup({name: labels.sibling, icon: undefined, entries: []})

    const childGroup = pm.entriesList().find((item) => item?.name === labels.child)
    if (!childGroup) {
      throw new Error(`child group ${labels.child} was not created`)
    }

    pm.showElement?.set?.(childGroup)
  }, labels)

  const getDesktopGroupTitle = () =>
    page.evaluate(() => {
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

      const layout = deepFind(document, 'password-manager-desktop-layout') as HTMLElement | null
      const group = layout?.shadowRoot?.querySelector('pm-group') as HTMLElement | null
      const header = group?.shadowRoot?.querySelector('pm-workspace-header') as (HTMLElement & {title?: string}) | null
      return header?.title?.trim() ?? null
    })

  await page.waitForFunction(
    (labels) => {
      const current = (window as any).passmanager?.showElement?.()
      return current?.name === labels.child
    },
    labels,
    {timeout: 10_000},
  )

  expect(await getDesktopGroupTitle()).toBe('nav-child')

  expect(
    await page.evaluate((label) => {
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

      const layout = deepFind(document, 'password-manager-desktop-layout') as HTMLElement | null
      const tree = layout?.shadowRoot?.querySelector('group-tree-view') as HTMLElement | null
      const rows = Array.from(tree?.shadowRoot?.querySelectorAll<HTMLElement>('.row') ?? [])
      const target = rows.find((row) => row.querySelector('.name')?.textContent?.trim() === label)
      target?.focus()
      return target === tree?.shadowRoot?.activeElement
    }, labels.sibling),
  ).toBe(true)

  await page.keyboard.press('Backspace')

  await page.waitForFunction(
    (labels) => {
      const current = (window as any).passmanager?.showElement?.()
      return current?.name === labels.parent
    },
    labels,
    {timeout: 10_000},
  )

  expect(await getDesktopGroupTitle()).toBe(labels.parent)

  expect(
    await page.evaluate((label) => {
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

      const layout = deepFind(document, 'password-manager-desktop-layout') as HTMLElement | null
      const tree = layout?.shadowRoot?.querySelector('group-tree-view') as HTMLElement | null
      const rows = Array.from(tree?.shadowRoot?.querySelectorAll<HTMLElement>('.row') ?? [])
      const target = rows.find((row) => row.querySelector('.name')?.textContent?.trim() === label)
      target?.click()
      return Boolean(target)
    }, labels.sibling),
  ).toBe(true)

  await page.waitForFunction(
    (labels) => {
      const current = (window as any).passmanager?.showElement?.()
      return current?.name === labels.sibling
    },
    labels,
    {timeout: 10_000},
  )

  expect(await getDesktopGroupTitle()).toBe(labels.sibling)
})
