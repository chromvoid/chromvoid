import {expect, test} from 'vitest'

import type {Page} from 'playwright'
import type * as AppContextModule from '../../src/shared/services/app-context'

declare global {
  var __E2E_PAGE__: Page | undefined
}

function getPage(ctx: {skip: () => void}): Page | undefined {
  const page = globalThis.__E2E_PAGE__
  if (!page) ctx.skip()
  return page
}

// Chromium 149 can collect an evaluate result during Lit/Reatom's final mutation flush.
// Fixture mutations yield a frame; user actions use Playwright input after the splash.
async function waitForWelcomeInput(page: Page) {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('loading'), undefined, {
    timeout: 10_000,
  })
}

// Seed first-run and native safe-area state, then yield as described above.
async function openMobileFirstRun(page: Page, viewport: {width: number; height: number}) {
  await page.setViewportSize(viewport)
  await page.goto('http://localhost:4400/index.html?preview=welcome&layout=mobile', {
    waitUntil: 'domcontentloaded',
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

    return Boolean(deepFind(document, 'welcome-page-mobile-layout'))
  })

  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule

    getAppContext().state.update({NeedUserInitialization: true, StorageOpened: false})
    document.documentElement.style.setProperty('--app-runtime-safe-area-block-end-native', '24px')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
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

    const layout = deepFind(document, 'welcome-page-mobile-layout') as HTMLElement | null
    return Boolean(layout?.shadowRoot?.querySelector('.first-run-card'))
  })

  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

// Seed the locked-vault fixture, then yield before returning its evaluate result.
async function openMobileLockedVault(page: Page, viewport: {width: number; height: number}) {
  await page.setViewportSize(viewport)
  await page.goto('http://localhost:4400/index.html?preview=welcome&layout=mobile', {
    waitUntil: 'domcontentloaded',
  })

  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule

    getAppContext().state.update({NeedUserInitialization: false, StorageOpened: false})
    document.documentElement.style.setProperty('--app-runtime-safe-area-block-end-native', '24px')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
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

    const layout = deepFind(document, 'welcome-page-mobile-layout') as HTMLElement | null
    const setup = layout?.shadowRoot?.querySelector('welcome-setup-section')
    const setupRoot = setup?.shadowRoot
    return Boolean(
      layout?.shadowRoot?.querySelector('.locked-vault') &&
      setupRoot?.querySelector('[control-id="welcome.unlock-password"]') &&
      setupRoot?.querySelector('#welcome\\.unlock-submit'),
    )
  })

  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

