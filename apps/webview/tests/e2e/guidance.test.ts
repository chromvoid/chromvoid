import {expect, test} from 'vitest'

import {waitForAuthenticated} from './utils'

const BASE_URL = 'http://localhost:4400'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

type BlockedStatus = 'unsupported' | 'locked_pro' | 'entitlement_unavailable'
type GuidanceE2EBridge = {
  moduleAccessModel: {rawStates: {set: (states: Record<string, unknown>[]) => void}}
  guidanceModel: {
    anchors: {set: (anchors: Record<string, unknown>) => void}
    definitions: {set: (definitions: Record<string, unknown>[]) => void}
    progress: {set: (records: unknown[]) => void}
    productStates: {set: (states: Set<string>) => void}
    completedDomainEvents: {set: (events: Set<string>) => void}
    manualHelpRequest: {set: (request: null) => void}
    blockedActionRequest: {set: (request: null) => void}
    activeGuidance: () => {kind: string}
    inlineHints: () => {kind: string; definition: {id: string}}[]
    dismiss: (id: string) => void
    openManualHelp: (surface: string, anchorId: string) => void
    registerAnchor: (registration: {
      anchorId: string
      surface: string
      owner: string
      element: HTMLElement
    }) => void
    unregisterAnchor: (anchorId: string, element?: HTMLElement) => void
    openBlockedAction: (input: {
      feature: 'remote'
      surface: 'remote'
      anchorId: 'pro.access-state'
      reason: BlockedStatus
    }) => void
  }
}

async function openApp(page: import('playwright').Page, surface = 'files', layout?: 'desktop' | 'mobile') {
  const params = new URLSearchParams({surface})
  params.set('e2eGuidance', '1')
  if (layout) params.set('layout', layout)
  await page.goto(`${BASE_URL}/index.html?${params.toString()}`, {waitUntil: 'domcontentloaded'})
  await waitForAuthenticated(page)
}

async function waitForDeepSelector(page: import('playwright').Page, selector: string) {
  await page.waitForFunction(
    (targetSelector) => {
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

      return Boolean(deepFind(document, targetSelector))
    },
    selector,
    {timeout: 10_000},
  )
}

async function queryDeepText(page: import('playwright').Page, selector: string): Promise<string | null> {
  return page.evaluate((targetSelector) => {
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

    return deepFind(document, targetSelector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null
  }, selector)
}

async function queryDeepCount(page: import('playwright').Page, selector: string): Promise<number> {
  return page.evaluate((targetSelector) => {
    function deepCollect(root: Document | ShadowRoot, selector: string, acc: Element[] = []): Element[] {
      acc.push(...root.querySelectorAll(selector))
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) deepCollect(element.shadowRoot, selector, acc)
      }
      return acc
    }

    return deepCollect(document, targetSelector).length
  }, selector)
}

async function waitForDeepCount(page: import('playwright').Page, selector: string, expectedCount: number) {
  await page.waitForFunction(
    ({targetSelector, count}) => {
      function deepCollect(root: Document | ShadowRoot, selector: string, acc: Element[] = []): Element[] {
        acc.push(...root.querySelectorAll(selector))
        for (const element of root.querySelectorAll('*')) {
          if (element.shadowRoot) deepCollect(element.shadowRoot, selector, acc)
        }
        return acc
      }

      return deepCollect(document, targetSelector).length === count
    },
    {targetSelector: selector, count: expectedCount},
    {timeout: 10_000},
  )
}

async function clickDeep(page: import('playwright').Page, selector: string) {
  await page.evaluate((targetSelector) => {
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

    const element = deepFind(document, targetSelector)
    if (!(element instanceof HTMLElement)) {
      throw new Error(`Deep selector did not resolve to a clickable element: ${targetSelector}`)
    }
    element.click()
  }, selector)
}

async function waitForDeepText(page: import('playwright').Page, selector: string, expectedText: string) {
  await page.waitForFunction(
    ({targetSelector, text}) => {
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

      return deepFind(document, targetSelector)?.textContent?.includes(text) ?? false
    },
    {targetSelector: selector, text: expectedText},
    {timeout: 10_000},
  )
}

