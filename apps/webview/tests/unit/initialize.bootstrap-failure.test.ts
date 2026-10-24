import {afterEach, describe, expect, it, vi} from 'vitest'

import type {TransportEventHandler} from '../../src/core/transport/transport'
import {applyManifestFixture, catalogDir, catalogFile} from './helpers/catalog-manifest'

const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')

function mockRuntimeBootstrapSuccessModules(): void {
  vi.doMock('../../src/app/bootstrap/runtime-capabilities-sync', () => ({
    setupRuntimeCapabilitiesSync: vi.fn(),
  }))
  vi.doMock('../../src/app/bootstrap/mobile-visual-viewport', () => ({
    setupMobileVisualViewportSync: vi.fn(),
  }))
  vi.doMock('../../src/app/bootstrap/mobile-keyboard-focus-scroll', () => ({
    setupMobileKeyboardFocusScroll: vi.fn(),
  }))
  vi.doMock('../../src/app/bootstrap/pinch-zoom-prevention', () => ({
    setupPinchZoomPrevention: vi.fn(),
  }))
  vi.doMock('../../src/app/bootstrap/mobile-lifecycle', () => ({
    setupMobileLifecycle: vi.fn(),
  }))
  vi.doMock('../../src/app/bootstrap/share-files-handoff', () => ({
    setupShareFilesHandoff: vi.fn(),
  }))
}

function mockInitializeStaticSideEffects(): void {
  vi.doMock('../../src/app/bootstrap/surface-component-loader', () => ({
    configureSurfaceComponentLoader: vi.fn(),
    ensureDashboardSurfaceComponents: vi.fn(() => Promise.resolve()),
  }))
  vi.doMock('../../src/app/bootstrap/ui-component-idle-warmup', () => ({
    startUiComponentIdleWarmup: vi.fn(),
  }))
  vi.doMock('../../src/routes/biometric-app-gate/biometric-app-gate.model', () => ({
    biometricAppGateModel: {
      connect: vi.fn(),
    },
  }))
}