async function readLockedVaultGeometry(page: Page) {
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

    const route = deepFind(document, '[data-testid="app-root"]') as HTMLElement | null
    const layout = deepFind(document, 'welcome-page-mobile-layout') as HTMLElement | null
    const locked = layout?.shadowRoot?.querySelector<HTMLElement>('.locked-vault')
    const mainCard = layout?.shadowRoot?.querySelector<HTMLElement>('.main-card')
    const hero = layout?.shadowRoot?.querySelector<HTMLElement>('welcome-hero-section')
    const heroIcon = hero?.shadowRoot?.querySelector<HTMLElement>('.hero-icon-shell')
    const task = layout?.shadowRoot?.querySelector<HTMLElement>('.welcome-task')
    const tools = layout?.shadowRoot?.querySelector<HTMLElement>('welcome-tools-section')
    const setup = layout?.shadowRoot?.querySelector<HTMLElement>('welcome-setup-section')
    const setupRoot = setup?.shadowRoot
    const inputHost = setupRoot?.querySelector<HTMLElement>('[control-id="welcome.unlock-password"]')
    const nativeInput = inputHost?.shadowRoot?.querySelector('input')
    const submit = setupRoot?.querySelector<HTMLButtonElement>('#welcome\\.unlock-submit')
    const technicalAlert = layout?.shadowRoot?.querySelector<HTMLElement>('cv-callout[variant="danger"]')
    if (
      !route ||
      !locked ||
      !mainCard ||
      !hero ||
      !heroIcon ||
      !task ||
      !tools ||
      !inputHost ||
      !nativeInput ||
      !submit
    ) {
      throw new Error('Locked-vault geometry is unavailable')
    }

    const lockedRect = locked.getBoundingClientRect()
    const mainCardRect = mainCard.getBoundingClientRect()
    const heroRect = hero.getBoundingClientRect()
    const heroIconRect = heroIcon.getBoundingClientRect()
    const taskRect = task.getBoundingClientRect()
    const toolsRect = tools.getBoundingClientRect()
    const inputRect = inputHost.getBoundingClientRect()
    const submitRect = submit.getBoundingClientRect()
    const technicalAlertRect = technicalAlert?.getBoundingClientRect()
    const styles = getComputedStyle(locked)
    const keyboardOffset = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--app-runtime-keyboard-overlay-offset'),
    )

    return {
      inputBottom: inputRect.bottom,
      inputFocused:
        setupRoot?.activeElement === inputHost && inputHost.shadowRoot?.activeElement === nativeInput,
      inputInvalid: inputHost.hasAttribute('invalid'),
      inputRequired: inputHost.hasAttribute('aria-required'),
      inputSize: inputHost.getAttribute('size'),
      inputTop: inputRect.top,
      inputFontSize: Number.parseFloat(getComputedStyle(nativeInput).fontSize),
      keyboardOffset: Number.isFinite(keyboardOffset) ? keyboardOffset : 0,
      heroBottom: heroRect.bottom,
      heroIconHeight: heroIconRect.height,
      heroIconWidth: heroIconRect.width,
      heroLeft: heroRect.left,
      heroRight: heroRect.right,
      lockedBottom: lockedRect.bottom,
      lockedClientHeight: locked.clientHeight,
      lockedLeft: lockedRect.left,
      lockedRight: lockedRect.right,
      lockedScrollHeight: locked.scrollHeight,
      lockedScrollTop: locked.scrollTop,
      lockedTop: lockedRect.top,
      mainCardBottom: mainCardRect.bottom,
      mainCardLeft: mainCardRect.left,
      mainCardRight: mainCardRect.right,
      mainCardTop: mainCardRect.top,
      overscrollBehaviorY: styles.overscrollBehaviorY,
      pendingSpinnerPresent: Boolean(submit.querySelector('.welcome-primary-spinner')),
      promptPresent: Boolean(setupRoot?.querySelector('#welcome\\.unlock')),
      routeClientHeight: route.clientHeight,
      routeScrollHeight: route.scrollHeight,
      scrollPaddingBottom: Number.parseFloat(styles.scrollPaddingBottom),
      sheetPresent: Boolean(setupRoot?.querySelector('cv-bottom-sheet.unlock-sheet')),
      submitAriaBusy: submit.getAttribute('aria-busy'),
      submitBottom: submitRect.bottom,
      submitHeight: submitRect.height,
      submitDisabled: submit.disabled,
      submitTop: submitRect.top,
      taskBottom: taskRect.bottom,
      taskLeft: taskRect.left,
      taskRight: taskRect.right,
      taskTop: taskRect.top,
      technicalAlertBottom: technicalAlertRect?.bottom ?? null,
      technicalAlertTop: technicalAlertRect?.top ?? null,
      toolsBottom: toolsRect.bottom,
      toolsLeft: toolsRect.left,
      toolsRight: toolsRect.right,
      toolsTop: toolsRect.top,
      tabletViewport: locked.hasAttribute('data-tablet-viewport'),
      viewportProfile: locked.dataset['viewportProfile'],
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }
  })
}

