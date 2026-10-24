import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest'

const {tauriInvokeMock} = vi.hoisted(() => ({
  tauriInvokeMock: vi.fn(),
}))

vi.mock('../../src/core/transport/tauri/ipc', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: vi.fn(async () => () => {}),
}))

import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {downloadFileViaTauri} from '../../src/core/transport/tauri/tauri-binary-ops'
import {
  FileLoadError,
  MAX_MEDIA_BLOB_FALLBACK_BYTES,
  getActivePreparedFileSourceCountForTests,
  invalidateFileBlobCache,
  loadFileSourceById,
  purgePreparedFileSources,
  releaseActivePreparedFileSources,
  resetDerivativeNegativeCacheForTests,
  resetPreparedSourceLoadabilityForTests,
} from '../../src/features/media/components/file-loader'
import {resetImageDisplaySchedulerForTests} from '../../src/features/media/components/image-display-scheduler'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {
  resetRuntimeMediaProbeState,
  setRuntimeMediaProbeState,
} from '../../src/core/runtime/runtime-media-probes'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'
import type {PreparedPreviewFileSource} from '../../src/core/transport/transport'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
const originalImage = globalThis.Image
const originalMediaSource = globalThis.MediaSource
const originalMediaCapabilitiesDescriptor = Object.getOwnPropertyDescriptor(
  globalThis.navigator,
  'mediaCapabilities',
)

async function readBlobText(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'))
    reader.readAsText(blob)
  })
}

function streamOf(...chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

function preparedSource(
  fileId: number,
  variant: PreparedPreviewFileSource['variant'],
): PreparedPreviewFileSource {
  return {
    kind: 'asset-file',
    previewId: `preview-${fileId}`,
    path: `/cache/chromvoid-preview/${fileId}.webp`,
    url: `http://asset.localhost/${fileId}.webp`,
    name: `${fileId}.webp`,
    mimeType: 'image/webp',
    size: 4,
    variant,
  }
}

function mockPreparedSourceImageLoadability(result: 'load' | 'error') {
  class MockImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    decoding: HTMLImageElement['decoding'] = 'auto'

    set src(_value: string) {
      queueMicrotask(() => {
        if (result === 'load') {
          this.onload?.()
        } else {
          this.onerror?.()
        }
      })
    }
  }

  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    writable: true,
    value: MockImage,
  })
}

function mockMediaSourceTypeSupport(result: boolean) {
  class MockMediaSource {
    static isTypeSupported = vi.fn(() => result)
  }
  Object.defineProperty(globalThis, 'MediaSource', {
    configurable: true,
    writable: true,
    value: MockMediaSource,
  })
}

type DerivativeLoadOutput = {
  bytes: Uint8Array
  mimeType: string
  name: string
  chunkSize: number
}

type DerivativeLoadOperation = (
  fileId: number,
  options: {
    fileName: string
    mimeType?: string | null
    lastModified?: number | null
  },
) => Promise<DerivativeLoadOutput>

function initDerivativeAppContext(options: {
  previewImage?: DerivativeLoadOperation
  thumbnailImage?: DerivativeLoadOperation
  download: (fileId: number) => Promise<AsyncIterable<Uint8Array>>
}) {
  const context = createMockAppContext()
  context.ws.kind = 'tauri'
  if (options.previewImage) {
    context.ws.previewImage = options.previewImage
  }
  if (options.thumbnailImage) {
    context.ws.thumbnailImage = options.thumbnailImage
  }
  Object.defineProperty(context.catalog, 'api', {
    configurable: true,
    value: {
      download: options.download,
    },
  })
  initAppContext(context)
}

async function expectFileLoadError(
  promise: Promise<unknown>,
  code: FileLoadError['code'],
  message: string,
) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  )

  expect(error).toBeInstanceOf(FileLoadError)
  expect(error).toMatchObject({code, message})
}

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => 'blob:mock-url'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
})

afterAll(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: originalCreateObjectURL,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: originalRevokeObjectURL,
  })
})

afterEach(async () => {
  await releaseActivePreparedFileSources()
  resetImageDisplaySchedulerForTests()
  invalidateFileBlobCache(11)
  invalidateFileBlobCache(12)
  invalidateFileBlobCache(15)
  invalidateFileBlobCache(16)
  invalidateFileBlobCache(17)
  invalidateFileBlobCache(18)
  invalidateFileBlobCache(19)
  invalidateFileBlobCache(20)
  invalidateFileBlobCache(21)
  invalidateFileBlobCache(22)
  invalidateFileBlobCache(23)
  invalidateFileBlobCache(24)
  invalidateFileBlobCache(25)
  invalidateFileBlobCache(26)
  invalidateFileBlobCache(27)
  invalidateFileBlobCache(28)
  invalidateFileBlobCache(29)
  invalidateFileBlobCache(30)
  invalidateFileBlobCache(31)
  invalidateFileBlobCache(32)
  invalidateFileBlobCache(33)
  invalidateFileBlobCache(34)
  invalidateFileBlobCache(35)
  invalidateFileBlobCache(36)
  invalidateFileBlobCache(37)
  invalidateFileBlobCache(38)
  invalidateFileBlobCache(39)
  invalidateFileBlobCache(40)
  invalidateFileBlobCache(41)
  invalidateFileBlobCache(42)
  invalidateFileBlobCache(43)
  invalidateFileBlobCache(44)
  invalidateFileBlobCache(45)
  invalidateFileBlobCache(46)
  invalidateFileBlobCache(47)
  invalidateFileBlobCache(50)
  invalidateFileBlobCache(51)
  invalidateFileBlobCache(52)
  invalidateFileBlobCache(53)
  invalidateFileBlobCache(54)
  resetDerivativeNegativeCacheForTests()
  clearAppContext()
  resetRuntimeCapabilities()
  resetRuntimeMediaProbeState()
  runtimeModeModel.handleTransportDisconnect()
  resetPreparedSourceLoadabilityForTests()
  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    writable: true,
    value: originalImage,
  })
  Object.defineProperty(globalThis, 'MediaSource', {
    configurable: true,
    writable: true,
    value: originalMediaSource,
  })
  if (originalMediaCapabilitiesDescriptor) {
    Object.defineProperty(
      globalThis.navigator,
      'mediaCapabilities',
      originalMediaCapabilitiesDescriptor,
    )
  } else {
    delete (globalThis.navigator as {mediaCapabilities?: unknown}).mediaCapabilities
  }
  tauriInvokeMock.mockReset()
  vi.clearAllMocks()
})

