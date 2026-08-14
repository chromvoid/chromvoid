import {expect, test} from 'vitest'

import type {Page} from 'playwright'
import type * as NavigationModelModule from '../../../src/app/navigation/navigation.model'
import type * as ModuleAccessModelModule from '../../../src/core/pro/module-access.model'
import type * as RuntimeCapabilitiesModule from '../../../src/core/runtime/runtime-capabilities'
import type * as AppContextModule from '../../../src/shared/services/app-context'
import type * as SettingsModelModule from '../../../src/routes/settings/settings.model'
import {
  hasDeepSelector,
  hasHorizontalOverflow,
  installFixedVisualClock,
  openFiles,
  openNotes,
  openPasswords,
  seedVisualEmptyNotesFixture,
  seedVisualEmptyPassmanagerFixture,
  seedVisualFilesFixture,
  seedVisualNotesFixture,
  seedVisualPassmanagerFixture,
  seedVisualPaymentCardEntryFixture,
  seedVisualPassmanagerTagSnippetFixture,
  selectFirstDesktopTableRow,
  selectFirstMobileFile,
  selectPasswordGroup,
  showCreateEntry,
  showFirstMobileLoginEntryEdit,
  showFirstMobileGroupEdit,
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

async function openPasswordToolbarPopover(
  page: Page,
  selector: 'cv-popover.filters-popover' | 'cv-popover.sort-popover',
): Promise<void> {
  await page.evaluate((target) => {
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

    const popover = deepFind(document, target) as HTMLElement | null
    const trigger = popover?.shadowRoot?.querySelector('[part="trigger"]') as HTMLElement | null
    if (!trigger) throw new Error(`Password toolbar popover trigger not found: ${target}`)
    trigger.click()
  }, selector)

  await waitForDeepSelector(page, `${selector}[open]`)
  await settleResponsiveLayout(page)
}

async function openDesktopTagManager(page: Page): Promise<void> {
  await openPasswordToolbarPopover(page, 'cv-popover.filters-popover')
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

    const manage = deepFind(document, '.tag-manage-button') as HTMLElement | null
    if (!manage) throw new Error('Desktop tag manager action not found')
    manage.click()
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

    const host = deepFind(document, 'pm-desktop-tag-manager-drawer') as HTMLElement | null
    const drawer = host?.shadowRoot?.querySelector('cv-drawer') as {open?: boolean} | null
    return drawer?.open === true
  })
  await settleResponsiveLayout(page)
}

async function syncMobileSafeAreaFallback(page: Page, platform: 'ios' | 'android'): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await page.waitForFunction(
    (expectedFallback) => {
      const fallback = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--app-runtime-safe-area-block-end-fallback',
        ),
      )
      return fallback === expectedFallback
    },
    platform === 'android' ? 16 : 0,
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
  await page.evaluate(async () => {
    function collectFiniteAnimations(root: Document | ShadowRoot, animations = new Set<Animation>()) {
      for (const animation of root.getAnimations({subtree: true})) {
        const endTime = animation.effect?.getComputedTiming().endTime
        if (typeof endTime === 'number' && Number.isFinite(endTime)) animations.add(animation)
      }
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) collectFiniteAnimations(element.shadowRoot, animations)
      }
      return animations
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
      const activeAnimations = [...collectFiniteAnimations(document)].filter(
        (animation) => animation.playState !== 'finished',
      )
      if (activeAnimations.length === 0) return
      await Promise.all(activeAnimations.map((animation) => animation.finished.catch(() => undefined)))
    }
  })
}

async function openVisualMarkdownEditor(page: Page, width: number): Promise<void> {
  await seedVisualNotesFixture()
  await openNotes(page, 'mobile', width)
  await page.locator('notes-quick-view-mobile [data-row-id="1"]').click()
  await waitForDeepSelector(page, 'markdown-preview')
  await page.locator('markdown-preview .mode-button').filter({hasText: 'Edit'}).click()
  await waitForDeepSelector(page, '.editor-quick-bar')
  await settleResponsiveLayout(page)
}

async function configureCreateWebsiteEditor(
  page: Page,
  state: 'populated' | 'duplicate' | 'advanced',
): Promise<void> {
  await page.evaluate((nextState) => {
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

    type WebsiteEditorModel = {
      rows(): ReadonlyArray<{id: string}>
      updateValue(rowId: string, value: string): void
      updateMatch(rowId: string, match: 'base_domain' | 'exact'): void
      add(): string
      buildRules(): unknown
    }

    const create = deepFind(document, 'pm-entry-create-desktop, pm-entry-create-mobile') as
      | (HTMLElement & {model?: {websiteEditor?: WebsiteEditorModel}})
      | null
    const editor = create?.model?.websiteEditor
    const firstRowId = editor?.rows()[0]?.id
    if (!editor || !firstRowId) throw new Error('Create website editor model was not available')

    editor.updateValue(firstRowId, 'example.com')
    const secondRowId = editor.add()
    editor.updateValue(
      secondRowId,
      nextState === 'duplicate' ? 'https://example.com/' : 'https://account.example.com/sign-in',
    )
    if (nextState === 'advanced') editor.updateMatch(secondRowId, 'exact')
    if (nextState === 'duplicate') editor.buildRules()
  }, state)

  await page.waitForFunction((nextState) => {
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

    const editor = deepFind(document, 'pm-entry-website-editor') as HTMLElement | null
    const root = editor?.shadowRoot
    const hasRows = root?.querySelectorAll('.row').length === 2
    const hasExpectedError =
      nextState !== 'duplicate' || root?.querySelectorAll('[slot="error"]').length === 1
    return Boolean(hasRows && hasExpectedError)
  }, state)

  if (state === 'advanced') {
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

      const editor = deepFind(document, 'pm-entry-website-editor') as HTMLElement | null
      const details = editor?.shadowRoot?.querySelector<HTMLDetailsElement>('.advanced-settings')
      if (!details) throw new Error('Advanced website settings were not available')
      details.open = true
    })
  }

  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

async function showVisualEntry(
  page: Page,
  layout: 'desktop' | 'mobile',
  expectedUrlCount: number,
  entryId = 'visual-github',
): Promise<void> {
  await page.evaluate((targetEntryId) => {
    const passmanager = (
      window as unknown as {
        passmanager?: {
          entriesList?: () => Array<{id?: string}>
          showElement?: {set(value: unknown): void}
        }
      }
    ).passmanager
    const entry = passmanager?.entriesList?.().find((item) => item.id === targetEntryId)
    if (!entry) throw new Error(`Visual entry was not available: ${targetEntryId}`)
    passmanager?.showElement?.set(entry)
  }, entryId)

  const componentSelector = layout === 'desktop' ? 'pm-entry' : 'pm-entry-mobile'
  const urlSelector = layout === 'desktop' ? '.url-link' : '.website-row'
  await waitForDeepSelector(page, componentSelector)
  await page.waitForFunction(
    ({componentSelector, expectedUrlCount, urlSelector}) => {
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

      const entry = deepFind(document, componentSelector) as HTMLElement | null
      return entry?.shadowRoot?.querySelectorAll(urlSelector).length === expectedUrlCount
    },
    {componentSelector, expectedUrlCount, urlSelector},
  )
}

async function getCreateWebsiteActionOverlap(page: Page): Promise<number> {
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

    const editor = deepFind(document, 'pm-entry-website-editor') as HTMLElement | null
    const addButton = editor?.shadowRoot?.querySelector('.add-website')
    const createAction = deepFind(document, '[data-create-entry-submit]')
    const buttonRect = addButton?.getBoundingClientRect()
    const actionRect = createAction?.getBoundingClientRect()
    if (!buttonRect || !actionRect) return -1

    const inlineOverlap = Math.max(
      0,
      Math.min(buttonRect.right, actionRect.right) - Math.max(buttonRect.left, actionRect.left),
    )
    const blockOverlap = Math.max(
      0,
      Math.min(buttonRect.bottom, actionRect.bottom) - Math.max(buttonRect.top, actionRect.top),
    )
    return Math.ceil(inlineOverlap * blockOverlap)
  })
}

async function revealCreateWebsiteActions(page: Page): Promise<void> {
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

    const editor = deepFind(document, 'pm-entry-website-editor') as HTMLElement | null
    editor?.shadowRoot?.querySelector('.add-website')?.scrollIntoView({block: 'center'})
  })
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
  await syncMobileSafeAreaFallback(page, 'android')

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

type MobileRemoteHostVisualState = 'off' | 'pairing' | 'connected' | 'usb-connected'

