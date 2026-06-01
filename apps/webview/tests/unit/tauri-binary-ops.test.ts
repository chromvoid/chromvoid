import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const mocks = vi.hoisted(() => ({
  convertFileSrc: vi.fn(),
  randomUUID: vi.fn(),
  tauriInvoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: mocks.convertFileSrc,
}))

vi.mock('../../src/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => mocks.tauriInvoke(...args),
  tauriListen: vi.fn().mockResolvedValue(() => {}),
}))

import {
  imageMetadataViaTauri,
  preparePreviewFileViaTauri,
  previewImageViaTauri,
  purgePreviewSourcesViaTauri,
  releasePreviewFileViaTauri,
  replaceFileViaTauri,
  thumbnailImageViaTauri,
} from '../../src/core/transport/tauri/tauri-binary-ops'

describe('tauri binary ops prepared preview files', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {randomUUID: mocks.randomUUID})
    mocks.convertFileSrc.mockReset()
    mocks.randomUUID.mockReset()
    mocks.tauriInvoke.mockReset()
    mocks.randomUUID.mockReturnValue('preview-123')
    mocks.convertFileSrc.mockReturnValue('asset://localhost/preview-file')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends lastModified with preview image requests', async () => {
    mocks.tauriInvoke.mockResolvedValue({
      ok: true,
      result: {
        meta: {name: 'scan.webp', type: 'image/webp', size: 2, chunk_size: 64 * 1024},
        bytes: [1, 2],
      },
    })

    const result = await previewImageViaTauri(17, {
      fileName: 'scan.heic',
      mimeType: 'image/heic',
      lastModified: 1234,
    })

    expect(mocks.tauriInvoke).toHaveBeenCalledWith('catalog_preview_image', {
      args: {
        nodeId: 17,
        fileName: 'scan.heic',
        mimeType: 'image/heic',
        lastModified: 1234,
      },
    })
    expect(result.mimeType).toBe('image/webp')
  })

  it('sends lastModified with thumbnail image requests', async () => {
    mocks.tauriInvoke.mockResolvedValue({
      ok: true,
      result: {
        meta: {name: 'scan-thumb.webp', type: 'image/webp', size: 1, chunk_size: 64 * 1024},
        bytes: [1],
      },
    })

    await thumbnailImageViaTauri(18, {
      fileName: 'scan.heic',
      mimeType: 'image/heic',
      lastModified: 5678,
    })

    expect(mocks.tauriInvoke).toHaveBeenCalledWith('catalog_thumbnail_image', {
      args: {
        nodeId: 18,
        fileName: 'scan.heic',
        mimeType: 'image/heic',
        lastModified: 5678,
      },
    })
  })

  it('sends refreshDerivativeCache for forced thumbnail regeneration', async () => {
    mocks.tauriInvoke.mockResolvedValue({
      ok: true,
      result: {
        meta: {name: 'scan-thumb.webp', type: 'image/webp', size: 1, chunk_size: 64 * 1024},
        bytes: [1],
      },
    })

    await thumbnailImageViaTauri(18, {
      fileName: 'scan.heic',
      mimeType: 'image/heic',
      lastModified: 5678,
      refreshDerivativeCache: true,
    })

    expect(mocks.tauriInvoke).toHaveBeenCalledWith('catalog_thumbnail_image', {
      args: {
        nodeId: 18,
        fileName: 'scan.heic',
        mimeType: 'image/heic',
        lastModified: 5678,
        refreshDerivativeCache: true,
      },
    })
  })

  it('sends lastModified with image metadata requests', async () => {
    mocks.tauriInvoke.mockResolvedValue({
      ok: true,
      result: {
        width: 1200,
        height: 800,
        sourceRevision: 9,
      },
    })

    const result = await imageMetadataViaTauri(19, {
      fileName: 'scan.heic',
      mimeType: 'image/heic',
      lastModified: 9012,
    })

    expect(mocks.tauriInvoke).toHaveBeenCalledWith('catalog_image_metadata', {
      args: {
        nodeId: 19,
        fileName: 'scan.heic',
        mimeType: 'image/heic',
        lastModified: 9012,
      },
    })
    expect(result.sourceRevision).toBe(9)
  })

  it('normalizes image metadata provenance and GPS diagnostics from Rust responses', async () => {
    mocks.tauriInvoke.mockResolvedValue({
      ok: true,
      result: {
        width: 1200,
        height: 800,
        gps: {
          latitude: 55.755833,
          longitude: 37.617222,
          altitude_meters: 156.4,
        },
        import_provenance: {
          source_revision: 9,
          platform: 'android',
          image_candidate: true,
          permission_status: 'denied',
          require_original_status: 'not_attempted_permission_missing',
          original_stream_used: false,
          regular_stream_fallback: true,
          uri_scheme: 'content',
          uri_authority: 'media',
          captured_at_ms: 1778660000000,
        },
        gps_diagnostic: {
          status: 'not_found',
          rust_exif_status: 'not_found',
          android_status: 'zero_zero',
          import_provenance_status: 'at_risk',
        },
      },
    })

    const result = await imageMetadataViaTauri(20, {
      fileName: 'scan.heic',
      mimeType: 'image/heic',
      lastModified: null,
    })

    expect(result.importProvenance).toEqual({
      sourceRevision: 9,
      platform: 'android',
      imageCandidate: true,
      permissionStatus: 'denied',
      requireOriginalStatus: 'not_attempted_permission_missing',
      originalStreamUsed: false,
      regularStreamFallback: true,
      uriScheme: 'content',
      uriAuthority: 'media',
      capturedAtMs: 1778660000000,
    })
    expect(result.gps).toEqual({
      latitude: 55.755833,
      longitude: 37.617222,
      altitudeMeters: 156.4,
    })
    expect(result.gpsDiagnostic).toEqual({
      status: 'not_found',
      rustExifStatus: 'not_found',
      xmpStatus: null,
      androidStatus: 'zero_zero',
      importProvenanceStatus: 'at_risk',
    })
  })

  it('prepares preview files with command args and protocol URL', async () => {
    mocks.tauriInvoke.mockResolvedValue({
      ok: true,
      result: {
        preview_id: 'preview-123',
        path: 'prepared-preview:preview-123:1',
        name: 'preview.webp',
        mime_type: 'image/webp',
        size: 42,
        variant: 'preview-image',
      },
    })

    const source = await preparePreviewFileViaTauri(17, {
      fileName: 'scan.heic',
      mimeType: 'image/heic',
      lastModified: 1234,
      variant: 'preview-image',
    })

    expect(mocks.tauriInvoke).toHaveBeenCalledWith('prepare_catalog_preview_file', {
      args: {
        nodeId: 17,
        fileName: 'scan.heic',
        mimeType: 'image/heic',
        lastModified: 1234,
        variant: 'preview-image',
        previewId: 'preview-123',
      },
    })
    expect(mocks.convertFileSrc).not.toHaveBeenCalled()
    expect(source).toEqual({
      kind: 'asset-file',
      previewId: 'preview-123',
      path: 'prepared-preview:preview-123:1',
      url: 'chromvoid-preview://localhost/preview-123',
      name: 'preview.webp',
      mimeType: 'image/webp',
      size: 42,
      variant: 'preview-image',
    })
  })

  it('normalizes camelCase result fields from Rust responses', async () => {
    mocks.tauriInvoke.mockResolvedValue({
      ok: true,
      result: {
        previewId: 'preview-123',
        path: 'prepared-preview:preview-123:1',
        name: 'raw.mp3',
        mimeType: 'audio/mpeg',
        size: 128,
        variant: 'raw',
      },
    })

    const source = await preparePreviewFileViaTauri(21, {
      fileName: 'raw.mp3',
      mimeType: 'audio/mpeg',
      lastModified: null,
      variant: 'raw',
    })

    expect(source).toMatchObject({
      previewId: 'preview-123',
      mimeType: 'audio/mpeg',
      url: 'chromvoid-preview://localhost/preview-123',
    })
  })

  it('releases preview files with preview id and path', async () => {
    mocks.tauriInvoke.mockResolvedValue({ok: true, result: {released: true}})

    await releasePreviewFileViaTauri({
      kind: 'asset-file',
      previewId: 'preview-123',
      path: '/cache/chromvoid-preview/preview.webp',
      url: 'asset://localhost/preview-file',
      name: 'preview.webp',
      mimeType: 'image/webp',
      size: 42,
      variant: 'thumbnail-image',
    })

    expect(mocks.tauriInvoke).toHaveBeenCalledWith('release_catalog_preview_file', {
      args: {
        previewId: 'preview-123',
        path: '/cache/chromvoid-preview/preview.webp',
      },
    })
  })

  it('purges preview cache with lifecycle reason and normalizes counts', async () => {
    mocks.tauriInvoke.mockResolvedValue({
      ok: true,
      result: {
        files_removed: 2,
        directories_removed: 1,
        bytes_removed: 128,
        skipped_entries: 0,
      },
    })

    const result = await purgePreviewSourcesViaTauri('vault-lock')

    expect(mocks.tauriInvoke).toHaveBeenCalledWith('purge_catalog_preview_cache', {
      args: {
        reason: 'vault-lock',
      },
    })
    expect(result).toEqual({
      filesRemoved: 2,
      directoriesRemoved: 1,
      bytesRemoved: 128,
      skippedEntries: 0,
    })
  })

  it('replaces catalog files through the binary Tauri command', async () => {
    mocks.tauriInvoke.mockResolvedValue({
      ok: true,
      result: {
        node_id: 17,
        size: 7,
        mime_type: 'text/markdown',
        modtime: 456,
        source_revision: 8,
        media_info: null,
        media_inspected_revision: 0,
      },
    })

    const bytes = new TextEncoder().encode('# Notes')
    const result = await replaceFileViaTauri(17, bytes, {
      mimeType: 'text/markdown',
      expectedSourceRevision: 7,
    })

    expect(mocks.tauriInvoke).toHaveBeenCalledWith('catalog_file_replace', {
      nodeId: 17,
      size: bytes.byteLength,
      mimeType: 'text/markdown',
      expectedSourceRevision: 7,
      conflictMode: 'fail_if_stale',
      bytes,
    })
    expect(result).toEqual({
      nodeId: 17,
      size: 7,
      mimeType: 'text/markdown',
      modtime: 456,
      sourceRevision: 8,
      mediaInfo: null,
      mediaInspectedRevision: 0,
    })
  })
})
