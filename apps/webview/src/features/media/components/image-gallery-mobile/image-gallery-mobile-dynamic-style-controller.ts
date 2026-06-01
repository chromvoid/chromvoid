import type {DynamicStyleSnapshot} from './image-gallery-mobile.model'

export type MobileGalleryDynamicStyleControllerDeps = {
  host: HTMLElement
  getStyles: () => DynamicStyleSnapshot
  subscribeStyles: (listener: (styles: DynamicStyleSnapshot) => void) => () => void
}

export class MobileGalleryDynamicStyleController {
  private unsubscribe: (() => void) | null = null
  private lastStyleKey = ''
  private connected = false

  constructor(private readonly deps: MobileGalleryDynamicStyleControllerDeps) {}

  connect(): void {
    if (this.unsubscribe) {
      return
    }

    this.applyStyles(this.deps.getStyles())
    this.connected = true
    this.unsubscribe = this.deps.subscribeStyles((styles) => {
      if (!this.connected) {
        return
      }
      this.applyStyles(styles)
    })
  }

  disconnect(): void {
    this.connected = false
    this.unsubscribe?.()
    this.unsubscribe = null
    this.lastStyleKey = ''
  }

  private applyStyles(styles: DynamicStyleSnapshot): void {
    const styleKey = JSON.stringify(styles)
    if (styleKey === this.lastStyleKey) {
      return
    }
    this.lastStyleKey = styleKey

    this.deps.host.style.setProperty('--image-gallery-mobile-image-transition', styles.imageTransition)
    this.deps.host.style.setProperty('--image-gallery-mobile-image-translate-x', styles.imageTranslateX)
    this.deps.host.style.setProperty('--image-gallery-mobile-image-translate-y', styles.imageTranslateY)
    this.deps.host.style.setProperty('--image-gallery-mobile-image-scale', styles.imageScale)
    this.deps.host.style.setProperty('--image-gallery-mobile-viewport-translate-y', styles.viewportTranslateY)
    this.deps.host.style.setProperty('--image-gallery-mobile-viewport-opacity', styles.viewportOpacity)
  }
}
