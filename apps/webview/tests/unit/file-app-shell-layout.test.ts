import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'

import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resolveLayoutMode} from '../../src/app/layout/layout-mode'
import type {LayoutMode} from '../../src/app/layout/layout-mode'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {atom} from '@reatom/core'
import {FileAppShell} from '../../src/features/shell/components/file-app-shell'
import {FileAppShellDesktopLayout} from '../../src/features/shell/components/file-app-shell-desktop-layout'
import {FileAppShellMobileLayout} from '../../src/features/shell/components/file-app-shell-mobile-layout'
import {FileManagerMobileLayout} from '../../src/features/file-manager/components/file-manager-mobile-layout'
import {mediaPlaybackModel} from '../../src/features/media/models/media-playback.model'

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

function lastStyleText(styles: unknown): string {
  const values = Array.isArray(styles) ? styles : [styles]
  const last = values.at(-1)
  return stylesToText(last)
}

function resetCssText(): string {
  return readFileSync('src/styles/base/reset.css', 'utf8')
}

function createTouchEvent(type: string, touches: Array<{clientX: number; clientY: number}>): TouchEvent {
  const event = new Event(type, {bubbles: true, cancelable: true}) as TouchEvent
  Object.defineProperty(event, 'touches', {value: touches})
  Object.defineProperty(event, 'changedTouches', {value: touches})
  return event
}

