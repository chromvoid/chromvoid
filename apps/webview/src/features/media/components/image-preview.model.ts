import {i18n} from 'root/i18n'
import {atom, wrap} from '@reatom/core'
import {loadFileSourceById, isMockTransport, type FileSourceLoadResult} from './file-loader'

const IMAGE_PREVIEW_LOAD_DEBOUNCE_MS = 120

export type LoadingState = 'idle' | 'loading' | 'loaded' | 'error'

export type ImageDimensions = {
  width: number
  height: number
}

export class ImagePreviewModel {
  readonly loadingState = atom<LoadingState>('idle')
  readonly imageUrl = atom<string | null>(null)
  readonly errorMessage = atom('')
  readonly dimensions = atom<ImageDimensions | null>(null)

  private abortController: AbortController | null = null
  private loadTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private currentSource: FileSourceLoadResult | null = null
  private loadSessionId = 0
  private retryCount = 0
  private readonly maxRetries = 2

  private fileId = 0
  private fileName = ''
  private mimeType: string | undefined
  private lastModified: number | undefined

  setFile(fileId: number, fileName: string, mimeType?: string, lastModified?: number) {
    if (
      this.fileId === fileId &&
      this.fileName === fileName &&
      this.mimeType === mimeType &&
      this.lastModified === lastModified
    ) {
      return
    }
    this.cleanup()
    this.fileId = fileId
    this.fileName = fileName
    this.mimeType = mimeType
    this.lastModified = lastModified
    this.loadingState.set('loading')
    this.errorMessage.set('')
    this.scheduleLoadImage()
  }

  cleanup() {
    this.invalidateCurrentLoad({resetRetryCount: true})
    this.imageUrl.set(null)
    this.loadingState.set('idle')
    this.errorMessage.set('')
    this.dimensions.set(null)
  }

  async loadImage() {
    const sessionId = this.beginLoadAttempt({resetRetryCount: true})
    await this.loadImageForSession(sessionId)
  }

  setDimensions(dimensions: ImageDimensions) {
    this.dimensions.set(dimensions)
  }

  handleImageLoad(sourceUrl: string | null, dimensions: ImageDimensions): boolean {
    if (!this.matchesCurrentSource(sourceUrl)) {
      return false
    }

    this.dimensions.set(dimensions)
    return true
  }

  handleImageRenderError(sourceUrl: string | null) {
    if (!this.matchesCurrentSource(sourceUrl)) {
      return
    }

    this.releaseCurrentSource()
    this.imageUrl.set(null)
    this.dimensions.set(null)
    this.loadingState.set('error')
    this.errorMessage.set(i18n('media:image-display-failed' as any))
  }

  setError(message: string) {
    this.loadingState.set('error')
    this.errorMessage.set(message)
  }

  retry() {
    void this.loadImage()
  }

  private async loadImageForSession(sessionId: number) {
    if (!this.fileId) {
      return
    }

    if (isMockTransport()) {
      if (!this.isCurrentSession(sessionId)) {
        return
      }
      this.loadingState.set('error')
      this.errorMessage.set(i18n('media:preview-desktop-only' as any))
      return
    }

    this.loadingState.set('loading')
    this.errorMessage.set('')
    const controller = new AbortController()
    this.abortController = controller
    const fileId = this.fileId
    const fileName = this.fileName
    const mimeType = this.mimeType
    const lastModified = this.lastModified

    try {
      const source = await wrap(
        loadFileSourceById(fileId, fileName, {
          signal: controller.signal,
          mimeType,
          lastModified,
          variant: 'preview-image',
          derivativeFallback: 'none',
          displayJobType: 'current-preview',
          displayJobIntentId: `image-preview:${fileId}:${sessionId}`,
        }),
      )

      if (!this.isCurrentSession(sessionId)) {
        this.releaseSource(source)
        return
      }

      this.currentSource = source
      this.imageUrl.set(source.url)
      this.loadingState.set('loaded')
      this.retryCount = 0
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      if (!this.isCurrentSession(sessionId)) {
        return
      }

      console.error('Failed to load image:', error)

      const errorMsg = error instanceof Error ? error.message : String(error)
      if (errorMsg.includes('File bytes not found')) {
        this.loadingState.set('error')
        this.errorMessage.set(i18n('media:preview-desktop-only' as any))
        return
      }

      if (this.retryCount < this.maxRetries) {
        this.scheduleRetry(sessionId)
        return
      }

      this.loadingState.set('error')
      this.errorMessage.set(i18n('media:image-load-failed' as any))
    } finally {
      if (this.abortController === controller) {
        this.abortController = null
      }
    }
  }

  private scheduleRetry(sessionId: number) {
    this.retryCount++
    const delay = 1000 * this.retryCount
    this.clearRetryTimer()
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (!this.isCurrentSession(sessionId)) {
        return
      }

      const nextSessionId = this.beginLoadAttempt({resetRetryCount: false})
      void this.loadImageForSession(nextSessionId)
    }, delay)
  }

  private scheduleLoadImage() {
    this.clearLoadTimer()
    this.loadTimer = setTimeout(() => {
      this.loadTimer = null
      void this.loadImage()
    }, IMAGE_PREVIEW_LOAD_DEBOUNCE_MS)
  }

  private beginLoadAttempt(options: {resetRetryCount: boolean}): number {
    this.invalidateCurrentLoad(options)
    return this.loadSessionId
  }

  private invalidateCurrentLoad(options: {resetRetryCount: boolean}) {
    this.loadSessionId += 1
    this.clearLoadTimer()
    this.clearRetryTimer()
    this.releaseCurrentSource()
    this.imageUrl.set(null)
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    if (options.resetRetryCount) {
      this.retryCount = 0
    }
  }

  private clearLoadTimer() {
    if (!this.loadTimer) {
      return
    }

    clearTimeout(this.loadTimer)
    this.loadTimer = null
  }

  private clearRetryTimer() {
    if (!this.retryTimer) {
      return
    }

    clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  private isCurrentSession(sessionId: number): boolean {
    return sessionId === this.loadSessionId
  }

  private matchesCurrentSource(sourceUrl: string | null): boolean {
    const currentUrl = this.currentSource?.url ?? this.imageUrl()
    return Boolean(currentUrl) && sourceUrl === currentUrl
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
      void Promise.resolve(source.release()).catch((error) => {
        console.warn('Failed to release image preview source:', error)
      })
    } catch (error) {
      console.warn('Failed to release image preview source:', error)
    }
  }
}
