import {nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'
import {i18n} from 'root/i18n'
import type {ImagePhotoGpsMetadata, ImagePhotoMetadata} from 'root/core/transport/transport'
import {getImageViewerActionButtons} from '../image-gallery-v2/image-gallery-actions'
import type {ImageGalleryViewerModel} from '../image-gallery-v2/gallery-viewer.model'
import {formatDate, formatDateString, formatDecimal, formatSizeWithBytes} from './image-gallery-mobile-format'
import type {ImageGalleryMobileModel, MobileGalleryFooterMode} from './image-gallery-mobile.model'
import type {
  MobileGalleryHeaderRenderState,
  MobileGalleryGpsAvailability,
  MobileGalleryImageMeta,
  MobileGalleryInfoSheetRenderState,
  MobileGalleryRenderActions,
} from './image-gallery-mobile.types'

const HEADER_FILENAME_EXTENSION_MAX_LENGTH = 12

function getHeaderFileNameParts(name: string | undefined): {stem: string; extension: string} {
  const fileName = name ?? ''
  const dotIndex = fileName.lastIndexOf('.')

  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return {stem: fileName, extension: ''}
  }

  const extension = fileName.slice(dotIndex)
  if (extension.length > HEADER_FILENAME_EXTENSION_MAX_LENGTH) {
    return {stem: fileName, extension: ''}
  }

  return {stem: fileName.slice(0, dotIndex), extension}
}

function renderHeaderTitle(name: string | undefined) {
  const fileName = name ?? ''
  const {stem, extension} = getHeaderFileNameParts(fileName)

  return html`
    <div class="title" title=${fileName} aria-label=${fileName}>
      <span class="title-stem">${stem}</span>
      ${extension ? html`<span class="title-extension">${extension}</span>` : nothing}
    </div>
  `
}

function renderHeaderCounter(displayIndex: number, imageCount: number) {
  const values = {
    current: String(displayIndex + 1),
    total: String(imageCount),
  }

  return html`
    <span class="counter" aria-label=${i18n('media:image-position' as any, values)}>
      ${i18n('media:image-position-compact' as any, values)}
    </span>
  `
}

export function renderMobileGalleryHeader(
  state: MobileGalleryHeaderRenderState,
  actions: MobileGalleryRenderActions,
) {
  const {
    currentImage,
    imageCount,
    displayIndex,
    chromeVisible,
    showSaveToGallery,
    showShare,
    sharePending,
  } = state
  const menuActions = getImageViewerActionButtons({
    showSaveToGallery,
    showShare,
    includeInfo: false,
    includeDelete: true,
  })
  const infoLabel = i18n('details:title' as any)
  const moreLabel = i18n('file-manager:more' as any)

  return html`
    <div class="header ${chromeVisible ? '' : 'hidden'}">
      <cv-button
        unstyled
        class="close-button"
        @click=${actions.onClose}
        aria-label=${i18n('button:close' as any)}
      >
        <cv-icon name="x" size="m"></cv-icon>
      </cv-button>
      <div class="header-copy">
        ${renderHeaderTitle(currentImage?.name)}
        ${imageCount > 1 ? renderHeaderCounter(displayIndex, imageCount) : nothing}
      </div>
      <div class="header-actions">
        <cv-button
          unstyled
          class="header-action-button"
          data-action="info"
          @click=${actions.onHeaderInfo}
          aria-label=${infoLabel}
        >
          <cv-icon name="info" size="m"></cv-icon>
        </cv-button>
        <cv-menu-button
          class="header-menu-button"
          variant="ghost"
          aria-label=${moreLabel}
          @cv-input=${actions.onHeaderMenuInput}
        >
          <span slot="prefix" class="header-menu-trigger">
            <cv-icon name="three-dots" size="m"></cv-icon>
          </span>
          ${menuActions.map(({action, icon, labelKey, dangerous}) => {
            const pending = action === 'share' && sharePending
            const label = pending ? i18n('file-manager:preparing-file' as any) : i18n(labelKey as any)

            return html`
              <cv-menu-item
                slot="menu"
                value=${action}
                class="header-menu-item ${dangerous ? 'danger' : ''}"
                ?disabled=${pending}
              >
                ${pending
                  ? html`<cv-spinner slot="prefix" size="xs" label=${label}></cv-spinner>`
                  : html`<cv-icon slot="prefix" name=${icon} size="s"></cv-icon>`}
                ${label}
              </cv-menu-item>
            `
          })}
        </cv-menu-button>
      </div>
    </div>
  `
}

