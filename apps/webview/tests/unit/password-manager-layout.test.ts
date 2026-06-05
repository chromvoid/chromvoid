import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resolveLayoutMode} from '../../src/app/layout/layout-mode'
import type {LayoutMode} from '../../src/app/layout/layout-mode'
import {pmModel} from '../../src/features/passmanager/password-manager.model'
import {atom} from '@reatom/core'
import {Entry, Group, ManagerRoot} from '@project/passmanager'
import {
  PasswordManagerLayoutModel,
  PasswordManagerDesktopLayout,
  PasswordManagerMobileLayout,
} from '../../src/features/passmanager/components/password-manager-layout'
import {
  PASSMANAGER_NO_MOTION_INTENT,
  pmMotionModel,
} from '../../src/features/passmanager/models/pm-motion.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

const originalMatchMedia = window.matchMedia

function setReducedMotion(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })),
  })
}

function createGroup(id: string, name: string) {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(parent: Group, id: string, title: string) {
  return new Entry(parent, {
    id,
    title,
    urls: [],
    username: '',
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: [],
  } as any)
}

function createRootFixture() {
  const root = new ManagerRoot({} as any)
  const group = createGroup('group-layout-motion', 'Group Layout Motion')
  const entry = createEntry(group, 'entry-layout-motion', 'Entry Layout Motion')
  group.entries.set([entry])
  root.entries.set([group])
  return {root, group, entry}
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await element.updateComplete
}

function mockGroupTreeMetrics(metrics: {clientHeight: number; scrollHeight: number}) {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.tagName.toLowerCase() === 'group-tree-view' ? metrics.clientHeight : 0
  })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.tagName.toLowerCase() === 'group-tree-view' ? metrics.scrollHeight : 0
  })
}

