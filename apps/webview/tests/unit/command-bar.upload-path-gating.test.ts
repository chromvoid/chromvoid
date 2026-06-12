import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {SearchFilters} from '../../src/shared/contracts/file-manager'
import {CommandBarModel} from '../../src/features/file-manager/models/command-bar.model'
import {atom} from '@reatom/core'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'

vi.mock('root/core/runtime/runtime', () => {
  return {
    isTauriRuntime: () => true,
  }
})

const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: false,
  fileTypes: [],
}

function initStore(
  remoteState: 'inactive' | 'waiting_host_unlock' | 'ready',
  pickUploadFiles: () => Promise<Array<{token: string; name: string}>> = async () => [],
) {
  const searchFilters = atom<SearchFilters>({...DEFAULT_FILTERS})

  initAppContext(
    createMockAppContext({
      store: {
        searchFilters,
        setSearchFilters(next: SearchFilters | ((prev: SearchFilters) => SearchFilters)) {
          if (typeof next === 'function') {
            searchFilters.set(next(searchFilters()))
            return
          }
          searchFilters.set(next)
        },
        remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>(remoteState),
      } as never,
      ws: {
        pickUploadFiles,
      } as never,
    }),
  )
}

function createModel() {
  const runtime = {
    requestOpen: vi.fn(),
    requestClose: vi.fn(),
    focusSearchInput: vi.fn(),
    openFileInput: vi.fn(),
    dispatchCommand: vi.fn(),
  }

  return {
    model: new CommandBarModel(runtime),
    runtime,
  }
}

describe('CommandBarModel upload gating', () => {
  beforeEach(() => {
    resetRuntimeCapabilities()
    setRuntimeCapabilities({
      desktop: true,
      supports_native_path_io: true,
    })
  })

  afterEach(() => {
    resetRuntimeCapabilities()
    clearAppContext()
  })

  it('uses native path upload only outside of remote session', async () => {
    const files = [{token: 'upload-token', name: 'file.txt'}]
    const pickUploadFiles = vi.fn(async () => files)
    initStore('inactive', pickUploadFiles)

    const {model, runtime} = createModel()

    await (model as unknown as {openUpload: () => Promise<void>}).openUpload()

    expect(pickUploadFiles).toHaveBeenCalledTimes(1)
    expect(runtime.dispatchCommand).toHaveBeenCalledWith({
      kind: 'upload-paths',
      files,
    })
    expect(runtime.requestClose).toHaveBeenCalledTimes(1)
    expect(runtime.openFileInput).not.toHaveBeenCalled()
  })

  it('closes without dispatching upload paths when native path upload is cancelled', async () => {
    const pickUploadFiles = vi.fn(async () => [])
    initStore('inactive', pickUploadFiles)

    const {model, runtime} = createModel()

    await (model as unknown as {openUpload: () => Promise<void>}).openUpload()

    expect(pickUploadFiles).toHaveBeenCalledTimes(1)
    expect(runtime.dispatchCommand).not.toHaveBeenCalled()
    expect(runtime.openFileInput).not.toHaveBeenCalled()
    expect(runtime.requestClose).toHaveBeenCalledTimes(1)
  })

  it('falls back to file input and closes when native path picker fails', async () => {
    const pickUploadFiles = vi.fn(async () => {
      throw new Error('picker failed')
    })
    initStore('inactive', pickUploadFiles)

    const {model, runtime} = createModel()

    await (model as unknown as {openUpload: () => Promise<void>}).openUpload()

    expect(pickUploadFiles).toHaveBeenCalledTimes(1)
    expect(runtime.dispatchCommand).not.toHaveBeenCalled()
    expect(runtime.openFileInput).toHaveBeenCalledTimes(1)
    expect(runtime.requestClose).toHaveBeenCalledTimes(1)
  })

  it('uses native upload before desktop path dialog when available', async () => {
    initStore('inactive')
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_path_io: false,
      supports_native_file_upload: true,
    })

    const {model, runtime} = createModel()

    await (model as unknown as {openUpload: () => Promise<void>}).openUpload()

    expect(runtime.dispatchCommand).toHaveBeenCalledWith({kind: 'native-upload'})
    expect(runtime.openFileInput).not.toHaveBeenCalled()
  })

  it('falls back to file input during remote session', async () => {
    initStore('ready')

    const {model, runtime} = createModel()

    await (model as unknown as {openUpload: () => Promise<void>}).openUpload()

    expect(runtime.dispatchCommand).not.toHaveBeenCalled()
    expect(runtime.openFileInput).toHaveBeenCalledTimes(1)
  })
})
