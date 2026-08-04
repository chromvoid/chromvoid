import {describe, expect, it} from 'vitest'

import {resolveLayoutMode} from '../../src/app/layout/layout-mode'
import {FileManagerMobileLayout} from '../../src/features/file-manager/components/file-manager-mobile-layout'
import {i18n} from '../../src/i18n'

describe('file-manager layout selection', () => {
  it('exposes one named mobile files group for accessibility automation', async () => {
    FileManagerMobileLayout.define()
    const element = document.createElement('file-manager-mobile-layout') as FileManagerMobileLayout
    document.body.append(element)
    await element.updateComplete

    const groups = element.shadowRoot?.querySelectorAll('#app\\.files\\.root')
    const group = groups?.item(0)

    expect(groups).toHaveLength(1)
    expect(group?.getAttribute('role')).toBe('group')
    expect(group?.getAttribute('aria-label')).toBe(i18n('navigation:files-description'))

    element.remove()
  })

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
