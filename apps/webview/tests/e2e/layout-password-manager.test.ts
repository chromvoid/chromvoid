import {expect, test} from 'vitest'

import {
  clearMockPassmanagerState,
  clearMockTransportLog,
  readMockTransportLog,
  writeMockPassmanagerState,
} from './utils'

import type {ConsoleMessage, Page} from 'playwright'
import type * as KeyboardStabilizationModule from '../../src/shared/services/mobile-dialog-keyboard-stabilization'
declare global {
  var __E2E_PAGE__: Page | undefined
}

const BASE_URL = 'http://localhost:4400/index.html'
const LONG_LAYOUT_PASSWORD = 'long-layout-password-'.repeat(24)

async function seedLayoutPassmanagerFixture(password = 'layout-password'): Promise<void> {
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
          tags: ['Work'],
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
    secrets: [['layout-root-login:password', password]],
    otpSecrets: [],
    icons: [],
  })
}

async function seedScrollablePassmanagerFixture(): Promise<void> {
  await clearMockPassmanagerState()
  await writeMockPassmanagerState({
    version: 1,
    revision: 1,
    nextNodeId: 1,
    folders: Array.from({length: 40}, (_, index) => `scroll-folder-${String(index).padStart(2, '0')}`),
    foldersMeta: [],
    entries: [],
    secrets: [],
    otpSecrets: [],
    icons: [],
  })
}

async function seedGroupingVirtualizerFixture(): Promise<void> {
  const baseTimestamp = Date.UTC(2026, 0, 20, 12)
  const entries = Array.from({length: 36}, (_, index) => {
    const id = `grouping-entry-${String(index).padStart(2, '0')}`
    return {
      nodeId: index + 2,
      meta: {
        id,
        title: `Grouping Entry ${String(index).padStart(2, '0')}`,
        username: `grouping-user-${index}@example.test`,
        urls: [
          {
            value: `https://site-${index % 6}.example.test/account/${index}`,
            match: 'base_domain',
          },
        ],
        createdTs: baseTimestamp - index * 86_400_000,
        updatedTs: baseTimestamp - (index % 12) * 86_400_000,
      },
    }
  })

  await clearMockPassmanagerState()
  await writeMockPassmanagerState({
    version: 1,
    revision: 1,
    nextNodeId: entries.length + 2,
    folders: [],
    foldersMeta: [],
    entries,
    secrets: entries.map((entry, index) => [
      `${entry.meta.id}:password`,
      index % 5 === 0 ? 'abc' : `Grouping-Strong-${index}!-${index * 17}`,
    ]),
    otpSecrets: [],
    icons: [],
  })
}

async function applyLayoutEmulation(
  page: Page,
  layout: 'mobile' | 'desktop' | null,
  width = 390,
  height = 844,
): Promise<void> {
  if (page.context().browser()?.browserType().name() !== 'chromium') {
    await page.setViewportSize({width, height})
    return
  }

  const client = await page.context().newCDPSession(page)

  if (layout === 'mobile') {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
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
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await client.send('Emulation.setTouchEmulationEnabled', {
    enabled: false,
    maxTouchPoints: 1,
  })
  await page.waitForTimeout(50)
}

async function deepQuerySelector(page: Page, selector: string): Promise<boolean> {
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
  hasCredentialsHeader: boolean
  hasCredentialsSortControls: boolean
  hasCredentialsFilterControls: boolean
  hasSlottedCredentialsFilterControls: boolean
  hasLegacyCredentialsFilterRow: boolean
  hasCredentialsManageAction: boolean
  credentialsManageText: string | null
  credentialsManageAriaLabel: string | null
  credentialsManageIconName: string | null
  credentialsFilterSelectionMode: string | null
  credentialsFilterChipValues: string[]
  credentialsSelectedFilterChipValues: string[]
  hasCredentialsDirectionControl: boolean
  credentialsSortValue: string | null
  credentialsGroupValue: string | null
  credentialsSortRect: {
    width: number
    height: number
  } | null
  credentialsGroupRect: {
    width: number
    height: number
  } | null
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
  actionsRect: {
    left: number
    right: number
    top: number
    bottom: number
    width: number
    height: number
  } | null
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

async function deepClick(page: Page, selector: string): Promise<boolean> {
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
  page: Page,
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

type PMMobileSecurityRowGeometry = {
  entry: {left: number; top: number; width: number; height: number}
  group: {left: number; top: number; width: number; height: number}
}

async function getMobileSecurityRowGeometry(page: Page): Promise<PMMobileSecurityRowGeometry | null> {
  return page.evaluate(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found instanceof Element && found.isConnected) return found
      for (const el of root.querySelectorAll('*')) {
        if (!el.shadowRoot) continue
        const inner = deepFind(el.shadowRoot, selector)
        if (inner instanceof Element && inner.isConnected) return inner
      }
      return null
    }

    const entry = deepFind(document, '.list-item[data-entry-id="layout-root-login"]') as HTMLElement | null
    const group = deepFind(document, '.group-row') as HTMLElement | null
    if (!entry || !group) return null

    const toGeometry = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }
    }

    return {entry: toGeometry(entry), group: toGeometry(group)}
  })
}

async function _dispatchTrustedLongPress(page: Page, selector: string, holdMs = 650): Promise<void> {
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

async function dispatchTrustedSwipeLeft(page: Page, selector: string): Promise<void> {
  const rect = await getDeepRect(page, selector)
  if (!rect) {
    throw new Error(`swipe target not found: ${selector}`)
  }

  await dispatchTrustedSwipeLeftAt(page, rect)
}

async function dispatchTrustedSwipeLeftAt(page: Page, point: {x: number; y: number}): Promise<void> {
  const client = await page.context().newCDPSession(page)

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: point.x, y: point.y, radiusX: 3, radiusY: 3, force: 1, id: 1}],
  })
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{x: point.x - 80, y: point.y, radiusX: 3, radiusY: 3, force: 1, id: 1}],
  })
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
}

async function waitForDeepAttribute(
  page: Page,
  selector: string,
  attribute: string,
  value: string,
): Promise<void> {
  await page.waitForFunction(
    ({targetSelector, attributeName, expectedValue}) => {
      function deepFind(root: Document | ShadowRoot, nestedSelector: string): Element | null {
        const found = root.querySelector(nestedSelector)
        if (found) return found
        for (const element of root.querySelectorAll('*')) {
          if (element.shadowRoot) {
            const nested = deepFind(element.shadowRoot, nestedSelector)
            if (nested) return nested
          }
        }
        return null
      }

      return deepFind(document, targetSelector)?.getAttribute(attributeName) === expectedValue
    },
    {targetSelector: selector, attributeName: attribute, expectedValue: value},
  )
}

async function confirmDeepDialog(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const nested = deepFind(element.shadowRoot, selector)
          if (nested) return nested
        }
      }
      return null
    }

    return Boolean(deepFind(document, '[data-confirm-action="confirm"]'))
  })
  expect(await deepClick(page, '[data-confirm-action="confirm"]')).toBe(true)
}

