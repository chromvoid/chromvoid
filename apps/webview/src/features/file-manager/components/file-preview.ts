import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {canShareFiles} from 'root/shared/services/share'
import {animationStyles} from 'root/shared/ui/shared-styles'

import {FilePreviewModel, type FilePreviewData} from './file-preview.model'

export class FilePreview extends ReatomLitElement {
  static define() {
    if (!customElements.get('file-preview')) {
      customElements.define('file-preview', this as unknown as CustomElementConstructor)
    }
  }

  static get properties() {
    return {
      data: {type: Object},
      externalOpenPending: {type: Boolean, attribute: 'external-open-pending'},
      sharePending: {type: Boolean, attribute: 'share-pending'},
    }
  }

  declare data: FilePreviewData | null
  declare externalOpenPending: boolean
  declare sharePending: boolean

  private readonly model = new FilePreviewModel()
  private readonly keyboardHandler = this.handleKeyboard.bind(this)

  static styles = [
    animationStyles,
    css`
      :host {
        display: block;
        --file-preview-overlay-padding-top: max(var(--app-spacing-4), var(--safe-area-top, 0px));
        --file-preview-overlay-padding-right: max(var(--app-spacing-4), var(--safe-area-right, 0px));
        --file-preview-overlay-padding-bottom: max(
          var(--app-spacing-4),
          var(--safe-area-bottom-active, var(--safe-area-bottom, 0px))
        );
        --file-preview-overlay-padding-left: max(var(--app-spacing-4), var(--safe-area-left, 0px));
      }

      .overlay {
        box-sizing: border-box;
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--file-preview-overlay-padding-top) var(--file-preview-overlay-padding-right)
          var(--file-preview-overlay-padding-bottom) var(--file-preview-overlay-padding-left);
        background: var(--cv-alpha-black-85);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        animation: fadeIn 0.2s ease-out;
      }

      .panel {
        inline-size: min(960px, 100%);
        max-block-size: min(86vh, 920px);
        position: relative;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: var(--cv-radius-4);
        border: 1px solid var(--cv-alpha-white-12);
        background:
          linear-gradient(180deg, var(--cv-alpha-white-8), transparent 28%),
          var(--cv-color-surface-primary, var(--cv-color-surface));
        box-shadow: 0 24px 80px var(--cv-alpha-black-45);
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--app-spacing-3);
        padding: var(--app-spacing-4);
        border-bottom: 1px solid var(--cv-color-border-muted);
        background: var(--cv-color-surface-secondary-glass-strong);
      }

      .title-wrap {
        min-inline-size: 0;
        display: grid;
        gap: 4px;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
      }

      .eyebrow {
        font-size: var(--cv-font-size-xs);
        font-weight: var(--cv-font-weight-semibold);
        color: var(--cv-color-text-muted);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .file-name {
        font-size: var(--cv-font-size-lg);
        font-weight: var(--cv-font-weight-semibold);
        color: var(--cv-color-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .close-btn,
      .action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--app-spacing-2);
        min-height: 40px;
        padding: 0 var(--app-spacing-3);
        border-radius: var(--cv-radius-2);
        border: 1px solid var(--cv-color-border-muted);
        background: var(--cv-color-surface-tertiary-glass);
        color: var(--cv-color-text);
        cursor: pointer;

        &:disabled {
          opacity: 0.6;
          cursor: default;
        }
      }

      .close-btn {
        inline-size: 40px;
        padding: 0;
      }

      .icon-btn {
        inline-size: 40px;
        padding: 0;
      }

      .body {
        flex: 1;
        min-block-size: 0;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--app-spacing-5);
        overflow: auto;
      }

      .loading-spinner {
        width: 48px;
        height: 48px;
        border: 3px solid var(--cv-alpha-white-20);
        border-top-color: var(--cv-color-accent);
        border-radius: 999px;
        animation: spin 0.8s linear infinite;
      }

      .text-preview {
        inline-size: 100%;
        block-size: 100%;
        min-block-size: 320px;
        margin: 0;
        padding: var(--app-spacing-4);
        border-radius: var(--cv-radius-3);
        background: var(--cv-color-surface-secondary-glass);
        border: 1px solid var(--cv-color-border-muted);
        color: var(--cv-color-text);
        font: 500 var(--cv-font-size-sm) / 1.65
          var(
            --cv-font-family-code,
            ui-monospace,
            SFMono-Regular,
            Menlo,
            Monaco,
            Consolas,
            'Liberation Mono',
            monospace
          );
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .image-preview {
        max-inline-size: 100%;
        max-block-size: 100%;
        object-fit: contain;
        border-radius: var(--cv-radius-3);
        background: var(--cv-alpha-black-20);
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

      .audio-preview {
        inline-size: min(720px, 100%);
      }

      .fallback-card {
        inline-size: min(520px, 100%);
        display: grid;
        gap: var(--app-spacing-4);
        justify-items: start;
        padding: var(--app-spacing-5);
        border-radius: var(--cv-radius-4);
        background: var(--cv-color-surface-secondary-glass);
        border: 1px solid var(--cv-color-border-muted);
      }

      .fallback-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        inline-size: 56px;
        block-size: 56px;
        border-radius: 999px;
        background: var(--cv-color-accent-surface);
        color: var(--cv-color-accent);
      }

      .fallback-title {
        font-size: var(--cv-font-size-xl);
        font-weight: var(--cv-font-weight-semibold);
        color: var(--cv-color-text);
      }

      .fallback-copy {
        color: var(--cv-color-text-muted);
        line-height: 1.6;
      }

      .fallback-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--app-spacing-2);
      }

      @media (max-width: 720px) {
        :host {
          --file-preview-overlay-padding-top: max(var(--app-spacing-4), var(--safe-area-top, 0px));
          --file-preview-overlay-padding-right: var(--safe-area-right, 0px);
          --file-preview-overlay-padding-bottom: var(--safe-area-bottom-active, var(--safe-area-bottom, 0px));
          --file-preview-overlay-padding-left: var(--safe-area-left, 0px);
        }

        .overlay {
          align-items: stretch;
        }

        .panel {
          inline-size: 100%;
          max-block-size: none;
          border-radius: 0;
        }

        .body {
          padding: var(--app-spacing-4);
        }

        .fallback-card {
          inline-size: 100%;
        }
      }
    `,
  ]