async function readFirstRunGeometry(page: Page) {
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

    const route = deepFind(document, '[data-testid="app-root"]') as HTMLElement | null
    const layout = deepFind(document, 'welcome-page-mobile-layout') as HTMLElement | null
    const container = layout?.shadowRoot?.querySelector<HTMLElement>('.container')
    const mainCard = layout?.shadowRoot?.querySelector<HTMLElement>('.main-card')
    const hero = layout?.shadowRoot?.querySelector<HTMLElement>('welcome-hero-section')
    const task = layout?.shadowRoot?.querySelector<HTMLElement>('.welcome-task')
    const tools = layout?.shadowRoot?.querySelector<HTMLElement>('welcome-tools-section')
    const button = tools?.shadowRoot?.querySelector<HTMLElement>('.mobile-utilities-button')
    if (!route || !container || !mainCard || !hero || !task || !tools || !button) {
      throw new Error('First-run layout geometry is unavailable')
    }

    const routeRect = route.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const mainCardRect = mainCard.getBoundingClientRect()
    const heroRect = hero.getBoundingClientRect()
    const taskRect = task.getBoundingClientRect()
    const toolsRect = tools.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()

    return {
      buttonBottom: buttonRect.bottom,
      buttonTop: buttonRect.top,
      containerBottom: containerRect.bottom,
      containerLeft: containerRect.left,
      containerRight: containerRect.right,
      footerClearance: containerRect.bottom - buttonRect.bottom,
      heroBottom: heroRect.bottom,
      heroLeft: heroRect.left,
      heroRight: heroRect.right,
      mainCardBottom: mainCardRect.bottom,
      mainCardLeft: mainCardRect.left,
      mainCardRight: mainCardRect.right,
      mainCardTop: mainCardRect.top,
      routeClientHeight: route.clientHeight,
      routeScrollHeight: route.scrollHeight,
      routeTop: routeRect.top,
      taskLeft: taskRect.left,
      taskRight: taskRect.right,
      taskTop: taskRect.top,
      toolsBottom: toolsRect.bottom,
      toolsLeft: toolsRect.left,
      toolsRight: toolsRect.right,
      toolsTop: toolsRect.top,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      viewportProfile: container.dataset['viewportProfile'],
      tabletViewport: container.hasAttribute('data-tablet-viewport'),
    }
  })
}

// Native keyboard delivery has no browser input equivalent; yield within the mutating evaluate.
async function applyIOSKeyboardTransition(
  page: Page,
  payload: {visible: boolean; bottomInset: number; phase: 'progress' | 'settled'},
) {
  await page.evaluate(async (keyboardPayload) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<{
      applyMobileKeyboardVisibilityPayload: (root: HTMLElement, payload: Record<string, unknown>) => void
    }>
    const {applyMobileKeyboardVisibilityPayload} = await dynamicImport(
      '/app/bootstrap/mobile-keyboard-insets.ts',
    )
    applyMobileKeyboardVisibilityPayload(document.documentElement, {
      ...keyboardPayload,
      safeAreaTopInset: 59,
      safeAreaBottomInset: 34,
      source: 'ios-native',
      viewportMode: 'native-resize',
    })
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }, payload)

  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

// Use a trusted pointer to focus the rendered input; see waitForWelcomeInput.
async function focusUnlockInput(page: Page) {
  await waitForWelcomeInput(page)
  await page.locator('welcome-setup-section [control-id="welcome.unlock-password"] input').click()
}

// Open the sheet through its real button after the splash releases input.
async function openCreateStorageSheet(page: Page) {
  await waitForWelcomeInput(page)
  await page.locator('welcome-setup-section [data-create-storage] button').click()

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

    const setupSection = deepFind(document, 'welcome-setup-section') as HTMLElement | null
    return setupSection?.shadowRoot
      ?.querySelector('cv-bottom-sheet.create-storage-sheet')
      ?.hasAttribute('open')
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

    const setupSection = deepFind(document, 'welcome-setup-section') as HTMLElement | null
    const sheet = setupSection?.shadowRoot?.querySelector(
      'cv-bottom-sheet.create-storage-sheet',
    ) as HTMLElement | null
    const dialog = sheet?.shadowRoot?.querySelector('cv-dialog') as HTMLElement | null
    const content = dialog?.shadowRoot?.querySelector('[part="content"]') as HTMLElement | null
    return content ? getComputedStyle(content).transform === 'matrix(1, 0, 0, 1, 0, 0)' : false
  })
}