async function resetGuidanceState(page: import('playwright').Page) {
  await page.evaluate(() => {
    const bridge = (window as typeof window & {__chromvoidGuidanceE2E?: GuidanceE2EBridge})
      .__chromvoidGuidanceE2E
    if (!bridge) throw new Error('Guidance e2e bridge is not available')
    const {guidanceModel, moduleAccessModel} = bridge

    document.querySelectorAll('[data-e2e-guidance-anchor]').forEach((element) => {
      element.remove()
    })
    guidanceModel.anchors.set({})
    guidanceModel.definitions.set([])
    guidanceModel.progress.set([])
    guidanceModel.productStates.set(new Set())
    guidanceModel.completedDomainEvents.set(new Set())
    guidanceModel.manualHelpRequest.set(null)
    guidanceModel.blockedActionRequest.set(null)
    moduleAccessModel.rawStates.set([])
  })
}

async function registerGuidanceAnchor(
  page: import('playwright').Page,
  input: {anchorId: string; surface: string; elementId: string; text: string},
) {
  await page.evaluate(({anchorId, surface, elementId, text}) => {
    const bridge = (window as typeof window & {__chromvoidGuidanceE2E?: GuidanceE2EBridge})
      .__chromvoidGuidanceE2E
    if (!bridge) throw new Error('Guidance e2e bridge is not available')
    const {guidanceModel} = bridge

    const stale = document.getElementById(elementId)
    if (stale instanceof HTMLElement) {
      guidanceModel.unregisterAnchor(anchorId, stale)
      stale.remove()
    }

    const anchor = document.createElement('button')
    anchor.id = elementId
    anchor.dataset['e2eGuidanceAnchor'] = 'true'
    anchor.textContent = text
    document.body.append(anchor)
    guidanceModel.registerAnchor({
      anchorId,
      surface,
      owner: 'e2e',
      element: anchor,
    })
  }, input)
}

async function configureMissingAnchorGuidance(page: import('playwright').Page) {
  await resetGuidanceState(page)
  await page.evaluate(() => {
    const bridge = (window as typeof window & {__chromvoidGuidanceE2E?: GuidanceE2EBridge})
      .__chromvoidGuidanceE2E
    if (!bridge) throw new Error('Guidance e2e bridge is not available')
    const {guidanceModel} = bridge

    guidanceModel.definitions.set([
      {
        id: 'e2e.missing-anchor',
        surface: 'files',
        anchorId: 'e2e.missing-anchor',
        trigger: 'feature_discovery',
        presentation: 'popover',
        titleKey: 'guidance:remote.setup-network:title',
        bodyKey: 'guidance:remote.setup-network:body',
        completion: {kind: 'product_state', key: 'e2e.missing'},
        priority: 999,
        owner: 'e2e',
        version: 1,
      },
    ])
  })
}

async function configureIntrusiveGuidance(page: import('playwright').Page) {
  await resetGuidanceState(page)
  await page.evaluate(() => {
    const bridge = (window as typeof window & {__chromvoidGuidanceE2E?: GuidanceE2EBridge})
      .__chromvoidGuidanceE2E
    if (!bridge) throw new Error('Guidance e2e bridge is not available')
    const {guidanceModel} = bridge

    guidanceModel.definitions.set([
      {
        id: 'e2e.gateway-pair-extension',
        surface: 'files',
        anchorId: 'e2e.gateway-pair-extension',
        trigger: 'feature_discovery',
        presentation: 'popover',
        titleKey: 'guidance:gateway.pair-extension:title',
        bodyKey: 'guidance:gateway.pair-extension:body',
        completion: {kind: 'product_state', key: 'e2e.gateway.paired'},
        priority: 999,
        owner: 'e2e',
        version: 1,
      },
    ])
  })
  await registerGuidanceAnchor(page, {
    anchorId: 'e2e.gateway-pair-extension',
    surface: 'files',
    elementId: 'e2e-intrusive-guidance-anchor',
    text: 'gateway pairing anchor',
  })
}