async function openMobileRemoteHostVisual(
  page: Page,
  options: {
    platform: 'ios' | 'android'
    state: MobileRemoteHostVisualState
    theme: 'light' | 'dark'
    viewport: {width: number; height: number}
  },
): Promise<void> {
  await page.emulateMedia({reducedMotion: 'reduce'})
  await page.setViewportSize(options.viewport)
  await page.goto('http://localhost:4400/index.html?surface=files&layout=mobile', {
    waitUntil: 'domcontentloaded',
  })
  await waitForDeepSelector(page, 'file-app-shell-mobile-layout')

  await page.evaluate(async ({platform, state}) => {
    const now = Date.now()
    const deviceLabel = platform === 'android' ? 'Pixel Pocket Host' : 'Kaifat’s iPhone'
    const pairingOffer = {
      session_id: 'visual-secret-session',
      relay_base_url: 'https://relay.chromvoid.com',
      device_label: deviceLabel,
      expires_at_ms: now + 15 * 60_000,
      platform,
    }
    const status = {
      phase:
        state === 'off' || state === 'usb-connected' ? 'Idle' : state === 'pairing' ? 'Pairing' : 'Ready',
      platform,
      relay_url: state === 'off' || state === 'usb-connected' ? null : 'wss://relay.chromvoid.com',
      device_id: `${platform}-visual-host`,
      device_label: deviceLabel,
      pairing_pin: state === 'pairing' ? '654321' : null,
      pairing_offer: state === 'pairing' ? pairingOffer : null,
      expires_at_ms: state === 'pairing' ? pairingOffer.expires_at_ms : null,
      presence:
        state === 'connected'
          ? {
              peer_id: `${platform}-visual-host`,
              relay_url: 'wss://relay.chromvoid.com',
              room_id: 'visual-room',
              expires_at_ms: now + 15 * 60_000,
              status: 'ready',
            }
          : null,
      paired_peer_id:
        state === 'off' ? null : state === 'usb-connected' ? 'cable-desktop-id' : 'office-desktop-id',
      connected_peers:
        state === 'connected'
          ? [
              {
                peer_id: 'office-desktop-id',
                label: 'Office desktop',
                connected_at_ms: now - 2 * 60_000,
                transport_type: 'wss_relay',
              },
            ]
          : state === 'usb-connected'
            ? [
                {
                  peer_id: 'cable-desktop-id',
                  label: 'Cable desktop',
                  connected_at_ms: now - 2 * 60_000,
                  transport_type: 'usb_mobile',
                },
              ]
            : [],
      error: null,
    }
    const pairedComputers =
      state === 'off'
        ? []
        : state === 'usb-connected'
          ? [
              {
                peer_id: 'cable-desktop-id',
                label: 'Cable desktop',
                platform: 'macos',
                pairing_transport: 'usb_mobile',
                paired_at_ms: now - 7 * 86_400_000,
                last_seen_ms: now - 2 * 60_000,
              },
            ]
          : [
              {
                peer_id: 'office-desktop-id',
                label: 'Office desktop',
                platform: 'macos',
                pairing_transport: 'network',
                paired_at_ms: now - 14 * 86_400_000,
                last_seen_ms: now - 2 * 60_000,
              },
              ...(platform === 'android' && state === 'connected'
                ? [
                    {
                      peer_id: 'travel-laptop-id',
                      label: 'Travel laptop',
                      platform: 'linux',
                      pairing_transport: 'usb_mobile',
                      paired_at_ms: now - 3 * 86_400_000,
                      last_seen_ms: now - 6 * 60_000,
                    },
                  ]
                : []),
            ]

    const internals = {
      async invoke(command: string): Promise<unknown> {
        if (command === 'mobile_host_status' || command === 'mobile_host_publish_presence') {
          return status
        }
        if (command === 'mobile_host_list_paired_computers') return pairedComputers
        if (command === 'unlock_debug_log') return true
        throw new Error(`Unexpected Mobile Remote visual Tauri command: ${command}`)
      },
    }
    Object.assign(window as unknown as Record<string, unknown>, {__TAURI_INTERNALS__: internals})
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => undefined,
    })

    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {setRuntimeCapabilities} = (await dynamicImport(
      '/core/runtime/runtime-capabilities.ts',
    )) as typeof RuntimeCapabilitiesModule
    const {navigationModel} = (await dynamicImport(
      '/app/navigation/navigation.model.ts',
    )) as typeof NavigationModelModule

    setRuntimeCapabilities({
      platform,
      mobile: true,
      desktop: false,
      supports_network_remote: true,
      supports_mobile_usb_remote: false,
    })
    navigationModel.navigateToSurface('remote')
  }, options)

  const expectedPageState = options.state === 'usb-connected' ? 'off' : options.state
  await waitForDeepSelector(page, `[data-mobile-host-state="${expectedPageState}"]`)
  await syncMobileSafeAreaFallback(page, options.platform)
  await page.evaluate(() => {
    function resetScroll(root: Document | ShadowRoot): void {
      for (const element of root.querySelectorAll('*')) {
        if (element instanceof HTMLElement) element.scrollTop = 0
        if (element.shadowRoot) resetScroll(element.shadowRoot)
      }
    }

    document.scrollingElement?.scrollTo({top: 0})
    resetScroll(document)
  })
  await setRootTheme(page, options.theme)
  await settleResponsiveLayout(page)
}

async function restoreMobileRemoteHostVisual(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {resetRuntimeCapabilities} = (await dynamicImport(
      '/core/runtime/runtime-capabilities.ts',
    )) as typeof RuntimeCapabilitiesModule
    resetRuntimeCapabilities()
    delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
  })
}

type DesktopUsbRemoteVisualState =
  | 'host-locked'
  | 'phone-approval'
  | 'ready-write'
  | 'ready-read-only'
  | 'connection-lost'
  | 'error'

async function openDesktopUsbRemoteVisual(
  page: Page,
  options: {
    state: DesktopUsbRemoteVisualState
    theme: 'light' | 'dark'
    viewport: {width: number; height: number}
  },
): Promise<void> {
  await page.emulateMedia({reducedMotion: 'reduce'})
  await page.setViewportSize(options.viewport)
  await page.goto('http://localhost:4400/index.html?surface=files&layout=desktop', {
    waitUntil: 'domcontentloaded',
  })
  await waitForDeepSelector(page, 'file-app-shell-desktop-layout')

  await page.evaluate(async () => {
    const modeInfo = {
      mode: 'local' as const,
      connection_state: 'disconnected' as const,
      transport_type: null,
      remote_core_features: [],
    }
    const usbStatus = {
      transport_family: 'usb_mobile' as const,
      available_transports: ['usb_mobile'] as const,
      selected_transport: null,
      session_state: 'idle_usb_mobile' as const,
      fallback_allowed: false as const,
      active_host: null,
      paired_hosts: [],
      pairing_approval: null,
      in_flight: null,
      error_code: null,
    }

    const internals = {
      async invoke(command: string): Promise<unknown> {
        if (command === 'mode_get' || command === 'mode_status') return modeInfo
        if (command === 'network_list_paired_peers' || command === 'mobile_usb_detect') return []
        if (command === 'mobile_usb_status') return usbStatus
        if (command === 'plugin:event|listen') return 1
        if (command === 'plugin:event|unlisten' || command === 'unlock_debug_log') return true
        throw new Error(`Unexpected Desktop USB Remote visual Tauri command: ${command}`)
      },
    }
    Object.assign(window as unknown as Record<string, unknown>, {__TAURI_INTERNALS__: internals})

    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {setRuntimeCapabilities} = (await dynamicImport(
      '/core/runtime/runtime-capabilities.ts',
    )) as typeof RuntimeCapabilitiesModule
    const {navigationModel} = (await dynamicImport(
      '/app/navigation/navigation.model.ts',
    )) as typeof NavigationModelModule

    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      mobile: false,
      supports_network_remote: true,
      supports_mobile_usb_remote: true,
    })
    navigationModel.navigateToSurface('remote')
  })

  await waitForDeepSelector(page, 'remote-page')
  await waitForDeepSelector(page, '.mode-card')
  await page.evaluate(({state}) => {
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

    type WritableAtom<T> = {set(value: T): void}
    type RemotePageVisualModel = {
      currentMode: WritableAtom<unknown>
      connectionState: WritableAtom<unknown>
      remoteStatus: WritableAtom<unknown>
      transportType: WritableAtom<string | null>
      syncSnapshot: WritableAtom<unknown>
      remoteHosts: {
        view: WritableAtom<'hosts' | 'wait'>
        transportConnectedHost: WritableAtom<unknown>
        usb: {
          status: WritableAtom<unknown>
          lastActiveHost: WritableAtom<unknown>
          errorText: WritableAtom<string | null>
        }
      }
    }

    const host = {
      host_id: 'oneplus-13-visual-host',
      label: 'OnePlus 13',
      platform: 'android',
      bridge_kind: 'android_aoa',
      pairing_state: 'paired',
      last_seen: Date.now() - 30_000,
    }
    const connected = state !== 'connection-lost' && state !== 'error'
    const sessionState =
      state === 'host-locked'
        ? 'transport_ready_host_locked'
        : state === 'phone-approval'
          ? 'session_approval_required'
          : state === 'connection-lost'
            ? 'disconnected'
            : state === 'error'
              ? 'error'
              : 'remote_dashboard_open'
    const mode = connected
      ? {remote: {host: {type: 'mobile_usb', host_id: host.host_id, label: host.label, platform: 'android'}}}
      : 'local'
    const connectionState =
      state === 'connection-lost' ? 'disconnected' : state === 'error' ? 'error' : 'ready'
    const readOnly = state === 'ready-read-only'
    const usbStatus = {
      transport_family: 'usb_mobile',
      available_transports: ['usb_mobile'],
      selected_transport: connected ? 'usb_mobile' : null,
      session_state: sessionState,
      fallback_allowed: false,
      active_host: connected ? host : null,
      paired_hosts: [host],
      pairing_approval: null,
      in_flight: null,
      error_code: state === 'error' ? 'ERR_USB_MOBILE_CABLE_DISCONNECTED' : null,
    }

    const remotePage = deepFind(document, 'remote-page') as
      | (HTMLElement & {model?: RemotePageVisualModel})
      | null
    const model = remotePage?.model
    if (!model) throw new Error('Desktop USB Remote visual model is unavailable')

    model.remoteHosts.usb.lastActiveHost.set(host)
    model.remoteHosts.usb.status.set(usbStatus)
    model.remoteHosts.usb.errorText.set(state === 'error' ? 'USB session ended after cable loss' : null)
    model.currentMode.set(mode)
    model.connectionState.set(connectionState)
    model.transportType.set(connected ? 'usb_mobile' : null)
    model.remoteStatus.set({
      connection_state: connectionState,
      vault_locked: readOnly,
      locked_by_other: readOnly,
      writer_device: readOnly ? 'Office Mac' : null,
    })
    model.syncSnapshot.set({
      state: 'synced',
      progress: null,
      lastSyncMs: Date.now() - 45_000,
      writerLock: readOnly ? {holder: 'Office Mac', since_ms: Date.now() - 120_000} : null,
      errorMessage: null,
    })
    model.remoteHosts.transportConnectedHost.set(
      connected ? {type: 'mobile_usb', host_id: host.host_id, label: host.label, platform: 'android'} : null,
    )
    model.remoteHosts.view.set(connected ? 'wait' : 'hosts')
  }, options)

  await waitForDeepSelector(page, `[data-usb-session-stage]`)
  await setRootTheme(page, options.theme)
  await settleResponsiveLayout(page)
}

async function getDesktopUsbRemoteText(page: Page): Promise<string> {
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
    const session = deepFind(document, '.remote-usb-session')
    return [...(session?.querySelectorAll('.remote-usb-header, .remote-usb-body') ?? [])]
      .map((element) => element.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  })
}

async function openDesktopUsbTechnicalDetails(page: Page): Promise<void> {
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
    ;(deepFind(document, 'cv-disclosure.remote-usb-details') as {show?: () => void} | null)?.show?.()
  })
  await settleResponsiveLayout(page)
}

async function restoreDesktopUsbRemoteVisual(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {resetRuntimeCapabilities} = (await dynamicImport(
      '/core/runtime/runtime-capabilities.ts',
    )) as typeof RuntimeCapabilitiesModule
    const {navigationModel} = (await dynamicImport(
      '/app/navigation/navigation.model.ts',
    )) as typeof NavigationModelModule
    navigationModel.navigateToSurface('files')
    resetRuntimeCapabilities()
    delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
  })
}