async function readCreateStorageSheetGeometry(page: Page) {
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

    const setupSection = deepFind(document, 'welcome-setup-section') as HTMLElement | null
    const setupRoot = setupSection?.shadowRoot
    const sheet = setupRoot?.querySelector('cv-bottom-sheet.create-storage-sheet') as HTMLElement | null
    const dialog = sheet?.shadowRoot?.querySelector('cv-dialog') as HTMLElement | null
    const content = dialog?.shadowRoot?.querySelector('[part="content"]') as HTMLElement | null
    const body = dialog?.shadowRoot?.querySelector('[part="body"]') as HTMLElement | null
    const confirmHost = setupRoot?.querySelector('#welcome-confirm-master-password') as HTMLElement | null
    const confirmInput = confirmHost?.shadowRoot?.querySelector('input') as HTMLInputElement | null
    const submit = setupRoot?.querySelector('#welcome\\.create-storage') as HTMLElement | null
    if (!content || !body || !confirmHost || !confirmInput || !submit) {
      throw new Error('Create Storage sheet geometry is unavailable')
    }

    const contentRect = content.getBoundingClientRect()
    const bodyRect = body.getBoundingClientRect()
    const submitRect = submit.getBoundingClientRect()
    const visualViewport = window.visualViewport
    const visibleTop = visualViewport?.offsetTop ?? 0
    const visibleBottom = visibleTop + (visualViewport?.height ?? window.innerHeight)
    const safeTop = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--app-runtime-safe-area-block-start'),
    )
    const overlayOffset = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--app-runtime-keyboard-overlay-offset'),
    )

    return {
      bodyBottom: bodyRect.bottom,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      bodyScrollTop: body.scrollTop,
      bodyTop: bodyRect.top,
      confirmFocused:
        setupRoot?.activeElement === confirmHost && confirmHost.shadowRoot?.activeElement === confirmInput,
      contentBottom: contentRect.bottom,
      nativeResize: document.documentElement.hasAttribute('data-mobile-keyboard-native-resize'),
      overlayOffset: Number.isFinite(overlayOffset) ? overlayOffset : 0,
      safeTop: Number.isFinite(safeTop) ? safeTop : 0,
      submitBottom: submitRect.bottom,
      submitTop: submitRect.top,
      visibleBottom,
      visibleTop,
    }
  })
}

test.each([
  {height: 844, width: 390},
  {height: 640, width: 360},
])('mobile first-run keeps Device utilities visible at $width×$height', async (viewport, ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await openMobileFirstRun(page, viewport)
  const geometry = await readFirstRunGeometry(page)

  expect(geometry.viewportProfile).toBe(viewport.height <= 700 ? 'compact' : 'regular')
  expect(geometry.routeScrollHeight).toBeLessThanOrEqual(geometry.routeClientHeight + 1)
  expect(geometry.buttonTop).toBeGreaterThanOrEqual(geometry.routeTop)
  expect(geometry.buttonBottom).toBeLessThanOrEqual(geometry.viewportHeight)
  expect(geometry.footerClearance).toBeGreaterThanOrEqual(40)
})

test.each([
  {height: 1180, width: 820},
  {height: 820, width: 1180},
])('iPad first-run uses a balanced task layout at $width×$height', async (viewport, ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await openMobileFirstRun(page, viewport)
  const geometry = await readFirstRunGeometry(page)

  expect(geometry.tabletViewport).toBe(true)
  expect(geometry.viewportProfile).toBe('regular')
  expect(geometry.routeScrollHeight).toBeLessThanOrEqual(geometry.routeClientHeight + 1)
  expect(geometry.mainCardLeft).toBeGreaterThanOrEqual(0)
  expect(geometry.mainCardRight).toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.mainCardTop).toBeGreaterThanOrEqual(0)
  expect(geometry.mainCardBottom).toBeLessThanOrEqual(geometry.viewportHeight)
  expect(geometry.mainCardRight - geometry.mainCardLeft).toBeLessThanOrEqual(561)
  expect(geometry.heroLeft).toBeGreaterThanOrEqual(geometry.mainCardLeft)
  expect(geometry.heroRight).toBeLessThanOrEqual(geometry.mainCardRight)
  expect(geometry.taskLeft).toBeGreaterThanOrEqual(geometry.mainCardLeft)
  expect(geometry.taskRight).toBeLessThanOrEqual(geometry.mainCardRight)
  expect(geometry.taskTop).toBeGreaterThanOrEqual(geometry.heroBottom)
  expect(geometry.toolsTop).toBeGreaterThanOrEqual(geometry.mainCardBottom)
  expect(geometry.toolsBottom).toBeLessThanOrEqual(geometry.viewportHeight)
  expect(geometry.toolsRight - geometry.toolsLeft).toBeLessThanOrEqual(561)
  expect(
    Math.abs(
      (geometry.mainCardLeft + geometry.mainCardRight) / 2 -
        (geometry.containerLeft + geometry.containerRight) / 2,
    ),
  ).toBeLessThanOrEqual(1)
})