async function configureManualHelpGuidance(page: import('playwright').Page) {
  await resetGuidanceState(page)
  await page.evaluate(() => {
    const bridge = (window as typeof window & {__chromvoidGuidanceE2E?: GuidanceE2EBridge})
      .__chromvoidGuidanceE2E
    if (!bridge) throw new Error('Guidance e2e bridge is not available')
    const {guidanceModel} = bridge

    guidanceModel.definitions.set([
      {
        id: 'e2e.manual-help',
        surface: 'files',
        anchorId: 'e2e.manual-help',
        trigger: 'manual_help',
        presentation: 'popover',
        titleKey: 'guidance:keyboard.shortcuts.files:title',
        bodyKey: 'guidance:keyboard.shortcuts.files:body',
        completion: {kind: 'manual_ack'},
        priority: 999,
        owner: 'e2e',
        version: 1,
      },
    ])
    guidanceModel.dismiss('e2e.manual-help')
  })
  await registerGuidanceAnchor(page, {
    anchorId: 'e2e.manual-help',
    surface: 'files',
    elementId: 'e2e-manual-help-anchor',
    text: 'manual help anchor',
  })
  await page.evaluate(() => {
    const bridge = (window as typeof window & {__chromvoidGuidanceE2E?: GuidanceE2EBridge})
      .__chromvoidGuidanceE2E
    if (!bridge) throw new Error('Guidance e2e bridge is not available')
    bridge.guidanceModel.openManualHelp('files', 'e2e.manual-help')
  })
}

async function configureInlineGuidance(page: import('playwright').Page) {
  await resetGuidanceState(page)
  await page.evaluate(() => {
    const bridge = (window as typeof window & {__chromvoidGuidanceE2E?: GuidanceE2EBridge})
      .__chromvoidGuidanceE2E
    if (!bridge) throw new Error('Guidance e2e bridge is not available')
    bridge.guidanceModel.definitions.set([
      {
        id: 'e2e.remote-inline',
        surface: 'remote',
        anchorId: 'remote.pair-device',
        trigger: 'feature_discovery',
        presentation: 'inline_hint',
        titleKey: 'guidance:remote.setup-network:title',
        bodyKey: 'guidance:remote.setup-network:body',
        completion: {kind: 'product_state', key: 'e2e.remote.has-paired-device'},
        priority: 999,
        owner: 'e2e',
        version: 1,
      },
    ])
  })
}

async function renderInlineGuidanceFixture(page: import('playwright').Page, anchorId: string, surface: string) {
  await page.evaluate(
    ({targetAnchorId, targetSurface}) => {
      const bridge = (window as typeof window & {__chromvoidGuidanceE2E?: GuidanceE2EBridge})
        .__chromvoidGuidanceE2E
      if (!bridge) throw new Error('Guidance e2e bridge is not available')
      const hint = bridge.guidanceModel.inlineHints().find((item) => {
        const definition = item.definition as {anchorId?: string; surface?: string}
        return item.kind === 'inline' && definition.anchorId === targetAnchorId && definition.surface === targetSurface
      })
      if (!hint) throw new Error('Expected inline guidance state to be available')

      let host = document.getElementById('e2e-inline-guidance-host')
      if (!host) {
        host = document.createElement('div')
        host.id = 'e2e-inline-guidance-host'
        document.body.append(host)
      }
      const panel = document.createElement('cv-guidance-panel')
      panel.setAttribute('variant', 'hint')
      panel.setAttribute('density', 'compact')
      const title = document.createElement('span')
      title.slot = 'title'
      title.textContent = 'Pair over the network'
      const body = document.createElement('p')
      body.textContent = 'Network pairing lets this dashboard unlock or manage a vault hosted on another trusted device.'
      panel.append(title, body)
      host.replaceChildren(panel)
    },
    {targetAnchorId: anchorId, targetSurface: surface},
  )
}

async function configureExplicitBottomSheetGuidance(page: import('playwright').Page) {
  await resetGuidanceState(page)
  await page.evaluate(() => {
    const bridge = (window as typeof window & {__chromvoidGuidanceE2E?: GuidanceE2EBridge})
      .__chromvoidGuidanceE2E
    if (!bridge) throw new Error('Guidance e2e bridge is not available')
    bridge.guidanceModel.definitions.set([
      {
        id: 'e2e.explicit-bottom-sheet',
        surface: 'files',
        anchorId: 'e2e.explicit-bottom-sheet',
        trigger: 'feature_discovery',
        presentation: 'bottom_sheet',
        titleKey: 'guidance:remote.setup-network:title',
        bodyKey: 'guidance:remote.setup-network:body',
        primaryActionKey: 'guidance:actions:got-it',
        completion: {kind: 'manual_ack'},
        priority: 999,
        owner: 'e2e',
        version: 1,
      },
    ])
  })
}

