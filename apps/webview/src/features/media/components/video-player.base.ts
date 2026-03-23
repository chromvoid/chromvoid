import {XLitElement} from '@statx/lit'
import {nothing} from 'lit'
import {state} from '@statx/core'
import {loadImageByFileId} from './image-loader'

export class VideoPlayerBase extends XLitElement {
  static get properties() {
    return {
      fileId: {type: Number},
      fileName: {type: String},
      open: {type: Boolean},
    }
  }

  declare fileId: number
  declare fileName: string
  declare open: boolean

  protected readonly videoUrl = state<string | null>(null)
  protected readonly loading = state(true)
  protected previousFocus: HTMLElement | null = null
  protected abortController: AbortController | null = null

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
    if ((changedProperties.has('fileId') || changedProperties.has('fileName')) && this.open) {
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

    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }

    const url = this.videoUrl()
    if (url) {
      URL.revokeObjectURL(url)
      this.videoUrl.set(null)
    }
    this.loading.set(true)

    if (this.previousFocus && typeof this.previousFocus.focus === 'function') {
      try {
        this.previousFocus.focus()
      } catch {}
    }
    this.previousFocus = null
  }

  protected async loadVideo() {
    if (!this.fileId || !this.fileName) return

    this.loading.set(true)
    this.abortController = new AbortController()

    try {
      const {url} = await loadImageByFileId(this.fileId, this.fileName, {
        signal: this.abortController.signal,
      })
      this.videoUrl.set(url)
      this.loading.set(false)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('Failed to load video:', error)
      this.loading.set(false)
    }
  }

  protected close() {
    this.dispatchEvent(new CustomEvent('close', {bubbles: true, composed: true}))
  }
}