async function getPMMobileSelectionState(page: Page): Promise<PMMobileSelectionState> {
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

    const toolbar = deepFind(document, 'mobile-top-toolbar') as
      | (HTMLElement & {
          actions?: Array<{id: string}>
        })
      | null
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

async function getMobilePasswordDialogKeyboardSnapshot(page: Page): Promise<PasswordDialogKeyboardSnapshot> {
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
        Boolean(input) &&
        inputDialog?.shadowRoot?.activeElement === input &&
        input?.shadowRoot?.activeElement === nativeInput,
      layoutRect: rectOf(layout),
      passwordDialogKeyboardOffset: getComputedStyle(document.documentElement).getPropertyValue(
        '--app-runtime-dialog-password-input-keyboard-offset',
      ),
      primaryActionRect: rectOf(primaryAction),
      rootKeyboardInset: getComputedStyle(document.documentElement).getPropertyValue(
        '--app-runtime-visual-viewport-inset-block-end',
      ),
      rootVisualViewportBlockSize: getComputedStyle(document.documentElement).getPropertyValue(
        '--app-runtime-visual-viewport-block-size',
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
  page: Page,
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

async function openMenuButton(page: Page, layoutSelector: string, menuSelector: string): Promise<boolean> {
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
      const trigger = menu?.shadowRoot?.querySelector(
        '[part="trigger"], [part="dropdown"]',
      ) as HTMLElement | null
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
  page: Page,
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
  page: Page,
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
      const trigger = menu?.shadowRoot?.querySelector(
        '[part="trigger"], [part="dropdown"]',
      ) as HTMLElement | null
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

async function showFirstMobileLoginEntry(page: Page): Promise<string> {
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

async function findFirstLoginEntryId(page: Page): Promise<string | null> {
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
  page: Page,
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

    const rows = Array.from(
      root.querySelectorAll('.group-row-wrap, .group-header-row, .entry-row'),
    ) as HTMLElement[]
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
  page: Page,
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

    const targetRow = Array.from(root.querySelectorAll('.entry-row')).find((row) =>
      deepText(row).includes(targetTitle),
    )
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

async function getPMMobileFabState(page: Page): Promise<PMMobileFabState> {
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
        hasCredentialsHeader: false,
        hasCredentialsSortControls: false,
        hasCredentialsFilterControls: false,
        hasSlottedCredentialsFilterControls: false,
        hasLegacyCredentialsFilterRow: false,
        hasCredentialsManageAction: false,
        credentialsManageText: null,
        credentialsManageAriaLabel: null,
        credentialsManageIconName: null,
        credentialsFilterSelectionMode: null,
        credentialsFilterChipValues: [],
        credentialsSelectedFilterChipValues: [],
        hasCredentialsDirectionControl: false,
        credentialsSortValue: null,
        credentialsGroupValue: null,
        credentialsSortRect: null,
        credentialsGroupRect: null,
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
        actionsRect: null,
        viewportW,
        viewportH,
      }
    }

    const toolbar = deepFind(document, 'mobile-top-toolbar') as HTMLElement | null
    const toolbarRoot = toolbar?.shadowRoot ?? null
    const actions = toolbarRoot?.querySelector('.trailing') as HTMLElement | null
    const moreMenu = toolbarRoot?.querySelector('cv-menu-button.overflow-menu') as HTMLElement | null
    const credentialsHeader = deepFind(
      layout.shadowRoot,
      'workspace-dashboard-header[surface="passwords"]',
    ) as HTMLElement | null
    const credentialsHeaderRoot = credentialsHeader?.shadowRoot ?? null
    const credentialsSortControls = credentialsHeaderRoot?.querySelector(
      '.workspace-sort-control',
    ) as HTMLElement | null
    const credentialsFilterControls = credentialsHeaderRoot?.querySelector(
      'cv-chip-group.workspace-filter-chips',
    ) as HTMLElement | null
    const slottedCredentialsFilterControls = credentialsHeader?.querySelector('pm-mobile-tag-filter-row')
    const legacyCredentialsFilterRow = deepFind(layout.shadowRoot, 'pm-mobile-tag-filter-row')
    const credentialsManageAction = credentialsHeaderRoot?.querySelector('[data-filter-action="tags-manage"]')
    const credentialsManageIcon = credentialsManageAction?.querySelector('cv-icon')
    const credentialsFilterChips = Array.from(
      credentialsHeaderRoot?.querySelectorAll('cv-chip.workspace-filter-chip') ?? [],
    )
    const directionButton = credentialsHeaderRoot?.querySelector('.direction-button') as HTMLElement | null
    const credentialsSortButton = credentialsSortControls
    const credentialsGroupRadioGroup = credentialsHeaderRoot?.querySelector(
      'cv-radio-group.workspace-view-switch',
    ) as {value?: string} | null
    const headerSearchInput = credentialsHeaderRoot?.querySelector(
      'cv-input.search-box',
    ) as HTMLElement | null
    const legacySearch = deepFind(layout.shadowRoot, 'pm-search-mobile') as HTMLElement | null
    const searchSortGroup = legacySearch?.shadowRoot?.querySelector(
      '.sort-group-trigger',
    ) as HTMLElement | null
    const sortGroupSheet = layout.shadowRoot.querySelector('pm-mobile-sort-group-sheet') as HTMLElement | null
    const sortGroupBottomSheet = sortGroupSheet?.shadowRoot?.querySelector(
      'cv-bottom-sheet',
    ) as HTMLElement | null
    const order: string[] = []
    for (const child of Array.from(actions?.querySelectorAll('[data-action]') ?? [])) {
      const action = child.getAttribute('data-action')
      if (action && action !== 'mobile-leading') {
        order.push(action)
      }
    }

    const dropdownItems = Array.from(moreMenu?.querySelectorAll('cv-menu-item[value]') ?? [])
      .map((item) => item.getAttribute('value'))
      .filter((item): item is string => Boolean(item))
    const rect = actions?.getBoundingClientRect() ?? null
    const credentialsSortRect = credentialsSortControls?.getBoundingClientRect() ?? null
    const credentialsGroupRect =
      credentialsGroupRadioGroup instanceof HTMLElement
        ? credentialsGroupRadioGroup.getBoundingClientRect()
        : null
    return {
      exists: true,
      actionsHidden: !toolbar || order.length === 0,
      fabOrder: order,
      dropdownItems,
      hasSortGroup: Boolean(toolbarRoot?.querySelector('[data-action="pm-sort-group"]')),
      hasCredentialsHeader: Boolean(credentialsHeader),
      hasCredentialsSortControls: Boolean(credentialsSortControls),
      hasCredentialsFilterControls: Boolean(credentialsFilterControls),
      hasSlottedCredentialsFilterControls: Boolean(slottedCredentialsFilterControls),
      hasLegacyCredentialsFilterRow: Boolean(legacyCredentialsFilterRow),
      hasCredentialsManageAction: Boolean(credentialsManageAction),
      credentialsManageText: credentialsManageAction?.textContent?.trim() ?? null,
      credentialsManageAriaLabel: credentialsManageAction?.getAttribute('aria-label') ?? null,
      credentialsManageIconName: credentialsManageIcon?.getAttribute('name') ?? null,
      credentialsFilterSelectionMode: credentialsFilterControls?.getAttribute('selection-mode') ?? null,
      credentialsFilterChipValues: credentialsFilterChips
        .map((chip) => chip.getAttribute('value'))
        .filter((value): value is string => Boolean(value)),
      credentialsSelectedFilterChipValues: credentialsFilterChips
        .filter((chip) => chip.hasAttribute('selected'))
        .map((chip) => chip.getAttribute('value'))
        .filter((value): value is string => Boolean(value)),
      hasCredentialsDirectionControl: Boolean(directionButton),
      credentialsSortValue: credentialsSortButton?.dataset['sortMode'] ?? null,
      credentialsGroupValue: credentialsGroupRadioGroup?.value ?? null,
      credentialsSortRect: credentialsSortRect
        ? {
            width: credentialsSortRect.width,
            height: credentialsSortRect.height,
          }
        : null,
      credentialsGroupRect: credentialsGroupRect
        ? {
            width: credentialsGroupRect.width,
            height: credentialsGroupRect.height,
          }
        : null,
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
      hasSearchComponent: Boolean(headerSearchInput),
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

async function enableAndWaitForPasswordManager(
  page: Page,
  url: string,
  seedFixture = seedLayoutPassmanagerFixture,
): Promise<void> {
  await seedFixture()
  const nextUrl = new URL(url)
  nextUrl.searchParams.set('surface', 'passwords')
  const layout = (nextUrl.searchParams.get('layout') as 'mobile' | 'desktop' | null) ?? null
  const requestedWidth = Number.parseInt(nextUrl.searchParams.get('e2eWidth') ?? '', 10)
  const requestedHeight = Number.parseInt(nextUrl.searchParams.get('e2eHeight') ?? '', 10)
  await applyLayoutEmulation(
    page,
    layout,
    Number.isFinite(requestedWidth) ? requestedWidth : layout === 'desktop' ? 1280 : 390,
    Number.isFinite(requestedHeight) ? requestedHeight : layout === 'desktop' ? 720 : 844,
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
  await page.waitForFunction(
    () => Boolean((window as unknown as {passmanager?: unknown}).passmanager),
    undefined,
    {
      timeout: 10_000,
    },
  )
  await page.waitForFunction(
    () => ((window as any).passmanager?.entriesList?.()?.length ?? 0) > 0,
    undefined,
    {timeout: 10_000},
  )
  await page.waitForTimeout(150)
}

test('model-owned PassManager create forms handle invalid mobile submits', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)
  await clearMockTransportLog()

  const entryBaseline = await page.evaluate(() => {
    const passmanager = (window as any).passmanager
    passmanager.showElement.set('createEntry')
    return {
      allEntries: passmanager.allEntries.length,
      rootEntries: passmanager.entriesList().length,
    }
  })
  await expect.poll(() => deepQuerySelector(page, 'pm-entry-create-mobile'), {timeout: 10_000}).toBe(true)

  const entryBoundary = await page.evaluate(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (!element.shadowRoot) continue
        const inner = deepFind(element.shadowRoot, selector)
        if (inner) return inner
      }
      return null
    }

    const create = deepFind(document, 'pm-entry-create-mobile') as
      | (HTMLElement & {
          model?: {
            setTitle(value: string): void
            setUsername(value: string): void
          }
        })
      | null
    const form = create?.shadowRoot?.querySelector('form')
    const submit = create?.shadowRoot?.querySelector('#passwords\\.create\\.submit')
    create?.model?.setTitle('Validation Probe')
    create?.model?.setUsername('validation-user')
    return {
      noValidate: form?.noValidate ?? false,
      nativeSubmit: submit instanceof HTMLButtonElement && submit.type === 'submit',
    }
  })

  expect(entryBoundary).toEqual({noValidate: true, nativeSubmit: true})
  expect(await deepClick(page, '#passwords\\.create\\.submit')).toBe(true)
  await page.waitForFunction(
    () => {
      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const element of root.querySelectorAll('*')) {
          if (!element.shadowRoot) continue
          const inner = deepFind(element.shadowRoot, selector)
          if (inner) return inner
        }
        return null
      }

      const create = deepFind(document, 'pm-entry-create-mobile') as
        | (HTMLElement & {
            model?: {
              submitAttempted(): boolean
              passwordError(): string
            }
          })
        | null
      return Boolean(create?.model?.submitAttempted() && create.model.passwordError())
    },
    undefined,
    {timeout: 10_000},
  )

  const invalidEntry = await page.evaluate(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (!element.shadowRoot) continue
        const inner = deepFind(element.shadowRoot, selector)
        if (inner) return inner
      }
      return null
    }

    const passmanager = (window as any).passmanager
    const create = deepFind(document, 'pm-entry-create-mobile') as
      | (HTMLElement & {
          model?: {
            submitAttempted(): boolean
            title(): string
            username(): string
            passwordError(): string
          }
        })
      | null
    const password = create?.shadowRoot?.querySelector('cv-input[name="password"]') as HTMLElement | null
    const nativePassword = password?.shadowRoot?.querySelector('input')
    return {
      submitAttempted: create?.model?.submitAttempted() ?? false,
      title: create?.model?.title() ?? '',
      username: create?.model?.username() ?? '',
      error: create?.model?.passwordError() ?? '',
      inlineError: password?.closest('cv-field')?.querySelector('[slot="error"]')?.textContent?.trim() ?? '',
      invalid: password?.hasAttribute('invalid') ?? false,
      focused: password?.shadowRoot?.activeElement === nativePassword,
      allEntries: passmanager.allEntries.length,
      rootEntries: passmanager.entriesList().length,
    }
  })

  expect(invalidEntry).toMatchObject({
    submitAttempted: true,
    title: 'Validation Probe',
    username: 'validation-user',
    invalid: true,
    focused: true,
    allEntries: entryBaseline.allEntries,
    rootEntries: entryBaseline.rootEntries,
  })
  expect(invalidEntry.error).not.toBe('')
  expect(invalidEntry.inlineError).toBe(invalidEntry.error)

  const groupBaseline = await page.evaluate(() => {
    const passmanager = (window as any).passmanager
    passmanager.showElement.set('createGroup')
    return {
      allEntries: passmanager.allEntries.length,
      rootEntries: passmanager.entriesList().length,
    }
  })
  await expect.poll(() => deepQuerySelector(page, 'pm-group-create-mobile'), {timeout: 10_000}).toBe(true)

  const groupBoundary = await page.evaluate(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (!element.shadowRoot) continue
        const inner = deepFind(element.shadowRoot, selector)
        if (inner) return inner
      }
      return null
    }

    const create = deepFind(document, 'pm-group-create-mobile') as HTMLElement | null
    const form = create?.shadowRoot?.querySelector('form')
    const submit = create?.shadowRoot?.querySelector('cv-button.submit')
    return {
      noValidate: form?.noValidate ?? false,
      customSubmit: submit?.getAttribute('type') === 'submit',
    }
  })

  expect(groupBoundary).toEqual({noValidate: true, customSubmit: true})
  expect(await deepClick(page, 'cv-button.submit')).toBe(true)
  await page.waitForFunction(
    () => {
      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const element of root.querySelectorAll('*')) {
          if (!element.shadowRoot) continue
          const inner = deepFind(element.shadowRoot, selector)
          if (inner) return inner
        }
        return null
      }

      const create = deepFind(document, 'pm-group-create-mobile') as
        | (HTMLElement & {
            model?: {
              submitAttempted(): boolean
              nameError(): string
            }
          })
        | null
      return Boolean(create?.model?.submitAttempted() && create.model.nameError())
    },
    undefined,
    {timeout: 10_000},
  )

  const invalidGroup = await page.evaluate(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (!element.shadowRoot) continue
        const inner = deepFind(element.shadowRoot, selector)
        if (inner) return inner
      }
      return null
    }

    const passmanager = (window as any).passmanager
    const create = deepFind(document, 'pm-group-create-mobile') as
      | (HTMLElement & {
          model?: {
            submitAttempted(): boolean
            nameError(): string
          }
        })
      | null
    const name = create?.shadowRoot?.querySelector('cv-input[name="name"]') as HTMLElement | null
    const nativeName = name?.shadowRoot?.querySelector('input')
    return {
      submitAttempted: create?.model?.submitAttempted() ?? false,
      error: create?.model?.nameError() ?? '',
      inlineError: name?.closest('cv-field')?.querySelector('[slot="error"]')?.textContent?.trim() ?? '',
      invalid: name?.hasAttribute('invalid') ?? false,
      focused: name?.shadowRoot?.activeElement === nativeName,
      allEntries: passmanager.allEntries.length,
      rootEntries: passmanager.entriesList().length,
    }
  })

  expect(invalidGroup).toMatchObject({
    submitAttempted: true,
    invalid: true,
    focused: true,
    allEntries: groupBaseline.allEntries,
    rootEntries: groupBaseline.rootEntries,
  })
  expect(invalidGroup.error).not.toBe('')
  expect(invalidGroup.inlineError).toBe(invalidGroup.error)

  const invalidWrites = (await readMockTransportLog()).filter(({command}) =>
    [
      'passmanager:entry:create',
      'passmanager:entry:save',
      'passmanager:group:ensure',
      'passmanager:group:setMeta',
    ].includes(command),
  )
  expect(invalidWrites).toEqual([])
})

test('desktop workbench uses a pixel splitter and normalizes persisted sidebar width', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.addInitScript(() => {
    localStorage.setItem('pm-sidebar-width', '500')
  })
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=desktop`)

  const initial = await page.evaluate(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (!element.shadowRoot) continue
        const inner = deepFind(element.shadowRoot, selector)
        if (inner) return inner
      }
      return null
    }

    const layout = deepFind(document, 'password-manager-desktop-layout') as HTMLElement | null
    const splitter = layout?.shadowRoot?.querySelector('cv-window-splitter') as
      | (HTMLElement & {
          position?: number
          positionUnit?: string
          min?: number
          max?: number
          step?: number
        })
      | null
    const sidebar = layout?.shadowRoot?.querySelector('.sidebar') as HTMLElement | null
    const separator = splitter?.shadowRoot?.querySelector('[part="separator"]') as HTMLElement | null

    separator?.focus()

    return {
      hasLayout: Boolean(layout),
      hasSidebar: Boolean(sidebar),
      hasLegacyResizer: Boolean(layout?.shadowRoot?.querySelector('.resizer')),
      position: splitter?.position ?? null,
      positionUnit: splitter?.positionUnit ?? splitter?.getAttribute('position-unit') ?? null,
      min: splitter?.min ?? null,
      max: splitter?.max ?? null,
      step: splitter?.step ?? null,
      sidebarWidth: sidebar?.getBoundingClientRect().width ?? null,
      storedWidth: localStorage.getItem('pm-sidebar-width'),
      separatorFocused: separator === splitter?.shadowRoot?.activeElement,
      separatorValue: separator?.getAttribute('aria-valuenow') ?? null,
    }
  })

  expect(initial).toMatchObject({
    hasLayout: true,
    hasSidebar: true,
    hasLegacyResizer: false,
    position: 320,
    positionUnit: 'px',
    min: 232,
    max: 320,
    step: 8,
    storedWidth: '320',
    separatorFocused: true,
    separatorValue: '320',
  })
  expect(initial.sidebarWidth).toBeGreaterThanOrEqual(319)
  expect(initial.sidebarWidth).toBeLessThanOrEqual(320)

  await page.keyboard.press('ArrowLeft')
  await page.waitForFunction(
    () => {
      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const element of root.querySelectorAll('*')) {
          if (!element.shadowRoot) continue
          const inner = deepFind(element.shadowRoot, selector)
          if (inner) return inner
        }
        return null
      }

      const splitter = deepFind(document, 'cv-window-splitter') as (HTMLElement & {position?: number}) | null
      return splitter?.position === 312 && localStorage.getItem('pm-sidebar-width') === '312'
    },
    undefined,
    {timeout: 5_000},
  )

  const keyboardPosition = await page.evaluate(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (!element.shadowRoot) continue
        const inner = deepFind(element.shadowRoot, selector)
        if (inner) return inner
      }
      return null
    }

    const splitter = deepFind(document, 'cv-window-splitter') as (HTMLElement & {position?: number}) | null
    const separator = splitter?.shadowRoot?.querySelector('[part="separator"]')
    return {
      position: splitter?.position ?? null,
      ariaValue: separator?.getAttribute('aria-valuenow') ?? null,
      storedWidth: localStorage.getItem('pm-sidebar-width'),
    }
  })
  expect(keyboardPosition).toEqual({position: 312, ariaValue: '312', storedWidth: '312'})
})

test('desktop security summary is rendered once in the compact status bar', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=desktop`)

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

      const statusBar = deepFind(document, 'status-bar') as HTMLElement | null
      return Boolean(
        statusBar?.shadowRoot?.querySelector(
          'pm-summary-rail.status-context-summary[data-summary-context="passwords-group"]',
        ),
      )
    },
    undefined,
    {timeout: 10_000},
  )

  const placement = await page.evaluate(() => {
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

    function deepCollect(root: Document | ShadowRoot, selector: string, result: Element[] = []): Element[] {
      result.push(...root.querySelectorAll(selector))
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          deepCollect(element.shadowRoot, selector, result)
        }
      }
      return result
    }

    const layout = deepFind(document, 'password-manager-desktop-layout') as HTMLElement | null
    const group = layout?.shadowRoot?.querySelector('pm-group') as HTMLElement | null
    const localRail = group?.shadowRoot?.querySelector('pm-summary-rail.group-metrics-strip')
    const statusBar = deepFind(document, 'status-bar') as HTMLElement | null
    const statusRail = statusBar?.shadowRoot?.querySelector(
      'pm-summary-rail.status-context-summary',
    ) as HTMLElement | null
    const allRails = deepCollect(document, 'pm-summary-rail')
    return {
      railCount: allRails.length,
      contexts: allRails.map((rail) => rail.getAttribute('data-summary-context')),
      hasLocalRail: Boolean(localRail),
      statusDensity: statusRail?.getAttribute('density') ?? null,
      statusContext: statusRail?.getAttribute('data-summary-context') ?? null,
    }
  })

  expect(placement).toEqual({
    railCount: 1,
    contexts: ['passwords-group'],
    hasLocalRail: false,
    statusDensity: 'compact',
    statusContext: 'passwords-group',
  })
})

