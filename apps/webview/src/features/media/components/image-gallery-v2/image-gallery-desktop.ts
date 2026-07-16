import {css, nothing} from 'lit'
import {
  CVImageViewer,
  type CVImageViewerActionEvent,
  type CVImageViewerCloseEvent,
  type CVImageViewerImageErrorEvent,
  type CVImageViewerInputEvent,
  type CVImageViewerPrimeEvent,
  type CVImageViewerThumbnailMetricsEvent,
} from '@chromvoid/uikit/components/cv-image-viewer'
import {html} from '@chromvoid/uikit/reatom-lit'
import {i18n} from 'root/i18n'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {canShareFiles} from 'root/shared/services/share'
import {getImageViewerActionButtons} from './image-gallery-actions'
import {formatGalleryDate, formatGallerySize} from './image-gallery-format'
import {ImageGalleryBase, type GalleryImage, type ImageViewerAction} from './image-gallery-base'
import {ImageGalleryDesktopModel} from './image-gallery-desktop.model'
import {
  mapGalleryActionsToViewerActions,
  mapGalleryImagesToViewerItems,
  mapGalleryThumbnailWindow,
} from './image-gallery-uikit-adapter'

export {type GalleryImage} from './image-gallery-base'

export class ImageGallery extends ImageGalleryBase {
  static define() {
    CVImageViewer.define()

    if (!customElements.get('image-gallery')) {
      customElements.define('image-gallery', this)
    }
  }

  private readonly desktopModel = new ImageGalleryDesktopModel()

  static styles = [
    css`
      :host {
        display: block;
      }

      .info-panel {
        position: fixed;
        z-index: 1;
        inset-inline-end: max(
          var(--app-spacing-4),
          var(--app-runtime-safe-area-inline-end, 0px)
        );
        inset-block-end: calc(max(var(--app-spacing-4), env(safe-area-inset-bottom, 0px)) + 84px);
        inline-size: min(360px, calc(100vw - 32px));
        display: grid;
        gap: var(--app-spacing-3);
        padding: var(--app-spacing-4);
        border-radius: var(--cv-radius-4);
        border: 1px solid var(--cv-alpha-white-14);
        background: linear-gradient(180deg, var(--cv-alpha-white-8), transparent), var(--cv-alpha-black-75);
        box-shadow: 0 20px 40px var(--cv-alpha-black-45);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        color: var(--cv-color-text-inverse, #fff);
        pointer-events: auto;
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
        min-inline-size: 0;
      }

      .info-panel-title strong {
        font-size: var(--cv-font-size-base);
        line-height: 1.2;
        overflow-wrap: anywhere;
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
        color: var(--cv-color-text-inverse, #fff);
        overflow-wrap: anywhere;
      }

      .close-button {
        inline-size: 32px;
        block-size: 32px;
        min-inline-size: 32px;
        min-block-size: 32px;
        border-radius: var(--cv-radius-s);
        color: var(--cv-color-text-inverse, #fff);
      }

      .close-button::part(base) {
        inline-size: 100%;
        block-size: 100%;
        min-inline-size: 0;
        min-block-size: 0;
      }

      @media (max-width: 768px) {
        .info-panel {
          inset-inline: max(var(--app-spacing-3), var(--app-runtime-safe-area-inline-start, 0px))
            max(var(--app-spacing-3), var(--app-runtime-safe-area-inline-end, 0px));
          inline-size: auto;
        }
      }
    `,
  ]

  protected override beforeGalleryTeardown() {
    this.desktopModel.reset()
  }

  private isViewerAction(action: string): action is ImageViewerAction {
    return (
      action === 'share' ||
      action === 'save-to-gallery' ||
      action === 'download' ||
      action === 'open-external' ||
      action === 'delete' ||
      action === 'info'
    )
  }

  private getImageMeta(currentImage: GalleryImage | undefined, index = this.currentIndex) {
    const meta: string[] = []

    if (this.images.length > 0) {
      meta.push(
        i18n('media:image-position' as any, {
          current: String(index + 1),
          total: String(this.images.length),
        }),
      )
    }

    if (currentImage?.mimeType) {
      meta.push(currentImage.mimeType)
    }

    return meta
  }

