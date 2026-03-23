import {html, css, nothing} from 'lit'
import {i18n} from 'root/i18n'
import {animationStyles, spinIndicatorStyles} from 'root/shared/ui/shared-styles'
import {ImageGalleryBase} from './image-gallery.base'

export {type GalleryImage} from './image-gallery.base'

export class ImageGallery extends ImageGalleryBase {
  static define() {
    if (!customElements.get('image-gallery')) {
      customElements.define('image-gallery', this)
    }
  }

  private keyboardHandler = this.handleKeyboard.bind(this)

  static styles = [
    animationStyles,
    spinIndicatorStyles,
    css`
      :host {
        display: block;
      }

      .gallery-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: var(--cv-alpha-black-95);
        display: flex;
        flex-direction: column;
        animation: var(--motion-fade-animation, fadeIn 0.2s ease-out);
      }

      .gallery-header {
        padding: var(--app-spacing-4);
        padding-top: max(var(--app-spacing-4), env(safe-area-inset-top));
        padding-left: max(var(--app-spacing-4), env(safe-area-inset-left));
        padding-right: max(var(--app-spacing-4), env(safe-area-inset-right));
        background: var(--cv-alpha-black-50);
        backdrop-filter: blur(10px);
        color: white;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .position-indicator {
        flex: 1;
        text-align: center;
        font-size: var(--cv-font-size-base);
      }

      .close-button {
        width: 32px;
        height: 32px;
        border-radius: var(--cv-radius-s);
        background: var(--cv-alpha-white-10);
        border: 1px solid var(--cv-alpha-white-20);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.2s;
      }

      .close-button:hover {
        background: var(--cv-alpha-white-20);
      }

      .gallery-main {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--app-spacing-6);
        position: relative;
        touch-action: pinch-zoom pan-x pan-y;
      }

      .gallery-image {
        max-width: 90vw;
        max-height: 90vh;
        object-fit: contain;
        animation: var(--motion-zoom-animation, zoomIn 0.2s ease-out);
        view-transition-name: gallery-image;
        touch-action: pinch-zoom pan-x pan-y;
      }

      .nav-arrow {
        position: fixed;
        top: 50%;
        transform: translateY(-50%);
        width: 48px;
        height: 48px;
        background: var(--cv-alpha-white-10);
        border: 1px solid var(--cv-alpha-white-20);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition:
          background 0.2s,
          opacity 0.2s;
        color: white;
        z-index: 1001;
      }

      .nav-arrow:hover:not(:disabled) {
        background: var(--cv-alpha-white-20);
      }

      .nav-arrow:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }

      .nav-arrow.left {
        left: max(var(--app-spacing-6), env(safe-area-inset-left));
      }

      .nav-arrow.right {
        right: max(var(--app-spacing-6), env(safe-area-inset-right));
      }

      .gallery-footer {
        padding: var(--app-spacing-4);
        padding-bottom: max(var(--app-spacing-4), env(safe-area-inset-bottom));
        padding-left: max(var(--app-spacing-4), env(safe-area-inset-left));
        padding-right: max(var(--app-spacing-4), env(safe-area-inset-right));
        background: var(--cv-alpha-black-50);
        backdrop-filter: blur(10px);
        color: white;
        text-align: center;
        font-size: var(--cv-font-size-base);
      }

      .loading-spinner {
        width: 48px;
        height: 48px;
        border: 3px solid var(--cv-alpha-white-30);
        border-top-color: white;
        border-radius: 50%;
      }

      @media (max-width: 768px) {
        .nav-arrow {
          width: 40px;
          height: 40px;
        }

        .nav-arrow.left {
          left: max(var(--app-spacing-4), env(safe-area-inset-left));
        }

        .nav-arrow.right {
          right: max(var(--app-spacing-4), env(safe-area-inset-right));
        }
      }
    `,
  ]

  protected override onSetup() {
    document.addEventListener('keydown', this.keyboardHandler)
    this.previousFocus = this.getDeepActiveElement()
    super.onSetup()

    // Move focus into the dialog.
    void this.updateComplete.then(() => {
      const closeBtn = this.renderRoot.querySelector<HTMLElement>('.close-button')
      closeBtn?.focus?.()
    })
  }

