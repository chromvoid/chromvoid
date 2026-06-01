import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Entry, Group, ManagerRoot} from '@project/passmanager'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {encodeNavigationSnapshotToUrl} from '../../src/app/navigation/navigation-url-codec'
import {atom} from '@reatom/core'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {pmMobileChromeModel} from '../../src/features/passmanager/models/pm-mobile-chrome.model'
import {pmSelectionModeModel} from '../../src/features/passmanager/models/pm-selection-mode.model'
import {pmModel} from '../../src/features/passmanager/password-manager.model'

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
        openDetailsPanel(fileId: number) {
          detailsPanelFileId.set(fileId)
        },
        closeDetailsPanel() {
          detailsPanelFileId.set(null)
        },
      } as any,
    }),
  )
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

async function flushNavigationSync(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
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

  return {
    backSpy,
    goSpy,
    pushStateSpy,
    replaceStateSpy,
  }
}

describe('NavigationModel history sync', () => {
  let originalPassmanager: typeof window.passmanager

  beforeEach(() => {
    clearAppContext()
    resetRuntimeCapabilities()
    navigationModel.disconnect()
    window.history.replaceState({}, '', '/dashboard?layout=mobile&surface=files&path=%2F')
    setupContext()
    navigationModel.connect()
    originalPassmanager = window.passmanager
  })

  afterEach(() => {
    window.passmanager = originalPassmanager
    navigationModel.disconnect()
    pmSelectionModeModel.exit()
    resetRuntimeCapabilities()
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('updates the passmanager URL after popstate and the next entry open', () => {
    navigationModel.openPassmanagerRoute({kind: 'group', groupPath: 'Group A'})
    navigationModel.openPassmanagerRoute({kind: 'entry', entryId: 'entry-a', groupPath: 'Group A'})

    expect(window.location.search).toContain('surface=passwords')
    expect(window.location.search).toContain('pm=entry')
    expect(window.location.search).toContain('entry=entry-a')

    const groupUrl = encodeNavigationSnapshotToUrl(
      {
        surface: 'passwords',
        passwords: {kind: 'group', groupPath: 'Group A'},
        overlay: {kind: 'none'},
      },
      window.location.href,
    )

    window.history.replaceState({__chromvoidNavIndex: 1}, '', groupUrl)
    window.dispatchEvent(new PopStateEvent('popstate', {state: {__chromvoidNavIndex: 1}}))

    expect(window.location.search).toContain('pm=group')
    expect(window.location.search).toContain('group=Group+A')
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'group', groupPath: 'Group A'})

    navigationModel.openPassmanagerRoute({kind: 'entry', entryId: 'entry-b', groupPath: 'Group A'})

    expect(window.location.search).toContain('pm=entry')
    expect(window.location.search).toContain('entry=entry-b')
    expect(window.location.search).not.toContain('entry=entry-a')
  })

  it('canonicalizes the legacy network-pair URL alias into the remote pair panel', () => {
    navigationModel.disconnect()
    clearAppContext()
    window.history.replaceState({}, '', '/dashboard?surface=network-pair')
    setupContext()
    navigationModel.connect()

    expect(navigationModel.currentSurface()).toBe('remote')
    expect(navigationModel.remotePanel()).toBe('pair-ios')
    expect(window.location.search).toContain('surface=remote')
    expect(window.location.search).toContain('panel=pair-ios')
    expect(window.location.search).not.toContain('surface=network-pair')
  })

  it('encodes remote host panels on the canonical remote surface', () => {
    const pairUrl = encodeNavigationSnapshotToUrl(
      {
        surface: 'remote',
        remote: {panel: 'pair-ios'},
        overlay: {kind: 'none'},
      },
      window.location.href,
    )

    expect(pairUrl).toContain('surface=remote')
    expect(pairUrl).toContain('panel=pair-ios')
    expect(pairUrl).not.toContain('surface=network-pair')
  })

  it('restores the previously opened passwords row after durable route back', () => {
    const root = new ManagerRoot({} as any)
    const group = createGroup('group-restore-a', 'Group Restore A')
    const entry = createEntry(group, 'entry-restore-a', 'Entry Restore A')

    group.entries.set([entry])
    root.entries.set([group])
    window.passmanager = root
    navigationModel.attachPassmanager(root)

    navigationModel.navigateToSurface('passwords')
    navigationModel.openPassmanagerRoute({kind: 'group', groupPath: group.name})
    navigationModel.openPassmanagerRoute({kind: 'entry', entryId: entry.id, groupPath: group.name})

    const groupUrl = encodeNavigationSnapshotToUrl(
      {
        surface: 'passwords',
        passwords: {kind: 'group', groupPath: group.name},
        overlay: {kind: 'none'},
      },
      window.location.href,
    )

    window.history.replaceState({__chromvoidNavIndex: 1}, '', groupUrl)
    window.dispatchEvent(new PopStateEvent('popstate', {state: {__chromvoidNavIndex: 1}}))

    expect(root.showElement()).toBe(group)
    expect(pmModel.consumeRestoreSelection(group.id)).toBe(entry.id)
  })

  it('pushes OTP quick view history and restores the source entry on browser back', () => {
    const tracker = installHistoryTracker()
    const root = new ManagerRoot({} as any)
    const group = createGroup('group-otp-history', 'Group OTP History')
    const entry = createEntry(group, 'entry-otp-history', 'Entry OTP History')

    group.entries.set([entry])
    root.entries.set([group])
    window.passmanager = root
    navigationModel.attachPassmanager(root)

    navigationModel.navigateToSurface('passwords')
    navigationModel.openPassmanagerRoute({kind: 'group', groupPath: group.name})
    navigationModel.openPassmanagerRoute({kind: 'entry', entryId: entry.id, groupPath: group.name})

    pmModel.openOtpView()

    expect(root.showElement()).toBe('otpView')
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'otp-view'})
    expect(window.location.search).toContain('pm=otp')

    window.history.back()

    expect(tracker.backSpy).toHaveBeenCalledTimes(1)
    expect(root.showElement()).toBe(entry)
    expect(navigationModel.snapshot().passwords).toEqual({
      kind: 'entry',
      entryId: entry.id,
      groupPath: group.name,
    })
  })

  it('consumes popstate locally when passwords selection mode is active and preserves the next durable back target', () => {
    const tracker = installHistoryTracker()
    const root = new ManagerRoot({} as any)
    const group = createGroup('group-selection-a', 'Group Selection A')

    root.entries.set([group])
    root.showElement.set(root)
    window.passmanager = root
    navigationModel.attachPassmanager(root)

    navigationModel.navigateToSurface('remote')
    navigationModel.navigateToSurface('passwords')

    const unregister = navigationModel.registerSurfaceBackHandler('passwords', () => pmMobileChromeModel.handleBack())
    pmSelectionModeModel.enterWithGroup(group.id)

    expect(pmSelectionModeModel.active()).toBe(true)
    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'root'})

    window.history.back()

    expect(tracker.backSpy).toHaveBeenCalledTimes(1)
    expect(tracker.goSpy).toHaveBeenCalledWith(1)
    expect(pmSelectionModeModel.active()).toBe(false)
    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'root'})
    expect(root.showElement()).toBe(root)
    expect(window.location.search).toContain('surface=passwords')

    window.history.back()

    expect(tracker.backSpy).toHaveBeenCalledTimes(2)
    expect(navigationModel.currentSurface()).toBe('remote')

    unregister()
  })

  it('replaces Android mobile top-level surface history so back cannot traverse files to passwords', () => {
    setRuntimeCapabilities({platform: 'android', mobile: true})
    const tracker = installHistoryTracker()

    navigationModel.navigateToSurface('passwords')

    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(window.location.search).toContain('surface=passwords')
    expect(tracker.pushStateSpy).not.toHaveBeenCalled()
    expect(tracker.replaceStateSpy).toHaveBeenCalledTimes(1)

    window.history.back()

    expect(tracker.backSpy).toHaveBeenCalledTimes(1)
    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'root'})
  })

  it('keeps Android mobile same-surface route history for hierarchical back inside passwords', () => {
    setRuntimeCapabilities({platform: 'android', mobile: true})
    const tracker = installHistoryTracker()

    navigationModel.navigateToSurface('passwords')
    navigationModel.openPassmanagerRoute({kind: 'group', groupPath: 'Group A'})

    expect(tracker.pushStateSpy).toHaveBeenCalledTimes(1)
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'group', groupPath: 'Group A'})

    window.history.back()

    expect(tracker.backSpy).toHaveBeenCalledTimes(1)
    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'root'})
  })

  it('ignores stale browser history entries after reset', () => {
    navigationModel.navigateFilesPath('/vault/inner/')

    const staleUrl = window.location.href
    const staleState = {
      __chromvoidNavIndex: 1,
      __chromvoidNavGeneration: 0,
    }

    navigationModel.reset()
    expect(navigationModel.filesPath()).toBe('/')

    window.history.replaceState(staleState, '', staleUrl)
    window.dispatchEvent(new PopStateEvent('popstate', {state: staleState}))

    expect(navigationModel.currentSurface()).toBe('files')
    expect(navigationModel.filesPath()).toBe('/')
    expect(window.location.search).toContain('surface=files')
    expect(window.location.search).toContain('path=%2F')
    expect(window.location.search).not.toContain('%2Fvault%2Finner%2F')
  })

  it('does not push a new history entry when the next snapshot and URL are unchanged', () => {
    navigationModel.navigateFilesPath('/vault/inner/')

    const pushStateSpy = vi.spyOn(window.history, 'pushState')
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    pushStateSpy.mockClear()
    replaceStateSpy.mockClear()

    navigationModel.navigateFilesPath('/vault/inner/')

    expect(navigationModel.filesPath()).toBe('/vault/inner/')
    expect(pushStateSpy).not.toHaveBeenCalled()
    expect(replaceStateSpy).not.toHaveBeenCalled()
  })

  it('replaces create-entry history with the saved entry route during external sync', async () => {
    const root = new ManagerRoot({} as any)
    const group = createGroup('group-a', 'Group A')
    const entry = createEntry(group, 'entry-a', 'Entry A')

    group.entries.set([entry])
    root.entries.set([group])
    window.passmanager = root
    navigationModel.attachPassmanager(root)

    navigationModel.navigateToSurface('passwords')
    navigationModel.openPassmanagerRoute({kind: 'group', groupPath: 'Group A'})
    navigationModel.openPassmanagerRoute({kind: 'create-entry', targetGroupPath: 'Group A'})

    const pushStateSpy = vi.spyOn(window.history, 'pushState')
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')

    root.showElement.set(entry)
    await flushNavigationSync()

    expect(navigationModel.snapshot().passwords).toEqual({
      kind: 'entry',
      entryId: 'entry-a',
      groupPath: 'Group A',
    })
    expect(window.location.search).toContain('pm=entry')
    expect(window.location.search).toContain('entry=entry-a')
    expect(pushStateSpy).not.toHaveBeenCalled()
    expect(replaceStateSpy).toHaveBeenCalledTimes(1)
  })

  it('replaces create-group history with the saved group route during external sync', async () => {
    const root = new ManagerRoot({} as any)
    const parentGroup = createGroup('group-parent', 'Group A')
    const childGroup = createGroup('group-child', 'Group A/Subgroup')

    root.entries.set([parentGroup, childGroup])
    window.passmanager = root
    navigationModel.attachPassmanager(root)

    navigationModel.navigateToSurface('passwords')
    navigationModel.openPassmanagerRoute({kind: 'group', groupPath: 'Group A'})
    navigationModel.openPassmanagerRoute({kind: 'create-group'})

    root.showElement.set(childGroup)
    const pushStateSpy = vi.spyOn(window.history, 'pushState')
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    await flushNavigationSync()

    expect(navigationModel.snapshot().passwords).toEqual({
      kind: 'group',
      groupPath: 'Group A/Subgroup',
    })
    expect(window.location.search).toContain('pm=group')
    expect(window.location.search).toContain('group=Group+A%2FSubgroup')
    expect(pushStateSpy).not.toHaveBeenCalled()
    expect(replaceStateSpy).toHaveBeenCalledTimes(1)
  })

  it('does not echo passmanager route changes back through external sync', async () => {
    const root = new ManagerRoot({} as any)
    const group = createGroup('group-loop-a', 'Group Loop A')

    root.entries.set([group])
    root.showElement.set(root)
    window.passmanager = root
    navigationModel.attachPassmanager(root)

    navigationModel.navigateToSurface('passwords')

    const pushStateSpy = vi.spyOn(window.history, 'pushState')
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    pushStateSpy.mockClear()
    replaceStateSpy.mockClear()

    navigationModel.openPassmanagerRoute({kind: 'group', groupPath: group.name})
    await flushNavigationSync()

    expect(navigationModel.snapshot().passwords).toEqual({
      kind: 'group',
      groupPath: group.name,
    })
    expect(root.showElement()).toBe(group)
    expect(pushStateSpy).toHaveBeenCalledTimes(1)
    expect(replaceStateSpy).not.toHaveBeenCalled()
  })
})
