import type {AppContext} from 'root/shared/services/app-context'
import {getAppContext} from 'root/shared/services/app-context'
import type {ClientCatalogNode} from 'root/core/catalog/local-catalog/client-model'
import {joinPath, splitPath} from 'root/core/catalog/local-catalog/path'
import {isImageFile, getFileExtension} from 'root/utils/file-format-registry'
import {loadFileSourceById} from 'root/features/media/components/file-loader'
import type {MarkdownImageRef} from './markdown-renderer'
import {
  DEFAULT_MARKDOWN_ATTACHMENT_FOLDER_PATH,
  normalizeMarkdownAttachmentFolderPath,
} from './markdown-attachment-settings'

export type MarkdownImageAssetStatus =
  | 'blocked-external'
  | 'error'
  | 'loaded'
  | 'missing'
  | 'unsupported'

export type MarkdownImageAssetResolution = {
  key: string
  rawRef: string
  altText: string
  status: MarkdownImageAssetStatus
  url: string | null
  release?: () => void | Promise<void>
}

export type MarkdownImageUploadResult = {
  markdown: string
  paths: string[]
}

export type MarkdownImageAssetServiceDeps = {
  getContext?: () => AppContext
  loadFileSourceById?: typeof loadFileSourceById
  now?: () => number
}

const DEFAULT_ATTACHMENT_UPLOAD_CHUNK_SIZE = 512 * 1024

type ResolvableMarkdownImageAsset = Pick<
  ClientCatalogNode,
  'mediaInfo' | 'mimeType' | 'modtime' | 'name' | 'nodeId' | 'size'
>

async function* fileByteSource(file: File, signal?: AbortSignal): AsyncIterable<Uint8Array> {
  throwIfAborted(signal)
  const bytes = new Uint8Array(await file.arrayBuffer())
  throwIfAborted(signal)
  yield bytes
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

function isImageNode(node: ClientCatalogNode): boolean {
  return node.isFile && isImageFile(node.name, node.mimeType)
}

function isImageUploadFile(file: File): boolean {
  return isImageFile(file.name, file.type)
}

function safeBaseName(name: string): string {
  const extension = getFileExtension(name)
  const withoutExtension =
    extension && name.toLowerCase().endsWith(`.${extension}`)
      ? name.slice(0, Math.max(0, name.length - extension.length - 1))
      : name
  const normalized = withoutExtension
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'image'
}

function uploadExtension(file: File): string {
  const extension = getFileExtension(file.name)
  if (extension) {
    return extension
  }

  switch (file.type.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/avif':
      return 'avif'
    case 'image/svg+xml':
      return 'svg'
    default:
      return 'png'
  }
}

function timestampSuffix(now: number): string {
  return new Date(now).toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '')
}

function markdownAltText(fileName: string): string {
  return safeBaseName(fileName).replace(/-/g, ' ')
}

function appendMarkdownImageLinks(links: string[]): string {
  return links.join('\n')
}

export class MarkdownImageAssetError extends Error {
  constructor(
    readonly code:
      | 'ATTACHMENT_FOLDER_INVALID'
      | 'ATTACHMENT_FOLDER_CONFLICT'
      | 'ATTACHMENT_NOT_IMAGE',
    message: string,
  ) {
    super(message)
  }
}

export class MarkdownImageAssetService {
  private readonly getContext: () => AppContext
  private readonly loadSource: typeof loadFileSourceById
  private readonly now: () => number
  private readonly uploadedImages = new Map<string, ResolvableMarkdownImageAsset>()

  constructor(deps: MarkdownImageAssetServiceDeps = {}) {
    this.getContext = deps.getContext ?? getAppContext
    this.loadSource = deps.loadFileSourceById ?? loadFileSourceById
    this.now = deps.now ?? (() => Date.now())
  }

  async resolveImageRef(
    ref: MarkdownImageRef,
    options: {signal?: AbortSignal} = {},
  ): Promise<MarkdownImageAssetResolution> {
    if (ref.kind === 'external-blocked') {
      return this.createResolution(ref, 'blocked-external')
    }

    if (ref.kind !== 'catalog-absolute') {
      return this.createResolution(ref, 'unsupported')
    }

    const path = normalizeMarkdownAttachmentFolderPath(ref.rawRef)
    if (!path.ok) {
      return this.createResolution(ref, 'unsupported')
    }

    throwIfAborted(options.signal)
    const node = this.getContext().catalog.catalog.findByPath(path.path)
    if (node) {
      if (!node.isFile) {
        return this.createResolution(ref, 'missing')
      }
      if (!isImageNode(node)) {
        return this.createResolution(ref, 'unsupported')
      }
      return this.loadResolvedImageAsset(ref, node, options.signal, {rawFallback: false})
    }

    const uploaded = this.uploadedImages.get(path.path)
    if (!uploaded) {
      return this.createResolution(ref, 'missing')
    }

    return this.loadResolvedImageAsset(ref, uploaded, options.signal, {rawFallback: true})
  }

