import {state} from '@statx/core'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Entry, Group, ManagerRoot} from '@project/passmanager'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {encodeNavigationSnapshotToUrl} from '../../src/app/navigation/navigation-url-codec'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

function setupContext() {
  const detailsPanelFileId = state<number | null>(null)
  const currentPath = state('/')
  const showRemoteStoragePage = state(false)
  const showRemotePage = state(false)
  const showGatewayPage = state(false)
  const showSettingsPage = state(false)
  const showNetworkPairPage = state(false)
  const isShowPasswordManager = state(false)

  initAppContext(
    createMockAppContext({
      store: {
        detailsPanelFileId,
        currentPath,
        showRemoteStoragePage,
        showRemotePage,
        showGatewayPage,
        showSettingsPage,
        showNetworkPairPage,
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

describe('NavigationModel history sync', () => {
  let originalPassmanager: typeof window.passmanager

  beforeEach(() => {
    clearAppContext()
    navigationModel.disconnect()
    window.history.replaceState({}, '', '/dashboard?layout=mobile&surface=files&path=%2F')
    setupContext()
    navigationModel.connect()
    originalPassmanager = window.passmanager
  })

  afterEach(() => {
    window.passmanager = originalPassmanager
    navigationModel.disconnect()
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

  it('replaces entry-edit history with the saved entry route during external sync', async () => {
    const root = new ManagerRoot({} as any)
    const group = createGroup('group-a', 'Group A')
    const entry = createEntry(group, 'entry-a', 'Entry A')

    group.entries.set([entry])
    root.entries.set([group])
    window.passmanager = root
    navigationModel.attachPassmanager(root)

    navigationModel.navigateToSurface('passwords')
    navigationModel.openPassmanagerRoute({kind: 'group', groupPath: 'Group A'})
    navigationModel.openPassmanagerRoute({kind: 'entry-edit', entryId: 'entry-a', groupPath: 'Group A'})

    const pushStateSpy = vi.spyOn(window.history, 'pushState')
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')

    root.isEditMode.set(false)
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
})