async function configurePasswordImportManualHelp(page: import('playwright').Page) {
  await resetGuidanceState(page)
  await page.evaluate(() => {
    const bridge = (window as typeof window & {__chromvoidGuidanceE2E?: GuidanceE2EBridge})
      .__chromvoidGuidanceE2E
    if (!bridge) throw new Error('Guidance e2e bridge is not available')
    bridge.guidanceModel.definitions.set([
      {
        id: 'passwords.import-migration',
        surface: 'passwords',
        anchorId: 'passwords.import',
        trigger: 'manual_help',
        presentation: 'popover',
        titleKey: 'guidance:passwords.import-migration:title',
        bodyKey: 'guidance:passwords.import-migration:body',
        primaryActionKey: 'guidance:actions:got-it',
        completion: {kind: 'manual_ack'},
        priority: 999,
        owner: 'passmanager',
        version: 1,
      },
    ])
    bridge.guidanceModel.progress.set([
      {
        id: 'passwords.import-migration',
        version: 1,
        state: 'dismissed',
        dismissedAt: 1,
      },
    ])
  })
  await registerGuidanceAnchor(page, {
    anchorId: 'passwords.import',
    surface: 'passwords',
    elementId: 'e2e-passwords-import-anchor',
    text: 'password import manual help anchor',
  })
  await page.evaluate(() => {
    const bridge = (window as typeof window & {__chromvoidGuidanceE2E?: GuidanceE2EBridge})
      .__chromvoidGuidanceE2E
    if (!bridge) throw new Error('Guidance e2e bridge is not available')
    bridge.guidanceModel.openManualHelp('passwords', 'passwords.import')
  })
}

async function openPasswordImportDialog(page: import('playwright').Page, layout: 'desktop' | 'mobile') {
  await openApp(page, 'passwords', layout)
  await page.waitForFunction(
    () => Boolean((window as typeof window & {passmanager?: {showElement?: {set?: (value: unknown) => void}}}).passmanager?.showElement?.set),
    undefined,
    {timeout: 10_000},
  )
  await page.evaluate(() => {
    ;(window as typeof window & {passmanager?: {showElement?: {set: (value: unknown) => void}}}).passmanager?.showElement?.set(
      'importDialog',
    )
  })
  await page.waitForFunction(
    () => (window as typeof window & {passmanager?: {showElement?: () => unknown}}).passmanager?.showElement?.() === 'importDialog',
    undefined,
    {timeout: 10_000},
  )
  await waitForDeepSelector(page, 'pm-import-dialog')
}

