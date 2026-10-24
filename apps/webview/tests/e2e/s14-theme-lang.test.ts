import {expect, test} from 'vitest'

import {waitForAuthenticated} from './utils'

import type {Page} from 'playwright'
declare global {
  var __E2E_PAGE__: Page | undefined
}

async function assertRootTheme(page: Page, theme: 'light' | 'dark') {
  await expect(
    page.evaluate(() => ({
      dataTheme: document.documentElement.getAttribute('data-theme'),
      theme: document.documentElement.getAttribute('theme'),
    })),
  ).resolves.toEqual({dataTheme: theme, theme})
}

async function getDocumentLocaleState(page: Page) {
  return page.evaluate(() => ({
    currentLanguage: localStorage.getItem('current-lang'),
    direction: document.documentElement.dir,
    filesLabel: window.i18n?.('navigation:files' as any),
    interactiveLocale: Reflect.get(globalThis, '__documentLocaleAtInteractive'),
    language: document.documentElement.lang,
  }))
}

async function waitForSurfaceReady(page: Page) {
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
          'chromvoid-file-manager, password-manager, notes-quick-view, notes-quick-view-mobile',
        ),
      )

      return (
        rootReady && bodyReady && routeReady && !deepFind(document, 'welcome-page, no-connection')
      )
    },
    undefined,
    {timeout: 10_000},
  )
}

// Chromium 149 can collect evaluate results during app updates; send user actions as trusted input.
async function waitForAppInput(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('loading'), undefined, {
    timeout: 10_000,
  })
}

// Preserve the original deep match while Playwright scrolls it into view and checks the hit target.
async function openNavigationItem(page: Page, label: string) {
  await waitForAppInput(page)
  const handle = await page.evaluateHandle((nextLabel) => {
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
    return button
  }, label)
  try {
    await handle.asElement()!.click()
  } finally {
    await handle.dispose()
  }
}

async function assertSurfaceThemeStability(page: Page, theme: 'light' | 'dark') {
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

  // Select through browser input instead of dispatching change from evaluate (see waitForAppInput).
  await waitForAppInput(page)
  await page.locator('select[name="language"]').selectOption('ru')

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

test('S14: Arabic bootstraps in RTL and switches back to LTR without reload drift', async () => {
  const page = globalThis.__E2E_PAGE__!

  await page.addInitScript(() => {
    if (sessionStorage.getItem('rtl-e2e-seeded') !== '1') {
      localStorage.setItem('current-lang', 'ar')
      sessionStorage.setItem('rtl-e2e-seeded', '1')
    }

    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'interactive') {
        Reflect.set(globalThis, '__documentLocaleAtInteractive', {
          dir: document.documentElement.dir,
          lang: document.documentElement.lang,
        })
      }
    })
  })

  await page.goto('http://localhost:4400/index.html?surface=files&layout=desktop', {
    waitUntil: 'domcontentloaded',
  })
  await waitForSurfaceReady(page)

  await expect(getDocumentLocaleState(page)).resolves.toEqual({
    currentLanguage: 'ar',
    direction: 'rtl',
    filesLabel: 'الملفات',
    interactiveLocale: {dir: 'rtl', lang: 'ar'},
    language: 'ar',
  })

  // Change locale on the current Files route to verify drift; settle the app update across a frame.
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<{setLang(value: string): void}>
    const {setLang} = await dynamicImport('/i18n/index.ts')
    setLang('en')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  await page.waitForFunction(
    () =>
      localStorage.getItem('current-lang') === 'en' &&
      document.documentElement.lang === 'en' &&
      document.documentElement.dir === 'ltr',
  )

  await page.reload({waitUntil: 'domcontentloaded'})
  await waitForSurfaceReady(page)

  await expect(getDocumentLocaleState(page)).resolves.toEqual({
    currentLanguage: 'en',
    direction: 'ltr',
    filesLabel: 'Files',
    interactiveLocale: {dir: 'ltr', lang: 'en'},
    language: 'en',
  })
})

test('S14: Surface navigation preserves selected root theme', async () => {
  const page = globalThis.__E2E_PAGE__!

  await assertSurfaceThemeStability(page, 'light')
  await assertSurfaceThemeStability(page, 'dark')
})
