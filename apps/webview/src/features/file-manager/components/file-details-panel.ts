import {state} from '@statx/core'
import {XLitElement} from '@statx/lit'

import {css, html, nothing} from 'lit'

import {getLang, i18n} from 'root/i18n'
import {sharedStyles} from 'root/shared/ui/shared-styles'
import {isImageFile, isVideoFile} from 'root/utils/mime-type'
import {ImagePreview} from 'root/features/media/components/image-preview'
import {VideoPreview} from 'root/features/media/components/video-preview'
import {canShareFiles} from 'root/shared/services/share'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'

type FileDetails = {
  mode: 'single'
  id: number
  name: string
  isDir: boolean
  size?: number
  path: string
  lastModified?: number
}

export class FileDetailsPanel extends XLitElement {
  static define() {
    ImagePreview.define()
    VideoPreview.define()
    if (!customElements.get('file-details-panel')) {
      customElements.define('file-details-panel', this as unknown as CustomElementConstructor)
    }
  }

  static get properties() {
    return {
      data: {type: Object},
    }
  }
  declare data: FileDetails | null

  private imageDimensions = state<{width: number; height: number} | null>(null)

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
        background: var(--glass-bg, color-mix(in oklch, var(--cv-color-bg) 35%, transparent));
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
          var(--glass-glow, 0 0 40px color-mix(in oklch, var(--cv-color-accent) 8%, transparent)),
          inset 1px 0 0 var(--cv-alpha-white-4);
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--app-spacing-3) var(--app-spacing-4);
        border-block-end: 1px solid var(--cv-color-border-muted);
        background: color-mix(in oklch, var(--cv-color-surface-2) 80%, transparent);
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
        background: linear-gradient(
          180deg,
          color-mix(in oklch, var(--cv-color-accent) 5%, transparent) 0%,
          transparent 100%
        );
        border-block-end: 1px solid var(--cv-color-border-muted);
      }

      .preview-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        inline-size: 80px;
        block-size: 80px;
        border-radius: var(--cv-radius-4);
        background: color-mix(in oklch, var(--cv-color-surface-3) 60%, transparent);
        color: var(--cv-color-accent);
        font-size: 40px;
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
        background: color-mix(in oklch, var(--cv-color-accent) 15%, transparent);
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
        background: color-mix(in oklch, var(--cv-color-surface-2) 70%, transparent);
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
        background: color-mix(in oklch, var(--cv-color-surface-3) 60%, transparent);
        border: 1px solid var(--cv-color-border-muted);
        border-radius: var(--cv-radius-3);
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-medium);
        cursor: pointer;
        transition: background-color var(--cv-duration-fast) var(--cv-easing-standard);

        &:hover {
          background: var(--cv-color-hover);
          border-color: var(--cv-color-border);
        }

        &.danger:hover {
          background: color-mix(in oklch, var(--cv-color-danger) 15%, transparent);
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

    const ext = this.getFileExtension(d.name)
    const fileType = this.getFileType(d.name, d.isDir)
    const icon = this.getFileIcon(d.name)
    const showImagePreview = isImageFile(d.name)
    const showVideoPreview = isVideoFile(d.name)
    const isMobile = getRuntimeCapabilities().mobile
    const showShareButton = isMobile && canShareFiles()

    return html`
      <div class="panel-header">
        <span class="panel-title">${i18n('details:title' as any)}</span>
        <button class="close-btn" @click=${this.handleClose} aria-label=${i18n('button:close' as any)}>
          <cv-icon name="x" size="s"></cv-icon>
        </button>
      </div>

      <div class="preview-area">
        ${showImagePreview
          ? html`
              <image-preview
                .fileId=${d.id}
                .fileName=${d.name}
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
                  @open-video=${this.handleVideoOpen}
                ></video-preview>
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
        <div class="section-label">${i18n('details:actions' as any)}</div>
        <div class="actions-grid">
          <button class="action-btn" @click=${() => this.handleAction('open-external')}>
            <cv-icon name="box-arrow-up-right" size="s"></cv-icon>
            <span class="action-label">
              ${i18n('action:open-external' as any)}
              <span class="action-shortcut">Ctrl+O</span>
            </span>
          </button>
          <button class="action-btn" @click=${() => this.handleAction('download')}>
            <cv-icon name="download" size="s"></cv-icon>
            <span>${i18n('action:download' as any)}</span>
          </button>
          <button class="action-btn" @click=${() => this.handleAction('rename')}>
            <cv-icon name="pencil" size="s"></cv-icon>
            <span>${i18n('action:rename' as any)}</span>
          </button>
          <button class="action-btn" @click=${() => this.handleAction('copy')}>
            <cv-icon name="copy" size="s"></cv-icon>
            <span>${i18n('action:copy' as any)}</span>
          </button>
          <button class="action-btn danger" @click=${() => this.handleAction('delete')}>
            <cv-icon name="trash" size="s"></cv-icon>
            <span>${i18n('action:delete' as any)}</span>
          </button>
          ${showShareButton
            ? html`
                <button class="action-btn" @click=${() => this.handleAction('share')}>
                  <cv-icon name="share" size="s"></cv-icon>
                  <span>${i18n('action:share' as any)}</span>
                </button>
              `
            : nothing}
        </div>
      </div>

      <div class="details-section">
        <div class="section-label">${i18n('details:metadata' as any)}</div>
        <div class="details-list">
          <div class="detail-row">
            <span class="detail-label">${i18n('details:path' as any)}</span>
            <span class="detail-value">${d.path}</span>
          </div>
          ${d.lastModified
            ? html`
                <div class="detail-row">
                  <span class="detail-label">${i18n('details:modified' as any)}</span>
                  <span class="detail-value">${this.formatDate(d.lastModified)}</span>
                </div>
              `
            : ''}
          ${typeof d.size === 'number'
            ? html`
                <div class="detail-row">
                  <span class="detail-label">${i18n('details:size' as any)}</span>
                  <span class="detail-value"
                    >${this.formatSize(d.size)} (${d.size.toLocaleString(getLang())}
                    ${i18n('details:bytes' as any)})</span
                  >
                </div>
              `
            : ''}
          ${this.imageDimensions()
            ? html`
                <div class="detail-row">
                  <span class="detail-label">${i18n('details:dimensions' as any)}</span>
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

  private getFileExtension(name: string): string {
    const lastDot = name.lastIndexOf('.')
    if (lastDot === -1 || lastDot === 0) return ''
    return name.slice(lastDot + 1).toLowerCase()
  }

  private getFileType(name: string, isDir: boolean): string {
    if (isDir) return i18n('node:dir')

    const ext = this.getFileExtension(name)
    const typeMap: Record<string, string> = {
      pdf: 'file-type:document',
      doc: 'file-type:document',
      docx: 'file-type:document',
      xls: 'file-type:spreadsheet',
      xlsx: 'file-type:spreadsheet',
      ppt: 'file-type:presentation',
      pptx: 'file-type:presentation',
      txt: 'file-type:text',
      md: 'file-type:text',
      json: 'file-type:code',
      xml: 'file-type:code',
      html: 'file-type:code',
      css: 'file-type:code',
      js: 'file-type:code',
      ts: 'file-type:code',
      png: 'file-type:image',
      jpg: 'file-type:image',
      jpeg: 'file-type:image',
      gif: 'file-type:image',
      svg: 'file-type:image',
      webp: 'file-type:image',
      mp3: 'file-type:audio',
      mp4: 'file-type:video',
      zip: 'file-type:archive',
      rar: 'file-type:archive',
      '7z': 'file-type:archive',
      password: 'file-type:password',
      note: 'file-type:secure-note',
      seed: 'file-type:seed-phrase',
      'private-key': 'file-type:private-key',
    }
    return i18n((typeMap[ext] ?? 'node:file') as any)
  }

  private getFileIcon(name: string): string {
    const ext = this.getFileExtension(name)
    const iconMap: Record<string, string> = {
      pdf: 'file-earmark-pdf',
      doc: 'file-earmark-word',
      docx: 'file-earmark-word',
      xls: 'file-earmark-excel',
      xlsx: 'file-earmark-excel',
      ppt: 'file-earmark-ppt',
      pptx: 'file-earmark-ppt',
      txt: 'file-earmark-text',
      md: 'file-earmark-text',
      json: 'file-earmark-code',
      xml: 'file-earmark-code',
      html: 'file-earmark-code',
      css: 'file-earmark-code',
      js: 'file-earmark-code',
      ts: 'file-earmark-code',
      png: 'file-earmark-image',
      jpg: 'file-earmark-image',
      jpeg: 'file-earmark-image',
      gif: 'file-earmark-image',
      svg: 'file-earmark-image',
      webp: 'file-earmark-image',
      mp3: 'file-earmark-music',
      mp4: 'file-earmark-play',
      zip: 'file-earmark-zip',
      rar: 'file-earmark-zip',
      '7z': 'file-earmark-zip',
      password: 'key',
      note: 'file-earmark-lock',
      seed: 'shield-lock',
      'private-key': 'key-fill',
    }
    return iconMap[ext] || 'file-earmark'
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
