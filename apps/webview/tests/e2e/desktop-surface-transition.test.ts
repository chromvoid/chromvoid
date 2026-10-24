import {expect, test} from 'vitest'

import {waitForAuthenticated, waitForCatalogReady} from './utils'

import type {Page} from 'playwright'

declare global {
  var __E2E_PAGE__: Page | undefined
}

// Trusted input avoids Chromium 149 collecting an evaluate result during the navigation's updates.
async function openNavigationItem(page: Page, label: string): Promise<void> {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('loading'), undefined, {
    timeout: 10_000,
  })
  const handle = await page.evaluateHandle((nextLabel) => {
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
    return button
  }, label)
  try {
    await handle.asElement()!.click()
  } finally {
    await handle.dispose()
  }
}

async function waitForDeepSelector(page: Page, selector: string): Promise<void> {
  await page.waitForFunction(
    (nextSelector) => {
      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const element of root.querySelectorAll('*')) {
          if (!element.shadowRoot) continue
          const nested = deepFind(element.shadowRoot, selector)
          if (nested) return nested
        }
        return null
      }

      return Boolean(deepFind(document, nextSelector))
    },
    selector,
    {timeout: 10_000},
  )
}

async function installDesktopSurfaceTransitionProbe(
  page: Page,
  forceElementScopedUnsupported = false,
): Promise<void> {
  await page.evaluate((disableElementScoped) => {
    function deepFind<T extends Element = Element>(
      root: Document | ShadowRoot | Element | null | undefined,
      selector: string,
    ): T | null {
      if (!root) return null
      const found = root.querySelector<T>(selector)
      if (found) return found
      if (root instanceof Element && root.shadowRoot) {
        const inner = deepFind<T>(root.shadowRoot, selector)
        if (inner) return inner
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind<T>(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }

    const desktopLayout = deepFind(document, '[data-testid="shell-desktop"]')
    const navigationRail = deepFind(document, 'navigation-rail')
    const surfaceContent = deepFind(desktopLayout, '[data-testid="shell-content"]') as
      | (HTMLElement & {
          startViewTransition?: (options: Record<string, any>) => {
            ready: Promise<void>
            updateCallbackDone: Promise<void>
            finished: Promise<void>
          }
        })
      | null
    const nativeDocumentStart = document.startViewTransition?.bind(document)
    const nativeElementStart = disableElementScoped
      ? undefined
      : surfaceContent?.startViewTransition?.bind(surfaceContent)
    if (surfaceContent && disableElementScoped) {
      Object.defineProperty(surfaceContent, 'startViewTransition', {
        configurable: true,
        value: undefined,
      })
    }
    ;(window as any).__desktopSurfaceTransitionSnapshots = []
    ;(window as any).__desktopSurfaceTransitionStarts = 0
    ;(window as any).__desktopSurfaceElementScoped = Boolean(nativeElementStart)

    const captureUpdate = (scope: string, update: () => void | Promise<void>) => {
      const oldSurface = deepFind(document, 'notes-quick-view') ? 'notes' : 'other'
      return async () => {
        await update()
        const liveAnimationNames = document
          .getAnimations({subtree: true})
          .filter((animation): animation is CSSAnimation => animation instanceof CSSAnimation)
          .map((animation) => animation.animationName)

        ;(window as any).__desktopSurfaceTransitionSnapshots.push({
          oldSurface,
          scope,
          navigationRailStable: deepFind(document, 'navigation-rail') === navigationRail,
          hasNotes: Boolean(deepFind(document, 'notes-quick-view')),
          hasFiles: Boolean(deepFind(document, 'chromvoid-file-manager')),
          hasEmptyState: Boolean(deepFind(document, 'cv-empty-state')),
          liveAnimationNames,
        })
      }
    }

    const attachReadyProbe = (
      transition: {ready: Promise<void>},
      animationRoot: Document | HTMLElement,
    ) => {
      void transition.ready.then(() => {
        const snapshot = (window as any).__desktopSurfaceTransitionSnapshots.at(-1)
        const viewTransitionAnimations = animationRoot
          .getAnimations({subtree: true})
          .filter((animation): animation is CSSAnimation => animation instanceof CSSAnimation)
          .filter(
            (animation) =>
              animation.animationName === 'app-desktop-surface-dissolve-in' ||
              animation.animationName === 'app-desktop-surface-dissolve-out',
          )

        snapshot.viewTransitionAnimationNames = viewTransitionAnimations
          .map((animation) => animation.animationName)
          .sort()
        snapshot.hasHorizontalDisplacement = viewTransitionAnimations.some((animation) =>
          (animation.effect as KeyframeEffect | null)
            ?.getKeyframes()
            .some((keyframe) => String(keyframe['transform'] ?? '').includes('translate')),
        )
        snapshot.ready = true
      })
    }

    if (nativeDocumentStart) {
      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: (update: () => void | Promise<void>) => {
          ;(window as any).__desktopSurfaceTransitionStarts += 1
          const transition = nativeDocumentStart(
            captureUpdate(document.documentElement.dataset['vtScope'] ?? 'document', update),
          )
          attachReadyProbe(transition, document)
          return transition
        },
      })
    }

    if (surfaceContent && nativeElementStart) {
      Object.defineProperty(surfaceContent, 'startViewTransition', {
        configurable: true,
        value: (options: Record<string, any>) => {
          ;(window as any).__desktopSurfaceTransitionStarts += 1
          const update = options['callback'] ?? options['update']
          const capturedUpdate = captureUpdate('desktop-surface-element', update)
          const transition = nativeElementStart({
            ...options,
            callback: capturedUpdate,
            update: capturedUpdate,
          })
          attachReadyProbe(transition, surfaceContent)
          return transition
        },
      })
    }
  }, forceElementScopedUnsupported)
}

