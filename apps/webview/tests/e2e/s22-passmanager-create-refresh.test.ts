import {expect, test} from 'vitest'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

const BASE_URL = 'http://localhost:4400/index.html?layout=desktop'

async function enablePasswordManager(page: import('playwright').Page): Promise<void> {
  await page.goto(BASE_URL)
  await page.evaluate(() => {
    localStorage.setItem('persist-local-storage-password-manager-mode', JSON.stringify({value: true}))
  })
  await page.reload()
  await page.waitForFunction(
    () => {
      const pm = (window as unknown as {passmanager?: unknown}).passmanager as
        | {load?: unknown}
        | undefined
      return Boolean(pm && typeof pm.load === 'function')
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

test.skipIf(!globalThis.__E2E_PAGE__)('S22: passmanager create entry/group survives refresh load cycle', async () => {
  const page = globalThis.__E2E_PAGE__!
  await enablePasswordManager(page)

  const suffix = Date.now()
  const groupName = `e2e-group-${suffix}`
  const entryTitle = `e2e-entry-${suffix}`

  await page.evaluate(
    async ({groupName, entryTitle}) => {
      const pm = (window as unknown as {passmanager?: unknown}).passmanager as
        | {
            createGroup: (data: {name: string; icon?: unknown; entries: unknown[]}) => void
            createEntry: (
              data: {title: string; username: string; urls: unknown[]},
              password: string,
              note: string,
              otp?: unknown,
            ) => {flushPendingPersistence?: () => Promise<void>} | undefined
            save: () => Promise<unknown>
            load: () => Promise<void>
            showElement?: {set?: (value: unknown) => void}
          }
        | undefined

      if (!pm) throw new Error('passmanager is not initialized')

      pm.createGroup({name: groupName, icon: undefined, entries: []})
      const entry = pm.createEntry({title: entryTitle, username: 'e2e-user', urls: []}, '', '', undefined)
      if (entry?.flushPendingPersistence) {
        await entry.flushPendingPersistence()
      }
      await pm.save()
      await pm.load()
      pm.showElement?.set?.(pm)
    },
    {groupName, entryTitle},
  )

  await page.waitForFunction(
    ({groupName, entryTitle}) => {
      const pm = (window as unknown as {passmanager?: unknown}).passmanager as
        | {
            groups?: Array<{name?: string}>
            allEntries?: Array<{title?: string}>
          }
        | undefined
      if (!pm) return false

      const hasGroup = Array.isArray(pm.groups) && pm.groups.some((g) => g?.name === groupName)
      const hasEntry = Array.isArray(pm.allEntries) && pm.allEntries.some((e) => e?.title === entryTitle)
      return hasGroup && hasEntry
    },
    {groupName, entryTitle},
    {timeout: 15_000},
  )

  expect(await deepHasText(page, groupName)).toBe(true)

  await page.evaluate(async () => {
    const pm = (window as unknown as {passmanager?: unknown}).passmanager as
      | {load?: () => Promise<void>; showElement?: {set?: (value: unknown) => void}}
      | undefined
    if (pm?.load) {
      await pm.load()
    }
    pm?.showElement?.set?.(pm)
  })
  await page.waitForFunction(
    ({groupName, entryTitle}) => {
      const pm = (window as unknown as {passmanager?: unknown}).passmanager as
        | {
            groups?: Array<{name?: string}>
            allEntries?: Array<{title?: string}>
          }
        | undefined
      if (!pm) return false

      const hasGroup = Array.isArray(pm.groups) && pm.groups.some((g) => g?.name === groupName)
      const hasEntry = Array.isArray(pm.allEntries) && pm.allEntries.some((e) => e?.title === entryTitle)
      return hasGroup && hasEntry
    },
    {groupName, entryTitle},
    {timeout: 15_000},
  )

  expect(await deepHasText(page, groupName)).toBe(true)
})
