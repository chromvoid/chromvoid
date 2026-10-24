import type {AppContext} from 'root/shared/services/app-context'
import {getAppContext} from 'root/shared/services/app-context'
import type {ClientCatalogNode} from 'root/core/catalog/local-catalog/client-model'
import {isImageFile, resolveFileFormat} from 'root/utils/file-format-registry'
import {loadFileSourceById} from 'root/features/media/components/file-loader'
import type {MarkdownImageRef} from './markdown-renderer'
import {normalizeCatalogFileLinkTarget} from './markdown-file-links'
import {
  DEFAULT_MARKDOWN_ATTACHMENT_FOLDER_PATH,
  normalizeMarkdownAttachmentFolderPath,
} from './markdown-attachment-settings'

export type MarkdownImageAssetStatus = 'blocked-external' | 'error' | 'loaded' | 'missing' | 'unsupported'

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

export class MarkdownImageAssetError extends Error {
  constructor(
    readonly code: 'ATTACHMENT_FOLDER_INVALID' | 'ATTACHMENT_FOLDER_CONFLICT' | 'ATTACHMENT_NOT_IMAGE',
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

    const targetPath = normalizeCatalogFileLinkTarget(ref.rawRef)
    const path = targetPath && normalizeMarkdownAttachmentFolderPath(targetPath)
    if (!path || !path.ok) {
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
    const catalog = this.getContext().catalog
    const links: string[] = []
    const paths: string[] = []
    for (const file of imageFiles) {
      throwIfAborted(options.signal)
      const prepared = await catalog.api.prepareAttachment({
        folder_path: folderPath,
        file_name: file.name,
        mime_type: resolveFileFormat({name: file.name, mimeType: file.type}).mimeType,
      })
      throwIfAborted(options.signal)
      const name = prepared.name
      const uploaded = await catalog.api.upload(
        {parentPath: prepared.parent_path, name},
        file.size,
        fileByteSource(file, options.signal),
        {
          name,
          type: prepared.mime_type,
          createOnly: true,
          chunkSize: DEFAULT_ATTACHMENT_UPLOAD_CHUNK_SIZE,
        },
      )

      const path = prepared.path
      this.uploadedImages.set(path, {
        nodeId: uploaded.nodeId,
        name,
        size: file.size,
        mimeType: prepared.mime_type,
        modtime: this.now(),
        mediaInfo: null,
      })
      paths.push(path)
      links.push(prepared.markdown)
    }

    await catalog.refreshSilent().catch(() => undefined)

    return {
      markdown: links.join('\n'),
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