  constructor() {
    super()
    this.data = null
    this.externalOpenPending = false
    this.sharePending = false
  }

  connectedCallback() {
    super.connectedCallback()
    document.addEventListener('keydown', this.keyboardHandler)
    this.model.setPreview(this.data)
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.keyboardHandler)
    this.model.cleanup()
    super.disconnectedCallback()
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    if (changedProperties.has('data')) {
      this.model.setPreview(this.data)
    }
  }

  private handleKeyboard(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      this.handleClose()
    }
  }

  private handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      this.handleClose()
    }
  }

  private handleClose() {
    this.dispatchEvent(new CustomEvent('close', {bubbles: true, composed: true}))
  }

  private handleAction(action: 'open-external' | 'share' | 'download') {
    if (!this.data) return

    this.dispatchEvent(
      new CustomEvent('action', {
        detail: {action, fileId: this.data.fileId},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleImageError(e: Event) {
    const image = e.currentTarget as HTMLImageElement
    this.model.handleImageRenderError(image.currentSrc || image.src)
  }

  private handleShareClick() {
    this.handleAction('share')
  }

  private shouldShowHeaderShare(): boolean {
    const caps = getRuntimeCapabilities()
    return caps.mobile && caps.supports_native_share && canShareFiles() && this.model.displayMode() !== 'fallback'
  }

  private renderFallbackActions() {
    const caps = getRuntimeCapabilities()
    const showShare = !caps.supports_open_external && canShareFiles()
    const primaryAction = caps.supports_open_external
      ? {
          action: 'open-external' as const,
          label: this.externalOpenPending
            ? i18n('file-manager:preparing-file')
            : i18n('file-manager:open-in-system'),
          icon: this.externalOpenPending ? null : 'box-arrow-up-right',
        }
      : showShare
        ? {
            action: 'share' as const,
            label: this.sharePending ? i18n('file-manager:preparing-file') : i18n('button:share'),
            icon: this.sharePending ? null : 'share-2',
          }
        : null
    const primaryPending =
      primaryAction?.action === 'open-external'
        ? this.externalOpenPending
        : primaryAction?.action === 'share'
          ? this.sharePending
          : false

    return html`
      <div class="fallback-actions">
        ${primaryAction
          ? html`
              <cv-button unstyled
                class="action-btn"
                ?disabled=${primaryPending}
                @click=${() => this.handleAction(primaryAction.action)}
              >
                ${primaryAction.icon
                  ? html`<cv-icon slot="prefix" name=${primaryAction.icon} size="s"></cv-icon>`
                  : html`<cv-spinner slot="prefix" size="xs" label=${primaryAction.label}></cv-spinner>`}
                <span>${primaryAction.label}</span>
              </cv-button>
            `
          : nothing}
        <cv-button unstyled class="action-btn" @click=${() => this.handleAction('download')}>
          <cv-icon slot="prefix" name="download" size="s"></cv-icon>
          <span>${i18n('button:download')}</span>
        </cv-button>
      </div>
    `
  }

  private renderBody() {
    const loadingState = this.model.loadingState()
    if (loadingState === 'loading') {
      return html`<div class="loading-spinner" aria-hidden="true"></div>`
    }

    const mode = this.model.displayMode()
    switch (mode) {
      case 'text':
        return html`<pre class="text-preview">${this.model.textContent()}</pre>`
      case 'audio':
        return html`
          <audio
            class="audio-preview"
            src=${this.model.mediaUrl() ?? ''}
            controls
            preload="metadata"
          ></audio>
        `
      case 'image':
        return html`
          <img
            class="image-preview"
            src=${this.model.mediaUrl() ?? ''}
            alt=${this.data?.fileName ?? i18n('button:preview')}
            @error=${this.handleImageError}
          />
        `
      default:
        return html`
          <div class="fallback-card">
            <div class="fallback-icon">
              <cv-icon name="file-earmark" size="l"></cv-icon>
            </div>
            <div class="fallback-title">${i18n('file-preview:fallback-title')}</div>
            <div class="fallback-copy">${i18n(this.model.fallbackReasonKey())}</div>
            ${this.renderFallbackActions()}
          </div>
        `
    }
  }

  private renderSharePendingOverlay() {
    if (!this.sharePending) return nothing
    const label = i18n('file-manager:preparing-file')

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
    if (!this.data) return nothing

    const eyebrow =
      this.model.displayMode() === 'fallback'
        ? i18n('file-preview:fallback-eyebrow')
        : i18n('button:preview')
    const showHeaderShare = this.shouldShowHeaderShare()

    return html`
      <div
        class="overlay"
        role="dialog"
        aria-modal="true"
        aria-label=${this.data.fileName}
        @click=${this.handleOverlayClick}
      >
        <div class="panel">
          <div class="header">
            <div class="title-wrap">
              <div class="eyebrow">${eyebrow}</div>
              <div class="file-name">${this.data.fileName}</div>
            </div>
            <div class="header-actions">
              ${showHeaderShare
                ? html`
                    <cv-button unstyled
                      class="action-btn icon-btn"
                      ?disabled=${this.sharePending}
                      @click=${this.handleShareClick}
                      aria-label=${this.sharePending
                        ? i18n('file-manager:preparing-file')
                        : i18n('action:share')}
                    >
                      ${this.sharePending
                        ? html`<cv-spinner size="xs" label=${i18n('file-manager:preparing-file')}></cv-spinner>`
                        : html`<cv-icon name="share-2" size="m"></cv-icon>`}
                    </cv-button>
                  `
                : nothing}
              <cv-button unstyled class="close-btn" @click=${this.handleClose} aria-label=${i18n('button:close')}>
                <cv-icon name="x" size="m"></cv-icon>
              </cv-button>
            </div>
          </div>
          <div class="body" aria-busy=${String(this.sharePending)}>
            ${this.renderBody()} ${this.renderSharePendingOverlay()}
          </div>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'file-preview': FilePreview
  }
}