async function assertDesktopUsbRemoteVisual(
  page: Page,
  options: {
    state: DesktopUsbRemoteVisualState
    stage: string
    expectedText: string[]
    snapshotName: string
    theme: 'light' | 'dark'
    viewport: {width: number; height: number}
    openDetails?: boolean
  },
): Promise<void> {
  await openDesktopUsbRemoteVisual(page, options)

  try {
    expect(await hasDeepSelector(page, `[data-usb-session-stage="${options.stage}"]`)).toBe(true)
    expect(await hasDeepSelector(page, '.mode-card')).toBe(false)
    expect(await hasDeepSelector(page, '.writer-access-row')).toBe(false)
    expect(await hasHorizontalOverflow(page, 'remote-page')).toBe(false)

    const text = await getDesktopUsbRemoteText(page)
    for (const expected of options.expectedText) expect(text).toContain(expected)
    expect(text).not.toContain('USB_MOBILE')

    if (options.openDetails) {
      await openDesktopUsbTechnicalDetails(page)
      expect(await hasDeepSelector(page, 'cv-disclosure.remote-usb-details[open]')).toBe(true)
    } else {
      expect(await hasDeepSelector(page, 'cv-disclosure.remote-usb-details[open]')).toBe(false)
    }

    await assertVisualSnapshot(page, options.snapshotName, {
      suite: 'remote',
      viewport: options.viewport,
      maxDiffRatio: 0.005,
    })
  } finally {
    await restoreDesktopUsbRemoteVisual(page)
  }
}

type DesktopPreauthRemoteVisualState =
  | 'detected-saved'
  | 'network-empty'
  | 'pair-validation'
  | 'usb-recovery'
  | 'phone-approval'

async function openDesktopPreauthRemoteVisual(
  page: Page,
  options: {
    state: DesktopPreauthRemoteVisualState
    theme: 'light' | 'dark'
    viewport: {width: number; height: number}
    openDetails?: boolean
  },
): Promise<void> {
  await page.emulateMedia({reducedMotion: 'reduce'})
  await page.setViewportSize(options.viewport)
  await page.goto('http://localhost:4400/index.html?preview=welcome&layout=desktop', {
    waitUntil: 'domcontentloaded',
  })
  await waitForDeepSelector(page, 'welcome-page-desktop-layout')

  await page.evaluate(async ({state}) => {
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

    type WritableAtom<T> = {set(value: T): void}
    type WelcomeVisualModel = {
      setup: {
        setupStep: WritableAtom<'remote-connect' | 'remote-pair' | 'remote-wait'>
        remote: {
          view: WritableAtom<'hosts' | 'pair-ios' | 'usb-mobile' | 'wait'>
          peers: WritableAtom<unknown[]>
          peerListLoaded: WritableAtom<boolean>
          peerListError: WritableAtom<string | null>
          transportConnectedHost: WritableAtom<unknown>
          desktopPairing: {submitAttempted: WritableAtom<boolean>}
          usb: {
            detectingDevices: () => boolean
            detectedDevices: WritableAtom<unknown[]>
            scanResults: WritableAtom<unknown[]>
            pairedHosts: WritableAtom<unknown[]>
            status: WritableAtom<unknown>
            errorText: WritableAtom<string | null>
          }
        }
      }
    }

    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {setRuntimeCapabilities} = (await dynamicImport(
      '/core/runtime/runtime-capabilities.ts',
    )) as typeof RuntimeCapabilitiesModule
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule

    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      mobile: false,
      supports_network_remote: true,
      supports_mobile_usb_remote: true,
    })

    const approvalTransportHost = {
      type: 'mobile_usb',
      host_id: 'visual-oneplus-host',
      label: 'OnePlus 13',
      platform: 'android',
    }
    const approvalUsbHost = {
      host_id: approvalTransportHost.host_id,
      label: approvalTransportHost.label,
      platform: approvalTransportHost.platform,
      bridge_kind: 'android_aoa',
      pairing_state: 'paired',
      last_seen: null,
    }

    Object.assign(window as unknown as Record<string, unknown>, {
      __TAURI_INTERNALS__: {
        async invoke(command: string): Promise<unknown> {
          if (command === 'network_list_paired_peers' || command === 'mobile_usb_detect') return []
          if (command === 'mobile_usb_status') {
            if (state === 'phone-approval') {
              return {
                transport_family: 'usb_mobile',
                available_transports: ['usb_mobile'],
                selected_transport: 'usb_mobile',
                session_state: 'session_approval_required',
                fallback_allowed: false,
                active_host: approvalUsbHost,
                paired_hosts: [approvalUsbHost],
                pairing_approval: null,
                in_flight: null,
                error_code: null,
              }
            }
            return {
              transport_family: 'usb_mobile',
              available_transports: ['usb_mobile'],
              selected_transport: null,
              session_state: 'idle_usb_mobile',
              fallback_allowed: false,
              active_host: null,
              paired_hosts: [],
              pairing_approval: null,
              in_flight: null,
              error_code: null,
            }
          }
          if (command === 'mode_get' || command === 'mode_status') {
            if (state === 'phone-approval') {
              return {
                mode: {remote: {host: approvalTransportHost}},
                connection_state: 'ready',
                transport_type: 'mobile_usb',
                remote_core_features: [],
                transport_session_generation: 1,
              }
            }
            return {
              mode: 'local',
              connection_state: 'disconnected',
              transport_type: null,
              remote_core_features: [],
            }
          }
          if (command === 'plugin:event|listen') return 1
          if (command === 'plugin:event|unlisten' || command === 'unlock_debug_log') return true
          return null
        },
      },
    })

    type WelcomeVisualElement = HTMLElement & {
      model?: WelcomeVisualModel
      updateComplete: Promise<unknown>
    }
    const existingLayout = deepFind(document, 'welcome-page-desktop-layout') as WelcomeVisualElement | null
    if (!existingLayout) throw new Error('Desktop welcome visual layout is unavailable')
    const layout = document.createElement('welcome-page-desktop-layout') as WelcomeVisualElement
    existingLayout.replaceWith(layout)
    await layout.updateComplete
    await Promise.resolve()
    await Promise.resolve()

    const setup = layout.model?.setup
    if (!setup) throw new Error('Desktop welcome visual model is unavailable')

    const remote = setup.remote
    for (let attempt = 0; attempt < 50 && remote.usb.detectingDevices(); attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    const pixelScan = {
      platform: 'android',
      bridge_kind: 'android_aoa',
      usb_hint: {
        manufacturer: 'Google',
        model: 'Pixel 9 Pro',
        serial_number: 'visual-pixel-9',
        protocol_id: null,
      },
      label: 'Pixel 9 Pro',
    }
    const pixelHost = {
      host_id: 'visual-pixel-host',
      label: 'Pixel 9 Pro',
      platform: 'android',
      bridge_kind: 'android_aoa',
      pairing_state: 'broken_local_state',
      last_seen: null,
    }

    remote.peerListLoaded.set(true)
    remote.peerListError.set(null)
    remote.peers.set([])
    remote.usb.detectedDevices.set([])
    remote.usb.scanResults.set([])
    remote.usb.pairedHosts.set([])
    remote.usb.status.set(null)
    remote.usb.errorText.set(null)

    if (state === 'pair-validation') {
      setup.setupStep.set('remote-pair')
      remote.view.set('pair-ios')
      remote.desktopPairing.submitAttempted.set(true)
      return
    }

    if (state === 'usb-recovery') {
      setup.setupStep.set('remote-connect')
      remote.view.set('usb-mobile')
      remote.usb.scanResults.set([
        {scan: pixelScan, classification: {broken_local_state: {host_id: pixelHost.host_id}}},
        {
          scan: {
            ...pixelScan,
            label: 'Galaxy S25',
            usb_hint: {...pixelScan.usb_hint, model: 'Galaxy S25', serial_number: 'visual-galaxy'},
          },
          classification: 'unpaired',
        },
      ])
      remote.usb.pairedHosts.set([])
      remote.usb.status.set({
        transport_family: 'usb_mobile',
        available_transports: ['usb_mobile'],
        selected_transport: null,
        session_state: 'error',
        fallback_allowed: false,
        active_host: pixelHost,
        paired_hosts: [],
        pairing_approval: null,
        in_flight: null,
        error_code: 'ERR_USB_MOBILE_STALE_PAIRING',
      })
      remote.usb.errorText.set('ERR_USB_MOBILE_STALE_PAIRING: local pairing record is stale')
      return
    }

    if (state === 'phone-approval') {
      setup.setupStep.set('remote-wait')
      remote.view.set('wait')
      remote.transportConnectedHost.set(approvalTransportHost)
      getAppContext().store.remoteSessionState.set('waiting_phone_approval')
      return
    }

    setup.setupStep.set('remote-connect')
    remote.view.set('hosts')
    if (state === 'detected-saved') {
      remote.usb.detectedDevices.set([
        {
          scan: pixelScan,
          accessory_mode: false,
          paired_match: {
            host_id: 'visual-pixel-host',
            label: 'Pixel 9 Pro',
            pairing_state: 'confirmed',
          },
        },
      ])
      remote.peers.set([
        {
          peer_id: 'visual-iphone-ready',
          label: 'Personal iPhone',
          relay_url: 'wss://relay.chromvoid.com',
          last_seen: Date.now() - 30_000,
          paired_at: Date.now() - 86_400_000,
          platform: 'ios',
          status: 'ready',
          presence_expires_at_ms: Date.now() + 60_000,
        },
        {
          peer_id: 'visual-iphone-offline',
          label: 'Work iPhone',
          relay_url: 'wss://relay.chromvoid.com',
          last_seen: Date.now() - 3_600_000,
          paired_at: Date.now() - 172_800_000,
          platform: 'ios',
          status: 'offline',
          presence_expires_at_ms: null,
        },
      ])
    }
  }, options)

  await waitForDeepSelector(page, 'remote-desktop-preauth')
  await waitForDeepSelector(
    page,
    `[data-remote-preauth-screen="${
      options.state === 'pair-validation'
        ? 'pair'
        : options.state === 'usb-recovery'
          ? 'usb'
          : options.state === 'phone-approval'
            ? 'wait'
            : 'hosts'
    }"]`,
  )
  await setRootTheme(page, options.theme)

  if (options.openDetails) {
    await page.evaluate(async () => {
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
      const details = deepFind(document, '[data-usb-technical-details]') as
        | (HTMLElement & {show?: () => void; updateComplete?: Promise<unknown>})
        | null
      details?.show?.()
      await details?.updateComplete
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
      details?.scrollIntoView({block: 'center'})
    })
  } else {
    await page.evaluate(() => {
      function resetScroll(root: Document | ShadowRoot): void {
        for (const element of root.querySelectorAll('*')) {
          if (element instanceof HTMLElement) element.scrollTop = 0
          if (element.shadowRoot) resetScroll(element.shadowRoot)
        }
      }
      document.scrollingElement?.scrollTo({top: 0})
      resetScroll(document)
    })
  }
  await settleResponsiveLayout(page)
}

