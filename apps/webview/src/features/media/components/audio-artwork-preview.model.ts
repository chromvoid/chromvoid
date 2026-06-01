import {atom, wrap} from '@reatom/core'

import {
  loadFileSourceById,
  type FileBlobLoadOptions,
  type FileSourceLoadResult,
} from './file-loader'

export type AudioArtworkVariant = Extract<
  NonNullable<FileBlobLoadOptions['variant']>,
  'preview-image' | 'thumbnail-image'
>

export type AudioArtworkLoadingState = 'idle' | 'loading' | 'loaded' | 'unavailable'

export type AudioArtworkTarget = {
  fileId: number
  fileName: string
  mimeType?: string | null
  lastModified?: number
  sourceSize?: number | null
  sourceRevision?: number
  variant: AudioArtworkVariant
  loadEnabled?: boolean
}

function getTargetKey(target: AudioArtworkTarget): string {
  return [
    target.fileId,
    target.fileName,
    target.mimeType ?? '',
    target.lastModified ?? '',
    target.sourceSize ?? '',
    target.sourceRevision ?? '',
    target.variant,
  ].join(':')
}

export class AudioArtworkPreviewModel {
  readonly loadingState = atom<AudioArtworkLoadingState>('idle')
  readonly artworkUrl = atom<string | null>(null)

  private abortController: AbortController | null = null
  private currentSource: FileSourceLoadResult | null = null
  private loadSessionId = 0
  private targetKey = ''

  setTarget(target: AudioArtworkTarget) {
    const nextKey =
      target.loadEnabled !== false && target.fileId > 0 && target.fileName.trim()
        ? getTargetKey(target)
        : ''
    if (this.targetKey === nextKey) {
      return
    }

    this.invalidateCurrentLoad()
    this.targetKey = nextKey

    if (!nextKey) {
      this.loadingState.set('idle')
      return
    }

    this.loadingState.set('loading')
    const sessionId = this.loadSessionId
    void this.loadArtworkForSession(sessionId, target)
  }

  cleanup() {
    this.targetKey = ''
    this.invalidateCurrentLoad()
    this.loadingState.set('idle')
  }

  handleImageRenderError(sourceUrl: string | null) {
    const currentUrl = this.currentSource?.url ?? this.artworkUrl()
    if (!currentUrl || sourceUrl !== currentUrl) {
      return
    }

    this.releaseCurrentSource()
    this.artworkUrl.set(null)
    this.loadingState.set('unavailable')
  }

  private async loadArtworkForSession(sessionId: number, target: AudioArtworkTarget) {
    const controller = new AbortController()
    this.abortController = controller

    try {
      const source = await wrap(
        loadFileSourceById(target.fileId, target.fileName, {
          signal: controller.signal,
          mimeType: target.mimeType,
          lastModified: target.lastModified,
          sourceSize: target.sourceSize,
          variant: target.variant,
          derivativeFallback: 'none',
          displayJobType: target.variant === 'thumbnail-image' ? 'thumbnail' : 'current-preview',
          displayJobIntentId: `audio-artwork:${target.variant}:${target.fileId}:${sessionId}`,
        }),
      )

      if (!this.isCurrentSession(sessionId) || controller.signal.aborted) {
        this.releaseSource(source)
        return
      }

      this.currentSource = source
      this.artworkUrl.set(source.url)
      this.loadingState.set('loaded')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      if (!this.isCurrentSession(sessionId)) {
        return
      }

      this.releaseCurrentSource()
      this.artworkUrl.set(null)
      this.loadingState.set('unavailable')
    } finally {
      if (this.abortController === controller) {
        this.abortController = null
      }
    }
  }

  private invalidateCurrentLoad() {
    this.loadSessionId += 1
    this.abortController?.abort()
    this.abortController = null
    this.releaseCurrentSource()
    this.artworkUrl.set(null)
  }

  private isCurrentSession(sessionId: number): boolean {
    return sessionId === this.loadSessionId
  }

  private releaseCurrentSource() {
    const source = this.currentSource
    if (!source) {
      return
    }

    this.currentSource = null
    this.releaseSource(source)
  }

  private releaseSource(source: FileSourceLoadResult) {
    try {
      void Promise.resolve(source.release()).catch(() => undefined)
    } catch {
      // Source release is best effort; the UI must still fall back immediately.
    }
  }
}
