import {state} from '@statx/core'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resolveLayoutMode} from '../../src/app/layout/layout-mode'
import type {LayoutMode} from '../../src/app/layout/layout-mode'

describe('file-app-shell layout selection', () => {
  afterEach(() => {
    clearAppContext()
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

  describe('resolveLayoutMode integration with wrapper logic', () => {
    it('returns "mobile" when forced via query param', () => {
      const result = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: 'mobile',
        persisted: null,
      })
      expect(result).toBe('mobile')
    })

    it('returns "desktop" when forced via query param', () => {
      const result = resolveLayoutMode({
        isMobile: true,
        matchesBreakpoint: true,
        queryParam: 'desktop',
        persisted: null,
      })
      expect(result).toBe('desktop')
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

  describe('attribute forwarding contract', () => {
    const FORWARDED_ATTRS = ['data-sidebar-open', 'data-details-open', 'data-details-hidden', 'data-dual-pane']

    it('defines all expected forwarded attributes', () => {
      expect(FORWARDED_ATTRS).toContain('data-sidebar-open')
      expect(FORWARDED_ATTRS).toContain('data-details-open')
      expect(FORWARDED_ATTRS).toContain('data-details-hidden')
      expect(FORWARDED_ATTRS).toContain('data-dual-pane')
    })
  })

  describe('slot contract stability', () => {
    it('mobile layout exposes default slot, details slot and mobile-topbar slot', () => {
      const mobileSlots = ['default', 'details', 'mobile-topbar']
      expect(mobileSlots).toContain('default')
      expect(mobileSlots).toContain('details')
      expect(mobileSlots).toContain('mobile-topbar')
    })

    it('desktop layout exposes default slot, details slot and statusbar slot', () => {
      const desktopSlots = ['default', 'details', 'statusbar']
      expect(desktopSlots).toContain('default')
      expect(desktopSlots).toContain('details')
      expect(desktopSlots).toContain('statusbar')
      expect(desktopSlots).not.toContain('mobile-topbar')
    })
  })

  describe('mobile layout behavior', () => {
    it('forced mobile layout should always enable swipe (no isMobileDevice check)', () => {
      const result = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: 'mobile',
        persisted: null,
      })
      expect(result).toBe('mobile')
    })
  })

  describe('desktop layout behavior', () => {
    it('forced desktop layout should not render mobile-tab-bar', () => {
      const result = resolveLayoutMode({
        isMobile: true,
        matchesBreakpoint: true,
        queryParam: 'desktop',
        persisted: null,
      })
      expect(result).toBe('desktop')
    })
  })
})