test('desktop toolbar keeps the entry action visible and secondary actions in the ellipsis menu', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=desktop`)

  const state = await page.evaluate(() => {
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

    const toolbar = deepFind(
      document,
      'password-manager-desktop-toolbar[slot="desktop-topbar"]',
    ) as HTMLElement | null
    const root = toolbar?.shadowRoot ?? null
    const shellToolbar = root?.querySelector('desktop-shell-toolbar')
    const actions = root?.querySelector('.toolbar-actions')
    const rightmost = actions?.lastElementChild

    return {
      visibleButtonActions: Array.from(root?.querySelectorAll<HTMLElement>('cv-button[data-action]') ?? [])
        .map((button) => button.dataset['action'])
        .filter((id): id is string => Boolean(id)),
      menuItemActions: Array.from(root?.querySelectorAll<HTMLElement>('cv-menu-item[data-action]') ?? [])
        .map((button) => button.dataset['action'])
        .filter((id): id is string => Boolean(id)),
      hasLegacyHeader: Boolean(
        deepFind(document, 'workspace-dashboard-header[slot="desktop-topbar"][surface="passwords"]'),
      ),
      singleRow: shellToolbar?.hasAttribute('single-row') ?? false,
      hasRightmostActionsMenu: Boolean(rightmost?.matches('cv-menu-button.toolbar-actions-menu')),
      actionsMenuLabel: rightmost?.getAttribute('aria-label') ?? null,
    }
  })

  expect(state.visibleButtonActions).toEqual(['pm-create-entry'])
  expect(state.menuItemActions).toEqual(
    expect.arrayContaining(['pm-otp-view', 'pm-import', 'pm-export', 'pm-clean']),
  )
  expect(state.menuItemActions).not.toContain('pm-create-entry')
  expect(state.menuItemActions).not.toContain('pm-create-group')
  expect(state.hasLegacyHeader).toBe(false)
  expect(state.singleRow).toBe(true)
  expect(state.hasRightmostActionsMenu).toBe(true)
  expect(state.actionsMenuLabel).toBe('More actions')
})

test('desktop filtered empty clears only content filters and reveals the existing rows', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=desktop`)

  const searchInput = page.locator('pm-search cv-input input').first()
  await searchInput.fill('no matching credential')
  await page.waitForFunction(
    () => {
      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const element of root.querySelectorAll('*')) {
          if (!element.shadowRoot) continue
          const inner = deepFind(element.shadowRoot, selector)
          if (inner) return inner
        }
        return null
      }

      return Boolean(deepFind(document, 'cv-empty-state[data-empty-kind="filtered"]'))
    },
    undefined,
    {timeout: 10_000},
  )

  expect(await deepQuerySelector(page, 'pm-entry-list-item')).toBe(false)
  expect(await deepClick(page, 'cv-empty-state[data-empty-kind="filtered"] cv-button')).toBe(true)

  await page.waitForFunction(
    () => {
      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const element of root.querySelectorAll('*')) {
          if (!element.shadowRoot) continue
          const inner = deepFind(element.shadowRoot, selector)
          if (inner) return inner
        }
        return null
      }

      return (
        Boolean(deepFind(document, 'pm-entry-list-item')) &&
        !deepFind(document, 'cv-empty-state[data-empty-kind="filtered"]')
      )
    },
    undefined,
    {timeout: 10_000},
  )

  expect(await searchInput.inputValue()).toBe('')
})

test('desktop workbench stays compact without page overflow at supported viewports', async () => {
  const page = globalThis.__E2E_PAGE__!
  const viewports = [
    {width: 1440, height: 900},
    {width: 1280, height: 720},
    {width: 960, height: 720},
  ] as const

  for (const viewport of viewports) {
    await enableAndWaitForPasswordManager(
      page,
      `${BASE_URL}?layout=desktop&e2eWidth=${viewport.width}&e2eHeight=${viewport.height}`,
    )

    await page.waitForFunction(
      () => {
        function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
          const found = root.querySelector(selector)
          if (found) return found
          for (const element of root.querySelectorAll('*')) {
            if (!element.shadowRoot) continue
            const inner = deepFind(element.shadowRoot, selector)
            if (inner) return inner
          }
          return null
        }

        const toolbar = deepFind(document, 'password-manager-desktop-toolbar')
        const layout = deepFind(document, 'password-manager-desktop-layout') as HTMLElement | null
        const group = layout?.shadowRoot?.querySelector('pm-group') as HTMLElement | null
        const contextHeader = group?.shadowRoot?.querySelector('pm-workspace-header')
        const statusBar = deepFind(document, 'status-bar')
        return Boolean(toolbar && contextHeader && statusBar)
      },
      undefined,
      {timeout: 10_000},
    )

    const geometry = await page.evaluate(() => {
      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const element of root.querySelectorAll('*')) {
          if (!element.shadowRoot) continue
          const inner = deepFind(element.shadowRoot, selector)
          if (inner) return inner
        }
        return null
      }

      function collectScrollableOwners(root: Document | ShadowRoot): string[] {
        const owners: string[] = []
        for (const element of root.querySelectorAll<HTMLElement>('*')) {
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          if (
            rect.width > 0 &&
            element.clientWidth > 0 &&
            element.scrollWidth > element.clientWidth + 1 &&
            (style.overflowX === 'auto' || style.overflowX === 'scroll')
          ) {
            owners.push(
              element.matches('.quick-filters')
                ? 'quick-filter-rail'
                : `${element.localName}${element.className ? `.${String(element.className).split(' ').join('.')}` : ''}`,
            )
          }
          if (element.shadowRoot) {
            owners.push(...collectScrollableOwners(element.shadowRoot))
          }
        }
        return owners
      }

      const toolbar = deepFind(document, 'password-manager-desktop-toolbar') as HTMLElement | null
      const layout = deepFind(document, 'password-manager-desktop-layout') as HTMLElement | null
      const pageSurface = layout?.shadowRoot?.querySelector('.page') as HTMLElement | null
      const sidebar = layout?.shadowRoot?.querySelector('.sidebar') as HTMLElement | null
      const group = layout?.shadowRoot?.querySelector('pm-group') as HTMLElement | null
      const contextHeader = group?.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement | null
      const statusBar = deepFind(document, 'status-bar') as HTMLElement | null
      const quickFilters = toolbar?.shadowRoot?.querySelector('pm-quick-filters') as HTMLElement | null
      const quickFilterRail = quickFilters?.shadowRoot?.querySelector('.quick-filters') as HTMLElement | null
      const quickFilterStyle = quickFilterRail ? getComputedStyle(quickFilterRail) : null
      const horizontalScrollOwners = [
        ...(toolbar?.shadowRoot ? collectScrollableOwners(toolbar.shadowRoot) : []),
        ...(layout?.shadowRoot ? collectScrollableOwners(layout.shadowRoot) : []),
      ]

      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        toolbarHeight: toolbar?.getBoundingClientRect().height ?? null,
        statusBarHeight: statusBar?.getBoundingClientRect().height ?? null,
        contextHeaderHeight: contextHeader?.getBoundingClientRect().height ?? null,
        sidebarWidth: sidebar?.getBoundingClientRect().width ?? null,
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        layoutOverflow: layout ? layout.scrollWidth > layout.clientWidth + 1 : null,
        pageSurfaceOverflow: pageSurface ? pageSurface.scrollWidth > pageSurface.clientWidth + 1 : null,
        horizontalScrollOwners,
        quickFilterOverflowX: quickFilterStyle?.overflowX ?? null,
        quickFilterFlexWrap: quickFilterStyle?.flexWrap ?? null,
        quickFilterOverflowing: quickFilterRail
          ? quickFilterRail.scrollWidth > quickFilterRail.clientWidth + 1
          : null,
      }
    })

    expect(geometry.viewportWidth).toBe(viewport.width)
    expect(geometry.viewportHeight).toBe(viewport.height)
    expect(geometry.toolbarHeight).not.toBeNull()
    expect(geometry.statusBarHeight).not.toBeNull()
    expect(geometry.contextHeaderHeight).not.toBeNull()
    expect(geometry.sidebarWidth).not.toBeNull()
    expect(geometry.toolbarHeight!).toBeLessThanOrEqual(60)
    expect(geometry.statusBarHeight!).toBeLessThanOrEqual(44)
    expect(geometry.contextHeaderHeight!).toBeLessThanOrEqual(72)
    expect(geometry.sidebarWidth!).toBeGreaterThanOrEqual(232)
    expect(geometry.sidebarWidth!).toBeLessThanOrEqual(320)
    expect(geometry.documentOverflow).toBe(false)
    expect(geometry.layoutOverflow).toBe(false)
    expect(geometry.pageSurfaceOverflow).toBe(false)
    expect(geometry.horizontalScrollOwners.every((owner) => owner === 'quick-filter-rail')).toBe(true)
    expect(geometry.quickFilterOverflowX).toBe('auto')
    expect(geometry.quickFilterFlexWrap).toBe('nowrap')

    if (viewport.width === 960) {
      expect(geometry.quickFilterOverflowing).toBe(true)
      expect(geometry.horizontalScrollOwners).toContain('quick-filter-rail')
    }
  }
})

test('desktop group and entry expose visible component-level actions', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=desktop`)

  const state = await page.evaluate(async () => {
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

    async function nextFrame() {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
    }

    function collectActions(host: HTMLElement | null) {
      const items = Array.from(
        host?.shadowRoot?.querySelectorAll<HTMLElement>('cv-toolbar-item[data-action]') ?? [],
      )
      return items.map((item) => {
        const rect = item.getBoundingClientRect()
        return {
          id: item.dataset['action'] ?? '',
          visible: rect.width > 0 && rect.height > 0,
          inViewport:
            rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      })
    }

    const pm = (window as any).passmanager
    const group = pm
      ?.entriesList?.()
      ?.find((item: any) => item?.constructor?.name === 'Group' && item.name === 'layout-fixture-group')
    const entry = pm?.getCardByID?.('layout-root-login')

    pm.showElement.set(group)
    await nextFrame()
    const groupHost = deepFind(document, 'pm-group') as HTMLElement | null
    const groupActions = collectActions(groupHost)

    pm.showElement.set(entry)
    await customElements.whenDefined('pm-entry')
    await nextFrame()
    await nextFrame()
    const entryHost = deepFind(document, 'pm-entry') as HTMLElement | null
    const entryActions = collectActions(entryHost)

    return {
      groupFound: Boolean(group),
      entryFound: Boolean(entry),
      groupHostFound: Boolean(groupHost),
      entryHostFound: Boolean(entryHost),
      groupShowToolbarActions: (groupHost as any)?.showToolbarActions ?? null,
      entryShowHeaderActions: (entryHost as any)?.showHeaderActions ?? null,
      groupActions,
      entryActions,
    }
  })

  expect(state.groupFound).toBe(true)
  expect(state.entryFound).toBe(true)
  expect(state.groupHostFound).toBe(true)
  expect(state.entryHostFound).toBe(true)
  expect(state.groupShowToolbarActions).toBe(true)
  expect(state.entryShowHeaderActions).toBe(true)
  expect(state.groupActions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({id: 'edit-group', visible: true, inViewport: true}),
      expect.objectContaining({id: 'move-group', visible: true, inViewport: true}),
      expect.objectContaining({id: 'remove-group', visible: true, inViewport: true}),
    ]),
  )
  expect(state.entryActions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({id: 'edit-entry', visible: true, inViewport: true}),
      expect.objectContaining({id: 'move-entry', visible: true, inViewport: true}),
      expect.objectContaining({id: 'delete-entry', visible: true, inViewport: true}),
    ]),
  )
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
  expect(state.hasCredentialsHeader).toBe(true)
  expect(state.hasCredentialsSortControls).toBe(true)
  expect(state.hasCredentialsFilterControls).toBe(true)
  expect(state.hasSlottedCredentialsFilterControls).toBe(false)
  expect(state.hasLegacyCredentialsFilterRow).toBe(false)
  expect(state.hasCredentialsManageAction).toBe(true)
  expect(state.credentialsManageText).toBe('')
  expect(state.credentialsManageAriaLabel).toBe('Manage tags')
  expect(state.credentialsManageIconName).toBe('sliders')
  expect(state.credentialsFilterSelectionMode).toBe('multiple')
  expect(state.credentialsFilterChipValues).toEqual(expect.arrayContaining(['__all-tags', 'work']))
  expect(state.credentialsSelectedFilterChipValues).toEqual(['__all-tags'])
  expect(state.hasCredentialsDirectionControl).toBe(false)
  expect(state.hasSearchSortGroup).toBe(false)
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

test('mobile group edit guards Back, discards safely, and saves from the focused form', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile&e2eWidth=390`)

  await page.evaluate(() => {
    const passmanager = (window as any).passmanager
    const group = passmanager
      ?.entriesList?.()
      ?.find((item: any) => item?.constructor?.name === 'Group' && item.name === 'layout-fixture-group')
    if (!group) throw new Error('layout group fixture is missing')
    passmanager.showElement.set(group)
  })
  await expect.poll(() => deepQuerySelector(page, 'pm-group-mobile'), {timeout: 10_000}).toBe(true)
  expect(await openMenuButton(page, 'mobile-top-toolbar', 'cv-menu-button.overflow-menu')).toBe(true)
  await expect.poll(() => deepQuerySelector(page, 'cv-menu-item[value="pm-edit-group"]')).toBe(true)
  expect(await deepClick(page, 'cv-menu-item[value="pm-edit-group"]')).toBe(true)
  await expect.poll(() => deepQuerySelector(page, 'pm-group-edit-mobile'), {timeout: 10_000}).toBe(true)

  const initial = await page.evaluate(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const nested = deepFind(element.shadowRoot, selector)
          if (nested) return nested
        }
      }
      return null
    }

    const edit = deepFind(document, 'pm-group-edit-mobile') as HTMLElement | null
    const root = edit?.shadowRoot
    const name = root?.querySelector('cv-input[name="name"]') as (HTMLElement & {value?: string}) | null
    const footer = root?.querySelector('mobile-bottom-action-footer') as HTMLElement | null
    const footerRect = footer?.getBoundingClientRect()
    const toolbar = deepFind(document, 'mobile-top-toolbar') as (HTMLElement & {title?: string}) | null
    const toolbarRect = toolbar?.getBoundingClientRect()

    return {
      name: name?.value ?? '',
      toolbarTitle: toolbar?.title ?? '',
      hasList: Boolean(root?.querySelector('.group-virtual-list, workspace-dashboard-header')),
      hasMetrics: Boolean(root?.querySelector('.group-metrics-strip')),
      hasTabBar: Boolean(deepFind(document, 'mobile-tab-bar')),
      footerVisible:
        Boolean(footerRect?.height) &&
        Boolean(toolbarRect) &&
        footerRect!.top >= toolbarRect!.bottom &&
        footerRect!.bottom <= window.innerHeight + 1,
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })

  expect(initial).toEqual({
    name: 'layout-fixture-group',
    toolbarTitle: 'Edit group',
    hasList: false,
    hasMetrics: false,
    hasTabBar: false,
    footerVisible: true,
    documentOverflow: false,
  })

  const nameInput = page.locator('pm-group-edit-mobile cv-input[name="name"] input')
  await nameInput.fill('Discard candidate')
  expect(await deepClick(page, '[data-action="mobile-leading"]')).toBe(true)
  await page.waitForFunction(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const nested = deepFind(element.shadowRoot, selector)
          if (nested) return nested
        }
      }
      return null
    }
    return Boolean(deepFind(document, '[data-confirm-action="confirm"]'))
  })
  expect(await deepClick(page, '.dialog-footer cv-button:first-child')).toBe(true)
  await expect.poll(() => deepQuerySelector(page, '[data-confirm-action="confirm"]')).toBe(false)
  await expect.poll(() => deepQuerySelector(page, 'pm-group-edit-mobile')).toBe(true)
  await expect.poll(() => nameInput.inputValue()).toBe('Discard candidate')
  await page.waitForTimeout(500)

  expect(await deepClick(page, '[data-action="mobile-leading"]')).toBe(true)
  await confirmDeepDialog(page)
  await expect.poll(() => deepQuerySelector(page, 'pm-group-edit-mobile')).toBe(false)
  await expect
    .poll(() => page.evaluate(() => (window as any).passmanager?.showElement?.()?.name))
    .toBe('layout-fixture-group')

  expect(await openMenuButton(page, 'mobile-top-toolbar', 'cv-menu-button.overflow-menu')).toBe(true)
  await expect.poll(() => deepQuerySelector(page, 'cv-menu-item[value="pm-edit-group"]')).toBe(true)
  expect(await deepClick(page, 'cv-menu-item[value="pm-edit-group"]')).toBe(true)
  await expect.poll(() => deepQuerySelector(page, 'pm-group-edit-mobile'), {timeout: 10_000}).toBe(true)
  await page.locator('pm-group-edit-mobile cv-input[name="name"] input').fill('layout-fixture-renamed')
  await page
    .locator('pm-group-edit-mobile cv-textarea[name="description"] textarea')
    .fill('Updated from the focused mobile form')
  await page.locator('pm-group-edit-mobile cv-button[type="submit"]').click()

  await expect.poll(() => deepQuerySelector(page, 'pm-group-edit-mobile'), {timeout: 10_000}).toBe(false)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const group = (window as any).passmanager?.showElement?.()
        return {name: group?.name, description: group?.description}
      }),
    )
    .toEqual({
      name: 'layout-fixture-renamed',
      description: 'Updated from the focused mobile form',
    })
  expect(await deepQuerySelector(page, 'mobile-tab-bar')).toBe(true)
})