test.each([
  {height: 844, width: 390},
  {height: 640, width: 360},
])('mobile locked vault exposes its inline form at $width×$height', async (viewport, ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await openMobileLockedVault(page, viewport)
  const geometry = await readLockedVaultGeometry(page)

  expect(geometry.promptPresent).toBe(false)
  expect(geometry.sheetPresent).toBe(false)
  expect(geometry.inputFocused).toBe(false)
  expect(geometry.inputInvalid).toBe(false)
  expect(geometry.inputRequired).toBe(false)
  expect(geometry.inputSize).toBe('large')
  expect(geometry.inputFontSize).toBeGreaterThanOrEqual(16)
  expect(geometry.viewportProfile).toBe(viewport.height <= 700 ? 'compact' : 'regular')
  expect(geometry.submitDisabled).toBe(false)
  expect(geometry.lockedTop).toBeGreaterThanOrEqual(0)
  expect(geometry.lockedBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1)
  expect(geometry.inputTop).toBeGreaterThanOrEqual(geometry.lockedTop)
  expect(geometry.inputBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1)
  expect(geometry.submitTop).toBeGreaterThanOrEqual(geometry.lockedTop)
  expect(geometry.submitBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1)
  expect(geometry.routeScrollHeight).toBeLessThanOrEqual(geometry.routeClientHeight + 1)
  expect(geometry.overscrollBehaviorY).toBe('contain')
  expect(geometry.scrollPaddingBottom).toBeGreaterThan(0)
})

test.each([
  {height: 1180, width: 820},
  {height: 820, width: 1180},
])('iPad locked vault keeps unlock action visible at $width×$height', async (viewport, ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await openMobileLockedVault(page, viewport)
  const geometry = await readLockedVaultGeometry(page)

  expect(geometry.promptPresent).toBe(false)
  expect(geometry.sheetPresent).toBe(false)
  expect(geometry.submitDisabled).toBe(false)
  expect(geometry.tabletViewport).toBe(true)
  expect(geometry.viewportProfile).toBe('regular')
  expect(geometry.routeScrollHeight).toBeLessThanOrEqual(geometry.routeClientHeight + 1)
  expect(geometry.mainCardLeft).toBeGreaterThanOrEqual(0)
  expect(geometry.mainCardRight).toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.mainCardTop).toBeGreaterThanOrEqual(0)
  expect(geometry.mainCardBottom).toBeLessThanOrEqual(geometry.viewportHeight)
  expect(geometry.mainCardRight - geometry.mainCardLeft).toBeLessThanOrEqual(561)
  expect(geometry.heroLeft).toBeGreaterThanOrEqual(geometry.mainCardLeft)
  expect(geometry.heroRight).toBeLessThanOrEqual(geometry.mainCardRight)
  expect(geometry.taskLeft).toBeGreaterThanOrEqual(geometry.mainCardLeft)
  expect(geometry.taskRight).toBeLessThanOrEqual(geometry.mainCardRight)
  expect(geometry.taskTop).toBeGreaterThanOrEqual(geometry.heroBottom)
  expect(geometry.submitTop).toBeGreaterThanOrEqual(geometry.taskTop)
  expect(geometry.submitBottom).toBeLessThanOrEqual(geometry.taskBottom)
  expect(geometry.toolsTop).toBeGreaterThanOrEqual(geometry.mainCardBottom)
  expect(geometry.toolsBottom).toBeLessThanOrEqual(geometry.viewportHeight)
  expect(geometry.toolsRight - geometry.toolsLeft).toBeLessThanOrEqual(561)
  expect(
    Math.abs(
      (geometry.mainCardLeft + geometry.mainCardRight) / 2 - (geometry.lockedLeft + geometry.lockedRight) / 2,
    ),
  ).toBeLessThanOrEqual(1)
})

