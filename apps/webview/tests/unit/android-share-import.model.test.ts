import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {atom} from '@reatom/core'

import {ChromVoidState} from '../../src/core/state/app-state'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {
  androidShareImportModel,
  type AndroidShareImportResult,
  type AndroidSharePartialImportDecision,
  type AndroidSharedFilesHandoff,
} from '../../src/features/file-manager/models/android-share-import.model'

function payload(sessionId = 'share-session-1'): AndroidSharedFilesHandoff {
  return {
    sessionId,
    files: [
      {name: 'first.bin', size: 10, mimeType: 'application/octet-stream'},
      {name: 'second.bin', size: null, mimeType: null},
    ],
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return {promise, resolve}
}

function createEnvironment(
  options: {
    storageOpened?: boolean
    remoteState?: 'inactive' | 'ready'
    startImport?: () => Promise<AndroidShareImportResult>
    showPartialImportDialog?: (decision: AndroidSharePartialImportDecision) => Promise<'keep' | 'delete' | null>
  } = {},
) {
  const state = new ChromVoidState()
  state.update({StorageOpened: options.storageOpened === true})
  const store = {
    remoteSessionState: atom(options.remoteState ?? 'inactive'),
    startSharedFilesImport: vi.fn(options.startImport ?? (async () => ({kind: 'success' as const}))),
    pushNotification: vi.fn(),
  }
  const ws = {
    kind: 'tauri' as const,
    uploadSharedFiles: vi.fn(async () => undefined),
    cancelSharedFiles: vi.fn(async () => undefined),
  }
  const catalog = {
    refresh: vi.fn(async () => undefined),
    api: {
      delete: vi.fn(async () => undefined),
    },
  }
  const cleanup = androidShareImportModel.connect({
    state,
    store: store as any,
    ws,
    catalog: catalog as any,
    showPartialImportDialog: options.showPartialImportDialog,
  })
  return {state, store, ws, catalog, cleanup}
}

function partialDecision(): AndroidSharePartialImportDecision {
  return {
    uploadId: 'share-upload-1',
    completed: [{fileId: 'shared-1', nodeId: 41, name: 'shared.bin'}],
    failedCount: 1,
    failedMessage: 'permission denied',
    failedCode: 'ANDROID_SHARE_PERMISSION_DENIED',
  }
}

function initNavigationContext(env: ReturnType<typeof createEnvironment>) {
  initAppContext(
    createMockAppContext({
      store: env.store as any,
      ws: env.ws as any,
      catalog: env.catalog as any,
      state: env.state,
    }),
  )
}

describe('Android share import model', () => {
  beforeEach(() => {
    androidShareImportModel.clear()
    resetRuntimeCapabilities()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_file_upload: true,
      supports_share_import: true,
    })
  })

  afterEach(() => {
    clearAppContext()
    androidShareImportModel.clear()
    resetRuntimeCapabilities()
  })

  it('keeps locked-vault metadata pending and does not start transport', () => {
    const env = createEnvironment({storageOpened: false})

    try {
      androidShareImportModel.receiveHandoff(payload())

      expect(androidShareImportModel.state().kind).toBe('pending-locked')
      expect(androidShareImportModel.pendingLockedSummary()).toEqual({
        fileCount: 2,
        knownBytes: 10,
        unknownSizes: 1,
      })
      expect(env.store.startSharedFilesImport).not.toHaveBeenCalled()
    } finally {
      env.cleanup()
    }
  })

  it('starts one import on unlock and ignores duplicate storage emissions', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_native_file_upload: true,
      supports_share_import: true,
    })
    const importDeferred = deferred<AndroidShareImportResult>()
    const env = createEnvironment({
      storageOpened: false,
      startImport: () => importDeferred.promise,
    })

    try {
      androidShareImportModel.receiveHandoff(payload())
      env.state.update({StorageOpened: true})

      await expect.poll(() => env.store.startSharedFilesImport.mock.calls.length).toBe(1)

      env.state.update({StorageOpened: true})
      env.store.remoteSessionState.set('inactive')
      await Promise.resolve()

      expect(env.store.startSharedFilesImport).toHaveBeenCalledTimes(1)
      expect(env.store.startSharedFilesImport.mock.calls[0]?.[0]).toEqual(payload())
      expect(androidShareImportModel.state().kind).toBe('uploading')
    } finally {
      importDeferred.resolve({kind: 'success'})
      await importDeferred.promise
      await Promise.resolve()
      env.cleanup()
    }
  })

  it('does not duplicate a ready import from synchronous connect subscriptions', async () => {
    const importDeferred = deferred<AndroidShareImportResult>()
    androidShareImportModel.state.set({kind: 'ready', payload: payload('ready-before-connect')})
    const env = createEnvironment({
      storageOpened: true,
      startImport: () => importDeferred.promise,
    })

    try {
      await expect.poll(() => env.store.startSharedFilesImport.mock.calls.length).toBe(1)

      env.state.update({StorageOpened: true})
      env.store.remoteSessionState.set('inactive')
      await Promise.resolve()

      expect(env.store.startSharedFilesImport).toHaveBeenCalledTimes(1)
      expect(env.store.startSharedFilesImport.mock.calls[0]?.[0]).toEqual(payload('ready-before-connect'))
    } finally {
      importDeferred.resolve({kind: 'success'})
      await importDeferred.promise
      await Promise.resolve()
      env.cleanup()
    }
  })

  it('rejects a handoff while uploading without clearing the active upload state', async () => {
    const importDeferred = deferred<AndroidShareImportResult>()
    const env = createEnvironment({
      storageOpened: true,
      startImport: () => importDeferred.promise,
    })

    try {
      androidShareImportModel.receiveHandoff(payload('active-session'))
      await expect.poll(() => env.store.startSharedFilesImport.mock.calls.length).toBe(1)

      androidShareImportModel.receiveHandoff(payload('incoming-session'))
      await expect.poll(() => env.ws.cancelSharedFiles.mock.calls.length).toBe(1)

      expect(env.ws.cancelSharedFiles).toHaveBeenCalledWith('incoming-session')
      expect(env.store.pushNotification).toHaveBeenCalledWith(
        'error',
        'Another shared files import is already running',
      )
      expect(androidShareImportModel.state()).toMatchObject({
        kind: 'uploading',
        payload: {sessionId: 'active-session'},
      })
    } finally {
      importDeferred.resolve({kind: 'success'})
      await importDeferred.promise
      await Promise.resolve()
      env.cleanup()
    }
  })

  it('ignores duplicate handoff for the active upload session', async () => {
    const importDeferred = deferred<AndroidShareImportResult>()
    const env = createEnvironment({
      storageOpened: true,
      startImport: () => importDeferred.promise,
    })

    try {
      androidShareImportModel.receiveHandoff(payload('active-session'))
      await expect.poll(() => env.store.startSharedFilesImport.mock.calls.length).toBe(1)

      androidShareImportModel.receiveHandoff(payload('active-session'))
      await Promise.resolve()

      expect(env.store.startSharedFilesImport).toHaveBeenCalledTimes(1)
      expect(env.ws.cancelSharedFiles).not.toHaveBeenCalled()
      expect(androidShareImportModel.state()).toMatchObject({
        kind: 'uploading',
        payload: {sessionId: 'active-session'},
      })
    } finally {
      importDeferred.resolve({kind: 'success'})
      await importDeferred.promise
      await Promise.resolve()
      env.cleanup()
    }
  })

  it('replaces older pending metadata before upload starts', () => {
    const env = createEnvironment({storageOpened: false})

    try {
      androidShareImportModel.receiveHandoff(payload('older-session'))
      androidShareImportModel.receiveHandoff(payload('newer-session'))

      expect(androidShareImportModel.state()).toMatchObject({
        kind: 'pending-locked',
        payload: {sessionId: 'newer-session'},
      })
    } finally {
      env.cleanup()
    }
  })

  it('enters partial decision state when share import partially fails', async () => {
    const decision = partialDecision()
    const showPartialImportDialog = vi.fn(() => new Promise<'keep' | 'delete' | null>(() => {}))
    const env = createEnvironment({
      storageOpened: true,
      startImport: async () => ({kind: 'partial', decision}),
      showPartialImportDialog,
    })

    try {
      androidShareImportModel.receiveHandoff(payload())

      await expect.poll(() => androidShareImportModel.state().kind).toBe('partial-decision')
      expect(androidShareImportModel.state()).toEqual({kind: 'partial-decision', decision})
      expect(showPartialImportDialog).toHaveBeenCalledWith(decision)
    } finally {
      env.cleanup()
    }
  })

  it('rejects a new handoff while a partial decision is pending', async () => {
    const env = createEnvironment()
    const decision = partialDecision()

    try {
      androidShareImportModel.state.set({kind: 'partial-decision', decision})

      androidShareImportModel.receiveHandoff(payload('incoming-session'))
      await expect.poll(() => env.ws.cancelSharedFiles.mock.calls.length).toBe(1)

      expect(env.ws.cancelSharedFiles).toHaveBeenCalledWith('incoming-session')
      expect(env.store.pushNotification).toHaveBeenCalledWith(
        'error',
        'Another shared files import is already running',
      )
      expect(androidShareImportModel.state()).toEqual({kind: 'partial-decision', decision})
    } finally {
      env.cleanup()
    }
  })

  it('keeps a partial import by refreshing, navigating to root, and clearing the decision', async () => {
    const env = createEnvironment()
    initNavigationContext(env)

    try {
      navigationModel.navigateFilesPath('/photos/')
      androidShareImportModel.state.set({kind: 'partial-decision', decision: partialDecision()})

      await androidShareImportModel.keepPartialImport()

      expect(env.catalog.refresh).toHaveBeenCalledTimes(1)
      expect(navigationModel.filesPath()).toBe('/')
      expect(env.store.pushNotification).toHaveBeenCalledWith(
        'warning',
        'Kept imported files: 1; failed: 1',
      )
      expect(androidShareImportModel.state()).toEqual({kind: 'none'})
    } finally {
      env.cleanup()
    }
  })

  it('deletes completed partial import files and clears the decision', async () => {
    const env = createEnvironment()
    initNavigationContext(env)

    try {
      navigationModel.navigateFilesPath('/photos/')
      androidShareImportModel.state.set({kind: 'partial-decision', decision: partialDecision()})

      await androidShareImportModel.deletePartialImport()

      expect(env.catalog.api.delete).toHaveBeenCalledWith(41)
      expect(env.catalog.refresh).toHaveBeenCalledTimes(1)
      expect(navigationModel.filesPath()).toBe('/')
      expect(env.store.pushNotification).toHaveBeenCalledWith(
        'success',
        'Deleted partially imported files: 1; failed import(s): 1',
      )
      expect(androidShareImportModel.state()).toEqual({kind: 'none'})
    } finally {
      env.cleanup()
    }
  })

  it('reports cleanup failure and clears the partial decision without hiding completed files', async () => {
    const env = createEnvironment()
    env.catalog.api.delete.mockRejectedValueOnce(new Error('delete failed'))
    initNavigationContext(env)

    try {
      androidShareImportModel.state.set({kind: 'partial-decision', decision: partialDecision()})

      await androidShareImportModel.deletePartialImport()

      expect(env.catalog.refresh).toHaveBeenCalledTimes(1)
      expect(env.store.pushNotification).toHaveBeenCalledWith(
        'error',
        'Could not delete all partially imported files. Deleted: 0; cleanup failures: 1',
      )
      expect(androidShareImportModel.state()).toEqual({kind: 'none'})
    } finally {
      env.cleanup()
    }
  })

  it('clears pending share cancellation when the native session is already gone', async () => {
    const env = createEnvironment({storageOpened: false})
    env.ws.cancelSharedFiles.mockRejectedValueOnce({code: 'ANDROID_SHARE_SESSION_NOT_FOUND'})

    try {
      androidShareImportModel.receiveHandoff(payload())

      await androidShareImportModel.cancelPendingShare()

      expect(env.ws.cancelSharedFiles).toHaveBeenCalledWith('share-session-1')
      expect(androidShareImportModel.state()).toEqual({kind: 'none'})
    } finally {
      env.cleanup()
    }
  })

  it('rejects remote-active imports, cancels native session, and does not start upload', async () => {
    const env = createEnvironment({storageOpened: true, remoteState: 'ready'})

    try {
      androidShareImportModel.receiveHandoff(payload())

      await expect.poll(() => env.ws.cancelSharedFiles.mock.calls.length).toBe(1)

      expect(env.store.startSharedFilesImport).not.toHaveBeenCalled()
      expect(env.ws.cancelSharedFiles).toHaveBeenCalledWith('share-session-1')
      expect(env.store.pushNotification).toHaveBeenCalledWith(
        'error',
        'Shared files can be imported only into the local vault',
      )
      expect(androidShareImportModel.state()).toEqual({kind: 'none'})
    } finally {
      env.cleanup()
    }
  })

  it('fails closed when capability is unavailable and cancels native session', async () => {
    resetRuntimeCapabilities()
    const env = createEnvironment({storageOpened: true})

    try {
      androidShareImportModel.receiveHandoff(payload())

      await expect.poll(() => env.ws.cancelSharedFiles.mock.calls.length).toBe(1)

      expect(env.store.startSharedFilesImport).not.toHaveBeenCalled()
      expect(env.ws.cancelSharedFiles).toHaveBeenCalledWith('share-session-1')
      expect(env.store.pushNotification).toHaveBeenCalledWith(
        'error',
        'Shared files import is not available',
      )
      expect(androidShareImportModel.state()).toEqual({kind: 'none'})
    } finally {
      env.cleanup()
    }
  })
})