function renderDetailRow(labelKey: string, value: unknown, className = '') {
  const text = formatDetailValue(value)

  return html`
    <div class="detail-row ${className}">
      <span class="detail-label">${i18n(labelKey as any)}</span>
      <span class="detail-value">${text}</span>
    </div>
  `
}

function renderOptionalDetailRow(labelKey: string, value: unknown, className = '') {
  if (!hasDetailValue(value)) return nothing
  return renderDetailRow(labelKey, value, className)
}

function renderGpsDetailRow(gps: ImagePhotoGpsMetadata, actions: MobileGalleryRenderActions) {
  const coordinates = `${formatDecimal(gps.latitude, 6)}, ${formatDecimal(gps.longitude, 6)}`

  return html`
    <div class="detail-row gps-row">
      <span class="detail-label">${i18n('details:gps' as any)}</span>
      <a
        class="detail-value detail-link"
        href=${getGoogleMapsUrl(gps)}
        target="_blank"
        rel="noopener noreferrer"
        @click=${actions.onExternalUrlClick}
      >
        <span>${coordinates}</span>
        <cv-icon name="box-arrow-up-right" size="s"></cv-icon>
      </a>
    </div>
  `
}

function getGpsUnavailableLabelKey(availability: MobileGalleryGpsAvailability): string | null {
  switch (availability) {
    case 'gps-unavailable-import-at-risk':
      return 'details:gps-unavailable-import-risk'
    case 'gps-unavailable-invalid-source':
      return 'details:gps-unavailable-invalid'
    case 'gps-unavailable-too-large':
      return 'details:gps-unavailable-too-large'
    default:
      return null
  }
}

function renderGpsUnavailableRow(availability: MobileGalleryGpsAvailability) {
  const labelKey = getGpsUnavailableLabelKey(availability)
  if (!labelKey) return nothing

  return renderDetailRow('details:gps', i18n(labelKey as any), 'gps-warning-row')
}

function formatDetailValue(value: unknown): string {
  if (!hasDetailValue(value)) return '—'
  if (typeof value === 'number') return formatDecimal(value, 0)
  return String(value)
}

function hasDetailValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  return typeof value === 'string' ? value.trim().length > 0 : true
}

function formatDimensions(metadata: ImagePhotoMetadata | null): string | null {
  if (!metadata?.width || !metadata.height) return null
  return `${formatDecimal(metadata.width, 0)} × ${formatDecimal(metadata.height, 0)}`
}

function formatCamera(metadata: ImagePhotoMetadata | null): string | null {
  const values = [metadata?.cameraMake, metadata?.cameraModel].filter(hasDetailValue)
  return values.length > 0 ? values.join(' ') : null
}

function hasPhotoMetadata(metadata: ImagePhotoMetadata | null): boolean {
  return Boolean(
    formatDimensions(metadata) ||
    formatCamera(metadata) ||
    metadata?.dateTaken ||
    metadata?.lensModel ||
    metadata?.exposureTime ||
    metadata?.aperture ||
    metadata?.iso ||
    metadata?.focalLength ||
    metadata?.orientation ||
    metadata?.gps,
  )
}

function getGoogleMapsUrl(gps: ImagePhotoGpsMetadata) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${gps.latitude},${gps.longitude}`,
  )}`
}

function renderSummaryTile(labelKey: string, value: unknown, className = '') {
  if (!hasDetailValue(value)) return nothing

  return html`
    <div class="sheet-summary-tile ${className}">
      <span>${i18n(labelKey as any)}</span>
      <strong>${formatDetailValue(value)}</strong>
    </div>
  `
}

function renderInfoSheetSummary(currentImage: MobileGalleryImageMeta, metadata: ImagePhotoMetadata | null) {
  const dimensions = formatDimensions(metadata)
  const camera = formatCamera(metadata)

  return html`
    <section class="sheet-summary">
      ${renderSummaryTile('details:size', formatSizeWithBytes(currentImage.size), 'primary')}
      ${renderSummaryTile('details:modified', formatDate(currentImage.lastModified))}
      ${renderSummaryTile('details:dimensions', dimensions)}
      ${renderSummaryTile('details:camera', camera, 'wide')}
    </section>
  `
}

