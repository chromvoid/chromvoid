import {state} from '@statx/core'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {SearchFilters} from '../../src/shared/contracts/file-manager'
import {CommandBarModel} from '../../src/features/file-manager/models/command-bar.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'

const open = vi.fn()

vi.mock('@tauri-apps/plugin-dialog', () => {
  return {
    open: (...args: unknown[]) => open(...args),
  }
})

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

function initStore(remoteState: 'inactive' | 'waiting_host_unlock' | 'ready') {
  const searchFilters = state<SearchFilters>({...DEFAULT_FILTERS})

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
        remoteSessionState: state<'inactive' | 'waiting_host_unlock' | 'ready'>(remoteState),
      } as never,
    }),
  )
}

function createModel() {
  const runtime = {
    requestOpen: () => {},
    requestClose: () => {},
    focusSearchInput: () => {},
    openFileInput: vi.fn(),
    dispatchCommand: vi.fn(),
    getPasswordsMobileCommandProvider: () => null,
  }

  return {
    model: new CommandBarModel(runtime),
    runtime,
  }
}

describe('CommandBarModel upload gating', () => {
  beforeEach(() => {
    open.mockReset()
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
    initStore('inactive')
    open.mockResolvedValue(['/tmp/file.txt'])

    const {model, runtime} = createModel()

    await (model as unknown as {openUpload: () => Promise<void>}).openUpload()

    expect(open).toHaveBeenCalledWith({multiple: true, directory: false})
    expect(runtime.dispatchCommand).toHaveBeenCalledWith({
      action: 'upload-paths',
      paths: ['/tmp/file.txt'],
    })
    expect(runtime.openFileInput).not.toHaveBeenCalled()
  })

  it('falls back to file input during remote session', async () => {
    initStore('ready')

    const {model, runtime} = createModel()

    await (model as unknown as {openUpload: () => Promise<void>}).openUpload()

    expect(open).not.toHaveBeenCalled()
    expect(runtime.dispatchCommand).not.toHaveBeenCalled()
    expect(runtime.openFileInput).toHaveBeenCalledTimes(1)
  })
})