async function openBlockedRemoteGuidance(page: import('playwright').Page, status: BlockedStatus) {
  await resetGuidanceState(page)
  await page.evaluate((nextStatus) => {
    const bridge = (window as typeof window & {__chromvoidGuidanceE2E?: GuidanceE2EBridge})
      .__chromvoidGuidanceE2E
    if (!bridge) throw new Error('Guidance e2e bridge is not available')
    const {guidanceModel, moduleAccessModel} = bridge

    const staleAnchor = document.getElementById('e2e-pro-access-anchor')
    if (staleAnchor instanceof HTMLElement) {
      guidanceModel.unregisterAnchor('pro.access-state', staleAnchor)
      staleAnchor.remove()
    }
    moduleAccessModel.rawStates.set([
      {
        feature_key: 'remote',
        status: nextStatus,
        denial_code: nextStatus === 'unsupported' ? 'FEATURE_UNSUPPORTED_ON_PLATFORM' : nextStatus.toUpperCase(),
      },
    ])
    guidanceModel.definitions.set([
      {
        id: 'pro.remote.blocked',
        surface: 'remote',
        anchorId: 'pro.access-state',
        trigger: 'blocked_action',
        presentation: 'popover',
        titleKey: 'guidance:pro.remote.blocked:title',
        bodyKey: 'guidance:pro.remote.blocked:body',
        bodyKeyByModuleAccessStatus: {
          unsupported: 'guidance:pro.blocked.unsupported:body',
          locked_pro: 'guidance:pro.blocked.locked-pro:body',
          entitlement_unavailable: 'guidance:pro.blocked.entitlement-unavailable:body',
        },
        moduleAccessGate: {
          feature: 'remote',
          statuses: ['unsupported', 'entitlement_unavailable', 'locked_pro'],
        },
        primaryActionKey: 'guidance:actions:open-help',
        completion: {kind: 'manual_ack'},
        priority: 999,
        owner: 'e2e',
        version: 1,
      },
    ])
    const anchor = document.createElement('button')
    anchor.id = 'e2e-pro-access-anchor'
    anchor.dataset['e2eGuidanceAnchor'] = 'true'
    anchor.textContent = `${nextStatus} remote help`
    anchor.addEventListener('click', () => {
      guidanceModel.openBlockedAction({
        surface: 'remote',
        anchorId: 'pro.access-state',
        feature: 'remote',
        reason: nextStatus,
      })
    })
    document.body.append(anchor)
    guidanceModel.registerAnchor({
      anchorId: 'pro.access-state',
      surface: 'remote',
      owner: 'e2e',
      element: anchor,
    })
  }, status)

  await waitForDeepCount(page, 'cv-popover', 0)
  await clickDeep(page, '#e2e-pro-access-anchor')
  await waitForDeepSelector(page, 'cv-popover')
}

test('guidance renders intrusive guidance as a desktop popover', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 1200, height: 820})
  await openApp(page, 'files', 'desktop')
  await configureIntrusiveGuidance(page)

  await waitForDeepSelector(page, 'app-guidance-host')
  await waitForDeepSelector(page, 'cv-popover')
  await waitForDeepSelector(page, '.guidance-backdrop')

  expect(await queryDeepText(page, 'cv-guidance-panel')).toContain('Pair the browser extension')
  expect(await queryDeepCount(page, 'cv-bottom-sheet')).toBe(0)
})

test('guidance renders the same intrusive guidance as a mobile popover overlay', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 390, height: 844})
  await openApp(page, 'files', 'mobile')
  await configureIntrusiveGuidance(page)

  await waitForDeepSelector(page, 'app-guidance-host')
  await waitForDeepSelector(page, 'cv-popover')
  await waitForDeepSelector(page, '.guidance-backdrop')

  expect(await queryDeepText(page, 'cv-guidance-panel')).toContain('Pair the browser extension')
  expect(await queryDeepCount(page, 'cv-bottom-sheet')).toBe(0)
})

test('guidance renders inline hints without an overlay', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 1200, height: 820})
  await openApp(page, 'remote', 'desktop')
  await waitForDeepSelector(page, 'app-guidance-host')
  await configureInlineGuidance(page)
  await renderInlineGuidanceFixture(page, 'remote.pair-device', 'remote')

  await waitForDeepText(page, 'cv-guidance-panel', 'Pair over the network')

  expect(await queryDeepText(page, 'cv-guidance-panel')).toContain('Network pairing lets this dashboard')
  expect(await queryDeepCount(page, 'cv-popover')).toBe(0)
  expect(await queryDeepCount(page, 'cv-bottom-sheet')).toBe(0)
  expect(await queryDeepCount(page, '.guidance-backdrop')).toBe(0)
})

test('guidance renders bottom sheet presentation independently from popovers', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 390, height: 844})
  await openApp(page, 'files', 'mobile')
  await waitForDeepSelector(page, 'app-guidance-host')
  await configureExplicitBottomSheetGuidance(page)

  await waitForDeepSelector(page, 'cv-bottom-sheet')

  expect(await queryDeepText(page, 'cv-guidance-panel')).toContain('Pair over the network')
  expect(await queryDeepCount(page, 'cv-popover')).toBe(0)
  expect(await queryDeepCount(page, '.guidance-backdrop')).toBe(0)
})