async function getDesktopPreauthRemoteText(page: Page): Promise<string> {
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
    return (
      deepFind(document, 'remote-desktop-preauth')?.shadowRoot?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    )
  })
}

async function restoreDesktopPreauthRemoteVisual(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {resetRuntimeCapabilities} = (await dynamicImport(
      '/core/runtime/runtime-capabilities.ts',
    )) as typeof RuntimeCapabilitiesModule
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule
    getAppContext().store.remoteSessionState.set('inactive')
    resetRuntimeCapabilities()
    delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
  })
}

async function assertDesktopPreauthRemoteVisual(
  page: Page,
  options: {
    state: DesktopPreauthRemoteVisualState
    expectedText: string[]
    snapshotName: string
    theme: 'light' | 'dark'
    viewport: {width: number; height: number}
    openDetails?: boolean
  },
): Promise<void> {
  await openDesktopPreauthRemoteVisual(page, options)
  try {
    const text = await getDesktopPreauthRemoteText(page)
    for (const expected of options.expectedText) expect(text).toContain(expected)
    expect(await hasDeepSelector(page, '.remote-flow-frame')).toBe(false)
    expect(await hasDeepSelector(page, '.remote-flow-statusbar')).toBe(false)
    expect(await hasHorizontalOverflow(page, 'welcome-page-desktop-layout')).toBe(false)
    expect(await hasDocumentHorizontalOverflow(page)).toBe(false)
    expect(await hasDeepSelector(page, 'cv-disclosure.technical-details[open]')).toBe(
      Boolean(options.openDetails),
    )

    await assertVisualSnapshot(page, options.snapshotName, {
      suite: 'remote-preauth',
      viewport: options.viewport,
      maxDiffRatio: 0.005,
    })
  } finally {
    await restoreDesktopPreauthRemoteVisual(page)
  }
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
  await waitForDeepSelector(page, '.unlock-inline-submit[aria-busy="true"]')
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

async function getMobileCreateNoteEditorLayout(page: Page) {
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
    const editor = sheet?.shadowRoot?.querySelector('[data-detail-editor="note"]') as HTMLElement | null
    const textarea = editor?.querySelector('cv-textarea') as HTMLElement | null
    const textareaBase = textarea?.shadowRoot?.querySelector('[part="base"]') as HTMLElement | null
    const bottomSheet = sheet?.shadowRoot?.querySelector('cv-bottom-sheet') as HTMLElement | null
    const dialog = bottomSheet?.shadowRoot?.querySelector('cv-dialog') as HTMLElement | null
    const content = dialog?.shadowRoot?.querySelector('[part="content"]') as HTMLElement | null
    const body = dialog?.shadowRoot?.querySelector('[part="body"]') as HTMLElement | null
    const title = dialog?.shadowRoot?.querySelector('[part="title"]') as HTMLElement | null
    const footer = dialog?.shadowRoot?.querySelector('[part="footer"]') as HTMLElement | null
    if (!editor || !textareaBase || !content || !body || !title || !footer) {
      throw new Error('Note editor layout target is missing')
    }

    const contentRect = content.getBoundingClientRect()
    const bodyRect = body.getBoundingClientRect()
    const editorRect = editor.getBoundingClientRect()
    const textareaRect = textareaBase.getBoundingClientRect()
    const footerRect = footer.getBoundingClientRect()
    const titleRect = title.getBoundingClientRect()
    return {
      actionCount: sheet.shadowRoot?.querySelectorAll('.sheet-actions').length ?? 0,
      bodyBottom: bodyRect.bottom,
      bodyTop: bodyRect.top,
      contentBottom: contentRect.bottom,
      contentTop: contentRect.top,
      editorBottom: editorRect.bottom,
      editorTop: editorRect.top,
      footerHeight: footerRect.height,
      textareaBottom: textareaRect.bottom,
      textareaTop: textareaRect.top,
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
    const submit = root?.querySelector('#passwords\\.create\\.submit') as HTMLButtonElement | null
    const heading = root?.querySelector('.form-heading') as HTMLElement | null
    const headingTitle = root?.querySelector('.form-heading-title') as HTMLElement | null
    const headingSubtitle = root?.querySelector('.form-heading-subtitle') as HTMLElement | null
    if (!inputBase || !suffix || !generateIcon || !submit || !heading || !headingTitle || !headingSubtitle) {
      throw new Error('Create Entry visual metrics target is missing')
    }

    const inputRect = inputBase.getBoundingClientRect()
    const suffixRect = suffix.getBoundingClientRect()
    const iconRect = generateIcon.getBoundingClientRect()
    const trailingCenterX = (suffixRect.left + inputRect.right) / 2
    const inputCenterY = (inputRect.top + inputRect.bottom) / 2
    const iconCenterX = (iconRect.left + iconRect.right) / 2
    const iconCenterY = (iconRect.top + iconRect.bottom) / 2
    const submitStyle = getComputedStyle(submit)
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

test('visual: narrow desktop remote keeps the shell toolbar renderer', async (ctx) => {
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

test('visual: Desktop pre-auth Remote detected USB and saved phones', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await assertDesktopPreauthRemoteVisual(page, {
    state: 'detected-saved',
    expectedText: [
      'Connect to a phone',
      'Detected now',
      'Pixel 9 Pro',
      'Forget phone',
      'Personal iPhone',
      'Work iPhone',
    ],
    snapshotName: 'desktop-preauth-detected-saved-dark-1280x800',
    theme: 'dark',
    viewport: {width: 1280, height: 800},
  })
})

test('visual: Desktop pre-auth Remote network empty', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await assertDesktopPreauthRemoteVisual(page, {
    state: 'network-empty',
    expectedText: [
      'Connect to a phone',
      'No saved phones',
      'Pair over network',
      'Connect Android phone by USB',
    ],
    snapshotName: 'desktop-preauth-network-empty-light-1024x768',
    theme: 'light',
    viewport: {width: 1024, height: 768},
  })
})

test('visual: Desktop pre-auth Remote pairing validation', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await assertDesktopPreauthRemoteVisual(page, {
    state: 'pair-validation',
    expectedText: [
      'Pair over network',
      'Pairing link',
      'Enter the pairing link shown on your phone',
      'Enter the PIN shown on your phone',
    ],
    snapshotName: 'desktop-preauth-pair-validation-dark-1024x768',
    theme: 'dark',
    viewport: {width: 1024, height: 768},
  })
})

test('visual: Desktop pre-auth Remote multiple USB recovery details', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await assertDesktopPreauthRemoteVisual(page, {
    state: 'usb-recovery',
    expectedText: [
      'USB connection needs attention',
      'Pixel 9 Pro',
      'Galaxy S25',
      'ERR_USB_MOBILE_STALE_PAIRING',
    ],
    snapshotName: 'desktop-preauth-usb-recovery-details-dark-1024x768',
    theme: 'dark',
    viewport: {width: 1024, height: 768},
    openDetails: true,
  })
})

test('visual: Desktop pre-auth Remote waits for phone approval', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await assertDesktopPreauthRemoteVisual(page, {
    state: 'phone-approval',
    expectedText: ['Approve this computer on your phone', 'Tap Allow on OnePlus 13'],
    snapshotName: 'desktop-preauth-phone-approval-dark-1280x800',
    theme: 'dark',
    viewport: {width: 1280, height: 800},
  })
})

test('visual: Desktop pre-auth Remote supports RTL at a 200% effective viewport', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installArabicLocale(page)
  await openDesktopPreauthRemoteVisual(page, {
    state: 'detected-saved',
    theme: 'dark',
    viewport: {width: 512, height: 384},
  })

  try {
    await expect(
      page.evaluate(() => ({
        direction: document.documentElement.dir,
        language: document.documentElement.lang,
      })),
    ).resolves.toEqual({direction: 'rtl', language: 'ar'})
    expect(await hasHorizontalOverflow(page, 'welcome-page-desktop-layout')).toBe(false)
    expect(await hasDocumentHorizontalOverflow(page)).toBe(false)
    await expect(
      page.evaluate(() => {
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

        const panel = deepFind(document, '.detected-panel')
        const copy = panel?.querySelector('.detected-copy')?.getBoundingClientRect()
        const action = panel?.querySelector('cv-button')?.getBoundingClientRect()
        return Boolean(copy && action && action.top >= copy.bottom - 1)
      }),
    ).resolves.toBe(true)
  } finally {
    await restoreDesktopPreauthRemoteVisual(page)
  }
})

test('visual: Desktop USB Remote waits for host unlock', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await assertDesktopUsbRemoteVisual(page, {
    state: 'host-locked',
    stage: 'waiting_host_unlock',
    expectedText: ['OnePlus 13', 'Open the vault on OnePlus 13', 'Available after the phone is ready'],
    snapshotName: 'desktop-usb-host-locked-dark-1280x800',
    theme: 'dark',
    viewport: {width: 1280, height: 800},
  })
})

test('visual: Desktop USB Remote waits for phone approval', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await assertDesktopUsbRemoteVisual(page, {
    state: 'phone-approval',
    stage: 'waiting_phone_approval',
    expectedText: ['Tap Allow on OnePlus 13', 'Session approval required'],
    snapshotName: 'desktop-usb-phone-approval-dark-1280x800',
    theme: 'dark',
    viewport: {width: 1280, height: 800},
  })
})

test('visual: Desktop USB Remote ready with write access', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await assertDesktopUsbRemoteVisual(page, {
    state: 'ready-write',
    stage: 'ready',
    expectedText: [
      'Remote vault is ready',
      'Vault open',
      'You have write access',
      'Disconnect USB and use Local',
    ],
    snapshotName: 'desktop-usb-ready-write-light-1280x800',
    theme: 'light',
    viewport: {width: 1280, height: 800},
  })
})

test('visual: Desktop USB Remote ready with writer lock', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await assertDesktopUsbRemoteVisual(page, {
    state: 'ready-read-only',
    stage: 'ready',
    expectedText: ['Remote vault is ready', 'Write locked by Office Mac', 'Request Lock'],
    snapshotName: 'desktop-usb-ready-read-only-dark-1024x768',
    theme: 'dark',
    viewport: {width: 1024, height: 768},
  })
})

test('visual: Desktop USB Remote cable-loss recovery', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await assertDesktopUsbRemoteVisual(page, {
    state: 'connection-lost',
    stage: 'connection_lost',
    expectedText: [
      'USB connection lost',
      'Not connected',
      'Unavailable while disconnected',
      'Reconnect via USB',
      'Use Local',
    ],
    snapshotName: 'desktop-usb-connection-lost-dark-1024x768',
    theme: 'dark',
    viewport: {width: 1024, height: 768},
  })
})