test('mobile audit settlement preserves credential and group row geometry', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile&e2eWidth=390`)

  await page.evaluate(() => {
    const root = (window as unknown as {passmanager: any}).passmanager
    let resolvePassword: (value: string | undefined) => void = () => {}
    const pendingPassword = new Promise<string | undefined>((resolve) => {
      resolvePassword = resolve
    })
    ;(
      window as unknown as {resolveAuditPassword?: (value: string | undefined) => void}
    ).resolveAuditPassword = resolvePassword
    root.managerSaver.readEntryPassword = () => {
      ;(window as unknown as {auditScanStarted?: boolean}).auditScanStarted = true
      return pendingPassword
    }
    const saveArtifact = root.managerSaver.saveCredentialSecurityAudit?.bind(root.managerSaver)
    root.managerSaver.saveCredentialSecurityAudit = async (artifact: unknown) => {
      ;(window as unknown as {auditScanSettled?: boolean}).auditScanSettled = true
      return saveArtifact ? saveArtifact(artifact) : true
    }
    for (const entry of root.allEntries) {
      entry.passwordCache = undefined
      entry.passwordCacheReady = false
      entry.passwordReadPending = undefined
    }

    const groupEntry = root.allEntries.find((entry: {id: string}) => entry.id === 'layout-group-login')
    if (!groupEntry) throw new Error('layout group entry is missing')
    groupEntry.otps.set([...groupEntry.otps(), {id: 'audit-pending', label: 'Audit pending'}])
  })

  await page.waitForFunction(
    () => Boolean((window as unknown as {auditScanStarted?: boolean}).auditScanStarted),
    undefined,
    {timeout: 10_000},
  )
  const pendingGeometry = await getMobileSecurityRowGeometry(page)

  await page.evaluate(() => {
    const runtime = window as unknown as {resolveAuditPassword?: (value: string | undefined) => void}
    runtime.resolveAuditPassword?.('abc')
  })
  await page.waitForFunction(
    () => Boolean((window as unknown as {auditScanSettled?: boolean}).auditScanSettled),
    undefined,
    {timeout: 10_000},
  )
  await page.waitForTimeout(50)
  const settledIndicators = {
    entry: await deepQuerySelector(page, '.entry-status-dot[data-badge-id="weak_password"]'),
    group: await deepQuerySelector(page, '.group-risk-dot[data-severity="critical"]'),
  }
  const settledGeometry = await getMobileSecurityRowGeometry(page)

  expect(settledIndicators).toEqual({entry: true, group: true})
  expect(pendingGeometry).not.toBeNull()
  expect(settledGeometry).toEqual(pendingGeometry)
})

test('mobile credentials restores list scroll after returning from a group', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(
    page,
    `${BASE_URL}?layout=mobile&e2eHeight=520`,
    seedScrollablePassmanagerFixture,
  )

  const result = await page.evaluate(async () => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const nested = deepFind(element.shadowRoot, selector)
          if (nested) return nested
        }
      }
      return null
    }

    async function nextFrame(): Promise<void> {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }

    const originalGroupHost = deepFind(document, 'pm-group-mobile') as HTMLElement | null
    const originalVirtualizer = originalGroupHost?.shadowRoot?.querySelector(
      'lit-virtualizer',
    ) as HTMLElement | null
    if (!originalGroupHost || !originalVirtualizer) {
      return {before: 0, after: 0, remounted: false, restoredRoot: false}
    }

    originalVirtualizer.scrollTop = Math.min(
      760,
      originalVirtualizer.scrollHeight - originalVirtualizer.clientHeight,
    )
    await nextFrame()
    await nextFrame()
    const before = originalVirtualizer.scrollTop

    const visibleRow = Array.from(
      originalGroupHost.shadowRoot?.querySelectorAll<HTMLElement>('.group-row-wrap[data-row-id]') ?? [],
    ).find((row) => {
      const rowRect = row.getBoundingClientRect()
      const listRect = originalVirtualizer.getBoundingClientRect()
      return rowRect.top >= listRect.top && rowRect.bottom <= listRect.bottom
    })
    const group = visibleRow?.dataset['rowId']
      ? (window as any).passmanager?.getCardByID?.(visibleRow.dataset['rowId'])
      : null
    if (!group) {
      return {before, after: 0, remounted: false, restoredRoot: false}
    }

    const {passmanagerNavigationController} = await (0, eval)(
      'import("/features/passmanager/passmanager-navigation.controller.ts")',
    )
    passmanagerNavigationController.openItem(group)
    for (let frame = 0; frame < 60; frame += 1) {
      if ((window as any).passmanager?.showElement?.() === group) break
      await nextFrame()
    }
    passmanagerNavigationController.goBackFromCurrent()
    for (let frame = 0; frame < 60; frame += 1) {
      if ((window as any).passmanager?.showElement?.()?.isRoot === true) break
      await nextFrame()
    }

    const restoredGroupHost = deepFind(document, 'pm-group-mobile') as HTMLElement | null
    const restoredVirtualizer = restoredGroupHost?.shadowRoot?.querySelector(
      'lit-virtualizer',
    ) as HTMLElement | null
    await nextFrame()
    await nextFrame()
    return {
      before,
      after: restoredVirtualizer?.scrollTop ?? 0,
      remounted: restoredGroupHost !== originalGroupHost,
      restoredRoot: (window as any).passmanager?.showElement?.()?.isRoot === true,
    }
  })

  expect(result.before).toBeGreaterThan(100)
  expect(result.remounted).toBe(true)
  expect(result.restoredRoot).toBe(true)
  expect(Math.abs(result.after - result.before)).toBeLessThanOrEqual(2)
})

test('mobile credentials keeps virtualizer geometry stable while grouping', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(
    page,
    `${BASE_URL}?layout=mobile&e2eWidth=390&e2eHeight=844`,
    seedGroupingVirtualizerFixture,
  )

  const result = await page.evaluate(async () => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const nested = deepFind(element.shadowRoot, selector)
          if (nested) return nested
        }
      }
      return null
    }

    async function nextFrame(): Promise<void> {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }

    type TestVirtualizer = HTMLElement & {
      updateComplete?: Promise<unknown>
      layoutComplete?: Promise<void>
    }
    type TestGroupHost = HTMLElement & {updateComplete?: Promise<unknown>}

    async function settleVirtualizer(virtualizer: TestVirtualizer | null): Promise<void> {
      await virtualizer?.updateComplete
      const frameFallback = nextFrame().then(nextFrame)
      const layoutComplete = virtualizer?.layoutComplete
      await (layoutComplete
        ? Promise.race([layoutComplete.catch(() => {}), frameFallback])
        : frameFallback)
      await nextFrame()
    }

    const groupHost = deepFind(document, 'pm-group-mobile') as TestGroupHost | null
    const root = groupHost?.shadowRoot
    const initialVirtualizer = root?.querySelector('lit-virtualizer') as TestVirtualizer | null
    if (!groupHost || !root || !initialVirtualizer) {
      throw new Error('mobile credential virtualizer was not found')
    }

    await settleVirtualizer(initialVirtualizer)
    initialVirtualizer.scrollTop = Math.min(
      900,
      initialVirtualizer.scrollHeight - initialVirtualizer.clientHeight,
    )
    initialVirtualizer.dispatchEvent(new Event('scroll'))
    await nextFrame()
    await settleVirtualizer(initialVirtualizer)

    const listRect = initialVirtualizer.getBoundingClientRect()
    const visibleEntries = Array.from(root.querySelectorAll<HTMLElement>('.entry-row[data-row-id]')).filter(
      (row) => {
        const rect = row.getBoundingClientRect()
        return rect.bottom > listRect.top && rect.top < listRect.bottom
      },
    )
    const anchorRow = visibleEntries[Math.floor(visibleEntries.length / 2)]
    const anchorId = anchorRow?.dataset['rowId']
    if (!anchorRow || !anchorId) throw new Error('visible credential anchor was not found')
    anchorRow.click()
    await groupHost.updateComplete

    const {groupBy} = await (0, eval)(
      'import("/features/passmanager/components/list/sort-controls.ts")',
    )
    const {pmMobileSelectionModel} = await (0, eval)(
      'import("/features/passmanager/models/pm-mobile-selection.model.ts")',
    )

    const snapshots: Array<{
      mode: string
      sameVirtualizer: boolean
      anchorVisible: boolean
      rowCount: number
      headerCount: number
      nonZeroRows: boolean
      overlaps: boolean
    }> = []

    async function capture(mode: 'none' | 'website' | 'modified' | 'security') {
      groupBy.set(mode)
      await groupHost.updateComplete
      const virtualizer = root.querySelector('lit-virtualizer') as TestVirtualizer | null
      await settleVirtualizer(virtualizer)
      await settleVirtualizer(virtualizer)
      if (!virtualizer) throw new Error(`virtualizer missing after grouping by ${mode}`)

      const viewport = virtualizer.getBoundingClientRect()
      const renderedRows = Array.from(
        root.querySelectorAll<HTMLElement>(
          '.entry-row[data-row-id], .group-row-wrap[data-row-id], .group-header-row[data-row-id]',
        ),
      )
      const rows = renderedRows
        .map((row) => ({row, rect: row.getBoundingClientRect()}))
        .filter(({rect}) => rect.bottom > viewport.top && rect.top < viewport.bottom)
        .sort((left, right) => left.rect.top - right.rect.top)
      const anchor = root.querySelector<HTMLElement>(`.entry-row[data-row-id="${anchorId}"]`)
      const anchorRect = anchor?.getBoundingClientRect()

      snapshots.push({
        mode,
        sameVirtualizer: virtualizer === initialVirtualizer,
        anchorVisible: Boolean(
          anchorRect && anchorRect.height > 0 && anchorRect.bottom > viewport.top && anchorRect.top < viewport.bottom,
        ),
        rowCount: rows.length,
        headerCount: renderedRows.filter((row) => row.classList.contains('group-header-row')).length,
        nonZeroRows: rows.every(({rect}) => rect.height > 0),
        overlaps: rows.some(({rect}, index) => {
          const next = rows[index + 1]?.rect
          return Boolean(next && rect.bottom > next.top + 0.5)
        }),
      })
    }

    const modes = ['website', 'modified', 'security', 'none'] as const
    for (let cycle = 0; cycle < 5; cycle += 1) {
      for (const mode of modes) await capture(mode)
    }

    groupBy.set('website')
    await groupHost.updateComplete
    groupBy.set('modified')
    await groupHost.updateComplete
    await capture('security')

    pmMobileSelectionModel.enterWithEntry(anchorId)
    await groupHost.updateComplete
    const selectionVirtualizer = root.querySelector('lit-virtualizer') as TestVirtualizer | null
    await settleVirtualizer(selectionVirtualizer)
    const selectedEntry = root.querySelector<HTMLElement & {selectedInSelectionMode?: boolean}>(
      `.entry-row[data-row-id="${anchorId}"] pm-entry-list-item-mobile`,
    )
    const selection = {
      sameVirtualizer: selectionVirtualizer === initialVirtualizer,
      selected: selectedEntry?.selectedInSelectionMode === true,
    }
    pmMobileSelectionModel.exit()

    return {anchorId, snapshots, selection}
  })

  expect(result.anchorId).toBeTruthy()
  expect(result.snapshots).toHaveLength(21)
  for (const snapshot of result.snapshots) {
    expect(snapshot.sameVirtualizer, snapshot.mode).toBe(true)
    expect(snapshot.anchorVisible, snapshot.mode).toBe(true)
    expect(snapshot.rowCount, snapshot.mode).toBeGreaterThan(1)
    expect(snapshot.nonZeroRows, snapshot.mode).toBe(true)
    expect(snapshot.overlaps, snapshot.mode).toBe(false)
    if (snapshot.mode !== 'none') expect(snapshot.headerCount, snapshot.mode).toBeGreaterThan(0)
  }
  expect(result.selection).toEqual({sameVirtualizer: true, selected: true})
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

    const {pmMobileSelectionModel} = await (0, eval)(
      'import("/features/passmanager/models/pm-mobile-selection.model.ts")',
    )
    const {pmMobileChromeModel} = await (0, eval)(
      'import("/features/passmanager/models/pm-mobile-chrome.model.ts")',
    )
    if (!id) {
      return {hasEntry: false, commandResult: false, selectedCount: 0}
    }

    pmMobileSelectionModel.enterWithEntry(id)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const toolbar = deepFind(document, 'mobile-top-toolbar') as
      | (HTMLElement & {
          actions?: Array<{id: string}>
        })
      | null
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

test('mobile swipe delete removes the credential after confirmation', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)
  await page.waitForFunction(() => !document.documentElement.hasAttribute('loading'), undefined, {
    timeout: 10_000,
  })

  const entryId = await findFirstLoginEntryId(page)
  expect(entryId).not.toBeNull()
  const rowSelector = `.list-item[data-entry-id="${entryId}"]`
  await dispatchTrustedSwipeLeft(page, rowSelector)
  await waitForDeepAttribute(page, rowSelector, 'data-swipe-state', 'open-left')

  const deleteButtonRect = await getDeepRect(page, '.swipe-actions-right .swipe-action')
  expect(deleteButtonRect).not.toBeNull()
  await page.mouse.click(deleteButtonRect!.x, deleteButtonRect!.y)
  await confirmDeepDialog(page)
  await page.waitForFunction((id) => !(window as any).passmanager?.getCardByID?.(id), entryId, {
    timeout: 10_000,
  })
})

test('mobile group swipe delete removes the group after confirmation', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)
  await page.waitForFunction(() => !document.documentElement.hasAttribute('loading'), undefined, {
    timeout: 10_000,
  })

  const groupId = await page.evaluate(() => {
    const group = (window as any).passmanager
      ?.entriesList?.()
      ?.find((item: any) => item?.constructor?.name === 'Group' && item.name === 'layout-fixture-group')
    return group?.id ?? null
  })
  expect(groupId).not.toBeNull()
  const rowSelector = `.group-row-wrap[data-row-id="${groupId}"]`
  await dispatchTrustedSwipeLeft(page, rowSelector)
  await waitForDeepAttribute(page, '.group-row[data-swipe-state]', 'data-swipe-state', 'open-left')

  const deleteButtonRect = await getDeepRect(page, '.group-swipe-actions-right .swipe-action')
  expect(deleteButtonRect).not.toBeNull()
  await page.mouse.click(deleteButtonRect!.x, deleteButtonRect!.y)
  await confirmDeepDialog(page)
  await page.waitForFunction((id) => !(window as any).passmanager?.getCardByID?.(id), groupId, {
    timeout: 10_000,
  })
})

test('mobile entry overflow actions icon stays centered in trigger', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)
  await showFirstMobileLoginEntry(page)

  const state = await getPMMobileFabState(page)
  expect(state.hasMore).toBe(true)
  expect(state.dropdownItems).toEqual(['pm-entry-move'])

  const alignment = await getMenuButtonAlignment(page, 'mobile-top-toolbar', 'cv-menu-button.overflow-menu')
  expect(alignment).not.toBeNull()
  expect(Math.abs(alignment!.deltaX)).toBeLessThan(1)
})

test('mobile entry overflow actions menu stays inside the viewport', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)
  await showFirstMobileLoginEntry(page)

  expect(await openMenuButton(page, 'mobile-top-toolbar', 'cv-menu-button.overflow-menu')).toBe(true)
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

test('mobile revealed long password scrolls horizontally without opening edit mode', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`, () =>
    seedLayoutPassmanagerFixture(LONG_LAYOUT_PASSWORD),
  )
  await showFirstMobileLoginEntry(page)
  await page.waitForFunction(() => !document.documentElement.hasAttribute('loading'))

  const passwordControl = 'pm-entry-mobile cv-input[control-id="passwords.entry.password"]'
  const input = page.locator(`${passwordControl} [part="input"]`)
  await page.locator(`${passwordControl} [part="password-toggle"]`).click()
  await expect.poll(() => input.getAttribute('type')).toBe('text')

  const before = await input.evaluate((element: HTMLInputElement) => {
    const rect = element.getBoundingClientRect()
    return {
      clientWidth: element.clientWidth,
      scrollLeft: element.scrollLeft,
      scrollWidth: element.scrollWidth,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
  })
  expect(before.scrollWidth).toBeGreaterThan(before.clientWidth)
  expect(before.scrollLeft).toBe(0)

  await dispatchTrustedSwipeLeftAt(page, before)

  await expect
    .poll(() => input.evaluate((element: HTMLInputElement) => element.scrollLeft), {timeout: 3_000})
    .toBeGreaterThan(0)

  expect(await deepQuerySelector(page, 'cv-input[name="inline-password"]')).toBe(false)
})

