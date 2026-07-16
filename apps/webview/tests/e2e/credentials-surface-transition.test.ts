import {expect, test} from 'vitest'

import {waitForAuthenticated} from './utils'

import type {Page} from 'playwright'

declare global {
  var __E2E_PAGE__: Page | undefined
}

async function openNavigationItem(page: Page, label: string): Promise<void> {
  await page.evaluate((nextLabel) => {
    function deepCollect(root: Document | ShadowRoot, selector: string, acc: Element[] = []): Element[] {
      acc.push(...root.querySelectorAll(selector))
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) deepCollect(element.shadowRoot, selector, acc)
      }
      return acc
    }

    const button = deepCollect(document, 'cv-button').find(
      (candidate) =>
        candidate.getAttribute('aria-label') === nextLabel ||
        candidate.textContent?.trim().includes(nextLabel),
    ) as HTMLElement | undefined
    if (!button) throw new Error(`Navigation item not found: ${nextLabel}`)
    button.click()
  }, label)
}

async function installTransitionProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    function deepCollect(root: Document | ShadowRoot, selector: string, acc: Element[] = []): Element[] {
      acc.push(...root.querySelectorAll(selector))
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) deepCollect(element.shadowRoot, selector, acc)
      }
      return acc
    }

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

    const nativeStart = document.startViewTransition?.bind(document)
    ;(window as any).__credentialsTransitionSnapshots = []
    if (!nativeStart) return

    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (update: () => void | Promise<void>) =>
        nativeStart(async () => {
          await update()
          ;(window as any).__credentialsTransitionSnapshots.push({
            hasCredentials: Boolean(deepFind(document, 'password-manager')),
            hasOtpView: Boolean(deepFind(document, 'pm-otp-quick-view, pm-otp-quick-view-mobile')),
            hasAnySpinner: Boolean(deepFind(document, 'cv-spinner')),
            hasPageSpinner: Boolean(deepFind(document, '.spinner-wrapper cv-spinner')),
            customIcons: deepCollect(document, 'pm-entry-list-item, pm-entry-list-item-mobile').flatMap(
              (row) => {
                const title = row.shadowRoot?.querySelector('.item-title')?.textContent?.trim()
                const avatar = row.shadowRoot?.querySelector('pm-avatar-icon')
                const src = avatar?.shadowRoot?.querySelector('img')?.getAttribute('src')
                return title && src ? [{title, src}] : []
              },
            ),
            ...(typeof (window as any).__readCredentialsExpectedIconSrc === 'function'
              ? {prewarmedIconSrc: (window as any).__readCredentialsExpectedIconSrc()}
              : {}),
          })
        }),
    })
  })
}

async function delayCredentialSessionPrewarm(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const importModule = Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<Record<string, any>>
    const {pmModel} = await importModule('/features/passmanager/password-manager.model.ts')
    const currentRoot = pmModel.root()
    const managerSaver = currentRoot?.managerSaver
    if (!managerSaver) throw new Error('PassManager saver is unavailable')

    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const delayedSaver = new Proxy(managerSaver, {
      get(target, property) {
        if (property === 'read') {
          return async (...args: unknown[]) => {
            await gate
            return target.read(...args)
          }
        }
        const value = Reflect.get(target, property)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })

    pmModel.configure(delayedSaver)
    void pmModel.prepareSession('e2e-delayed-session')
    ;(window as any).__releaseCredentialsPrewarm = release
  })
}

const transitionCases = (['desktop', 'mobile'] as const).flatMap((layout) => [
  {layout, destination: 'Credentials', label: 'Credentials', pmRoute: 'root', expectsOtpView: false},
  {layout, destination: 'OTP Codes', label: 'OTPs', pmRoute: 'otp', expectsOtpView: true},
])

test.each(transitionCases)(
  '$destination $layout transition snapshots ready content and reuses its Credentials session root',
  async ({layout, label, pmRoute, expectsOtpView}) => {
    const page = globalThis.__E2E_PAGE__!
    await page.goto(`http://localhost:4400/index.html?surface=files&layout=${layout}`)
    await waitForAuthenticated(page)
    await installTransitionProbe(page)
    await delayCredentialSessionPrewarm(page)

    await openNavigationItem(page, label)
    await page.waitForTimeout(50)
    await expect(
      page.evaluate(() => new URL(window.location.href).searchParams.get('surface')),
    ).resolves.toBe('files')
    await page.evaluate(() => (window as any).__releaseCredentialsPrewarm())
    await page.waitForURL(
      (url) => url.searchParams.get('surface') === 'passwords' && url.searchParams.get('pm') === pmRoute,
    )
    await waitForAuthenticated(page)

    const first = await page.evaluate(() => {
      const snapshots = (window as any).__credentialsTransitionSnapshots as Array<{
        hasCredentials: boolean
        hasOtpView: boolean
        hasAnySpinner: boolean
        hasPageSpinner: boolean
        customIcons: Array<{title: string; src: string}>
      }>
      ;(window as any).__firstCredentialsRoot = (window as any).passmanager
      return snapshots.findLast((snapshot) => snapshot.hasCredentials)
    })
    expect(first).toEqual({
      hasCredentials: true,
      hasOtpView: expectsOtpView,
      hasAnySpinner: false,
      hasPageSpinner: false,
      customIcons: [],
    })

    await openNavigationItem(page, 'Files')
    await page.waitForURL(/surface=files/)
    await waitForAuthenticated(page)
    await openNavigationItem(page, label)
    await page.waitForURL(
      (url) => url.searchParams.get('surface') === 'passwords' && url.searchParams.get('pm') === pmRoute,
    )
    await waitForAuthenticated(page)

    await expect(
      page.evaluate(() => (window as any).passmanager === (window as any).__firstCredentialsRoot),
    ).resolves.toBe(true)
  },
)

