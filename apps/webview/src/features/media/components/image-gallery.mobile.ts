import {html, css, nothing} from 'lit'
import {i18n} from 'root/i18n'
import {animationStyles, spinIndicatorStyles} from 'root/shared/ui/shared-styles'
import {canShareFiles, shareFile} from 'root/shared/services/share'
import {ImageGalleryBase} from './image-gallery.base'

export {type GalleryImage} from './image-gallery.base'

type GestureState = 'idle' | 'dragging' | 'settling'

export class ImageGalleryMobile extends ImageGalleryBase {
  static define() {
    if (!customElements.get('image-gallery-mobile')) {
      customElements.define('image-gallery-mobile', this)
    }
  }

  // 3-panel swipe state
  private displayIndex = 0
  private gestureState: GestureState = 'idle'
  private startX = 0
  private startY = 0
  private startTime = 0
  private deltaX = 0
  private directionLocked = false
  private rafId = 0
  private trackEl: HTMLElement | null = null

  static styles = [
    animationStyles,
    spinIndicatorStyles,
    css`
      :host {
        display: block;
      }

      .overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: var(--cv-alpha-black-95);
        display: flex;
        flex-direction: column;
        animation: fadeIn 0.2s ease-out;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--app-spacing-3);
        padding-top: max(var(--app-spacing-3), env(safe-area-inset-top));
        padding-left: max(var(--app-spacing-3), env(safe-area-inset-left));
        padding-right: max(var(--app-spacing-3), env(safe-area-inset-right));
        z-index: 1;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
      }

      .close-button,
      .share-button {
        width: 44px;
        height: 44px;
        border-radius: var(--cv-radius-s);
        background: var(--cv-alpha-white-15);
        border: none;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .counter {
        color: var(--cv-alpha-white-70);
        font-size: var(--cv-font-size-sm);
      }

      .main {
        flex: 1;
        overflow: hidden;
        position: relative;
        touch-action: pan-y;
      }

      .track {
        display: flex;
        width: 300%;
        height: 100%;
        transform: translateX(-33.333%);
        will-change: transform;
      }

      .track.settling {
        transition: transform 0.28s ease-out;
      }

      .panel {
        width: 33.333%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .gallery-image {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        user-select: none;
        -webkit-user-drag: none;
        pointer-events: none;
      }

      .dots {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: var(--app-spacing-3);
        padding-bottom: max(var(--app-spacing-4), env(safe-area-inset-bottom));
      }

      .dot {
        border-radius: 50%;
        background: var(--cv-alpha-white-30);
        border: none;
        padding: 0;
        cursor: pointer;
        transition:
          background 0.2s,
          width 0.2s,
          height 0.2s;
        -webkit-tap-highlight-color: transparent;
        width: 6px;
        height: 6px;
      }

      .dot.active {
        background: white;
        width: 8px;
        height: 8px;
      }

      .text-counter {
        color: var(--cv-alpha-white-70);
        font-size: var(--cv-font-size-sm);
        padding: var(--app-spacing-3);
        padding-bottom: max(var(--app-spacing-4), env(safe-area-inset-bottom));
        text-align: center;
      }

      .loading-spinner {
        width: 48px;
        height: 48px;
        border: 3px solid var(--cv-alpha-white-30);
        border-top-color: white;
        border-radius: 50%;
      }
    `,
  ]

  protected override onSetup() {
    super.onSetup()
    this.displayIndex = this.currentIndex
  }

  protected override onTeardown() {
    this.gestureState = 'idle'
    this.deltaX = 0
    this.directionLocked = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    this.trackEl = null
    super.onTeardown()
  }

  protected override onImagesUpdated() {
    this.displayIndex = this.currentIndex
    super.onImagesUpdated()
  }

  private handleShare = () => {
    const currentImage = this.images[this.displayIndex]
    if (currentImage) {
      void shareFile(currentImage.id, currentImage.name)
    }
  }

