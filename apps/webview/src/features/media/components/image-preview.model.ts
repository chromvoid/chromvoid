import {state} from '@statx/core'
import {i18n} from 'root/i18n'
import {loadImageByFileId, isMockTransport} from './image-loader'

export type LoadingState = 'idle' | 'loading' | 'loaded' | 'error'

export type ImageDimensions = {
  width: number
  height: number
}

export class ImagePreviewModel {
  readonly loadingState = state<LoadingState>('idle')
  readonly imageUrl = state<string | null>(null)
  readonly errorMessage = state('')
  readonly dimensions = state<ImageDimensions | null>(null)

  private abortController: AbortController | null = null
  private retryCount = 0
  private readonly maxRetries = 2

  private fileId = 0
  private fileName = ''

  setFile(fileId: number, fileName: string) {
    if (this.fileId === fileId && this.fileName === fileName) {
      return
    }
    this.cleanup()
    this.fileId = fileId
    this.fileName = fileName
    this.loadImage()
  }

  cleanup() {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    const url = this.imageUrl()
    if (url) {
      URL.revokeObjectURL(url)
      this.imageUrl.set(null)
    }
    this.loadingState.set('idle')
    this.errorMessage.set('')
    this.dimensions.set(null)
  }

  async loadImage() {
    if (!this.fileId) {
      return
    }

    if (isMockTransport()) {
      this.loadingState.set('error')
      this.errorMessage.set(i18n('media:preview-desktop-only' as any))
      return
    }

    this.loadingState.set('loading')
    this.abortController = new AbortController()

    try {
      const {url} = await loadImageByFileId(this.fileId, this.fileName, {
        signal: this.abortController.signal,
      })

      this.imageUrl.set(url)
      this.loadingState.set('loaded')
      this.retryCount = 0
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
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
        this.retryCount++
        setTimeout(() => this.loadImage(), 1000 * this.retryCount)
        return
      }

      this.loadingState.set('error')
      this.errorMessage.set(i18n('media:image-load-failed' as any))
    }
  }

  setDimensions(dimensions: ImageDimensions) {
    this.dimensions.set(dimensions)
  }

  setError(message: string) {
    this.loadingState.set('error')
    this.errorMessage.set(message)
  }

  retry() {
    this.retryCount = 0
    this.loadImage()
  }
}