  private async loadResolvedImageAsset(
    ref: MarkdownImageRef,
    asset: ResolvableMarkdownImageAsset,
    signal?: AbortSignal,
    options: {rawFallback: boolean} = {rawFallback: false},
  ): Promise<MarkdownImageAssetResolution> {
    try {
      const source = await this.loadSource(asset.nodeId, asset.name, {
        signal,
        mimeType: asset.mimeType,
        lastModified: asset.modtime,
        sourceSize: asset.size,
        variant: 'preview-image',
        derivativeFallback: options.rawFallback ? 'raw' : 'none',
        displayJobType: 'current-preview',
        displayJobIntentId: `markdown-image:${asset.nodeId}:${ref.key}`,
        mediaInfo: asset.mediaInfo,
      })

      return {
        ...this.createResolution(ref, 'loaded'),
        url: source.url,
        release: source.release,
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }

      return this.createResolution(ref, 'error')
    }
  }

  async uploadImageFiles(
    files: readonly File[],
    options: {attachmentFolderPath?: string; signal?: AbortSignal} = {},
  ): Promise<MarkdownImageUploadResult> {
    const imageFiles = files.filter(isImageUploadFile)
    if (imageFiles.length === 0) {
      throw new MarkdownImageAssetError('ATTACHMENT_NOT_IMAGE', 'ATTACHMENT_NOT_IMAGE')
    }

    const folderPath = options.attachmentFolderPath ?? DEFAULT_MARKDOWN_ATTACHMENT_FOLDER_PATH
    const normalized = normalizeMarkdownAttachmentFolderPath(folderPath)
    if (!normalized.ok) {
      throw new MarkdownImageAssetError('ATTACHMENT_FOLDER_INVALID', 'ATTACHMENT_FOLDER_INVALID')
    }

    const catalog = this.getContext().catalog
    await this.ensureDirectory(normalized.path, options.signal)

    const usedNames = new Set<string>()
    const links: string[] = []
    const paths: string[] = []
    for (const file of imageFiles) {
      throwIfAborted(options.signal)
      const name = this.createAvailableFileName(normalized.path, file, usedNames)
      usedNames.add(name.toLocaleLowerCase())
      const uploaded = await catalog.api.upload(
        {parentPath: normalized.path, name},
        file.size,
        fileByteSource(file, options.signal),
        {
          name,
          type: file.type,
          chunkSize: DEFAULT_ATTACHMENT_UPLOAD_CHUNK_SIZE,
        },
      )

      const path = joinPath(normalized.path, name)
      this.uploadedImages.set(path, {
        nodeId: uploaded.nodeId,
        name,
        size: file.size,
        mimeType: file.type,
        modtime: this.now(),
        mediaInfo: null,
      })
      paths.push(path)
      links.push(`![${markdownAltText(file.name)}](${path})`)
    }

    await catalog.refreshSilent().catch(() => undefined)

    return {
      markdown: appendMarkdownImageLinks(links),
      paths,
    }
  }

  releaseResolution(resolution: MarkdownImageAssetResolution): void {
    if (!resolution.release) {
      return
    }

    try {
      void Promise.resolve(resolution.release()).catch((error) => {
        console.warn('Failed to release Markdown image asset:', error)
      })
    } catch (error) {
      console.warn('Failed to release Markdown image asset:', error)
    }
  }

  private async ensureDirectory(folderPath: string, signal?: AbortSignal): Promise<void> {
    const catalog = this.getContext().catalog
    let parentPath = '/'
    for (const segment of splitPath(folderPath)) {
      throwIfAborted(signal)
      const currentPath = joinPath(parentPath, segment)
      const existing = catalog.catalog.findByPath(currentPath)
      if (existing) {
        if (!existing.isDir) {
          throw new MarkdownImageAssetError(
            'ATTACHMENT_FOLDER_CONFLICT',
            'ATTACHMENT_FOLDER_CONFLICT',
          )
        }
      } else {
        await catalog.api.createDir(segment, parentPath === '/' ? undefined : parentPath)
      }
      parentPath = currentPath
    }
  }

  private createAvailableFileName(
    folderPath: string,
    file: File,
    usedNames: ReadonlySet<string>,
  ): string {
    const extension = uploadExtension(file)
    const baseName = `${safeBaseName(file.name)}-${timestampSuffix(this.now())}`
    const candidate = `${baseName}.${extension}`
    if (this.isAvailable(folderPath, candidate, usedNames)) {
      return candidate
    }

    for (let index = 2; index < 10_000; index += 1) {
      const indexed = `${baseName}-${index}.${extension}`
      if (this.isAvailable(folderPath, indexed, usedNames)) {
        return indexed
      }
    }

    return `${baseName}-${crypto.randomUUID()}.${extension}`
  }

  private isAvailable(folderPath: string, name: string, usedNames: ReadonlySet<string>): boolean {
    return (
      !usedNames.has(name.toLocaleLowerCase()) &&
      !this.getContext().catalog.catalog.findByPath(joinPath(folderPath, name))
    )
  }

  private createResolution(
    ref: MarkdownImageRef,
    status: MarkdownImageAssetStatus,
  ): MarkdownImageAssetResolution {
    return {
      key: ref.key,
      rawRef: ref.rawRef,
      altText: ref.altText,
      status,
      url: null,
    }
  }
}

export const markdownImageAssetService = new MarkdownImageAssetService()