test('mobile visible sort/group controls replace the legacy search trigger', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  let state = await getPMMobileFabState(page)
  expect(state.hasCredentialsSortControls).toBe(true)
  expect(state.hasCredentialsFilterControls).toBe(true)
  expect(state.hasSlottedCredentialsFilterControls).toBe(false)
  expect(state.hasLegacyCredentialsFilterRow).toBe(false)
  expect(state.hasCredentialsManageAction).toBe(true)
  expect(state.credentialsFilterSelectionMode).toBe('multiple')
  expect(state.credentialsFilterChipValues).toEqual(expect.arrayContaining(['__all-tags', 'work']))
  expect(state.credentialsSelectedFilterChipValues).toEqual(['__all-tags'])
  expect(state.hasSearchSortGroup).toBe(false)
  expect(state.hasCredentialsDirectionControl).toBe(false)
  expect(state.credentialsSortValue).toBe('name')
  expect(state.credentialsGroupValue).toBe('none')
  expect(state.credentialsSortRect).not.toBeNull()
  expect(state.credentialsGroupRect).not.toBeNull()
  expect(Math.abs((state.credentialsSortRect?.height ?? 0) - 32)).toBeLessThanOrEqual(1)
  expect(Math.abs((state.credentialsGroupRect?.height ?? 0) - 34)).toBeLessThanOrEqual(1)

  expect(await deepClick(page, '.workspace-sort-control')).toBe(true)
  expect(await deepClick(page, 'cv-radio[data-display-mode="website"]')).toBe(true)
  const dispatchedTagFilter = await page.evaluate(() => {
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

    const header = deepFind(document, 'workspace-dashboard-header[surface="passwords"]') as HTMLElement | null
    const chipGroup = header?.shadowRoot?.querySelector('cv-chip-group.workspace-filter-chips')
    if (!chipGroup) return false

    chipGroup.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {
          value: ['__all-tags', 'work'],
          changedValue: 'work',
          selected: true,
          source: 'click',
        },
        bubbles: true,
        composed: true,
      }),
    )
    return true
  })
  expect(dispatchedTagFilter).toBe(true)
  expect(await deepClick(page, '[data-filter-action="tags-manage"]')).toBe(true)
  await page.waitForTimeout(150)
  state = await getPMMobileFabState(page)
  expect(state.sortGroupSheetOpen).toBe(false)
  expect(state.hasCredentialsDirectionControl).toBe(false)
  expect(state.hasLegacyCredentialsFilterRow).toBe(false)
  expect(state.credentialsSelectedFilterChipValues).toEqual(['work'])
  expect(state.credentialsSortValue).toBe('username')
  expect(state.credentialsGroupValue).toBe('website')
  const tagSheetOpen = await page.evaluate(() => {
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

    const sheet = deepFind(document, 'pm-mobile-tag-filter-sheet') as HTMLElement | null
    return Boolean(sheet?.shadowRoot?.querySelector('cv-bottom-sheet[open]'))
  })
  expect(tagSheetOpen).toBe(true)
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
      return (
        Boolean(root?.querySelector('mobile-bottom-action-footer.entry-action-footer[columns="2"]')) &&
        Boolean(root?.querySelector('.entry-edit-save-action')) &&
        Boolean(root?.querySelector('.entry-edit-note-input'))
      )
    },
    undefined,
    {timeout: 10_000},
  )

  await page.evaluate(() => {
    ;(window as any).passmanager.showElement.set('createEntry')
  })
  await page.waitForFunction(
    () => (window as any).passmanager?.showElement?.() === 'createEntry',
    undefined,
    {
      timeout: 10_000,
    },
  )
  state = await getPMMobileFabState(page)
  expect(state.actionsHidden).toBe(true)

  await page.evaluate(() => {
    ;(window as any).passmanager.showElement.set('createGroup')
  })
  await page.waitForFunction(
    () => (window as any).passmanager?.showElement?.() === 'createGroup',
    undefined,
    {
      timeout: 10_000,
    },
  )
  state = await getPMMobileFabState(page)
  expect(state.actionsHidden).toBe(true)

  await page.evaluate(() => {
    ;(window as any).passmanager.showElement.set('importDialog')
  })
  await page.waitForFunction(
    () => (window as any).passmanager?.showElement?.() === 'importDialog',
    undefined,
    {
      timeout: 10_000,
    },
  )
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
      return Boolean(createEntry?.shadowRoot?.querySelector('#passwords\\.create\\.submit'))
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
    const button = footer?.querySelector('#passwords\\.create\\.submit') as HTMLButtonElement | null
    if (!footer || !button) {
      return null
    }

    const root = document.documentElement
    root.toggleAttribute('data-mobile-keyboard-expanded', true)
    root.toggleAttribute('data-native-keyboard-insets', true)
    root.toggleAttribute('data-ios-native-keyboard-insets', true)
    root.toggleAttribute('data-mobile-keyboard-native-resize', true)
    root.style.setProperty('--app-runtime-keyboard-native-inset-block-end', '286px')
    root.style.setProperty('--app-runtime-visual-viewport-inset-block-end', '0px')
    root.style.setProperty('--app-runtime-keyboard-inset-block-end', '286px')
    root.style.setProperty('--app-runtime-keyboard-scroll-action-offset', '0px')
    root.style.setProperty('--app-runtime-keyboard-scroll-clearance', '0px')
    root.style.setProperty('--app-runtime-keyboard-overlay-offset', '0px')

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const buttonStyle = getComputedStyle(button)
    const footerStyle = getComputedStyle(footer)
    return {
      buttonBackground: buttonStyle.backgroundColor,
      footerMarginBlockEnd: Number.parseFloat(footerStyle.marginBlockEnd),
      footerScrollActionOffset: footerStyle.getPropertyValue('--app-runtime-keyboard-scroll-action-offset'),
      visualViewportInset: root.style.getPropertyValue('--app-runtime-visual-viewport-inset-block-end'),
    }
  })

  expect(footerState).not.toBeNull()
  expect(footerState!.footerScrollActionOffset.trim()).toBe('0px')
  expect(footerState!.visualViewportInset.trim()).toBe('0px')
  expect(footerState!.footerMarginBlockEnd).toBeGreaterThan(0)
  expect(footerState!.footerMarginBlockEnd).toBeLessThanOrEqual(8)
  expect(footerState!.buttonBackground).not.toBe('rgba(0, 0, 0, 0)')
})