test('visual: Desktop USB Remote error technical details', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await assertDesktopUsbRemoteVisual(page, {
    state: 'error',
    stage: 'error',
    expectedText: [
      'USB connection needs attention',
      'Not connected',
      'Unavailable while disconnected',
      'Reconnect via USB',
    ],
    snapshotName: 'desktop-usb-error-details-dark-1280x800',
    theme: 'dark',
    viewport: {width: 1280, height: 800},
    openDetails: true,
  })
})

test('visual: iOS Mobile Host off state', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await openMobileRemoteHostVisual(page, {
    platform: 'ios',
    state: 'off',
    theme: 'dark',
    viewport: {width: 390, height: 844},
  })

  try {
    expect(await getMobileToolbarSubtitle(page)).toBe('Make this phone available to your computers')
    expect(await hasDeepSelector(page, '[data-mobile-host-path="network"]')).toBe(true)
    expect(await hasDeepSelector(page, '[data-mobile-host-path="usb"]')).toBe(false)
    expect(await hasDeepSelector(page, '[data-mobile-host-action="refresh-paired"]')).toBe(true)
    expect(await hasDeepSelector(page, '.mobile-host-empty')).toBe(true)
    expect(await hasDeepSelector(page, 'cv-disclosure[open]')).toBe(false)
    expect(await hasHorizontalOverflow(page, 'file-app-shell-mobile-layout')).toBe(false)

    await assertVisualSnapshot(page, 'ios-host-off-dark-390', {
      suite: 'remote',
      viewport: {width: 390, height: 844},
    })
  } finally {
    await restoreMobileRemoteHostVisual(page)
  }
})

test('visual: Android Mobile Host pairing state', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await openMobileRemoteHostVisual(page, {
    platform: 'android',
    state: 'pairing',
    theme: 'light',
    viewport: {width: 390, height: 844},
  })

  try {
    expect(await hasDeepSelector(page, '[data-mobile-host-path="usb"]')).toBe(true)
    expect(await hasDeepSelector(page, '[data-mobile-host-action="share"]')).toBe(true)
    expect(await hasDeepSelector(page, '[data-mobile-host-action="copy"]')).toBe(true)
    expect(await hasDeepSelector(page, '[data-mobile-host-pairing-link]')).toBe(true)
    expect(await hasHorizontalOverflow(page, 'file-app-shell-mobile-layout')).toBe(false)

    await assertVisualSnapshot(page, 'android-host-pairing-light-390', {
      suite: 'remote',
      viewport: {width: 390, height: 844},
      maxDiffRatio: 0.005,
    })
  } finally {
    await restoreMobileRemoteHostVisual(page)
  }
})

test('visual: Android USB stays connected while Network Remote is off', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await openMobileRemoteHostVisual(page, {
    platform: 'android',
    state: 'usb-connected',
    theme: 'dark',
    viewport: {width: 390, height: 844},
  })

  try {
    expect(await hasDeepSelector(page, '[data-mobile-host-state="off"]')).toBe(true)
    expect(
      await hasDeepSelector(page, '[data-mobile-host-path="network"][data-path-state="after-start"]'),
    ).toBe(true)
    expect(await hasDeepSelector(page, '[data-mobile-host-path="usb"][data-path-state="connected"]')).toBe(
      true,
    )
    expect(await hasDeepSelector(page, '[data-mobile-host-transport="usb_mobile"]')).toBe(true)
    expect(await hasDeepSelector(page, '[data-mobile-host-revoke-peer-id="cable-desktop-id"]')).toBe(true)
    expect(await hasDeepSelector(page, '[data-mobile-host-action="start"]')).toBe(true)
    expect(await hasDeepSelector(page, '[data-mobile-host-action="stop"]')).toBe(false)
    expect(await hasHorizontalOverflow(page, 'file-app-shell-mobile-layout')).toBe(false)

    await assertVisualSnapshot(page, 'android-usb-connected-network-off-dark-390', {
      suite: 'remote',
      viewport: {width: 390, height: 844},
      maxDiffRatio: 0.005,
    })
  } finally {
    await restoreMobileRemoteHostVisual(page)
  }
})

test('visual: Android Mobile Host connected peers', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await openMobileRemoteHostVisual(page, {
    platform: 'android',
    state: 'connected',
    theme: 'dark',
    viewport: {width: 360, height: 640},
  })

  try {
    expect(await hasDeepSelector(page, '[data-mobile-host-state="connected"]')).toBe(true)
    expect(await hasDeepSelector(page, '[data-mobile-host-transport="network"]')).toBe(true)
    expect(await hasDeepSelector(page, '[data-mobile-host-transport="usb_mobile"]')).toBe(true)
    expect(await hasDeepSelector(page, '[data-mobile-host-revoke-peer-id="office-desktop-id"]')).toBe(true)
    expect(await hasDeepSelector(page, 'cv-disclosure[open]')).toBe(false)
    expect(await hasHorizontalOverflow(page, 'file-app-shell-mobile-layout')).toBe(false)

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

      deepFind(document, '#mobile-host-paths-title')?.parentElement?.scrollIntoView({block: 'start'})
    })
    await settleResponsiveLayout(page)

    await assertVisualSnapshot(page, 'android-host-connected-dark-360x640', {
      suite: 'remote',
      viewport: {width: 360, height: 640},
      maxDiffRatio: 0.005,
    })
  } finally {
    await restoreMobileRemoteHostVisual(page)
  }
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

  const selectionBarBottomGap = await page.evaluate(() => {
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

    const fileManager = deepFind(document, 'chromvoid-file-manager') as HTMLElement | null
    const selectionBar = deepFind(document, '.mobile-selection-bar') as HTMLElement | null
    if (!fileManager || !selectionBar) throw new Error('Mobile file selection surface was not rendered')

    return fileManager.getBoundingClientRect().bottom - selectionBar.getBoundingClientRect().bottom
  })
  expect(selectionBarBottomGap).toBeCloseTo(8, 0)

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

test('visual: desktop credentials populated workbench', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture({positiveCredentialRisks: true})
  await openPasswords(page, 'desktop')
  await waitForDeepSelector(page, 'password-manager-desktop-toolbar')
  await waitForDeepSelector(page, 'pm-group')
  await waitForDeepSelector(page, 'pm-entry-list-item')
  await waitForDeepSelector(page, '.status-context-summary[data-security-status="ready"]')

  expect(await hasDeepSelector(page, 'password-manager-desktop-layout')).toBe(true)
  expect(await hasDeepSelector(page, '.sidebar')).toBe(true)
  expect(await hasDeepSelector(page, '.status-context-summary')).toBe(true)
  expect(await hasDeepSelector(page, '.group-metrics-strip')).toBe(false)
  expect(await hasDocumentHorizontalOverflow(page)).toBe(false)
  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)
  expect(await hasHorizontalOverflow(page, 'status-bar')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-password-manager-surface', {
    suite: 'password-manager',
    viewport: {width: 1280, height: 720},
    maxDiffRatio: 0.0005,
  })
})

test('visual: desktop credentials constrained workbench', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture({positiveCredentialRisks: true})
  await openPasswords(page, 'desktop')
  await page.setViewportSize({width: 960, height: 720})
  await waitForDeepSelector(page, 'password-manager-desktop-toolbar')
  await waitForDeepSelector(page, 'pm-group')
  await waitForDeepSelector(page, 'pm-entry-list-item')
  await waitForDeepSelector(page, '.status-context-summary[data-security-status="ready"]')
  await settleResponsiveLayout(page)

  expect(await hasDeepSelector(page, '.sidebar')).toBe(true)
  expect(await hasDeepSelector(page, '.status-context-summary')).toBe(true)
  expect(await hasDeepSelector(page, '.group-metrics-strip')).toBe(false)
  expect(await hasDocumentHorizontalOverflow(page)).toBe(false)
  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)
  expect(await hasHorizontalOverflow(page, 'status-bar')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-credentials-constrained-960', {
    suite: 'password-manager',
    viewport: {width: 960, height: 720},
    maxDiffRatio: 0.0005,
  })
})

test('visual: desktop credentials filters popover dark constrained', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop')
  await page.setViewportSize({width: 960, height: 720})
  await setRootTheme(page, 'dark')

  try {
    await waitForDeepSelector(page, 'password-manager-desktop-toolbar')
    await openPasswordToolbarPopover(page, 'cv-popover.filters-popover')

    expect(await hasDeepSelector(page, 'cv-popover.filters-popover[open]')).toBe(true)
    expect(await hasDocumentHorizontalOverflow(page)).toBe(false)

    await assertVisualSnapshot(page, 'desktop-credentials-filters-dark-960', {
      suite: 'password-manager',
      viewport: {width: 960, height: 720},
      maxDiffRatio: 0,
    })
  } finally {
    await setRootTheme(page, 'light')
  }
})

test('visual: desktop tag manager drawer populated', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop')
  await page.setViewportSize({width: 1280, height: 800})
  await page.evaluate(() => {
    const passmanager = (window as any).passmanager
    passmanager.credentialTags.set([
      'Work',
      'Personal',
      'Production',
      'Security Audit',
      'Rotate Credentials Quarterly',
    ])
    passmanager.credentialTagMeta.set({
      work: {colorId: 'orange'},
      personal: {colorId: 'pink'},
      production: {colorId: 'amber'},
      'security-audit': {colorId: 'cyan'},
      'rotate-credentials-quarterly': {colorId: 'violet'},
    })
  })
  await openDesktopTagManager(page)

  expect(await hasDeepSelector(page, 'cv-popover.filters-popover[open]')).toBe(false)
  expect(await hasDeepSelector(page, 'pm-desktop-tag-manager-drawer')).toBe(true)
  expect(await hasDeepSelector(page, 'pm-mobile-tag-filter-sheet')).toBe(false)
  expect(await hasDocumentHorizontalOverflow(page)).toBe(false)

  await assertVisualSnapshot(page, 'desktop-tag-manager-drawer-populated-1280', {
    suite: 'password-manager',
    viewport: {width: 1280, height: 800},
    maxDiffRatio: 0,
  })
})

test('visual: desktop tag manager drawer no results dark RTL', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop')
  await page.setViewportSize({width: 960, height: 720})
  await page.evaluate(() => {
    document.documentElement.dir = 'rtl'
    const passmanager = (window as any).passmanager
    passmanager.credentialTags.set(['Work', 'Personal', 'Security Audit'])
  })
  await setRootTheme(page, 'dark')

  try {
    await openDesktopTagManager(page)
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

      const host = deepFind(document, 'pm-desktop-tag-manager-drawer') as HTMLElement | null
      host?.shadowRoot?.querySelector('#pm-tag-catalog-search')?.dispatchEvent(
        new CustomEvent('cv-input', {
          detail: {value: 'No matching tag'},
          bubbles: true,
          composed: true,
        }),
      )
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

      const host = deepFind(document, 'pm-desktop-tag-manager-drawer') as HTMLElement | null
      return Boolean(host?.shadowRoot?.querySelector('.no-results'))
    })

    expect(await hasDocumentHorizontalOverflow(page)).toBe(false)

    await assertVisualSnapshot(page, 'desktop-tag-manager-drawer-no-results-dark-rtl-960', {
      suite: 'password-manager',
      viewport: {width: 960, height: 720},
    })
  } finally {
    await page.evaluate(() => document.documentElement.removeAttribute('dir'))
    await setRootTheme(page, 'light')
  }
})

