import {expect, test} from 'vitest'

import type {Page} from 'playwright'
import type * as NavigationModelModule from '../../../src/app/navigation/navigation.model'
import type * as ModuleAccessModelModule from '../../../src/core/pro/module-access.model'
import type * as RuntimeCapabilitiesModule from '../../../src/core/runtime/runtime-capabilities'
import type * as SettingsModelModule from '../../../src/routes/settings/settings.model'
import {
  hasDeepSelector,
  hasHorizontalOverflow,
  installFixedVisualClock,
  openFiles,
  openNotes,
  openPasswords,
  seedVisualFilesFixture,
  seedVisualNotesFixture,
  seedVisualPassmanagerFixture,
  seedVisualPassmanagerTagSnippetFixture,
  selectFirstDesktopTableRow,
  selectFirstMobileFile,
  showCreateEntry,
  showFirstMobileLoginEntryEdit,
  waitForDeepSelector,
  waitForOtpRows,
} from '../visual-fixtures'
import {assertVisualSnapshot} from '../visual-snapshot'
import {seedWalletFixture} from '../wallet-fixture'

declare global {
  var __E2E_PAGE__: Page | undefined
}

function getPage(ctx: {skip: () => void}): Page | undefined {
  const page = globalThis.__E2E_PAGE__
  if (!page) {
    ctx.skip()
  }
  return page
}

type CredentialTagSnippetState = {
  hostWidth: number
  visibleTagLabels: string[]
  visibleTagOverflow: Array<{limit: string | null; text: string; ariaLabel: string | null}>
  hiddenTagOverflowLimits: Array<string | null>
  tagOverflowFullyVisible: boolean
}

async function getCredentialTagSnippetState(
  page: Page,
  hostSelector: 'pm-entry-list-item' | 'pm-entry-list-item-mobile',
): Promise<CredentialTagSnippetState> {
  return page.evaluate((selector) => {
    function deepFind(root: Document | ShadowRoot, target: string): Element | null {
      const found = root.querySelector(target)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const inner = deepFind(element.shadowRoot, target)
          if (inner) return inner
        }
      }
      return null
    }

    const host = deepFind(document, selector) as HTMLElement | null
    if (!host?.shadowRoot) throw new Error(`Credential row not found: ${selector}`)

    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return getComputedStyle(element).display !== 'none' && rect.width > 0 && rect.height > 0
    }
    const tagBadges = [...host.shadowRoot.querySelectorAll('.entry-tag-badge')]
    const tagOverflow = [...host.shadowRoot.querySelectorAll('.entry-tag-overflow')]
    const visibleTagOverflow = tagOverflow.filter(isVisible)
    const badgeClusterRect = host.shadowRoot.querySelector('.entry-badges')?.getBoundingClientRect()

    return {
      hostWidth: host.getBoundingClientRect().width,
      visibleTagLabels: tagBadges
        .filter(isVisible)
        .map((badge) => badge.querySelector('.entry-badge-label')?.textContent?.trim() ?? ''),
      visibleTagOverflow: visibleTagOverflow.map((overflow) => ({
        limit: overflow.getAttribute('data-tag-limit'),
        text: overflow.textContent?.trim() ?? '',
        ariaLabel: overflow.getAttribute('aria-label'),
      })),
      hiddenTagOverflowLimits: tagOverflow
        .filter((overflow) => !isVisible(overflow))
        .map((overflow) => overflow.getAttribute('data-tag-limit')),
      tagOverflowFullyVisible:
        badgeClusterRect !== undefined &&
        visibleTagOverflow.every((overflow) => {
          const rect = overflow.getBoundingClientRect()
          return rect.left >= badgeClusterRect.left && rect.right <= badgeClusterRect.right
        }),
    }
  }, hostSelector)
}

async function getCredentialTagAriaSnapshot(
  page: Page,
  hostSelector: 'pm-entry-list-item' | 'pm-entry-list-item-mobile',
): Promise<string> {
  return page.locator(hostSelector).locator('.entry-badges').ariaSnapshot()
}

async function settleResponsiveLayout(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

async function getMobileToolbarSubtitle(page: Page): Promise<string | null> {
  return page.evaluate(() => {
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

    const toolbar = deepFind(document, 'mobile-top-toolbar') as HTMLElement | null
    return toolbar?.shadowRoot?.querySelector('.subtitle')?.textContent?.trim() ?? null
  })
}

async function clickWalletToolbarAction(page: Page, actionId: 'send' | 'receive'): Promise<void> {
  await page.evaluate((id) => {
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

    const action = deepFind(document, `[data-action="${id}"]`) as HTMLElement | null
    action?.click()
  }, actionId)
}

async function hasRoutePageHeader(page: Page, pageSelector: string): Promise<boolean> {
  return page.evaluate((selector) => {
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

    const routePage = deepFind(document, selector) as HTMLElement | null
    const pageRoot = routePage?.shadowRoot?.querySelector('.page')
    return Array.from(pageRoot?.children ?? []).some((child) => child.matches('.header'))
  }, pageSelector)
}

async function openNavigationItem(page: Page, label: string): Promise<void> {
  await page.waitForFunction((targetLabel) => {
    function deepCollect(root: Document | ShadowRoot, selector: string, acc: Element[] = []): Element[] {
      acc.push(...root.querySelectorAll(selector))
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) deepCollect(element.shadowRoot, selector, acc)
      }
      return acc
    }

    return deepCollect(document, 'cv-button').some(
      (candidate) =>
        candidate.getAttribute('aria-label') === targetLabel ||
        candidate.textContent?.trim().includes(targetLabel),
    )
  }, label)
  await page.evaluate((targetLabel) => {
    function deepCollect(root: Document | ShadowRoot, selector: string, acc: Element[] = []): Element[] {
      acc.push(...root.querySelectorAll(selector))
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) deepCollect(element.shadowRoot, selector, acc)
      }
      return acc
    }

    const button = deepCollect(document, 'cv-button').find(
      (candidate) =>
        candidate.getAttribute('aria-label') === targetLabel ||
        candidate.textContent?.trim().includes(targetLabel),
    ) as HTMLElement | undefined
    if (!button) throw new Error(`Navigation item not found: ${targetLabel}`)
    button.click()
  }, label)
}

