import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {atom} from '@reatom/core'

import {ChromVoidState} from '../../src/core/state/app-state'
import {clearAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {androidShareImportModel} from '../../src/features/file-manager/models/android-share-import.model'
import {setupAndroidShareFilesHandoff} from '../../src/app/bootstrap/android-share-files-handoff'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
}))

function createContext() {
  const state = new ChromVoidState()
  const store = {
    remoteSessionState: atom('inactive'),
    startSharedFilesImport: vi.fn(async () => undefined),
    pushNotification: vi.fn(),
  }
  const ws = {
    kind: 'tauri' as const,
    uploadSharedFiles: vi.fn(async () => undefined),
    cancelSharedFiles: vi.fn(async () => undefined),
  }
  initAppContext({
    state,
    store: store as any,
    ws: ws as any,
    catalog: {} as any,
    router: {} as any,
  })
  return {state, store, ws}
}

describe('Android share files handoff bootstrap', () => {
  let cleanup: (() => void) | null = null

  beforeEach(() => {
    tauriInvoke.mockReset()
    cleanup = null
    androidShareImportModel.clear()
    resetRuntimeCapabilities()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_file_upload: true,
      supports_share_import: true,
    })
    delete (window as any).__chromvoidPendingAndroidSharedFiles
    delete (window as any).ChromVoidAndroidShare
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    cleanup?.()
    clearAppContext()
    androidShareImportModel.clear()
    resetRuntimeCapabilities()
    delete (window as any).__chromvoidPendingAndroidSharedFiles
    delete (window as any).ChromVoidAndroidShare
    vi.unstubAllGlobals()
  })

  it('consumes, clears, and stores pending safe share metadata from the global payload', () => {
    createContext()
    ;(window as any).__chromvoidPendingAndroidSharedFiles = {
      sessionId: 'share-session-1',
      files: [{name: 'photo.jpg', size: 12, mimeType: 'image/jpeg', uri: 'content://not-used'}],
    }

    cleanup = setupAndroidShareFilesHandoff()

    expect((window as any).__chromvoidPendingAndroidSharedFiles).toBeUndefined()
    expect(androidShareImportModel.state()).toEqual({
      kind: 'pending-locked',
      payload: {
        sessionId: 'share-session-1',
        files: [{name: 'photo.jpg', size: 12, mimeType: 'image/jpeg'}],
      },
    })
  })

  it('ignores invalid payloads without throwing', () => {
    createContext()
    ;(window as any).__chromvoidPendingAndroidSharedFiles = {
      sessionId: '',
      files: [{name: '', size: -1, mimeType: ''}],
    }

    expect(() => {
      cleanup = setupAndroidShareFilesHandoff()
    }).not.toThrow()

    expect((window as any).__chromvoidPendingAndroidSharedFiles).toBeUndefined()
    expect(androidShareImportModel.state()).toEqual({kind: 'none'})
  })

  it('handles the native custom event after setup', () => {
    createContext()
    cleanup = setupAndroidShareFilesHandoff()

    ;(window as any).__chromvoidPendingAndroidSharedFiles = {
      sessionId: 'share-session-2',
      files: [{name: 'doc.pdf', size: null, mimeType: 'application/pdf'}],
    }
    window.dispatchEvent(new CustomEvent('chromvoid:android-share-files-pending'))

    expect(androidShareImportModel.pendingLockedSummary()).toEqual({
      fileCount: 1,
      knownBytes: 0,
      unknownSizes: 1,
    })
  })

  it('requests pending native shared files after listener setup', () => {
    createContext()
    const requestPendingSharedFiles = vi.fn()
    ;(window as any).ChromVoidAndroidShare = {requestPendingSharedFiles}

    cleanup = setupAndroidShareFilesHandoff()

    expect(requestPendingSharedFiles).toHaveBeenCalledTimes(1)
  })

  it('requests pending iOS shared files through the neutral Tauri command', async () => {
    createContext()
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_native_file_upload: true,
      supports_share_import: true,
    })
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    tauriInvoke.mockResolvedValue({
      ok: true,
      result: [
        {
          sessionId: 'ios-share-1',
          files: [{name: 'scan.pdf', size: 120, mimeType: 'application/pdf'}],
        },
      ],
    })

    cleanup = setupAndroidShareFilesHandoff()
    await Promise.resolve()
    await Promise.resolve()

    expect(tauriInvoke).toHaveBeenCalledWith('catalog_list_shared_files')
    expect(androidShareImportModel.state()).toEqual({
      kind: 'pending-locked',
      payload: {
        sessionId: 'ios-share-1',
        files: [{name: 'scan.pdf', size: 120, mimeType: 'application/pdf'}],
      },
    })
  })
})