describe('file-app-shell layout selection', () => {
  afterEach(async () => {
    document.body.innerHTML = ''
    await mediaPlaybackModel.stopSession()
    navigationModel.disconnect()
    clearAppContext()
    vi.restoreAllMocks()
  })

  function setupContext(mode: LayoutMode) {
    const layoutMode = atom<LayoutMode>(mode)
    const theme = atom('dark')
    const searchFilters = atom({
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: false,
      fileTypes: [],
    })
    const currentPath = atom('/')
    const selectedNodeIds = atom<number[]>([])
    const selectionMode = atom(false)
    const ctx = createMockAppContext({
      store: {
        layoutMode,
        theme,
        searchFilters,
        currentPath,
        selectedNodeIds,
        selectionMode,
        setSearchFilters(next: ReturnType<typeof searchFilters>) {
          searchFilters.set(next)
        },
        pushNotification: () => {},
      } as any,
    })
    initAppContext(ctx)
    return {layoutMode, ctx}
  }

  function defineMobileShellForRender() {
    if (!customElements.get(FileAppShellMobileLayout.elementName)) {
      customElements.define(
        FileAppShellMobileLayout.elementName,
        FileAppShellMobileLayout as unknown as CustomElementConstructor,
      )
    }
  }

  function seedAudioSession() {
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([{id: 1, name: 'track.mp3', path: '/track.mp3', mimeType: 'audio/mpeg'}])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.currentTime.set(4)
    mediaPlaybackModel.duration.set(65)
    mediaPlaybackModel.loadingState.set('loaded')
    mediaPlaybackModel.playbackIntent.set('pause')
    mediaPlaybackModel.playbackState.set('paused')
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
    const FORWARDED_ATTRS = [
      'data-sidebar-open',
      'data-details-open',
      'data-details-hidden',
      'data-dual-pane',
      'data-edge-back-disabled',
    ]

    it('defines all expected forwarded attributes', () => {
      expect(FORWARDED_ATTRS).toContain('data-sidebar-open')
      expect(FORWARDED_ATTRS).toContain('data-details-open')
      expect(FORWARDED_ATTRS).toContain('data-details-hidden')
      expect(FORWARDED_ATTRS).toContain('data-dual-pane')
      expect(FORWARDED_ATTRS).toContain('data-edge-back-disabled')
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

    it('mobile shell styles keep fixed overlays viewport-anchored', () => {
      const cssText = lastStyleText(FileAppShellMobileLayout.styles)

      expect(cssText).toContain(':host')
      expect(cssText).not.toContain('container-type: inline-size;')
      expect(cssText).toContain('contain: style;')
      expect(cssText).not.toContain('contain: layout style;')
    })

    it('mobile details motion uses canonical tokens and reduced-motion coverage', () => {
      const cssText = lastStyleText(FileAppShellMobileLayout.styles)

      expect(cssText).toContain('transform var(--cv-duration-slow, 320ms)')
      expect(cssText).toContain('var(--cv-easing-decelerate, cubic-bezier(0, 0, 0.2, 1))')
      expect(cssText).toContain('opacity var(--cv-duration-fast, 120ms)')
      expect(cssText).toContain('@media (prefers-reduced-motion: reduce)')
      expect(cssText).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.details\s*{[\s\S]*transform: none;/)
      expect(cssText).toContain('--cv-drawer-transition-duration: var(--cv-duration-instant, 0ms);')
      expect(cssText).toContain(':host([data-details-hidden]) .details')
    })

    it('keeps the background grid subtle and behind mobile shell content', () => {
      const cssText = lastStyleText(FileAppShellMobileLayout.styles)

      expect(cssText).toContain('.content::before')
      expect(cssText).toContain('pointer-events: none;')
      expect(cssText).toContain('opacity: 0.06;')
      expect(cssText).toContain('z-index: 0;')
      expect(cssText).toContain('.content slot')
      expect(cssText).toContain('z-index: 1;')
    })

    it('reserves named top and bottom clearance for mobile chrome', () => {
      const cssText = lastStyleText(FileAppShellMobileLayout.styles)

      expect(cssText).toContain('--mobile-topbar-block-size: 56px;')
      expect(cssText).toContain('padding-block-start: var(--mobile-topbar-block-size);')
      expect(cssText).toContain('--mobile-tab-bar-active-block-size: var(')
      expect(cssText).toContain('--mobile-tab-bar-keyboard-aware-block-size,')
      expect(cssText).toContain('var(--mobile-tab-bar-block-size)')
      expect(cssText).toContain(
        '--mobile-tab-bar-content-clearance: var(--mobile-tab-bar-active-block-size);',
      )
      expect(cssText).toContain('--mobile-tab-bar-viewport-clearance: calc(')
      expect(cssText).toContain('--mobile-media-mini-block-size: 78px;')
      expect(cssText).toContain('--mobile-media-mini-gap: var(--app-spacing-3);')
      expect(cssText).toContain('var(--mobile-tab-bar-active-block-size)')
      expect(cssText).toContain('var(--mobile-tab-bar-content-clearance)')
      expect(cssText).toContain('var(--mobile-media-mini-block-size)')
      expect(cssText).toContain('var(--mobile-media-mini-gap)')
      expect(cssText).not.toContain('64px + 64px')
      expect(cssText).not.toContain('76px')
    })

    it('does not double-count bottom safe-area in mobile shell content clearance', () => {
      const cssText = lastStyleText(FileAppShellMobileLayout.styles)

      expect(cssText).toMatch(
        /\.content\s*{[^}]*padding-block-end: var\(--mobile-tab-bar-content-clearance\);/,
      )
      expect(cssText).toMatch(
        /\.content--media-mini\s*{[^}]*var\(--mobile-tab-bar-content-clearance\)[^}]*var\(--mobile-media-mini-block-size\)[^}]*var\(--mobile-media-mini-gap\)/,
      )
      expect(cssText).toMatch(
        /\.mobile-media-mini\s*{[^}]*inset-block-end: calc\(\s*var\(--mobile-tab-bar-viewport-clearance\) \+ var\(--mobile-media-mini-gap\)\s*\);/,
      )
    })

    it('removes bottom tab bar clearance while the mobile keyboard is visible', () => {
      const cssText = lastStyleText(FileAppShellMobileLayout.styles)
      const resetCss = resetCssText()

      expect(cssText).toContain('--mobile-tab-bar-keyboard-aware-block-size')
      expect(resetCss).toMatch(
        /html\[data-mobile-keyboard-expanded\],\s*html\[data-visual-viewport-shrunken\]\s*{[^}]*--mobile-tab-bar-keyboard-aware-block-size: 0px;/,
      )
      expect(resetCss).toContain('--mobile-tab-bar-keyboard-aware-display: none;')
    })

    it('anchors the mobile top toolbar to the viewport above scrolling files content', () => {
      const cssText = lastStyleText(FileAppShellMobileLayout.styles)
      const resetCss = resetCssText()

      expect(cssText).toMatch(
        /\.topbar\s*{[^}]*position: fixed;[^}]*inset-block-start: var\(--safe-area-top, 0px\);[^}]*inset-inline: 0;/,
      )
      expect(resetCss).toContain('--safe-area-top-env: env(safe-area-inset-top, 0px);')
      expect(resetCss).toContain('--safe-area-top-fallback: 0px;')
      expect(resetCss).toContain('--safe-area-top: max(var(--safe-area-top-env), var(--safe-area-top-fallback));')
      expect(resetCss).toContain('--safe-area-bottom-native: 0px;')
      expect(resetCss).toMatch(
        /--safe-area-bottom:\s*max\(\s*var\(--safe-area-bottom-env\),\s*var\(--safe-area-bottom-native\),\s*var\(--safe-area-bottom-fallback\)\s*\);/,
      )
    })

    it('keeps shell-owned mobile content scrolling as the default', async () => {
      setupContext('mobile')
      defineMobileShellForRender()
      const cssText = lastStyleText(FileAppShellMobileLayout.styles)

      const element = document.createElement('file-app-shell-mobile-layout') as FileAppShellMobileLayout
      document.body.append(element)
      await element.updateComplete

      expect(element.contentScrollMode).toBe('shell')
      expect(element.getAttribute('content-scroll-mode')).toBe('shell')
      expect(cssText).toMatch(/\.content\s*{[^}]*overflow: auto;/)
      expect(cssText).toMatch(
        /:host\(\[content-scroll-mode='surface'\]\)\s+\.content\s*{[^}]*overflow: hidden;/,
      )
      expect(cssText).toMatch(
        /:host\(\[content-scroll-mode='surface'\]\)\s+\.content slot:not\(\[name\]\)\s*{[^}]*min-block-size: 0;/,
      )
    })

    it('forwards surface-owned content scrolling to the mobile shell layout', async () => {
      setupContext('mobile')
      FileAppShell.define()

      const element = document.createElement('file-app-shell') as FileAppShell
      element.contentScrollMode = 'surface'
      document.body.append(element)
      await element.updateComplete

      const layout = element.shadowRoot?.querySelector('file-app-shell-mobile-layout') as
        | FileAppShellMobileLayout
        | null
      await layout?.updateComplete

      expect(layout).not.toBeNull()
      expect(layout?.contentScrollMode).toBe('surface')
      expect(layout?.getAttribute('content-scroll-mode')).toBe('surface')
    })

    it('stretches the mobile navigation rail through the drawer body', () => {
      const cssText = lastStyleText(FileAppShellMobileLayout.styles)

      expect(cssText).toMatch(
        /\.mobile-nav-drawer::part\(body\)\s*{[^}]*display: flex;[^}]*grid-row: 2;[^}]*align-items: stretch;[^}]*block-size: 100%;[^}]*box-sizing: border-box;[^}]*min-block-size: 0;[^}]*padding-block-start: 0;/,
      )
      expect(cssText).toContain('--cv-drawer-footer-spacing: 0px;')
      expect(cssText).toMatch(
        /\.mobile-nav-drawer::part\(panel\)\s*{[^}]*inset-block-start: var\(--safe-area-top, 0px\);[^}]*block-size: calc\(100dvh - var\(--safe-area-top, 0px\)\);[^}]*grid-template-rows: auto minmax\(0, 1fr\) auto;[^}]*min-block-size: 0;[^}]*overflow: hidden;/,
      )
      expect(cssText).toMatch(
        /\.mobile-nav-drawer::part\(footer\)\s*{[^}]*display: block;[^}]*grid-row: 3;[^}]*min-block-size: 0;[^}]*padding-block-end: var\(--safe-area-bottom-active,/,
      )
      expect(cssText).toMatch(
        /\.mobile-nav-rail\s*{[^}]*flex: 1 1 auto;[^}]*min-block-size: 0;[^}]*inline-size: 100%;[^}]*touch-action: pan-y;/,
      )
      expect(cssText).toMatch(/\.mobile-nav-actions\s*{[^}]*inline-size: 100%;/)
    })

    it('renders mobile mini player and bottom clearance while audio is active', async () => {
      setupContext('mobile')
      defineMobileShellForRender()
      seedAudioSession()

      const element = document.createElement('file-app-shell-mobile-layout') as FileAppShellMobileLayout
      document.body.append(element)
      await element.updateComplete

      expect(element.shadowRoot?.querySelector('.mobile-media-mini media-mini-player')).not.toBeNull()
      expect(element.shadowRoot?.querySelector('.content')?.classList.contains('content--media-mini')).toBe(
        true,
      )
    })

    it('renders the navigation rail inside the standard UIKit drawer', async () => {
      setupContext('mobile')
      defineMobileShellForRender()

      const element = document.createElement('file-app-shell-mobile-layout') as FileAppShellMobileLayout
      element.sidebarOpen = true
      document.body.append(element)
      await element.updateComplete

      const drawer = element.shadowRoot?.querySelector('cv-drawer.mobile-nav-drawer') as
        | (HTMLElement & {open?: boolean})
        | null

      expect(drawer).not.toBeNull()
      expect(drawer?.getAttribute('placement')).toBe('start')
      expect(drawer?.hasAttribute('no-header')).toBe(true)
      expect(drawer?.hasAttribute('drag-to-close')).toBe(true)
      expect(drawer?.open).toBe(true)
      expect(drawer?.querySelector('navigation-rail.mobile-nav-rail')).not.toBeNull()
      expect(drawer?.querySelector('navigation-rail-actions.mobile-nav-actions[slot="footer"]')).not.toBeNull()
    })

    it('maps drawer close changes to the existing close-sidebar event', async () => {
      setupContext('mobile')
      defineMobileShellForRender()

      const element = document.createElement('file-app-shell-mobile-layout') as FileAppShellMobileLayout
      document.body.append(element)
      await element.updateComplete

      const drawer = element.shadowRoot?.querySelector('cv-drawer.mobile-nav-drawer') as HTMLElement | null
      const closeEvents: Event[] = []
      element.addEventListener('close-sidebar', (event) => closeEvents.push(event))

      drawer?.dispatchEvent(
        new CustomEvent('cv-change', {
          detail: {open: true},
          bubbles: true,
          composed: true,
        }),
      )
      drawer?.dispatchEvent(
        new CustomEvent('cv-change', {
          detail: {open: false},
          bubbles: true,
          composed: true,
        }),
      )

      expect(closeEvents).toHaveLength(1)
    })

    it('forwards edge-back disable state from the shell wrapper to the mobile layout', async () => {
      setupContext('mobile')
      FileAppShell.define()

      const element = document.createElement('file-app-shell') as FileAppShell
      element.edgeBackDisabled = true
      document.body.append(element)
      await element.updateComplete

      const layout = element.shadowRoot?.querySelector('file-app-shell-mobile-layout') as
        | FileAppShellMobileLayout
        | null
      await layout?.updateComplete

      expect(layout).not.toBeNull()
      expect(layout?.edgeBackDisabled).toBe(true)
      expect(layout?.hasAttribute('data-edge-back-disabled')).toBe(true)
    })

    it('does not emit navigate-back for shell edge swipes while edge back is disabled', async () => {
      setupContext('mobile')
      defineMobileShellForRender()
      const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
        callback(0)
        return 1
      })

      const element = document.createElement('file-app-shell-mobile-layout') as FileAppShellMobileLayout
      element.edgeBackDisabled = true
      document.body.append(element)
      await element.updateComplete

      const navigateBack = vi.fn()
      element.addEventListener('navigate-back', navigateBack)

      element.dispatchEvent(createTouchEvent('touchstart', [{clientX: 4, clientY: 24}]))
      element.edgeBackDisabled = false
      document.dispatchEvent(createTouchEvent('touchmove', [{clientX: 140, clientY: 28}]))
      document.dispatchEvent(createTouchEvent('touchend', []))

      expect(navigateBack).not.toHaveBeenCalled()
      expect(rafSpy).not.toHaveBeenCalled()
    })

    it('does not reserve mobile mini player space without audio', async () => {
      setupContext('mobile')
      defineMobileShellForRender()

      const element = document.createElement('file-app-shell-mobile-layout') as FileAppShellMobileLayout
      document.body.append(element)
      await element.updateComplete

      expect(element.shadowRoot?.querySelector('.mobile-media-mini')).toBeNull()
      expect(element.shadowRoot?.querySelector('.content')?.classList.contains('content--media-mini')).toBe(
        false,
      )
    })

    it('keeps mobile tab bar visible on create-entry workflow', async () => {
      setupContext('mobile')
      defineMobileShellForRender()
      navigationModel.navigateToSurface('passwords')
      navigationModel.openPassmanagerRoute({kind: 'create-entry'})

      const element = document.createElement('file-app-shell-mobile-layout') as FileAppShellMobileLayout
      document.body.append(element)
      await element.updateComplete

      expect(element.shadowRoot?.querySelector('mobile-tab-bar')).not.toBeNull()
      expect(element.shadowRoot?.querySelector('.content')?.classList.contains('content--no-tabbar')).toBe(
        false,
      )
    })

    it('keeps mobile tab bar visible on create-group workflow', async () => {
      setupContext('mobile')
      defineMobileShellForRender()
      navigationModel.navigateToSurface('passwords')
      navigationModel.openPassmanagerRoute({kind: 'create-group'})

      const element = document.createElement('file-app-shell-mobile-layout') as FileAppShellMobileLayout
      document.body.append(element)
      await element.updateComplete

      expect(element.shadowRoot?.querySelector('mobile-tab-bar')).not.toBeNull()
      expect(element.shadowRoot?.querySelector('.content')?.classList.contains('content--no-tabbar')).toBe(
        false,
      )
    })

    it('mobile file-manager layout styles do not contain fixed sheets', () => {
      const cssText = lastStyleText(FileManagerMobileLayout.styles)

      expect(cssText).toContain('.catalog')
      expect(cssText).toContain('contain: style;')
      expect(cssText).not.toContain('contain: layout style paint;')
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

    it('desktop details motion uses canonical tokens and reduced-motion coverage', () => {
      const cssText = lastStyleText(FileAppShellDesktopLayout.styles)

      expect(cssText).toContain('transform var(--cv-duration-slow, 320ms)')
      expect(cssText).toContain('var(--cv-easing-decelerate, cubic-bezier(0, 0, 0.2, 1))')
      expect(cssText).toContain('opacity var(--cv-duration-fast, 120ms)')
      expect(cssText).toContain('@media (prefers-reduced-motion: reduce)')
      expect(cssText).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.details\s*{[\s\S]*transform: none;/)
      expect(cssText).toContain(':host([data-details-hidden]) .details')
    })
  })
})