describe('Initialize bootstrap failure safety', () => {
  afterEach(async () => {
    try {
      const {clearAppContext} = await import('../../src/shared/services/app-context')
      clearAppContext()
    } catch {}
    vi.unstubAllGlobals()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('turns deferred data bootstrap failure into an explicit retry route', async () => {
    vi.resetModules()
    mockInitializeStaticSideEffects()
    mockRuntimeBootstrapSuccessModules()
    vi.doMock('../../src/app/bootstrap/passmanager-reload', () => ({
      setupPassmanagerReload: vi.fn(),
    }))
    vi.doMock('../../src/app/bootstrap/ssh-agent-handler', () => ({
      setupSshAgentHandler: vi.fn(),
    }))
    vi.doMock('../../src/app/bootstrap/catalog-sync', () => ({
      setupCatalogSync: vi.fn(() => {
        throw new Error('catalog setup failed')
      }),
    }))

    const {init} = await import('../../src/app/bootstrap/Initialize')
    const {getAppContext} = await import('../../src/shared/services/app-context')

    init()
    const {router, store} = getAppContext()

    await vi.waitFor(() => {
      expect(store.bootstrapFatalError()).toBe('Data bootstrap failed: catalog setup failed')
    })

    expect(store.lastErrorMessage()).toBe('Data bootstrap failed: catalog setup failed')
    expect(router.route()).toBe('no-connection')
  })
})

describe('Initialize catalog batch media cleanup', () => {
  afterEach(async () => {
    const {mediaPlaybackModel} = await import('../../src/features/media/models/media-playback.model')
    const {disposeFileThumbnailCache} =
      await import('../../src/features/file-manager/models/file-thumbnail-cache.model')
    const {invalidateAllFileBlobCache} = await import('../../src/features/media/components/file-loader')
    const {clearAppContext} = await import('../../src/shared/services/app-context')
    await mediaPlaybackModel.stopSession()
    disposeFileThumbnailCache()
    invalidateAllFileBlobCache()
    clearAppContext()
    vi.doUnmock('../../src/core/runtime/runtime')
    vi.doUnmock('../../src/app/navigation/initial-surface')
    vi.doUnmock('../../src/app/bootstrap/idle-scheduler')
    vi.doUnmock('../../src/app/bootstrap/passmanager-session')
    vi.unstubAllGlobals()
    if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL)
    else Reflect.deleteProperty(URL, 'createObjectURL')
    if (originalRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL)
    else Reflect.deleteProperty(URL, 'revokeObjectURL')
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it.each([
    {operation: 'delete', mode: 'local'},
    {operation: 'update', mode: 'local'},
    {operation: 'delete', mode: 'remote'},
    {operation: 'update', mode: 'remote'},
  ] as const)(
    'releases media and clears caches for $mode $operation + invalidate batches',
    async ({operation, mode}) => {
      vi.resetModules()
      mockInitializeStaticSideEffects()
      vi.doMock('../../src/core/runtime/runtime', () => ({isTauriRuntime: () => true}))
      vi.doMock('../../src/app/navigation/initial-surface', () => ({
        readInitialSurface: () => 'passwords',
      }))
      vi.doMock('../../src/app/bootstrap/idle-scheduler', () => ({scheduleAfterFirstPaintIdle: vi.fn()}))
      vi.doMock('../../src/app/bootstrap/passmanager-session', () => ({setupPassmanagerSession: vi.fn()}))
      vi.stubGlobal(
        'Image',
        class {
          decoding = ''
          src = ''
          decode() {
            return Promise.resolve()
          }
        },
      )
      let objectUrlId = 0
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: vi.fn(() => `blob:catalog-batch-${++objectUrlId}`),
      })
      const revokeObjectURL = vi.fn()
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: revokeObjectURL,
      })

      const {TauriTransport} = await import('../../src/core/transport/tauri/tauri-transport')
      const handlers = new Map<string, TransportEventHandler[]>()
      vi.spyOn(TauriTransport.prototype, 'on').mockImplementation((event, handler) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler])
      })
      vi.spyOn(TauriTransport.prototype, 'connect').mockImplementation(() => {})
      const preparedSource = {
        kind: 'media-stream' as const,
        streamId: 'catalog-batch-song',
        url: 'chromvoid-media://localhost/catalog-batch-song',
        name: 'song.mp3',
        mimeType: 'audio/mpeg',
        size: 100,
        sourceRevision: 1,
        expiresAt: 123456,
      }
      vi.spyOn(TauriTransport.prototype, 'prepareMediaStream').mockResolvedValue(preparedSource)
      const releaseMediaStream = vi
        .spyOn(TauriTransport.prototype, 'releaseMediaStream')
        .mockResolvedValue(undefined)
      const derivative = {
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/webp',
        name: 'artwork.webp',
        chunkSize: 3,
      }
      const previewImage = vi.spyOn(TauriTransport.prototype, 'previewImage').mockResolvedValue(derivative)
      const thumbnailImage = vi
        .spyOn(TauriTransport.prototype, 'thumbnailImage')
        .mockResolvedValue(derivative)

      const {init} = await import('../../src/app/bootstrap/Initialize')
      const {getAppContext} = await import('../../src/shared/services/app-context')
      const {setRuntimeCapabilities} = await import('../../src/core/runtime/runtime-capabilities')
      const {runtimeModeModel} = await import('../../src/core/runtime/runtime-mode.model')
      const {mediaPlaybackModel} = await import('../../src/features/media/models/media-playback.model')
      const {loadFileSourceById} = await import('../../src/features/media/components/file-loader')
      const {fileThumbnailStore, getFileThumbnailKey} =
        await import('../../src/features/file-manager/models/file-thumbnail-cache.model')
      init()
      runtimeModeModel.setCoreMode(mode === 'local' ? 'local' : {remote: {host: {type: 'usb'}}})
      setRuntimeCapabilities({platform: 'macos', desktop: true, supports_media_stream_protocol: true})
      const item = {
        id: 701,
        path: '/docs/song.mp3',
        name: 'song.mp3',
        isDir: false,
        size: 100,
        lastModified: 1,
        mimeType: 'audio/mpeg',
      }
      applyManifestFixture(getAppContext().catalog.catalog, [
        catalogDir({
          id: 700,
          name: 'docs',
          children: [
            catalogFile({
              id: item.id,
              name: item.name,
              size: item.size,
              mimeType: item.mimeType,
              modtime: item.lastModified,
            }),
          ],
        }),
      ])

      await mediaPlaybackModel.startAudioSession([item], 0)
      expect(mediaPlaybackModel.sourceKind()).toBe('media-stream')
      const previewOptions = {
        variant: 'preview-image' as const,
        preparedSourcePolicy: 'skip' as const,
        derivativeFallback: 'none' as const,
        lastModified: item.lastModified,
        mimeType: item.mimeType,
      }
      const firstPreview = await loadFileSourceById(item.id, item.name, previewOptions)
      const cachedPreview = await loadFileSourceById(item.id, item.name, previewOptions)
      expect(firstPreview.kind).toBe('blob')
      expect(previewImage).toHaveBeenCalledTimes(1)
      await firstPreview.release()
      await cachedPreview.release()
      const thumbnail = await fileThumbnailStore.ensure(item, {preparedSourcePolicy: 'skip'})
      expect(thumbnail.status).toBe('loaded')
      expect(fileThumbnailStore.read(getFileThumbnailKey(item)).url).toBe(thumbnail.url)
      expect(thumbnailImage).toHaveBeenCalledTimes(1)

      const event = {
        type: operation,
        shard_id: 'docs',
        node_id: item.id,
        version: 2,
        delta: {
          seq: 2,
          ts: 2,
          path: '/song.mp3',
          node_id: item.id,
          op:
            operation === 'delete'
              ? {type: 'delete'}
              : {type: 'update', fields: {size: 101, source_revision: 2}},
        },
      }
      const batchHandlers = handlers.get('catalog:event:batch') ?? []
      for (const handler of batchHandlers) handler(undefined, {events: [event, {type: 'invalidate'}]})

      await vi.waitFor(() => {
        expect(releaseMediaStream).toHaveBeenCalledExactlyOnceWith(preparedSource)
        expect(mediaPlaybackModel.sourceKind()).toBe('none')
      })
      expect(mediaPlaybackModel.sessionKind()).toBe('audio')
      expect(fileThumbnailStore.read(getFileThumbnailKey(item)).status).toBe('idle')
      expect(fileThumbnailStore.read(getFileThumbnailKey(item)).url).toBeNull()
      expect(revokeObjectURL).toHaveBeenCalledWith(thumbnail.url)
      const refreshedPreview = await loadFileSourceById(item.id, item.name, previewOptions)
      expect(previewImage).toHaveBeenCalledTimes(2)
      await refreshedPreview.release()
      await fileThumbnailStore.ensure(item, {preparedSourcePolicy: 'skip'})
      expect(thumbnailImage).toHaveBeenCalledTimes(2)
    },
  )
})
