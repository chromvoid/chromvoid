import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css, nothing} from 'lit'

import {getLang, i18n} from 'root/i18n'
import {sharedStyles} from 'root/shared/ui/shared-styles'
import {atom} from '@reatom/core'
import {ImagePreview} from 'root/features/media/components/image-preview'
import {AudioArtworkPreview} from 'root/features/media/components/audio-artwork-preview'
import {VideoPreview} from 'root/features/media/components/video-preview'
import {canShareFiles} from 'root/shared/services/share'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {getOpenActionPresentation, isAudioFile, resolveFileFormat} from 'root/utils/file-format-registry'
import {keyboardShortcutsModel} from 'root/shared/keyboard'
import type {FileMediaInfo} from 'root/core/catalog/media-info'

type FileDetails = {
  mode: 'single'
  id: number
  name: string
  isDir: boolean
  size?: number
  path: string
  lastModified?: number
  sourceRevision?: number
  mimeType?: string
  mediaInfo?: FileMediaInfo | null
}

export class FileDetailsPanel extends ReatomLitElement {
  static define() {
    ImagePreview.define()
    AudioArtworkPreview.define()
    VideoPreview.define()
    if (!customElements.get('file-details-panel')) {
      customElements.define('file-details-panel', this as unknown as CustomElementConstructor)
    }
  }

  static get properties() {
    return {
      data: {type: Object},
      externalOpenPending: {type: Boolean, attribute: 'external-open-pending'},
    }
  }
  declare data: FileDetails | null
  declare externalOpenPending: boolean

  private imageDimensions = atom<{width: number; height: number} | null>(null)

  constructor() {
    super()
    this.data = null
    this.externalOpenPending = false
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    if (changedProperties.has('data')) {
      this.imageDimensions.set(null)
    }
  }

  static styles = [
    sharedStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        block-size: 100%;
        contain: content;
        background: var(--glass-bg, var(--cv-color-overlay));
        backdrop-filter: blur(20px) saturate(1.2);
        -webkit-backdrop-filter: blur(20px) saturate(1.2);
        border-inline-start: 1px solid var(--glass-border, var(--cv-alpha-white-10));
        box-shadow:
          var(--glass-shadow, -4px 0 32px var(--cv-alpha-black-35)),
          inset 1px 0 0 var(--cv-alpha-white-4);
        opacity: 0;
        transform: translateX(16px) scale(0.96);
        transition:
          transform var(--cv-duration-normal) var(--cv-easing-decelerate),
          opacity var(--cv-duration-normal) var(--cv-easing-decelerate),
          box-shadow var(--cv-duration-normal) var(--cv-easing-standard);
      }