test('desktop Notes to empty Files uses one isolated View Transition without nested entrance motion', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html?surface=files&layout=desktop')
  await waitForAuthenticated(page)
  await waitForCatalogReady(page)

  // Seed the empty Files fixture directly, then yield a frame before returning its evaluate result.
  await page.evaluate(async () => {
    const importModule = Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<Record<string, any>>
    const {getAppContext} = await importModule('/shared/services/app-context.ts')
    const {store} = getAppContext()
    store.setSearchFilters({...store.searchFilters(), query: '__desktop_surface_transition_empty__'})
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  await waitForDeepSelector(page, 'cv-empty-state')

  await openNavigationItem(page, 'Notes')
  await page.waitForURL(/surface=notes/)
  await waitForDeepSelector(page, 'notes-quick-view')
  await installDesktopSurfaceTransitionProbe(page)

  await openNavigationItem(page, 'Files')
  await page.waitForURL(/surface=files/)
  await waitForDeepSelector(page, 'chromvoid-file-manager')
  const elementScoped = await page.evaluate(
    () => (window as any).__desktopSurfaceElementScoped as boolean,
  )
  if (elementScoped) {
    await page.waitForFunction(
      () => (window as any).__desktopSurfaceTransitionSnapshots[0]?.ready === true,
    )
  }

  const result = await page.evaluate(() => ({
    elementScoped: (window as any).__desktopSurfaceElementScoped,
    starts: (window as any).__desktopSurfaceTransitionStarts,
    snapshots: (window as any).__desktopSurfaceTransitionSnapshots,
  }))
  expect(result.starts).toBe(result.elementScoped ? 1 : 0)
  expect(result.snapshots).toEqual(
    result.elementScoped
      ? [
          {
            oldSurface: 'notes',
            scope: 'desktop-surface-element',
            navigationRailStable: true,
            hasNotes: false,
            hasFiles: true,
            hasEmptyState: true,
            liveAnimationNames: [],
            viewTransitionAnimationNames: [
              'app-desktop-surface-dissolve-in',
              'app-desktop-surface-dissolve-out',
            ],
            hasHorizontalDisplacement: false,
            ready: true,
          },
        ]
      : [],
  )
})

test('desktop surface switch is instant when element-scoped View Transitions are unavailable', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html?surface=files&layout=desktop')
  await waitForAuthenticated(page)
  await waitForCatalogReady(page)

  await openNavigationItem(page, 'Notes')
  await page.waitForURL(/surface=notes/)
  await waitForDeepSelector(page, 'notes-quick-view')
  await installDesktopSurfaceTransitionProbe(page, true)

  await openNavigationItem(page, 'Files')
  await page.waitForURL(/surface=files/)
  await waitForDeepSelector(page, 'chromvoid-file-manager')

  const result = await page.evaluate(() => ({
    starts: (window as any).__desktopSurfaceTransitionStarts,
    snapshots: (window as any).__desktopSurfaceTransitionSnapshots,
    transitionScope: document.documentElement.dataset['vtScope'],
  }))
  expect(result).toEqual({starts: 0, snapshots: [], transitionScope: undefined})
})
