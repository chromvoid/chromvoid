import {describe, expect, it, vi} from 'vitest'

import {
  MarkdownImageAssetError,
  MarkdownImageAssetService,
} from '../../src/features/file-manager/services/markdown-image-assets'
import {
  renderMarkdownSource,
  type MarkdownImageRef,
} from '../../src/features/file-manager/services/markdown-renderer'

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

function createService(
  options: {
    findByPath?: (path: string) => unknown
    prepareAttachment?: ReturnType<typeof vi.fn>
    createDir?: ReturnType<typeof vi.fn>
    upload?: ReturnType<typeof vi.fn>
    refreshSilent?: ReturnType<typeof vi.fn>
    loadFileSourceById?: ReturnType<typeof vi.fn>
    now?: () => number
  } = {},
) {
  const findByPath = vi.fn(
    options.findByPath ?? ((path: string) => (path === '/attachments/pic.png' ? createNode() : null)),
  )
  const prepareAttachment =
    options.prepareAttachment ??
    vi.fn(async () => ({
      parent_path: '/attachments',
      name: 'core-image.png',
      mime_type: 'image/png',
      path: '/attachments/core-image.png',
      markdown: '![Core alt](</attachments/core-image.png>)',
    }))
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
          api: {prepareAttachment, createDir, upload},
          refreshSilent,
        },
      }) as any,
    loadFileSourceById: loadFileSourceById as any,
    now: options.now ?? (() => Date.UTC(2026, 4, 21, 15, 45, 0)),
  })

  return {service, findByPath, prepareAttachment, createDir, upload, refreshSilent, loadFileSourceById}
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
      external.service.resolveImageRef(
        imageRef({rawRef: 'https://example.com/a.png', kind: 'external-blocked'}),
      ),
    ).resolves.toMatchObject({status: 'blocked-external', url: null})
  })

  it('uses Core destination and Markdown without a local naming or directory fallback', async () => {
    const {service, prepareAttachment, createDir, upload, refreshSilent} = createService()
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png')
    const result = await service.uploadImageFiles([file], {attachmentFolderPath: '/attachments'})
    expect(prepareAttachment).toHaveBeenCalledWith({
      folder_path: '/attachments',
      file_name: 'photo.png',
      mime_type: 'image/png',
    })
    expect(createDir).not.toHaveBeenCalled()
    expect(upload).toHaveBeenCalledWith(
      {parentPath: '/attachments', name: 'core-image.png'},
      3,
      expect.anything(),
      expect.objectContaining({createOnly: true, chunkSize: 512 * 1024, type: 'image/png'}),
    )
    expect(refreshSilent).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      markdown: '![Core alt](</attachments/core-image.png>)',
      paths: ['/attachments/core-image.png'],
    })
  })

  it('does not upload or fall back when preparation fails or is canceled', async () => {
    const rejected = createService({
      prepareAttachment: vi.fn(async () => {
        throw new Error('denied')
      }),
    })
    const file = new File(['image'], 'photo.png', {type: 'image/png'})
    await expect(rejected.service.uploadImageFiles([file])).rejects.toThrow('denied')
    expect(rejected.upload).not.toHaveBeenCalled()
    expect(rejected.createDir).not.toHaveBeenCalled()
    const controller = new AbortController()
    const canceled = createService({
      prepareAttachment: vi.fn(async () => {
        controller.abort()
        return {
          parent_path: '/attachments',
          name: 'unused.png',
          mime_type: 'image/png',
          path: '/attachments/unused.png',
          markdown: 'unused',
        }
      }),
    })
    await expect(
      canceled.service.uploadImageFiles([file], {signal: controller.signal}),
    ).rejects.toMatchObject({name: 'AbortError'})
    expect(canceled.upload).not.toHaveBeenCalled()
  })

  it.each([false, true])('resolves Core Markdown with catalog mirror ready: %s', async (mirrorReady) => {
    const path = '/Заметки/Фото 100%/literal%2F.png'
    const name = 'literal%2F.png'
    const {service, findByPath, loadFileSourceById} = createService({
      prepareAttachment: vi.fn(async () => ({
        parent_path: '/Заметки/Фото 100%',
        name,
        mime_type: 'image/png',
        path,
        markdown:
          '![Photo](</%D0%97%D0%B0%D0%BC%D0%B5%D1%82%D0%BA%D0%B8/%D0%A4%D0%BE%D1%82%D0%BE%20100%25/literal%252F.png>)',
      })),
      findByPath: (target) => (mirrorReady && target === path ? createNode({nodeId: 77, name}) : null),
      upload: vi.fn(async () => ({nodeId: 77})),
    })
    const file = new File([new Uint8Array([1, 2, 3])], 'inline.png', {type: 'image/png'})
    const uploaded = await service.uploadImageFiles([file], {attachmentFolderPath: '/Заметки/Фото 100%'})
    const rendered = renderMarkdownSource(uploaded.markdown)
    expect(rendered.imageRefs).toHaveLength(1)
    const resolved = await service.resolveImageRef(rendered.imageRefs[0]!)

    expect(resolved).toMatchObject({status: 'loaded', url: 'blob:preview'})
    expect(findByPath).toHaveBeenCalledWith(path)
    expect(loadFileSourceById).toHaveBeenCalledWith(
      77,
      name,
      expect.objectContaining({
        derivativeFallback: mirrorReady ? 'none' : 'raw',
        mimeType: 'image/png',
        variant: 'preview-image',
      }),
    )
  })

  it.each(['/a/%2E%2E/b.png', '/%2Fexample.com/a.png', '/a%5Cb.png'])(
    'does not resolve an encoded invalid catalog path: %s',
    async (target) => {
      const {service, findByPath, loadFileSourceById} = createService()
      const rendered = renderMarkdownSource(`![Photo](<${target}>)`)
      expect(rendered.imageRefs).toHaveLength(1)
      await expect(service.resolveImageRef(rendered.imageRefs[0]!)).resolves.toMatchObject({
        status: 'unsupported',
        url: null,
      })
      expect(findByPath).not.toHaveBeenCalled()
      expect(loadFileSourceById).not.toHaveBeenCalled()
    },
  )

  it('rejects uploads when no image files are present', async () => {
    const {service} = createService()
    const file = new File(['text'], 'notes.txt', {type: 'text/plain'})

    await expect(service.uploadImageFiles([file])).rejects.toBeInstanceOf(MarkdownImageAssetError)
  })
})