test('missing guidance anchors do not render a fallback overlay', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 1200, height: 820})
  await openApp(page, 'files')
  await configureMissingAnchorGuidance(page)

  await page.waitForFunction(() => {
    const bridge = (window as typeof window & {__chromvoidGuidanceE2E?: GuidanceE2EBridge})
      .__chromvoidGuidanceE2E
    if (!bridge) return false
    const {guidanceModel} = bridge
    return guidanceModel.activeGuidance().kind === 'waiting_for_anchor'
  })

  expect(await queryDeepCount(page, 'cv-popover')).toBe(0)
  expect(await queryDeepCount(page, 'cv-bottom-sheet')).toBe(0)
})

test('manual help can show a dismissed guidance item', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 1200, height: 820})
  await openApp(page, 'files')
  await waitForDeepSelector(page, 'app-guidance-host')
  await configureManualHelpGuidance(page)

  await waitForDeepSelector(page, 'cv-popover')

  const panelText = await queryDeepText(page, 'cv-guidance-panel')
  expect(panelText).toContain('Use keyboard shortcuts in files')
  expect(panelText).toContain('Got it')
  expect(panelText).not.toContain('Later')
  expect(panelText).not.toContain('Dismiss')
  expect(await queryDeepCount(page, 'button[data-guidance-action="primary"]')).toBe(1)
  expect(await queryDeepCount(page, 'button[data-guidance-action="secondary"]')).toBe(0)
  expect(await queryDeepCount(page, 'button[data-guidance-action="close"]')).toBe(1)

  await clickDeep(page, 'button[data-guidance-action="primary"]')
  await waitForDeepCount(page, 'cv-popover', 0)

  await page.evaluate(() => {
    const anchor = document.getElementById('e2e-manual-help-anchor')
    if (!(anchor instanceof HTMLElement)) throw new Error('Manual help anchor is missing')
    anchor.focus()
    const bridge = (window as typeof window & {__chromvoidGuidanceE2E?: GuidanceE2EBridge})
      .__chromvoidGuidanceE2E
    if (!bridge) throw new Error('Guidance e2e bridge is not available')
    bridge.guidanceModel.openManualHelp('files', 'e2e.manual-help')
  })
  await waitForDeepSelector(page, 'cv-popover')
  await clickDeep(page, 'button[data-guidance-action="close"]')
  await waitForDeepCount(page, 'cv-popover', 0)

  expect(
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.id : null)),
  ).toBe('e2e-manual-help-anchor')
})

test('blocked Pro surface copy differs by denial status', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 1200, height: 820})
  await openApp(page, 'files')
  await waitForDeepSelector(page, 'app-guidance-host')

  const texts: string[] = []
  for (const {status, expected} of [
    {status: 'unsupported', expected: 'platform does not support'},
    {status: 'locked_pro', expected: 'Activate a Pro license'},
    {status: 'entitlement_unavailable', expected: 'could not read the active Core license state'},
  ] as const) {
    await openBlockedRemoteGuidance(page, status)
    await waitForDeepText(page, 'cv-guidance-panel', expected)
    const text = await queryDeepText(page, 'cv-guidance-panel')
    expect(text).toBeTruthy()
    texts.push(text!)
  }

  expect(new Set(texts).size).toBe(3)
  expect(texts[0]).toContain('platform does not support')
  expect(texts[1]).toContain('Activate a Pro license')
  expect(texts[2]).toContain('could not read the active Core license state')
})

test('password import dialog has no temporary help button but manual import guidance still renders', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.setViewportSize({width: 1200, height: 820})
  await openPasswordImportDialog(page, 'desktop')

  expect(await queryDeepCount(page, '[data-action="pm-import-help"]')).toBe(0)
  expect(await queryDeepCount(page, 'cv-guidance-anchor[anchor-id="passwords.import"]')).toBe(0)

  await configurePasswordImportManualHelp(page)
  await waitForDeepSelector(page, 'cv-popover')
  expect(await queryDeepText(page, 'cv-guidance-panel')).toContain('Import without mixing providers')
  await clickDeep(page, 'button[data-guidance-action="close"]')
  await waitForDeepCount(page, 'cv-popover', 0)

  await page.setViewportSize({width: 390, height: 844})
  await openPasswordImportDialog(page, 'mobile')

  expect(await queryDeepCount(page, '[data-action="pm-import-help"]')).toBe(0)
  expect(await queryDeepCount(page, 'cv-guidance-anchor[anchor-id="passwords.import"]')).toBe(0)
})
