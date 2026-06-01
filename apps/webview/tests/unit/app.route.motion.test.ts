import {afterEach, describe, expect, it, vi} from 'vitest'
import {render} from 'lit'
import {atom} from '@reatom/core'

import type {Routes} from '../../src/app/router/router'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {ChromVoidApp} from '../../src/routes/app.route'
import {
  ChromVoidAppModel,
  getAppRouteMotionIntent,
  type AppRouteMotionIntent,
} from '../../src/routes/app.route.model'
import {appRouteStyles} from '../../src/routes/app.route.styles'
import {biometricAppGateModel} from '../../src/routes/biometric-app-gate/biometric-app-gate.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

function stylesToText(styles: unknown): string {
  const values = Array.isArray(styles) ? styles : [styles]
  return values
    .map((value) => {
      if (value == null) return ''
      return typeof value === 'object' && 'cssText' in (value as object)
        ? String((value as {cssText: string}).cssText)
        : String(value)
    })
    .join('\n')
}

function setupContext(route: Routes) {
  navigationModel.disconnect()
  const routeAtom = atom<Routes>(route)
  const store = {
    layoutMode: atom<'mobile' | 'desktop'>('desktop'),
    sidebarOpen: atom(false),
    dualPaneMode: atom(false),
    selectedNodeIds: atom<number[]>([]),
    selectionMode: atom(false),
    setSidebarOpen: vi.fn(),
  }

  initAppContext(
    createMockAppContext({
      router: {
        route: routeAtom,
      } as never,
      store: store as never,
    }),
  )
  navigationModel.reset()
  return {routeAtom}
}

function renderAppRouteContent(route: Routes): HTMLElement {
  setupContext(route)
  const app = new ChromVoidApp() as ChromVoidApp & {
    renderContent: () => unknown
  }
  const host = document.createElement('div')
  render(app.renderContent(), host)
  return host
}

function expectIntent(intent: AppRouteMotionIntent, expected: AppRouteMotionIntent) {
  expect(intent).toEqual(expected)
}

describe('ChromVoidApp route motion contract', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    biometricAppGateModel.mobileRuntime.set(false)
    biometricAppGateModel.loading.set(false)
    biometricAppGateModel.phase.set('idle')
    navigationModel.disconnect()
    clearAppContext()
    vi.restoreAllMocks()
  })

  it.each<Routes>(['loading', 'welcome', 'no-license', 'dashboard', 'task-progress', 'no-connection'])(
    'renders exactly one route-content owner for %s',
    (route) => {
      const host = renderAppRouteContent(route)
      const wrappers = host.querySelectorAll('.route-content')

      expect(wrappers).toHaveLength(1)
      expect(wrappers[0]?.getAttribute('data-route')).toBe(route)
      expect(wrappers[0]?.hasAttribute('style')).toBe(false)
    },
  )

  it('renders exactly one route-content owner for the biometric gate branch', () => {
    biometricAppGateModel.mobileRuntime.set(true)
    biometricAppGateModel.phase.set('required')

    const host = renderAppRouteContent('dashboard')
    const wrappers = host.querySelectorAll('.route-content')

    expect(wrappers).toHaveLength(1)
    expect(wrappers[0]?.getAttribute('data-route')).toBe('biometric-gate')
    expect(host.querySelector('biometric-app-gate')).not.toBeNull()
  })

  it('keeps route-content ownership in CSS instead of template inline style', () => {
    const cssText = stylesToText(appRouteStyles)
    const routeContentRule = cssText.match(/\.route-content\s*{[^}]*}/)?.[0] ?? ''

    expect(cssText).toContain('.route-content')
    expect(routeContentRule).toContain('block-size: 100%;')
    expect(routeContentRule).toContain('min-block-size: 0;')
    expect(routeContentRule).toContain('view-transition-name: route-content;')
    expect(routeContentRule).toContain('contain: style;')
    expect(routeContentRule).not.toContain('contain: layout')
    expect(routeContentRule).not.toContain('contain: paint')
  })

  it('derives P0 route motion intent without reading DOM state', () => {
    expectIntent(getAppRouteMotionIntent(null, 'welcome', false), {
      kind: 'none',
      direction: 'none',
      target: 'welcome',
    })
    expectIntent(getAppRouteMotionIntent('welcome', 'dashboard', false), {
      kind: 'surface-change',
      direction: 'forward',
      target: 'dashboard',
    })
    expectIntent(getAppRouteMotionIntent('dashboard', 'welcome', false), {
      kind: 'surface-change',
      direction: 'back',
      target: 'welcome',
    })
    expectIntent(getAppRouteMotionIntent('no-connection', 'dashboard', false), {
      kind: 'surface-change',
      direction: 'replace',
      target: 'dashboard',
    })
    expectIntent(getAppRouteMotionIntent('dashboard', 'dashboard', false), {
      kind: 'none',
      direction: 'none',
      target: 'dashboard',
    })
    expectIntent(getAppRouteMotionIntent('welcome', 'dashboard', true), {
      kind: 'surface-change',
      direction: 'replace',
      target: 'biometric-gate',
    })
  })

  it('keeps rendered route state in ChromVoidAppModel transition plans', () => {
    setupContext('welcome')
    const model = new ChromVoidAppModel()

    expect(model.renderedRoute()).toBe('welcome')

    const forward = model.planRenderedRouteTransition('dashboard', false)
    expect(forward.intent).toEqual({
      kind: 'surface-change',
      direction: 'forward',
      target: 'dashboard',
    })
    expect(model.renderedRoute()).toBe('welcome')
    expect(model.commitRenderedRouteTransition(forward)).toBe(true)
    expect(model.renderedRoute()).toBe('dashboard')

    const stale = model.planRenderedRouteTransition('welcome', false)
    const replace = model.planRenderedRouteTransition('no-connection', false)
    expect(model.commitRenderedRouteTransition(stale)).toBe(false)
    expect(model.commitRenderedRouteTransition(replace)).toBe(true)
    expect(model.renderedRoute()).toBe('no-connection')
  })
})