describe('file-loader', () => {
  it('caches HEIF preview conversions separately from raw downloads', async () => {
    const previewBytes = new TextEncoder().encode('preview-webp')
    const previewImage = vi.fn().mockResolvedValue({
      bytes: previewBytes,
      mimeType: 'image/webp',
      name: 'scan.webp',
      chunkSize: 4096,
    })
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-heic')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          previewImage,
          thumbnailImage: vi.fn(),
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const first = await loadFileSourceById(11, 'scan.heic', {
      mimeType: 'image/heic',
      variant: 'preview-image',
    })
    const second = await loadFileSourceById(11, 'scan.heic', {
      mimeType: 'image/heic',
      variant: 'preview-image',
    })

    expect(first.mimeType).toBe('image/webp')
    expect(await readBlobText(first.blob!)).toBe('preview-webp')
    expect(second.mimeType).toBe('image/webp')
    expect(await readBlobText(second.blob!)).toBe('preview-webp')
    expect(previewImage).toHaveBeenCalledTimes(1)
    expect(download).not.toHaveBeenCalled()
  })

  it('refreshes thumbnail derivatives by bypassing the in-memory blob cache', async () => {
    const thumbnailImage = vi
      .fn()
      .mockResolvedValueOnce({
        bytes: new TextEncoder().encode('old-thumbnail'),
        mimeType: 'image/png',
        name: 'scan.png',
        chunkSize: 4096,
      })
      .mockResolvedValueOnce({
        bytes: new TextEncoder().encode('new-thumbnail'),
        mimeType: 'image/png',
        name: 'scan.png',
        chunkSize: 4096,
      })
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-heic')))

    initDerivativeAppContext({
      thumbnailImage,
      download,
    })

    const first = await loadFileSourceById(47, 'scan.heic', {
      mimeType: 'image/heic',
      variant: 'thumbnail-image',
      derivativeFallback: 'none',
    })
    const refreshed = await loadFileSourceById(47, 'scan.heic', {
      mimeType: 'image/heic',
      variant: 'thumbnail-image',
      derivativeFallback: 'none',
      cachePolicy: 'refresh',
    })

    expect(await readBlobText(first.blob!)).toBe('old-thumbnail')
    expect(await readBlobText(refreshed.blob!)).toBe('new-thumbnail')
    expect(thumbnailImage).toHaveBeenCalledTimes(2)
    expect(thumbnailImage.mock.calls[1]?.[1]).toMatchObject({
      fileName: 'scan.heic',
      mimeType: 'image/heic',
      refreshDerivativeCache: true,
    })
    expect(download).not.toHaveBeenCalled()
  })

  it('keeps raw HEIF bytes available after a preview conversion was cached', async () => {
    const previewImage = vi.fn().mockResolvedValue({
      bytes: new TextEncoder().encode('preview-webp'),
      mimeType: 'image/webp',
      name: 'scan.webp',
      chunkSize: 4096,
    })
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-heic')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          previewImage,
          thumbnailImage: vi.fn(),
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await loadFileSourceById(12, 'scan.heic', {
      mimeType: 'image/heic',
      variant: 'preview-image',
    })
    const raw = await loadFileSourceById(12, 'scan.heic', {
      mimeType: 'image/heic',
    })

    expect(previewImage).toHaveBeenCalledTimes(1)
    expect(download).toHaveBeenCalledTimes(1)
    expect(raw.mimeType).toBe('image/heic')
    expect(await readBlobText(raw.blob!)).toBe('raw-heic')
  })

  it('normalizes typed-array views before creating preview and raw blobs', async () => {
    const previewSource = new TextEncoder().encode('_preview-webp_')
    const rawSource = new TextEncoder().encode('_raw-heic_')
    const previewBytes = previewSource.subarray(1, previewSource.length - 1)
    const rawChunk = rawSource.subarray(1, rawSource.length - 1)

    const previewImage = vi.fn().mockResolvedValue({
      bytes: previewBytes,
      mimeType: 'image/webp',
      name: 'scan.webp',
      chunkSize: 4096,
    })
    const download = vi.fn().mockResolvedValue(streamOf(rawChunk))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          previewImage,
          thumbnailImage: vi.fn(),
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const preview = await loadFileSourceById(11, 'scan.heic', {
      mimeType: 'image/heic',
      variant: 'preview-image',
    })
    const raw = await loadFileSourceById(11, 'scan.heic', {
      mimeType: 'image/heic',
    })

    expect(await readBlobText(preview.blob!)).toBe('preview-webp')
    expect(await readBlobText(raw.blob!)).toBe('raw-heic')
  })

  it('caches thumbnail derivatives separately from preview and raw blobs', async () => {
    const previewImage = vi.fn().mockResolvedValue({
      bytes: new TextEncoder().encode('preview-webp'),
      mimeType: 'image/webp',
      name: 'photo.webp',
      chunkSize: 4096,
    })
    const thumbnailImage = vi.fn().mockResolvedValue({
      bytes: new TextEncoder().encode('thumb-webp'),
      mimeType: 'image/webp',
      name: 'photo.webp',
      chunkSize: 4096,
    })
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-jpeg')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          previewImage,
          thumbnailImage,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const thumbnail = await loadFileSourceById(15, 'photo.jpg', {
      mimeType: 'image/jpeg',
      lastModified: 1710000000000,
      variant: 'thumbnail-image',
    })
    const preview = await loadFileSourceById(15, 'photo.jpg', {
      mimeType: 'image/jpeg',
      lastModified: 1710000000000,
      variant: 'preview-image',
    })
    const raw = await loadFileSourceById(15, 'photo.jpg', {
      mimeType: 'image/jpeg',
      lastModified: 1710000000000,
      variant: 'raw',
    })

    expect(await readBlobText(thumbnail.blob!)).toBe('thumb-webp')
    expect(await readBlobText(preview.blob!)).toBe('preview-webp')
    expect(await readBlobText(raw.blob!)).toBe('raw-jpeg')
    expect(thumbnailImage).toHaveBeenCalledTimes(1)
    expect(previewImage).toHaveBeenCalledTimes(1)
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('falls back to raw bytes when thumbnail generation is unavailable', async () => {
    const thumbnailImage = vi.fn().mockRejectedValue(new Error('Thumbnail unsupported (UNSUPPORTED)'))
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-fallback')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          thumbnailImage,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const result = await loadFileSourceById(16, 'vector.svg', {
      mimeType: 'image/svg+xml',
      variant: 'thumbnail-image',
    })

    expect(await readBlobText(result.blob!)).toBe('raw-fallback')
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('falls back to raw bytes when preview generation fails', async () => {
    const previewImage = vi.fn().mockRejectedValue(new Error('Preview read failed (NODE_NOT_FOUND)'))
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-preview-fallback')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          previewImage,
          thumbnailImage: vi.fn(),
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const result = await loadFileSourceById(17, 'photo.heic', {
      mimeType: 'image/heic',
      variant: 'preview-image',
    })

    expect(await readBlobText(result.blob!)).toBe('raw-preview-fallback')
    expect(result.mimeType).toBe('image/heic')
    expect(previewImage).toHaveBeenCalledTimes(1)
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('throws a display-safe error instead of raw fallback when preview fallback is disabled', async () => {
    const previewImage = vi.fn().mockRejectedValue(new Error('Preview read failed (NODE_NOT_FOUND)'))
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-preview-fallback')))

    initDerivativeAppContext({
      previewImage,
      thumbnailImage: vi.fn(),
      download,
    })

    await expectFileLoadError(
      loadFileSourceById(20, 'photo.heic', {
        mimeType: 'image/heic',
        variant: 'preview-image',
        derivativeFallback: 'none',
      }),
      'DERIVATIVE_UNAVAILABLE',
      'DERIVATIVE_UNAVAILABLE:preview-image',
    )

    expect(previewImage).toHaveBeenCalledTimes(1)
    expect(download).not.toHaveBeenCalled()
  })

  it('loads native prepared sources before raw download in Tauri', async () => {
    const preparePreviewFile = vi.fn().mockResolvedValue({
      kind: 'asset-file',
      previewId: 'preview-23',
      path: '/cache/chromvoid-preview/preview.webp',
      url: 'http://asset.localhost/preview.webp',
      name: 'preview.webp',
      mimeType: 'image/webp',
      size: 42,
      variant: 'preview-image',
    })
    const releasePreviewFile = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          preparePreviewFile,
          releasePreviewFile,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(23, 'photo.heic', {
      mimeType: 'image/heic',
      lastModified: 171,
      variant: 'preview-image',
      derivativeFallback: 'none',
    })

    expect(source).toMatchObject({
      kind: 'asset-file',
      url: 'http://asset.localhost/preview.webp',
      size: 42,
      mimeType: 'image/webp',
    })
    expect(preparePreviewFile).toHaveBeenCalledWith(23, {
      fileName: 'photo.heic',
      mimeType: 'image/heic',
      lastModified: 171,
      variant: 'preview-image',
    })
    expect(download).not.toHaveBeenCalled()

    await source.release()
    expect(releasePreviewFile).toHaveBeenCalledWith(
      expect.objectContaining({previewId: 'preview-23', path: '/cache/chromvoid-preview/preview.webp'}),
    )
  })

  it('skips native prepared sources when the prepared source policy is skip', async () => {
    const preparePreviewFile = vi.fn().mockResolvedValue(preparedSource(41, 'thumbnail-image'))
    const thumbnailImage = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
      name: 'photo.png',
      chunkSize: 3,
    })
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          preparePreviewFile,
          thumbnailImage,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(41, 'photo.heic', {
      mimeType: 'image/heic',
      variant: 'thumbnail-image',
      derivativeFallback: 'none',
      preparedSourcePolicy: 'skip',
    })

    expect(source).toMatchObject({
      kind: 'blob',
      url: 'blob:mock-url',
      size: 3,
      mimeType: 'image/png',
    })
    expect(preparePreviewFile).not.toHaveBeenCalled()
    expect(thumbnailImage).toHaveBeenCalledWith(41, {
      fileName: 'photo.heic',
      mimeType: 'image/heic',
      lastModified: null,
    })
    expect(download).not.toHaveBeenCalled()

    source.release()
  })

  it('does not use blob downloads for raw playable Tauri video when video source is unavailable', async () => {
    const preparePreviewFile = vi.fn().mockResolvedValue({
      kind: 'asset-file',
      previewId: 'preview-24',
      path: '/cache/chromvoid-preview/preview.mp4',
      url: 'http://asset.localhost/preview.mp4',
      name: 'preview.mp4',
      mimeType: 'video/mp4',
      size: 42,
      variant: 'raw',
    })
    const releasePreviewFile = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          preparePreviewFile,
          releasePreviewFile,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(24, 'clip.mp4', {
        mimeType: 'video/mp4',
        sourceSize: 42,
        variant: 'raw',
      }),
      'MEDIA_BLOB_FALLBACK_LIMIT',
      `MEDIA_BLOB_FALLBACK_LIMIT:video-source-required:${MAX_MEDIA_BLOB_FALLBACK_BYTES}`,
    )

    expect(preparePreviewFile).not.toHaveBeenCalled()
    expect(releasePreviewFile).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
  })

  it('does not use legacy media streams for raw playable macOS video', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaStream = vi.fn().mockResolvedValue({
      kind: 'media-stream',
      streamId: 'stream-24',
      url: 'chromvoid-media://localhost/stream-24',
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      size: 42,
      sourceRevision: 9,
      expiresAt: 123456,
    })
    const releaseMediaStream = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaStream,
          releaseMediaStream,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(24, 'clip.mp4', {
        mimeType: 'video/mp4',
        sourceSize: 42,
        variant: 'raw',
      }),
      'MEDIA_VIDEO_PROVIDER_UNAVAILABLE',
      'MEDIA_VIDEO_PROVIDER_UNAVAILABLE',
    )

    expect(prepareMediaStream).not.toHaveBeenCalled()
    expect(releaseMediaStream).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
  })

  it('uses prepared video-source loopback delivery for raw playable macOS video', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
      supports_media_http_stream: true,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaSource = vi.fn().mockResolvedValue({
      kind: 'video-source',
      streamId: 'stream-231',
      sourceToken: 'stream-231',
      platform: 'desktop',
      provider: 'local-catalog',
      deliveries: [
        {
          delivery: 'loopback-http',
          platform: 'desktop',
          url: 'http://127.0.0.1:49152/media/stream-231',
        },
      ],
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      size: 42,
      sourceRevision: 9,
      mediaSourceGeneration: 1,
      expiresAt: 123456,
    })
    const releaseMediaSource = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(24, 'clip.mp4', {
      mimeType: 'video/mp4',
      sourceSize: 42,
      variant: 'raw',
    })

    expect(source).toMatchObject({
      kind: 'video-source',
      url: 'http://127.0.0.1:49152/media/stream-231',
      delivery: 'loopback-http',
      streamId: 'stream-231',
      sourceToken: 'stream-231',
      provider: 'local-catalog',
      size: 42,
      mimeType: 'video/mp4',
      sourceRevision: 9,
      mediaSourceGeneration: 1,
    })
    expect(prepareMediaSource).toHaveBeenCalledWith({
      kind: 'video',
      nodeId: 24,
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
      lastModified: null,
    })
    expect(download).not.toHaveBeenCalled()

    await source.release()
    await source.release()
    expect(releaseMediaSource).toHaveBeenCalledTimes(1)
    expect(releaseMediaSource).toHaveBeenCalledWith(
      expect.objectContaining({streamId: 'stream-231', sourceToken: 'stream-231'}),
    )
  })

  it('does not request prepared desktop video-source without confirmed loopback HTTP capability', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
      supports_media_http_stream: false,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaSource = vi.fn().mockResolvedValue({
      kind: 'video-source',
      streamId: 'stream-disabled-231',
      sourceToken: 'stream-disabled-231',
      platform: 'desktop',
      provider: 'local-catalog',
      deliveries: [
        {
          delivery: 'loopback-http',
          platform: 'desktop',
          url: 'http://127.0.0.1:49152/media/stream-disabled-231',
        },
      ],
      name: 'large.mp4',
      mimeType: 'video/mp4',
      size: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
      sourceRevision: 9,
      mediaSourceGeneration: 1,
      expiresAt: 123456,
    })
    const releaseMediaSource = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(52, 'large.mp4', {
        mimeType: 'video/mp4',
        sourceSize: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
        variant: 'raw',
      }),
      'MEDIA_VIDEO_PROVIDER_UNAVAILABLE',
      'MEDIA_VIDEO_PROVIDER_UNAVAILABLE',
    )

    expect(prepareMediaSource).not.toHaveBeenCalled()
    expect(releaseMediaSource).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
  })

  it('does not request prepared desktop video-source when loopback HTTP probe is unavailable', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
      supports_media_http_stream: true,
    })
    setRuntimeMediaProbeState({loopbackHttp: 'unsupported'})
    runtimeModeModel.setCoreMode('local')
    const prepareMediaSource = vi.fn()
    const releaseMediaSource = vi.fn()
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(52, 'large.mp4', {
        mimeType: 'video/mp4',
        sourceSize: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
        variant: 'raw',
      }),
      'MEDIA_VIDEO_PROVIDER_UNAVAILABLE',
      'MEDIA_VIDEO_PROVIDER_UNAVAILABLE',
    )

    expect(prepareMediaSource).not.toHaveBeenCalled()
    expect(releaseMediaSource).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
  })

  it('does not request prepared desktop video-source when connect-src probe is unavailable', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
      supports_media_http_stream: true,
    })
    setRuntimeMediaProbeState({loopbackHttp: 'supported', connectSrc: 'unsupported'})
    runtimeModeModel.setCoreMode('local')
    const prepareMediaSource = vi.fn()
    const releaseMediaSource = vi.fn()
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(52, 'large.mp4', {
        mimeType: 'video/mp4',
        sourceSize: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
        variant: 'raw',
      }),
      'MEDIA_VIDEO_PROVIDER_UNAVAILABLE',
      'MEDIA_VIDEO_PROVIDER_UNAVAILABLE',
    )

    expect(prepareMediaSource).not.toHaveBeenCalled()
    expect(releaseMediaSource).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
  })

  it('does not request prepared video-source when decode probe rejects the codec', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
      supports_media_http_stream: true,
    })
    setRuntimeMediaProbeState({videoDecode: 'unsupported'})
    runtimeModeModel.setCoreMode('local')
    const prepareMediaSource = vi.fn()
    const releaseMediaSource = vi.fn()
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(52, 'unsupported-codec.mp4', {
        mimeType: 'video/mp4',
        sourceSize: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
        variant: 'raw',
      }),
      'MEDIA_VIDEO_UNSUPPORTED',
      'MEDIA_VIDEO_UNSUPPORTED',
    )

    expect(prepareMediaSource).not.toHaveBeenCalled()
    expect(releaseMediaSource).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
  })

  it('runs the async decode probe concurrently with prepare_media_source', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
      supports_media_http_stream: true,
    })
    runtimeModeModel.setCoreMode('local')
    const decodeDeferred = deferred<{supported: boolean}>()
    const decodingInfo = vi.fn(() => decodeDeferred.promise)
    Object.defineProperty(globalThis.navigator, 'mediaCapabilities', {
      configurable: true,
      value: {decodingInfo},
    })
    const prepareMediaSource = vi.fn().mockResolvedValue({
      kind: 'video-source',
      streamId: 'stream-concurrent-231',
      sourceToken: 'stream-concurrent-231',
      platform: 'desktop',
      provider: 'local-catalog',
      deliveries: [
        {
          delivery: 'loopback-http',
          platform: 'desktop',
          url: 'http://127.0.0.1:49152/media/stream-concurrent-231',
        },
      ],
      name: 'concurrent.mp4',
      mimeType: 'video/mp4',
      size: 42,
      sourceRevision: 9,
      mediaSourceGeneration: 1,
      expiresAt: 123456,
    })
    const releaseMediaSource = vi.fn().mockResolvedValue(undefined)

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
      }),
    )

    const sourcePromise = loadFileSourceById(55, 'concurrent.mp4', {
      mimeType: 'video/mp4',
      sourceSize: 42,
      variant: 'raw',
    })

    // The backend prepare is issued while the decode probe is still pending.
    await vi.waitFor(() => {
      expect(prepareMediaSource).toHaveBeenCalledTimes(1)
    })
    expect(decodingInfo).toHaveBeenCalledTimes(1)

    decodeDeferred.resolve({supported: true})
    const source = await sourcePromise
    expect(source).toMatchObject({
      kind: 'video-source',
      delivery: 'loopback-http',
      streamId: 'stream-concurrent-231',
    })
    await source.release()
    expect(releaseMediaSource).toHaveBeenCalledTimes(1)
  })

  it('releases the prepared source when the concurrent decode probe rejects the codec', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
      supports_media_http_stream: true,
    })
    runtimeModeModel.setCoreMode('local')
    const decodingInfo = vi.fn(async () => ({supported: false}))
    Object.defineProperty(globalThis.navigator, 'mediaCapabilities', {
      configurable: true,
      value: {decodingInfo},
    })
    const prepareMediaSource = vi.fn().mockResolvedValue({
      kind: 'video-source',
      streamId: 'stream-late-release-231',
      sourceToken: 'stream-late-release-231',
      platform: 'desktop',
      provider: 'local-catalog',
      deliveries: [
        {
          delivery: 'loopback-http',
          platform: 'desktop',
          url: 'http://127.0.0.1:49152/media/stream-late-release-231',
        },
      ],
      name: 'late-release.mp4',
      mimeType: 'video/mp4',
      size: 42,
      sourceRevision: 9,
      mediaSourceGeneration: 1,
      expiresAt: 123456,
    })
    const releaseMediaSource = vi.fn().mockResolvedValue(undefined)

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(56, 'late-release.mp4', {
        mimeType: 'video/mp4',
        sourceSize: 42,
        variant: 'raw',
      }),
      'MEDIA_VIDEO_UNSUPPORTED',
      'MEDIA_VIDEO_UNSUPPORTED',
    )

    expect(prepareMediaSource).toHaveBeenCalledTimes(1)
    // The concurrently prepared backend source is released once it resolves.
    await vi.waitFor(() => {
      expect(releaseMediaSource).toHaveBeenCalledWith(
        expect.objectContaining({streamId: 'stream-late-release-231'}),
      )
    })
  })

  it('falls back to loopback HTTP when MSE delivery is not selectable', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_http_stream: true,
      supports_mse_video_playback: true,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaSource = vi.fn().mockResolvedValue({
      kind: 'video-source',
      streamId: 'stream-mse-231',
      sourceToken: 'stream-mse-231',
      platform: 'desktop',
      provider: 'local-catalog',
      deliveries: [
        {
          delivery: 'mse',
          platform: 'desktop',
          fetchUrl: 'http://127.0.0.1:49152/media/stream-mse-231',
          initSegment: {offset: 0, length: 128},
          mediaSegments: [{offset: 128, length: 256, timestampUs: 0}],
        },
        {
          delivery: 'loopback-http',
          platform: 'desktop',
          url: 'http://127.0.0.1:49152/media/stream-mse-231',
        },
      ],
      name: 'fragmented.mp4',
      mimeType: 'video/mp4',
      size: 42,
      sourceRevision: 12,
      mediaSourceGeneration: 1,
      expiresAt: 123456,
    })
    const releaseMediaSource = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(53, 'fragmented.mp4', {
      mimeType: 'video/mp4',
      sourceSize: 42,
      variant: 'raw',
      mediaInfo: {
        kind: 'video',
        audioTracks: 1,
        videoTracks: 1,
        playbackMimeType: 'video/mp4',
        codecString: 'avc1.640028,mp4a.40.2',
        mseFragmented: true,
      },
    })

    expect(source).toMatchObject({
      kind: 'video-source',
      delivery: 'loopback-http',
      url: 'http://127.0.0.1:49152/media/stream-mse-231',
      streamId: 'stream-mse-231',
      sourceToken: 'stream-mse-231',
    })
    expect(download).not.toHaveBeenCalled()

    await source.release()
    expect(releaseMediaSource).toHaveBeenCalledTimes(1)
  })

  it('falls back to loopback HTTP when the MSE controller probe is unavailable', async () => {
    mockMediaSourceTypeSupport(true)
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_http_stream: true,
      supports_mse_video_playback: true,
    })
    setRuntimeMediaProbeState({mseController: 'unsupported'})
    runtimeModeModel.setCoreMode('local')
    const prepareMediaSource = vi.fn().mockResolvedValue({
      kind: 'video-source',
      streamId: 'stream-mse-probe-denied-231',
      sourceToken: 'stream-mse-probe-denied-231',
      platform: 'desktop',
      provider: 'local-catalog',
      deliveries: [
        {
          delivery: 'mse',
          platform: 'desktop',
          fetchUrl: 'http://127.0.0.1:49152/media/stream-mse-probe-denied-231',
          initSegment: {offset: 0, length: 128},
          mediaSegments: [{offset: 128, length: 256, timestampUs: 0}],
        },
        {
          delivery: 'loopback-http',
          platform: 'desktop',
          url: 'http://127.0.0.1:49152/media/stream-mse-probe-denied-231',
        },
      ],
      name: 'fragmented.mp4',
      mimeType: 'video/mp4',
      size: 42,
      sourceRevision: 12,
      mediaSourceGeneration: 1,
      expiresAt: 123456,
    })
    const releaseMediaSource = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(53, 'fragmented.mp4', {
      mimeType: 'video/mp4',
      sourceSize: 42,
      variant: 'raw',
      mediaInfo: {
        kind: 'video',
        audioTracks: 1,
        videoTracks: 1,
        playbackMimeType: 'video/mp4',
        codecString: 'avc1.640028,mp4a.40.2',
        mseFragmented: true,
      },
    })

    expect(source).toMatchObject({
      kind: 'video-source',
      delivery: 'loopback-http',
      url: 'http://127.0.0.1:49152/media/stream-mse-probe-denied-231',
      streamId: 'stream-mse-probe-denied-231',
      sourceToken: 'stream-mse-probe-denied-231',
    })
    expect(download).not.toHaveBeenCalled()

    await source.release()
    expect(releaseMediaSource).toHaveBeenCalledTimes(1)
  })

  it('uses MSE delivery only when MediaSource supports the proven fragmented MP4 descriptor', async () => {
    mockMediaSourceTypeSupport(true)
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_http_stream: true,
      supports_mse_video_playback: true,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaSource = vi.fn().mockResolvedValue({
      kind: 'video-source',
      streamId: 'stream-mse-selected-231',
      sourceToken: 'stream-mse-selected-231',
      platform: 'desktop',
      provider: 'local-catalog',
      deliveries: [
        {
          delivery: 'mse',
          platform: 'desktop',
          fetchUrl: 'http://127.0.0.1:49152/media/stream-mse-selected-231',
          initSegment: {offset: 0, length: 128},
          mediaSegments: [{offset: 128, length: 256, timestampUs: 0}],
        },
        {
          delivery: 'loopback-http',
          platform: 'desktop',
          url: 'http://127.0.0.1:49152/media/stream-mse-selected-231',
        },
      ],
      name: 'fragmented.mp4',
      mimeType: 'video/mp4',
      size: 42,
      sourceRevision: 12,
      mediaSourceGeneration: 1,
      expiresAt: 123456,
    })
    const releaseMediaSource = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))
    const mediaInfo = {
      kind: 'video' as const,
      audioTracks: 1,
      videoTracks: 1,
      playbackMimeType: 'video/mp4',
      codecString: 'avc1.640028,mp4a.40.2',
      mseFragmented: true,
    }

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(53, 'fragmented.mp4', {
      mimeType: 'video/mp4',
      sourceSize: 42,
      variant: 'raw',
      mediaInfo,
    })

    expect(source).toMatchObject({
      kind: 'video-source',
      delivery: 'mse',
      url: 'http://127.0.0.1:49152/media/stream-mse-selected-231',
      streamId: 'stream-mse-selected-231',
      sourceToken: 'stream-mse-selected-231',
      mse: {
        fetchUrl: 'http://127.0.0.1:49152/media/stream-mse-selected-231',
        contentType: 'video/mp4; codecs="avc1.640028,mp4a.40.2"',
        initSegment: {offset: 0, length: 128},
        mediaSegments: [{offset: 128, length: 256, timestampUs: 0}],
      },
    })
    expect(globalThis.MediaSource?.isTypeSupported).toHaveBeenCalledWith(
      'video/mp4; codecs="avc1.640028,mp4a.40.2"',
    )
    expect(download).not.toHaveBeenCalled()

    await source.release()
    expect(releaseMediaSource).toHaveBeenCalledTimes(1)
  })

  it('uses prepared video-source native delivery for raw playable mobile video', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_native_video_playback: true,
      supports_mobile_native_video_playback: true,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaSource = vi.fn().mockResolvedValue({
      kind: 'video-source',
      streamId: 'stream-android-231',
      sourceToken: 'stream-android-231',
      platform: 'mobile',
      provider: 'mobile-local-catalog',
      deliveries: [
        {
          delivery: 'native-video',
          platform: 'mobile',
          nativeSourceToken: 'stream-android-231',
        },
      ],
      name: 'large.mp4',
      mimeType: 'video/mp4',
      size: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
      sourceRevision: 11,
      mediaSourceGeneration: 1,
      expiresAt: 123456,
    })
    const releaseMediaSource = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(37, 'large.mp4', {
      mimeType: 'video/mp4',
      sourceSize: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
      variant: 'raw',
    })

    expect(source).toMatchObject({
      kind: 'video-source',
      url: '',
      delivery: 'native-video',
      streamId: 'stream-android-231',
      sourceToken: 'stream-android-231',
      nativeSourceToken: 'stream-android-231',
      provider: 'mobile-local-catalog',
      size: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
      mimeType: 'video/mp4',
      sourceRevision: 11,
    })
    expect(download).not.toHaveBeenCalled()

    await source.release()
    expect(releaseMediaSource).toHaveBeenCalledWith(
      expect.objectContaining({streamId: 'stream-android-231', sourceToken: 'stream-android-231'}),
    )
  })

  it('uses media streams for raw playable remote audio instead of downloading a blob', async () => {
    setRuntimeCapabilities({
      mobile: true,
      platform: 'ios',
      supports_media_stream_protocol: false,
    })
    runtimeModeModel.setCoreMode({remote: {host: {host_id: 'host-1', type: 'mobile_usb'}}})
    const prepareMediaStream = vi.fn().mockResolvedValue({
      kind: 'media-stream',
      streamId: 'stream-48',
      url: 'chromvoid-media://localhost/stream-48',
      name: 'track.mp3',
      mimeType: 'audio/mpeg',
      size: 9_990_144,
      sourceRevision: 1780561242976,
      expiresAt: 123456,
    })
    const releaseMediaStream = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-audio')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaStream,
          releaseMediaStream,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(48, 'track.mp3', {
      mimeType: 'audio/mpeg',
      sourceSize: 9_990_144,
      variant: 'raw',
    })

    expect(source).toMatchObject({
      kind: 'media-stream',
      url: 'chromvoid-media://localhost/stream-48',
      streamId: 'stream-48',
      size: 9_990_144,
      mimeType: 'audio/mpeg',
      sourceRevision: 1780561242976,
    })
    expect(prepareMediaStream).toHaveBeenCalledWith(48, {
      fileName: 'track.mp3',
      mimeType: 'audio/mpeg',
      lastModified: null,
    })
    expect(download).not.toHaveBeenCalled()

    await source.release()
    expect(releaseMediaStream).toHaveBeenCalledTimes(1)
  })

  it('does not full-download raw playable remote media when stream preparation fails', async () => {
    setRuntimeCapabilities({
      desktop: true,
      platform: 'macos',
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode({remote: {host: {peer_id: 'peer-1', type: 'tauri_remote_wss'}}})
    const prepareMediaStream = vi.fn().mockRejectedValue(new Error('stream unavailable'))
    const releaseMediaStream = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaStream,
          releaseMediaStream,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(49, 'movie.mp4', {
        mimeType: 'video/mp4',
        sourceSize: 8_559_902,
        variant: 'raw',
      }),
      'MEDIA_VIDEO_PROVIDER_UNAVAILABLE',
      'MEDIA_VIDEO_PROVIDER_UNAVAILABLE',
    )

    expect(prepareMediaStream).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
  })

  it('does not full-download raw playable remote video when stream transport is unavailable', async () => {
    setRuntimeCapabilities({
      desktop: true,
      platform: 'macos',
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode({remote: {host: {host_id: 'host-1', type: 'mobile_usb'}}})
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(50, 'remote-broken.mp4', {
        mimeType: 'video/mp4',
        sourceSize: 8_559_902,
        variant: 'raw',
      }),
      'MEDIA_VIDEO_PROVIDER_UNAVAILABLE',
      'MEDIA_VIDEO_PROVIDER_UNAVAILABLE',
    )

    expect(download).not.toHaveBeenCalled()
  })

  it('uses catalog mediaInfo playback MIME for audio-only MP4 native streams', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaStream = vi.fn().mockResolvedValue({
      kind: 'media-stream',
      streamId: 'stream-25',
      url: 'chromvoid-media://localhost/stream-25',
      name: 'podcast.mp4',
      mimeType: 'audio/mp4',
      size: 42,
      sourceRevision: 9,
      expiresAt: 123456,
    })
    const releaseMediaStream = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('audio-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaStream,
          releaseMediaStream,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(25, 'podcast.mp4', {
      mimeType: 'video/mp4',
      mediaInfo: {
        kind: 'audio',
        audioTracks: 1,
        videoTracks: 0,
        playbackMimeType: 'audio/mp4',
      },
      sourceSize: 42,
      variant: 'raw',
    })

    expect(source).toMatchObject({
      kind: 'media-stream',
      mimeType: 'audio/mp4',
      streamId: 'stream-25',
    })
    expect(prepareMediaStream).toHaveBeenCalledWith(25, {
      fileName: 'podcast.mp4',
      mimeType: 'audio/mp4',
      lastModified: null,
    })
    expect(download).not.toHaveBeenCalled()

    await source.release()
  })

  it('does not use legacy media streams for oversized raw macOS video', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaStream = vi.fn().mockResolvedValue({
      kind: 'media-stream',
      streamId: 'stream-36',
      url: 'chromvoid-media://localhost/stream-36',
      name: 'large.mp4',
      mimeType: 'video/mp4',
      size: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
      sourceRevision: 10,
      expiresAt: 123456,
    })
    const releaseMediaStream = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaStream,
          releaseMediaStream,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(36, 'large.mp4', {
        mimeType: 'video/mp4',
        sourceSize: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
        variant: 'raw',
      }),
      'MEDIA_VIDEO_PROVIDER_UNAVAILABLE',
      'MEDIA_VIDEO_PROVIDER_UNAVAILABLE',
    )

    expect(prepareMediaStream).not.toHaveBeenCalled()
    expect(releaseMediaStream).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
  })

  it('uses generic video-source native delivery for oversized raw mobile video', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_native_video_playback: true,
      supports_mobile_native_video_playback: true,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaSource = vi.fn().mockResolvedValue({
      kind: 'video-source',
      streamId: 'stream-android-37',
      sourceToken: 'stream-android-37',
      platform: 'mobile',
      provider: 'mobile-local-catalog',
      deliveries: [
        {
          delivery: 'native-video',
          platform: 'mobile',
          nativeSourceToken: 'native-video-token-37',
        },
      ],
      name: 'large.mp4',
      mimeType: 'video/mp4',
      size: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
      sourceRevision: 11,
      mediaSourceGeneration: 1,
      appForegroundEpoch: 1,
      expiresAt: 123456,
    })
    const releaseMediaSource = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(37, 'large.mp4', {
      mimeType: 'video/mp4',
      sourceSize: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
      variant: 'raw',
    })

    expect(source).toMatchObject({
      kind: 'video-source',
      delivery: 'native-video',
      streamId: 'stream-android-37',
      sourceToken: 'stream-android-37',
      nativeSourceToken: 'native-video-token-37',
      size: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
      mimeType: 'video/mp4',
      sourceRevision: 11,
    })
    expect(prepareMediaSource).toHaveBeenCalledWith({
      kind: 'video',
      nodeId: 37,
      fileName: 'large.mp4',
      mimeType: 'video/mp4',
      lastModified: null,
    })
    expect(download).not.toHaveBeenCalled()

    await source.release()
    expect(releaseMediaSource).toHaveBeenCalledWith(
      expect.objectContaining({streamId: 'stream-android-37', sourceToken: 'stream-android-37'}),
    )
  })

  it('uses generic video-source native delivery for oversized remote USB mobile video', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_native_video_playback: true,
      supports_mobile_native_video_playback: true,
    })
    runtimeModeModel.setCoreMode({remote: {host: {host_id: 'host-1', type: 'mobile_usb'}}})
    const prepareMediaSource = vi.fn().mockResolvedValue({
      kind: 'video-source',
      streamId: 'stream-android-51',
      sourceToken: 'stream-android-51',
      platform: 'mobile',
      provider: 'remote-usb',
      deliveries: [
        {
          delivery: 'native-video',
          platform: 'mobile',
          nativeSourceToken: 'native-video-token-51',
        },
      ],
      name: 'remote-large.mp4',
      mimeType: 'video/mp4',
      size: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
      sourceRevision: 12,
      mediaSourceGeneration: 1,
      transportSessionGeneration: 11,
      appForegroundEpoch: 1,
      expiresAt: 123456,
    })
    const releaseMediaSource = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(51, 'remote-large.mp4', {
      mimeType: 'video/mp4',
      sourceSize: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
      variant: 'raw',
    })

    expect(source).toMatchObject({
      kind: 'video-source',
      delivery: 'native-video',
      streamId: 'stream-android-51',
      sourceToken: 'stream-android-51',
      nativeSourceToken: 'native-video-token-51',
      provider: 'remote-usb',
      size: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
      mimeType: 'video/mp4',
      sourceRevision: 12,
    })
    expect(prepareMediaSource).toHaveBeenCalledWith({
      kind: 'video',
      nodeId: 51,
      fileName: 'remote-large.mp4',
      mimeType: 'video/mp4',
      lastModified: null,
    })
    expect(download).not.toHaveBeenCalled()
    expect(runtimeModeModel.canUseNativeVideoPlayback({transportKind: 'tauri'})).toBe(true)

    await source.release()
    expect(releaseMediaSource).toHaveBeenCalledWith(
      expect.objectContaining({streamId: 'stream-android-51', sourceToken: 'stream-android-51'}),
    )
  })

  it('does not start native video for audio-only MP4 mediaInfo', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_native_video_playback: true,
      supports_mobile_native_video_playback: true,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaSource = vi.fn()
    const releaseMediaSource = vi.fn()
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('audio-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(38, 'podcast.mp4', {
      mimeType: 'video/mp4',
      mediaInfo: {
        kind: 'audio',
        audioTracks: 1,
        videoTracks: 0,
        playbackMimeType: 'audio/mp4',
      },
      sourceSize: 42,
      variant: 'raw',
    })

    expect(source.kind).toBe('blob')
    expect(prepareMediaSource).not.toHaveBeenCalled()
    expect(download).toHaveBeenCalledTimes(1)

    source.release()
  })

  it('keeps mobile video-source failures typed without blob fallback', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_native_video_playback: true,
      supports_mobile_native_video_playback: true,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaSource = vi.fn().mockRejectedValue(new Error('native player failed'))
    const releaseMediaSource = vi.fn()
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(38, 'large.mp4', {
        mimeType: 'video/mp4',
        sourceSize: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
        variant: 'raw',
      }),
      'MEDIA_VIDEO_SOURCE_FAILED',
      'MEDIA_VIDEO_SOURCE_FAILED',
    )

    expect(prepareMediaSource).toHaveBeenCalledTimes(1)
    expect(releaseMediaSource).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
    expect(runtimeModeModel.canUseMobileNativeVideoSource({transportKind: 'tauri'})).toBe(true)
  })

  it('does not ask legacy media streams for raw macOS video when HTTP is gated off', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: false,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaStream = vi.fn().mockResolvedValue({
      kind: 'media-stream',
      streamId: 'stream-24-gated',
      url: 'chromvoid-media://localhost/stream-24-gated',
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      size: 42,
      sourceRevision: 9,
      expiresAt: 123456,
    })
    const releaseMediaStream = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaStream,
          releaseMediaStream,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(24, 'clip.mp4', {
        mimeType: 'video/mp4',
        sourceSize: 42,
        variant: 'raw',
      }),
      'MEDIA_VIDEO_PROVIDER_UNAVAILABLE',
      'MEDIA_VIDEO_PROVIDER_UNAVAILABLE',
    )

    expect(prepareMediaStream).not.toHaveBeenCalled()
    expect(releaseMediaStream).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
  })

  it('does not start blob fallback downloads for oversized playable media', async () => {
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(32, 'large.mp4', {
        mimeType: 'video/mp4',
        sourceSize: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
        variant: 'raw',
      }),
      'MEDIA_BLOB_FALLBACK_LIMIT',
      `MEDIA_BLOB_FALLBACK_LIMIT:video-source-required:${MAX_MEDIA_BLOB_FALLBACK_BYTES}`,
    )

    expect(download).not.toHaveBeenCalled()
  })

  it('does not start blob fallback downloads for playable media with unknown source size', async () => {
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(34, 'unknown-size.mp4', {
        mimeType: 'video/mp4',
        variant: 'raw',
      }),
      'MEDIA_BLOB_FALLBACK_LIMIT',
      `MEDIA_BLOB_FALLBACK_LIMIT:video-source-required:${MAX_MEDIA_BLOB_FALLBACK_BYTES}`,
    )

    expect(download).not.toHaveBeenCalled()
  })

  it.each([
    ['mkv', 'video/x-matroska', 39],
    ['avi', 'video/x-msvideo', 40],
  ])('does not raw-download unsupported .%s video fallbacks', async (extension, mimeType, fileId) => {
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(fileId, `unsupported.${extension}`, {
        mimeType,
        sourceSize: 42,
        variant: 'raw',
      }),
      'MEDIA_BLOB_FALLBACK_LIMIT',
      `MEDIA_BLOB_FALLBACK_LIMIT:unsupported:${MAX_MEDIA_BLOB_FALLBACK_BYTES}`,
    )

    expect(download).not.toHaveBeenCalled()
  })

  it('logs the selected video source path without raw paths when blob fallback is limited', async () => {
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('video-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    localStorage.setItem('chromvoid:image-gallery-debug', 'true')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      await expectFileLoadError(
        loadFileSourceById(35, '/vault/private/large.mp4', {
          mimeType: 'video/mp4',
          sourceSize: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
          variant: 'raw',
        }),
        'MEDIA_BLOB_FALLBACK_LIMIT',
        `MEDIA_BLOB_FALLBACK_LIMIT:video-source-required:${MAX_MEDIA_BLOB_FALLBACK_BYTES}`,
      )

      const sourceAttemptLog = warn.mock.calls.find(([message]) =>
        String(message).includes('video-source.attempt'),
      )
      expect(sourceAttemptLog?.[1]).toMatchObject({
        nodeId: 35,
        fileName: 'large.mp4',
        mimeType: 'video/mp4',
        sourceSize: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
        selectedPath: 'fallback-limited',
        transportKind: 'tauri',
      })
      expect(Object.values((sourceAttemptLog?.[1] ?? {}) as Record<string, unknown>)).not.toContain(
        '/vault/private/large.mp4',
      )
      expect(download).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
      localStorage.removeItem('chromvoid:image-gallery-debug')
    }
  })

  it('allows abortable blob fallback downloads for playable audio at the limit', async () => {
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('audio-bytes')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(33, 'limit.mp3', {
      mimeType: 'audio/mpeg',
      sourceSize: MAX_MEDIA_BLOB_FALLBACK_BYTES,
      variant: 'raw',
    })

    expect(source.kind).toBe('blob')
    expect(await readBlobText(source.blob!)).toBe('audio-bytes')
    expect(download).toHaveBeenCalledTimes(1)
    source.release()
  })

  it('releases active prepared sources before global purge and keeps release idempotent', async () => {
    const preparePreviewFile = vi.fn().mockResolvedValue({
      kind: 'asset-file',
      previewId: 'preview-28',
      path: '/cache/chromvoid-preview/preview.webp',
      url: 'http://asset.localhost/preview.webp',
      name: 'preview.webp',
      mimeType: 'image/webp',
      size: 42,
      variant: 'preview-image',
    })
    const releasePreviewFile = vi.fn().mockResolvedValue(undefined)
    const purgePreviewSources = vi.fn().mockResolvedValue({
      filesRemoved: 1,
      directoriesRemoved: 0,
      bytesRemoved: 42,
      skippedEntries: 0,
    })

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          preparePreviewFile,
          releasePreviewFile,
          purgePreviewSources,
        } as any,
        catalog: {
          api: {
            download: vi.fn(),
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(28, 'photo.heic', {
      mimeType: 'image/heic',
      variant: 'preview-image',
      derivativeFallback: 'none',
    })
    expect(getActivePreparedFileSourceCountForTests()).toBe(1)

    await purgePreparedFileSources('vault-lock')

    expect(releasePreviewFile).toHaveBeenCalledTimes(1)
    expect(releasePreviewFile).toHaveBeenCalledWith(expect.objectContaining({previewId: 'preview-28'}))
    expect(purgePreviewSources).toHaveBeenCalledWith('vault-lock')
    expect(getActivePreparedFileSourceCountForTests()).toBe(0)

    await source.release()
    expect(releasePreviewFile).toHaveBeenCalledTimes(1)
  })

  it('logs global purge lifecycle through the stable redacted source payload', async () => {
    const purgePreviewSources = vi.fn().mockResolvedValue({
      filesRemoved: 0,
      directoriesRemoved: 0,
      bytesRemoved: 0,
      skippedEntries: 0,
    })
    const context = createMockAppContext()
    context.ws.kind = 'tauri'
    context.ws.purgePreviewSources = purgePreviewSources
    initAppContext(context)

    localStorage.setItem('chromvoid:image-gallery-debug', 'true')
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    try {
      await purgePreparedFileSources('startup')

      const purgeLogs = info.mock.calls.filter(([message]) =>
        String(message).includes('prepared-source.purge-'),
      )

      expect(purgeLogs).toHaveLength(2)
      for (const [, meta] of purgeLogs) {
        expect(meta).toMatchObject({
          nodeId: null,
          variant: null,
          sourceKind: 'prepared-source',
          sourceMimeType: null,
          outputMimeType: null,
          sourceRevision: null,
          storageVersion: null,
          requestIntent: null,
          schedulerPriority: null,
          releaseReason: 'startup',
          reason: 'startup',
        })
        expect(Object.keys(meta as Record<string, unknown>)).not.toEqual(
          expect.arrayContaining(['fileName', 'name', 'path']),
        )
      }
    } finally {
      info.mockRestore()
      localStorage.removeItem('chromvoid:image-gallery-debug')
    }

    expect(purgePreviewSources).toHaveBeenCalledWith('startup')
  })

  it('cancels queued display jobs before global purge', async () => {
    const prepared = deferred<PreparedPreviewFileSource>()
    const preparePreviewFile = vi.fn(() => prepared.promise)
    const releasePreviewFile = vi.fn().mockResolvedValue(undefined)
    const purgePreviewSources = vi.fn().mockResolvedValue({
      filesRemoved: 0,
      directoriesRemoved: 0,
      bytesRemoved: 0,
      skippedEntries: 0,
    })
    const context = createMockAppContext()
    context.ws.kind = 'tauri'
    context.ws.preparePreviewFile = preparePreviewFile
    context.ws.releasePreviewFile = releasePreviewFile
    context.ws.purgePreviewSources = purgePreviewSources
    initAppContext(context)

    const first = loadFileSourceById(30, 'first.jpg', {
      mimeType: 'image/jpeg',
      variant: 'preview-image',
      derivativeFallback: 'none',
      displayJobType: 'current-preview',
      displayJobIntentId: 'test:first',
    })
    const second = loadFileSourceById(31, 'second.jpg', {
      mimeType: 'image/jpeg',
      variant: 'preview-image',
      derivativeFallback: 'none',
      displayJobType: 'current-preview',
      displayJobIntentId: 'test:second',
    })

    await vi.waitFor(() => {
      expect(preparePreviewFile).toHaveBeenCalledTimes(1)
    })

    await purgePreparedFileSources('background')

    await expect(second).rejects.toMatchObject({name: 'AbortError'})
    await expect(first).rejects.toMatchObject({name: 'AbortError'})
    expect(preparePreviewFile).toHaveBeenCalledTimes(1)
    expect(purgePreviewSources).toHaveBeenCalledWith('background')

    prepared.resolve({
      kind: 'asset-file',
      previewId: 'preview-late',
      path: '/cache/chromvoid-preview/late.webp',
      url: 'http://asset.localhost/late.webp',
      name: 'late.webp',
      mimeType: 'image/webp',
      size: 4,
      variant: 'preview-image',
    })

    await vi.waitFor(() => {
      expect(releasePreviewFile).toHaveBeenCalledWith(expect.objectContaining({previewId: 'preview-late'}))
    })
  })

  it('keeps visible current priority when prepared-source materialization is saturated', async () => {
    const pending = new Map<number, ReturnType<typeof deferred<PreparedPreviewFileSource>>>()
    const releasePreviewFile = vi.fn().mockResolvedValue(undefined)
    const preparePreviewFile = vi.fn((fileId: number) => {
      const item = deferred<PreparedPreviewFileSource>()
      pending.set(fileId, item)
      return item.promise
    })
    const context = createMockAppContext()
    context.ws.kind = 'tauri'
    context.ws.preparePreviewFile = preparePreviewFile
    context.ws.releasePreviewFile = releasePreviewFile
    initAppContext(context)

    const firstThumbnail = loadFileSourceById(40, 'first.jpg', {
      mimeType: 'image/jpeg',
      variant: 'thumbnail-image',
      derivativeFallback: 'none',
      displayJobType: 'thumbnail',
      displayJobIntentId: 'thumbnail:first',
    })
    const secondThumbnail = loadFileSourceById(41, 'second.jpg', {
      mimeType: 'image/jpeg',
      variant: 'thumbnail-image',
      derivativeFallback: 'none',
      displayJobType: 'thumbnail',
      displayJobIntentId: 'thumbnail:second',
    })
    const thirdThumbnail = loadFileSourceById(42, 'third.jpg', {
      mimeType: 'image/jpeg',
      variant: 'thumbnail-image',
      derivativeFallback: 'none',
      displayJobType: 'thumbnail',
      displayJobIntentId: 'thumbnail:third',
    })

    await vi.waitFor(() => {
      expect(preparePreviewFile.mock.calls.map(([fileId]) => fileId)).toEqual([40, 41])
    })

    const currentPreview = loadFileSourceById(43, 'current.jpg', {
      mimeType: 'image/jpeg',
      variant: 'preview-image',
      derivativeFallback: 'none',
      displayJobType: 'current-preview',
      displayJobIntentId: 'current:visible',
    })

    pending.get(40)?.resolve(preparedSource(40, 'thumbnail-image'))

    await vi.waitFor(() => {
      expect(preparePreviewFile.mock.calls.map(([fileId]) => fileId)).toEqual([40, 41, 43])
    })

    pending.get(43)?.resolve(preparedSource(43, 'preview-image'))
    pending.get(41)?.resolve(preparedSource(41, 'thumbnail-image'))

    await vi.waitFor(() => {
      expect(preparePreviewFile.mock.calls.map(([fileId]) => fileId)).toEqual([40, 41, 43, 42])
    })
    pending.get(42)?.resolve(preparedSource(42, 'thumbnail-image'))

    const sources = await Promise.all([
      firstThumbnail,
      secondThumbnail,
      thirdThumbnail,
      currentPreview,
    ])

    expect(sources.map((source) => source.url)).toEqual([
      'http://asset.localhost/40.webp',
      'http://asset.localhost/41.webp',
      'http://asset.localhost/42.webp',
      'http://asset.localhost/43.webp',
    ])

    await Promise.all(sources.map((source) => source.release()))
  })

  it('falls back to blob source when native prepared source is unavailable', async () => {
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-audio')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(24, 'track.mp3', {
      mimeType: 'audio/mpeg',
      sourceSize: 42,
      variant: 'raw',
    })

    expect(source.kind).toBe('blob')
    expect(source.blob!).toBeInstanceOf(Blob)
    expect(await readBlobText(source.blob!)).toBe('raw-audio')
    expect(download).toHaveBeenCalledTimes(1)

    source.release()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('preserves derivativeFallback none when native prepared source fails', async () => {
    const preparePreviewFile = vi.fn().mockRejectedValue(new Error('native preview unavailable'))
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-preview')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          preparePreviewFile,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(25, 'photo.heic', {
        mimeType: 'image/heic',
        variant: 'preview-image',
        derivativeFallback: 'none',
      }),
      'DERIVATIVE_UNAVAILABLE',
      'DERIVATIVE_UNAVAILABLE:preview-image',
    )

    expect(download).not.toHaveBeenCalled()
  })

  it('negatively caches deterministic prepared-source decode failures for the same derivative key', async () => {
    localStorage.setItem('chromvoid:image-gallery-debug', 'true')
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const decodeError = Object.assign(
      new Error('Image preview decoder returned null: Input was incomplete. (PREVIEW_DECODE)'),
      {code: 'PREVIEW_DECODE'},
    )
    const preparePreviewFile = vi.fn().mockRejectedValue(decodeError)
    const previewImage = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/webp',
      name: 'photo.webp',
      chunkSize: 3,
    })
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-preview')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          preparePreviewFile,
          previewImage,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    try {
      await expectFileLoadError(
        loadFileSourceById(32, 'photo.heic', {
          mimeType: 'image/heic',
          variant: 'preview-image',
          derivativeFallback: 'none',
          lastModified: 100,
        }),
        'DERIVATIVE_UNAVAILABLE',
        'DERIVATIVE_UNAVAILABLE:preview-image',
      )

      await expectFileLoadError(
        loadFileSourceById(32, 'photo.heic', {
          mimeType: 'image/heic',
          variant: 'preview-image',
          derivativeFallback: 'none',
          lastModified: 100,
        }),
        'DERIVATIVE_UNAVAILABLE',
        'DERIVATIVE_UNAVAILABLE:preview-image',
      )

      expect(preparePreviewFile).toHaveBeenCalledTimes(1)
      expect(previewImage).not.toHaveBeenCalled()
      expect(download).not.toHaveBeenCalled()
      expect(
        info.mock.calls.some(([message]) => String(message).includes('derivative.negative-cache-hit')),
      ).toBe(true)
    } finally {
      info.mockRestore()
      warn.mockRestore()
      localStorage.removeItem('chromvoid:image-gallery-debug')
    }
  })

  it('treats missing embedded audio artwork from prepared source as an expected derivative miss', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const artworkError = Object.assign(new Error('Embedded audio artwork is unavailable (UNSUPPORTED)'), {
      code: 'UNSUPPORTED',
    })
    const preparePreviewFile = vi.fn().mockRejectedValue(artworkError)
    const thumbnailImage = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/webp',
      name: 'track.webp',
      chunkSize: 3,
    })
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-audio')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          preparePreviewFile,
          thumbnailImage,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    try {
      await expectFileLoadError(
        loadFileSourceById(48, 'track.mp3', {
          mimeType: 'audio/mpeg',
          variant: 'thumbnail-image',
          derivativeFallback: 'none',
          lastModified: 100,
        }),
        'DERIVATIVE_UNAVAILABLE',
        'DERIVATIVE_UNAVAILABLE:thumbnail-image',
      )

      await expectFileLoadError(
        loadFileSourceById(48, 'track.mp3', {
          mimeType: 'audio/mpeg',
          variant: 'thumbnail-image',
          derivativeFallback: 'none',
          lastModified: 100,
        }),
        'DERIVATIVE_UNAVAILABLE',
        'DERIVATIVE_UNAVAILABLE:thumbnail-image',
      )

      expect(preparePreviewFile).toHaveBeenCalledTimes(1)
      expect(thumbnailImage).not.toHaveBeenCalled()
      expect(download).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('does not reuse derivative negative cache entries across source version hints', async () => {
    const decodeError = Object.assign(
      new Error('Image preview decoder returned null: Input was incomplete. (PREVIEW_DECODE)'),
      {code: 'PREVIEW_DECODE'},
    )
    const preparePreviewFile = vi.fn().mockRejectedValue(decodeError)

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          preparePreviewFile,
        } as any,
        catalog: {
          api: {
            download: vi.fn(),
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(33, 'photo.heic', {
        mimeType: 'image/heic',
        variant: 'preview-image',
        derivativeFallback: 'none',
        lastModified: 100,
      }),
      'DERIVATIVE_UNAVAILABLE',
      'DERIVATIVE_UNAVAILABLE:preview-image',
    )

    await expectFileLoadError(
      loadFileSourceById(33, 'photo.heic', {
        mimeType: 'image/heic',
        variant: 'preview-image',
        derivativeFallback: 'none',
        lastModified: 101,
      }),
      'DERIVATIVE_UNAVAILABLE',
      'DERIVATIVE_UNAVAILABLE:preview-image',
    )

    expect(preparePreviewFile).toHaveBeenCalledTimes(2)
  })

  it('clears a prepared-source negative cache entry when a same-key prepared load succeeds', async () => {
    const decodeError = Object.assign(
      new Error('Image preview decoder returned null: Input was incomplete. (PREVIEW_DECODE)'),
      {code: 'PREVIEW_DECODE'},
    )
    const failed = deferred<PreparedPreviewFileSource>()
    const succeeded = deferred<PreparedPreviewFileSource>()
    const preparePreviewFile = vi
      .fn()
      .mockReturnValueOnce(failed.promise)
      .mockReturnValueOnce(succeeded.promise)
      .mockResolvedValue(preparedSource(36, 'preview-image'))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          preparePreviewFile,
        } as any,
        catalog: {
          api: {
            download: vi.fn(),
          },
        } as any,
      }),
    )

    const failedLoad = loadFileSourceById(36, 'photo.heic', {
      mimeType: 'image/heic',
      variant: 'preview-image',
      derivativeFallback: 'none',
      lastModified: 100,
    })
    const successfulLoad = loadFileSourceById(36, 'photo.heic', {
      mimeType: 'image/heic',
      variant: 'preview-image',
      derivativeFallback: 'none',
      lastModified: 100,
    })

    failed.reject(decodeError)
    await expectFileLoadError(
      failedLoad,
      'DERIVATIVE_UNAVAILABLE',
      'DERIVATIVE_UNAVAILABLE:preview-image',
    )

    succeeded.resolve(preparedSource(36, 'preview-image'))
    const source = await successfulLoad
    await source.release()

    const retriedSource = await loadFileSourceById(36, 'photo.heic', {
      mimeType: 'image/heic',
      variant: 'preview-image',
      derivativeFallback: 'none',
      lastModified: 100,
    })

    expect(preparePreviewFile).toHaveBeenCalledTimes(3)
    await retriedSource.release()
  })

  it('clears a derivative negative cache entry when a same-key derivative load succeeds', async () => {
    const failed = deferred<DerivativeLoadOutput>()
    const succeeded = deferred<DerivativeLoadOutput>()
    const previewImage = vi
      .fn()
      .mockReturnValueOnce(failed.promise)
      .mockReturnValueOnce(succeeded.promise)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-preview')))

    initDerivativeAppContext({
      previewImage,
      download,
    })

    const failedLoad = loadFileSourceById(37, 'photo.heic', {
      mimeType: 'image/heic',
      variant: 'preview-image',
      derivativeFallback: 'none',
      lastModified: 100,
    })
    const successfulLoad = loadFileSourceById(37, 'photo.heic', {
      mimeType: 'image/heic',
      variant: 'preview-image',
      derivativeFallback: 'none',
      lastModified: 100,
    })

    failed.reject(new Error('Image derivative failed (DERIVATIVE_UNAVAILABLE)'))
    await expectFileLoadError(
      failedLoad,
      'DERIVATIVE_UNAVAILABLE',
      'DERIVATIVE_UNAVAILABLE:preview-image',
    )

    succeeded.resolve({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/webp',
      name: 'photo.webp',
      chunkSize: 3,
    })
    const source = await successfulLoad
    source.release()

    const cachedSource = await loadFileSourceById(37, 'photo.heic', {
      mimeType: 'image/heic',
      variant: 'preview-image',
      derivativeFallback: 'none',
      lastModified: 100,
    })

    expect(cachedSource.kind).toBe('blob')
    expect(previewImage).toHaveBeenCalledTimes(2)
    expect(download).not.toHaveBeenCalled()
    cachedSource.release()
  })

  it('clears derivative negative cache entries when a file blob cache is invalidated', async () => {
    const decodeError = Object.assign(
      new Error('Image preview decoder returned null: Input was incomplete. (PREVIEW_DECODE)'),
      {code: 'PREVIEW_DECODE'},
    )
    const preparePreviewFile = vi.fn().mockRejectedValue(decodeError)

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          preparePreviewFile,
        } as any,
        catalog: {
          api: {
            download: vi.fn(),
          },
        } as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(38, 'photo.heic', {
        mimeType: 'image/heic',
        variant: 'preview-image',
        derivativeFallback: 'none',
        lastModified: 100,
      }),
      'DERIVATIVE_UNAVAILABLE',
      'DERIVATIVE_UNAVAILABLE:preview-image',
    )

    invalidateFileBlobCache(38)

    await expectFileLoadError(
      loadFileSourceById(38, 'photo.heic', {
        mimeType: 'image/heic',
        variant: 'preview-image',
        derivativeFallback: 'none',
        lastModified: 100,
      }),
      'DERIVATIVE_UNAVAILABLE',
      'DERIVATIVE_UNAVAILABLE:preview-image',
    )

    expect(preparePreviewFile).toHaveBeenCalledTimes(2)
  })

  it('does not cache aborted prepared-source loads as derivative failures', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    const preparePreviewFile = vi
      .fn()
      .mockRejectedValueOnce(abortError)
      .mockRejectedValueOnce(
        Object.assign(
          new Error('Image preview decoder returned null: Input was incomplete. (PREVIEW_DECODE)'),
          {code: 'PREVIEW_DECODE'},
        ),
      )

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          preparePreviewFile,
        } as any,
        catalog: {
          api: {
            download: vi.fn(),
          },
        } as any,
      }),
    )

    await expect(
      loadFileSourceById(34, 'photo.jpg', {
        mimeType: 'image/jpeg',
        variant: 'preview-image',
        derivativeFallback: 'none',
      }),
    ).rejects.toMatchObject({name: 'AbortError'})

    await expectFileLoadError(
      loadFileSourceById(34, 'photo.jpg', {
        mimeType: 'image/jpeg',
        variant: 'preview-image',
        derivativeFallback: 'none',
      }),
      'DERIVATIVE_UNAVAILABLE',
      'DERIVATIVE_UNAVAILABLE:preview-image',
    )

    expect(preparePreviewFile).toHaveBeenCalledTimes(2)
  })

  it('keeps generic prepared-source failures on the derivative fallback path', async () => {
    const preparePreviewFile = vi.fn().mockRejectedValue(new Error('native preview unavailable'))
    const previewImage = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/webp',
      name: 'photo.webp',
      chunkSize: 3,
    })
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-preview')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          preparePreviewFile,
          previewImage,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(35, 'photo.heic', {
      mimeType: 'image/heic',
      variant: 'preview-image',
      derivativeFallback: 'none',
    })

    expect(source).toMatchObject({
      kind: 'blob',
      url: 'blob:mock-url',
      size: 3,
      mimeType: 'image/webp',
    })
    expect(preparePreviewFile).toHaveBeenCalledTimes(1)
    expect(previewImage).toHaveBeenCalledTimes(1)
    expect(download).not.toHaveBeenCalled()

    source.release()
  })

  it('releases stale native source if preparation resolves after abort', async () => {
    const pending = deferred<any>()
    const releasePreviewFile = vi.fn().mockResolvedValue(undefined)
    const preparePreviewFile = vi.fn().mockReturnValue(pending.promise)

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          preparePreviewFile,
          releasePreviewFile,
        } as any,
        catalog: {
          api: {
            download: vi.fn(),
          },
        } as any,
      }),
    )

    const controller = new AbortController()
    const load = loadFileSourceById(26, 'photo.jpg', {
      signal: controller.signal,
      mimeType: 'image/jpeg',
      variant: 'preview-image',
    })
    controller.abort()
    pending.resolve({
      kind: 'asset-file',
      previewId: 'preview-aborted',
      path: '/cache/chromvoid-preview/aborted.webp',
      url: 'http://asset.localhost/aborted.webp',
      name: 'aborted.webp',
      mimeType: 'image/webp',
      size: 10,
      variant: 'preview-image',
    })

    await expect(load).rejects.toMatchObject({name: 'AbortError'})
    await vi.waitFor(() => {
      expect(releasePreviewFile).toHaveBeenCalledWith(
        expect.objectContaining({previewId: 'preview-aborted'}),
      )
    })
  })

  it('uses prepared asset sources on mobile Tauri when the asset URL is image-loadable', async () => {
    setRuntimeCapabilities({platform: 'ios', mobile: true})
    mockPreparedSourceImageLoadability('load')
    const prepared = preparedSource(27, 'preview-image')
    const preparePreviewFile = vi.fn().mockResolvedValue(prepared)
    const releasePreviewFile = vi.fn().mockResolvedValue(undefined)
    const previewImage = vi.fn()
    const download = vi.fn()

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          preparePreviewFile,
          releasePreviewFile,
          previewImage,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(27, 'photo.webp', {
      mimeType: 'image/webp',
      variant: 'preview-image',
      derivativeFallback: 'none',
    })

    expect(source).toMatchObject({
      kind: 'asset-file',
      url: prepared.url,
      size: 4,
      mimeType: 'image/webp',
    })
    expect(preparePreviewFile).toHaveBeenCalledWith(27, {
      fileName: 'photo.webp',
      mimeType: 'image/webp',
      lastModified: null,
      variant: 'preview-image',
    })
    expect(previewImage).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
    expect(getActivePreparedFileSourceCountForTests()).toBe(1)

    await source.release()
    expect(releasePreviewFile).toHaveBeenCalledWith(prepared)
  })

  it('falls back to derivative blobs on mobile Tauri when the prepared asset URL is not image-loadable', async () => {
    setRuntimeCapabilities({platform: 'ios', mobile: true})
    mockPreparedSourceImageLoadability('error')
    const prepared = preparedSource(28, 'preview-image')
    const preparePreviewFile = vi.fn().mockResolvedValue(prepared)
    const releasePreviewFile = vi.fn().mockResolvedValue(undefined)
    const previewImage = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/webp',
      name: 'mobile.webp',
      chunkSize: 3,
    })
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('mobile-raw')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          preparePreviewFile,
          releasePreviewFile,
          previewImage,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(28, 'photo.webp', {
      mimeType: 'image/webp',
      variant: 'preview-image',
      derivativeFallback: 'none',
    })

    expect(source).toMatchObject({
      kind: 'blob',
      url: 'blob:mock-url',
      size: 3,
      mimeType: 'image/webp',
    })
    expect(preparePreviewFile).toHaveBeenCalledTimes(1)
    expect(releasePreviewFile).toHaveBeenCalledWith(prepared)
    expect(previewImage).toHaveBeenCalledWith(28, {
      fileName: 'photo.webp',
      mimeType: 'image/webp',
      lastModified: null,
    })
    expect(download).not.toHaveBeenCalled()

    await source.release()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

    const secondSource = await loadFileSourceById(29, 'second-photo.webp', {
      mimeType: 'image/webp',
      variant: 'preview-image',
      derivativeFallback: 'none',
    })

    expect(secondSource.kind).toBe('blob')
    expect(preparePreviewFile).toHaveBeenCalledTimes(1)
    expect(previewImage).toHaveBeenLastCalledWith(29, {
      fileName: 'second-photo.webp',
      mimeType: 'image/webp',
      lastModified: null,
    })

    await secondSource.release()
  })

  it('falls back to thumbnail derivative blobs on mobile Tauri when the prepared thumbnail asset is not image-loadable', async () => {
    setRuntimeCapabilities({platform: 'ios', mobile: true})
    mockPreparedSourceImageLoadability('error')
    const prepared = preparedSource(44, 'thumbnail-image')
    const preparePreviewFile = vi.fn().mockResolvedValue(prepared)
    const releasePreviewFile = vi.fn().mockResolvedValue(undefined)
    const thumbnailImage = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
      name: 'mobile-thumb.png',
      chunkSize: 3,
    })
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('mobile-raw')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          preparePreviewFile,
          releasePreviewFile,
          thumbnailImage,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const source = await loadFileSourceById(44, 'photo.heic', {
      mimeType: 'image/heic',
      variant: 'thumbnail-image',
      derivativeFallback: 'none',
    })

    expect(source).toMatchObject({
      kind: 'blob',
      url: 'blob:mock-url',
      size: 3,
      mimeType: 'image/png',
    })
    expect(preparePreviewFile).toHaveBeenCalledTimes(1)
    expect(releasePreviewFile).toHaveBeenCalledWith(prepared)
    expect(thumbnailImage).toHaveBeenCalledWith(44, {
      fileName: 'photo.heic',
      mimeType: 'image/heic',
      lastModified: null,
    })
    expect(download).not.toHaveBeenCalled()

    source.release()
  })

  it('does not reuse a raw-fallback derivative cache entry when fallback is disabled', async () => {
    const previewImage = vi
      .fn()
      .mockRejectedValueOnce(new Error('Preview read failed (UNSUPPORTED)'))
      .mockRejectedValueOnce(new Error('Preview read failed (UNSUPPORTED)'))
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-preview-fallback')))

    initDerivativeAppContext({
      previewImage,
      thumbnailImage: vi.fn(),
      download,
    })

    const fallbackResult = await loadFileSourceById(20, 'photo.heic', {
      mimeType: 'image/heic',
      variant: 'preview-image',
    })
    expect(await readBlobText(fallbackResult.blob!)).toBe('raw-preview-fallback')

    await expectFileLoadError(
      loadFileSourceById(20, 'photo.heic', {
        mimeType: 'image/heic',
        variant: 'preview-image',
        derivativeFallback: 'none',
      }),
      'DERIVATIVE_UNAVAILABLE',
      'DERIVATIVE_UNAVAILABLE:preview-image',
    )

    expect(previewImage).toHaveBeenCalledTimes(2)
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('throws a display-safe error instead of raw fallback when thumbnail generation is unavailable', async () => {
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-thumbnail-fallback')))

    initDerivativeAppContext({
      download,
    })

    await expectFileLoadError(
      loadFileSourceById(21, 'vector.svg', {
        mimeType: 'image/svg+xml',
        variant: 'thumbnail-image',
        derivativeFallback: 'none',
      }),
      'DERIVATIVE_UNAVAILABLE',
      'DERIVATIVE_UNAVAILABLE:thumbnail-image',
    )

    expect(download).not.toHaveBeenCalled()
  })

  it('keeps AbortError behavior when derivative fallback is disabled', async () => {
    const preview = deferred<DerivativeLoadOutput>()
    const previewImage = vi.fn().mockReturnValue(preview.promise)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw')))

    initDerivativeAppContext({
      previewImage,
      thumbnailImage: vi.fn(),
      download,
    })

    const controller = new AbortController()
    const aborted = loadFileSourceById(22, 'photo.jpg', {
      signal: controller.signal,
      mimeType: 'image/jpeg',
      variant: 'preview-image',
      derivativeFallback: 'none',
    })

    controller.abort()
    preview.resolve({
      bytes: new TextEncoder().encode('preview'),
      mimeType: 'image/webp',
      name: 'photo.webp',
      chunkSize: 4096,
    })

    await expect(aborted).rejects.toMatchObject({name: 'AbortError'})
    expect(download).not.toHaveBeenCalled()
  })

  it('does not retain oversized raw blobs in the shared memory cache', async () => {
    const largeBytes = new Uint8Array(9 * 1024 * 1024)
    const download = vi.fn().mockResolvedValue(streamOf(largeBytes))

    initAppContext(
      createMockAppContext({
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await loadFileSourceById(18, 'large.jpg', {
      mimeType: 'image/jpeg',
    })
    await loadFileSourceById(18, 'large.jpg', {
      mimeType: 'image/jpeg',
    })

    expect(download).toHaveBeenCalledTimes(2)
  })

  it('does not cache an aborted derivative result', async () => {
    const preview = deferred<{
      bytes: Uint8Array
      mimeType: string
      name: string
      chunkSize: number
    }>()
    const previewImage = vi.fn().mockReturnValue(preview.promise)
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          previewImage,
          thumbnailImage: vi.fn(),
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const controller = new AbortController()
    const aborted = loadFileSourceById(19, 'photo.jpg', {
      signal: controller.signal,
      mimeType: 'image/jpeg',
      variant: 'preview-image',
    })

    controller.abort()
    preview.resolve({
      bytes: new TextEncoder().encode('preview'),
      mimeType: 'image/webp',
      name: 'photo.webp',
      chunkSize: 4096,
    })

    await expect(aborted).rejects.toMatchObject({name: 'AbortError'})

    await loadFileSourceById(19, 'photo.jpg', {
      mimeType: 'image/jpeg',
      variant: 'preview-image',
    })

    expect(previewImage).toHaveBeenCalledTimes(2)
    expect(download).not.toHaveBeenCalled()
  })
})

describe('chunked tauri download', () => {
  type RangeCall = {offset: number; length: number; expectedSourceRevision: number}

  function mockRangedBackend(options: {
    size: number
    sourceRevision: number
    fileBytes: Uint8Array
    onRangeCall?: (call: RangeCall, index: number) => void
  }) {
    const rangeCalls: RangeCall[] = []
    tauriInvokeMock.mockImplementation(async (command: string, payload?: Record<string, unknown>) => {
      if (command === 'rpc_dispatch') {
        return {
          ok: true,
          result: {
            command: 'catalog:source:metadata',
            result: {size: options.size, source_revision: options.sourceRevision},
          },
        }
      }
      if (command === 'catalog_download_range') {
        const call = payload as unknown as RangeCall
        rangeCalls.push({
          offset: call.offset,
          length: call.length,
          expectedSourceRevision: call.expectedSourceRevision,
        })
        options.onRangeCall?.(call, rangeCalls.length - 1)
        return {
          ok: true,
          result: Array.from(options.fileBytes.subarray(call.offset, call.offset + call.length)),
        }
      }
      throw new Error(`unexpected tauri invoke: ${command}`)
    })
    return rangeCalls
  }

  it('streams ranged chunks lazily and matches the whole file', async () => {
    const fileBytes = new TextEncoder().encode('0123456789')
    const rangeCalls = mockRangedBackend({size: fileBytes.length, sourceRevision: 7, fileBytes})

    const stream = await downloadFileViaTauri(61, {rangeChunkBytes: 4})
    expect(rangeCalls).toHaveLength(0)

    const received: Uint8Array[] = []
    for await (const chunk of stream) {
      received.push(chunk)
    }

    expect(received.map((chunk) => chunk.byteLength)).toEqual([4, 4, 2])
    const total = new Uint8Array(fileBytes.length)
    let offset = 0
    for (const chunk of received) {
      total.set(chunk, offset)
      offset += chunk.byteLength
    }
    expect(new TextDecoder().decode(total)).toBe('0123456789')
    expect(rangeCalls).toEqual([
      {offset: 0, length: 4, expectedSourceRevision: 7},
      {offset: 4, length: 4, expectedSourceRevision: 7},
      {offset: 8, length: 2, expectedSourceRevision: 7},
    ])
  })

  it('stops further range IPC when the consumer aborts between chunks', async () => {
    const fileBytes = new Uint8Array(12).fill(1)
    const controller = new AbortController()
    const rangeCalls = mockRangedBackend({
      size: fileBytes.length,
      sourceRevision: 3,
      fileBytes,
      onRangeCall: (_call, index) => {
        if (index === 0) {
          // Simulate a user cancel while the first chunk is in flight.
          controller.abort()
        }
      },
    })

    initAppContext(
      createMockAppContext({
        ws: {kind: 'tauri'} as any,
        catalog: {
          api: {
            download: (fileId: number) => downloadFileViaTauri(fileId, {rangeChunkBytes: 4}),
          },
        } as any,
      }),
    )

    await expect(
      loadFileSourceById(62, 'photo.png', {
        signal: controller.signal,
        mimeType: 'image/png',
        variant: 'raw',
      }),
    ).rejects.toMatchObject({name: 'AbortError'})

    // Only the first of the three ranges crossed IPC; the abort between
    // chunks stopped the remaining range reads.
    expect(rangeCalls).toHaveLength(1)
  })

  it('falls back to the whole-file download when source metadata is unavailable', async () => {
    tauriInvokeMock.mockImplementation(async (command: string) => {
      if (command === 'rpc_dispatch') {
        return {ok: false, error: 'metadata unavailable', code: 'INTERNAL'}
      }
      if (command === 'catalog_download') {
        return {
          ok: true,
          result: {
            meta: {name: 'legacy.bin', type: 'application/octet-stream', size: 3, chunk_size: 2},
            bytes: [9, 8, 7],
          },
        }
      }
      throw new Error(`unexpected tauri invoke: ${command}`)
    })

    const stream = await downloadFileViaTauri(63)
    const received: number[] = []
    for await (const chunk of stream) {
      received.push(...chunk)
    }

    expect(received).toEqual([9, 8, 7])
    expect(tauriInvokeMock.mock.calls.map(([command]) => command)).toEqual([
      'rpc_dispatch',
      'catalog_download',
    ])
  })

  it('propagates stale source revision errors from a ranged chunk', async () => {
    tauriInvokeMock.mockImplementation(async (command: string) => {
      if (command === 'rpc_dispatch') {
        return {
          ok: true,
          result: {
            command: 'catalog:source:metadata',
            result: {size: 8, source_revision: 4},
          },
        }
      }
      if (command === 'catalog_download_range') {
        return {ok: false, error: 'source revision is stale', code: 'CONFLICT'}
      }
      throw new Error(`unexpected tauri invoke: ${command}`)
    })

    const stream = await downloadFileViaTauri(64, {rangeChunkBytes: 4})
    const iterator = stream[Symbol.asyncIterator]()
    await expect(iterator.next()).rejects.toThrow('source revision is stale (CONFLICT)')
  })

  it('enforces the media size limit mid-stream without pulling further chunks', async () => {
    setRuntimeCapabilities({platform: 'ios', mobile: true})
    runtimeModeModel.setCoreMode('local')

    const chunkBytes = 22 * 1024 * 1024
    let pulls = 0
    const lazyStream: AsyncIterable<Uint8Array> = {
      async *[Symbol.asyncIterator]() {
        // Would deliver far more chunks than the limit allows; the consumer
        // must stop pulling once the running size limit trips.
        for (let index = 0; index < 8; index += 1) {
          pulls += 1
          yield new Uint8Array(chunkBytes)
        }
      },
    }
    const download = vi.fn().mockResolvedValue(lazyStream)

    initAppContext(
      createMockAppContext({
        ws: {kind: 'tauri'} as any,
        catalog: {api: {download}} as any,
      }),
    )

    await expectFileLoadError(
      loadFileSourceById(65, 'track.mp3', {
        mimeType: 'audio/mpeg',
        // Stale/incorrect authoritative size below the limit lets the download
        // start; the streamed guard must stop it mid-stream.
        sourceSize: 1024,
        variant: 'raw',
      }),
      'MEDIA_BLOB_FALLBACK_LIMIT',
      `MEDIA_BLOB_FALLBACK_LIMIT:${chunkBytes * 3}:${MAX_MEDIA_BLOB_FALLBACK_BYTES}`,
    )

    // 64 MiB limit, 22 MiB chunks: the third pulled chunk trips the limit, so
    // the limit is exceeded by less than one chunk and no fourth pull happens.
    expect(pulls).toBe(3)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
