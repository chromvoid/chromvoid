import {ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {VideoPlayerModel} from './video-player.model'
import type {FileMediaInfo} from 'root/core/catalog/media-info'

export class VideoPlayerBase extends ReatomLitElement {
  static get properties() {
    return {
      fileId: {type: Number},
      fileName: {type: String},
      mimeType: {type: String},
      mediaInfo: {attribute: false},
      lastModified: {type: Number},
      sourceSize: {type: Number},
      open: {type: Boolean},
    }
  }

  declare fileId: number
  declare fileName: string
  declare mimeType?: string
  declare mediaInfo?: FileMediaInfo | null
  declare lastModified?: number
  declare sourceSize?: number
  declare open: boolean

  protected readonly model = new VideoPlayerModel({
    onAndroidNativeVideoReleased: () => this.close(),
  })
  protected readonly videoUrl = this.model.videoUrl
  protected readonly loading = this.model.loading
  protected readonly fallbackLimited = this.model.fallbackLimited
  protected readonly errorMessage = this.model.errorMessage
  protected readonly sourceKind = this.model.sourceKind
  protected readonly sourceDelivery = this.model.sourceDelivery
  protected readonly sourceState = this.model.sourceState
  protected previousFocus: HTMLElement | null = null

  constructor() {
    super()
    this.fileId = 0
    this.fileName = ''
    this.open = false
  }

  connectedCallback() {
    super.connectedCallback()
    if (this.open) {
      this.onSetup()
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.onTeardown()
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    if (changedProperties.has('open')) {
      if (this.open) {
        this.onSetup()
      } else {
        this.onTeardown()
      }
    }
    if (
      (changedProperties.has('fileId') ||
        changedProperties.has('fileName') ||
        changedProperties.has('mimeType') ||
        changedProperties.has('mediaInfo') ||
        changedProperties.has('lastModified') ||
        changedProperties.has('sourceSize')) &&
      this.open
    ) {
      this.loadVideo()
    }
  }

  protected onSetup() {
    document.body.style.overflow = 'hidden'
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.loadVideo()
  }

  protected onTeardown() {
    document.body.style.overflow = ''
    this.model.cleanup()

    if (this.previousFocus && typeof this.previousFocus.focus === 'function') {
      try {
        this.previousFocus.focus()
      } catch {}
    }
    this.previousFocus = null
  }

  protected loadVideo() {
    this.model.setFile({
      fileId: this.fileId,
      fileName: this.fileName,
      mimeType: this.mimeType ?? null,
      mediaInfo: this.mediaInfo ?? null,
      lastModified: this.lastModified,
      sourceSize: this.sourceSize,
    })
  }

  protected close() {
    this.dispatchEvent(new CustomEvent('close', {bubbles: true, composed: true}))
  }

  protected handleVideoElementReady(event?: Event) {
    const video = event?.currentTarget instanceof HTMLVideoElement ? event.currentTarget : undefined
    this.model.handleVideoElementReady(video)
  }

  protected handleVideoElementError(event?: Event) {
    const video = event?.currentTarget instanceof HTMLVideoElement ? event.currentTarget : undefined
    this.model.handleVideoElementError(video)
  }

  protected handleVideoPlaybackEvent(event: Event) {
    if (!(event.currentTarget instanceof HTMLVideoElement)) return
    this.model.handleVideoPlaybackEvent(event.type, event.currentTarget)
  }

  protected handleOpenExternal() {
    this.dispatchFallbackAction('open-external')
  }

  protected handleDownload() {
    this.dispatchFallbackAction('download')
  }

  private dispatchFallbackAction(action: 'open-external' | 'download') {
    if (!this.fileId) return
    this.dispatchEvent(
      new CustomEvent('action', {
        detail: {action, fileId: this.fileId},
        bubbles: true,
        composed: true,
      }),
    )
  }
}
