import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {hostContentContainStyles, sharedStyles} from 'root/shared/ui/shared-styles'
import {MediaMiniPlayer} from 'root/features/media/components/media-mini-player'
import {mediaPlaybackModel} from 'root/features/media/models/media-playback.model'
import {androidShareImportModel} from 'root/features/file-manager/models/android-share-import.model'

/**Status Bar with color state indicators and pulse animations for active processes.
* Shows: connection status, directory synchronization status, number of selected files, errors.
*/
export class StatusBar extends ReatomLitElement {
  static define() {
    if (!customElements.get('status-bar')) {
      customElements.define('status-bar', this)
    }
    MediaMiniPlayer.define()
  }
  static styles = [
    sharedStyles,
    hostContentContainStyles,
    css`
      :host {
        background: var(--cv-color-surface-2);
        border-top: 1px solid var(--cv-color-border-soft);
        font-size: var(--cv-font-size-xs);
      }

      .status-bar {
        container-type: inline-size;
        container-name: statusbar;
        display: flex;
        align-items: center;
        gap: var(--app-spacing-3);
        padding: 8px 16px;
        min-block-size: 42px;
      }

      /*========= Status of INDICATORS ==================================================================================================================================================*/

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
        padding: 2px 8px;
        border-radius: 999px;
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

      /*Status icon with color indicator*/
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

      /*Text of status*/
      .status-text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-inline-size: 120px;
      }

      /*Conditions of the indicator*/
      /*=========================*/

      .selection-counter {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        padding: var(--app-spacing-1) var(--app-spacing-3);
        background: var(--cv-color-accent-surface);
        border: 1px solid var(--cv-color-accent-border);
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
        min-block-size: 26px;
        padding: 1px 12px;
        border-radius: 999px;
        border: 1px solid var(--cv-color-border-soft);
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-xs);
        cursor: pointer;
        box-shadow: inset 0 1px 0 var(--cv-alpha-white-5);

        &:hover {
          background: var(--cv-color-primary-surface);
        }

        &.active {
          background: var(--cv-color-primary-surface-strong);
          border-color: var(--cv-color-primary-border-strong);
          color: var(--cv-color-primary);
          box-shadow: inset 0 0 0 1px var(--cv-color-primary-ring);
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

      /*=========================*/

      cv-callout.status-error-callout {
        --cv-callout-dense-padding-block: var(--app-spacing-1);
        --cv-callout-gap: var(--app-spacing-2);
        font-weight: var(--cv-font-weight-medium);
        max-inline-size: 300px;
        animation: errorSlideIn 300ms var(--cv-easing-decelerate);
      }

      cv-callout.status-error-callout::part(base) {
        align-items: center;
      }

      cv-callout.status-error-callout::part(icon),
      cv-callout.status-error-callout::part(close-button) {
        flex-shrink: 0;
      }

      cv-callout.status-error-callout::part(close-button) {
        padding: var(--app-spacing-1);
        color: var(--cv-color-danger);
        opacity: 0.7;
        transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
      }

      cv-callout.status-error-callout::part(close-button):hover {
        opacity: 1;
      }

      cv-callout.status-error-callout::part(message) {
        min-inline-size: 0;
        overflow: hidden;
      }

      .status-error-text {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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

      /*==================*/

      .divider {
        inline-size: 1px;
        block-size: 16px;
        background: var(--cv-color-border-muted);
        flex-shrink: 0;
      }

      /*====================*/

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

        cv-callout.status-error-callout {
          max-inline-size: 150px;
        }

        media-mini-player {
          max-inline-size: 52vw;
        }
      }
    `,
  ]

  /**WebSocket status mapping on CSS class*/
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

  /**Mapping Directory Status in CSS Class*/
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

  /**Icon for catalog status*/
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
        ? i18n('statusbar:connection:connected')
        : wsStatus === 'connecting'
          ? i18n('statusbar:connection:connecting')
          : i18n('statusbar:connection:offline')

    return html`
      <div
        class="status-indicator ${statusClass}"
        title="${i18n('statusbar:connection')}: ${statusLabel}"
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
      idle: i18n('statusbar:catalog:idle'),
      syncing: i18n('statusbar:catalog:syncing'),
      loading: i18n('statusbar:catalog:loading'),
      error: i18n('statusbar:catalog:error'),
    }
    const label = labelMap[catalogStatus] ?? i18n('statusbar:catalog:ready')

    const isRecent = statusMessage && Date.now() - statusMessage.timestamp < 5000
    const tooltipText = isRecent ? statusMessage.message : `${i18n('statusbar:catalog')}: ${label}`

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
        <span class="counter-text">${i18n('statusbar:selected')}:</span>
        <span>${selectedCount}</span>
      </div>
    `
  }

  private renderAndroidSharePending() {
    const summary = androidShareImportModel.pendingLockedSummary()
    if (!summary) return nothing

    const label = i18n('statusbar:android-share-pending', {count: String(summary.fileCount)})
    const tooltip = i18n('statusbar:android-share-pending:detail', {
      count: String(summary.fileCount),
      unknown: String(summary.unknownSizes),
    })

    return html`
      <div class="status-indicator syncing" title=${tooltip}>
        <div class="status-icon">
          <cv-icon size="s" name="upload"></cv-icon>
        </div>
        <span class="status-text">${label}</span>
      </div>
    `
  }

  private renderSelectionModeToggle() {
    const store = getAppContext().store
    const enabled = store.selectionMode()
    return html`
      <cv-button unstyled
        class="selection-mode-toggle ${enabled ? 'active' : ''}"
        title=${`${i18n('statusbar:selection-mode')}: ${i18n(
          enabled ? 'statusbar:selection-mode:on' : 'statusbar:selection-mode:off',
        )}`}
        aria-pressed=${enabled ? 'true' : 'false'}
        aria-label=${i18n(enabled ? 'statusbar:selection-mode:disable' : 'statusbar:selection-mode:enable')}
        @click=${this.onToggleSelectionMode}
      >
        <cv-icon slot="prefix" size="s" name="check-square"></cv-icon>
        <span>${i18n('statusbar:selection-mode')}</span>
      </cv-button>
    `
  }

  private renderError() {
    const lastError = getAppContext().store.lastErrorMessage()
    if (!lastError) return nothing

    return html`
      <cv-callout
        class="status-error-callout"
        variant="danger"
        density="dense"
        closable
        role="alert"
        @cv-close=${this.onDismissError}
      >
        <cv-icon slot="icon" size="s" name="alert-circle"></cv-icon>
        <span class="status-error-text" title=${lastError}>${lastError}</span>
      </cv-callout>
    `
  }

  private renderMediaMiniControls() {
    if (!mediaPlaybackModel.miniControlsVisible()) return nothing

    return html`<media-mini-player variant="statusbar"></media-mini-player>`
  }

  private onDismissError() {
    getAppContext().store.clearLastError()
  }

  private onToggleSelectionMode = () => {
    getAppContext().store.toggleSelectionMode()
  }

  render() {
    return html`
      <nav class="status-bar" role="navigation" aria-label=${i18n('statusbar:system')}>
        <div class="status-indicators">
          ${this.renderConnectionStatus()}
          <div class="divider"></div>
          ${this.renderCatalogStatus()}
          ${this.renderAndroidSharePending()}
        </div>

        ${this.renderMediaMiniControls()} ${this.renderSelectionModeToggle()} ${this.renderSelectionCounter()}
        ${this.renderError()}
      </nav>
    `
  }
}
