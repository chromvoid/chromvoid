import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {
  hostLayoutPaintContainStyles,
  pageFadeInStyles,
  pageTransitionStyles,
  sharedStyles,
} from 'root/shared/ui/shared-styles'

export class NoConnection extends XLitElement {
  static define() {
    if (!customElements.get('no-connection')) {
      customElements.define('no-connection', this)
    }
  }

  private onRetry = () => {
    try {
      getAppContext().ws?.connect()
    } catch {}
  }

  static styles = [
    sharedStyles,
    pageTransitionStyles,
    pageFadeInStyles,
    hostLayoutPaintContainStyles,
    css`
      :host {
        display: grid;
        height: 100dvh;
        min-height: 100%;
        place-items: center;
        background: var(--cv-color-hover);
      }

      .card {
        display: grid;
        gap: 18px;
        width: min(640px, 92vw);
        padding: 28px;
        background: var(--cv-color-surface);
        border: 1px solid var(--cv-color-border);
        border-radius: 12px;
        box-shadow: var(--cv-shadow-2);
        text-align: center;
      }

      .icon-wrap {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 72px;
        height: 72px;
        margin: 0 auto;
        border-radius: 50%;
        background: color-mix(in oklch, var(--cv-color-danger), transparent 92%);
        border: 1px solid color-mix(in oklch, var(--cv-color-danger), transparent 70%);
        color: var(--cv-color-danger);
      }

      .title {
        font-size: 22px;
        font-weight: var(--cv-font-weight-bold);
      }

      .desc {
        color: var(--cv-color-text-muted);
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 10px;
        background: var(--cv-color-hover);
        border: 1px solid var(--cv-color-border-muted);
        color: var(--cv-color-text);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        justify-content: center;
      }

      .hint {
        font-size: var(--cv-font-size-sm);
        color: var(--cv-color-text-muted);
      }
    `,
  ]

  protected render() {
    const {store} = getAppContext()
    const wsStatus = store?.wsStatus?.() ?? 'disconnected'
    const lastError = store?.lastErrorMessage?.() ?? ''
    const isConnecting = wsStatus === 'connecting'

    return html`
      <div class="card" role="status" aria-live="polite">
        <div class="icon-wrap" aria-hidden="true">
          <cv-icon name="wifi-off" size="l" color="danger"></cv-icon>
        </div>
        <div class="title">${i18n('no-connection')}</div>
        <div class="desc">
          Не удалось подключиться к устройству. Проверьте подключение кабеля USB‑C и питание, затем повторите
          попытку.
        </div>

        <div class="status">
          <cv-icon name="activity" size="m" color=${isConnecting ? 'warning' : 'muted'}></cv-icon>
          <span>
            ${isConnecting ? 'Подключение…' : 'Отключено'} ${lastError ? html` · ${lastError}` : ''}
          </span>
        </div>

        <div class="actions">
          <cv-button variant="primary" size="large" @click=${this.onRetry} .loading=${isConnecting}
            >Переподключиться</cv-button
          >
          <cv-button variant="ghost" size="large" @click=${() => location.reload()}
            >Обновить страницу</cv-button
          >
        </div>

        <div class="hint">
          Подсказка: если проблема сохраняется, попробуйте другой кабель/порт USB‑C или перезагрузите
          устройство.
        </div>
      </div>
    `
  }
}

NoConnection.define()