async function setRootTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((nextTheme) => {
    document.documentElement.setAttribute('data-theme', nextTheme)
    document.documentElement.setAttribute('theme', nextTheme)
  }, theme)
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

async function installArabicLocale(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('current-lang', 'ar')
  })
}

async function hasDocumentHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
}

async function openDesktopFileTypeFilter(page: Page): Promise<void> {
  await page
    .getByRole('button', {name: 'File type', exact: true})
    .evaluate((trigger: HTMLElement) => trigger.click())
  await waitForDeepSelector(page, 'cv-popover.type-filter[open]')
  await page
    .locator('cv-popover.type-filter')
    .locator('[part="content"]')
    .evaluate((content: HTMLElement) => content.blur())
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

type SettingsVisualRoute = 'overview' | 'security' | 'autofill'

async function openMobileSettingsVisual(
  page: Page,
  options: {
    route: SettingsVisualRoute
    theme: 'light' | 'dark'
    viewport: {width: number; height: number}
    autofillAccess?: 'enabled' | 'locked_pro'
  },
): Promise<void> {
  await page.emulateMedia({reducedMotion: 'reduce'})
  await page.setViewportSize(options.viewport)
  await page.goto('http://localhost:4400/index.html?surface=files&layout=mobile', {
    waitUntil: 'domcontentloaded',
  })
  await waitForDeepSelector(page, 'file-app-shell-mobile-layout')
  await page.evaluate(async (autofillAccess) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {setRuntimeCapabilities} = (await dynamicImport(
      '/core/runtime/runtime-capabilities.ts',
    )) as typeof RuntimeCapabilitiesModule
    const {moduleAccessModel} = (await dynamicImport(
      '/core/pro/module-access.model.ts',
    )) as typeof ModuleAccessModelModule
    const {settingsPageModel} = (await dynamicImport(
      '/routes/settings/settings.model.ts',
    )) as typeof SettingsModelModule

    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      desktop: false,
      supports_autofill: true,
      supports_biometric: true,
    })
    moduleAccessModel.rawStates.set([
      {
        feature_key: 'credential-provider',
        status: autofillAccess ?? 'enabled',
        denial_code: autofillAccess === 'locked_pro' ? 'PRO_REQUIRED' : null,
      },
    ])
    settingsPageModel.credentialProviderSelected.set(false)
  }, options.autofillAccess)

  await openNavigationItem(page, 'Settings')
  await waitForDeepSelector(page, 'settings-page-mobile-layout')

  if (options.route !== 'overview') {
    await page.evaluate(async (route) => {
      const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
      const {navigationModel} = (await dynamicImport(
        '/app/navigation/navigation.model.ts',
      )) as typeof NavigationModelModule
      navigationModel.navigateToSettingsRoute({kind: route}, 'replace')
    }, options.route)
    await page.waitForFunction((route) => {
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

      const layout = deepFind(document, 'settings-page-mobile-layout') as HTMLElement | null
      return (
        layout?.shadowRoot?.querySelector('.detail, .task')?.textContent?.length &&
        new URL(location.href).searchParams.get('settings') === route
      )
    }, options.route)
  }

  await setRootTheme(page, options.theme)
  await settleResponsiveLayout(page)
}

async function restoreMobileSettingsVisual(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {resetRuntimeCapabilities} = (await dynamicImport(
      '/core/runtime/runtime-capabilities.ts',
    )) as typeof RuntimeCapabilitiesModule
    const {moduleAccessModel} = (await dynamicImport(
      '/core/pro/module-access.model.ts',
    )) as typeof ModuleAccessModelModule
    const {settingsPageModel} = (await dynamicImport(
      '/routes/settings/settings.model.ts',
    )) as typeof SettingsModelModule
    resetRuntimeCapabilities()
    moduleAccessModel.reset()
    settingsPageModel.credentialProviderSelected.set(null)
  })
}

async function getMobileSettingsText(page: Page): Promise<string> {
  return page.evaluate(() => {
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

    const layout = deepFind(document, 'settings-page-mobile-layout') as HTMLElement | null
    return layout?.shadowRoot?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  })
}

async function openMobileWelcomeUnlockLoading(
  page: Page,
  options: {theme: 'light' | 'dark'; viewport: {width: number; height: number}},
): Promise<void> {
  await page.emulateMedia({reducedMotion: 'reduce'})
  await page.setViewportSize(options.viewport)
  await page.goto('http://localhost:4400/index.html?preview=welcome&layout=mobile', {
    waitUntil: 'domcontentloaded',
  })
  await waitForDeepSelector(page, 'welcome-page-mobile-layout')
  await setRootTheme(page, options.theme)
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

    const layout = deepFind(document, 'welcome-page-mobile-layout') as
      | (HTMLElement & {
          model?: {
            setup: {
              icon: {active(): void}
              setupInProgress: {set(value: boolean): void}
            }
          }
        })
      | null
    if (!layout?.model) throw new Error('Mobile welcome model is unavailable')

    layout.model.setup.setupInProgress.set(true)
    layout.model.setup.icon.active()
  })
  await waitForDeepSelector(page, '.unlock-loading-scrim')
  await waitForDeepSelector(page, '.lockscreen-unlock-action[loading]')
  await waitForDeepSelector(page, '[data-icon-state="active"]')
}

async function openMobileCreateDetailsHub(page: Page): Promise<void> {
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

    const create = deepFind(document, 'pm-entry-create-mobile') as HTMLElement | null
    create?.shadowRoot?.querySelector<HTMLButtonElement>('[data-details-hub-trigger]')?.click()
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

    const create = deepFind(document, 'pm-entry-create-mobile') as HTMLElement | null
    const sheet = create?.shadowRoot?.querySelector('pm-entry-create-details-sheet') as HTMLElement | null
    return Boolean(sheet?.shadowRoot?.querySelector('[data-details-hub]'))
  })
  await waitForMobileCreateDetailsSheetSettled(page)
}

