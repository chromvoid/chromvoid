import {beforeEach, describe, expect, it} from 'vitest'

import {
  resolveLayoutMode,
  applyLayoutQueryParam,
  LAYOUT_STORAGE_KEY,
} from '../../src/app/layout/layout-mode'

describe('layout-mode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('resolveLayoutMode', () => {
    it('returns "mobile" when isMobile runtime flag is true (auto mode)', () => {
      const result = resolveLayoutMode({
        isMobile: true,
        matchesBreakpoint: false,
        queryParam: null,
        persisted: null,
      })
      expect(result).toBe('mobile')
    })

    it('returns "desktop" when isMobile is false and breakpoint >= 768px', () => {
      const result = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: null,
        persisted: null,
      })
      expect(result).toBe('desktop')
    })

    it('returns "mobile" when isMobile is false but breakpoint <= 767px', () => {
      const result = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: true,
        queryParam: null,
        persisted: null,
      })
      expect(result).toBe('mobile')
    })

    it('query param "mobile" overrides runtime and breakpoint to mobile', () => {
      const result = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: 'mobile',
        persisted: null,
      })
      expect(result).toBe('mobile')
    })

    it('query param "desktop" overrides runtime mobile to desktop', () => {
      const result = resolveLayoutMode({
        isMobile: true,
        matchesBreakpoint: true,
        queryParam: 'desktop',
        persisted: null,
      })
      expect(result).toBe('desktop')
    })

    it('query param "auto" falls through to auto logic (mobile runtime)', () => {
      const result = resolveLayoutMode({
        isMobile: true,
        matchesBreakpoint: true,
        queryParam: 'auto',
        persisted: null,
      })
      expect(result).toBe('mobile')
    })

    it('query param "auto" falls through to auto logic (desktop breakpoint)', () => {
      const result = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: 'auto',
        persisted: null,
      })
      expect(result).toBe('desktop')
    })

    it('persisted "mobile" overrides breakpoint when query absent', () => {
      const result = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: null,
        persisted: 'mobile',
      })
      expect(result).toBe('mobile')
    })

    it('persisted "desktop" overrides mobile breakpoint when query absent', () => {
      const result = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: true,
        queryParam: null,
        persisted: 'desktop',
      })
      expect(result).toBe('desktop')
    })

    it('persisted "desktop" overrides mobile runtime when query absent', () => {
      const result = resolveLayoutMode({
        isMobile: true,
        matchesBreakpoint: true,
        queryParam: null,
        persisted: 'desktop',
      })
      expect(result).toBe('desktop')
    })

    it('query param overrides persisted value', () => {
      const result = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: 'mobile',
        persisted: 'desktop',
      })
      expect(result).toBe('mobile')
    })

    it('ignores invalid query param values', () => {
      const result = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: 'tablet' as any,
        persisted: null,
      })
      expect(result).toBe('desktop')
    })

    it('ignores invalid persisted values', () => {
      const result = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: null,
        persisted: 'tablet' as any,
      })
      expect(result).toBe('desktop')
    })
  })

  describe('applyLayoutQueryParam', () => {
    it('persists "mobile" to localStorage', () => {
      applyLayoutQueryParam('mobile')
      expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe('mobile')
    })

    it('persists "desktop" to localStorage', () => {
      applyLayoutQueryParam('desktop')
      expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe('desktop')
    })

    it('"auto" clears persisted override from localStorage', () => {
      localStorage.setItem(LAYOUT_STORAGE_KEY, 'mobile')
      applyLayoutQueryParam('auto')
      expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull()
    })

    it('ignores invalid values and does not modify storage', () => {
      localStorage.setItem(LAYOUT_STORAGE_KEY, 'mobile')
      applyLayoutQueryParam('tablet' as any)
      expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe('mobile')
    })
  })

  describe('isMobile input is read-only', () => {
    it('resolveLayoutMode does not mutate the isMobile input', () => {
      const isMobile = true
      resolveLayoutMode({
        isMobile,
        matchesBreakpoint: false,
        queryParam: 'desktop',
        persisted: null,
      })
      expect(isMobile).toBe(true)
    })
  })
})