test('app route inherits keyboard-aware active visual viewport inset', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  const geometry = await page.evaluate(async () => {
    const root = document.documentElement
    const app = document.querySelector('chromvoid-app') as HTMLElement | null
    const documentScroller = document.scrollingElement as HTMLElement | null
    if (!app || !documentScroller) return null

    const rawInsetProperty = '--app-runtime-visual-viewport-inset-block-end'
    const activeInsetProperty = '--app-runtime-visual-viewport-inset-block-end-active'
    const keyboardAttributes = ['data-mobile-keyboard-expanded', 'data-visual-viewport-shrunken'] as const
    const previousRawInset = root.style.getPropertyValue(rawInsetProperty)
    const previousAttributes = keyboardAttributes.map(
      (name) => [name, root.hasAttribute(name), root.getAttribute(name)] as const,
    )
    const nextFrames = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const read = () => ({
      activeInset: Number.parseFloat(getComputedStyle(app).getPropertyValue(activeInsetProperty)),
      appHeight: app.getBoundingClientRect().height,
      appOverflowY: getComputedStyle(app).overflowY,
      appScrollTop: app.scrollTop,
      documentScrollTop: documentScroller.scrollTop,
    })

    try {
      for (const name of keyboardAttributes) root.removeAttribute(name)
      root.style.setProperty(rawInsetProperty, '36px')
      await nextFrames()
      const closed = read()

      root.setAttribute('data-mobile-keyboard-expanded', '')
      await nextFrames()
      const expanded = read()

      root.removeAttribute('data-mobile-keyboard-expanded')
      root.setAttribute('data-visual-viewport-shrunken', '')
      await nextFrames()
      const shrunken = read()

      return {closed, expanded, shrunken}
    } finally {
      if (previousRawInset) {
        root.style.setProperty(rawInsetProperty, previousRawInset)
      } else {
        root.style.removeProperty(rawInsetProperty)
      }

      for (const [name, existed, value] of previousAttributes) {
        if (existed) {
          root.setAttribute(name, value ?? '')
        } else {
          root.removeAttribute(name)
        }
      }
    }
  })

  expect(geometry).not.toBeNull()
  expect(geometry!.closed.activeInset).toBe(36)
  expect(geometry!.expanded.activeInset).toBe(0)
  expect(geometry!.shrunken.activeInset).toBe(0)
  expect(geometry!.closed.appHeight - geometry!.expanded.appHeight).toBeCloseTo(36, 0)
  expect(geometry!.closed.appHeight - geometry!.shrunken.appHeight).toBeCloseTo(36, 0)
  expect(geometry!.closed.appOverflowY).toBe('auto')
  expect(geometry!.expanded.appOverflowY).toBe('auto')
  expect(geometry!.shrunken.appOverflowY).toBe('auto')
  expect(geometry!.closed.appScrollTop).toBe(geometry!.expanded.appScrollTop)
  expect(geometry!.expanded.appScrollTop).toBe(geometry!.shrunken.appScrollTop)
  expect(geometry!.closed.documentScrollTop).toBe(geometry!.expanded.documentScrollTop)
  expect(geometry!.expanded.documentScrollTop).toBe(geometry!.shrunken.documentScrollTop)
})

test('mobile entry password double tap opens full edit mode and focuses password', async () => {
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
      return Boolean(entry?.shadowRoot?.querySelector('.primary-card'))
    },
    undefined,
    {timeout: 10_000},
  )

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

      return (
        Boolean(passwordInput) &&
        Boolean(root?.querySelector('.entry-edit-save-action')) &&
        Boolean(root?.querySelector('.entry-edit-cancel-action')) &&
        root?.activeElement === passwordInput &&
        passwordInput?.shadowRoot?.activeElement === nativeInput
      )
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

      return Boolean(deepFind(document, '[data-entry-title-edit-field="title"]'))
    },
    undefined,
    {timeout: 10_000},
  )

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

      return (
        Boolean(titleInput) &&
        Boolean(root?.querySelector('.entry-edit-save-action')) &&
        Boolean(root?.querySelector('.entry-edit-cancel-action')) &&
        root?.activeElement === titleInput &&
        titleInput?.shadowRoot?.activeElement === nativeInput
      )
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
      return (
        Boolean(root?.querySelector('mobile-bottom-action-footer.entry-action-footer[columns="2"]')) &&
        Boolean(root?.querySelector('.entry-edit-save-action')) &&
        Boolean(root?.querySelector('.entry-edit-note-input'))
      )
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
    const entry = deepFind(document, 'pm-entry-mobile') as HTMLElement | null
    const entryRoot = entry?.shadowRoot
    const footer = entryRoot?.querySelector('.entry-action-footer') as HTMLElement | null
    const entryScroll = entryRoot?.querySelector('.entry-scroll') as HTMLElement | null
    const noteInput = entryRoot?.querySelector('.entry-edit-note-input') as HTMLElement | null
    const saveAction = entryRoot?.querySelector('.entry-edit-save-action') as HTMLElement | null
    const cancelAction = entryRoot?.querySelector('.entry-edit-cancel-action') as HTMLElement | null
    if (!entry || !footer || !entryScroll || !saveAction || !cancelAction) {
      return null
    }

    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const keyboardInset = 240
    const keyboardProperties = [
      '--app-runtime-visual-viewport-inset-block-end',
      '--app-runtime-keyboard-inset-block-end',
      '--app-runtime-keyboard-scroll-action-offset',
      '--app-runtime-keyboard-scroll-clearance',
      '--app-runtime-keyboard-overlay-offset',
    ] as const
    const previousKeyboardProperties = keyboardProperties.map(
      (name) => [name, rootElement.style.getPropertyValue(name)] as const,
    )
    const hadKeyboardExpanded = rootElement.hasAttribute('data-mobile-keyboard-expanded')
    const previousKeyboardExpanded = rootElement.getAttribute('data-mobile-keyboard-expanded')

    try {
      await nextFrame()
      const closedFooterRect = footer.getBoundingClientRect()

      for (const name of keyboardProperties) {
        rootElement.style.setProperty(name, `${keyboardInset}px`)
      }
      rootElement.setAttribute('data-mobile-keyboard-expanded', '')
      await nextFrame()

      entryScroll.scrollTop = entryScroll.scrollHeight
      await nextFrame()
      const afterRect = footer.getBoundingClientRect()
      const entryRect = entry.getBoundingClientRect()
      const saveRect = saveAction.getBoundingClientRect()
      const cancelRect = cancelAction.getBoundingClientRect()
      const keyboardTop = entryRect.bottom - keyboardInset
      const viewportKeyboardTop = window.innerHeight - keyboardInset
      const maxScroll = entryScroll.scrollHeight - entryScroll.clientHeight
      return {
        cancelButtonKeyboardGap: keyboardTop - cancelRect.bottom,
        cancelButtonViewportKeyboardGap: viewportKeyboardTop - cancelRect.bottom,
        footerBottomClearance: entryRect.bottom - afterRect.bottom,
        footerMovedUp: closedFooterRect.bottom - afterRect.bottom,
        footerScrollActionOffset: Number.parseFloat(
          getComputedStyle(footer).getPropertyValue('--app-runtime-keyboard-scroll-action-offset'),
        ),
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
      for (const [name, value] of previousKeyboardProperties) {
        if (value) {
          rootElement.style.setProperty(name, value)
        } else {
          rootElement.style.removeProperty(name)
        }
      }

      if (hadKeyboardExpanded) {
        rootElement.setAttribute('data-mobile-keyboard-expanded', previousKeyboardExpanded ?? '')
      } else {
        rootElement.removeAttribute('data-mobile-keyboard-expanded')
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
  expect(clearance!.footerScrollActionOffset).toBe(240)
  expect(clearance!.footerBottomClearance).toBeGreaterThanOrEqual(240)
  expect(clearance!.footerBottomClearance).toBeLessThanOrEqual(248)
  expect(clearance!.footerMovedUp).toBeGreaterThan(0)
  expect(clearance!.saveButtonViewportKeyboardGap).toBeGreaterThanOrEqual(10)
  expect(clearance!.cancelButtonViewportKeyboardGap).toBeGreaterThanOrEqual(10)
})

test('mobile entry create keeps the main form height stable when all Details are configured', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile&e2eWidth=360&e2eHeight=480`)

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
      return Boolean(create?.shadowRoot?.querySelector('[data-details-hub-trigger]'))
    },
    undefined,
    {timeout: 10_000},
  )

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

    const create = deepFind(document, 'pm-entry-create-mobile') as HTMLElement & {
      model?: {
        openDetailsEditor(detail: 'otp'): void
        openDetailsSheet(): void
        setIconRef(value: string): void
        setNote(value: string): void
        setTags(value: string[]): void
        setUseOtp(value: boolean): void
      }
    }
    const root = create?.shadowRoot
    const scroll = root?.querySelector('.create-scroll') as HTMLElement | null
    if (!scroll || !create.model) return

    const initialScrollHeight = scroll.scrollHeight
    create.dataset['initialScrollHeight'] = String(initialScrollHeight)
    create.model.setIconRef('e2e-icon')
    create.model.setTags(['Work', 'Personal'])
    create.model.setUseOtp(true)
    create.model.setNote('Recovery instructions')
    create.model.openDetailsSheet()
    create.model.openDetailsEditor('otp')
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
      const sheet = create?.shadowRoot?.querySelector('pm-entry-create-details-sheet') as HTMLElement | null
      return Boolean(sheet?.shadowRoot?.querySelector('[data-detail-editor="otp"]'))
    },
    undefined,
    {timeout: 10_000},
  )

  const scrollState = await page.evaluate(async () => {
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

    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    const create = deepFind(document, 'pm-entry-create-mobile') as HTMLElement | null
    const root = create?.shadowRoot
    const scroll = root?.querySelector('.create-scroll') as HTMLElement | null
    const footer = root?.querySelector('.create-footer') as HTMLElement | null
    const submit = footer?.querySelector('.create-submit') as HTMLElement | null
    const summary = root?.querySelector('[data-details-hub-trigger]') as HTMLElement | null
    const summaryCount = summary?.querySelector('.details-count')?.textContent?.trim()
    const sheet = root?.querySelector('pm-entry-create-details-sheet') as HTMLElement | null
    const bottomSheet = sheet?.shadowRoot?.querySelector('cv-bottom-sheet') as HTMLElement | null
    const dialog = bottomSheet?.shadowRoot?.querySelector('cv-dialog') as HTMLElement | null
    const sheetBody = dialog?.shadowRoot?.querySelector('[part="body"]') as HTMLElement | null
    const otpEditor = sheet?.shadowRoot?.querySelector('[data-detail-editor="otp"]') as HTMLElement | null
    if (!scroll || !footer || !submit || !summary || !sheetBody || !otpEditor) return null

    const initialScrollHeight = Number(create?.dataset['initialScrollHeight'] ?? Number.NaN)

    return {
      detailsEditorOutsideMainScroll: !scroll.contains(otpEditor),
      footerOutsideScroll: !scroll.contains(footer),
      initialScrollHeight,
      mainScrollHeight: scroll.scrollHeight,
      mainScrollHeightDelta: Math.abs(scroll.scrollHeight - initialScrollHeight),
      mainHasInlineEditor: Boolean(scroll.querySelector('[data-detail-editor], [data-detail-section]')),
      sheetBodyCanScroll: sheetBody.scrollHeight > sheetBody.clientHeight,
      sheetBodyOverflowY: getComputedStyle(sheetBody).overflowY,
      summaryCount,
      submitDisabled: submit.hasAttribute('disabled'),
    }
  })

  expect(scrollState).not.toBeNull()
  expect(scrollState!.detailsEditorOutsideMainScroll).toBe(true)
  expect(scrollState!.footerOutsideScroll).toBe(true)
  expect(scrollState!.mainScrollHeightDelta, JSON.stringify(scrollState)).toBeLessThanOrEqual(1)
  expect(scrollState!.mainHasInlineEditor).toBe(false)
  expect(scrollState!.sheetBodyCanScroll, JSON.stringify(scrollState)).toBe(true)
  expect(scrollState!.sheetBodyOverflowY).toBe('auto')
  expect(scrollState!.summaryCount).toBe('4')
  expect(scrollState!.submitDisabled).toBe(false)
})

test('mobile OTP detail sheet keeps full-width fields and a compact footer without a drag handle', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile&e2eWidth=390&e2eHeight=646`)

  await page.evaluate(() => {
    ;(window as any).passmanager.showElement.set('createEntry')
  })
  await expect.poll(() => deepQuerySelector(page, 'pm-entry-create-mobile'), {timeout: 10_000}).toBe(true)

  await page.evaluate(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (!element.shadowRoot) continue
        const inner = deepFind(element.shadowRoot, selector)
        if (inner) return inner
      }
      return null
    }

    const create = deepFind(document, 'pm-entry-create-mobile') as
      | (HTMLElement & {
          model?: {
            openDetailsSheet(): void
            openDetailsEditor(detail: 'otp'): void
          }
        })
      | null
    create?.model?.openDetailsSheet()
    create?.model?.openDetailsEditor('otp')
  })
  await expect.poll(() => deepQuerySelector(page, '[data-detail-editor="otp"]'), {timeout: 10_000}).toBe(true)
  await page.waitForTimeout(250)

  const metrics = await page.evaluate(async () => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (!element.shadowRoot) continue
        const inner = deepFind(element.shadowRoot, selector)
        if (inner) return inner
      }
      return null
    }

    const create = deepFind(document, 'pm-entry-create-mobile') as
      | (HTMLElement & {
          model?: {
            otp: {setSecret(value: string): string}
            setUseOtp(value: boolean): void
          }
        })
      | null
    const sheet = create?.shadowRoot?.querySelector('pm-entry-create-details-sheet') as
      | (HTMLElement & {updateComplete: Promise<unknown>})
      | null
    const bottomSheet = sheet?.shadowRoot?.querySelector('cv-bottom-sheet') as
      | (HTMLElement & {showHandle: boolean; updateComplete: Promise<unknown>})
      | null
    const dialog = bottomSheet?.shadowRoot?.querySelector('cv-dialog') as HTMLElement | null
    const dialogRoot = dialog?.shadowRoot
    const content = dialogRoot?.querySelector<HTMLElement>('[part="content"]') ?? null
    const title = dialogRoot?.querySelector<HTMLElement>('[part="title"]') ?? null
    const body = dialogRoot?.querySelector<HTMLElement>('[part="body"]') ?? null
    const footer = dialogRoot?.querySelector<HTMLElement>('[part="footer"]') ?? null
    const otpEditor = sheet?.shadowRoot?.querySelector('pm-entry-otp-create') as HTMLElement | null
    const otpRoot = otpEditor?.shadowRoot
    const card = otpRoot?.querySelector<HTMLElement>('.otp-create-card') ?? null
    const secretInput = otpRoot?.querySelector<HTMLElement>('.secret-input') ?? null
    const displayInput = otpRoot?.querySelector<HTMLElement>('.display-name-input') ?? null
    if (
      !create?.model ||
      !sheet ||
      !bottomSheet ||
      !content ||
      !title ||
      !body ||
      !footer ||
      !card ||
      !secretInput ||
      !displayInput
    ) {
      return null
    }

    const nextPaint = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const readGeometry = () => {
      const contentRect = content.getBoundingClientRect()
      const bodyRect = body.getBoundingClientRect()
      const footerRect = footer.getBoundingClientRect()
      const titleRect = title.getBoundingClientRect()
      const cardRect = card.getBoundingClientRect()
      const secretRect = secretInput.getBoundingClientRect()
      const displayRect = displayInput.getBoundingClientRect()
      const actions = Array.from(
        sheet.shadowRoot?.querySelectorAll<HTMLElement>('.sheet-actions cv-button') ?? [],
      )
      const primary = sheet.shadowRoot?.querySelector<HTMLElement>('[data-details-primary-action]') ?? null
      const primaryRect = primary?.getBoundingClientRect()

      return {
        actionCount: actions.length,
        bodyFooterGap: footerRect.top - bodyRect.bottom,
        footerContentGap: contentRect.bottom - footerRect.bottom,
        footerHeight: footerRect.height,
        primaryHeight: primaryRect?.height ?? 0,
        contentBottom: contentRect.bottom,
        titleTopInset: titleRect.top - contentRect.top,
        cardWidth: cardRect.width,
        secretWidth: secretRect.width,
        displayWidth: displayRect.width,
      }
    }

    await nextPaint()
    const empty = readGeometry()
    create.model.otp.setSecret('JBSWY3DPEHPK3PXP')
    create.model.setUseOtp(true)
    await sheet.updateComplete
    await bottomSheet.updateComplete
    await nextPaint()

    return {
      empty,
      configured: readGeometry(),
      showHandle: bottomSheet.showHandle,
      hasHandle: Boolean(bottomSheet.shadowRoot?.querySelector('[part="handle"]')),
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportHeight: window.innerHeight,
    }
  })

  expect(metrics).not.toBeNull()
  expect(metrics!.showHandle).toBe(false)
  expect(metrics!.hasHandle).toBe(false)
  expect(metrics!.documentScrollWidth).toBe(metrics!.documentClientWidth)
  expect(metrics!.empty.actionCount).toBe(1)
  expect(metrics!.configured.actionCount).toBe(2)

  for (const state of [metrics!.empty, metrics!.configured]) {
    expect(Math.abs(state.bodyFooterGap), JSON.stringify(state)).toBeLessThanOrEqual(1)
    expect(Math.abs(state.footerContentGap), JSON.stringify(state)).toBeLessThanOrEqual(1)
    expect(state.footerHeight - state.primaryHeight, JSON.stringify(state)).toBeLessThanOrEqual(40)
    expect(state.contentBottom, JSON.stringify(state)).toBeLessThanOrEqual(metrics!.viewportHeight + 1)
    expect(state.titleTopInset, JSON.stringify(state)).toBeGreaterThanOrEqual(12)
    expect(Math.abs(state.secretWidth - state.cardWidth), JSON.stringify(state)).toBeLessThanOrEqual(1)
    expect(Math.abs(state.displayWidth - state.cardWidth), JSON.stringify(state)).toBeLessThanOrEqual(1)
  }
})

