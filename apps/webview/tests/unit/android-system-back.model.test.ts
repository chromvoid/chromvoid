import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {androidSystemBackModel} from '../../src/app/navigation/android-system-back.model'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {DEFAULT_SNAPSHOT} from '../../src/app/navigation/navigation-snapshot'
import type {Routes} from '../../src/app/router/router'
import {atom} from '@reatom/core'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

function setupContext(route: Routes = 'dashboard') {
  initAppContext(
    createMockAppContext({
      router: {
        route: atom<Routes>(route),
        isLoading: atom(false),
      } as any,
      store: {
        detailsPanelFileId: atom<number | null>(null),
        closeDetailsPanel: () => {},
        currentPath: atom('/'),
        setCurrentPath: () => {},
        showRemoteStoragePage: atom(false),
        showRemotePage: atom(false),
        showGatewayPage: atom(false),
        showSettingsPage: atom(false),
        isShowPasswordManager: atom(false),
      } as any,
    }),
  )
}

describe('androidSystemBackModel', () => {
  beforeEach(() => {
    clearAppContext()
    navigationModel.disconnect()
    navigationModel.snapshot.set(DEFAULT_SNAPSHOT)
    window.history.replaceState({}, '', '/dashboard?layout=mobile&surface=files&path=%2F')
    delete window.__chromvoidHandleAndroidBack
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
    navigationModel.disconnect()
    delete window.__chromvoidHandleAndroidBack
    vi.restoreAllMocks()
  })

  it('blurs the active editable element before touching app navigation', () => {
    setupContext()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    expect(document.activeElement).toBe(input)
    expect(androidSystemBackModel.handleBack()).toBe(true)
    expect(document.activeElement).not.toBe(input)
  })

  it('consumes dashboard root back so Android does not background-lock the vault', () => {
    setupContext()

    expect(androidSystemBackModel.handleBack()).toBe(true)
  })

  it('leaves welcome back unhandled so Android can move the task to background before unlock', () => {
    setupContext('welcome')

    expect(androidSystemBackModel.handleBack()).toBe(false)
  })

  it('registers the global Android back handler contract on window', () => {
    setupContext()
    androidSystemBackModel.registerGlobalHandler()

    expect(typeof window.__chromvoidHandleAndroidBack).toBe('function')
    expect(window.__chromvoidHandleAndroidBack?.()).toBe(true)
  })

  it('does not traverse sibling history from files root back to passwords root', () => {
    setupContext()
    navigationModel.connect()
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)

    navigationModel.navigateToSurface('passwords')
    navigationModel.navigateToSurface('files')

    expect(androidSystemBackModel.handleBack()).toBe(true)
    expect(historyBackSpy).not.toHaveBeenCalled()
    expect(navigationModel.currentSurface()).toBe('files')
    expect(navigationModel.filesPath()).toBe('/')
  })

  it('does not traverse sibling history from passwords root back to files root', () => {
    setupContext()
    navigationModel.connect()
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)

    navigationModel.navigateToSurface('passwords')

    expect(androidSystemBackModel.handleBack()).toBe(true)
    expect(historyBackSpy).not.toHaveBeenCalled()
    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'root'})
  })

  it('closes a gallery overlay, then keeps repeated dashboard root back local', () => {
    setupContext()
    navigationModel.connect()

    navigationModel.openGallery(7)
    expect(navigationModel.snapshot().overlay).toEqual({kind: 'gallery', fileId: 7})

    expect(androidSystemBackModel.handleBack()).toBe(true)
    expect(navigationModel.snapshot().overlay).toEqual({kind: 'none'})

    expect(androidSystemBackModel.handleBack()).toBe(true)
    expect(navigationModel.currentSurface()).toBe('files')
    expect(navigationModel.filesPath()).toBe('/')
    expect(navigationModel.snapshot().overlay).toEqual({kind: 'none'})
  })
})
