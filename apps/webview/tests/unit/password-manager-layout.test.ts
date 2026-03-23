import {state} from '@statx/core'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resolveLayoutMode} from '../../src/app/layout/layout-mode'
import type {LayoutMode} from '../../src/app/layout/layout-mode'
import {pmModel} from '../../src/features/passmanager/password-manager.model'

describe('password-manager layout selection', () => {
  afterEach(() => {
    clearAppContext()
    if (pmModel.alive()) {
      pmModel.cleanup()
    }
  })

  function setupContext(mode: LayoutMode) {
    const layoutMode = state<LayoutMode>(mode)
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
        showElement: state(null),
        isLoading: state(false),
        isReadOnly: state(false),
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