test('visual: desktop credentials sort popover dark', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop')
  await setRootTheme(page, 'dark')

  try {
    await waitForDeepSelector(page, 'password-manager-desktop-toolbar')
    await openPasswordToolbarPopover(page, 'cv-popover.sort-popover')

    expect(await hasDeepSelector(page, 'cv-popover.sort-popover[open]')).toBe(true)
    expect(await hasDocumentHorizontalOverflow(page)).toBe(false)

    await assertVisualSnapshot(page, 'desktop-credentials-sort-dark', {
      suite: 'password-manager',
      viewport: {width: 1280, height: 720},
      maxDiffRatio: 0,
    })
  } finally {
    await setRootTheme(page, 'light')
  }
})

test('visual: desktop credentials empty dark', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualEmptyPassmanagerFixture()
  await openPasswords(page, 'desktop')
  await setRootTheme(page, 'dark')

  try {
    await waitForDeepSelector(page, 'cv-empty-state[data-empty-kind="empty"]')

    expect(await hasDeepSelector(page, 'password-manager-desktop-toolbar')).toBe(true)
    expect(await hasDeepSelector(page, '.status-context-summary')).toBe(true)
    expect(await hasDeepSelector(page, '.group-metrics-strip')).toBe(false)
    expect(await hasDocumentHorizontalOverflow(page)).toBe(false)
    expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)

    await assertVisualSnapshot(page, 'desktop-credentials-empty-dark', {
      suite: 'password-manager',
      viewport: {width: 1280, height: 720},
    })
  } finally {
    await setRootTheme(page, 'light')
  }
})

test('visual: desktop credentials selected group', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture({authoredGroupDescription: true})
  await openPasswords(page, 'desktop')
  await selectPasswordGroup(page, 'Production')
  await waitForDeepSelector(page, 'pm-workspace-header')
  await waitForDeepSelector(page, 'pm-entry-list-item')

  expect(await hasDeepSelector(page, '.status-context-summary')).toBe(true)
  expect(await hasDeepSelector(page, '.group-metrics-strip')).toBe(false)
  expect(await hasDocumentHorizontalOverflow(page)).toBe(false)
  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-credentials-selected-group', {
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

test('visual: mobile group edit dark', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture({authoredGroupDescription: true})
  await openPasswords(page, 'mobile', undefined, 390)
  await page.evaluate(() =>
    document.documentElement.style.setProperty('--app-runtime-safe-area-block-end-active', '24px'),
  )
  await setRootTheme(page, 'dark')

  try {
    await showFirstMobileGroupEdit(page)

    expect(await getMobileToolbarSubtitle(page)).toBeNull()
    expect(await page.locator('pm-group-edit-mobile .location-label').innerText()).toBe('LOCATION')
    expect(await hasDeepSelector(page, 'mobile-tab-bar')).toBe(false)
    expect(await hasDocumentHorizontalOverflow(page)).toBe(false)
    expect(await hasHorizontalOverflow(page, 'pm-group-edit-mobile')).toBe(false)
    const iconSelectorLayout = await page
      .locator('pm-group-edit-mobile button.icon-selector')
      .evaluate((button) => {
        const preview = button.querySelector('.icon-selector-preview')
        const section = button.closest('.icon-field')
        const scroller = button.closest('.edit-scroll')
        const buttonRect = button.getBoundingClientRect()
        const previewRect = preview?.getBoundingClientRect()
        const sectionRect = section?.getBoundingClientRect()
        const scrollerRect = scroller?.getBoundingClientRect()
        return {
          buttonWidth: Math.round(buttonRect.width),
          display: getComputedStyle(button).display,
          previewInset: previewRect ? Math.round(previewRect.left - buttonRect.left) : -1,
          sectionInset: sectionRect && scrollerRect ? Math.round(sectionRect.left - scrollerRect.left) : -1,
          sectionWidth: sectionRect ? Math.round(sectionRect.width) : -1,
        }
      })
    expect(iconSelectorLayout.display).toBe('flex')
    expect(iconSelectorLayout.previewInset).toBeLessThanOrEqual(13)
    expect(iconSelectorLayout.sectionInset).toBeLessThanOrEqual(16)
    expect(iconSelectorLayout.sectionWidth).toBeGreaterThan(300)
    expect(iconSelectorLayout.buttonWidth).toBeGreaterThanOrEqual(iconSelectorLayout.sectionWidth - 1)
    expect(
      await page
        .locator('pm-group-edit-mobile mobile-bottom-action-footer')
        .evaluate((element) => getComputedStyle(element).paddingBottom),
    ).toBe('24px')

    await assertVisualSnapshot(page, 'mobile-group-edit-dark-390', {
      suite: 'password-manager',
      viewport: {width: 390, height: 844},
    })
  } finally {
    await setRootTheme(page, 'light')
  }
})

test('visual: mobile group edit light compact', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture({authoredGroupDescription: true})
  await openPasswords(page, 'mobile', undefined, 360)
  await page.evaluate(() =>
    document.documentElement.style.setProperty('--app-runtime-safe-area-block-end-active', '24px'),
  )
  await showFirstMobileGroupEdit(page)

  expect(await page.locator('pm-group-edit-mobile .location-label').innerText()).toBe('LOCATION')
  expect(await hasDeepSelector(page, 'mobile-tab-bar')).toBe(false)
  expect(await hasDocumentHorizontalOverflow(page)).toBe(false)
  expect(await hasHorizontalOverflow(page, 'pm-group-edit-mobile')).toBe(false)
  expect(
    await page
      .locator('pm-group-edit-mobile mobile-bottom-action-footer')
      .evaluate((element) => getComputedStyle(element).paddingBottom),
  ).toBe('24px')

  await assertVisualSnapshot(page, 'mobile-group-edit-light-360', {
    suite: 'password-manager',
    viewport: {width: 360, height: 844},
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

test('visual: desktop create entry workbench', async (ctx) => {
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

test('visual: desktop create entry dark workbench', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop')
  await showCreateEntry(page, 'desktop')
  await setRootTheme(page, 'dark')

  expect(await hasDeepSelector(page, 'pm-entry-create-desktop')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-create-entry-dark', {
    suite: 'password-manager',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: desktop create entry compact workbench', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop')
  await showCreateEntry(page, 'desktop')
  await page.setViewportSize({width: 960, height: 1000})

  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-create-entry-compact-960', {
    suite: 'password-manager',
    viewport: {width: 960, height: 1000},
  })
})

test('visual: desktop create entry payment card workbench', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop')
  await showCreateEntry(page, 'desktop')
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

    deepFind(document, '.entry-type-switch')?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {value: 'payment_card'},
        bubbles: true,
        composed: true,
      }),
    )
  })
  await waitForDeepSelector(page, 'cv-input[name="cardNumber"]')

  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-create-entry-payment-card', {
    suite: 'password-manager',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: desktop create entry structured websites', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop')
  await showCreateEntry(page, 'desktop')
  await page.setViewportSize({width: 960, height: 1000})
  await configureCreateWebsiteEditor(page, 'populated')

  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)
  expect(await page.locator('pm-entry-website-editor details').count()).toBe(0)

  await assertVisualSnapshot(page, 'desktop-create-entry-structured-websites-960', {
    suite: 'password-manager',
    viewport: {width: 960, height: 1000},
    clipSelector: 'pm-entry-website-editor',
  })
  await revealCreateWebsiteActions(page)
  expect(await getCreateWebsiteActionOverlap(page)).toBe(0)
})

test('visual: desktop create entry advanced website matching compatibility', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop')
  await showCreateEntry(page, 'desktop')
  await page.setViewportSize({width: 960, height: 1000})
  await configureCreateWebsiteEditor(page, 'advanced')

  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)
  expect(await page.locator('pm-entry-website-editor details[open]').count()).toBe(1)

  await assertVisualSnapshot(page, 'desktop-create-entry-advanced-website-matching', {
    suite: 'password-manager',
    viewport: {width: 960, height: 1000},
    clipSelector: 'pm-entry-website-editor',
  })
})

test('visual: desktop create entry duplicate website error', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop')
  await showCreateEntry(page, 'desktop')
  await configureCreateWebsiteEditor(page, 'duplicate')

  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)
  expect(await page.locator('pm-entry-website-editor [slot="error"]').count()).toBe(1)

  await assertVisualSnapshot(page, 'desktop-create-entry-duplicate-website-error', {
    suite: 'password-manager',
    viewport: {width: 1280, height: 1000},
    clipSelector: 'pm-entry-website-editor',
  })
  await revealCreateWebsiteActions(page)
  expect(await getCreateWebsiteActionOverlap(page)).toBe(0)
})

test('visual: desktop entry structured website rules', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture({structuredWebsites: true})
  await openPasswords(page, 'desktop')
  await showVisualEntry(page, 'desktop', 4)

  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)
  expect(await page.locator('pm-entry .website-primary-marker').count()).toBe(1)
  expect(await page.locator('pm-entry .url-link cv-badge').count()).toBe(3)

  await assertVisualSnapshot(page, 'desktop-entry-structured-website-rules', {
    suite: 'password-manager',
    viewport: {width: 1280, height: 720},
    clipSelector: 'pm-entry',
  })
})

test('visual: desktop entry details workbench', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerTagSnippetFixture()
  await openPasswords(page, 'desktop')
  await showVisualEntry(page, 'desktop', 1, 'visual-tag-snippet')
  await waitForDeepSelector(page, '.entry-inspector')
  await waitForDeepSelector(page, '.password-input')
  await setRootTheme(page, 'light')

  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)
  expect(await page.locator('pm-entry .credential-field').count()).toBe(3)
  expect(await page.locator('pm-entry .entry-detail-row').count()).toBe(4)
  expect(await page.locator('pm-entry .entry-status').count()).toBe(2)

  await assertVisualSnapshot(page, 'desktop-entry-details-workbench-1280', {
    suite: 'password-manager',
    viewport: {width: 1280, height: 720},
    maxDiffRatio: 0.0005,
  })
})

