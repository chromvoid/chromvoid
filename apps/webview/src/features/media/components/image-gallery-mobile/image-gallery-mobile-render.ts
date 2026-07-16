import {nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'
import {i18n} from 'root/i18n'
import type {ImagePhotoGpsMetadata, ImagePhotoMetadata} from 'root/core/transport/transport'
import type {ImageGalleryViewerModel} from '../image-gallery-v2/gallery-viewer.model'
import {formatDate, formatDateString, formatDecimal, formatSize, formatSizeWithBytes} from './image-gallery-mobile-format'
import type {ImageGalleryMobileModel, MobileGalleryFooterMode} from './image-gallery-mobile.model'
import type {
  MobileGalleryGpsAvailability,
  MobileGalleryImageMeta,
  MobileGalleryInfoSheetRenderState,
  MobileGalleryRenderActions,
} from './image-gallery-mobile.types'

function hasDetailValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  return typeof value === 'string' ? value.trim().length > 0 : true
}

function formatDetailValue(value: unknown): string {
  if (!hasDetailValue(value)) return '—'
  if (typeof value === 'number') return formatDecimal(value, 0)
  return String(value)
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

function getGpsUnavailableTone(availability: MobileGalleryGpsAvailability) {
  switch (availability) {
    case 'gps-unavailable-invalid-source':
      return 'danger'
    case 'gps-unavailable-import-at-risk':
    case 'gps-unavailable-too-large':
      return 'warning'
    default:
      return 'neutral'
  }
}

function renderRawDetailRow(label: string, value: unknown, className = '') {
  return html`
    <div class="detail-row ${className}">
      <span class="detail-label">${label}</span>
      <span class="detail-value">${formatDetailValue(value)}</span>
    </div>
  `
}

function renderDetailRow(labelKey: string, value: unknown, className = '') {
  return renderRawDetailRow(i18n(labelKey as any), value, className)
}

function renderOptionalDetailRow(labelKey: string, value: unknown, className = '') {
  if (!hasDetailValue(value)) return nothing
  return renderDetailRow(labelKey, value, className)
}

function renderOptionalRawDetailRow(label: string, value: unknown, className = '') {
  if (!hasDetailValue(value)) return nothing
  return renderRawDetailRow(label, value, className)
}

function renderSheetSectionLabel(iconName: string, labelKey: string) {
  return html`
    <div class="sheet-section-label">
      <cv-icon name=${iconName} size="s" aria-hidden="true"></cv-icon>
      <span>${i18n(labelKey as any)}</span>
    </div>
  `
}

function renderSummaryChip(labelKey: string, value: unknown, iconName: string, className = '') {
  if (!hasDetailValue(value)) return nothing

  return html`
    <div class="sheet-summary-chip ${className}">
      <cv-icon name=${iconName} size="s" aria-hidden="true"></cv-icon>
      <span>${formatDetailValue(value)}</span>
      <small>${i18n(labelKey as any)}</small>
    </div>
  `
}

function renderFileIdentity(currentImage: MobileGalleryImageMeta) {
  const mimeType = currentImage.mimeType || i18n('file-type:image' as any)

  return html`
    <div class="sheet-file-icon" aria-hidden="true">
      <cv-icon name="file-image" size="m"></cv-icon>
    </div>
    <div class="sheet-title">
      <strong>${currentImage.name}</strong>
      <div class="sheet-title-meta">
        <span>${mimeType}</span>
        <small>${formatSize(currentImage.size)}</small>
      </div>
    </div>
  `
}

function renderInfoSheetSummary(currentImage: MobileGalleryImageMeta, metadata: ImagePhotoMetadata | null) {
  const dimensions = formatDimensions(metadata)
  const camera = formatCamera(metadata)

  return html`
    <section class="sheet-summary" aria-label=${i18n('details:metadata' as any)}>
      ${renderSummaryChip('details:size', formatSize(currentImage.size), 'file', 'primary')}
      ${renderSummaryChip('details:modified', formatDate(currentImage.lastModified), 'calendar')}
      ${renderSummaryChip('details:dimensions', dimensions, 'image')}
      ${renderSummaryChip('details:camera', camera, 'camera', 'wide')}
    </section>
  `
}

function renderCameraMetadataSection(metadata: ImagePhotoMetadata | null) {
  const rows = [
    renderOptionalDetailRow('details:dimensions', formatDimensions(metadata)),
    renderOptionalDetailRow(
      'details:date-taken',
      metadata?.dateTaken ? formatDateString(metadata.dateTaken) : null,
    ),
    renderOptionalDetailRow('details:camera', formatCamera(metadata)),
    renderOptionalDetailRow('details:lens', metadata?.lensModel),
    renderOptionalDetailRow('details:exposure', metadata?.exposureTime),
    renderOptionalDetailRow('details:aperture', metadata?.aperture),
    renderOptionalDetailRow('details:iso', metadata?.iso),
    renderOptionalDetailRow('details:focal-length', metadata?.focalLength),
    renderOptionalDetailRow('details:orientation', metadata?.orientation),
  ].filter((row) => row !== nothing)

  if (rows.length === 0) return nothing

  return html`
    <section class="sheet-section">
      ${renderSheetSectionLabel('camera', 'details:camera-shot')}
      <div class="detail-grid">${rows}</div>
    </section>
  `
}

function renderGpsDetailRow(gps: ImagePhotoGpsMetadata, actions: MobileGalleryRenderActions) {
  const coordinates = `${formatDecimal(gps.latitude, 6)}, ${formatDecimal(gps.longitude, 6)}`

  return html`
    <div class="location-card gps-row">
      <a
        class="location-link detail-link"
        href=${getGoogleMapsUrl(gps)}
        target="_blank"
        rel="noopener noreferrer"
        @click=${actions.onExternalUrlClick}
      >
        <span class="location-icon" aria-hidden="true"><cv-icon name="map" size="s"></cv-icon></span>
        <span class="location-copy">
          <strong>${coordinates}</strong>
          <span>
            ${i18n('button:open' as any)}
            <cv-icon name="box-arrow-up-right" size="s"></cv-icon>
          </span>
        </span>
      </a>
      ${renderOptionalDetailRow(
        'details:altitude',
        gps.altitudeMeters == null ? null : `${formatDecimal(gps.altitudeMeters, 2)} m`,
      )}
    </div>
  `
}

function renderGpsUnavailableNotice(availability: MobileGalleryGpsAvailability) {
  const labelKey = getGpsUnavailableLabelKey(availability)
  if (!labelKey) return nothing

  return html`
    <div class="sheet-notice gps-warning-row" data-tone=${getGpsUnavailableTone(availability)}>
      <span class="notice-icon" aria-hidden="true"><cv-icon name="info" size="m"></cv-icon></span>
      <span class="notice-copy">
        <strong>${i18n('details:gps' as any)}</strong>
        <span>${i18n(labelKey as any)}</span>
      </span>
    </div>
  `
}

function renderLocationSection(
  metadata: ImagePhotoMetadata | null,
  gpsAvailability: MobileGalleryGpsAvailability,
  actions: MobileGalleryRenderActions,
) {
  const gps = metadata?.gps
  const content = gps ? renderGpsDetailRow(gps, actions) : renderGpsUnavailableNotice(gpsAvailability)

  if (content === nothing) return nothing

  return html`
    <section class="sheet-section">
      ${renderSheetSectionLabel('map-pin', 'details:location')}
      ${content}
    </section>
  `
}

function formatDiagnosticBoolean(value: boolean | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value ? 'true' : 'false'
}

function renderDiagnosticsSection(metadata: ImagePhotoMetadata | null) {
  const diagnostic = metadata?.gpsDiagnostic
  const provenance = metadata?.importProvenance

  if (!diagnostic && !provenance && metadata?.sourceRevision == null) return nothing

  const rows = [
    renderOptionalRawDetailRow('GPS status', diagnostic?.status),
    renderOptionalRawDetailRow('Rust EXIF', diagnostic?.rustExifStatus),
    renderOptionalRawDetailRow('XMP', diagnostic?.xmpStatus),
    renderOptionalRawDetailRow('Android extractor', diagnostic?.androidStatus),
    renderOptionalRawDetailRow('Import provenance', diagnostic?.importProvenanceStatus),
    renderOptionalRawDetailRow('Platform', provenance?.platform),
    renderOptionalRawDetailRow('Permission', provenance?.permissionStatus),
    renderOptionalRawDetailRow('Require original', provenance?.requireOriginalStatus),
    renderOptionalRawDetailRow('Original stream', formatDiagnosticBoolean(provenance?.originalStreamUsed)),
    renderOptionalRawDetailRow('Regular fallback', formatDiagnosticBoolean(provenance?.regularStreamFallback)),
    renderOptionalRawDetailRow('URI scheme', provenance?.uriScheme),
    renderOptionalRawDetailRow('URI authority', provenance?.uriAuthority),
    renderOptionalRawDetailRow(
      'Captured at',
      provenance?.capturedAtMs == null ? null : formatDate(provenance.capturedAtMs),
    ),
    renderOptionalRawDetailRow('Source revision', metadata?.sourceRevision ?? provenance?.sourceRevision),
  ].filter((row) => row !== nothing)

  if (rows.length === 0) return nothing

  return html`
    <details class="diagnostics-details">
      <summary>
        ${renderSheetSectionLabel('radar', 'details:more-diagnostics')}
        <cv-icon class="summary-chevron" name="chevron-down" size="s" aria-hidden="true"></cv-icon>
      </summary>
      <div class="detail-grid diagnostics-grid">${rows}</div>
    </details>
  `
}

function renderStateNotice(messageKey: string, tone: 'neutral' | 'loading' = 'neutral') {
  return html`
    <div class="sheet-state" data-tone=${tone}>
      <span class="notice-icon" aria-hidden="true"><cv-icon name="info" size="m"></cv-icon></span>
      <span>${i18n(messageKey as any)}</span>
    </div>
  `
}

function renderPhotoMetadataState(
  state: MobileGalleryInfoSheetRenderState,
  actions: MobileGalleryRenderActions,
) {
  if (state.photoMetadataLoading) {
    return renderStateNotice('details:metadata-loading', 'loading')
  }

  if (
    state.photoMetadataError ||
    (!hasPhotoMetadata(state.photoMetadata) && state.gpsAvailability === 'gps-unavailable-unknown')
  ) {
    return renderStateNotice('details:metadata-unavailable')
  }

  return html`
    ${renderCameraMetadataSection(state.photoMetadata)}
    ${renderLocationSection(state.photoMetadata, state.gpsAvailability, actions)}
  `
}

function renderSystemMetadataSection(currentImage: MobileGalleryImageMeta) {
  return html`
    <section class="sheet-section">
      ${renderSheetSectionLabel('file', 'details:file')}
      <div class="detail-grid file-grid">
        ${renderDetailRow('details:path', currentImage.path, 'path-row')}
        ${renderDetailRow('details:type', currentImage.mimeType)}
        ${renderDetailRow('details:size', formatSizeWithBytes(currentImage.size))}
        ${renderDetailRow('details:created', formatDate(currentImage.createdAt))}
        ${renderDetailRow('details:modified', formatDate(currentImage.lastModified))}
      </div>
    </section>
  `
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
  const sheetDetent = detent === 'expanded' ? detent : 'expanded'

  return html`
    <cv-bottom-sheet
      .open=${open}
      .detent=${sheetDetent}
      detents="expanded"
      no-header
      show-handle
      drag-to-close
      @cv-change=${actions.onInfoSheetSurfaceChange}
    >
      <div class="info-sheet-content" aria-hidden=${String(!open)}>
        <div class="sheet-header">
          ${renderFileIdentity(currentImage)}
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
          ${renderPhotoMetadataState(state, actions)}
          ${renderSystemMetadataSection(currentImage)}
          ${renderDiagnosticsSection(state.photoMetadata)}
        </div>
      </div>
    </cv-bottom-sheet>
  `
}
