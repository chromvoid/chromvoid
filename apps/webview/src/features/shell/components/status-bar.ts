import {XLitElement} from '@statx/lit'

import {css, html, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {hostContentContainStyles, sharedStyles} from 'root/shared/ui/shared-styles'

// форматирование вынесено в utils/formatters

/**
 * Status Bar с цветовыми индикаторами состояний и pulse-анимациями для активных процессов.
 * Показывает: статус подключения, статус синхронизации каталога, количество выбранных файлов, ошибки.
 */
export class StatusBar extends XLitElement {
  static define() {
    customElements.define('status-bar', this)
  }
  static styles = [
    sharedStyles,
    hostContentContainStyles,
    css`
      :host {
        background: var(--cv-color-surface);
        border-top: 1px solid var(--cv-color-border);
        font-size: var(--cv-font-size-xs);
      }

      .status-bar {
        container-type: inline-size;
        container-name: statusbar;
        display: flex;
        align-items: center;
        gap: var(--app-spacing-3);
        padding: var(--app-spacing-2) var(--app-spacing-4);
        min-block-size: 32px;
      }

      /* ========== СТАТУС ИНДИКАТОРЫ ========== */

      .status-indicators {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-4);
        flex: 1;
      }

      .status-indicator {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        color: var(--cv-color-text-muted);
        font-weight: var(--cv-font-weight-medium);
        padding: var(--app-spacing-1) var(--app-spacing-2);
        border-radius: var(--cv-radius-2);
        cursor: default;
        position: relative;

        &:hover {
          background: var(--cv-color-hover);
        }

        &.connected .status-icon {
          color: var(--cv-color-success);
        }

        &.syncing .status-icon {
          color: var(--cv-color-warning);
        }

        &.error .status-icon {
          color: var(--cv-color-danger);
        }

        &.offline .status-icon {
          color: var(--cv-color-text-muted);
          opacity: 0.6;
        }

        &[title] {
          cursor: help;
        }
      }

      /* Иконка статуса с цветовым индикатором */
      .status-icon {
        position: relative;
        inline-size: 16px;
        block-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;

        cv-icon {
          color: inherit;
        }
      }

      /* Текст статуса */
      .status-text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-inline-size: 120px;
      }

      /* Состояния индикатора */
      /* ========== СЕЛЕКШН СЧЕТЧИК ========== */

      .selection-counter {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        padding: var(--app-spacing-1) var(--app-spacing-3);
        background: color-mix(in oklch, var(--cv-color-accent) 10%, transparent);
        border: 1px solid color-mix(in oklch, var(--cv-color-accent) 20%, transparent);
        border-radius: var(--cv-radius-3);
        color: var(--cv-color-accent);
        font-weight: var(--cv-font-weight-semibold);

        &:empty {
          display: none;
        }
      }

      .selection-mode-toggle {
        display: inline-flex;
        align-items: center;
        gap: var(--app-spacing-2);
        padding: var(--app-spacing-1) var(--app-spacing-3);
        border-radius: var(--cv-radius-3);
        border: 1px solid var(--cv-color-border);
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-xs);
        cursor: pointer;

        &:hover {
          background: var(--cv-color-hover);
        }

        &.active {
          background: color-mix(in oklch, var(--cv-color-accent) 18%, transparent);
          border-color: color-mix(in oklch, var(--cv-color-accent) 35%, transparent);
          color: var(--cv-color-accent);
          box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--cv-color-accent) 40%, transparent);
        }
      }

      @keyframes progressFadeIn {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ========== ОШИБКИ ========== */

      .error-banner {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        padding: var(--app-spacing-1) var(--app-spacing-3);
        background: color-mix(in oklch, var(--cv-color-danger) 15%, transparent);
        border: 1px solid color-mix(in oklch, var(--cv-color-danger) 30%, transparent);
        border-radius: var(--cv-radius-2);
        color: var(--cv-color-danger);
        font-weight: var(--cv-font-weight-medium);
        max-inline-size: 300px;
        animation: errorSlideIn 300ms var(--cv-easing-decelerate);

        cv-icon {
          flex-shrink: 0;
        }

        .error-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }

      .error-dismiss {
        background: transparent;
        border: none;
        padding: var(--app-spacing-1);
        cursor: pointer;
        color: var(--cv-color-danger);
        opacity: 0.7;
        transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        &:hover {
          opacity: 1;
        }
      }

      @keyframes errorSlideIn {
        from {
          opacity: 0;
          transform: translateX(-8px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      /* ========== РАЗДЕЛИТЕЛЬ ========== */

      .divider {
        inline-size: 1px;
        block-size: 16px;
        background: var(--cv-color-border);
        flex-shrink: 0;
      }

      /* ========== АДАПТИВНОСТЬ ========== */

      @container statusbar (max-width: 600px) {
        .status-text {
          display: none;
        }

        .status-indicators {
          gap: var(--app-spacing-2);
        }
      }

      @container statusbar (max-width: 400px) {
        .status-bar {
          padding: var(--app-spacing-2);
          gap: var(--app-spacing-2);
        }

        .selection-counter {
          .counter-text {
            display: none;
          }
        }

        .error-banner {
          max-inline-size: 150px;
        }
      }
    `,
  ]

  /** Маппинг статуса WebSocket на CSS класс */
  private getWsStatusClass(): string {
    const status = getAppContext().store.wsStatus()
    const statusMap: Record<string, string> = {
      connected: 'connected',
      connecting: 'syncing',
      disconnected: 'offline',
      error: 'error',
    }
    return statusMap[status] ?? 'offline'
  }

  /** Маппинг статуса каталога на CSS класс */
  private getCatalogStatusClass(): string {
    const status = getAppContext().store.catalogStatus()
    const statusMap: Record<string, string> = {
      idle: 'connected',
      syncing: 'syncing',
      loading: 'syncing',
      error: 'error',
    }
    return statusMap[status] ?? 'connected'
  }

  /** Иконка для статуса каталога */
  private getCatalogIcon(): string {
    const status = getAppContext().store.catalogStatus()
    const iconMap: Record<string, string> = {
      idle: 'check-circle',
      syncing: 'refresh-cw',
      loading: 'loader',
      error: 'alert-triangle',
    }
    return iconMap[status] ?? 'folder'
  }

  private renderConnectionStatus() {
    const wsStatus = getAppContext().store.wsStatus()
    const statusClass = this.getWsStatusClass()
    const statusLabel =
      wsStatus === 'connected'
        ? i18n('statusbar:connection:connected' as any)
        : wsStatus === 'connecting'
          ? i18n('statusbar:connection:connecting' as any)
          : i18n('statusbar:connection:offline' as any)

    return html`
      <div
        class="status-indicator ${statusClass}"
        title="${i18n('statusbar:connection' as any)}: ${statusLabel}"
      >
        <div class="status-icon">
          <cv-icon
            size="s"
            name=${wsStatus === 'connected' ? 'wifi' : wsStatus === 'connecting' ? 'loader' : 'wifi-off'}
          ></cv-icon>
        </div>
        <span class="status-text">${statusLabel}</span>
      </div>
    `
  }

  private renderCatalogStatus() {
    const store = getAppContext().store
    const catalogStatus = store.catalogStatus()
    const statusMessage = store.statusMessage()

    const statusClass = this.getCatalogStatusClass()
    const icon = this.getCatalogIcon()

    const labelMap: Record<string, string> = {
      idle: i18n('statusbar:catalog:idle' as any),
      syncing: i18n('statusbar:catalog:syncing' as any),
      loading: i18n('statusbar:catalog:loading' as any),
      error: i18n('statusbar:catalog:error' as any),
    }
    const label = labelMap[catalogStatus] ?? i18n('statusbar:catalog:ready' as any)

    const isRecent = statusMessage && Date.now() - statusMessage.timestamp < 5000
    const tooltipText = isRecent ? statusMessage.message : `${i18n('statusbar:catalog' as any)}: ${label}`

    return html`
      <div class="status-indicator ${statusClass}" title="${tooltipText}">
        <div class="status-icon">
          <cv-icon size="s" name=${icon}></cv-icon>
        </div>
        <span class="status-text">${label}</span>
      </div>
    `
  }

  private renderSelectionCounter() {
    const selectedCount = getAppContext().store.selectedNodeIds().length
    if (selectedCount === 0) return nothing

    return html`
      <div class="selection-counter">
        <cv-icon size="s" name="check-square"></cv-icon>
        <span class="counter-text">${i18n('statusbar:selected' as any)}:</span>
        <span>${selectedCount}</span>
      </div>
    `
  }

  private renderSelectionModeToggle() {
    const store = getAppContext().store
    const enabled = store.selectionMode()
    return html`
      <button
        class="selection-mode-toggle ${enabled ? 'active' : ''}"
        title=${`${i18n('statusbar:selection-mode' as any)}: ${i18n(
          enabled ? ('statusbar:selection-mode:on' as any) : ('statusbar:selection-mode:off' as any),
        )}`}
        aria-pressed=${enabled ? 'true' : 'false'}
        aria-label=${i18n(
          enabled ? ('statusbar:selection-mode:disable' as any) : ('statusbar:selection-mode:enable' as any),
        )}
        @click=${this.onToggleSelectionMode}
      >
        <cv-icon size="s" name="check-square"></cv-icon>
        <span>${i18n('statusbar:selection-mode' as any)}</span>
      </button>
    `
  }

  private renderError() {
    const lastError = getAppContext().store.lastErrorMessage()
    if (!lastError) return nothing

    return html`
      <div class="error-banner">
        <cv-icon size="s" name="alert-circle"></cv-icon>
        <span class="error-text" title=${lastError}>${lastError}</span>
        <button class="error-dismiss" @click=${this.onDismissError} aria-label=${i18n('button:close' as any)}>
          <cv-icon size="s" name="x"></cv-icon>
        </button>
      </div>
    `
  }

  private onDismissError = () => {
    // Очищаем ошибку через store если есть такой метод
    const store = getAppContext().store
    if (typeof (store as any).clearLastError === 'function') {
      ;(store as any).clearLastError()
    }
  }

  private onToggleSelectionMode = () => {
    getAppContext().store.toggleSelectionMode()
  }

  render() {
    return html`
      <nav class="status-bar" role="navigation" aria-label=${i18n('statusbar:system' as any)}>
        <div class="status-indicators">
          ${this.renderConnectionStatus()}
          <div class="divider"></div>
          ${this.renderCatalogStatus()}
        </div>

        ${this.renderSelectionModeToggle()} ${this.renderSelectionCounter()} ${this.renderError()}
      </nav>
    `
  }
}