  private handleOverlayClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement)?.classList?.contains('main')) {
      this.close()
    }
  }

  // --- 3-panel swipe handling ---

  private handleTouchStart = (e: TouchEvent) => {
    if (this.gestureState !== 'idle') return
    const touch = e.touches[0]
    if (!touch) return

    this.startX = touch.clientX
    this.startY = touch.clientY
    this.startTime = Date.now()
    this.deltaX = 0
    this.directionLocked = false
    this.trackEl = this.renderRoot.querySelector<HTMLElement>('.track')

    if (this.trackEl) {
      this.trackEl.classList.remove('settling')
    }

    this.gestureState = 'dragging'
  }

  private handleTouchMove = (e: TouchEvent) => {
    if (this.gestureState !== 'dragging') return
    const touch = e.touches[0]
    if (!touch) return

    const dx = touch.clientX - this.startX
    const dy = touch.clientY - this.startY

    if (!this.directionLocked) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        if (Math.abs(dx) > Math.abs(dy)) {
          this.directionLocked = true
        } else {
          // Vertical scroll — abort gesture
          this.gestureState = 'idle'
          return
        }
      } else {
        return
      }
    }

    e.preventDefault()

    const atStart = this.displayIndex === 0 && dx > 0
    const atEnd = this.displayIndex === this.images.length - 1 && dx < 0
    this.deltaX = atStart || atEnd ? dx * 0.3 : dx

    if (!this.rafId && this.trackEl) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = 0
        if (this.trackEl) {
          this.trackEl.style.transform = `translateX(calc(-33.333% + ${this.deltaX}px))`
        }
      })
    }
  }

  private handleTouchEnd = () => {
    if (this.gestureState !== 'dragging') return

    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }

    if (!this.directionLocked) {
      this.gestureState = 'idle'
      return
    }

    const elapsed = Date.now() - this.startTime
    const velocity = Math.abs(this.deltaX) / elapsed
    const shouldNavigate = Math.abs(this.deltaX) > 50 || velocity > 0.3

    let targetTransform = 'translateX(-33.333%)'
    let navigateDirection = 0

    if (shouldNavigate && this.deltaX > 0 && this.displayIndex > 0) {
      // Swipe right → previous
      targetTransform = 'translateX(0%)'
      navigateDirection = -1
    } else if (shouldNavigate && this.deltaX < 0 && this.displayIndex < this.images.length - 1) {
      // Swipe left → next
      targetTransform = 'translateX(-66.666%)'
      navigateDirection = 1
    }

    this.gestureState = 'settling'

    if (this.trackEl) {
      this.trackEl.classList.add('settling')
      this.trackEl.style.transform = targetTransform

      const onEnd = () => {
        this.trackEl?.removeEventListener('transitionend', onEnd)
        this.finishSettle(navigateDirection)
      }
      this.trackEl.addEventListener('transitionend', onEnd)

      // Safety fallback if transitionend doesn't fire
      setTimeout(() => {
        if (this.gestureState === 'settling') {
          this.trackEl?.removeEventListener('transitionend', onEnd)
          this.finishSettle(navigateDirection)
        }
      }, 350)
    } else {
      this.finishSettle(navigateDirection)
    }
  }

  private finishSettle(direction: number) {
    if (direction !== 0) {
      this.displayIndex += direction
      this.model.navigate(this.displayIndex)
      this.emitNavigate(this.displayIndex)
    }

    // Reset track position instantly (no transition)
    if (this.trackEl) {
      this.trackEl.classList.remove('settling')
      this.trackEl.style.transform = 'translateX(-33.333%)'
    }

    this.gestureState = 'idle'
    this.requestUpdate()
  }

  private handleDotClick(index: number) {
    if (this.gestureState !== 'idle') return
    this.displayIndex = index
    this.model.navigate(index)
    this.emitNavigate(index)
    this.requestUpdate()
  }

  // --- Render ---

  private renderPanel(index: number) {
    if (index < 0 || index >= this.images.length) {
      return html`<div class="panel"></div>`
    }

    // For current panel, use model's reactive URL (handles async loading)
    if (index === this.displayIndex) {
      const loading = this.model.loading()
      const url = this.model.currentImageUrl()
      const image = this.images[index]
      return html`
        <div class="panel">
          ${loading
            ? html`<div class="loading-spinner"></div>`
            : url
              ? html`<img class="gallery-image" src=${url} alt=${image?.name || ''} decoding="async" />`
              : nothing}
        </div>
      `
    }

    // For adjacent panels, use cached URL (instant, no spinner)
    const cachedUrl = this.model.peekCachedUrl(index)
    const image = this.images[index]
    return html`
      <div class="panel">
        ${cachedUrl
          ? html`<img class="gallery-image" src=${cachedUrl} alt=${image?.name || ''} decoding="async" />`
          : nothing}
      </div>
    `
  }

  private renderDots() {
    if (this.images.length <= 1) return nothing

    if (this.images.length > 15) {
      return html`<div class="text-counter">${this.displayIndex + 1} / ${this.images.length}</div>`
    }

    return html`
      <div class="dots">
        ${this.images.map(
          (_, i) => html`
            <button
              class="dot ${i === this.displayIndex ? 'active' : ''}"
              @click=${() => this.handleDotClick(i)}
              aria-label=${i18n('media:image' as any, {index: String(i + 1)})}
            ></button>
          `,
        )}
      </div>
    `
  }

  protected render() {
    if (!this.open) return nothing

    const currentImage = this.images[this.displayIndex]

    return html`
      <div
        class="overlay"
        role="dialog"
        aria-modal="true"
        aria-label=${currentImage?.name || i18n('media:image-viewer' as any)}
      >
        <div class="header">
          <button class="close-button" @click=${this.close} aria-label=${i18n('button:close' as any)}>
            <cv-icon name="x" size="m"></cv-icon>
          </button>
          ${this.images.length > 1
            ? html`<span class="counter"
                >${i18n('media:image-position' as any, {
                  current: String(this.displayIndex + 1),
                  total: String(this.images.length),
                })}</span
              >`
            : nothing}
          <div class="header-actions">
            ${canShareFiles()
              ? html`
                  <button
                    class="share-button"
                    @click=${this.handleShare}
                    aria-label=${i18n('action:share' as any)}
                  >
                    <cv-icon name="share" size="m"></cv-icon>
                  </button>
                `
              : nothing}
          </div>
        </div>

        <div
          class="main"
          @click=${this.handleOverlayClick}
          @touchstart=${this.handleTouchStart}
          @touchmove=${this.handleTouchMove}
          @touchend=${this.handleTouchEnd}
        >
          <div class="track">
            ${this.renderPanel(this.displayIndex - 1)} ${this.renderPanel(this.displayIndex)}
            ${this.renderPanel(this.displayIndex + 1)}
          </div>
        </div>

        ${this.renderDots()}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'image-gallery-mobile': ImageGalleryMobile
  }
}