async function waitForMobileCreateDetailsSheetSettled(page: Page): Promise<void> {
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

    const create = deepFind(document, 'pm-entry-create-mobile') as HTMLElement | null
    const sheet = create?.shadowRoot?.querySelector('pm-entry-create-details-sheet') as HTMLElement | null
    const bottomSheet = sheet?.shadowRoot?.querySelector('cv-bottom-sheet') as HTMLElement | null
    const dialog = bottomSheet?.shadowRoot?.querySelector('cv-dialog') as HTMLElement | null
    const content = dialog?.shadowRoot?.querySelector('[part="content"]') as HTMLElement | null
    if (!content) return false
    const transform = getComputedStyle(content).transform
    if (transform === 'none') return true
    return Math.abs(new DOMMatrixReadOnly(transform).m42) <= 0.5
  })
}

async function getMobileCreateDetailsHubMetrics(page: Page) {
  return page.evaluate(() => {
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

    function luminance(value: string): number {
      const channels = value
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number)
      if (!channels || channels.length !== 3) throw new Error(`Unsupported CSS color: ${value}`)
      const [red, green, blue] = channels.map((channel) => {
        const normalized = channel / 255
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue
    }

    function contrast(foreground: string, background: string): number {
      const lighter = Math.max(luminance(foreground), luminance(background))
      const darker = Math.min(luminance(foreground), luminance(background))
      return (lighter + 0.05) / (darker + 0.05)
    }

    const create = deepFind(document, 'pm-entry-create-mobile') as HTMLElement | null
    const sheet = create?.shadowRoot?.querySelector('pm-entry-create-details-sheet') as HTMLElement | null
    const root = sheet?.shadowRoot
    const list = root?.querySelector('.detail-list') as HTMLElement | null
    const label = root?.querySelector('.detail-label') as HTMLElement | null
    const status = root?.querySelector('.detail-status') as HTMLElement | null
    const rows = root?.querySelectorAll('[data-details-hub] [data-detail]')
    if (!list || !label || !status || !rows) throw new Error('Details hub visual metrics target is missing')

    const background = getComputedStyle(list).backgroundColor
    return {
      labelContrast: contrast(getComputedStyle(label).color, background),
      rowCount: rows.length,
      statusContrast: contrast(getComputedStyle(status).color, background),
    }
  })
}

async function openMobileCreateDetail(page: Page, detail: 'icon' | 'tags' | 'otp' | 'note'): Promise<void> {
  await page.evaluate((nextDetail) => {
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

    const create = deepFind(document, 'pm-entry-create-mobile') as HTMLElement | null
    const sheet = create?.shadowRoot?.querySelector('pm-entry-create-details-sheet') as HTMLElement | null
    sheet?.shadowRoot?.querySelector<HTMLButtonElement>(`[data-detail="${nextDetail}"]`)?.click()
  }, detail)
  await page.waitForFunction((nextDetail) => {
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

    const create = deepFind(document, 'pm-entry-create-mobile') as HTMLElement | null
    const sheet = create?.shadowRoot?.querySelector('pm-entry-create-details-sheet') as HTMLElement | null
    return Boolean(sheet?.shadowRoot?.querySelector(`[data-detail-editor="${nextDetail}"]`))
  }, detail)
  await waitForMobileCreateDetailsSheetSettled(page)
}

async function getMobileCreateDetailEditorLayout(page: Page) {
  return page.evaluate(() => {
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

    const create = deepFind(document, 'pm-entry-create-mobile') as HTMLElement | null
    const sheet = create?.shadowRoot?.querySelector('pm-entry-create-details-sheet') as HTMLElement | null
    const actions = sheet?.shadowRoot?.querySelector('.sheet-actions') as HTMLElement | null
    const primary = actions?.querySelector('cv-button:last-child') as HTMLElement | null
    const primaryBase = primary?.shadowRoot?.querySelector('[part="base"]') as HTMLElement | null
    const bottomSheet = sheet?.shadowRoot?.querySelector('cv-bottom-sheet') as HTMLElement | null
    const dialog = bottomSheet?.shadowRoot?.querySelector('cv-dialog') as HTMLElement | null
    const handle = bottomSheet?.shadowRoot?.querySelector('[part="handle"]') as HTMLElement | null
    const title = dialog?.shadowRoot?.querySelector('[part="title"]') as HTMLElement | null
    const footer = dialog?.shadowRoot?.querySelector('[part="footer"]') as HTMLElement | null
    if (!actions || !primaryBase || !handle || !title || !footer) {
      throw new Error('Details editor layout target is missing')
    }

    const actionsRect = actions.getBoundingClientRect()
    const primaryStyle = getComputedStyle(primaryBase)
    const handleRect = handle.getBoundingClientRect()
    const footerRect = footer.getBoundingClientRect()
    const titleRect = title.getBoundingClientRect()
    return {
      actionsBottom: actionsRect.bottom,
      actionsTop: actionsRect.top,
      footerHeight: footerRect.height,
      handleTop: handleRect.top,
      primaryOpacity: primaryStyle.opacity,
      primaryVisibility: primaryStyle.visibility,
      titleBottom: titleRect.bottom,
      titleTop: titleRect.top,
      viewportHeight: window.innerHeight,
    }
  })
}

async function getMobileCreateEntryVisualMetrics(page: Page) {
  return page.evaluate(() => {
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

    function parseRgb(value: string): [number, number, number] {
      const channels = value
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number)
      if (!channels || channels.length !== 3) throw new Error(`Unsupported CSS color: ${value}`)
      return channels as [number, number, number]
    }

    function luminance(value: string): number {
      const [red, green, blue] = parseRgb(value).map((channel) => {
        const normalized = channel / 255
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue
    }

    function contrast(foreground: string, background: string): number {
      const lighter = Math.max(luminance(foreground), luminance(background))
      const darker = Math.min(luminance(foreground), luminance(background))
      return (lighter + 0.05) / (darker + 0.05)
    }

    const create = deepFind(document, 'pm-entry-create-mobile') as HTMLElement | null
    const root = create?.shadowRoot
    const passwordInput = root?.querySelector('cv-input.password-input') as HTMLElement | null
    const inputBase = passwordInput?.shadowRoot?.querySelector('[part="base"]') as HTMLElement | null
    const suffix = root?.querySelector('.password-suffix') as HTMLElement | null
    const generateIcon = root?.querySelector('.generate-button cv-icon') as HTMLElement | null
    const submit = root?.querySelector('.create-footer cv-button') as HTMLElement | null
    const submitBase = submit?.shadowRoot?.querySelector('[part="base"]') as HTMLElement | null
    const heading = root?.querySelector('.form-heading') as HTMLElement | null
    const headingTitle = root?.querySelector('.form-heading-title') as HTMLElement | null
    const headingSubtitle = root?.querySelector('.form-heading-subtitle') as HTMLElement | null
    if (
      !inputBase ||
      !suffix ||
      !generateIcon ||
      !submitBase ||
      !heading ||
      !headingTitle ||
      !headingSubtitle
    ) {
      throw new Error('Create Entry visual metrics target is missing')
    }

    const inputRect = inputBase.getBoundingClientRect()
    const suffixRect = suffix.getBoundingClientRect()
    const iconRect = generateIcon.getBoundingClientRect()
    const trailingCenterX = (suffixRect.left + inputRect.right) / 2
    const inputCenterY = (inputRect.top + inputRect.bottom) / 2
    const iconCenterX = (iconRect.left + iconRect.right) / 2
    const iconCenterY = (iconRect.top + iconRect.bottom) / 2
    const submitStyle = getComputedStyle(submitBase)
    const headingStyle = getComputedStyle(heading)

    return {
      ctaBackground: submitStyle.backgroundColor,
      ctaColor: submitStyle.color,
      ctaContrast: contrast(submitStyle.color, submitStyle.backgroundColor),
      generatorCenterDeltaX: Math.abs(iconCenterX - trailingCenterX),
      generatorCenterDeltaY: Math.abs(iconCenterY - inputCenterY),
      headingSubtitleContrast: contrast(
        getComputedStyle(headingSubtitle).color,
        headingStyle.backgroundColor,
      ),
      headingTitleContrast: contrast(getComputedStyle(headingTitle).color, headingStyle.backgroundColor),
      theme: document.documentElement.getAttribute('data-theme'),
    }
  })
}

test('visual: forced mobile shell on desktop viewport', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualFilesFixture()
  await openFiles(page, 'mobile')

  expect(await hasDeepSelector(page, 'mobile-tab-bar')).toBe(true)
  expect(await hasDeepSelector(page, 'file-app-shell-mobile-layout')).toBe(true)
  expect(await hasDeepSelector(page, 'file-app-shell-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'forced-mobile-shell-desktop-viewport', {
    suite: 'layout-shell',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: forced desktop shell on mobile viewport', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualFilesFixture()
  await openFiles(page, 'desktop')
  await page.setViewportSize({width: 375, height: 812})
  await page.goto('http://localhost:4400/index.html?surface=files&path=%2F&layout=desktop', {
    waitUntil: 'domcontentloaded',
  })
  await waitForDeepSelector(page, 'file-app-shell-desktop-layout')
  await waitForDeepSelector(page, 'navigation-rail')

  expect(await hasDeepSelector(page, 'file-app-shell-desktop-layout')).toBe(true)
  expect(await hasDeepSelector(page, 'navigation-rail')).toBe(true)
  expect(await hasDeepSelector(page, 'file-app-shell-mobile-layout')).toBe(false)
  expect(await hasDeepSelector(page, 'file-app-shell-desktop-layout mobile-tab-bar')).toBe(false)

  await assertVisualSnapshot(page, 'forced-desktop-shell-mobile-viewport', {
    suite: 'layout-shell',
    viewport: {width: 375, height: 812},
  })
})

test('visual: Arabic desktop file shell mirrors for RTL', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await installArabicLocale(page)
  await seedVisualFilesFixture()
  await openFiles(page, 'desktop')

  await expect(
    page.evaluate(() => ({
      direction: document.documentElement.dir,
      language: document.documentElement.lang,
    })),
  ).resolves.toEqual({direction: 'rtl', language: 'ar'})
  expect(await hasDocumentHorizontalOverflow(page)).toBe(false)

  await assertVisualSnapshot(page, 'arabic-files-desktop-1280', {
    suite: 'rtl',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: Arabic mobile file shell mirrors for RTL', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await installArabicLocale(page)
  await seedVisualFilesFixture()
  await openFiles(page, 'mobile', 390)

  await expect(
    page.evaluate(() => ({
      direction: document.documentElement.dir,
      language: document.documentElement.lang,
    })),
  ).resolves.toEqual({direction: 'rtl', language: 'ar'})
  expect(await hasDocumentHorizontalOverflow(page)).toBe(false)

  await assertVisualSnapshot(page, 'arabic-files-mobile-390', {
    suite: 'rtl',
    viewport: {width: 390, height: 844},
  })
})

test('visual: mobile files root toolbar description', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualFilesFixture()
  await openFiles(page, 'mobile', 390)

  expect(await getMobileToolbarSubtitle(page)).toBe('Encrypted files & folders')
  expect(await hasHorizontalOverflow(page, 'file-app-shell-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-files-root-toolbar-390', {
    suite: 'file-manager',
    viewport: {width: 390, height: 844},
  })
})

test('visual: mobile Settings overview dark', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await openMobileSettingsVisual(page, {
    route: 'overview',
    theme: 'dark',
    viewport: {width: 390, height: 844},
  })

  try {
    expect(await getMobileToolbarSubtitle(page)).toBe('Configure session security and behavior')
    expect(await getMobileSettingsText(page)).toContain('Security & locking')
    expect(await getMobileSettingsText(page)).toContain('Credential Provider / Autofill')
    expect(await hasHorizontalOverflow(page, 'settings-page-mobile-layout')).toBe(false)

    await assertVisualSnapshot(page, 'overview-dark-390', {
      suite: 'settings-mobile',
      viewport: {width: 390, height: 844},
      maxDiffRatio: 0.004,
    })
  } finally {
    await restoreMobileSettingsVisual(page)
  }
})

test('visual: mobile Settings Security compact light', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await openMobileSettingsVisual(page, {
    route: 'security',
    theme: 'light',
    viewport: {width: 360, height: 640},
  })

  try {
    expect(await getMobileToolbarSubtitle(page)).toBeNull()
    expect(await getMobileSettingsText(page)).toContain('Auto-lock after')
    expect(await getMobileSettingsText(page)).toContain('Lock when app is hidden or device sleeps')
    expect(await hasHorizontalOverflow(page, 'settings-page-mobile-layout')).toBe(false)

    await assertVisualSnapshot(page, 'security-light-360x640', {
      suite: 'settings-mobile',
      viewport: {width: 360, height: 640},
    })
  } finally {
    await restoreMobileSettingsVisual(page)
  }
})

test('visual: mobile Settings Autofill missing with Pro gate', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await openMobileSettingsVisual(page, {
    route: 'autofill',
    theme: 'dark',
    viewport: {width: 390, height: 844},
    autofillAccess: 'locked_pro',
  })

  try {
    expect(await getMobileToolbarSubtitle(page)).toBeNull()
    expect(await getMobileSettingsText(page)).toContain('ChromVoid is not selected')
    expect(await getMobileSettingsText(page)).toContain('active Pro license')
    expect(await hasDeepSelector(page, '.provider-steps')).toBe(true)
    expect(await hasHorizontalOverflow(page, 'settings-page-mobile-layout')).toBe(false)

    await assertVisualSnapshot(page, 'autofill-missing-pro-dark-390', {
      suite: 'settings-mobile',
      viewport: {width: 390, height: 844},
      maxDiffRatio: 0.004,
    })
  } finally {
    await restoreMobileSettingsVisual(page)
  }
})

test('visual: mobile remote uses the shell toolbar without a page header', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await page.setViewportSize({width: 390, height: 844})
  await page.goto('http://localhost:4400/index.html?surface=remote&layout=mobile', {
    waitUntil: 'domcontentloaded',
  })
  await waitForDeepSelector(page, 'remote-page')

  expect(await getMobileToolbarSubtitle(page)).toBe('Manage connection mode and remote devices')
  expect(await hasRoutePageHeader(page, 'remote-page')).toBe(false)
  expect(await hasHorizontalOverflow(page, 'file-app-shell-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-remote-shell-toolbar-390', {
    suite: 'remote',
    viewport: {width: 390, height: 844},
  })
})

test('visual: mobile passkeys uses the shell toolbar without a page header', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await page.setViewportSize({width: 390, height: 844})
  await page.goto('http://localhost:4400/index.html?surface=passkeys&layout=mobile', {
    waitUntil: 'domcontentloaded',
  })
  await waitForDeepSelector(page, 'passkeys-page')

  expect(await getMobileToolbarSubtitle(page)).toBe('Passkeys in your vault')
  expect(await hasRoutePageHeader(page, 'passkeys-page')).toBe(false)
  expect(await hasHorizontalOverflow(page, 'file-app-shell-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-passkeys-shell-toolbar-390', {
    suite: 'passkeys',
    viewport: {width: 390, height: 844},
  })
})

test('visual: desktop passkeys is available from the rail with a desktop empty state', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await page.setViewportSize({width: 1280, height: 820})
  await page.goto('http://localhost:4400/index.html?surface=files&layout=desktop', {
    waitUntil: 'domcontentloaded',
  })
  await waitForDeepSelector(page, 'file-app-shell-desktop-layout')
  await page.evaluate(async () => {
    const internals = {
      async invoke(command: string): Promise<unknown> {
        if (command === 'credential_provider_passkeys_list') {
          return {ok: true, result: {passkeys: []}}
        }
        if (command === 'unlock_debug_log') return true
        throw new Error(`Unexpected Passkeys visual Tauri command: ${command}`)
      },
    }
    Object.assign(window as unknown as Record<string, unknown>, {__TAURI_INTERNALS__: internals})

    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {setRuntimeCapabilities} = (await dynamicImport(
      '/core/runtime/runtime-capabilities.ts',
    )) as typeof RuntimeCapabilitiesModule
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      mobile: false,
      supports_autofill: true,
      supports_credential_provider_passkeys_lite: true,
    })
  })

  await openNavigationItem(page, 'Passkeys')
  await waitForDeepSelector(page, 'passkeys-page')
  await waitForDeepSelector(page, 'cv-empty-state')

  expect(await hasDeepSelector(page, 'desktop-shell-toolbar')).toBe(true)
  expect(await hasRoutePageHeader(page, 'passkeys-page')).toBe(false)
  expect(await hasHorizontalOverflow(page, 'passkeys-page')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-passkeys-empty-1280', {
    suite: 'passkeys',
    viewport: {width: 1280, height: 820},
  })
})

