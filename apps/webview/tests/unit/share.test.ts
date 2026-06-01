import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest'

import {setRuntimeCapabilities, resetRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {invalidateFileBlobCache} from '../../src/features/media/components/file-loader'
import {canShareFiles, shareFile, shareFiles} from '../../src/shared/services/share'

const originalCreateObjectURL = URL.createObjectURL
const originalNavigatorShare = navigator.share
const originalNavigatorCanShare = navigator.canShare
const originalTauriInternals = (globalThis as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
  }
})

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

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => 'blob:share-url'),
  })
})

afterAll(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: originalCreateObjectURL,
  })
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    writable: true,
    value: originalNavigatorShare,
  })
  Object.defineProperty(navigator, 'canShare', {
    configurable: true,
    writable: true,
    value: originalNavigatorCanShare,
  })
  Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
    configurable: true,
    writable: true,
    value: originalTauriInternals,
  })
})

afterEach(() => {
  invalidateFileBlobCache(21)
  invalidateFileBlobCache(22)
  clearAppContext()
  resetRuntimeCapabilities()
  tauriInvoke.mockReset()
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    writable: true,
    value: originalNavigatorShare,
  })
  Object.defineProperty(navigator, 'canShare', {
    configurable: true,
    writable: true,
    value: originalNavigatorCanShare,
  })
  Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
    configurable: true,
    writable: true,
    value: originalTauriInternals,
  })
})

describe('shareFile', () => {
  it('shares raw HEIF bytes instead of the preview-image variant', async () => {
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('raw-heic')))
    const previewImage = vi.fn().mockResolvedValue({
      bytes: new TextEncoder().encode('preview-webp'),
      mimeType: 'image/webp',
      name: 'scan.webp',
      chunkSize: 4096,
    })
    const share = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: share,
    })

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          previewImage,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await shareFile(21, 'scan.heic')

    expect(previewImage).not.toHaveBeenCalled()
    expect(download).toHaveBeenCalledTimes(1)
    expect(share).toHaveBeenCalledTimes(1)

    const sharedFile = share.mock.calls[0]?.[0]?.files?.[0] as File
    expect(sharedFile.name).toBe('scan.heic')
    expect(sharedFile.type).toBe('image/heic')
    expect(await readBlobText(sharedFile)).toBe('raw-heic')
  })

  it('shares multiple files in a single Web Share payload', async () => {
    const download = vi.fn().mockImplementation((fileId: number) => {
      if (fileId === 21) {
        return Promise.resolve(streamOf(new TextEncoder().encode('raw-heic')))
      }

      if (fileId === 22) {
        return Promise.resolve(streamOf(new TextEncoder().encode('plain-text')))
      }

      throw new Error(`Unexpected file id: ${fileId}`)
    })
    const share = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: share,
    })

    initAppContext(
      createMockAppContext({
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await shareFiles([
      {fileId: 21, fileName: 'scan.heic', mimeType: 'image/heic'},
      {fileId: 22, fileName: 'notes.txt', mimeType: 'text/plain'},
    ])

    expect(download).toHaveBeenCalledTimes(2)
    expect(share).toHaveBeenCalledTimes(1)

    const sharedFiles = share.mock.calls[0]?.[0]?.files as File[]
    expect(sharedFiles).toHaveLength(2)
    expect(
      sharedFiles.map((file) => ({
        name: file.name,
        type: file.type,
      })),
    ).toEqual([
      {name: 'scan.heic', type: 'image/heic'},
      {name: 'notes.txt', type: 'text/plain'},
    ])
    expect(await readBlobText(sharedFiles[0]!)).toBe('raw-heic')
    expect(await readBlobText(sharedFiles[1]!)).toBe('plain-text')
  })

  it('uses inferred markdown MIME for browser Share file construction when metadata is generic', async () => {
    const download = vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('# Note')))
    const share = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: share,
    })

    initAppContext(
      createMockAppContext({
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await shareFiles([{fileId: 21, fileName: 'note.md', mimeType: 'application/octet-stream'}])

    expect(download).toHaveBeenCalledTimes(1)
    expect(share).toHaveBeenCalledTimes(1)

    const sharedFile = share.mock.calls[0]?.[0]?.files?.[0] as File
    expect(sharedFile.name).toBe('note.md')
    expect(sharedFile.type).toBe('text/markdown')
    expect(await readBlobText(sharedFile)).toBe('# Note')
  })

  it('treats native-share-capable Tauri as share-capable without Web Share API and routes share through IPC', async () => {
    setRuntimeCapabilities({platform: 'android', mobile: true, supports_native_share: true})
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: undefined,
    })
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      writable: true,
      value: undefined,
    })
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      writable: true,
      value: {invoke: vi.fn()},
    })
    tauriInvoke.mockResolvedValue({
      ok: true,
      result: {shared: true},
    })

    expect(canShareFiles()).toBe(true)

    await shareFiles([
      {fileId: 21, fileName: 'scan.heic', mimeType: 'image/heic'},
      {fileId: 22, fileName: 'notes.txt', mimeType: 'text/plain'},
    ])

    expect(tauriInvoke).toHaveBeenCalledWith('catalog_share_files', {
      args: {
        items: [
          {nodeId: 21, fileName: 'scan.heic', mimeType: 'image/heic'},
          {nodeId: 22, fileName: 'notes.txt', mimeType: 'text/plain'},
        ],
      },
    })
  })

  it('infers markdown MIME for native Tauri share when metadata is missing or generic', async () => {
    setRuntimeCapabilities({platform: 'android', mobile: true, supports_native_share: true})
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      writable: true,
      value: {invoke: vi.fn()},
    })
    tauriInvoke.mockResolvedValue({
      ok: true,
      result: {shared: true},
    })

    await shareFiles([
      {fileId: 21, fileName: 'note.md'},
      {fileId: 22, fileName: 'legacy.markdown', mimeType: 'application/octet-stream'},
    ])

    expect(tauriInvoke).toHaveBeenCalledWith('catalog_share_files', {
      args: {
        items: [
          {nodeId: 21, fileName: 'note.md', mimeType: 'text/markdown'},
          {nodeId: 22, fileName: 'legacy.markdown', mimeType: 'text/markdown'},
        ],
      },
    })
  })

  it('does not call Web Share API in unsupported Tauri runtimes', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      writable: true,
      value: {invoke: vi.fn()},
    })
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: share,
    })
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      writable: true,
      value: vi.fn(() => true),
    })
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_native_share: false})

    expect(canShareFiles()).toBe(false)

    await shareFile(21, 'scan.heic')

    expect(share).not.toHaveBeenCalled()
    expect(tauriInvoke).not.toHaveBeenCalled()
  })
})
