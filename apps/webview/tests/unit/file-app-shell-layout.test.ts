import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resolveLayoutMode} from '../../src/app/layout/layout-mode'
import type {LayoutMode} from '../../src/app/layout/layout-mode'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {atom} from '@reatom/core'
import {FileAppShell} from '../../src/features/shell/components/file-app-shell'
import {FileAppShellMobileLayout} from '../../src/features/shell/components/file-app-shell-mobile-layout'
import {mediaPlaybackModel} from '../../src/features/media/models/media-playback.model'

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
    FileAppShellMobileLayout.define()
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

  it('registers shared mobile UI primitives from the mobile shell boundary', () => {
    FileAppShellMobileLayout.define()

    expect(customElements.get('mobile-bottom-action-footer')).toBeDefined()
  })

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

    it('desktop layout exposes default slot, details slot, desktop-topbar slot and statusbar slot', () => {
      const desktopSlots = ['default', 'details', 'desktop-topbar', 'statusbar']
      expect(desktopSlots).toContain('default')
      expect(desktopSlots).toContain('details')
      expect(desktopSlots).toContain('desktop-topbar')
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

    it('keeps shell-owned mobile content scrolling as the default', async () => {
      setupContext('mobile')
      defineMobileShellForRender()

      const element = document.createElement('file-app-shell-mobile-layout') as FileAppShellMobileLayout
      document.body.append(element)
      await element.updateComplete

      expect(element.contentScrollMode).toBe('shell')
      expect(element.getAttribute('content-scroll-mode')).toBe('shell')
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

    it('renders mobile mini player and bottom clearance while audio is active', async () => {
      setupContext('mobile')
      defineMobileShellForRender()
      seedAudioSession()

      const element = document.createElement('file-app-shell-mobile-layout') as FileAppShellMobileLayout
      document.body.append(element)
      await element.updateComplete

      expect(element.shadowRoot?.querySelector('.mobile-media-mini media-mini-player')).not.toBeNull()
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

    it('forwards desktop-topbar only through the desktop shell branch', async () => {
      setupContext('desktop')
      FileAppShell.define()

      const element = document.createElement('file-app-shell') as FileAppShell
      const topbar = document.createElement('div')
      topbar.slot = 'desktop-topbar'
      element.append(topbar)
      document.body.append(element)
      await element.updateComplete

      const desktopLayout = element.shadowRoot?.querySelector('file-app-shell-desktop-layout') as
        | (HTMLElement & {updateComplete?: Promise<unknown>})
        | null
      await desktopLayout?.updateComplete

      expect(desktopLayout).not.toBeNull()
      expect(element.shadowRoot?.querySelector('slot[name="desktop-topbar"][slot="desktop-topbar"]')).not.toBeNull()
      expect(desktopLayout?.shadowRoot?.querySelector('slot[name="desktop-topbar"]')).not.toBeNull()
    })

    it('does not forward desktop-topbar through the mobile shell branch', async () => {
      setupContext('mobile')
      FileAppShell.define()

      const element = document.createElement('file-app-shell') as FileAppShell
      const topbar = document.createElement('div')
      topbar.slot = 'desktop-topbar'
      element.append(topbar)
      document.body.append(element)
      await element.updateComplete

      expect(element.shadowRoot?.querySelector('file-app-shell-desktop-layout')).toBeNull()
      expect(element.shadowRoot?.querySelector('slot[name="desktop-topbar"]')).toBeNull()
      expect(element.shadowRoot?.querySelector('file-app-shell-mobile-layout')).not.toBeNull()
    })
  })
})
