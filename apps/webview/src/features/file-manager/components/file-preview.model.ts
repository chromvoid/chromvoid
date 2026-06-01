import {atom, wrap} from '@reatom/core'

import {
  FileLoadError,
  loadFileSourceById,
  loadTextFileById,
  type FileSourceLoadResult,
} from 'root/features/media/components/file-loader'
import type {FilePreviewMode} from 'root/utils/file-format-registry'

export type FilePreviewData = {
  fileId: number
  fileName: string
  size?: number
  mimeType?: string
  lastModified?: number
  sourceRevision?: number
  mode: FilePreviewMode
}

type LoadingState = 'idle' | 'loading' | 'loaded'
export type FilePreviewFallbackReasonKey =
  | 'file-preview:preview-unavailable'
  | 'file-preview:image-unsupported'
  | 'file-preview:text-too-large'
  | 'file-preview:text-invalid-encoding'

export class FilePreviewModel {
  readonly loadingState = atom<LoadingState>('idle')
  readonly displayMode = atom<FilePreviewMode>('fallback')
  readonly mediaUrl = atom<string | null>(null)
  readonly textContent = atom('')
  readonly fallbackReasonKey = atom<FilePreviewFallbackReasonKey>('file-preview:preview-unavailable')

  private abortController: AbortController | null = null
  private currentSource: FileSourceLoadResult | null = null
  private data: FilePreviewData | null = null
  private loadToken = 0

  setPreview(data: FilePreviewData | null) {
    const current = this.data
    if (
      current?.fileId === data?.fileId &&
      current?.fileName === data?.fileName &&
      current?.size === data?.size &&
      current?.mimeType === data?.mimeType &&
      current?.lastModified === data?.lastModified &&
      current?.sourceRevision === data?.sourceRevision &&
      current?.mode === data?.mode
    ) {
      return
    }

    this.cleanup()
    this.data = data

    if (!data) {
      return
    }

    this.displayMode.set(data.mode)
    this.loadingState.set(data.mode === 'fallback' ? 'loaded' : 'loading')

    switch (data.mode) {
      case 'text':
        void this.loadText(data)
        return
      case 'audio':
      case 'image':
        void this.loadObjectUrl(data)
        return
      default:
        this.loadingState.set('loaded')
        this.fallbackReasonKey.set('file-preview:preview-unavailable')
    }
  }

  cleanup() {
    this.abortCurrentLoad()
    this.releaseCurrentSource()
    this.mediaUrl.set(null)

    this.textContent.set('')
    this.loadingState.set('idle')
    this.displayMode.set('fallback')
    this.fallbackReasonKey.set('file-preview:preview-unavailable')
  }

  handleImageRenderError(sourceUrl: string | null) {
    if (this.data?.mode !== 'image' || !this.matchesCurrentSource(sourceUrl)) {
      return
    }

    this.setFallback('file-preview:image-unsupported')
  }

  private async loadObjectUrl(data: FilePreviewData) {
    const controller = new AbortController()
    const token = ++this.loadToken
    this.abortController = controller

    try {
      const source = await wrap(
        loadFileSourceById(data.fileId, data.fileName, {
          signal: controller.signal,
          mimeType: data.mimeType,
          lastModified: data.lastModified,
          sourceSize: data.size,
          variant: data.mode === 'image' ? 'preview-image' : 'raw',
          derivativeFallback: data.mode === 'image' ? 'none' : 'raw',
          ...(data.mode === 'image'
            ? {
                displayJobType: 'current-preview' as const,
                displayJobIntentId: `file-preview:${data.fileId}:${token}`,
              }
            : {}),
        }),
      )

      if (controller.signal.aborted || token !== this.loadToken) {
        void this.releaseSource(source)
        return
      }

      this.releaseCurrentSource()
      this.currentSource = source
      this.mediaUrl.set(source.url)
      this.loadingState.set('loaded')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      this.setFallback('file-preview:preview-unavailable')
    } finally {
      if (this.abortController === controller) {
        this.abortController = null
      }
    }
  }

  private async loadText(data: FilePreviewData) {
    const controller = new AbortController()
    const token = ++this.loadToken
    this.abortController = controller

    try {
      const {text} = await wrap(
        loadTextFileById(data.fileId, data.fileName, {
          signal: controller.signal,
          maxBytes: 1_048_576,
        }),
      )
      if (controller.signal.aborted || token !== this.loadToken) {
        return
      }

      this.textContent.set(text)
      this.loadingState.set('loaded')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      if (error instanceof FileLoadError) {
        if (error.code === 'TEXT_TOO_LARGE') {
          this.setFallback('file-preview:text-too-large')
          return
        }
        if (error.code === 'TEXT_INVALID_UTF8') {
          this.setFallback('file-preview:text-invalid-encoding')
          return
        }
      }

      this.setFallback('file-preview:preview-unavailable')
    } finally {
      if (this.abortController === controller) {
        this.abortController = null
      }
    }
  }

  private setFallback(reasonKey: FilePreviewFallbackReasonKey) {
    this.abortCurrentLoad()
    this.releaseCurrentSource()
    this.mediaUrl.set(null)

    this.textContent.set('')
    this.displayMode.set('fallback')
    this.fallbackReasonKey.set(reasonKey)
    this.loadingState.set('loaded')
  }

  private abortCurrentLoad() {
    this.loadToken += 1
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  private releaseCurrentSource() {
    const source = this.currentSource
    this.currentSource = null
    if (source) {
      void this.releaseSource(source)
    }
  }

  private matchesCurrentSource(sourceUrl: string | null): boolean {
    const currentUrl = this.currentSource?.url ?? this.mediaUrl()
    return Boolean(currentUrl) && sourceUrl === currentUrl
  }

  private async releaseSource(source: FileSourceLoadResult) {
    try {
      await source.release()
    } catch (error) {
      console.warn('[file-preview] failed to release preview source', error)
    }
  }
}