test.each([
  {
    viewport: {width: 390, height: 844},
    visualViewportHeights: [700, 620, 522],
    expectedProfile: 'regular',
  },
  {
    viewport: {width: 360, height: 640},
    visualViewportHeights: [600, 520, 420],
    expectedProfile: 'compact',
  },
])(
  'mobile locked vault keeps its $expectedProfile layout through repeated iOS keyboard transitions',
  async ({viewport, visualViewportHeights, expectedProfile}, ctx) => {
    const page = getPage(ctx)
    if (!page) return

    await openMobileLockedVault(page, viewport)
    const baseline = await readLockedVaultGeometry(page)
    expect(baseline.viewportProfile).toBe(expectedProfile)

    const expectStableComposition = async () => {
      const geometry = await readLockedVaultGeometry(page)
      expect(geometry.viewportProfile).toBe(expectedProfile)
      expect(geometry.heroIconWidth).toBeCloseTo(baseline.heroIconWidth, 0)
      expect(geometry.heroIconHeight).toBeCloseTo(baseline.heroIconHeight, 0)
      expect(geometry.submitHeight).toBeCloseTo(baseline.submitHeight, 0)
      expect(geometry.inputSize).toBe('large')
      expect(geometry.inputFontSize).toBeGreaterThanOrEqual(16)
    }

    await applyIOSKeyboardTransition(page, {visible: true, bottomInset: 302, phase: 'progress'})
    await focusUnlockInput(page)
    for (const height of visualViewportHeights) {
      await applyIOSKeyboardTransition(page, {
        visible: true,
        bottomInset: viewport.height - height,
        phase: 'progress',
      })
      await expectStableComposition()
    }

    const settledInset = viewport.height - (visualViewportHeights.at(-1) ?? viewport.height)
    await applyIOSKeyboardTransition(page, {visible: true, bottomInset: settledInset, phase: 'settled'})
    await expectStableComposition()

    await applyIOSKeyboardTransition(page, {visible: false, bottomInset: 0, phase: 'progress'})
    await applyIOSKeyboardTransition(page, {visible: false, bottomInset: 0, phase: 'settled'})
    await expectStableComposition()

    await applyIOSKeyboardTransition(page, {visible: true, bottomInset: settledInset, phase: 'progress'})
    await applyIOSKeyboardTransition(page, {visible: true, bottomInset: settledInset, phase: 'settled'})
    await expectStableComposition()
  },
)

test('mobile locked vault keeps technical errors separate and exposes pending state', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await openMobileLockedVault(page, {width: 360, height: 640})

  // Fill through the real control; inject only the technical-error fixture state.
  await waitForWelcomeInput(page)
  await page
    .locator('welcome-setup-section [control-id="welcome.unlock-password"] input')
    .fill('vault-password')
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

    const layout = deepFind(document, 'welcome-page-mobile-layout') as
      | (HTMLElement & {
          model?: {
            setup: {
              shared: {setError(message: string): void}
            }
          }
        })
      | null
    if (!layout?.model) throw new Error('Welcome model is unavailable')

    layout.model.setup.shared.setError('Technical unlock error')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
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

    const layout = deepFind(document, 'welcome-page-mobile-layout') as HTMLElement | null
    return Boolean(layout?.shadowRoot?.querySelector('cv-callout[variant="danger"]'))
  })

  const technicalGeometry = await readLockedVaultGeometry(page)
  expect(technicalGeometry.inputInvalid).toBe(false)
  expect(technicalGeometry.inputRequired).toBe(false)
  expect(technicalGeometry.technicalAlertTop).not.toBeNull()
  expect(technicalGeometry.technicalAlertBottom).toBeLessThanOrEqual(technicalGeometry.lockedBottom + 1)

  // Pending presentation is a model fixture; yield past its Lit/Reatom updates.
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
    if (!layout?.model) throw new Error('Welcome model is unavailable')
    layout.model.setup.setupInProgress.set(true)
    layout.model.setup.icon.active()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
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

    const setup = deepFind(document, 'welcome-setup-section') as HTMLElement | null
    return setup?.shadowRoot?.querySelector('#welcome\\.unlock-submit')?.getAttribute('aria-busy') === 'true'
  })

  const pendingGeometry = await readLockedVaultGeometry(page)
  expect(pendingGeometry.submitAriaBusy).toBe('true')
  expect(pendingGeometry.submitDisabled).toBe(true)
  expect(pendingGeometry.pendingSpinnerPresent).toBe(true)
})

