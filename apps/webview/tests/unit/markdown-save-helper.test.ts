import {afterEach, describe, expect, it, vi} from 'vitest'

import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {
  FileLoadError,
  loadTextFileById,
  saveTextFileById,
} from '../../src/features/media/components/file-loader'

function streamOf(...chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

function setupTextCatalog(overrides?: {
  sourceMetadata?: ReturnType<typeof vi.fn>
  download?: ReturnType<typeof vi.fn>
  replaceFile?: ReturnType<typeof vi.fn>
}) {
  const sourceMetadata =
    overrides?.sourceMetadata ??
    vi.fn().mockResolvedValue({
      nodeId: 7,
      nodeType: 1,
      name: 'notes.md',
      mimeType: 'text/markdown',
      size: 7,
      sourceRevision: 11,
    })
  const download =
    overrides?.download ?? vi.fn().mockResolvedValue(streamOf(new TextEncoder().encode('# Notes')))
  const replaceFile =
    overrides?.replaceFile ??
    vi.fn().mockResolvedValue({
      nodeId: 7,
      size: 7,
      mimeType: 'text/markdown',
      modtime: 123,
      sourceRevision: 12,
    })

  initAppContext(
    createMockAppContext({
      catalog: {
        api: {
          sourceMetadata,
          download,
          replaceFile,
        },
      } as any,
    }),
  )

  return {sourceMetadata, download, replaceFile}
}

async function expectFileLoadError(promise: Promise<unknown>, code: FileLoadError['code']) {
  let error: unknown
  try {
    await promise
  } catch (caught) {
    error = caught
  }

  expect(error).toBeInstanceOf(FileLoadError)
  expect((error as FileLoadError).code).toBe(code)
}

describe('text file I/O helper', () => {
  afterEach(() => {
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('loads text with source metadata and source revision', async () => {
    setupTextCatalog()

    await expect(loadTextFileById(7, 'notes.md')).resolves.toEqual({
      text: '# Notes',
      size: 7,
      mimeType: 'text/markdown',
      sourceRevision: 11,
    })
  })

  it('can load text as read-only when source metadata is unavailable', async () => {
    setupTextCatalog({
      sourceMetadata: vi.fn().mockRejectedValue(new Error('Unsupported command catalog:source:metadata')),
    })

    await expect(loadTextFileById(7, 'notes.md', {allowMetadataFallback: true})).resolves.toEqual({
      text: '# Notes',
      size: 7,
      mimeType: 'text/markdown',
      sourceRevision: null,
      sourceMetadataUnavailable: true,
    })
  })

  it('rejects mismatched source metadata before downloading', async () => {
    const download = vi.fn()
    setupTextCatalog({
      sourceMetadata: vi.fn().mockResolvedValue({
        nodeId: 7,
        nodeType: 1,
        name: 'other.md',
        mimeType: 'text/markdown',
        size: 7,
        sourceRevision: 11,
      }),
      download,
    })

    await expectFileLoadError(loadTextFileById(7, 'notes.md'), 'TEXT_SOURCE_MISMATCH')
    expect(download).not.toHaveBeenCalled()
  })

  it('uses fatal UTF-8 decoding for text loads', async () => {
    setupTextCatalog({
      download: vi.fn().mockResolvedValue(streamOf(new Uint8Array([0xff]))),
    })

    await expectFileLoadError(loadTextFileById(7, 'notes.md'), 'TEXT_INVALID_UTF8')
  })

  it('saves markdown through catalog replacement with revision precondition', async () => {
    const {replaceFile} = setupTextCatalog()

    await expect(
      saveTextFileById(7, 'notes.md', '# Notes', {
        expectedSourceRevision: 11,
      }),
    ).resolves.toEqual({
      nodeId: 7,
      size: 7,
      mimeType: 'text/markdown',
      modtime: 123,
      sourceRevision: 12,
    })

    expect(replaceFile).toHaveBeenCalledTimes(1)
    const call = replaceFile.mock.calls[0]
    expect(call?.[0]).toBe(7)
    expect(call?.[2]).toEqual({
      mimeType: 'text/markdown',
      expectedSourceRevision: 11,
      conflictMode: 'fail_if_stale',
    })
    const bytes = call?.[1] as Uint8Array
    expect(new TextDecoder().decode(bytes)).toBe('# Notes')
  })

  it('allows zero-byte saves', async () => {
    const {replaceFile} = setupTextCatalog()

    await saveTextFileById(7, 'notes.md', '', {
      expectedSourceRevision: 11,
    })

    const bytes = replaceFile.mock.calls[0]?.[1] as Uint8Array
    expect(bytes.byteLength).toBe(0)
  })

  it('maps stale replacement errors to a stable text I/O error', async () => {
    const error = new Error('stale')
    ;(error as Error & {code?: string}).code = 'ERR_STALE_SOURCE'
    setupTextCatalog({
      replaceFile: vi.fn().mockRejectedValue(error),
    })

    await expectFileLoadError(
      saveTextFileById(7, 'notes.md', '# Notes', {
        expectedSourceRevision: 10,
      }),
      'TEXT_STALE_SOURCE',
    )
  })

  it('does not start replacement after an abort', async () => {
    const {replaceFile} = setupTextCatalog()
    const controller = new AbortController()
    controller.abort()

    await expect(saveTextFileById(7, 'notes.md', '# Notes', {
      expectedSourceRevision: 11,
      signal: controller.signal,
    })).rejects.toMatchObject({name: 'AbortError'})
    expect(replaceFile).not.toHaveBeenCalled()
  })
})
