const BASE_URL = 'http://localhost:4400'

export async function waitForWSConnected(page: import('playwright').Page) {
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

      const rootReady = !document.documentElement.hasAttribute('loading')
      const bodyReady = !document.body.hasAttribute('loading')
      return rootReady && bodyReady && !deepFind(document, 'no-connection')
    },
    undefined,
    {timeout: 10_000},
  )
}

export async function waitForAuthenticated(page: import('playwright').Page) {
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

      const rootReady = !document.documentElement.hasAttribute('loading')
      const bodyReady = !document.body.hasAttribute('loading')
      const routeReady = Boolean(
        deepFind(
          document,
          'chromvoid-file-manager, password-manager, passkeys-page, settings-page, remote-page, gateway-page, remote-storage-page',
        ),
      )

      return rootReady && bodyReady && routeReady && !deepFind(document, 'welcome-page, no-license, no-connection')
    },
    undefined,
    {timeout: 10_000},
  )
}

export async function waitForCatalogReady(page: import('playwright').Page) {
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

      const url = new URL(window.location.href)
      if (url.searchParams.get('surface') !== 'files') {
        return false
      }

      return Boolean(deepFind(document, 'dashboard-file-list'))
    },
    undefined,
    {timeout: 15_000},
  )
}

export async function openFilesRoot(page: import('playwright').Page) {
  await page.goto(`${BASE_URL}/index.html?surface=files&path=%2F`, {waitUntil: 'domcontentloaded'})
  await waitForAuthenticated(page)
  await waitForCatalogReady(page)
  await waitForCurrentPath(page, '/')
}

export async function waitForCurrentPath(page: import('playwright').Page, path: string) {
  await page.waitForFunction(
    (nextPath) => {
      return new URL(window.location.href).searchParams.get('path') === nextPath
    },
    path,
    {timeout: 10_000},
  )
}

export async function waitForCatalogItem(
  page: import('playwright').Page,
  name: string,
  options: {exists?: boolean; path?: string} = {},
) {
  const exists = options.exists ?? true
  const path = options.path

  await page.waitForFunction(
    ({itemName, shouldExist, nextPath}) => {
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

      const currentPath = new URL(window.location.href).searchParams.get('path') ?? '/'
      if (nextPath && currentPath !== nextPath) {
        return false
      }

      const items = deepCollect(document, 'file-item-desktop, file-item-mobile') as Array<
        HTMLElement & {item?: {name?: string}}
      >
      if (items.length === 0) return false

      const hasItem = items.some((item) => item.item?.name === itemName)
      return shouldExist ? hasItem : !hasItem
    },
    {itemName: name, shouldExist: exists, nextPath: path},
    {timeout: 10_000},
  )
}

export async function waitForRoute(page: import('playwright').Page, route: string) {
  await page.waitForFunction(
    (r) => {
      const url = new URL(window.location.href)
      if (r === 'dashboard') {
        return url.searchParams.get('surface') === 'files'
      }
      return url.searchParams.get('surface') === r
    },
    route,
    {timeout: 10_000},
  )
}

export async function mockCreateFolderDialog(page: import('playwright').Page, name: string) {
  await page.evaluate((nextName) => {
    ;(window as any).dialogService.showCreateFolderDialog = async () => nextName
  }, name)
}

export async function mockRenameFolderDialog(page: import('playwright').Page, name: string) {
  await page.evaluate((nextName) => {
    ;(window as any).dialogService.showRenameFolderDialog = async () => nextName
  }, name)
}

export async function mockDeleteConfirmDialog(page: import('playwright').Page, confirmed: boolean) {
  await page.evaluate((nextConfirmed) => {
    ;(window as any).dialogService.showDeleteConfirmDialog = async () => nextConfirmed
  }, confirmed)
}

export async function createFolder(page: import('playwright').Page, name: string) {
  await mockCreateFolderDialog(page, name)
  await page.keyboard.press('Control+Shift+N')
}

export async function dispatchFileAction(page: import('playwright').Page, name: string, action: string) {
  await page.evaluate(
    ({itemName, nextAction}) => {
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

      const hosts = deepCollect(document, 'file-item-desktop, file-item-mobile') as Array<
        HTMLElement & {item?: {name?: string; id?: number}}
      >
      const item = hosts.find((host) => host.item?.name === itemName)?.item
      if (!item || typeof item.id !== 'number') {
        throw new Error(`No file item found for "${itemName}"`)
      }

      window.dispatchEvent(
        new CustomEvent('file-action', {
          detail: {
            action: nextAction,
            fileId: item.id,
          },
        }),
      )
    },
    {itemName: name, nextAction: action},
  )
}

export function createUniqueName(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export type MockTransportLogEntry = {
  channel: 'catalog' | 'passmanager'
  command: string
  data: Record<string, unknown>
  result: unknown
  at: number
}

export async function readMockTransportLog(): Promise<MockTransportLogEntry[]> {
  const response = await fetch(`${BASE_URL}/api/mock-transport-log`)
  if (!response.ok) {
    throw new Error(`mock transport log request failed: ${response.status}`)
  }

  const payload = (await response.json()) as {calls?: MockTransportLogEntry[]}
  return Array.isArray(payload.calls) ? payload.calls : []
}

export async function clearMockTransportLog(): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/mock-transport-log`, {method: 'DELETE'})
  if (!response.ok) {
    throw new Error(`mock transport log reset failed: ${response.status}`)
  }
}

export async function writeMockPassmanagerState(state: unknown): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/mock-passmanager-state`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(state),
  })
  if (!response.ok) {
    throw new Error(`mock passmanager state write failed: ${response.status}`)
  }
}

export async function clearMockPassmanagerState(): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/mock-passmanager-state`, {method: 'DELETE'})
  if (!response.ok) {
    throw new Error(`mock passmanager state reset failed: ${response.status}`)
  }
}
