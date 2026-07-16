import {atom} from '@reatom/core'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import type {NavigationMotionPlan} from '../../src/app/navigation/navigation-motion.model'
import {encodeNavigationSnapshotToUrl} from '../../src/app/navigation/navigation-url-codec'
import {
  clearAppContext,
  createMockAppContext,
  initAppContext,
} from '../../src/shared/services/app-context'

function setupContext() {
  initAppContext(
    createMockAppContext({
      store: {
        currentPath: atom('/'),
        detailsPanelFileId: atom<number | null>(null),
        showRemoteStoragePage: atom(false),
        showRemotePage: atom(false),
        showGatewayPage: atom(false),
        showSettingsPage: atom(false),
        isShowPasswordManager: atom(false),
      } as never,
    }),
  )
}

describe('NavigationModel commit presenter', () => {
  beforeEach(() => {
    navigationModel.disconnect()
    clearAppContext()
    window.history.replaceState({}, '', '/dashboard?layout=mobile&surface=files&path=%2F')
    setupContext()
    navigationModel.connect()
  })

  afterEach(() => {
    navigationModel.disconnect()
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('defers a page commit until the presenter update callback', async () => {
    let commit!: () => void
    let finish!: () => void
    let plan!: NavigationMotionPlan
    const unregister = navigationModel.registerCommitPresenter((request) => {
      plan = request.plan
      commit = request.commit
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    })

    navigationModel.navigateFilesPath('/vault/')

    expect(plan).toMatchObject({kind: 'page', direction: 'forward'})
    expect(navigationModel.filesPath()).toBe('/')
    commit()
    expect(navigationModel.filesPath()).toBe('/vault/')

    let settled = false
    const settlement = navigationModel.whenSettled().then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    finish()
    await settlement
    expect(settled).toBe(true)
    unregister()
  })

  it('keeps UI back accepted while its commit is deferred', async () => {
    navigationModel.navigateFilesPath('/vault/inner/', 'replace')
    let commit!: () => void
    let finish!: () => void
    const unregister = navigationModel.registerCommitPresenter((request) => {
      commit = request.commit
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    })

    expect(navigationModel.goBackFromUi()).toBe(true)
    expect(navigationModel.filesPath()).toBe('/vault/inner/')
    commit()
    expect(navigationModel.filesPath()).toBe('/vault/')
    finish()
    await navigationModel.whenSettled()
    unregister()
  })

  it('commits without motion when a presenter rejects before update', async () => {
    const unregister = navigationModel.registerCommitPresenter(() => {
      throw new Error('presentation unavailable')
    })

    navigationModel.navigateFilesPath('/vault/')
    await navigationModel.whenSettled()

    expect(navigationModel.filesPath()).toBe('/vault/')
    unregister()
  })

  it('aborts a deferred surface presentation before a newer navigation commits', async () => {
    let releasePasswords!: () => void
    let passwordsSignal!: AbortSignal
    const unregister = navigationModel.registerCommitPresenter((request) => {
      if (request.next.surface === 'passwords') {
        passwordsSignal = request.signal
        return new Promise<void>((resolve) => {
          releasePasswords = resolve
        })
      }

      request.commit()
    })

    navigationModel.navigateToSurface('passwords')
    expect(navigationModel.currentSurface()).toBe('files')

    navigationModel.navigateToSurface('notes')
    expect(passwordsSignal.aborted).toBe(true)
    expect(navigationModel.currentSurface()).toBe('notes')

    releasePasswords()
    await navigationModel.whenSettled()
    expect(navigationModel.currentSurface()).toBe('notes')
    unregister()
  })

  it('finalizes a deferred popstate index before the next history push', async () => {
    navigationModel.navigateFilesPath('/vault/')
    navigationModel.navigateFilesPath('/vault/inner/')
    let commit!: () => void
    let finish!: () => void
    const unregister = navigationModel.registerCommitPresenter((request) => {
      commit = request.commit
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    const targetUrl = encodeNavigationSnapshotToUrl(
      {
        surface: 'files',
        files: {path: '/vault/'},
        overlay: {kind: 'none'},
      },
      window.location.href,
    )
    window.history.replaceState({__chromvoidNavIndex: 1}, '', targetUrl)

    window.dispatchEvent(new PopStateEvent('popstate', {state: {__chromvoidNavIndex: 1}}))
    expect(navigationModel.filesPath()).toBe('/vault/inner/')
    commit()
    expect(navigationModel.filesPath()).toBe('/vault/')
    finish()
    await navigationModel.whenSettled()
    await Promise.resolve()
    unregister()

    navigationModel.navigateFilesPath('/vault/next/')
    expect(window.history.state).toMatchObject({__chromvoidNavIndex: 2})
  })
})
