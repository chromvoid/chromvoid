import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {FileUploadFlow} from '../../src/features/file-manager/upload-flow.model'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import type {AppContext} from '../../src/shared/services/app-context'

const open = vi.fn()

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => open(...args),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: vi.fn(async () => undefined),
  }),
}))

vi.mock('root/core/runtime/runtime', () => ({
  isTauriRuntime: () => true,
}))

function createFlow(remoteState: 'inactive' | 'ready' = 'inactive') {
  const store = {
    remoteSessionState: vi.fn(() => remoteState),
    startUploadFiles: vi.fn(async () => undefined),
    startUploadPaths: vi.fn(async () => undefined),
    startNativeUploadFiles: vi.fn(async () => undefined),
  }
  const flow = new FileUploadFlow({store} as unknown as AppContext, () => '/docs')
  const trigger = vi.fn()
  flow.registerToolbarUploadTrigger(trigger)

  return {flow, store, trigger}
}

describe('FileUploadFlow toolbar upload', () => {
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
    expect(open).not.toHaveBeenCalled()
    expect(store.startUploadPaths).not.toHaveBeenCalled()
    expect(trigger).not.toHaveBeenCalled()
  })

  it('uploads selected native paths', async () => {
    open.mockResolvedValue(['/tmp/one.txt', '/tmp/two.txt'])
    const {flow, store, trigger} = createFlow()

    await flow.handleToolbarUpload()

    expect(open).toHaveBeenCalledWith({multiple: true, directory: false})
    expect(store.startUploadPaths).toHaveBeenCalledWith('/docs', ['/tmp/one.txt', '/tmp/two.txt'])
    expect(trigger).not.toHaveBeenCalled()
  })

  it('does not fall back to browser input when native path selection is empty', async () => {
    open.mockResolvedValue([])
    const {flow, store, trigger} = createFlow()

    await flow.handleToolbarUpload()

    expect(store.startUploadPaths).not.toHaveBeenCalled()
    expect(trigger).not.toHaveBeenCalled()
  })

  it('falls back to browser input when native path picker fails', async () => {
    open.mockRejectedValue(new Error('picker failed'))
    const {flow, store, trigger} = createFlow()

    await flow.handleToolbarUpload()

    expect(store.startUploadPaths).not.toHaveBeenCalled()
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  it('uses browser input during remote sessions', async () => {
    const {flow, store, trigger} = createFlow('ready')

    await flow.handleToolbarUpload()

    expect(open).not.toHaveBeenCalled()
    expect(store.startNativeUploadFiles).not.toHaveBeenCalled()
    expect(store.startUploadPaths).not.toHaveBeenCalled()
    expect(trigger).toHaveBeenCalledTimes(1)
  })
})