  protected override onTeardown() {
    document.removeEventListener('keydown', this.keyboardHandler)
    super.onTeardown()
  }

  private getDeepActiveElement(): HTMLElement | null {
    let active: Element | null = typeof document !== 'undefined' ? document.activeElement : null
    while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement
    }
    return active instanceof HTMLElement ? active : null
  }

  private getFocusableElements(): HTMLElement[] {
    const root = this.renderRoot
    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    )
    return nodes.filter((el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'))
  }

  private trapFocus(e: KeyboardEvent) {
    if (e.key !== 'Tab') return

    const focusables = this.getFocusableElements()
    if (focusables.length === 0) return

    const current = this.getDeepActiveElement()
    const idx = current ? focusables.indexOf(current) : -1
    const dir = e.shiftKey ? -1 : 1

    let next = idx + dir
    if (next < 0) next = focusables.length - 1
    if (next >= focusables.length) next = 0

    e.preventDefault()
    focusables[next]?.focus?.()
  }

  private handleKeyboard(e: KeyboardEvent) {
    this.trapFocus(e)
    switch (e.key) {
      case 'Escape':
        e.stopPropagation()
        this.close()
        break
      case 'ArrowLeft':
        e.stopPropagation()
        this.navigatePrevious()
        break
      case 'ArrowRight':
        e.stopPropagation()
        this.navigateNext()
        break
      case 'Home':
        e.stopPropagation()
        this.navigateFirst()
        break
      case 'End':
        e.stopPropagation()
        this.navigateLast()
        break
    }
  }

  private navigatePrevious() {
    if (this.currentIndex > 0) {
      this.emitNavigate(this.currentIndex - 1)
    }
  }

  private navigateNext() {
    if (this.currentIndex < this.images.length - 1) {
      this.emitNavigate(this.currentIndex + 1)
    }
  }

  private navigateFirst() {
    this.emitNavigate(0)
  }

  private navigateLast() {
    this.emitNavigate(this.images.length - 1)
  }

  private handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      this.close()
    }
  }

  protected render() {
    if (!this.open) return nothing

    const currentImage = this.images[this.currentIndex]
    const hasPrevious = this.currentIndex > 0
    const hasNext = this.currentIndex < this.images.length - 1
    const loading = this.model.loading()
    const currentImageUrl = this.model.currentImageUrl()

    return html`
      <div
        class="gallery-overlay"
        role="dialog"
        aria-modal="true"
        aria-label=${currentImage?.name || i18n('media:image-viewer' as any)}
        @click=${this.handleOverlayClick}
      >
        <div class="gallery-header">
          <div></div>
          <div class="position-indicator">
            ${i18n('media:image-position' as any, {
              current: String(this.currentIndex + 1),
              total: String(this.images.length),
            })}
          </div>
          <button class="close-button" @click=${this.close} aria-label=${i18n('button:close' as any)}>
            <cv-icon name="x" size="m"></cv-icon>
          </button>
        </div>

        <div class="gallery-main">
          ${loading
            ? html`<div class="loading-spinner"></div>`
            : currentImageUrl
              ? html`<img
                  class="gallery-image"
                  src=${currentImageUrl}
                  alt=${currentImage?.name || ''}
                  decoding="async"
                />`
              : nothing}
        </div>

        <div class="gallery-footer">${currentImage?.name || ''}</div>

        <button
          class="nav-arrow left"
          ?disabled=${!hasPrevious}
          @click=${this.navigatePrevious}
          aria-label=${i18n('media:previous-image' as any)}
        >
          <cv-icon name="chevron-left" size="m"></cv-icon>
        </button>

        <button
          class="nav-arrow right"
          ?disabled=${!hasNext}
          @click=${this.navigateNext}
          aria-label=${i18n('media:next-image' as any)}
        >
          <cv-icon name="chevron-right" size="m"></cv-icon>
        </button>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'image-gallery': ImageGallery
  }
}
