import {expect, test} from 'vitest'
import {clearMockPassmanagerState, writeMockPassmanagerState} from './utils'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

const BASE_URL = 'http://localhost:4400/index.html?layout=desktop'

async function enablePasswordManager(page: import('playwright').Page): Promise<void> {
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

      return (
        !document.documentElement.hasAttribute('loading') &&
        !document.body.hasAttribute('loading') &&
        Boolean(deepFind(document, 'password-manager'))
      )
    },
    undefined,
    {timeout: 15_000},
  )
}

async function deepHasText(page: import('playwright').Page, text: string): Promise<boolean> {
  return page.evaluate((needle) => {
    function walk(root: Document | ShadowRoot): boolean {
      const nodes = root.querySelectorAll('*')
      for (const node of nodes) {
        const el = node as HTMLElement
        if ((el.textContent ?? '').includes(needle)) return true
        if (el.shadowRoot && walk(el.shadowRoot)) return true
      }
      return false
    }
    return walk(document)
  }, text)
}

async function readMockPassmanagerState(): Promise<{
  folders?: string[]
  entries?: Array<{meta?: {title?: string}}>
}> {
  const response = await fetch('http://localhost:4400/api/mock-passmanager-state')
  if (!response.ok) {
    throw new Error(`mock passmanager state read failed: ${response.status}`)
  }

  return (await response.json()) as {
    folders?: string[]
    entries?: Array<{meta?: {title?: string}}>
  }
}

test('S22: passmanager create entry/group survives refresh load cycle', async (ctx) => {
  const page = globalThis.__E2E_PAGE__!
  if (!page) {
    return ctx.skip()
  }

  const suffix = Date.now()
  const groupName = `e2e-group-${suffix}`
  const entryTitle = `e2e-entry-${suffix}`
  const entryId = `e2e-entry-id-${suffix}`

  await clearMockPassmanagerState()
  await writeMockPassmanagerState({
    version: 1,
    revision: 1,
    nextNodeId: 3,
    folders: [groupName],
    foldersMeta: [],
    entries: [
      {
        nodeId: 2,
        meta: {
          id: entryId,
          title: entryTitle,
          username: 'e2e-user',
          folderPath: groupName,
          urls: [],
        },
      },
    ],
    secrets: [],
    otpSecrets: [],
    icons: [],
  })

  await page.goto(
    `${BASE_URL}&surface=passwords&pm=group&group=${encodeURIComponent(groupName)}`,
    {waitUntil: 'domcontentloaded'},
  )
  await enablePasswordManager(page)

  expect(await deepHasText(page, groupName)).toBe(true)
  const persistedBeforeReload = await readMockPassmanagerState()
  expect(persistedBeforeReload.folders).toContain(groupName)
  expect(persistedBeforeReload.entries?.some((entry) => entry.meta?.title === entryTitle)).toBe(true)

  await page.reload({waitUntil: 'domcontentloaded'})
  await enablePasswordManager(page)

  expect(await deepHasText(page, groupName)).toBe(true)
  const persistedAfterReload = await readMockPassmanagerState()
  expect(persistedAfterReload.folders).toContain(groupName)
  expect(persistedAfterReload.entries?.some((entry) => entry.meta?.title === entryTitle)).toBe(true)
})
