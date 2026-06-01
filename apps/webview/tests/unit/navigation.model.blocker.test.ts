import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import type {NavigationBlockerIntent} from '../../src/app/navigation/navigation.types'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

type HistoryEntry = {
  state: unknown
  url: string
}

function setupContext() {
  const detailsPanelFileId = atom<number | null>(null)
  const currentPath = atom('/')
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
        showRemoteStoragePage,
        showRemotePage,
        showGatewayPage,
        showSettingsPage,
        isShowPasswordManager,
      } as any,
    }),
  )
}

function installHistoryTracker() {
  const originalPushState = window.history.pushState.bind(window.history)
  const originalReplaceState = window.history.replaceState.bind(window.history)
  const entries: HistoryEntry[] = [{state: window.history.state, url: window.location.href}]
  let index = 0

  const resolveUrl = (nextUrl?: string | URL | null) =>
    new URL(nextUrl == null ? window.location.href : String(nextUrl), window.location.href).toString()

  vi.spyOn(window.history, 'pushState').mockImplementation(
    (state: unknown, unused: string, nextUrl?: string | URL | null) => {
      const resolvedUrl = resolveUrl(nextUrl)
      index += 1
      entries.splice(index)
      entries[index] = {state, url: resolvedUrl}
      originalPushState(state, unused, resolvedUrl)
    },
  )

  vi.spyOn(window.history, 'replaceState').mockImplementation(
    (state: unknown, unused: string, nextUrl?: string | URL | null) => {
      const resolvedUrl = resolveUrl(nextUrl)
      entries[index] = {state, url: resolvedUrl}
      originalReplaceState(state, unused, resolvedUrl)
    },
  )

  const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
    if (index === 0) {
      return
    }

    index -= 1
    const previous = entries[index]
    originalReplaceState(previous.state, '', previous.url)
    window.dispatchEvent(new PopStateEvent('popstate', {state: previous.state as any}))
  })

  const goSpy = vi.spyOn(window.history, 'go').mockImplementation((delta?: number) => {
    const nextDelta = Number(delta ?? 0)
    if (!Number.isFinite(nextDelta) || nextDelta === 0) {
      return
    }

    const nextIndex = Math.min(entries.length - 1, Math.max(0, index + nextDelta))
    if (nextIndex === index) {
      return
    }

    index = nextIndex
    const next = entries[index]
    originalReplaceState(next.state, '', next.url)
    window.dispatchEvent(new PopStateEvent('popstate', {state: next.state as any}))
  })

  return {backSpy, goSpy}
}

describe('NavigationModel blockers', () => {
  beforeEach(() => {
    clearAppContext()
    navigationModel.disconnect()
    window.history.replaceState({}, '', '/dashboard?layout=mobile&surface=files&path=%2F')
    setupContext()
    navigationModel.connect()
  })

  afterEach(() => {
    navigationModel.disconnect()
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('blocks path changes and resumes the approved intent once', () => {
    let resume: (() => void) | null = null
    const blocker = vi.fn((intent: NavigationBlockerIntent, next: () => void) => {
      if (intent.kind !== 'path-change') {
        return false
      }
      resume = next
      return true
    })
    const unregister = navigationModel.registerNavigationBlocker(blocker)

    navigationModel.navigateFilesPath('/vault/')

    expect(navigationModel.filesPath()).toBe('/')
    expect(blocker).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'path-change',
        historyMode: 'push',
        next: expect.objectContaining({files: {path: '/vault/'}}),
      }),
      expect.any(Function),
    )

    resume?.()
    resume?.()

    expect(navigationModel.filesPath()).toBe('/vault/')
    expect(blocker.mock.calls.filter(([intent]) => intent.kind === 'path-change')).toHaveLength(1)

    unregister()
  })

  it('blocks overlay open and close intents without mutating navigation state', () => {
    const resumes: Array<() => void> = []
    const blocker = vi.fn((intent: NavigationBlockerIntent, resume: () => void) => {
      if (intent.kind !== 'open-overlay' && intent.kind !== 'close-overlay') {
        return false
      }
      resumes.push(resume)
      return true
    })
    const unregister = navigationModel.registerNavigationBlocker(blocker)

    navigationModel.openPreview(42)

    expect(navigationModel.snapshot().overlay).toEqual({kind: 'none'})
    resumes.shift()?.()
    expect(navigationModel.snapshot().overlay).toEqual({kind: 'preview', fileId: 42})

    navigationModel.closeOverlay()

    expect(navigationModel.snapshot().overlay).toEqual({kind: 'preview', fileId: 42})
    resumes.shift()?.()
    expect(navigationModel.snapshot().overlay).toEqual({kind: 'none'})

    unregister()
  })

  it('restores current history entry when popstate is blocked and resumes the original traversal', () => {
    const tracker = installHistoryTracker()
    let resume: (() => void) | null = null
    const blocker = vi.fn((intent: NavigationBlockerIntent, next: () => void) => {
      if (intent.kind !== 'history-pop') {
        return false
      }
      resume = next
      return true
    })
    const unregister = navigationModel.registerNavigationBlocker(blocker)

    navigationModel.navigateFilesPath('/vault/')
    navigationModel.navigateFilesPath('/vault/inner/')

    window.history.back()

    expect(tracker.backSpy).toHaveBeenCalledTimes(1)
    expect(tracker.goSpy).toHaveBeenCalledWith(1)
    expect(navigationModel.filesPath()).toBe('/vault/inner/')
    expect(window.location.search).toContain('path=%2Fvault%2Finner%2F')

    resume?.()

    expect(tracker.goSpy).toHaveBeenLastCalledWith(-1)
    expect(navigationModel.filesPath()).toBe('/vault/')
    expect(window.location.search).toContain('path=%2Fvault%2F')

    unregister()
  })

  it('blocks fallback UI back snapshots and resumes them without re-entering blockers', () => {
    let resume: (() => void) | null = null
    const blocker = vi.fn((intent: NavigationBlockerIntent, next: () => void) => {
      if (intent.kind !== 'ui-back') {
        return false
      }
      resume = next
      return true
    })
    const unregister = navigationModel.registerNavigationBlocker(blocker)

    navigationModel.navigateFilesPath('/vault/inner/', 'replace')

    expect(navigationModel.goBackFromUi()).toBe(true)
    expect(navigationModel.filesPath()).toBe('/vault/inner/')

    resume?.()

    expect(navigationModel.filesPath()).toBe('/vault/')
    expect(blocker.mock.calls.filter(([intent]) => intent.kind === 'ui-back')).toHaveLength(1)

    unregister()
  })
})