test('mobile locked vault scrolls input, submit, and alerts clear of an overlay keyboard', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await openMobileLockedVault(page, {width: 390, height: 844})
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

    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<{
      applyMobileKeyboardInsetsPayload: (root: HTMLElement, payload: Record<string, unknown>) => void
    }>
    const {applyMobileKeyboardInsetsPayload} = await dynamicImport('/app/bootstrap/mobile-keyboard-insets.ts')
    applyMobileKeyboardInsetsPayload(document.documentElement, {
      visible: true,
      bottomInset: 360,
      safeAreaTopInset: 24,
      safeAreaBottomInset: 24,
      phase: 'settled',
      source: 'ios-native',
      viewportMode: 'overlay',
    })

    const layout = deepFind(document, 'welcome-page-mobile-layout') as
      | (HTMLElement & {
          model?: {
            setup: {
              shared: {setError(message: string): void}
            }
          }
        })
      | null
    const setup = layout?.shadowRoot?.querySelector<HTMLElement>('welcome-setup-section')
    const locked = layout?.shadowRoot?.querySelector<HTMLElement>('.locked-vault')
    const inputHost = setup?.shadowRoot?.querySelector<HTMLElement>('[control-id="welcome.unlock-password"]')
    const input = inputHost?.shadowRoot?.querySelector('input')
    if (!(input instanceof HTMLInputElement) || !locked || !layout?.model) {
      throw new Error('Unlock input or model is unavailable')
    }

    layout.model.setup.shared.setError('Technical unlock error')
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    input.focus()
    locked.scrollTop = locked.scrollHeight
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })

  const focusedGeometry = await readLockedVaultGeometry(page)
  const visibleBottom = focusedGeometry.viewportHeight - focusedGeometry.keyboardOffset
  expect(focusedGeometry.keyboardOffset).toBe(360)
  expect(focusedGeometry.inputFocused).toBe(true)
  expect(focusedGeometry.inputTop).toBeGreaterThanOrEqual(focusedGeometry.lockedTop)
  expect(focusedGeometry.inputBottom).toBeLessThanOrEqual(visibleBottom + 1)
  expect(focusedGeometry.lockedScrollHeight).toBeGreaterThan(focusedGeometry.lockedClientHeight)
  expect(focusedGeometry.scrollPaddingBottom).toBeGreaterThanOrEqual(376)

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

    const setup = deepFind(document, 'welcome-setup-section') as HTMLElement | null
    const submit = setup?.shadowRoot?.querySelector<HTMLElement>('#welcome\\.unlock-submit')
    if (!submit) throw new Error('Unlock submit is unavailable')
    submit.scrollIntoView({block: 'end'})
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })

  const submitGeometry = await readLockedVaultGeometry(page)
  expect(submitGeometry.lockedScrollTop).toBeGreaterThan(0)
  expect(submitGeometry.submitTop).toBeGreaterThanOrEqual(submitGeometry.lockedTop)
  expect(submitGeometry.submitBottom).toBeLessThanOrEqual(visibleBottom + 1)

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

    const layout = deepFind(document, 'welcome-page-mobile-layout') as HTMLElement | null
    const alert = layout?.shadowRoot?.querySelector<HTMLElement>('cv-callout[variant="danger"]')
    if (!alert) throw new Error('Technical unlock alert is unavailable')
    alert.scrollIntoView({block: 'nearest'})
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })

  const alertGeometry = await readLockedVaultGeometry(page)
  expect(alertGeometry.technicalAlertTop).toBeGreaterThanOrEqual(alertGeometry.lockedTop)
  expect(alertGeometry.technicalAlertBottom).toBeLessThanOrEqual(visibleBottom + 1)
})