test('mobile Advanced OTP keeps the longest controls reachable inside a short sheet viewport', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile&e2eWidth=403&e2eHeight=321`)

  await page.evaluate(() => {
    ;(window as any).passmanager.showElement.set('createEntry')
  })
  await expect.poll(() => deepQuerySelector(page, 'pm-entry-create-mobile'), {timeout: 10_000}).toBe(true)

  await page.evaluate(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (!element.shadowRoot) continue
        const inner = deepFind(element.shadowRoot, selector)
        if (inner) return inner
      }
      return null
    }

    const create = deepFind(document, 'pm-entry-create-mobile') as
      | (HTMLElement & {
          model?: {
            openDetailsSheet(): void
            openDetailsEditor(detail: 'otp'): void
            otp: {
              setPreset(value: 'custom'): void
              actions: {openAdvanced(): void}
            }
          }
        })
      | null
    create?.model?.openDetailsSheet()
    create?.model?.openDetailsEditor('otp')
    create?.model?.otp.setPreset('custom')
    create?.model?.otp.actions.openAdvanced()
  })
  await expect.poll(() => deepQuerySelector(page, '.custom-controls'), {timeout: 10_000}).toBe(true)
  await page.waitForTimeout(250)

  const metrics = await page.evaluate(async () => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (!element.shadowRoot) continue
        const inner = deepFind(element.shadowRoot, selector)
        if (inner) return inner
      }
      return null
    }

    const sheet = deepFind(document, 'pm-entry-create-details-sheet') as HTMLElement | null
    const bottomSheet = sheet?.shadowRoot?.querySelector('cv-bottom-sheet') as
      | (HTMLElement & {showHandle: boolean})
      | null
    const dialog = bottomSheet?.shadowRoot?.querySelector('cv-dialog') as HTMLElement | null
    const dialogRoot = dialog?.shadowRoot
    const header = dialogRoot?.querySelector<HTMLElement>('[part="header"]') ?? null
    const body = dialogRoot?.querySelector<HTMLElement>('[part="body"]') ?? null
    const footer = dialogRoot?.querySelector<HTMLElement>('[part="footer"]') ?? null
    const otpEditor = sheet?.shadowRoot?.querySelector('pm-entry-otp-create') as HTMLElement | null
    const customControls = otpEditor?.shadowRoot?.querySelector<HTMLElement>('.custom-controls') ?? null
    const lastControl = customControls?.lastElementChild as HTMLElement | null
    if (!bottomSheet || !header || !body || !footer || !lastControl) return null

    const nextPaint = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    await nextPaint()
    const headerBefore = header.getBoundingClientRect()
    const footerBefore = footer.getBoundingClientRect()
    const scrollRange = body.scrollHeight - body.clientHeight
    body.scrollTop = body.scrollHeight
    await nextPaint()
    const headerAfter = header.getBoundingClientRect()
    const bodyAfter = body.getBoundingClientRect()
    const lastControlAfter = lastControl.getBoundingClientRect()

    return {
      showHandle: bottomSheet.showHandle,
      hasHandle: Boolean(bottomSheet.shadowRoot?.querySelector('[part="handle"]')),
      bodyClientHeight: body.clientHeight,
      bodyOverflowY: getComputedStyle(body).overflowY,
      scrollRange,
      scrollTop: body.scrollTop,
      headerTopShift: headerAfter.top - headerBefore.top,
      headerBottomShift: headerAfter.bottom - headerBefore.bottom,
      lastControlTop: lastControlAfter.top,
      lastControlBottom: lastControlAfter.bottom,
      bodyTop: bodyAfter.top,
      bodyBottom: bodyAfter.bottom,
      footerHeight: footerBefore.height,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientHeight: document.documentElement.clientHeight,
      documentScrollHeight: document.documentElement.scrollHeight,
      windowScrollY: window.scrollY,
    }
  })

  expect(metrics).not.toBeNull()
  expect(metrics!.showHandle).toBe(false)
  expect(metrics!.hasHandle).toBe(false)
  expect(metrics!.bodyClientHeight).toBeGreaterThan(0)
  expect(metrics!.bodyOverflowY).toBe('auto')
  expect(metrics!.scrollRange).toBeGreaterThan(0)
  expect(metrics!.scrollTop).toBeGreaterThan(0)
  expect(Math.abs(metrics!.headerTopShift), JSON.stringify(metrics)).toBeLessThanOrEqual(1)
  expect(Math.abs(metrics!.headerBottomShift), JSON.stringify(metrics)).toBeLessThanOrEqual(1)
  expect(metrics!.lastControlTop, JSON.stringify(metrics)).toBeGreaterThanOrEqual(metrics!.bodyTop)
  expect(metrics!.lastControlBottom, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics!.bodyBottom)
  expect(metrics!.footerHeight).toBe(0)
  expect(metrics!.documentScrollWidth).toBe(metrics!.documentClientWidth)
  expect(metrics!.documentScrollHeight).toBe(metrics!.documentClientHeight)
  expect(metrics!.windowScrollY).toBe(0)
})

test('mobile entry create uses one shared tag picker and commits only on Done', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  await page.evaluate(() => {
    const passmanager = (window as any).passmanager
    passmanager.credentialTags.set(['Work', 'Rotate'])
    passmanager.showElement.set('createEntry')
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

    return Boolean(deepFind(document, 'pm-entry-create-mobile'))
  })

  expect(await deepClick(page, '[data-details-hub-trigger]')).toBe(true)
  expect(await deepClick(page, '[data-detail="tags"]')).toBe(true)
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

    return Boolean(deepFind(document, '.tag-chip[data-tag-key="work"]'))
  })

  const initialState = await page.evaluate(() => {
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

    function countOpenSheets(root: Document | ShadowRoot): number {
      let count = root.querySelectorAll('cv-bottom-sheet[open]').length
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) count += countOpenSheets(element.shadowRoot)
      }
      return count
    }

    const create = deepFind(document, 'pm-entry-create-mobile') as
      | (HTMLElement & {model?: {tags(): string[]}})
      | null
    const globalSheet = deepFind(document, 'pm-mobile-tag-filter-sheet') as HTMLElement | null
    const globalBottomSheet = globalSheet?.shadowRoot?.querySelector('cv-bottom-sheet') as
      | (HTMLElement & {open?: boolean})
      | null
    return {
      draftTags: create?.model?.tags() ?? [],
      globalTagSheetOpen: Boolean(globalBottomSheet?.open),
      openSheetCount: countOpenSheets(document),
    }
  })

  expect(initialState).toEqual({
    draftTags: [],
    globalTagSheetOpen: false,
    openSheetCount: 1,
  })

  expect(await deepClick(page, '.tag-chip[data-tag-key="work"]')).toBe(true)
  expect(
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
      const create = deepFind(document, 'pm-entry-create-mobile') as
        | (HTMLElement & {model?: {tags(): string[]}})
        | null
      return create?.model?.tags() ?? []
    }),
  ).toEqual([])

  expect(await deepClick(page, '.sheet-actions cv-button:last-child')).toBe(true)
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
    const create = deepFind(document, 'pm-entry-create-mobile') as
      | (HTMLElement & {model?: {detailsSheetView(): string; tags(): string[]}})
      | null
    return create?.model?.detailsSheetView() === 'hub' && create.model.tags().includes('Work')
  })

  expect(await deepClick(page, '[data-detail="tags"]')).toBe(true)
  expect(await deepClick(page, '.tag-chip[data-tag-key="rotate"]')).toBe(true)
  expect(await deepClick(page, '[data-detail-back]')).toBe(true)

  const finalTags = await page.evaluate(() => {
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
    const create = deepFind(document, 'pm-entry-create-mobile') as
      | (HTMLElement & {model?: {detailsSheetView(): string; tags(): string[]}})
      | null
    return {
      tags: create?.model?.tags() ?? [],
      view: create?.model?.detailsSheetView() ?? '',
    }
  })

  expect(finalTags).toEqual({tags: ['Work'], view: 'hub'})
})

test('mobile create tag sheet stays inside the overlay keyboard viewport and keeps its list scrollable', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 390, height: 844})
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=mobile`)

  await page.evaluate(() => {
    const passmanager = (window as any).passmanager
    passmanager.credentialTags.set(
      Array.from({length: 28}, (_, index) => `Tag ${String(index + 1).padStart(2, '0')}`),
    )
    passmanager.showElement.set('createEntry')
  })
  await expect.poll(() => deepQuerySelector(page, 'pm-entry-create-mobile'), {timeout: 10_000}).toBe(true)

  expect(await deepClick(page, '[data-details-hub-trigger]')).toBe(true)
  expect(await deepClick(page, '[data-detail="tags"]')).toBe(true)
  expect(await deepClick(page, '.new-tag-button')).toBe(true)

  const metrics = await page.evaluate(async () => {
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

    const root = document.documentElement
    const keyboardInset = 360
    root.setAttribute('data-mobile-keyboard-expanded', '')
    root.style.setProperty('--app-runtime-visual-viewport-block-size', '844px')
    root.style.setProperty('--app-runtime-visual-viewport-inset-block-end', `${keyboardInset}px`)
    root.style.setProperty('--app-runtime-keyboard-native-inset-block-end', `${keyboardInset}px`)

    await new Promise<void>((resolve) => window.setTimeout(resolve, 200))

    const picker = deepFind(document, 'pm-mobile-tag-picker') as HTMLElement | null
    const detailsSheet =
      picker?.getRootNode() instanceof ShadowRoot ? (picker.getRootNode() as ShadowRoot).host : null
    const bottomSheet = detailsSheet?.shadowRoot?.querySelector('cv-bottom-sheet') as HTMLElement | null
    const dialog = bottomSheet?.shadowRoot?.querySelector('cv-dialog') as HTMLElement | null
    const content = dialog?.shadowRoot?.querySelector('[part="content"]') as HTMLElement | null
    const footer = dialog?.shadowRoot?.querySelector('[part="footer"]') as HTMLElement | null
    const input = picker?.shadowRoot?.querySelector<HTMLInputElement>('.draft-input') ?? null
    const tagScroll = picker?.shadowRoot?.querySelector<HTMLElement>('.tag-scroll') ?? null

    input?.focus()
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    const contentRect = content?.getBoundingClientRect()
    const footerRect = footer?.getBoundingClientRect()
    const inputRect = input?.getBoundingClientRect()
    return {
      contentBottom: contentRect?.bottom ?? -1,
      contentTop: contentRect?.top ?? -1,
      footerBottom: footerRect?.bottom ?? -1,
      inputBottom: inputRect?.bottom ?? -1,
      inputTop: inputRect?.top ?? -1,
      keyboardTop: window.innerHeight - keyboardInset,
      tagScrollClientHeight: tagScroll?.clientHeight ?? 0,
      tagScrollOverflowY: tagScroll ? getComputedStyle(tagScroll).overflowY : '',
      tagScrollRange: tagScroll ? tagScroll.scrollHeight - tagScroll.clientHeight : 0,
    }
  })

  expect(metrics.contentTop, JSON.stringify(metrics)).toBeGreaterThanOrEqual(-1)
  expect(metrics.contentBottom, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.keyboardTop + 1)
  expect(metrics.footerBottom, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.keyboardTop + 1)
  expect(metrics.inputTop, JSON.stringify(metrics)).toBeGreaterThanOrEqual(metrics.contentTop)
  expect(metrics.inputBottom, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.keyboardTop)
  expect(metrics.tagScrollClientHeight, JSON.stringify(metrics)).toBeGreaterThan(0)
  expect(metrics.tagScrollOverflowY).toBe('auto')
  expect(metrics.tagScrollRange, JSON.stringify(metrics)).toBeGreaterThan(0)
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
      return (
        Boolean(root?.querySelector('.create-scroll')) &&
        Boolean(root?.querySelector('.create-footer')) &&
        Boolean(root?.querySelector('#passwords\\.create\\.submit'))
      )
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
    const submit = footer?.querySelector('#passwords\\.create\\.submit') as HTMLButtonElement | null
    if (!mobileShell || !create || !scroll || !footer || !submit) {
      return null
    }

    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const bottomChromeClearance = 64
    const keyboardInset = 240
    const keyboardProperties = [
      '--app-runtime-visual-viewport-inset-block-end',
      '--app-runtime-keyboard-inset-block-end',
      '--app-runtime-keyboard-scroll-action-offset',
      '--app-runtime-keyboard-scroll-clearance',
      '--app-runtime-keyboard-overlay-offset',
    ] as const
    const previousKeyboardProperties = keyboardProperties.map(
      (name) => [name, rootElement.style.getPropertyValue(name)] as const,
    )
    const hadKeyboardExpanded = rootElement.hasAttribute('data-mobile-keyboard-expanded')
    const previousKeyboardExpanded = rootElement.getAttribute('data-mobile-keyboard-expanded')
    const previousShellBottomChrome = mobileShell.style.getPropertyValue('--mobile-tab-bar-content-clearance')

    try {
      await nextFrame()
      const closedCreateRect = create.getBoundingClientRect()
      const closedSubmitRect = submit.getBoundingClientRect()

      for (const name of keyboardProperties) {
        rootElement.style.setProperty(name, `${keyboardInset}px`)
      }
      rootElement.setAttribute('data-mobile-keyboard-expanded', '')
      mobileShell.style.setProperty('--mobile-tab-bar-content-clearance', `${bottomChromeClearance}px`)
      await nextFrame()

      scroll.scrollTop = scroll.scrollHeight
      await nextFrame()

      const createRect = create.getBoundingClientRect()
      const submitRect = submit.getBoundingClientRect()
      const keyboardTop = createRect.bottom - keyboardInset
      const viewportKeyboardTop = window.innerHeight - keyboardInset
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
      for (const [name, value] of previousKeyboardProperties) {
        if (value) {
          rootElement.style.setProperty(name, value)
        } else {
          rootElement.style.removeProperty(name)
        }
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
  expect(clearance!.maxScroll).toBeGreaterThanOrEqual(0)
  expect(clearance!.scrollAtBottom).toBe(true)
  expect(clearance!.submitButtonKeyboardGap).toBeGreaterThanOrEqual(10)
  expect(clearance!.submitButtonViewportKeyboardGap).toBeGreaterThanOrEqual(10)
})

