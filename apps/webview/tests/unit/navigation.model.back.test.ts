import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {atom} from '@reatom/core'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

type HistoryEntry = {
  state: unknown
  url: string
}

function setupContext() {
  const detailsPanelFileId = atom<number | null>(null)
  const currentPath = atom('/')
  const selectedNodeIds = atom<number[]>([])
  const selectionMode = atom(false)
  const showRemoteStoragePage = atom(false)
  const showRemotePage = atom(false)
  const showGatewayPage = atom(false)
  const showSettingsPage = atom(false)
  const isShowPasswordManager = atom(false)

  initAppContext(
    createMockAppContext({
      store: {
        detailsPanelFileId,
        currentPath,
        selectedNodeIds,
        selectionMode,
        showRemoteStoragePage,
        showRemotePage,
        showGatewayPage,
        showSettingsPage,
        isShowPasswordManager,
        setSelectionMode(enabled: boolean) {
          selectionMode.set(enabled)
          if (!enabled) {
            selectedNodeIds.set([])
          }
        },
      } as any,
    }),
  )

  return {
    currentPath,
    selectedNodeIds,
    selectionMode,
    showRemoteStoragePage,
    showRemotePage,
    showGatewayPage,
    showSettingsPage,
    isShowPasswordManager,
  }
}

function installHistoryTracker() {
  const originalPushState = window.history.pushState.bind(window.history)
  const originalReplaceState = window.history.replaceState.bind(window.history)
  const entries: HistoryEntry[] = [{state: window.history.state, url: window.location.href}]
  let index = 0

  const resolveUrl = (nextUrl?: string | URL | null) =>
    new URL(nextUrl == null ? window.location.href : String(nextUrl), window.location.href).toString()

  const pushStateSpy = vi
    .spyOn(window.history, 'pushState')
    .mockImplementation((state: unknown, unused: string, nextUrl?: string | URL | null) => {
      const resolvedUrl = resolveUrl(nextUrl)
      index += 1
      entries.splice(index)
      entries[index] = {state, url: resolvedUrl}
      originalPushState(state, unused, resolvedUrl)
    })

  const replaceStateSpy = vi
    .spyOn(window.history, 'replaceState')
    .mockImplementation((state: unknown, unused: string, nextUrl?: string | URL | null) => {
      const resolvedUrl = resolveUrl(nextUrl)
      entries[index] = {state, url: resolvedUrl}
      originalReplaceState(state, unused, resolvedUrl)
    })

  const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
    if (index === 0) {
      return
    }

    index -= 1
    const previous = entries[index]
    originalReplaceState(previous.state, '', previous.url)
    window.dispatchEvent(new PopStateEvent('popstate', {state: previous.state as any}))
  })

  return {
    backSpy,
    pushStateSpy,
    replaceStateSpy,
  }
}