test('visual: mobile wallet shows its description in the shell toolbar', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await page.setViewportSize({width: 390, height: 844})
  await page.goto('http://localhost:4400/index.html?surface=files&layout=mobile&e2eGuidance=1', {
    waitUntil: 'domcontentloaded',
  })
  await waitForDeepSelector(page, 'file-app-shell-mobile-layout')
  await page.waitForFunction(() => Boolean(window.__chromvoidGuidanceE2E))
  await page.evaluate(() => {
    window.__chromvoidGuidanceE2E?.moduleAccessModel.rawStates.set([
      {feature_key: 'crypto-wallet', status: 'enabled', denial_code: null},
    ])
  })
  await openNavigationItem(page, 'Wallet')
  await waitForDeepSelector(page, 'wallet-page-mobile-layout')
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

    const layout = deepFind(document, 'wallet-page-mobile-layout') as
      | (HTMLElement & {model?: {error: {set(value: string | null): void}}})
      | null
    layout?.model?.error.set(null)
  })

  expect(await getMobileToolbarSubtitle(page)).toBe('Create or connect multichain and network-native wallets')
  expect(await hasHorizontalOverflow(page, 'file-app-shell-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-wallet-shell-toolbar-390', {
    suite: 'wallet',
    viewport: {width: 390, height: 844},
  })
})

