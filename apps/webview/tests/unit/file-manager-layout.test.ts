import {describe, expect, it} from 'vitest'

import {resolveLayoutMode} from '../../src/app/layout/layout-mode'

describe('file-manager layout selection', () => {
  describe('wrapper selects layout deterministically based on layoutMode', () => {
    const selectLayout = (mode: 'mobile' | 'desktop') =>
      mode === 'mobile' ? 'file-manager-mobile-layout' : 'file-manager-desktop-layout'

    it('selects mobile layout when layoutMode is "mobile"', () => {
      const mode = resolveLayoutMode({
        isMobile: true,
        matchesBreakpoint: true,
        queryParam: null,
        persisted: null,
      })
      expect(mode).toBe('mobile')
      expect(selectLayout(mode)).toBe('file-manager-mobile-layout')
    })

    it('selects desktop layout when layoutMode is "desktop"', () => {
      const mode = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: null,
        persisted: null,
      })
      expect(mode).toBe('desktop')
      expect(selectLayout(mode)).toBe('file-manager-desktop-layout')
    })

    it('query param "mobile" forces mobile layout on desktop viewport', () => {
      const mode = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: 'mobile',
        persisted: null,
      })
      expect(mode).toBe('mobile')
      expect(selectLayout(mode)).toBe('file-manager-mobile-layout')
    })

    it('query param "desktop" forces desktop layout on mobile runtime', () => {
      const mode = resolveLayoutMode({
        isMobile: true,
        matchesBreakpoint: true,
        queryParam: 'desktop',
        persisted: null,
      })
      expect(mode).toBe('desktop')
      expect(selectLayout(mode)).toBe('file-manager-desktop-layout')
    })

    it('persisted "mobile" overrides breakpoint for mobile layout', () => {
      const mode = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: null,
        persisted: 'mobile',
      })
      expect(mode).toBe('mobile')
      expect(selectLayout(mode)).toBe('file-manager-mobile-layout')
    })

    it('persisted "desktop" overrides mobile breakpoint for desktop layout', () => {
      const mode = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: true,
        queryParam: null,
        persisted: 'desktop',
      })
      expect(mode).toBe('desktop')
      expect(selectLayout(mode)).toBe('file-manager-desktop-layout')
    })

    it('query param takes priority over persisted value', () => {
      const mode = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: 'mobile',
        persisted: 'desktop',
      })
      expect(mode).toBe('mobile')
      expect(selectLayout(mode)).toBe('file-manager-mobile-layout')
    })

    it('auto fallback uses breakpoint when runtime is not mobile', () => {
      const mobileBreakpoint = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: true,
        queryParam: 'auto',
        persisted: null,
      })
      expect(selectLayout(mobileBreakpoint)).toBe('file-manager-mobile-layout')

      const desktopBreakpoint = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: 'auto',
        persisted: null,
      })
      expect(selectLayout(desktopBreakpoint)).toBe('file-manager-desktop-layout')
    })
  })

  describe('layout selection is binary', () => {
    it('only two possible outcomes: mobile or desktop', () => {
      const allCombinations: Array<{isMobile: boolean; matchesBreakpoint: boolean; queryParam: string | null; persisted: string | null}> = []

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