test('mobile unlock password dialog uses sheet clearance without resizing the app route', async () => {
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

  await page.locator('cv-input-dialog cv-input input').focus()

  await page.evaluate(async () => {
    const root = document.documentElement
    root.setAttribute('data-mobile-keyboard-expanded', '')
    root.style.setProperty('--app-runtime-visual-viewport-inset-block-end', '280px')
    root.style.setProperty('--app-runtime-visual-viewport-block-size', `${window.innerHeight - 344}px`)
    root.style.setProperty('--app-runtime-dialog-password-input-keyboard-offset', '280px')
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
  const visibleViewportBlockSize = Number.parseFloat(afterKeyboard.rootVisualViewportBlockSize)
  expect(Number.isFinite(visibleViewportBlockSize)).toBe(true)
  expect(
    afterKeyboard.sheetKeyboardInset?.trim() === '280px' ||
      Boolean(
        afterKeyboard.sheetKeyboardInset?.includes('--app-runtime-dialog-password-input-keyboard-offset'),
      ),
  ).toBe(true)
  expect(Math.abs(afterKeyboard.appRect!.top - beforeKeyboard.appRect!.top)).toBeLessThanOrEqual(1)
  expect(Math.abs(afterKeyboard.appRect!.bottom - beforeKeyboard.appRect!.bottom)).toBeLessThanOrEqual(1)
  expect(Math.abs(afterKeyboard.layoutRect!.top - beforeKeyboard.layoutRect!.top)).toBeLessThanOrEqual(1)
  expect(afterKeyboard.layoutRect!.bottom - beforeKeyboard.layoutRect!.bottom).toBeCloseTo(64, 0)
  const keyboardInset = Number.parseFloat(afterKeyboard.rootKeyboardInset)
  expect(afterKeyboard.contentRect!.bottom).toBeLessThanOrEqual(
    afterKeyboard.viewportHeight - keyboardInset + 1,
  )
  expect(afterKeyboard.contentRect!.height).toBeLessThanOrEqual(visibleViewportBlockSize + 1)
  expect(afterKeyboard.footerRect!.bottom).toBeLessThanOrEqual(afterKeyboard.contentRect!.bottom + 1)
  expect(afterKeyboard.footerRect!.top).toBeGreaterThanOrEqual(afterKeyboard.contentRect!.top - 1)
  expect(afterKeyboard.primaryActionRect!.bottom).toBeLessThanOrEqual(afterKeyboard.contentRect!.bottom + 1)
  expect(afterKeyboard.viewportHeight - afterKeyboard.primaryActionRect!.bottom).toBeGreaterThanOrEqual(260)

  await page.evaluate(async () => {
    const root = document.documentElement
    root.removeAttribute('data-mobile-keyboard-expanded')
    root.style.setProperty('--app-runtime-visual-viewport-inset-block-end', '0px')
    root.style.removeProperty('--app-runtime-visual-viewport-block-size')
    const dynamicImport = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<typeof KeyboardStabilizationModule>
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
  const onConsole = (msg: ConsoleMessage) => {
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

        const toolbar = deepFind(document, 'mobile-top-toolbar') as
          | (HTMLElement & {
              actions?: Array<{id: string}>
            })
          | null
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
    expect(state.actionIds).toEqual(['pm-selection-done', 'pm-selection-delete'])
    expect(logs.some((line) => line.includes('[dashboard] init()'))).toBe(false)
    expect(logs.some((line) => line.includes('AppContext already initialized'))).toBe(false)
    expect(logs.some((line) => line.includes('runPassmanagerReload: start'))).toBe(false)

    expect(
      await page.evaluate(async (id) => {
        const {pmMobileSelectionModel} = await (0, eval)(
          'import("/features/passmanager/models/pm-mobile-selection.model.ts")',
        )
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
        const {pmMobileChromeModel} = await (0, eval)(
          'import("/features/passmanager/models/pm-mobile-chrome.model.ts")',
        )
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

test('desktop sidebar activates group and root rows from the keyboard', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enableAndWaitForPasswordManager(page, `${BASE_URL}?layout=desktop`)

  const groupFocused = await page.evaluate(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (!element.shadowRoot) continue
        const inner = deepFind(element.shadowRoot, selector)
        if (inner) return inner
      }
      return null
    }

    const tree = deepFind(document, 'group-tree-view') as HTMLElement | null
    const groupRow = Array.from(
      tree?.shadowRoot?.querySelectorAll<HTMLElement>('.row[data-kind="group"]') ?? [],
    ).find((row) => row.querySelector('.name')?.textContent?.trim() === 'layout-fixture-group')
    groupRow?.focus()
    return groupRow === tree?.shadowRoot?.activeElement
  })
  expect(groupFocused).toBe(true)

  await page.keyboard.press('Enter')
  await page.waitForFunction(
    () => (window as any).passmanager?.showElement?.()?.name === 'layout-fixture-group',
    undefined,
    {timeout: 5_000},
  )
  await page.waitForFunction(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (!element.shadowRoot) continue
        const inner = deepFind(element.shadowRoot, selector)
        if (inner) return inner
      }
      return null
    }

    const tree = deepFind(document, 'group-tree-view') as HTMLElement | null
    return Array.from(
      tree?.shadowRoot?.querySelectorAll<HTMLElement>('.row[data-kind="group"]') ?? [],
    ).some(
      (row) =>
        row.classList.contains('selected') &&
        row.querySelector('.name')?.textContent?.trim() === 'layout-fixture-group',
    )
  })
  const contextHeaderRect = await getDeepRect(page, 'pm-workspace-header')
  expect(contextHeaderRect?.height).toBeLessThanOrEqual(72)
  await page.evaluate(async () => {
    const {pmMotionModel} = await (0, eval)(
      'import("/features/passmanager/models/pm-motion.model.ts")',
    )
    await pmMotionModel.whenSettled()
  })

  const rootState = await page.evaluate(() => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (!element.shadowRoot) continue
        const inner = deepFind(element.shadowRoot, selector)
        if (inner) return inner
      }
      return null
    }

    const tree = deepFind(document, 'group-tree-view') as HTMLElement | null
    const rootRow = tree?.shadowRoot?.querySelector<HTMLElement>('.row[data-kind="root"]') ?? null
    rootRow?.focus()
    return {
      focused: rootRow === tree?.shadowRoot?.activeElement,
      label: rootRow?.querySelector('.name')?.textContent?.trim() ?? null,
    }
  })
  expect(rootState).toEqual({focused: true, label: 'Root'})

  await page.keyboard.press('Space')
  await page.waitForFunction(() => (window as any).passmanager?.isShowRoot === true, undefined, {
    timeout: 5_000,
  })
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
          managerSaver?: {
            secrets?: {
              catalog?: {transport?: {sendCatalog?: (action: string, payload: unknown) => Promise<unknown>}}
            }
          }
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
      throw new Error(
        `passmanager:entry:save(withSubtitle) failed: ${String(saveWithSubtitle.error ?? 'unknown')}`,
      )
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
        (row) =>
          row.classList.contains('entry-row') && deepText(row).includes(target.entryWithoutSubtitleTitle),
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
          managerSaver?: {
            secrets?: {
              catalog?: {
                transport?: {sendPassmanager?: (action: string, payload: unknown) => Promise<unknown>}
              }
            }
          }
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
        title:
          index === target.entryCount - 1
            ? target.targetTitle
            : `scroll-open-entry-${target.groupName}-${index}`,
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

  const scrollTop = await page.evaluate(async () => {
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

    const updateComplete = (virtualizer as HTMLElement & {updateComplete?: Promise<unknown>}).updateComplete
    if (updateComplete) await updateComplete
    const layoutComplete = (virtualizer as HTMLElement & {layoutComplete?: Promise<unknown>}).layoutComplete
    if (layoutComplete) await layoutComplete
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    virtualizer.scrollTop = 48 * 24
    virtualizer.dispatchEvent(new Event('scroll'))
    virtualizer.dispatchEvent(new Event('scrollend'))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    return virtualizer.scrollTop
  })
  expect(scrollTop).toBeGreaterThan(0)

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

      return Array.from(root.querySelectorAll('.entry-row')).some((row) =>
        deepText(row).includes(targetTitle),
      )
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

      const targetRow = Array.from(root.querySelectorAll('.entry-row')).find((row) =>
        deepText(row).includes(targetTitle),
      )
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

  await page.evaluate(async (labels) => {
    const pm = (window as unknown as {passmanager?: unknown}).passmanager as
      | {
          createGroup: (
            data: {name: string; icon?: unknown; entries: unknown[]},
            options?: {presentation?: 'auto' | 'defer'},
          ) => Promise<unknown>
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
    await pm.createGroup(
      {name: labels.parent, icon: undefined, entries: []},
      {presentation: 'defer'},
    )
    await pm.createGroup(
      {name: labels.child, icon: undefined, entries: []},
      {presentation: 'defer'},
    )
    await pm.createGroup(
      {name: labels.sibling, icon: undefined, entries: []},
      {presentation: 'defer'},
    )

    const childGroup = pm.entriesList().find((item) => item?.name === labels.child)
    if (!childGroup) {
      throw new Error(`child group ${labels.child} was not created`)
    }

    pm.showElement?.set?.(childGroup)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
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
      const header = group?.shadowRoot?.querySelector('pm-workspace-header') as
        | (HTMLElement & {title?: string})
        | null
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

  await page.waitForFunction(
    (label) => {
      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const element of root.querySelectorAll('*')) {
          if (element.shadowRoot) {
            const nested = deepFind(element.shadowRoot, selector)
            if (nested) return nested
          }
        }
        return null
      }

      const layout = deepFind(document, 'password-manager-desktop-layout') as HTMLElement | null
      const tree = layout?.shadowRoot?.querySelector('group-tree-view') as HTMLElement | null
      return Array.from(tree?.shadowRoot?.querySelectorAll<HTMLElement>('.row') ?? []).some(
        (row) => row.querySelector('.name')?.textContent?.trim() === label,
      )
    },
    labels.sibling,
    {timeout: 10_000},
  )

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
