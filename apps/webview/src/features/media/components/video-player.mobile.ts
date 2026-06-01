import {css, nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'
import {i18n} from 'root/i18n'
import {animationStyles} from 'root/shared/ui/shared-styles'
import {canShareFiles, shareFile} from 'root/shared/services/share'
import {VideoPlayerBase} from './video-player.base'

export class VideoPlayerMobile extends VideoPlayerBase {
  static define() {
    if (!customElements.get('video-player-mobile')) {
      customElements.define('video-player-mobile', this)
    }
  }

  static styles = [
    animationStyles,
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

      .file-name {
        flex: 1;
        color: var(--cv-alpha-white-70);
        font-size: var(--cv-font-size-sm);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding: 0 var(--app-spacing-3);
        text-align: center;
      }

      .main {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .player-video {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }

      .loading-spinner {
        width: 48px;
        height: 48px;
        border: 3px solid var(--cv-alpha-white-30);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      .fallback-card {
        inline-size: min(520px, calc(100% - var(--app-spacing-6)));
        display: grid;
        gap: var(--app-spacing-4);
        justify-items: center;
        padding: var(--app-spacing-5);
        border: 1px solid var(--cv-alpha-white-20);
        border-radius: var(--cv-radius-4);
        background: var(--cv-alpha-white-10);
        color: white;
        text-align: center;
      }

      .fallback-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        inline-size: 56px;
        block-size: 56px;
        border-radius: var(--cv-radius-3);
        background: var(--cv-alpha-white-15);
      }

      .fallback-title {
        font-size: var(--cv-font-size-lg);
        font-weight: var(--cv-font-weight-semibold);
      }

      .fallback-copy {
        color: var(--cv-alpha-white-70);
        line-height: 1.55;
      }

      .fallback-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: var(--app-spacing-2);
      }

      .fallback-button {
        min-height: 40px;
        display: inline-flex;
        align-items: center;
        gap: var(--app-spacing-2);
        padding: 0 var(--app-spacing-3);
        border: 1px solid var(--cv-alpha-white-20);
        border-radius: var(--cv-radius-2);
        background: var(--cv-alpha-white-10);
        color: white;
        cursor: pointer;
      }

      .footer {
        padding: var(--app-spacing-3);
        padding-bottom: max(var(--app-spacing-4), env(safe-area-inset-bottom));
      }
    `,
  ]

  private handleShare() {
    void shareFile(this.fileId, this.fileName)
  }

  protected render() {
    if (!this.open) return nothing

    const url = this.videoUrl()
    const isLoading = this.loading()
    const fallbackLimited = this.fallbackLimited()
    const errorMessage = this.errorMessage()
    const nativeVideo = this.sourceKind() === 'android-native-video'
    const showShare = canShareFiles()

    if (nativeVideo && !isLoading && !fallbackLimited && !errorMessage) {
      return nothing
    }

    return html`
      <div
        class="overlay"
        role="dialog"
        aria-modal="true"
        aria-label=${this.fileName || i18n('media:video-player' as any)}
      >
        <div class="header">
          <cv-button
            unstyled
            class="close-button"
            @click=${this.close}
            aria-label=${i18n('button:close' as any)}
          >
            <cv-icon name="x" size="m"></cv-icon>
          </cv-button>
          <span class="file-name">${this.fileName}</span>
          <div class="header-actions">
            ${showShare
              ? html`
                  <cv-button
                    unstyled
                    class="share-button"
                    @click=${this.handleShare}
                    aria-label=${i18n('action:share' as any)}
                  >
                    <cv-icon name="share-2" size="m"></cv-icon>
                  </cv-button>
                `
              : nothing}
          </div>
        </div>

        <div class="main">
          ${isLoading
            ? html`<div class="loading-spinner"></div>`
            : fallbackLimited
              ? html`
                  <div class="fallback-card">
                    <div class="fallback-icon">
                      <cv-icon name="file-earmark-play" size="l"></cv-icon>
                    </div>
                    <div class="fallback-title">${i18n('media:fallback-limited-title' as any)}</div>
                    <div class="fallback-copy">${i18n('media:fallback-limited-copy' as any)}</div>
                    <div class="fallback-actions">
                      <cv-button unstyled class="fallback-button" @click=${this.handleOpenExternal}>
                        <cv-icon slot="prefix" name="box-arrow-up-right" size="s"></cv-icon>
                        <span>${i18n('action:open-external' as any)}</span>
                      </cv-button>
                      <cv-button unstyled class="fallback-button" @click=${this.handleDownload}>
                        <cv-icon slot="prefix" name="download" size="s"></cv-icon>
                        <span>${i18n('action:download' as any)}</span>
                      </cv-button>
                    </div>
                  </div>
                `
              : errorMessage
                ? html`
                    <div class="fallback-card">
                      <div class="fallback-icon">
                        <cv-icon name="file-earmark-play" size="l"></cv-icon>
                      </div>
                      <div class="fallback-title">${errorMessage}</div>
                      <div class="fallback-copy">${i18n('media:video-error-copy' as any)}</div>
                      <div class="fallback-actions">
                        <cv-button unstyled class="fallback-button" @click=${this.handleOpenExternal}>
                          <cv-icon slot="prefix" name="box-arrow-up-right" size="s"></cv-icon>
                          <span>${i18n('action:open-external' as any)}</span>
                        </cv-button>
                        <cv-button unstyled class="fallback-button" @click=${this.handleDownload}>
                          <cv-icon slot="prefix" name="download" size="s"></cv-icon>
                          <span>${i18n('action:download' as any)}</span>
                        </cv-button>
                      </div>
                    </div>
                  `
                : url
                  ? html`
                      <video
                        class="player-video"
                        src=${url}
                        controls
                        playsinline
                        webkit-playsinline
                        @loadedmetadata=${this.handleVideoElementReady}
                        @canplay=${this.handleVideoElementReady}
                        @error=${this.handleVideoElementError}
                      ></video>
                    `
                  : nothing}
        </div>

        <div class="footer"></div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'video-player-mobile': VideoPlayerMobile
  }
}
