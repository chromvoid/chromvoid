import {html, css, nothing} from 'lit'
import {i18n} from 'root/i18n'
import {animationStyles} from 'root/shared/ui/shared-styles'
import {VideoPlayerBase} from './video-player.base'

export class VideoPlayer extends VideoPlayerBase {
  static define() {
    if (!customElements.get('video-player')) {
      customElements.define('video-player', this)
    }
  }

  private keyboardHandler = this.handleKeyboard.bind(this)

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

      .file-name {
        flex: 1;
        text-align: center;
        font-size: var(--cv-font-size-base);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding: 0 var(--app-spacing-3);
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

      .main {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--app-spacing-6);
      }

      .player-video {
        max-width: 90vw;
        max-height: calc(100vh - 120px);
        border-radius: var(--cv-radius-m);
      }

      .loading-spinner {
        width: 48px;
        height: 48px;
        border: 3px solid var(--cv-alpha-white-30);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
    `,
  ]

  protected override onSetup() {
    super.onSetup()
    document.addEventListener('keydown', this.keyboardHandler)

    void this.updateComplete.then(() => {
      const closeBtn = this.renderRoot.querySelector<HTMLElement>('.close-button')
      closeBtn?.focus?.()
    })
  }

  protected override onTeardown() {
    document.removeEventListener('keydown', this.keyboardHandler)
    super.onTeardown()
  }

  private handleKeyboard(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      this.close()
    }
  }

  private handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      this.close()
    }
  }

  protected render() {
    if (!this.open) return nothing

    const url = this.videoUrl()
    const isLoading = this.loading()

    return html`
      <div
        class="overlay"
        role="dialog"
        aria-modal="true"
        aria-label=${this.fileName || i18n('media:video-player' as any)}
        @click=${this.handleOverlayClick}
      >
        <div class="header">
          <div></div>
          <div class="file-name">${this.fileName}</div>
          <button class="close-button" @click=${this.close} aria-label=${i18n('button:close' as any)}>
            <cv-icon name="x" size="m"></cv-icon>
          </button>
        </div>

        <div class="main">
          ${isLoading
            ? html`<div class="loading-spinner"></div>`
            : url
              ? html` <video class="player-video" src=${url} controls autoplay playsinline></video> `
              : nothing}
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'video-player': VideoPlayer
  }
}
