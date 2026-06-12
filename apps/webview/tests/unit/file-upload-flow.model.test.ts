import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {FileUploadFlow} from '../../src/features/file-manager/upload-flow.model'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import type {AppContext} from '../../src/shared/services/app-context'

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: vi.fn(async () => undefined),
  }),
}))

vi.mock('root/core/runtime/runtime', () => ({
  isTauriRuntime: () => true,
}))

function createFlow(
  remoteState: 'inactive' | 'ready' = 'inactive',
  pickUploadFiles: () => Promise<Array<{token: string; name: string}>> = async () => [],
) {
  const store = {
    remoteSessionState: vi.fn(() => remoteState),
    startUploadFiles: vi.fn(async () => undefined),
    startUploadPaths: vi.fn(async () => undefined),
    startNativeUploadFiles: vi.fn(async () => undefined),
  }
  const flow = new FileUploadFlow({store, ws: {pickUploadFiles}} as unknown as AppContext, () => '/docs')
  const trigger = vi.fn()
  flow.registerToolbarUploadTrigger(trigger)

  return {flow, store, trigger, pickUploadFiles}
}

describe('FileUploadFlow toolbar upload', () => {
  beforeEach(() => {
    resetRuntimeCapabilities()
    setRuntimeCapabilities({
      desktop: true,
      supports_native_path_io: true,
    })
  })

  afterEach(() => {
    resetRuntimeCapabilities()
    vi.restoreAllMocks()
  })

  it('uses native file upload before native path upload when supported', async () => {
    setRuntimeCapabilities({
      desktop: true,
      supports_native_file_upload: true,
      supports_native_path_io: true,
    })
    const {flow, store, trigger} = createFlow()

    await flow.handleToolbarUpload()

    expect(store.startNativeUploadFiles).toHaveBeenCalledWith('/docs')
    expect(store.startUploadPaths).not.toHaveBeenCalled()
    expect(trigger).not.toHaveBeenCalled()
  })

  it('uploads selected native paths', async () => {
    const files = [
      {token: 'token-one', name: 'one.txt'},
      {token: 'token-two', name: 'two.txt'},
    ]
    const {flow, store, trigger, pickUploadFiles} = createFlow('inactive', vi.fn(async () => files))

    await flow.handleToolbarUpload()

    expect(pickUploadFiles).toHaveBeenCalledTimes(1)
    expect(store.startUploadPaths).toHaveBeenCalledWith('/docs', files)
    expect(trigger).not.toHaveBeenCalled()
  })

  it('does not fall back to browser input when native path selection is empty', async () => {
    const {flow, store, trigger, pickUploadFiles} = createFlow('inactive', vi.fn(async () => []))

    await flow.handleToolbarUpload()

    expect(pickUploadFiles).toHaveBeenCalledTimes(1)
    expect(store.startUploadPaths).not.toHaveBeenCalled()
    expect(trigger).not.toHaveBeenCalled()
  })

  it('falls back to browser input when native path picker fails', async () => {
    const {flow, store, trigger, pickUploadFiles} = createFlow(
      'inactive',
      vi.fn(async () => {
        throw new Error('picker failed')
      }),
    )

    await flow.handleToolbarUpload()

    expect(pickUploadFiles).toHaveBeenCalledTimes(1)
    expect(store.startUploadPaths).not.toHaveBeenCalled()
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  it('uses browser input during remote sessions', async () => {
    const {flow, store, trigger} = createFlow('ready')

    await flow.handleToolbarUpload()

    expect(store.startNativeUploadFiles).not.toHaveBeenCalled()
    expect(store.startUploadPaths).not.toHaveBeenCalled()
    expect(trigger).toHaveBeenCalledTimes(1)
  })
})