test.each(['desktop', 'mobile'] as const)(
  'Credentials %s transition commits custom entry icons once and reuses the session Blob URL',
  async (layout) => {
    const page = globalThis.__E2E_PAGE__!
    const entryTitle = `000 Icon Prewarm ${layout}`
    await page.goto(`http://localhost:4400/index.html?surface=files&layout=${layout}`)
    await waitForAuthenticated(page)
    await installTransitionProbe(page)

    await page.evaluate(async (title) => {
      const importModule = Function('path', 'return import(path)') as (
        path: string,
      ) => Promise<Record<string, any>>
      const {getAppContext} = await importModule('/shared/services/app-context.ts')
      const ws = getAppContext().ws
      const nativeSend = ws.sendPassmanager.bind(ws)
      const nativeCatalogSend = ws.sendCatalog.bind(ws)
      const iconReadCalls: string[] = []
      ws.sendPassmanager = async (command: string, data: Record<string, unknown>) => {
        if (command === 'passmanager:icon:getMany' || command === 'passmanager:icon:get') {
          iconReadCalls.push(command)
        }
        return nativeSend(command, data)
      }
      ws.sendCatalog = async (command: string, data: Record<string, unknown>) => {
        if (command === 'passmanager:icon:getMany' || command === 'passmanager:icon:get') {
          iconReadCalls.push(command)
        }
        return nativeCatalogSend(command, data)
      }
      ;(window as any).__credentialsIconReadCalls = iconReadCalls

      const loader = await importModule('/app/bootstrap/surface-component-loader.ts')
      await loader.ensureDashboardSurfaceComponents('passwords')
      const {pmModel} = await importModule('/features/passmanager/password-manager.model.ts')
      await pmModel.whenSessionSettled()
      const root = pmModel.root()
      if (!root) throw new Error('PassManager root is unavailable')

      const put = await ws.sendPassmanager('passmanager:icon:put', {
        content_base64: 'aWNvbg',
        mime_type: 'image/png',
        background_color: '#102030',
      })
      const iconRef = put?.result?.icon_ref
      if (typeof iconRef !== 'string') throw new Error('Custom icon upload failed')

      const entry = root.createEntry({title, username: 'icon-user', urls: [], iconRef}, '', '', undefined)
      await entry.flushPendingPersistence()
      root.showElement.set(root)

      const {pmIconStore} = await importModule('/features/passmanager/models/pm-icon-store.ts')
      ;(window as any).__readCredentialsExpectedIconSrc = () => pmIconStore.getCachedUrl(iconRef)
    }, entryTitle)

    await openNavigationItem(page, 'Credentials')
    await page.waitForURL(
      (url) => url.searchParams.get('surface') === 'passwords' && url.searchParams.get('pm') === 'root',
    )
    await waitForAuthenticated(page)

    const first = await page.evaluate(() => {
      const snapshots = (window as any).__credentialsTransitionSnapshots as Array<{
        hasCredentials: boolean
        customIcons: Array<{title: string; src: string}>
        prewarmedIconSrc?: string
      }>
      return {
        snapshotSrc: snapshots.findLast((snapshot) => snapshot.hasCredentials)?.prewarmedIconSrc,
        calls: [...((window as any).__credentialsIconReadCalls as string[])],
      }
    })

    expect(first.snapshotSrc).toMatch(/^blob:/)

    await openNavigationItem(page, 'Files')
    await page.waitForURL(/surface=files/)
    await waitForAuthenticated(page)
    await openNavigationItem(page, 'Credentials')
    await page.waitForURL(
      (url) => url.searchParams.get('surface') === 'passwords' && url.searchParams.get('pm') === 'root',
    )
    await waitForAuthenticated(page)

    const second = await page.evaluate(() => ({
      src: (window as any).__readCredentialsExpectedIconSrc(),
      calls: [...((window as any).__credentialsIconReadCalls as string[])],
    }))

    expect(second.src).toBe(first.snapshotSrc)
    expect(second.calls).toEqual(first.calls)
  },
)
