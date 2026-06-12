import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {hostContentContainStyles, sharedStyles} from 'root/shared/ui/shared-styles'
import {MediaMiniPlayer} from 'root/features/media/components/media-mini-player'
import {mediaPlaybackModel} from 'root/features/media/models/media-playback.model'
import {androidShareImportModel} from 'root/features/file-manager/models/android-share-import.model'
import {PMSummaryRail} from 'root/features/passmanager/components/summary-rail'
import {statusBarSummaryModel} from '../models/status-bar-summary.model'

/**Status Bar with user-facing state indicators and compact global controls.
* Shows: remote connection status, pending shared files, selected files, errors.
*/
export class StatusBar extends ReatomLitElement {
  static define() {
    if (!customElements.get('status-bar')) {
      customElements.define('status-bar', this)
    }
    MediaMiniPlayer.define()
    PMSummaryRail.define()
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
        flex: 0 1 auto;
        min-inline-size: 0;
      }

      .status-summary-slot {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        margin-inline-start: auto;
        min-inline-size: 0;
      }

      .status-summary-slot pm-summary-rail.status-context-summary {
        --pm-summary-rail-background: transparent;
        --pm-summary-rail-border: 0;
        --pm-summary-rail-padding: 0;
        flex: 0 1 auto;
        min-inline-size: min(220px, 100%);
        max-inline-size: min(720px, 100%);
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

  private renderRemoteConnectionStatus() {
    const remoteSessionState = getAppContext().store.remoteSessionState()
    if (remoteSessionState === 'inactive') return nothing

    const ready = remoteSessionState === 'ready'
    const statusClass = ready ? 'connected' : 'syncing'
    const statusLabel = ready
      ? i18n('statusbar:remote-connection:ready')
      : i18n('statusbar:remote-connection:waiting-host')
    const icon = ready ? 'wifi' : 'lock'

    return html`
      <div
        class="status-indicator ${statusClass}"
        title="${i18n('statusbar:remote-connection')}: ${statusLabel}"
      >
        <div class="status-icon">
          <cv-icon size="s" name=${icon}></cv-icon>
        </div>
        <span class="status-text">${statusLabel}</span>
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

  private renderContextSummarySlot() {
    const summary = statusBarSummaryModel.current()
    if (!summary) return nothing

    return html`
      <div class="status-summary-slot">
        <pm-summary-rail
          class="status-context-summary"
          .items=${summary.items}
          .label=${summary.label}
          .busy=${Boolean(summary.busy)}
          data-summary-context=${summary.id}
          data-security-status=${summary.status ?? nothing}
        ></pm-summary-rail>
      </div>
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

  render() {
    return html`
      <nav class="status-bar" role="navigation" aria-label=${i18n('statusbar:system')}>
        <div class="status-indicators">
          ${this.renderRemoteConnectionStatus()}
          ${this.renderAndroidSharePending()}
        </div>

        ${this.renderMediaMiniControls()} ${this.renderSelectionCounter()} ${this.renderError()}
        ${this.renderContextSummarySlot()}
      </nav>
    `
  }
}