function renderPhotoMetadataRows(
  metadata: ImagePhotoMetadata | null,
  gpsAvailability: MobileGalleryGpsAvailability,
  actions: MobileGalleryRenderActions,
) {
  const gps = metadata?.gps

  return html`
    <div class="detail-grid">
      ${renderOptionalDetailRow('details:dimensions', formatDimensions(metadata))}
      ${renderOptionalDetailRow(
        'details:date-taken',
        metadata?.dateTaken ? formatDateString(metadata.dateTaken) : null,
      )}
      ${renderOptionalDetailRow('details:camera', formatCamera(metadata))}
      ${renderOptionalDetailRow('details:lens', metadata?.lensModel)}
      ${renderOptionalDetailRow('details:exposure', metadata?.exposureTime)}
      ${renderOptionalDetailRow('details:aperture', metadata?.aperture)}
      ${renderOptionalDetailRow('details:iso', metadata?.iso)}
      ${renderOptionalDetailRow('details:focal-length', metadata?.focalLength)}
      ${renderOptionalDetailRow('details:orientation', metadata?.orientation)}
      ${gps
        ? html`
            ${renderGpsDetailRow(gps, actions)}
            ${renderOptionalDetailRow(
              'details:altitude',
              gps.altitudeMeters == null ? null : `${formatDecimal(gps.altitudeMeters, 2)} m`,
            )}
          `
        : renderGpsUnavailableRow(gpsAvailability)}
    </div>
  `
}

function renderPhotoMetadataState(
  state: MobileGalleryInfoSheetRenderState,
  actions: MobileGalleryRenderActions,
) {
  if (state.photoMetadataLoading) {
    return html`<div class="sheet-state">${i18n('details:metadata-loading' as any)}</div>`
  }

  if (
    state.photoMetadataError ||
    (!hasPhotoMetadata(state.photoMetadata) &&
      state.gpsAvailability === 'gps-unavailable-unknown')
  ) {
    return html`<div class="sheet-state">${i18n('details:metadata-unavailable' as any)}</div>`
  }

  return renderPhotoMetadataRows(state.photoMetadata, state.gpsAvailability, actions)
}

export function renderMobileGalleryFooter(input: {
  footerMode: MobileGalleryFooterMode
  images: MobileGalleryImageMeta[]
  galleryModel: ImageGalleryViewerModel
  mobileModel: ImageGalleryMobileModel
  actions: MobileGalleryRenderActions
}) {
  if (input.footerMode === 'none') {
    return nothing
  }

  return html`
    <image-gallery-mobile-thumbnail-strip
      .images=${input.images}
      .galleryModel=${input.galleryModel}
      .mobileModel=${input.mobileModel}
      @thumbnail-select=${input.actions.onThumbnailSelect}
    ></image-gallery-mobile-thumbnail-strip>
  `
}

export function renderMobileGalleryInfoSheet(
  state: MobileGalleryInfoSheetRenderState,
  actions: MobileGalleryRenderActions,
) {
  const {currentImage, open, detent} = state
  if (!currentImage) return nothing

  return html`
    <cv-bottom-sheet
      .open=${open}
      .detent=${detent}
      detents="collapsed middle expanded"
      no-header
      show-handle
      drag-to-close
      @cv-change=${actions.onInfoSheetSurfaceChange}
    >
      <div class="info-sheet-content" aria-hidden=${String(!open)}>
        <div class="sheet-header">
          <div class="sheet-title">
            <strong>${currentImage.name}</strong>
            <span>${currentImage.mimeType || i18n('file-type:image' as any)}</span>
          </div>
          <cv-button
            unstyled
            class="sheet-close-button"
            @click=${actions.onSheetClose}
            aria-label=${i18n('button:close' as any)}
          >
            <cv-icon name="x" size="m"></cv-icon>
          </cv-button>
        </div>

        <div class="sheet-body">
          ${renderInfoSheetSummary(currentImage, state.photoMetadata)}

          <section class="sheet-section">
            <div class="sheet-section-label">${i18n('details:system-metadata' as any)}</div>
            <div class="detail-grid">
              ${renderDetailRow('details:path', currentImage.path, 'path-row')}
              ${renderDetailRow('details:type', currentImage.mimeType)}
              ${renderDetailRow('details:size', formatSizeWithBytes(currentImage.size))}
              ${renderDetailRow('details:created', formatDate(currentImage.createdAt))}
              ${renderDetailRow('details:modified', formatDate(currentImage.lastModified))}
            </div>
          </section>

          <section class="sheet-section">
            <div class="sheet-section-label">${i18n('details:photo-metadata' as any)}</div>
            ${renderPhotoMetadataState(state, actions)}
          </section>
        </div>
      </div>
    </cv-bottom-sheet>
  `
}