test('mobile Create Storage sheet stays above an overlay keyboard with a reachable action', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await openMobileFirstRun(page, {width: 390, height: 844})
  await openCreateStorageSheet(page)
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

    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<{
      applyMobileKeyboardInsetsPayload: (root: HTMLElement, payload: Record<string, unknown>) => void
    }>
    const {applyMobileKeyboardInsetsPayload} = await dynamicImport('/app/bootstrap/mobile-keyboard-insets.ts')
    applyMobileKeyboardInsetsPayload(document.documentElement, {
      visible: true,
      bottomInset: 424,
      safeAreaTopInset: 24,
      safeAreaBottomInset: 24,
      phase: 'settled',
      source: 'ios-native',
      viewportMode: 'overlay',
    })

    const setupSection = deepFind(document, 'welcome-setup-section') as HTMLElement | null
    const confirmHost = setupSection?.shadowRoot?.querySelector(
      '#welcome-confirm-master-password',
    ) as HTMLElement | null
    const confirmInput = confirmHost?.shadowRoot?.querySelector('input')
    if (!(confirmInput instanceof HTMLInputElement)) {
      throw new Error('Confirm master-password input is unavailable')
    }
    confirmInput.focus()
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
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

    const setupSection = deepFind(document, 'welcome-setup-section') as HTMLElement | null
    const sheet = setupSection?.shadowRoot?.querySelector(
      'cv-bottom-sheet.create-storage-sheet',
    ) as HTMLElement | null
    const dialog = sheet?.shadowRoot?.querySelector('cv-dialog') as HTMLElement | null
    const overlay = dialog?.shadowRoot?.querySelector('[part="overlay"]') as HTMLElement | null
    return overlay ? new DOMMatrix(getComputedStyle(overlay).transform).m42 <= -423 : false
  })

  const beforeScroll = await readCreateStorageSheetGeometry(page)
  expect(beforeScroll.nativeResize).toBe(false)
  expect(beforeScroll.overlayOffset).toBe(424)
  expect(beforeScroll.confirmFocused).toBe(true)
  expect(beforeScroll.bodyTop).toBeGreaterThanOrEqual(beforeScroll.visibleTop + beforeScroll.safeTop - 1)
  expect(beforeScroll.contentBottom).toBeLessThanOrEqual(
    beforeScroll.visibleBottom - beforeScroll.overlayOffset + 1,
  )
  expect(beforeScroll.submitTop).toBeGreaterThanOrEqual(beforeScroll.bodyTop - 1)
  expect(beforeScroll.bodyScrollHeight).toBeGreaterThan(beforeScroll.bodyClientHeight)

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

    const setupSection = deepFind(document, 'welcome-setup-section') as HTMLElement | null
    const sheet = setupSection?.shadowRoot?.querySelector(
      'cv-bottom-sheet.create-storage-sheet',
    ) as HTMLElement | null
    const dialog = sheet?.shadowRoot?.querySelector('cv-dialog') as HTMLElement | null
    const body = dialog?.shadowRoot?.querySelector('[part="body"]') as HTMLElement | null
    if (!body) throw new Error('Create Storage scroll body is unavailable')
    body.scrollTop = body.scrollHeight
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })

  const afterScroll = await readCreateStorageSheetGeometry(page)
  if (beforeScroll.bodyScrollHeight > beforeScroll.bodyClientHeight + 1) {
    expect(afterScroll.bodyScrollTop).toBeGreaterThan(0)
  } else {
    expect(afterScroll.bodyScrollTop).toBe(0)
  }
  expect(afterScroll.submitTop).toBeGreaterThanOrEqual(afterScroll.bodyTop - 1)
  expect(afterScroll.submitBottom).toBeLessThanOrEqual(
    Math.min(afterScroll.bodyBottom, afterScroll.visibleBottom - afterScroll.overlayOffset) + 1,
  )
})
