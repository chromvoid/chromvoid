import {css, nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'
import {i18n} from 'root/i18n'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {animationStyles, spinIndicatorStyles} from 'root/shared/ui/shared-styles'
import {canShareFiles} from 'root/shared/services/share'
import {getImageViewerActionButtons} from './image-gallery-actions'
import {getDeepActiveElement} from './image-gallery-document-effects'
import {formatGalleryDate, formatGallerySize} from './image-gallery-format'
import {ImageGalleryBase, type GalleryImage, type ImageViewerAction} from './image-gallery-base'
import {ImageGalleryDesktopModel} from './image-gallery-desktop.model'

export {type GalleryImage} from './image-gallery-base'

type DesktopActionButton = ImageViewerAction | 'info'

export class ImageGallery extends ImageGalleryBase {
  static define() {
    if (!customElements.get('image-gallery')) {
      customElements.define('image-gallery', this)
    }
  }

  private keyboardHandler = this.handleKeyboard.bind(this)
  private readonly desktopModel = new ImageGalleryDesktopModel()

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
        padding-top: max(var(--app-spacing-4), var(--safe-area-top, 0px));
        padding-left: max(var(--app-spacing-4), env(safe-area-inset-left));
        padding-right: max(var(--app-spacing-4), env(safe-area-inset-right));
        background: var(--cv-alpha-black-50);
        backdrop-filter: blur(10px);
        color: white;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--app-spacing-4);
      }

      .header-copy {
        display: flex;
        flex-direction: column;
        gap: var(--app-spacing-1);
        min-width: 0;
      }

      .header-title {
        flex: 1;
        min-width: 0;
        font-size: var(--cv-font-size-lg);
        font-weight: 600;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .header-meta {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        flex-wrap: wrap;
        color: var(--cv-alpha-white-70);
        font-size: var(--cv-font-size-sm);
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        flex-shrink: 0;
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

      .gallery-error {
        max-inline-size: min(480px, 80vw);
        color: var(--cv-color-text-inverse, #fff);
        font-size: var(--app-font-size-body);
        text-align: center;
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
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--app-spacing-4);
        flex-wrap: wrap;
      }

      .footer-copy {
        display: flex;
        flex-direction: column;
        gap: var(--app-spacing-1);
        min-width: 0;
        flex: 1;
      }

      .footer-label {
        font-size: var(--cv-font-size-sm);
        color: var(--cv-alpha-white-70);
      }

      .footer-name {
        font-size: var(--cv-font-size-base);
        font-weight: 500;
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .footer-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--app-spacing-2);
        justify-content: flex-end;
      }

      .footer-action-button {
        display: inline-flex;
        align-items: center;
        gap: var(--app-spacing-2);
        min-height: 36px;
        padding: 0 var(--app-spacing-3);
        border-radius: var(--cv-radius-pill);
        border: 1px solid var(--cv-alpha-white-20);
        background: var(--cv-alpha-white-10);
        color: white;
        cursor: pointer;
        transition: background 0.2s;
        font-size: var(--cv-font-size-sm);
      }

      .footer-action-button:hover {
        background: var(--cv-alpha-white-20);
      }

      .footer-action-button:disabled {
        opacity: 0.78;
        cursor: default;
      }

      .footer-action-button:disabled:hover {
        background: var(--cv-alpha-white-10);
      }

      .footer-action-label {
        white-space: nowrap;
      }

      .share-pending-overlay {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: grid;
        place-items: center;
        padding: var(--app-spacing-4);
        background: var(--cv-alpha-black-45);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }

      .share-pending-status {
        display: inline-flex;
        align-items: center;
        gap: var(--app-spacing-3);
        max-inline-size: min(320px, 100%);
        padding: var(--app-spacing-3) var(--app-spacing-4);
        border-radius: var(--cv-radius-3);
        border: 1px solid var(--cv-alpha-white-16);
        background:
          linear-gradient(180deg, var(--cv-alpha-white-10), transparent),
          var(--cv-alpha-black-75);
        box-shadow: 0 18px 48px var(--cv-alpha-black-35);
        color: var(--cv-color-text-inverse, #fff);
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-semibold);
      }

      .loading-spinner {
        width: 48px;
        height: 48px;
        border: 3px solid var(--cv-alpha-white-30);
        border-top-color: white;
        border-radius: 50%;
      }

      .info-panel {
        position: fixed;
        z-index: 1002;
        inset-inline-end: max(var(--app-spacing-4), env(safe-area-inset-right));
        inset-block-end: calc(max(var(--app-spacing-4), env(safe-area-inset-bottom)) + 84px);
        inline-size: min(360px, calc(100vw - 32px));
        display: grid;
        gap: var(--app-spacing-3);
        padding: var(--app-spacing-4);
        border-radius: var(--cv-radius-4);
        border: 1px solid var(--cv-alpha-white-14);
        background:
          linear-gradient(180deg, var(--cv-alpha-white-8), transparent),
          var(--cv-alpha-black-75);
        box-shadow: 0 20px 40px var(--cv-alpha-black-45);
        backdrop-filter: blur(16px);
        color: white;
      }

      .info-panel-header {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: var(--app-spacing-3);
      }

      .info-panel-title {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .info-panel-title strong {
        font-size: var(--cv-font-size-base);
        line-height: 1.2;
        word-break: break-word;
      }

      .info-panel-title span {
        color: var(--cv-alpha-white-70);
        font-size: var(--cv-font-size-sm);
      }

      .info-panel-grid {
        display: grid;
        gap: var(--app-spacing-2);
      }

      .info-row {
        display: grid;
        grid-template-columns: 92px minmax(0, 1fr);
        gap: var(--app-spacing-3);
        font-size: var(--cv-font-size-sm);
      }

      .info-label {
        color: var(--cv-alpha-white-65);
      }

      .info-value {
        color: white;
        word-break: break-word;
      }

      @media (max-width: 768px) {
        .gallery-header,
        .gallery-footer {
          gap: var(--app-spacing-3);
        }

        .header-title {
          font-size: var(--cv-font-size-base);
        }

        .info-panel {
          inset-inline: max(var(--app-spacing-3), env(safe-area-inset-left))
            max(var(--app-spacing-3), env(safe-area-inset-right));
          inline-size: auto;
        }

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

  protected override afterGallerySetup() {
    document.addEventListener('keydown', this.keyboardHandler)

    // Move focus into the dialog.
    void this.updateComplete.then(() => {
      const closeBtn = this.renderRoot.querySelector<HTMLElement>('.close-button')
      closeBtn?.focus?.()
    })
  }

  protected override beforeGalleryTeardown() {
    document.removeEventListener('keydown', this.keyboardHandler)
    this.desktopModel.reset()
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

    const current = getDeepActiveElement()
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

  private handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      if (this.desktopModel.infoPanelOpen()) {
        this.desktopModel.closeInfoPanel()
        return
      }
      this.close()
    }
  }

  private handleActionClick(e: Event) {
    const action = (e.currentTarget as HTMLElement | null)?.getAttribute('data-action') as DesktopActionButton | null
    const currentImage = this.images[this.currentIndex]
    if (!action || !currentImage) {
      return
    }

    if (action === 'info') {
      this.desktopModel.toggleInfoPanel()
      return
    }

    this.emitAction(action, currentImage.id)
  }

  private handleImageError(e: Event) {
    const image = e.currentTarget as HTMLImageElement
    const imageId = Number(image.dataset['imageId'])
    this.model.handleImageRenderError(
      Number.isFinite(imageId) ? imageId : null,
      image.currentSrc || image.src,
    )
  }

  private getImageMeta(currentImage: GalleryImage | undefined) {
    const meta: string[] = []

    if (this.images.length > 0) {
      meta.push(
        i18n('media:image-position' as any, {
          current: String(this.currentIndex + 1),
          total: String(this.images.length),
        }),
      )
    }

    if (currentImage?.mimeType) {
      meta.push(currentImage.mimeType)
    }

    return meta
  }

  private renderInfoPanel(currentImage: GalleryImage | undefined, infoPanelOpen: boolean) {
    if (!infoPanelOpen || !currentImage) {
      return nothing
    }

    return html`
      <div class="info-panel" role="region" aria-label=${i18n('details:metadata' as any)}>
        <div class="info-panel-header">
          <div class="info-panel-title">
            <strong>${currentImage.name}</strong>
            <span>${currentImage.mimeType || i18n('file-type:image' as any)}</span>
          </div>
          <cv-button unstyled class="close-button" @click=${this.handleActionClick} data-action="info" aria-label=${i18n('button:close' as any)}>
            <cv-icon name="x" size="m"></cv-icon>
          </cv-button>
        </div>
        <div class="info-panel-grid">
          <div class="info-row">
            <span class="info-label">${i18n('details:path' as any)}</span>
            <span class="info-value">${currentImage.path}</span>
          </div>
          <div class="info-row">
            <span class="info-label">${i18n('details:size' as any)}</span>
            <span class="info-value">${formatGallerySize(currentImage.size)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">${i18n('details:modified' as any)}</span>
            <span class="info-value">${formatGalleryDate(currentImage.lastModified)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">${i18n('details:type' as any)}</span>
            <span class="info-value">${currentImage.mimeType || '—'}</span>
          </div>
        </div>
      </div>
    `
  }

  private renderSharePendingOverlay() {
    if (!this.sharePending) return nothing
    const label = i18n('file-manager:preparing-file' as any)

    return html`
      <div class="share-pending-overlay" role="status" aria-live="polite">
        <div class="share-pending-status">
          <cv-spinner size="s" label=${label}></cv-spinner>
          <span>${label}</span>
        </div>
      </div>
    `
  }

  protected render() {
    if (!this.open) return nothing

    const currentImage = this.images[this.currentIndex]
    const hasPrevious = this.currentIndex > 0
    const hasNext = this.currentIndex < this.images.length - 1
    const loading = this.model.loading()
    const currentImageUrl = this.model.currentImageUrl()
    const currentImageError = this.model.currentImageError()
    const infoPanelOpen = this.desktopModel.infoPanelOpen()
    const showSaveToGallery = getRuntimeCapabilities().supports_photo_library_save
    const showShare = canShareFiles()
    const actionButtons = getImageViewerActionButtons({
      showSaveToGallery,
      showShare,
      includeInfo: true,
      includeDelete: false,
    })
    const imageMeta = this.getImageMeta(currentImage)

    return html`
      <div
        class="gallery-overlay"
        role="dialog"
        aria-modal="true"
        aria-label=${currentImage?.name || i18n('media:image-viewer' as any)}
        @click=${this.handleOverlayClick}
      >
        <div class="gallery-header">
          <div class="header-copy">
            <div class="header-title">${currentImage?.name || i18n('media:image-viewer' as any)}</div>
            <div class="header-meta">${imageMeta.map((item) => html`<span>${item}</span>`)}</div>
          </div>
          <div class="header-actions">
            <cv-button unstyled class="close-button" @click=${this.close} aria-label=${i18n('button:close' as any)}>
              <cv-icon name="x" size="m"></cv-icon>
            </cv-button>
          </div>
        </div>

        <div class="gallery-main" aria-busy=${String(this.sharePending)}>
          ${loading
            ? html`<div class="loading-spinner"></div>`
            : currentImageUrl
              ? html`<img
                  class="gallery-image"
                  src=${currentImageUrl}
                  alt=${currentImage?.name || ''}
                  data-image-id=${currentImage?.id ?? ''}
                  decoding="async"
                  @error=${this.handleImageError}
                />`
              : currentImageError
                ? html`<div class="gallery-error" role="status">${currentImageError}</div>`
                : nothing}
          ${this.renderSharePendingOverlay()}
        </div>

        ${this.renderInfoPanel(currentImage, infoPanelOpen)}

        <div class="gallery-footer">
          <div class="footer-copy">
            <div class="footer-label">${i18n('media:image-viewer' as any)}</div>
            <div class="footer-name">${currentImage?.name || ''}</div>
          </div>
          <div class="footer-actions">
            ${actionButtons.map(({action, icon, labelKey}) => {
              const pending = action === 'share' && this.sharePending
              const label = pending ? i18n('file-manager:preparing-file' as any) : i18n(labelKey as any)

              return html`
                <cv-button unstyled
                  class="footer-action-button"
                  data-action=${action}
                  ?disabled=${pending}
                  @click=${this.handleActionClick}
                  aria-label=${label}
                >
                  ${pending
                    ? html`<cv-spinner slot="prefix" size="xs" label=${label}></cv-spinner>`
                    : html`<cv-icon slot="prefix" name=${icon} size="s"></cv-icon>`}
                  <span class="footer-action-label">${label}</span>
                </cv-button>
              `
            })}
          </div>
        </div>

        <cv-button unstyled
          class="nav-arrow left"
          ?disabled=${!hasPrevious}
          @click=${this.navigatePrevious}
          aria-label=${i18n('media:previous-image' as any)}
        >
          <cv-icon name="chevron-left" size="m"></cv-icon>
        </cv-button>

        <cv-button unstyled
          class="nav-arrow right"
          ?disabled=${!hasNext}
          @click=${this.navigateNext}
          aria-label=${i18n('media:next-image' as any)}
        >
          <cv-icon name="chevron-right" size="m"></cv-icon>
        </cv-button>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'image-gallery': ImageGallery
  }
}
