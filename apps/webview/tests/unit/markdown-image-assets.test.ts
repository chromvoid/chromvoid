import {describe, expect, it, vi} from 'vitest'

import {
  MarkdownImageAssetError,
  MarkdownImageAssetService,
} from '../../src/features/file-manager/services/markdown-image-assets'
import type {MarkdownImageRef} from '../../src/features/file-manager/services/markdown-renderer'

function imageRef(overrides: Partial<MarkdownImageRef> = {}): MarkdownImageRef {
  return {
    key: 'image-0',
    rawRef: '/attachments/pic.png',
    altText: 'pic',
    kind: 'catalog-absolute',
    ...overrides,
  }
}

function createNode(overrides: Record<string, unknown> = {}) {
  return {
    nodeId: 42,
    name: 'pic.png',
    isDir: false,
    isFile: true,
    mimeType: 'image/png',
    modtime: 123,
    size: 12,
    mediaInfo: null,
    ...overrides,
  }
}

function createService(options: {
  findByPath?: (path: string) => unknown
  createDir?: ReturnType<typeof vi.fn>
  upload?: ReturnType<typeof vi.fn>
  refreshSilent?: ReturnType<typeof vi.fn>
  loadFileSourceById?: ReturnType<typeof vi.fn>
  now?: () => number
} = {}) {
  const findByPath = vi.fn(options.findByPath ?? ((path: string) => (path === '/attachments/pic.png' ? createNode() : null)))
  const createDir = options.createDir ?? vi.fn(async () => ({nodeId: 10}))
  const upload = options.upload ?? vi.fn(async () => ({nodeId: 50}))
  const refreshSilent = options.refreshSilent ?? vi.fn(async () => undefined)
  const loadFileSourceById =
    options.loadFileSourceById ??
    vi.fn(async () => ({
      url: 'blob:preview',
      release: vi.fn(),
      kind: 'blob',
      size: 12,
      mimeType: 'image/png',
    }))

  const service = new MarkdownImageAssetService({
    getContext: () =>
      ({
        catalog: {
          catalog: {findByPath},
          api: {createDir, upload},
          refreshSilent,
        },
      }) as any,
    loadFileSourceById: loadFileSourceById as any,
    now: options.now ?? (() => Date.UTC(2026, 4, 21, 15, 45, 0)),
  })

  return {service, findByPath, createDir, upload, refreshSilent, loadFileSourceById}
}

describe('MarkdownImageAssetService', () => {
  it('resolves catalog image refs through the preview-image loader', async () => {
    const {service, loadFileSourceById} = createService()

    const resolved = await service.resolveImageRef(imageRef())

    expect(resolved).toMatchObject({
      key: 'image-0',
      status: 'loaded',
      url: 'blob:preview',
    })
    expect(loadFileSourceById).toHaveBeenCalledWith(
      42,
      'pic.png',
      expect.objectContaining({
        variant: 'preview-image',
        derivativeFallback: 'none',
      }),
    )
  })

  it('does not resolve external, missing, or non-image refs to URLs', async () => {
    const missing = createService({findByPath: () => null})
    await expect(missing.service.resolveImageRef(imageRef())).resolves.toMatchObject({
      status: 'missing',
      url: null,
    })

    const nonImage = createService({findByPath: () => createNode({name: 'doc.txt', mimeType: 'text/plain'})})
    await expect(nonImage.service.resolveImageRef(imageRef())).resolves.toMatchObject({
      status: 'unsupported',
      url: null,
    })

    const external = createService()
    await expect(
      external.service.resolveImageRef(imageRef({rawRef: 'https://example.com/a.png', kind: 'external-blocked'})),
    ).resolves.toMatchObject({status: 'blocked-external', url: null})
  })

  it('uploads image files into the configured folder with collision-safe Markdown links', async () => {
    const {service, createDir, upload, refreshSilent} = createService({
      findByPath: (path) =>
        path === '/attachments'
          ? createNode({isDir: true, isFile: false, name: 'attachments'})
          : path === '/attachments/photo-2026-05-21-154500.png'
            ? createNode({name: 'photo-2026-05-21-154500.png'})
            : null,
    })
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', {type: 'image/png'})

    const result = await service.uploadImageFiles([file], {attachmentFolderPath: '/attachments'})

    expect(createDir).not.toHaveBeenCalled()
    expect(upload).toHaveBeenCalledWith(
      {parentPath: '/attachments', name: 'photo-2026-05-21-154500-2.png'},
      3,
      expect.anything(),
      expect.objectContaining({chunkSize: 512 * 1024, type: 'image/png'}),
    )
    expect(refreshSilent).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      markdown: '![photo](/attachments/photo-2026-05-21-154500-2.png)',
      paths: ['/attachments/photo-2026-05-21-154500-2.png'],
    })
  })

  it('resolves newly uploaded images before the lazy catalog mirror exposes the attachment child', async () => {
    const {service, loadFileSourceById} = createService({
      findByPath: (path) =>
        path === '/attachments'
          ? createNode({isDir: true, isFile: false, name: 'attachments'})
          : null,
      upload: vi.fn(async () => ({nodeId: 77})),
    })
    const file = new File([new Uint8Array([1, 2, 3])], 'inline.png', {type: 'image/png'})

    const uploaded = await service.uploadImageFiles([file], {attachmentFolderPath: '/attachments'})
    const resolved = await service.resolveImageRef(imageRef({rawRef: uploaded.paths[0]}))

    expect(resolved).toMatchObject({
      status: 'loaded',
      url: 'blob:preview',
    })
    expect(loadFileSourceById).toHaveBeenCalledWith(
      77,
      'inline-2026-05-21-154500.png',
      expect.objectContaining({
        derivativeFallback: 'raw',
        mimeType: 'image/png',
        sourceSize: 3,
        variant: 'preview-image',
      }),
    )
  })

  it('rejects uploads when no image files are present', async () => {
    const {service} = createService()
    const file = new File(['text'], 'notes.txt', {type: 'text/plain'})

    await expect(service.uploadImageFiles([file])).rejects.toBeInstanceOf(MarkdownImageAssetError)
  })
})