test('visual: populated mobile wallet uses contextual toolbar and Receive sheet', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await page.setViewportSize({width: 390, height: 844})
  await page.goto('http://localhost:4400/index.html?surface=files&layout=mobile&e2eGuidance=1', {
    waitUntil: 'domcontentloaded',
  })
  await waitForDeepSelector(page, 'file-app-shell-mobile-layout')
  await page.waitForFunction(() => Boolean(window.__chromvoidGuidanceE2E))
  await page.evaluate(() => {
    window.__chromvoidGuidanceE2E?.moduleAccessModel.rawStates.set([
      {feature_key: 'crypto-wallet', status: 'enabled', denial_code: null},
    ])
  })
  await openNavigationItem(page, 'Wallet')
  await waitForDeepSelector(page, 'wallet-page-mobile-layout')
  await seedWalletFixture(page)

  expect(await getMobileToolbarSubtitle(page)).toBe('Bitcoin · Savings')
  expect(await hasDeepSelector(page, '.mobile-header')).toBe(false)
  expect(await hasHorizontalOverflow(page, 'file-app-shell-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-wallet-populated-390', {
    suite: 'wallet',
    viewport: {width: 390, height: 844},
  })

  await clickWalletToolbarAction(page, 'receive')
  await waitForDeepSelector(page, 'cv-bottom-sheet.receive-sheet[open]')
  await assertVisualSnapshot(page, 'mobile-wallet-receive-sheet-390', {
    suite: 'wallet',
    viewport: {width: 390, height: 844},
  })
})

