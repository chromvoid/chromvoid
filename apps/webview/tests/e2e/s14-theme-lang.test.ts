import {expect, test} from 'vitest'

import {waitForAuthenticated} from './utils'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

async function assertRootTheme(page: import('playwright').Page, theme: 'light' | 'dark') {
  await expect(
    page.evaluate(() => ({
      dataTheme: document.documentElement.getAttribute('data-theme'),
      theme: document.documentElement.getAttribute('theme'),
    })),
  ).resolves.toEqual({dataTheme: theme, theme})
}

async function waitForSurfaceReady(page: import('playwright').Page) {
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
        deepFind(document, 'chromvoid-file-manager, password-manager, notes-quick-view, notes-quick-view-mobile'),
      )

      return rootReady && bodyReady && routeReady && !deepFind(document, 'welcome-page, no-license, no-connection')
    },
    undefined,
    {timeout: 10_000},
  )
}

async function openNavigationItem(page: import('playwright').Page, label: string) {
  await page.evaluate((nextLabel) => {
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

    const button = deepCollect(document, 'cv-button').find((candidate) => {
      return (
        candidate.getAttribute('aria-label') === nextLabel ||
        candidate.textContent?.trim().includes(nextLabel)
      )
    }) as HTMLElement | undefined
    if (!button) throw new Error(`Navigation item not found: ${nextLabel}`)
    button.click()
  }, label)
}

async function assertSurfaceThemeStability(page: import('playwright').Page, theme: 'light' | 'dark') {
  await page.goto('http://localhost:4400/index.html?surface=files&layout=desktop')
  await page.evaluate((nextTheme) => {
    const timestamp = Date.now()
    localStorage.setItem('current-lang', 'en')
    localStorage.setItem(
      'theme-state',
      JSON.stringify({
        data: nextTheme,
        id: timestamp,
        timestamp,
        to: timestamp + 2_147_483_647,
        version: 0,
      }),
    )
  }, theme)
  await page.reload()
  await waitForSurfaceReady(page)
  await assertRootTheme(page, theme)

  await openNavigationItem(page, 'Credentials')
  await page.waitForURL(/surface=passwords/)
  await waitForSurfaceReady(page)
  await assertRootTheme(page, theme)

  await openNavigationItem(page, 'Notes')
  await page.waitForURL(/surface=notes/)
  await waitForSurfaceReady(page)
  await assertRootTheme(page, theme)

  await openNavigationItem(page, 'Files')
  await page.waitForURL(/surface=files/)
  await waitForSurfaceReady(page)
  await assertRootTheme(page, theme)
}

test('S14: Switching theme and language', async () => {
  const page = globalThis.__E2E_PAGE__!

  await page.goto('http://localhost:4400/index.html?surface=settings&layout=desktop')
  await page.evaluate(() => {
    localStorage.setItem('current-lang', 'en')
  })
  await page.reload()
  await waitForAuthenticated(page)

  const beforeTheme = await page.evaluate(() => localStorage.getItem('theme-state') ?? 'system')
  const afterTheme = beforeTheme === 'light' ? 'dark' : beforeTheme === 'dark' ? 'system' : 'light'
  await page.evaluate((nextTheme) => {
    localStorage.setItem('theme-state', nextTheme)
  }, afterTheme)
  await page.reload()
  await waitForAuthenticated(page)
  expect(afterTheme).not.toBe(beforeTheme)
  await expect(page.evaluate(() => localStorage.getItem('theme-state'))).resolves.toBe(afterTheme)

  const beforeFilesLabel = await page.evaluate(() => window.i18n?.('navigation:files' as any))
  expect(beforeFilesLabel).toBe('Files')

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

    const select = deepFind(document, 'select[name="language"]') as HTMLSelectElement | null
    if (!select) throw new Error('Language selector not found')
    select.value = 'ru'
    select.dispatchEvent(new Event('change', {bubbles: true, composed: true}))
  })

  await page.waitForFunction(() => {
    return (
      window.i18n?.('navigation:files' as any) === 'Файлы' &&
      localStorage.getItem('current-lang') === 'ru' &&
      document.documentElement.lang === 'ru'
    )
  })

  const settingsText = await page.evaluate(() => {
    function deepText(root: Document | ShadowRoot): string {
      let text = root.textContent ?? ''
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          text += deepText(el.shadowRoot)
        }
      }
      return text
    }

    return deepText(document)
  })
  expect(settingsText).toContain('Приложение')

  await page.reload()
  await waitForAuthenticated(page)

  const afterFilesLabel = await page.evaluate(() => window.i18n?.('navigation:files' as any))
  expect(afterFilesLabel).toBe('Файлы')
  await expect(page.evaluate(() => localStorage.getItem('current-lang'))).resolves.toBe('ru')
  await expect(page.evaluate(() => document.documentElement.lang)).resolves.toBe('ru')
})

test('S14: Surface navigation preserves selected root theme', async () => {
  const page = globalThis.__E2E_PAGE__!

  await assertSurfaceThemeStability(page, 'light')
  await assertSurfaceThemeStability(page, 'dark')
})