  private getViewerItems() {
    return mapGalleryImagesToViewerItems({
      images: this.images,
      model: this.model,
      getMeta: (image, index) => this.getImageMeta(image, index),
    })
  }

  private getViewerActions() {
    const showSaveToGallery = getRuntimeCapabilities().supports_photo_library_save
    const showShare = canShareFiles()
    const busyLabel = i18n('file-manager:preparing-file' as any)

    return mapGalleryActionsToViewerActions({
      actions: getImageViewerActionButtons({
        showDownload: !showSaveToGallery,
        showSaveToGallery,
        showShare,
        includeInfo: true,
        includeDelete: false,
      }),
      translate: (labelKey) => i18n(labelKey as any),
      sharePending: this.sharePending,
      busyLabel,
    })
  }

  private handleViewerClose(event: CVImageViewerCloseEvent) {
    if (event.detail.reason === 'backdrop' && this.desktopModel.infoPanelOpen()) {
      this.desktopModel.closeInfoPanel()
      return
    }

    this.close('control')
  }

  private handleViewerInput(event: CVImageViewerInputEvent) {
    if (event.detail.index === this.currentIndex) {
      return
    }

    this.emitNavigate(event.detail.index)
  }

  private handleViewerAction(event: CVImageViewerActionEvent) {
    const {value} = event.detail
    if (!this.isViewerAction(value)) {
      return
    }

    if (value === 'info') {
      this.desktopModel.toggleInfoPanel()
      return
    }

    const currentImage = this.images[this.currentIndex]
    if (!currentImage) {
      return
    }

    this.emitAction(value, currentImage.id)
  }

  private handleViewerImageError(event: CVImageViewerImageErrorEvent) {
    const imageId = Number(event.detail.itemId)
    this.model.handleImageRenderError(Number.isFinite(imageId) ? imageId : null, event.detail.sourceUrl)
  }

  private handleViewerPrime(event: CVImageViewerPrimeEvent) {
    this.model.primeImage(event.detail.index)
  }

  private handleViewerThumbnailMetrics(event: CVImageViewerThumbnailMetricsEvent) {
    this.model.setThumbnailViewportMetrics({
      viewportWidth: event.detail.viewportWidth,
      thumbnailStepPx: event.detail.thumbnailStepPx,
    })
    this.model.primeThumbnailVirtualWindow(event.detail.centerIndex)
  }

  private handleInfoPanelCloseClick() {
    this.desktopModel.closeInfoPanel()
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
          <cv-button
            unstyled
            class="close-button"
            @click=${this.handleInfoPanelCloseClick}
            aria-label=${i18n('button:close' as any)}
          >
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

  protected render() {
    if (!this.open) return nothing

    const currentImage = this.images[this.currentIndex]
    const infoPanelOpen = this.desktopModel.infoPanelOpen()
    const busyLabel = i18n('file-manager:preparing-file' as any)

    return html`
      <cv-image-viewer
        .open=${this.open}
        .items=${this.getViewerItems()}
        .currentIndex=${this.currentIndex}
        .actions=${this.getViewerActions()}
        .thumbnailWindow=${mapGalleryThumbnailWindow(this.model.getThumbnailVirtualWindow())}
        .busy=${this.sharePending}
        .busyLabel=${busyLabel}
        .layout=${'desktop'}
        .showThumbnails=${true}
        @cv-close=${this.handleViewerClose}
        @cv-input=${this.handleViewerInput}
        @cv-action=${this.handleViewerAction}
        @cv-image-error=${this.handleViewerImageError}
        @cv-prime=${this.handleViewerPrime}
        @cv-thumbnail-metrics=${this.handleViewerThumbnailMetrics}
      >
        <div slot="overlay">${this.renderInfoPanel(currentImage, infoPanelOpen)}</div>
      </cv-image-viewer>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'image-gallery': ImageGallery
  }
}
