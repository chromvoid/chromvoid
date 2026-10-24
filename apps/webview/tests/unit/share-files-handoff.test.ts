import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {atom} from '@reatom/core'

import {ChromVoidState} from '../../src/core/state/app-state'
import {clearAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {shareImportModel} from '../../src/features/file-manager/models/share-import.model'
import {setupShareFilesHandoff} from '../../src/app/bootstrap/share-files-handoff'

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

async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('Share files handoff bootstrap', () => {
  let cleanup: (() => void) | null = null

  beforeEach(() => {
    tauriInvoke.mockReset()
    cleanup = null
    shareImportModel.clear()
    resetRuntimeCapabilities()
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_native_file_upload: true,
      supports_share_import: true,
    })
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
  })

  afterEach(() => {
    cleanup?.()
    clearAppContext()
    shareImportModel.clear()
    resetRuntimeCapabilities()
    vi.unstubAllGlobals()
  })

  it('requests pending iOS shared files through the neutral Tauri command', async () => {
    createContext()
    tauriInvoke.mockResolvedValue({
      ok: true,
      result: [
        {
          sessionId: 'ios-share-1',
          files: [{name: 'scan.pdf', size: 120, mimeType: 'application/pdf'}],
        },
      ],
    })

    cleanup = setupShareFilesHandoff()
    await settle()

    expect(tauriInvoke).toHaveBeenCalledWith('catalog_list_shared_files')
    expect(shareImportModel.state()).toEqual({
      kind: 'pending-locked',
      payload: {
        sessionId: 'ios-share-1',
        files: [{name: 'scan.pdf', size: 120, mimeType: 'application/pdf'}],
      },
    })
  })

  it('skips pending entries without a session or files', async () => {
    createContext()
    tauriInvoke.mockResolvedValue({
      ok: true,
      result: [{sessionId: '', files: [{name: 'a.txt'}]}, {sessionId: 'ios-share-2', files: [{name: ' '}]}],
    })

    cleanup = setupShareFilesHandoff()
    await settle()

    expect(shareImportModel.state()).toEqual({kind: 'none'})
  })

  it('asks nothing of a runtime that offers no share import', async () => {
    createContext()
    setRuntimeCapabilities({platform: 'macos', mobile: false, supports_share_import: false})

    cleanup = setupShareFilesHandoff()
    await settle()

    expect(tauriInvoke).not.toHaveBeenCalled()
    expect(shareImportModel.state()).toEqual({kind: 'none'})
  })

  it('survives a failed request without a pending import', async () => {
    createContext()
    tauriInvoke.mockRejectedValue(new Error('bridge gone'))

    cleanup = setupShareFilesHandoff()
    await settle()

    expect(shareImportModel.state()).toEqual({kind: 'none'})
  })
})