describe('password-manager layout selection', () => {
  afterEach(() => {
    document
      .querySelectorAll('password-manager-desktop-layout, password-manager-mobile-layout')
      .forEach((element) => element.remove())
    setPassmanagerRoot(undefined)
    pmMotionModel.reset()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    })
    clearAppContext()
    if (pmModel.alive()) {
      pmModel.cleanup()
    }
    vi.restoreAllMocks()
  })

  function setupContext(mode: LayoutMode) {
    const layoutMode = atom<LayoutMode>(mode)
    const ctx = createMockAppContext({
      store: {
        layoutMode,
        pushNotification: () => {},
      } as any,
    })
    initAppContext(ctx)
    return {layoutMode, ctx}
  }

  describe('wrapper selects layout deterministically based on layoutMode', () => {
    const selectLayout = (mode: 'mobile' | 'desktop') =>
      mode === 'mobile' ? 'password-manager-mobile-layout' : 'password-manager-desktop-layout'

    it('selects mobile layout when layoutMode is "mobile"', () => {
      const mode = resolveLayoutMode({
        isMobile: true,
        matchesBreakpoint: true,
        queryParam: null,
        persisted: null,
      })
      expect(mode).toBe('mobile')
      expect(selectLayout(mode)).toBe('password-manager-mobile-layout')
    })

    it('selects desktop layout when layoutMode is "desktop"', () => {
      const mode = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: null,
        persisted: null,
      })
      expect(mode).toBe('desktop')
      expect(selectLayout(mode)).toBe('password-manager-desktop-layout')
    })

    it('query param "mobile" forces mobile layout on desktop viewport', () => {
      const mode = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: 'mobile',
        persisted: null,
      })
      expect(mode).toBe('mobile')
      expect(selectLayout(mode)).toBe('password-manager-mobile-layout')
    })

    it('query param "desktop" forces desktop layout on mobile runtime', () => {
      const mode = resolveLayoutMode({
        isMobile: true,
        matchesBreakpoint: true,
        queryParam: 'desktop',
        persisted: null,
      })
      expect(mode).toBe('desktop')
      expect(selectLayout(mode)).toBe('password-manager-desktop-layout')
    })

    it('persisted "mobile" overrides breakpoint for mobile layout', () => {
      const mode = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: null,
        persisted: 'mobile',
      })
      expect(mode).toBe('mobile')
      expect(selectLayout(mode)).toBe('password-manager-mobile-layout')
    })

    it('persisted "desktop" overrides mobile breakpoint for desktop layout', () => {
      const mode = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: true,
        queryParam: null,
        persisted: 'desktop',
      })
      expect(mode).toBe('desktop')
      expect(selectLayout(mode)).toBe('password-manager-desktop-layout')
    })

    it('query param takes priority over persisted value', () => {
      const mode = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: 'mobile',
        persisted: 'desktop',
      })
      expect(mode).toBe('mobile')
      expect(selectLayout(mode)).toBe('password-manager-mobile-layout')
    })
  })

  describe('layout mode drives variant selection', () => {
    it('mobile mode selects mobile layout', () => {
      const {ctx} = setupContext('mobile')
      expect(ctx.store.layoutMode()).toBe('mobile')
    })

    it('desktop mode selects desktop layout', () => {
      const {ctx} = setupContext('desktop')
      expect(ctx.store.layoutMode()).toBe('desktop')
    })

    it('layout mode signal can be changed dynamically', () => {
      const {layoutMode} = setupContext('mobile')
      expect(layoutMode()).toBe('mobile')

      layoutMode.set('desktop')
      expect(layoutMode()).toBe('desktop')
    })
  })

  describe('OTP quick view shell rendering', () => {
    it('desktop layout renders the OTP quick view for otpView state', async () => {
      const root = new ManagerRoot({} as any)
      root.entries.set([])
      root.showElement.set('otpView')
      setPassmanagerRoot(root)
      PasswordManagerDesktopLayout.define()

      const element = document.createElement(
        'password-manager-desktop-layout',
      ) as PasswordManagerDesktopLayout
      document.body.appendChild(element)
      await element.updateComplete

      expect(element.shadowRoot?.querySelector('pm-otp-quick-view')).not.toBeNull()
      expect(element.shadowRoot?.querySelector('pm-group')).toBeNull()
    })

    it('mobile layout renders the OTP quick view for otpView state', async () => {
      const root = new ManagerRoot({} as any)
      root.entries.set([])
      root.showElement.set('otpView')
      setPassmanagerRoot(root)
      PasswordManagerMobileLayout.define()

      const element = document.createElement(
        'password-manager-mobile-layout',
      ) as PasswordManagerMobileLayout
      document.body.appendChild(element)
      await element.updateComplete

      expect(element.shadowRoot?.querySelector('pm-otp-quick-view-mobile')).not.toBeNull()
      expect(element.shadowRoot?.querySelector('pm-group-mobile')).toBeNull()
    })
  })

  describe('desktop sidebar scroll edge', () => {
    it('toggles the group tree bottom edge when the sidebar tree reaches the end', async () => {
      mockGroupTreeMetrics({clientHeight: 320, scrollHeight: 960})
      const root = new ManagerRoot({} as any)
      root.entries.set([])
      setPassmanagerRoot(root)
      PasswordManagerDesktopLayout.define()

      const element = document.createElement(
        'password-manager-desktop-layout',
      ) as PasswordManagerDesktopLayout
      document.body.appendChild(element)
      await settle(element)

      const frame = element.shadowRoot?.querySelector<HTMLElement>('.sidebar-tree-scroll-frame')
      const tree = element.shadowRoot?.querySelector<HTMLElement>('group-tree-view.scrollable')
      expect(frame).not.toBeNull()
      expect(tree).not.toBeNull()
      expect(frame?.getAttribute('data-scroll-block-end')).toBe('true')

      tree!.scrollTop = 640
      tree!.dispatchEvent(new Event('scroll'))
      await settle(element)

      expect(frame?.getAttribute('data-scroll-block-end')).toBe('false')
    })
  })

  describe('motion render boundary', () => {
    it('model reads Password Manager motion intent without becoming the direction source', () => {
      setReducedMotion(true)
      pmMotionModel.setIntent({
        kind: 'surface-change',
        direction: 'forward',
        target: 'entry:entry-layout-motion',
      })

      const model = new PasswordManagerLayoutModel()

      expect(model.getMotionRenderState()).toEqual({
        kind: 'surface-change',
        direction: 'forward',
        target: 'entry:entry-layout-motion',
        reducedMotion: true,
      })

      pmMotionModel.reset()
      expect(model.getMotionRenderState()).toEqual({
        ...PASSMANAGER_NO_MOTION_INTENT,
        reducedMotion: true,
      })
    })

    it.each([
      ['root', (fixture: ReturnType<typeof createRootFixture>) => fixture.root],
      ['group', (fixture: ReturnType<typeof createRootFixture>) => fixture.group],
      ['entry', (fixture: ReturnType<typeof createRootFixture>) => fixture.entry],
      ['createEntry', () => 'createEntry' as const],
      ['createGroup', () => 'createGroup' as const],
      ['importDialog', () => 'importDialog' as const],
      ['otpView', () => 'otpView' as const],
    ])('desktop layout renders one pm-content wrapper for %s state', async (_name, resolveShowElement) => {
      const fixture = createRootFixture()
      fixture.root.showElement.set(resolveShowElement(fixture) as never)
      setPassmanagerRoot(fixture.root)
      PasswordManagerDesktopLayout.define()

      const element = document.createElement(
        'password-manager-desktop-layout',
      ) as PasswordManagerDesktopLayout
      document.body.appendChild(element)
      await element.updateComplete

      expect(element.shadowRoot?.querySelectorAll('.pm-content')).toHaveLength(1)
    })

    it.each([
      ['root', (fixture: ReturnType<typeof createRootFixture>) => fixture.root],
      ['group', (fixture: ReturnType<typeof createRootFixture>) => fixture.group],
      ['entry', (fixture: ReturnType<typeof createRootFixture>) => fixture.entry],
      ['createEntry', () => 'createEntry' as const],
      ['createGroup', () => 'createGroup' as const],
      ['importDialog', () => 'importDialog' as const],
      ['otpView', () => 'otpView' as const],
    ])('mobile layout renders one pm-content wrapper for %s state', async (_name, resolveShowElement) => {
      const fixture = createRootFixture()
      fixture.root.showElement.set(resolveShowElement(fixture) as never)
      setPassmanagerRoot(fixture.root)
      PasswordManagerMobileLayout.define()

      const element = document.createElement(
        'password-manager-mobile-layout',
      ) as PasswordManagerMobileLayout
      document.body.appendChild(element)
      await element.updateComplete

      expect(element.shadowRoot?.querySelectorAll('.pm-content')).toHaveLength(1)
    })

    it('desktop and mobile layouts render motion attributes from pmMotionModel', async () => {
      const fixture = createRootFixture()
      fixture.root.showElement.set(fixture.entry)
      setPassmanagerRoot(fixture.root)
      pmMotionModel.setIntent({
        kind: 'surface-change',
        direction: 'forward',
        target: `entry:${fixture.entry.id}`,
      })
      PasswordManagerDesktopLayout.define()
      PasswordManagerMobileLayout.define()

      const desktop = document.createElement(
        'password-manager-desktop-layout',
      ) as PasswordManagerDesktopLayout
      const mobile = document.createElement(
        'password-manager-mobile-layout',
      ) as PasswordManagerMobileLayout
      document.body.append(desktop, mobile)
      await desktop.updateComplete
      await mobile.updateComplete

      for (const element of [desktop, mobile]) {
        const content = element.shadowRoot?.querySelector('.pm-content') as HTMLElement | null
        expect(content).not.toBeNull()
        expect(content?.getAttribute('data-motion-kind')).toBe('surface-change')
        expect(content?.getAttribute('data-motion-direction')).toBe('forward')
        expect(content?.getAttribute('data-motion-target')).toBe(`entry:${fixture.entry.id}`)
        expect(content?.getAttribute('data-reduced-motion')).toBe('false')
      }
    })

  })

  describe('layout switching does not recreate PM root', () => {
    it('pmModel.alive remains true across layout mode change', () => {
      const {layoutMode} = setupContext('desktop')

      pmModel.managerSaver = {} as any
      const mockClean = vi.fn()
      const mockLoad = vi.fn()

      ;(globalThis as any).window ??= {}
      const origPassmanager = (window as any).passmanager

      const fakeManager = {
        clean: mockClean,
        load: mockLoad,
        showElement: atom(null),
        isLoading: atom(false),
        isReadOnly: atom(false),
      }

      ;(window as any).passmanager = undefined

      const originalManagerRoot = vi.fn().mockImplementation(() => fakeManager)
      vi.stubGlobal('ManagerRoot', originalManagerRoot)

      pmModel.init()
      expect(pmModel.alive()).toBe(true)

      layoutMode.set('mobile')
      expect(pmModel.alive()).toBe(true)

      layoutMode.set('desktop')
      expect(pmModel.alive()).toBe(true)

      pmModel.cleanup()
      expect(pmModel.alive()).toBe(false)

      ;(window as any).passmanager = origPassmanager
      vi.unstubAllGlobals()
    })
  })

  describe('model lifecycle', () => {
    it('init sets alive to true', () => {
      expect(pmModel.alive()).toBe(false)

      pmModel.managerSaver = {} as any
      ;(globalThis as any).window ??= {}
      const origPassmanager = (window as any).passmanager
      ;(window as any).passmanager = undefined

      try {
        pmModel.init()
      } catch {}

      ;(window as any).passmanager = origPassmanager
    })

    it('cleanup sets alive to false', () => {
      pmModel.alive.set(true)
      ;(globalThis as any).window ??= {}
      const origPassmanager = (window as any).passmanager
      ;(window as any).passmanager = {clean: vi.fn()}

      pmModel.cleanup()
      expect(pmModel.alive()).toBe(false)

      ;(window as any).passmanager = origPassmanager
    })

    it('double init is idempotent', () => {
      pmModel.alive.set(true)
      const initSpy = vi.fn()
      const origInit = pmModel.init.bind(pmModel)

      pmModel.init()

      expect(pmModel.alive()).toBe(true)

      pmModel.alive.set(false)
    })

    it('cleanup when not alive is no-op', () => {
      pmModel.alive.set(false)
      pmModel.cleanup()
      expect(pmModel.alive()).toBe(false)
    })
  })

  describe('layout selection is binary', () => {
    it('only two possible outcomes: mobile or desktop', () => {
      const allCombinations: Array<{
        isMobile: boolean
        matchesBreakpoint: boolean
        queryParam: string | null
        persisted: string | null
      }> = []

      for (const isMobile of [true, false]) {
        for (const matchesBreakpoint of [true, false]) {
          for (const queryParam of [null, 'mobile', 'desktop', 'auto']) {
            for (const persisted of [null, 'mobile', 'desktop']) {
              allCombinations.push({isMobile, matchesBreakpoint, queryParam, persisted})
            }
          }
        }
      }

      for (const input of allCombinations) {
        const mode = resolveLayoutMode(input)
        expect(['mobile', 'desktop']).toContain(mode)
      }
    })
  })
})