      :host([open]) {
        opacity: 1;
        transform: translateX(0) scale(1);
        box-shadow:
          var(--glass-shadow, -4px 0 32px var(--cv-alpha-black-35)),
          var(--glass-glow, 0 0 40px var(--cv-color-accent-ring)),
          inset 1px 0 0 var(--cv-alpha-white-4);
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--app-spacing-3) var(--app-spacing-4);
        border-block-end: 1px solid var(--cv-color-border-muted);
        background: var(--cv-color-surface-secondary-glass-strong);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }

      .panel-title {
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-semibold);
        color: var(--cv-color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .close-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--app-spacing-2);
        background: transparent;
        border: none;
        border-radius: var(--cv-radius-2);
        color: var(--cv-color-text-muted);
        cursor: pointer;
        transition: background-color var(--cv-duration-fast) var(--cv-easing-standard);

        &:hover {
          background: var(--cv-color-hover);
          color: var(--cv-color-text);
        }
      }

      .preview-area {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--app-spacing-6);
        background: linear-gradient(180deg, var(--cv-color-accent-surface) 0%, transparent 100%);
        border-block-end: 1px solid var(--cv-color-border-muted);
      }

      .preview-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        inline-size: 80px;
        block-size: 80px;
        border-radius: var(--cv-radius-4);
        background: var(--cv-color-surface-tertiary-glass);
        color: var(--cv-color-accent);
        font-size: 40px;
      }

      .details-audio-artwork {
        inline-size: 100%;
        max-inline-size: 320px;
        block-size: 250px;
      }

      .file-info {
        padding: var(--app-spacing-4);
        border-block-end: 1px solid var(--cv-color-border-muted);
      }

      .file-name {
        font-size: var(--cv-font-size-lg);
        font-weight: var(--cv-font-weight-semibold);
        color: var(--cv-color-text);
        word-break: break-word;
        margin-block-end: var(--app-spacing-2);
      }

      .file-meta {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        font-size: var(--cv-font-size-sm);
        color: var(--cv-color-text-muted);
      }

      .file-type-badge {
        display: inline-flex;
        align-items: center;
        padding: var(--app-spacing-1) var(--app-spacing-2);
        background: var(--cv-color-accent-surface);
        border-radius: var(--cv-radius-2);
        font-size: var(--cv-font-size-xs);
        font-weight: var(--cv-font-weight-medium);
        color: var(--cv-color-accent);
        text-transform: uppercase;
      }

      .actions-section {
        padding: var(--app-spacing-4);
        border-block-end: 1px solid var(--cv-color-border-muted);
      }

      .section-label {
        font-size: var(--cv-font-size-xs);
        font-weight: var(--cv-font-weight-semibold);
        color: var(--cv-color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-block-end: var(--app-spacing-3);
      }

      .actions-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--app-spacing-2);
      }

      .action-label {
        display: inline-flex;
        align-items: center;
        gap: var(--app-spacing-2);
      }

      .action-shortcut {
        font-size: var(--cv-font-size-xs);
        color: var(--cv-color-text-muted);
        padding: 2px 6px;
        border-radius: var(--cv-radius-1);
        border: 1px solid var(--cv-color-border);
        background: var(--cv-color-surface-secondary-glass);
        font-family: var(
          --cv-font-family-code,
          ui-monospace,
          SFMono-Regular,
          Menlo,
          Monaco,
          Consolas,
          'Liberation Mono',
          monospace
        );
      }
      .action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--app-spacing-2);
        padding: var(--app-spacing-3);
        background: var(--cv-color-surface-tertiary-glass);
        border: 1px solid var(--cv-color-border-muted);
        border-radius: var(--cv-radius-3);
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-medium);
        cursor: pointer;
        transition: background-color var(--cv-duration-fast) var(--cv-easing-standard);

        &:disabled {
          opacity: 0.6;
          cursor: default;
        }

        &:hover {
          background: var(--cv-color-hover);
          border-color: var(--cv-color-border);
        }

        &.danger:hover {
          background: var(--cv-color-danger-surface);
          border-color: var(--cv-color-danger);
          color: var(--cv-color-danger);
        }
      }

      .details-section {
        padding: var(--app-spacing-4);
        flex: 1;
      }

      .details-list {
        display: grid;
        gap: var(--app-spacing-3);
      }

      .detail-row {
        display: grid;
        grid-template-columns: 100px 1fr;
        gap: var(--app-spacing-3);
        font-size: var(--cv-font-size-sm);
      }

      .detail-label {
        color: var(--cv-color-text-muted);
      }

      .detail-value {
        color: var(--cv-color-text);
        word-break: break-all;
      }

      @media (max-width: 480px) {
        .actions-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ]

  protected render() {
    const d = this.data
    if (!d || d.mode !== 'single') return nothing

    const format = resolveFileFormat(d)
    const openPresentation = getOpenActionPresentation(format)
    const ext = format.displayExtension
    const fileType = i18n(format.fileTypeLabelKey)
    const icon = format.icon
    const showImagePreview = format.openBehavior.kind === 'gallery'
    const showVideoPreview = format.openBehavior.kind === 'video'
    const showAudioArtworkPreview = !d.isDir && isAudioFile(d.name, d.mimeType)
    const isMobile = getRuntimeCapabilities().mobile
    const platform = getRuntimeCapabilities().platform
    const primaryOpenUsesSystem =
      format.openBehavior.kind === 'preview' &&
      format.openBehavior.mode === 'fallback' &&
      (platform === 'macos' || platform === 'android')
    const showShareButton = isMobile && canShareFiles()
    const openButtonLabel =
      primaryOpenUsesSystem && this.externalOpenPending
        ? i18n('file-manager:preparing-file')
        : i18n(openPresentation.labelKey)
    const externalOpenButtonLabel = this.externalOpenPending
      ? i18n('file-manager:preparing-file')
      : i18n('action:open-external')
    const openExternalShortcutLabel = keyboardShortcutsModel.label('files.openExternal')

    return html`
      <div class="panel-header">
        <span class="panel-title">${i18n('details:title')}</span>
        <cv-button unstyled class="close-btn" @click=${this.handleClose} aria-label=${i18n('button:close')}>
          <cv-icon name="x" size="s"></cv-icon>
        </cv-button>
      </div>

      <div class="preview-area">
        ${showImagePreview
          ? html`
              <image-preview
                .fileId=${d.id}
                .fileName=${d.name}
                .mimeType=${d.mimeType}
                .lastModified=${d.lastModified}
                @dimensions-loaded=${this.handleDimensionsLoaded}
                @click=${this.handleImageDoubleClick}
                @dblclick=${this.handleImageDoubleClick}
              ></image-preview>
            `
          : showVideoPreview
            ? html`
                <video-preview
                  .fileId=${d.id}
                  .fileName=${d.name}
                  .mimeType=${d.mimeType}
                  .mediaInfo=${d.mediaInfo}
                  .lastModified=${d.lastModified}
                  .sourceSize=${d.size}
                  @open-video=${this.handleVideoOpen}
                ></video-preview>
              `
            : showAudioArtworkPreview
              ? html`
                  <audio-artwork-preview
                    class="details-audio-artwork"
                    .fileId=${d.id}
                    .fileName=${d.name}
                    .mimeType=${d.mimeType}
                    .lastModified=${d.lastModified}
                    .sourceSize=${d.size}
                    .sourceRevision=${d.sourceRevision}
                    variant="preview-image"
                    .fallbackIcon=${icon}
                  ></audio-artwork-preview>
                `
            : html`
                <div class="preview-icon">
                  <cv-icon name=${icon}></cv-icon>
                </div>
              `}
      </div>

      <div class="file-info">
        <div class="file-name">${d.name}</div>
        <div class="file-meta">
          ${ext ? html`<span class="file-type-badge">${ext}</span>` : ''}
          <span>${fileType}</span>
          <span>•</span>
          <span>${this.formatSize(d.size)}</span>
        </div>
      </div>

      <div class="actions-section">
        <div class="section-label">${i18n('details:actions')}</div>
        <div class="actions-grid">
          <cv-button unstyled
            class="action-btn"
            ?disabled=${primaryOpenUsesSystem && this.externalOpenPending}
            @click=${() => this.handleAction('open')}
          >
            ${primaryOpenUsesSystem && this.externalOpenPending
              ? html`<cv-spinner slot="prefix" size="xs" label=${openButtonLabel}></cv-spinner>`
              : html`<cv-icon slot="prefix" name=${openPresentation.icon} size="s"></cv-icon>`}
            <span>${openButtonLabel}</span>
          </cv-button>
          <cv-button unstyled
            class="action-btn"
            ?disabled=${this.externalOpenPending}
            @click=${() => this.handleAction('open-external')}
          >
            ${this.externalOpenPending
              ? html`<cv-spinner slot="prefix" size="xs" label=${externalOpenButtonLabel}></cv-spinner>`
              : html`<cv-icon slot="prefix" name="box-arrow-up-right" size="s"></cv-icon>`}
            <span class="action-label">${externalOpenButtonLabel}</span>
            ${openExternalShortcutLabel
              ? html`<span slot="suffix" class="action-shortcut">${openExternalShortcutLabel}</span>`
              : nothing}
          </cv-button>
          <cv-button unstyled class="action-btn" @click=${() => this.handleAction('download')}>
            <cv-icon slot="prefix" name="download" size="s"></cv-icon>
            <span>${i18n('action:download')}</span>
          </cv-button>
          <cv-button unstyled class="action-btn" @click=${() => this.handleAction('rename')}>
            <cv-icon slot="prefix" name="pencil" size="s"></cv-icon>
            <span>${i18n('action:rename')}</span>
          </cv-button>
          <cv-button unstyled class="action-btn" @click=${this.handleMoveAction}>
            <cv-icon slot="prefix" name="folder-symlink" size="s"></cv-icon>
            <span>${i18n('file-manager:move:action')}</span>
          </cv-button>
          <cv-button unstyled class="action-btn" @click=${() => this.handleAction('copy')}>
            <cv-icon slot="prefix" name="copy" size="s"></cv-icon>
            <span>${i18n('action:copy')}</span>
          </cv-button>
          <cv-button unstyled class="action-btn danger" @click=${() => this.handleAction('delete')}>
            <cv-icon slot="prefix" name="trash" size="s"></cv-icon>
            <span>${i18n('action:delete')}</span>
          </cv-button>
          ${showShareButton
            ? html`
                <cv-button unstyled class="action-btn" @click=${() => this.handleAction('share')}>
                  <cv-icon slot="prefix" name="share-2" size="s"></cv-icon>
                  <span>${i18n('action:share')}</span>
                </cv-button>
              `
            : nothing}
        </div>
      </div>

      <div class="details-section">
        <div class="section-label">${i18n('details:metadata')}</div>
        <div class="details-list">
          <div class="detail-row">
            <span class="detail-label">${i18n('details:path')}</span>
            <span class="detail-value">${d.path}</span>
          </div>
          ${d.lastModified
            ? html`
                <div class="detail-row">
                  <span class="detail-label">${i18n('details:modified')}</span>
                  <span class="detail-value">${this.formatDate(d.lastModified)}</span>
                </div>
              `
            : ''}
          ${typeof d.size === 'number'
            ? html`
                <div class="detail-row">
                  <span class="detail-label">${i18n('details:size')}</span>
                  <span class="detail-value"
                    >${this.formatSize(d.size)} (${d.size.toLocaleString(getLang())}
                    ${i18n('details:bytes')})</span
                  >
                </div>
              `
            : ''}
          ${this.imageDimensions()
            ? html`
                <div class="detail-row">
                  <span class="detail-label">${i18n('details:dimensions')}</span>
                  <span class="detail-value"
                    >${this.imageDimensions()!.width} × ${this.imageDimensions()!.height}</span
                  >
                </div>
              `
            : ''}
        </div>
      </div>
    `
  }

  private handleClose = () => {
    this.dispatchEvent(new CustomEvent('close', {bubbles: true, composed: true}))
  }

  private handleAction = (action: string) => {
    const fileId = this.data?.id
    if (!fileId) return
    this.dispatchEvent(
      new CustomEvent('action', {
        detail: {action, fileId},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleMoveAction() {
    this.handleAction('move')
  }

  private handleDimensionsLoaded = (e: CustomEvent) => {
    this.imageDimensions.set(e.detail)
  }

  private handleImageDoubleClick = () => {
    const fileId = this.data?.id
    if (!fileId) return
    this.dispatchEvent(
      new CustomEvent('open-gallery', {
        detail: {fileId},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleVideoOpen = () => {
    const d = this.data
    if (!d) return
    this.dispatchEvent(
      new CustomEvent('open-video', {
        detail: {fileId: d.id, fileName: d.name},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private formatSize(bytes?: number): string {
    if (!bytes || bytes <= 0) return '—'
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i]
  }

  private formatDate(timestamp?: number): string {
    if (!timestamp) return '—'
    return new Date(timestamp).toLocaleDateString(getLang(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
}