test('visual: populated desktop wallet uses one contextual toolbar and Receive dialog', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await page.setViewportSize({width: 1280, height: 820})
  await page.goto('http://localhost:4400/index.html?surface=files&layout=desktop&e2eGuidance=1', {
    waitUntil: 'domcontentloaded',
  })
  await waitForDeepSelector(page, 'file-app-shell-desktop-layout')
  await page.waitForFunction(() => Boolean(window.__chromvoidGuidanceE2E))
  await page.evaluate(() => {
    window.__chromvoidGuidanceE2E?.moduleAccessModel.rawStates.set([
      {feature_key: 'crypto-wallet', status: 'enabled', denial_code: null},
    ])
  })
  await openNavigationItem(page, 'Wallet')
  await waitForDeepSelector(page, 'wallet-page-desktop-layout')
  await seedWalletFixture(page)

  expect(await hasDeepSelector(page, 'desktop-shell-toolbar.wallet-desktop-toolbar')).toBe(true)
  expect(await hasDeepSelector(page, '.wallet-header')).toBe(false)
  expect(await hasHorizontalOverflow(page, 'wallet-page-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-wallet-populated-1280', {
    suite: 'wallet',
    viewport: {width: 1280, height: 820},
  })

  await clickWalletToolbarAction(page, 'receive')
  await waitForDeepSelector(page, 'cv-dialog.receive-dialog[open]')
  await assertVisualSnapshot(page, 'desktop-wallet-receive-dialog-1280', {
    suite: 'wallet',
    viewport: {width: 1280, height: 820},
  })
})

test('visual: mobile file row selection surface', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualFilesFixture()
  await openFiles(page, 'mobile', 390)
  await selectFirstMobileFile(page)

  expect(await hasDeepSelector(page, 'file-item-mobile[selected]')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'file-manager-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-selected-file-row', {
    suite: 'file-manager',
    viewport: {width: 390, height: 844},
  })
})

test('visual: desktop table selected row surface', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualFilesFixture()
  await openFiles(page, 'desktop')
  await selectFirstDesktopTableRow(page)

  expect(await hasDeepSelector(page, '.table-view .file-item-wrapper.selected')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'file-manager-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-table-selected-row', {
    suite: 'file-manager',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: desktop file type filter dark', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualFilesFixture()
  await openFiles(page, 'desktop')
  await setRootTheme(page, 'dark')

  try {
    await openDesktopFileTypeFilter(page)

    expect(await hasDeepSelector(page, 'cv-popover.type-filter[open]')).toBe(true)
    expect(await hasHorizontalOverflow(page, 'file-manager-desktop-layout')).toBe(false)

    await assertVisualSnapshot(page, 'desktop-files-type-filter-dark', {
      suite: 'file-manager',
      viewport: {width: 1280, height: 720},
    })
  } finally {
    await setRootTheme(page, 'light')
  }
})

test('visual: desktop password manager gutters and integrated rail', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop')

  expect(await hasDeepSelector(page, 'password-manager-desktop-layout')).toBe(true)
  expect(await hasDeepSelector(page, '.sidebar')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-password-manager-surface', {
    suite: 'password-manager',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: mobile password manager compact gutter', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 390)

  expect(await getMobileToolbarSubtitle(page)).toBe('Logins, cards & secrets')
  expect(await hasDeepSelector(page, 'password-manager-mobile-layout')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'password-manager-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-password-manager-390', {
    suite: 'password-manager',
    viewport: {width: 390, height: 844},
  })
})

test('visual: mobile password manager wide gutter', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 430)

  expect(await getMobileToolbarSubtitle(page)).toBe('Logins, cards & secrets')
  expect(await hasDeepSelector(page, 'password-manager-mobile-layout')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'password-manager-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-password-manager-430', {
    suite: 'password-manager',
    viewport: {width: 430, height: 844},
  })
})