test('visual: desktop entry details workbench dark', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerTagSnippetFixture()
  await openPasswords(page, 'desktop')
  await showVisualEntry(page, 'desktop', 1, 'visual-tag-snippet')
  await waitForDeepSelector(page, '.password-input')
  await setRootTheme(page, 'dark')

  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-entry-details-workbench-dark-1280', {
    suite: 'password-manager',
    viewport: {width: 1280, height: 720},
    maxDiffRatio: 0.0005,
  })
})

test('visual: desktop entry edit workbench dark', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture({positiveCredentialRisks: true})
  await openPasswords(page, 'desktop')
  await page.setViewportSize({width: 1280, height: 1000})
  await settleResponsiveLayout(page)
  await showVisualEntry(page, 'desktop', 1, 'visual-vpn')
  await waitForDeepSelector(page, '.password-input')
  const readUsernameBox = await page
    .locator('pm-entry .credential-field[data-field="username"] .field-value')
    .boundingBox()
  await page.locator("pm-entry .entry-primary-action[data-action='edit-entry']").click()
  await waitForDeepSelector(page, '.entry-edit-save-action')
  await waitForDeepSelector(page, "cv-input[name='inline-password']")
  await waitForDeepSelector(page, 'pm-entry-website-editor[presentation="workbench"]')
  await setRootTheme(page, 'dark')

  const editUsernameBox = await page.locator('pm-entry cv-input[name="inline-username"]').boundingBox()
  const editWebsiteBox = await page.locator('pm-entry-website-editor cv-input').first().boundingBox()

  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)
  expect(Math.abs((editUsernameBox?.x ?? 0) - (readUsernameBox?.x ?? 0))).toBeLessThanOrEqual(1)
  expect(
    Math.abs(
      ((editUsernameBox?.x ?? 0) + (editUsernameBox?.width ?? 0)) -
        ((editWebsiteBox?.x ?? 0) + (editWebsiteBox?.width ?? 0)),
    ),
  ).toBeLessThanOrEqual(1)
  expect(await page.locator('pm-entry .credential-field-editing').count()).toBe(3)
  expect(await page.locator('pm-entry [role="meter"]').count()).toBe(1)
  expect(await page.locator('pm-entry .generator-toggle-button').getAttribute('aria-expanded')).toBe('false')

  await assertVisualSnapshot(page, 'desktop-entry-edit-workbench-dark-1280', {
    suite: 'password-manager',
    viewport: {width: 1280, height: 1000},
    maxDiffRatio: 0,
  })
})

test('visual: desktop entry edit workbench compact with generator', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture({positiveCredentialRisks: true})
  await openPasswords(page, 'desktop')
  await showVisualEntry(page, 'desktop', 1, 'visual-vpn')
  await waitForDeepSelector(page, '.password-input')
  await page.setViewportSize({width: 840, height: 1500})
  await settleResponsiveLayout(page)
  const readUsernameBox = await page
    .locator('pm-entry .credential-field[data-field="username"] .field-value')
    .boundingBox()
  await page.locator("pm-entry .entry-primary-action[data-action='edit-entry']").click()
  await waitForDeepSelector(page, '.entry-edit-save-action')
  await page.locator('pm-entry .generator-toggle-button').click()
  await waitForDeepSelector(page, '.password-generator-panel-shell')
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

    type WebsiteEditorModel = {
      add(): string
      updateValue(rowId: string, value: string): void
    }

    const entry = deepFind(document, 'pm-entry') as
      | (HTMLElement & {model?: {websiteEditor?: WebsiteEditorModel}})
      | null
    const websiteEditor = entry?.model?.websiteEditor
    if (!websiteEditor) throw new Error('Entry website editor model was not available')

    const rowId = websiteEditor.add()
    websiteEditor.updateValue(rowId, 'https://backup.vpn.example.test')
  })
  await waitForDeepSelector(page, '.row.removable')
  await settleResponsiveLayout(page)

  const transitionWorkbenchWidth = await page
    .locator('pm-entry .entry-edit-workbench')
    .evaluate((workbench) => workbench.getBoundingClientRect().width)
  const transitionUsernameBox = await page.locator('pm-entry cv-input[name="inline-username"]').boundingBox()
  const transitionWebsiteBox = await page.locator('pm-entry-website-editor cv-input').first().boundingBox()

  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)
  expect(transitionWorkbenchWidth).toBeGreaterThanOrEqual(464)
  expect(transitionWorkbenchWidth).toBeLessThan(520)
  expect(Math.abs((transitionUsernameBox?.x ?? 0) - (readUsernameBox?.x ?? 0))).toBeLessThanOrEqual(1)
  expect(
    Math.abs(
      ((transitionUsernameBox?.x ?? 0) + (transitionUsernameBox?.width ?? 0)) -
        ((transitionWebsiteBox?.x ?? 0) + (transitionWebsiteBox?.width ?? 0)),
    ),
  ).toBeLessThanOrEqual(1)

  await page.setViewportSize({width: 820, height: 1500})
  await settleResponsiveLayout(page)

  const stackedWorkbenchWidth = await page
    .locator('pm-entry .entry-edit-workbench')
    .evaluate((workbench) => workbench.getBoundingClientRect().width)
  const stackedLabelBox = await page
    .locator('pm-entry .credential-field[data-field="username"] .field-label')
    .boundingBox()
  const stackedUsernameBox = await page.locator('pm-entry cv-input[name="inline-username"]').boundingBox()
  const stackedWebsiteBox = await page.locator('pm-entry-website-editor cv-input').first().boundingBox()

  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)
  expect(stackedWorkbenchWidth).toBeLessThan(466)
  expect(Math.abs((stackedUsernameBox?.x ?? 0) - (stackedLabelBox?.x ?? 0))).toBeLessThanOrEqual(1)
  expect(
    Math.abs(
      ((stackedUsernameBox?.x ?? 0) + (stackedUsernameBox?.width ?? 0)) -
        ((stackedWebsiteBox?.x ?? 0) + (stackedWebsiteBox?.width ?? 0)),
    ),
  ).toBeLessThanOrEqual(1)
  expect(await page.locator('pm-entry .generator-toggle-button').getAttribute('aria-expanded')).toBe('true')
  expect(await page.locator('pm-entry-website-editor .row').count()).toBe(2)

  await assertVisualSnapshot(page, 'desktop-entry-edit-workbench-compact-generator-820', {
    suite: 'password-manager',
    viewport: {width: 820, height: 1500},
    maxDiffRatio: 0,
  })
})

test('visual: desktop entry OTP label edit constrained', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture({positiveCredentialRisks: true})
  await openPasswords(page, 'desktop')
  await showVisualEntry(page, 'desktop', 1, 'visual-github')
  await waitForDeepSelector(page, '.password-input')
  await waitForDeepSelector(page, '.totp-digit')
  await page.setViewportSize({width: 840, height: 1350})
  await settleResponsiveLayout(page)
  await page.locator("pm-entry .entry-primary-action[data-action='edit-entry']").click()
  await waitForDeepSelector(page, "cv-input[data-otp-label-input='visual-github-otp']")
  await setRootTheme(page, 'dark')
  await settleResponsiveLayout(page)

  const [rowBox, otpBox, labelBox, cardBox, timerBox] = await Promise.all([
    page.locator('pm-entry .otp-label-edit-row').boundingBox(),
    page.locator('pm-entry .otp-label-edit-row > pm-entry-otp-item').boundingBox(),
    page.locator('pm-entry .otp-label-edit-row > cv-field').boundingBox(),
    page.locator('pm-entry-totp-item .totp-card').boundingBox(),
    page.locator('pm-entry-totp-item .totp-arc-timer').boundingBox(),
  ])
  if (!rowBox || !otpBox || !labelBox || !cardBox || !timerBox) {
    throw new Error('Constrained OTP editor geometry was not available')
  }

  const digitBoxes = await page.locator('pm-entry-totp-item .totp-digit').evaluateAll((digits) =>
    digits.map((digit) => {
      const box = digit.getBoundingClientRect()
      return {left: box.left, right: box.right}
    }),
  )

  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)
  expect(
    await page
      .locator("pm-entry cv-input[data-otp-label-input='visual-github-otp']")
      .evaluate((input: HTMLElement & {value: string}) => input.value),
  ).toBe('Primary')
  expect(digitBoxes).toHaveLength(6)
  expect(otpBox.y + otpBox.height).toBeLessThanOrEqual(labelBox.y + 1)
  expect(Math.abs(otpBox.x - labelBox.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(otpBox.width - labelBox.width)).toBeLessThanOrEqual(1)
  expect(otpBox.x).toBeGreaterThanOrEqual(rowBox.x - 1)
  expect(otpBox.x + otpBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1)
  for (const digitBox of digitBoxes) {
    expect(digitBox.left).toBeGreaterThanOrEqual(cardBox.x - 1)
    expect(digitBox.right).toBeLessThanOrEqual(timerBox.x + 1)
  }
  expect(timerBox.x + timerBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1)

  await assertVisualSnapshot(page, 'desktop-entry-otp-label-edit-840', {
    suite: 'password-manager',
    viewport: {width: 840, height: 1350},
    clipSelector: '.otp-label-edit-row',
    maxDiffRatio: 0.001,
  })
})

test('visual: desktop entry details workbench compact', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerTagSnippetFixture()
  await openPasswords(page, 'desktop')
  await showVisualEntry(page, 'desktop', 1, 'visual-tag-snippet')
  await waitForDeepSelector(page, '.password-input')
  await page.setViewportSize({width: 960, height: 1350})
  await settleResponsiveLayout(page)

  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-entry-details-workbench-compact-960', {
    suite: 'password-manager',
    viewport: {width: 960, height: 1350},
    maxDiffRatio: 0,
  })
})

test('visual: desktop payment card details workbench', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPaymentCardEntryFixture()
  await openPasswords(page, 'desktop')
  await showVisualEntry(page, 'desktop', 0, 'visual-card-details')
  await waitForDeepSelector(page, '.payment-card-face')
  await waitForDeepSelector(page, '.entry-inspector')

  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)
  expect(await page.locator('pm-entry .entry-status').count()).toBe(1)

  await assertVisualSnapshot(page, 'desktop-payment-card-details-workbench-1280', {
    suite: 'password-manager',
    viewport: {width: 1280, height: 720},
    maxDiffRatio: 0,
  })
})

test('visual: desktop entry single website hides primary marker', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop')
  await showVisualEntry(page, 'desktop', 1)

  expect(await page.locator('pm-entry .website-primary-marker').count()).toBe(0)

  await assertVisualSnapshot(page, 'desktop-entry-single-website', {
    suite: 'password-manager',
    viewport: {width: 1280, height: 720},
    clipSelector: '.urls-list',
  })
})