describe('NavigationModel back behavior', () => {
  let ctx: ReturnType<typeof setupContext>

  beforeEach(() => {
    clearAppContext()
    navigationModel.disconnect()
    window.history.replaceState({}, '', '/dashboard?layout=mobile&surface=files&path=%2F')
    ctx = setupContext()
    navigationModel.connect()
  })

  afterEach(() => {
    navigationModel.disconnect()
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('falls back to the parent files path when there is no browser history entry', () => {
    navigationModel.navigateFilesPath('/vault/inner/', 'replace')

    expect(navigationModel.goBack()).toBe(true)
    expect(navigationModel.filesPath()).toBe('/vault/')
  })

  it('updates surface adapter flags when navigating to secondary surfaces', () => {
    navigationModel.navigateToSurface('settings')
    expect(navigationModel.currentSurface()).toBe('settings')
    expect(ctx.showSettingsPage()).toBe(true)

    navigationModel.navigateToSurface('remote')
    expect(navigationModel.currentSurface()).toBe('remote')
    expect(ctx.showRemotePage()).toBe(true)
    expect(ctx.showSettingsPage()).toBe(false)
  })

  it('falls back from the remote pair panel to remote hosts before leaving the remote surface', () => {
    navigationModel.navigateToRemotePanel('pair-ios', 'replace')

    expect(navigationModel.currentSurface()).toBe('remote')
    expect(navigationModel.remotePanel()).toBe('pair-ios')

    expect(navigationModel.goBack()).toBe(true)
    expect(navigationModel.currentSurface()).toBe('remote')
    expect(navigationModel.remotePanel()).toBe('hosts')
  })

  it('keeps transient surfaces active when their back handler consumes the event', () => {
    navigationModel.navigateToSurface('remote-storage')
    const handled = vi.fn(() => true)
    const unregister = navigationModel.registerSurfaceBackHandler('remote-storage', handled)

    expect(navigationModel.goBack()).toBe(true)
    expect(handled).toHaveBeenCalledTimes(1)
    expect(navigationModel.currentSurface()).toBe('remote-storage')

    unregister()
  })

  it('returns false on the root files surface when nothing can handle back', () => {
    expect(navigationModel.currentSurface()).toBe('files')
    expect(navigationModel.goBack()).toBe(false)
  })

  it('does not handle UI back on the root files surface or traverse sibling history', () => {
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)

    expect(navigationModel.currentSurface()).toBe('files')
    expect(navigationModel.goBackFromUi()).toBe(false)
    expect(historyBackSpy).not.toHaveBeenCalled()
    expect(navigationModel.currentSurface()).toBe('files')
    expect(navigationModel.filesPath()).toBe('/')
  })

  it('lets the files surface consume UI back for active selection mode', () => {
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    ctx.selectionMode.set(true)
    ctx.selectedNodeIds.set([42])

    const unregister = navigationModel.registerSurfaceBackHandler('files', () => {
      if (navigationModel.resolvedOverlay().kind !== 'closed') {
        return false
      }
      if (!ctx.selectionMode()) {
        return false
      }

      ctx.selectionMode.set(false)
      ctx.selectedNodeIds.set([])
      return true
    })

    expect(navigationModel.goBackFromUi()).toBe(true)
    expect(historyBackSpy).not.toHaveBeenCalled()
    expect(ctx.selectionMode()).toBe(false)
    expect(ctx.selectedNodeIds()).toEqual([])
    expect(navigationModel.currentSurface()).toBe('files')
    expect(navigationModel.filesPath()).toBe('/')

    unregister()
  })

  it.each([
    {previous: 'settings', current: 'passwords'},
    {previous: 'passwords', current: 'settings'},
    {previous: 'settings', current: 'remote'},
    {previous: 'settings', current: 'gateway'},
    {previous: 'settings', current: 'remote-storage'},
  ] as const)('blocks UI back from $current root when previous entry is sibling $previous', ({previous, current}) => {
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)

    navigationModel.navigateToSurface(previous)
    navigationModel.navigateToSurface(current)

    expect(navigationModel.goBackFromUi()).toBe(false)
    expect(historyBackSpy).not.toHaveBeenCalled()
    expect(navigationModel.currentSurface()).toBe(current)
  })

  it('falls back hierarchically for same-surface passwords routes in UI back', () => {
    const tracker = installHistoryTracker()

    navigationModel.navigateToSurface('passwords')
    navigationModel.openPassmanagerRoute({kind: 'group', groupPath: 'Group A'})
    navigationModel.openPassmanagerRoute({kind: 'entry', entryId: 'entry-a', groupPath: 'Group A'})

    expect(navigationModel.goBackFromUi()).toBe(true)
    expect(tracker.backSpy).not.toHaveBeenCalled()
    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'group', groupPath: 'Group A'})
  })

  it('falls back hierarchically for same-surface file routes in UI back', () => {
    const tracker = installHistoryTracker()

    navigationModel.navigateFilesPath('/vault/')
    navigationModel.navigateFilesPath('/vault/inner/')
    navigationModel.openDetails(42)

    expect(tracker.pushStateSpy).toHaveBeenCalledTimes(2)

    expect(navigationModel.goBackFromUi()).toBe(true)
    expect(tracker.backSpy).not.toHaveBeenCalled()
    expect(navigationModel.currentSurface()).toBe('files')
    expect(navigationModel.filesPath()).toBe('/vault/inner/')
    expect(navigationModel.isDetailsOpen()).toBe(false)
  })

  it('opens Markdown from Notes with the note parent path and browser back returns to Notes', () => {
    const tracker = installHistoryTracker()

    navigationModel.navigateToSurface('notes')
    navigationModel.openMarkdownDocument(77, 'push', '/vault/notes/')

    expect(navigationModel.snapshot()).toMatchObject({
      surface: 'files',
      files: {
        path: '/vault/notes/',
        document: {kind: 'markdown', fileId: 77, originSurface: 'notes'},
      },
    })
    expect(navigationModel.activeMobileTab()).toBe('notes')

    expect(navigationModel.goBack()).toBe(true)
    expect(tracker.backSpy).toHaveBeenCalledTimes(1)
    expect(navigationModel.snapshot()).toEqual({
      surface: 'notes',
      overlay: {kind: 'none'},
    })
  })

  it('falls back from a Notes-origin Markdown document to Notes when no browser entry exists', () => {
    const tracker = installHistoryTracker()

    navigationModel.navigateToSurface('notes', 'replace')
    navigationModel.openMarkdownDocument(77, 'replace', '/vault/notes/')

    expect(navigationModel.activeMobileTab()).toBe('notes')
    expect(navigationModel.goBack()).toBe(true)
    expect(tracker.backSpy).not.toHaveBeenCalled()
    expect(navigationModel.snapshot()).toEqual({
      surface: 'notes',
      overlay: {kind: 'none'},
    })
  })

  it('keeps files selection active while UI back closes an open overlay first', () => {
    const tracker = installHistoryTracker()

    ctx.selectionMode.set(true)
    ctx.selectedNodeIds.set([42])
    navigationModel.openDetails(42)

    const unregister = navigationModel.registerSurfaceBackHandler('files', () => {
      if (navigationModel.resolvedOverlay().kind !== 'closed') {
        return false
      }
      if (!ctx.selectionMode()) {
        return false
      }

      ctx.selectionMode.set(false)
      ctx.selectedNodeIds.set([])
      return true
    })

    expect(navigationModel.goBackFromUi()).toBe(true)
    expect(tracker.backSpy).not.toHaveBeenCalled()
    expect(navigationModel.isDetailsOpen()).toBe(false)
    expect(ctx.selectionMode()).toBe(true)
    expect(ctx.selectedNodeIds()).toEqual([42])

    unregister()
  })

  it('keeps a trailing browser back on the same files path after swipe-closing a pushed gallery overlay', () => {
    const tracker = installHistoryTracker()

    navigationModel.navigateToSurface('settings')
    navigationModel.navigateFilesPath('/vault/inner/')
    navigationModel.openGallery(7, 'push')

    expect(navigationModel.currentSurface()).toBe('files')
    expect(navigationModel.filesPath()).toBe('/vault/inner/')
    expect(navigationModel.snapshot().overlay).toEqual({kind: 'gallery', fileId: 7})

    navigationModel.closeOverlay('replace')
    window.history.back()

    expect(tracker.backSpy).toHaveBeenCalledTimes(1)
    expect(navigationModel.currentSurface()).toBe('files')
    expect(navigationModel.filesPath()).toBe('/vault/inner/')
    expect(navigationModel.snapshot().overlay).toEqual({kind: 'none'})
  })

  it('uses the previous files history entry for normal UI close of a pushed gallery overlay', () => {
    const tracker = installHistoryTracker()

    navigationModel.navigateFilesPath('/vault/inner/')
    navigationModel.openGallery(7, 'push')

    navigationModel.closeOverlayFromUi()

    expect(tracker.backSpy).toHaveBeenCalledTimes(1)
    expect(navigationModel.currentSurface()).toBe('files')
    expect(navigationModel.filesPath()).toBe('/vault/inner/')
    expect(navigationModel.snapshot().overlay).toEqual({kind: 'none'})
  })

  it('falls back within the passwords surface for deep-linked entry routes with no history', () => {
    navigationModel.disconnect()
    clearAppContext()
    window.history.replaceState({}, '', '/dashboard?layout=mobile&surface=passwords&pm=entry&entry=entry-a&group=Group+A')
    ctx = setupContext()
    navigationModel.connect()

    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(navigationModel.snapshot().passwords).toEqual({
      kind: 'entry',
      entryId: 'entry-a',
      groupPath: 'Group A',
    })

    expect(navigationModel.goBackFromUi()).toBe(true)
    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'group', groupPath: 'Group A'})
  })

  it('falls back to passwords root for deep-linked OTP quick view with no history', () => {
    navigationModel.disconnect()
    clearAppContext()
    window.history.replaceState({}, '', '/dashboard?layout=mobile&surface=passwords&pm=otp')
    ctx = setupContext()
    navigationModel.connect()

    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'otp-view'})

    expect(navigationModel.goBackFromUi()).toBe(true)
    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'root'})
  })

  it('falls back within the remote surface for deep-linked pair routes with no history', () => {
    navigationModel.disconnect()
    clearAppContext()
    window.history.replaceState({}, '', '/dashboard?layout=mobile&surface=remote&panel=pair-ios')
    ctx = setupContext()
    navigationModel.connect()

    expect(navigationModel.currentSurface()).toBe('remote')
    expect(navigationModel.remotePanel()).toBe('pair-ios')

    expect(navigationModel.goBackFromUi()).toBe(true)
    expect(navigationModel.currentSurface()).toBe('remote')
    expect(navigationModel.remotePanel()).toBe('hosts')
  })
})