test('visual: mobile credential tag snippet overflow', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerTagSnippetFixture()
  await openPasswords(page, 'mobile', undefined, 390)
  await waitForDeepSelector(page, 'pm-entry-list-item-mobile')

  const state = await getCredentialTagSnippetState(page, 'pm-entry-list-item-mobile')
  const ariaSnapshot = await getCredentialTagAriaSnapshot(page, 'pm-entry-list-item-mobile')

  expect(state.visibleTagLabels).toEqual(['Work'])
  expect(state.visibleTagOverflow).toEqual([{limit: '1', text: '+4', ariaLabel: '4 more tags'}])
  expect(state.tagOverflowFullyVisible).toBe(true)
  expect(ariaSnapshot).toContain('4 more tags')
  expect(await hasHorizontalOverflow(page, 'password-manager-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-credential-tag-snippet-390', {
    suite: 'password-manager',
    viewport: {width: 390, height: 844},
    clipSelector: 'pm-entry-list-item-mobile',
  })
})

test('visual: constrained desktop credential tag snippet overflow', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerTagSnippetFixture()
  await openPasswords(page, 'desktop')
  await page.setViewportSize({width: 960, height: 720})
  await waitForDeepSelector(page, 'pm-entry-list-item')
  await settleResponsiveLayout(page)

  const state = await getCredentialTagSnippetState(page, 'pm-entry-list-item')
  const ariaSnapshot = await getCredentialTagAriaSnapshot(page, 'pm-entry-list-item')

  expect(state.hostWidth).toBeLessThan(680)
  expect(state.visibleTagLabels).toEqual(['Work', 'Production'])
  expect(state.visibleTagOverflow).toEqual([{limit: '2', text: '+3', ariaLabel: '3 more tags'}])
  expect(state.tagOverflowFullyVisible).toBe(true)
  expect(state.hiddenTagOverflowLimits).toContain('3')
  expect(ariaSnapshot).toContain('3 more tags')
  expect(ariaSnapshot).not.toContain('2 more tags')
  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-credential-tag-snippet-constrained-960', {
    suite: 'password-manager',
    viewport: {width: 960, height: 720},
    clipSelector: 'pm-entry-list-item',
  })
})

test('visual: wide desktop credential tag snippet overflow', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerTagSnippetFixture()
  await openPasswords(page, 'desktop')
  await waitForDeepSelector(page, 'pm-entry-list-item')

  const state = await getCredentialTagSnippetState(page, 'pm-entry-list-item')
  const ariaSnapshot = await getCredentialTagAriaSnapshot(page, 'pm-entry-list-item')

  expect(state.hostWidth).toBeGreaterThanOrEqual(680)
  expect(state.visibleTagLabels).toEqual(['Work', 'Production', 'Security Audit'])
  expect(state.visibleTagOverflow).toEqual([{limit: '3', text: '+2', ariaLabel: '2 more tags'}])
  expect(state.tagOverflowFullyVisible).toBe(true)
  expect(state.hiddenTagOverflowLimits).toContain('2')
  expect(ariaSnapshot).toContain('2 more tags')
  expect(ariaSnapshot).not.toContain('3 more tags')
  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-credential-tag-snippet-wide-1280', {
    suite: 'password-manager',
    viewport: {width: 1280, height: 720},
    clipSelector: 'pm-entry-list-item',
  })
})

test('visual: desktop create entry footer CTA', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop')
  await showCreateEntry(page, 'desktop')

  expect(await hasDeepSelector(page, 'pm-entry-create-desktop')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-create-entry', {
    suite: 'password-manager',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: mobile create entry footer CTA', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 390)
  await showCreateEntry(page, 'mobile')

  expect(await hasDeepSelector(page, 'pm-entry-create-mobile')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'password-manager-mobile-layout')).toBe(false)
  const metrics = await getMobileCreateEntryVisualMetrics(page)
  expect(metrics.generatorCenterDeltaX, JSON.stringify(metrics)).toBeLessThanOrEqual(1)
  expect(metrics.generatorCenterDeltaY, JSON.stringify(metrics)).toBeLessThanOrEqual(1)
  expect(metrics.ctaContrast, JSON.stringify(metrics)).toBeGreaterThanOrEqual(4.5)

  await assertVisualSnapshot(page, 'mobile-create-entry-390', {
    suite: 'password-manager',
    viewport: {width: 390, height: 844},
  })
})

test('visual: mobile create entry dark theme contrast', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 390)
  await showCreateEntry(page, 'mobile')
  await setRootTheme(page, 'dark')

  try {
    const metrics = await getMobileCreateEntryVisualMetrics(page)
    expect(metrics.theme).toBe('dark')
    expect(metrics.ctaContrast, JSON.stringify(metrics)).toBeGreaterThanOrEqual(4.5)
    expect(metrics.headingTitleContrast, JSON.stringify(metrics)).toBeGreaterThanOrEqual(4.5)
    expect(metrics.headingSubtitleContrast, JSON.stringify(metrics)).toBeGreaterThanOrEqual(4.5)
    expect(metrics.generatorCenterDeltaX, JSON.stringify(metrics)).toBeLessThanOrEqual(1)
    expect(metrics.generatorCenterDeltaY, JSON.stringify(metrics)).toBeLessThanOrEqual(1)

    await assertVisualSnapshot(page, 'mobile-create-entry-dark-390', {
      suite: 'password-manager',
      viewport: {width: 390, height: 844},
    })
  } finally {
    await setRootTheme(page, 'light')
  }
})

test('visual: mobile create entry Details hub light theme', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 390)
  await showCreateEntry(page, 'mobile')
  await openMobileCreateDetailsHub(page)

  expect(await hasDeepSelector(page, '[data-details-hub]')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'password-manager-mobile-layout')).toBe(false)
  const metrics = await getMobileCreateDetailsHubMetrics(page)
  expect(metrics.rowCount).toBe(4)
  expect(metrics.labelContrast, JSON.stringify(metrics)).toBeGreaterThanOrEqual(4.5)
  expect(metrics.statusContrast, JSON.stringify(metrics)).toBeGreaterThanOrEqual(4.5)

  await assertVisualSnapshot(page, 'mobile-create-entry-details-hub-light-390', {
    suite: 'password-manager',
    viewport: {width: 390, height: 844},
  })
})