test('visual: mobile entry single website hides primary marker', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 390)
  await showVisualEntry(page, 'mobile', 1)

  expect(await page.locator('pm-entry-mobile .website-primary-marker').count()).toBe(0)
  await page.locator('pm-entry-mobile .website-list').scrollIntoViewIfNeeded()
  await settleResponsiveLayout(page)

  await assertVisualSnapshot(page, 'mobile-entry-single-website-390', {
    suite: 'password-manager',
    viewport: {width: 390, height: 844},
    clipSelector: '.website-list',
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

test('visual: mobile create entry multiple websites', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 390)
  await showCreateEntry(page, 'mobile')
  await configureCreateWebsiteEditor(page, 'populated')
  await revealCreateWebsiteActions(page)

  expect(await hasHorizontalOverflow(page, 'password-manager-mobile-layout')).toBe(false)
  expect(await page.locator('pm-entry-website-editor .remove-website').count()).toBe(1)
  expect(await page.locator('pm-entry-website-editor details').count()).toBe(0)

  await assertVisualSnapshot(page, 'mobile-create-entry-websites-390', {
    suite: 'password-manager',
    viewport: {width: 390, height: 844},
    clipSelector: 'pm-entry-website-editor',
  })
})

test('visual: mobile create entry advanced website matching compatibility', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 390)
  await showCreateEntry(page, 'mobile')
  await configureCreateWebsiteEditor(page, 'advanced')

  expect(await hasHorizontalOverflow(page, 'password-manager-mobile-layout')).toBe(false)
  expect(await page.locator('pm-entry-website-editor details[open]').count()).toBe(1)

  await assertVisualSnapshot(page, 'mobile-create-entry-advanced-website-matching-390', {
    suite: 'password-manager',
    viewport: {width: 390, height: 1200},
    clipSelector: 'pm-entry-website-editor',
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

test('visual: mobile create entry shared Tags picker dark theme', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 390)
  await showCreateEntry(page, 'mobile')
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

    const passmanager = (window as any).passmanager
    passmanager.credentialTags.set(['Work', 'Personal', 'Production', 'Security Audit', 'Rotate'])
    passmanager.credentialTagMeta.set({
      work: {colorId: 'orange'},
      personal: {colorId: 'pink'},
      production: {colorId: 'amber'},
      'security-audit': {colorId: 'cyan'},
      rotate: {colorId: 'violet'},
    })
    const create = deepFind(document, 'pm-entry-create-mobile') as
      | (HTMLElement & {model?: {setTags(tags: string[]): void}})
      | null
    create?.model?.setTags(['Work', 'Security Audit'])
  })
  await setRootTheme(page, 'dark')

  try {
    await openMobileCreateDetailsHub(page)
    await openMobileCreateDetail(page, 'tags')
    expect(await hasDeepSelector(page, 'pm-mobile-tag-picker')).toBe(true)
    expect(await hasHorizontalOverflow(page, 'password-manager-mobile-layout')).toBe(false)

    const state = await page.evaluate(() => {
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

      const picker = deepFind(document, 'pm-mobile-tag-picker') as HTMLElement | null
      const tagScroll = picker?.shadowRoot?.querySelector('.tag-scroll') as HTMLElement | null
      const detailsSheet = deepFind(document, 'pm-entry-create-details-sheet') as HTMLElement | null
      const bottomSheet = detailsSheet?.shadowRoot?.querySelector('cv-bottom-sheet') as HTMLElement | null
      const dialog = bottomSheet?.shadowRoot?.querySelector('cv-dialog') as HTMLElement | null
      const content = dialog?.shadowRoot?.querySelector('[part="content"]') as HTMLElement | null
      const body = dialog?.shadowRoot?.querySelector('[part="body"]') as HTMLElement | null
      const footer = dialog?.shadowRoot?.querySelector('[part="footer"]') as HTMLElement | null
      const doneButton = detailsSheet?.shadowRoot?.querySelector(
        '.sheet-actions cv-button:last-child',
      ) as HTMLElement | null
      const contentRect = content?.getBoundingClientRect()
      const bodyRect = body?.getBoundingClientRect()
      const pickerRect = picker?.getBoundingClientRect()
      const doneButtonRect = doneButton?.getBoundingClientRect()
      const globalSheet = deepFind(document, 'pm-mobile-tag-filter-sheet') as HTMLElement | null
      const globalBottomSheet = globalSheet?.shadowRoot?.querySelector('cv-bottom-sheet') as
        | (HTMLElement & {open?: boolean})
        | null
      return {
        chipCount: picker?.shadowRoot?.querySelectorAll('.tag-chip-wrap').length ?? 0,
        globalSheetOpen: Boolean(globalBottomSheet?.open),
        openSheetCount: countOpenSheets(document),
        pickerHeight: picker?.getBoundingClientRect().height ?? 0,
        scrollOverflowY: tagScroll ? getComputedStyle(tagScroll).overflowY : '',
        footerBottomGap:
          contentRect && doneButtonRect ? Math.round(contentRect.bottom - doneButtonRect.bottom) : -1,
        pickerBodyHeightDelta: bodyRect && pickerRect ? Math.abs(bodyRect.height - pickerRect.height) : -1,
        footerHeight: footer?.getBoundingClientRect().height ?? 0,
      }
    })

    expect(state.chipCount).toBe(5)
    expect(state.globalSheetOpen).toBe(false)
    expect(state.openSheetCount).toBe(1)
    expect(state.pickerHeight).toBeGreaterThan(300)
    expect(state.pickerBodyHeightDelta, JSON.stringify(state)).toBeLessThanOrEqual(1)
    expect(state.footerHeight, JSON.stringify(state)).toBeLessThan(100)
    expect(state.footerBottomGap, JSON.stringify(state)).toBeGreaterThanOrEqual(0)
    expect(state.footerBottomGap, JSON.stringify(state)).toBeLessThanOrEqual(24)
    expect(state.scrollOverflowY).toBe('auto')

    await assertVisualSnapshot(page, 'mobile-create-entry-tags-picker-dark-390', {
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
    const layout = await getMobileCreateNoteEditorLayout(page)
    expect(layout.actionCount, JSON.stringify(layout)).toBe(0)
    expect(layout.footerHeight, JSON.stringify(layout)).toBe(0)
    expect(layout.contentTop, JSON.stringify(layout)).toBeGreaterThanOrEqual(0)
    expect(layout.contentBottom, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewportHeight)
    expect(layout.titleTop, JSON.stringify(layout)).toBeGreaterThanOrEqual(0)
    expect(layout.titleBottom, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewportHeight)
    expect(layout.bodyTop, JSON.stringify(layout)).toBeGreaterThanOrEqual(layout.titleBottom)
    expect(layout.bodyBottom, JSON.stringify(layout)).toBeLessThanOrEqual(layout.contentBottom)
    expect(layout.editorTop, JSON.stringify(layout)).toBeGreaterThanOrEqual(layout.bodyTop)
    expect(layout.editorBottom, JSON.stringify(layout)).toBeLessThanOrEqual(layout.bodyBottom)
    expect(layout.textareaTop, JSON.stringify(layout)).toBeGreaterThanOrEqual(layout.editorTop)
    expect(layout.textareaBottom, JSON.stringify(layout)).toBeLessThanOrEqual(layout.editorBottom)

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
  expect(await hasDeepSelector(page, '.status-context-summary')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'pm-otp-quick-view')).toBe(false)
  expect(await hasHorizontalOverflow(page, 'status-bar')).toBe(false)

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
  expect(await hasDeepSelector(page, 'workspace-dashboard-header[surface="notes"]')).toBe(true)
  expect(await hasDeepSelector(page, 'status-bar')).toBe(true)
  expect(await hasDocumentHorizontalOverflow(page)).toBe(false)
  expect(await hasHorizontalOverflow(page, 'notes-quick-view')).toBe(false)
  expect(await hasHorizontalOverflow(page, 'status-bar')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-notes-quick-view', {
    suite: 'notes-quick-view',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: constrained desktop notes quick view', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualNotesFixture()
  await openNotes(page, 'desktop')
  await page.setViewportSize({width: 960, height: 720})
  await page
    .locator('workspace-dashboard-header[surface="notes"] cv-input.search-box')
    .evaluate((search: HTMLElement & {value: string}) => {
      search.value = 'Roadmap'
      search.dispatchEvent(
        new CustomEvent('cv-input', {
          detail: {value: 'Roadmap'},
          bubbles: true,
          composed: true,
        }),
      )
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

    return deepFind(document, '[data-summary-id="count"]')?.textContent?.includes('1 of 3 notes')
  })
  await settleResponsiveLayout(page)

  expect(await hasDeepSelector(page, 'notes-quick-view')).toBe(true)
  expect(await hasDeepSelector(page, 'workspace-dashboard-header[surface="notes"]')).toBe(true)
  expect(await hasDeepSelector(page, 'status-bar')).toBe(true)
  expect(await hasDocumentHorizontalOverflow(page)).toBe(false)
  expect(await hasHorizontalOverflow(page, 'notes-quick-view')).toBe(false)
  expect(await hasHorizontalOverflow(page, 'status-bar')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-notes-quick-view-960', {
    suite: 'notes-quick-view',
    viewport: {width: 960, height: 720},
  })
})

test('visual: desktop notes quick view empty dark', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualEmptyNotesFixture()
  await openNotes(page, 'desktop', undefined, 0)
  await setRootTheme(page, 'dark')

  expect(await hasDeepSelector(page, 'notes-quick-view')).toBe(true)
  expect(await hasDeepSelector(page, 'cv-empty-state')).toBe(true)
  expect(await hasDocumentHorizontalOverflow(page)).toBe(false)
  expect(await hasHorizontalOverflow(page, 'notes-quick-view')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-notes-quick-view-empty-dark', {
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

test('visual: mobile Markdown quick toolbar balanced at 430', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await openVisualMarkdownEditor(page, 430)
  await setRootTheme(page, 'light')

  expect(await hasDeepSelector(page, '.editor-quick-bar')).toBe(true)
  expect(await hasHorizontalOverflow(page, '.editor-quick-bar')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-markdown-quick-toolbar-430', {
    suite: 'notes-quick-view',
    viewport: {width: 430, height: 844},
    clipSelector: '.editor-quick-bar',
  })
})

test('visual: mobile Markdown quick toolbar compact dark at 360', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await openVisualMarkdownEditor(page, 360)
  await setRootTheme(page, 'dark')

  try {
    expect(await hasDeepSelector(page, '.editor-quick-bar')).toBe(true)
    expect(await hasHorizontalOverflow(page, '.editor-quick-bar')).toBe(false)

    await assertVisualSnapshot(page, 'mobile-markdown-quick-toolbar-360-dark', {
      suite: 'notes-quick-view',
      viewport: {width: 360, height: 844},
      clipSelector: '.editor-quick-bar',
    })
  } finally {
    await setRootTheme(page, 'light')
  }
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