test('visual: mobile create entry Details hub dark theme', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 390)
  await showCreateEntry(page, 'mobile')
  await setRootTheme(page, 'dark')

  try {
    await openMobileCreateDetailsHub(page)
    expect(await hasDeepSelector(page, '[data-details-hub]')).toBe(true)
    expect(await hasHorizontalOverflow(page, 'password-manager-mobile-layout')).toBe(false)
    const metrics = await getMobileCreateDetailsHubMetrics(page)
    expect(metrics.rowCount).toBe(4)
    expect(metrics.labelContrast, JSON.stringify(metrics)).toBeGreaterThanOrEqual(4.5)
    expect(metrics.statusContrast, JSON.stringify(metrics)).toBeGreaterThanOrEqual(4.5)

    await assertVisualSnapshot(page, 'mobile-create-entry-details-hub-dark-390', {
      suite: 'password-manager',
      viewport: {width: 390, height: 844},
    })
  } finally {
    await setRootTheme(page, 'light')
  }
})

test('visual: mobile create entry Note editor dark theme', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 390)
  await showCreateEntry(page, 'mobile')
  await setRootTheme(page, 'dark')

  try {
    await openMobileCreateDetailsHub(page)
    await openMobileCreateDetail(page, 'note')
    expect(await hasDeepSelector(page, '[data-detail-editor="note"]')).toBe(true)
    expect(await hasHorizontalOverflow(page, 'password-manager-mobile-layout')).toBe(false)
    const layout = await getMobileCreateDetailEditorLayout(page)
    expect(layout.footerHeight, JSON.stringify(layout)).toBeGreaterThan(0)
    expect(layout.primaryOpacity, JSON.stringify(layout)).toBe('1')
    expect(layout.primaryVisibility, JSON.stringify(layout)).toBe('visible')
    expect(layout.handleTop, JSON.stringify(layout)).toBeGreaterThanOrEqual(0)
    expect(layout.titleTop, JSON.stringify(layout)).toBeGreaterThanOrEqual(0)
    expect(layout.titleBottom, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewportHeight)
    expect(layout.actionsTop, JSON.stringify(layout)).toBeGreaterThanOrEqual(0)
    expect(layout.actionsBottom, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewportHeight)

    await assertVisualSnapshot(page, 'mobile-create-entry-note-editor-dark-390', {
      suite: 'password-manager',
      viewport: {width: 390, height: 844},
    })
  } finally {
    await setRootTheme(page, 'light')
  }
})

test('visual: mobile entry edit footer CTA', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 390)
  await showFirstMobileLoginEntryEdit(page)

  expect(await hasDeepSelector(page, 'pm-entry-mobile')).toBe(true)
  expect(await hasDeepSelector(page, '.entry-edit-save-action')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'password-manager-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-entry-edit-footer-390', {
    suite: 'password-manager',
    viewport: {width: 390, height: 844},
  })
})

test('visual: desktop OTP quick view shared gutter', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop', 'otp')
  await waitForOtpRows(page, 3)

  expect(await hasDeepSelector(page, 'pm-otp-quick-view')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'pm-otp-quick-view')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-otp-quick-view', {
    suite: 'otp-quick-view',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: mobile OTP quick view summary rail', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', 'otp', 390)
  await waitForOtpRows(page, 3)

  expect(await hasDeepSelector(page, 'pm-otp-quick-view-mobile')).toBe(true)
  expect(await hasDeepSelector(page, '.quick-view__summary-rail')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'pm-otp-quick-view-mobile')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-otp-quick-view-390', {
    suite: 'otp-quick-view',
    viewport: {width: 390, height: 844},
  })
})

test('visual: desktop notes quick view shared gutter', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualNotesFixture()
  await openNotes(page, 'desktop')

  expect(await hasDeepSelector(page, 'notes-quick-view')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'notes-quick-view')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-notes-quick-view', {
    suite: 'notes-quick-view',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: mobile notes quick view wide gutter', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualNotesFixture()
  await openNotes(page, 'mobile', 430)

  expect(await hasDeepSelector(page, 'notes-quick-view-mobile')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'notes-quick-view-mobile')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-notes-quick-view-430', {
    suite: 'notes-quick-view',
    viewport: {width: 430, height: 844},
  })
})

test('visual: mobile notes quick view compact gutter', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualNotesFixture()
  await openNotes(page, 'mobile', 390)

  expect(await hasDeepSelector(page, 'notes-quick-view-mobile')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'notes-quick-view-mobile')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-notes-quick-view-390', {
    suite: 'notes-quick-view',
    viewport: {width: 390, height: 844},
  })
})

test('visual: mobile vault unlock loading dark', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await openMobileWelcomeUnlockLoading(page, {
    theme: 'dark',
    viewport: {width: 390, height: 844},
  })

  expect(await hasHorizontalOverflow(page, 'welcome-page-mobile-layout')).toBe(false)
  expect(await hasDeepSelector(page, '.hero.unlocking .hero-icon-shell')).toBe(true)

  await assertVisualSnapshot(page, 'pending-dark-390', {
    suite: 'welcome-mobile-unlock',
    viewport: {width: 390, height: 844},
  })
})

test('visual: mobile vault unlock loading short light', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await openMobileWelcomeUnlockLoading(page, {
    theme: 'light',
    viewport: {width: 360, height: 640},
  })

  expect(await hasHorizontalOverflow(page, 'welcome-page-mobile-layout')).toBe(false)
  expect(await hasDeepSelector(page, '.hero.unlocking .hero-icon-shell')).toBe(true)

  await assertVisualSnapshot(page, 'pending-light-short-360', {
    suite: 'welcome-mobile-unlock',
    viewport: {width: 360, height: 640},
  })
})
