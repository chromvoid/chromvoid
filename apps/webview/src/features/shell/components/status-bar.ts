import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {hostContentContainStyles, sharedStyles} from 'root/shared/ui/shared-styles'
import {
  androidShareImportModel,
  type AndroidSharePendingLockedSummary,
} from 'root/features/file-manager/models/android-share-import.model'
import {MediaMiniPlayer} from 'root/features/media/components/media-mini-player'
import {mediaPlaybackModel} from 'root/features/media/models/media-playback.model'
import {statusBarSummaryModel, type StatusBarContextItem} from '../models/status-bar-summary.model'

/** Desktop status strip for shell context and compact global controls. */
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
        display: block;
        min-inline-size: 0;
        font-size: var(--cv-font-size-xs);
      }

      .status-bar {
        container: statusbar / inline-size;
        min-inline-size: 0;
        block-size: 26px;
        box-sizing: border-box;
        overflow: hidden;
        border-block-start: 1px solid var(--cv-color-border-muted);
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text-subtle);
      }

      .status-bar[data-expanded] {
        block-size: 42px;
      }

      .status-content {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: var(--app-spacing-3);
        block-size: 100%;
        min-inline-size: 0;
        box-sizing: border-box;
        padding-inline: var(--app-spacing-3);
        overflow: hidden;
        font-family: var(--cv-font-family-code);
        font-variant-numeric: tabular-nums;
        line-height: 1;
      }

      .status-start,
      .status-end,
      .status-indicators,
      .status-context-items {
        display: flex;
        align-items: center;
        min-inline-size: 0;
      }

      .status-start {
        gap: var(--app-spacing-3);
        overflow: hidden;
      }

      .status-end {
        justify-content: flex-end;
        gap: var(--app-spacing-3);
      }

      .status-indicators,
      .status-context-items {
        gap: var(--app-spacing-3);
      }

      .status-indicators:empty,
      .status-context-items:empty {
        display: none;
      }

      .status-context-items {
        overflow: hidden;
        white-space: nowrap;
      }

      .status-context-item {
        display: inline-flex;
        align-items: baseline;
        gap: var(--app-spacing-1);
        min-inline-size: 0;
        overflow: hidden;
        color: var(--cv-color-text-subtle);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .status-context-item + .status-context-item::before {
        content: '·';
        flex: 0 0 auto;
        margin-inline-end: calc(var(--app-spacing-3) - var(--app-spacing-1));
        color: var(--cv-color-border);
      }

      .status-context-item[data-tone='accent'] {
        color: var(--cv-color-accent);
      }

      .status-context-item[data-tone='warning'] {
        color: var(--cv-color-warning);
      }

      .status-context-item[data-tone='danger'] {
        color: var(--cv-color-danger);
      }

      .status-context-value {
        color: var(--cv-color-text-strongest);
        font-weight: var(--cv-font-weight-semibold);
      }

      .status-context-item[data-tone='accent'] .status-context-value,
      .status-context-item[data-tone='warning'] .status-context-value,
      .status-context-item[data-tone='danger'] .status-context-value {
        color: inherit;
      }

      .status-indicator {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        min-inline-size: 0;
        padding: 2px 8px;
        border-radius: 999px;
        color: var(--cv-color-text-muted);
        cursor: default;
        font-family: var(--cv-font-family-sans);
        font-weight: var(--cv-font-weight-medium);
      }

      .status-indicator:hover {
        background: var(--cv-color-hover);
      }

      .status-indicator.connected .status-icon {
        color: var(--cv-color-success);
      }

      .status-indicator.syncing .status-icon {
        color: var(--cv-color-warning);
      }

      .status-indicator[title] {
        cursor: help;
      }

      .status-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        inline-size: 16px;
        block-size: 16px;
      }

      .status-icon cv-icon {
        color: inherit;
      }

      .status-text {
        max-inline-size: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .selection-counter {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        flex: 0 0 auto;
        padding: var(--app-spacing-1) var(--app-spacing-3);
        border: 1px solid var(--cv-color-accent-border);
        border-radius: var(--cv-radius-3);
        background: var(--cv-color-accent-surface);
        color: var(--cv-color-accent);
        font-family: var(--cv-font-family-sans);
        font-weight: var(--cv-font-weight-semibold);
      }

      cv-callout.status-error-callout {
        --cv-callout-dense-padding-block: var(--app-spacing-1);
        --cv-callout-gap: var(--app-spacing-2);
        flex: 0 1 300px;
        max-inline-size: 300px;
        font-family: var(--cv-font-family-sans);
        font-weight: var(--cv-font-weight-medium);
        animation: errorSlideIn var(--cv-duration-normal, 220ms) var(--cv-easing-decelerate);
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
          transform: translateX(calc(8px * var(--app-runtime-inline-start-direction-sign, -1)));
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        cv-callout.status-error-callout {
          animation: none;
        }
      }

      @container statusbar (width < 720px) {
        .status-context-item[data-priority='optional'] {
          display: none;
        }
      }

      @container statusbar (width < 560px) {
        .status-context-item[data-priority='supporting'] {
          display: none;
        }

        .status-text {
          display: none;
        }

        .status-start,
        .status-end,
        .status-indicators,
        .status-context-items {
          gap: var(--app-spacing-2);
        }
      }

      @container statusbar (width < 400px) {
        .status-content {
          gap: var(--app-spacing-2);
          padding-inline: var(--app-spacing-2);
        }

        .selection-counter .counter-text {
          display: none;
        }

        cv-callout.status-error-callout {
          max-inline-size: 150px;
        }

        media-mini-player {
          max-inline-size: 52cqi;
        }
      }
    `,
  ]

  private renderRemoteConnectionStatus(remoteSessionState: string) {
    if (remoteSessionState === 'inactive') return nothing

    const ready = remoteSessionState === 'ready'
    const statusClass = ready ? 'connected' : 'syncing'
    const statusLabel = ready
      ? i18n('statusbar:remote-connection:ready')
      : remoteSessionState === 'waiting_phone_approval'
        ? i18n('statusbar:remote-connection:waiting-phone')
        : i18n('statusbar:remote-connection:waiting-host')
    const icon = ready ? 'wifi' : remoteSessionState === 'waiting_phone_approval' ? 'smartphone' : 'lock'

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

  private renderSelectionCounter(selectedCount: number) {
    if (selectedCount === 0) return nothing

    return html`
      <div class="selection-counter">
        <cv-icon size="s" name="check-square"></cv-icon>
        <span class="counter-text">${i18n('statusbar:selected')}:</span>
        <span>${selectedCount}</span>
      </div>
    `
  }

  private renderAndroidSharePending(summary: AndroidSharePendingLockedSummary | null) {
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

  private renderContextItems(items: readonly StatusBarContextItem[]) {
    return items.map((item) => {
      const content =
        item.kind === 'metric'
          ? html`<span class="status-context-value">${item.value}</span><span>${item.label}</span>`
          : item.text
      const ariaLabel = item.kind === 'metric' ? `${item.label}: ${item.value}` : item.text

      return html`
        <span
          class="status-context-item"
          data-summary-id=${item.id}
          data-priority=${item.priority}
          data-tone=${item.tone}
          role=${item.operational ? 'status' : nothing}
          aria-label=${ariaLabel}
        >
          ${content}
        </span>
      `
    })
  }

  private renderError(lastError: string | null) {
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

  private onDismissError() {
    getAppContext().store.clearLastError()
  }

  protected render() {
    const store = getAppContext().store
    const remoteSessionState = store.remoteSessionState()
    const androidShareSummary = androidShareImportModel.pendingLockedSummary()
    const selectedCount = store.selectedNodeIds().length
    const lastError = store.lastErrorMessage()
    const mediaVisible = mediaPlaybackModel.miniControlsVisible()
    const summary = statusBarSummaryModel.current()
    const hasOperationalIndicators = remoteSessionState !== 'inactive' || Boolean(androidShareSummary)
    const hasContent =
      hasOperationalIndicators || selectedCount > 0 || Boolean(lastError) || mediaVisible || Boolean(summary)

    if (!hasContent) return nothing

    const expanded = mediaVisible || Boolean(lastError)

    return html`
      <div class="status-bar" data-expanded=${expanded ? '' : nothing} aria-label=${i18n('statusbar:system')}>
        <div
          class="status-content ${summary ? 'status-context-summary' : ''}"
          role=${summary ? 'group' : nothing}
          aria-label=${summary?.label ?? nothing}
          aria-busy=${summary?.busy ? 'true' : nothing}
          data-summary-context=${summary?.id ?? nothing}
          data-security-status=${summary?.securityStatus ?? nothing}
        >
          <div class="status-start">
            <div
              class="status-indicators"
              role=${hasOperationalIndicators ? 'status' : nothing}
              aria-live=${hasOperationalIndicators ? 'polite' : nothing}
            >
              ${this.renderRemoteConnectionStatus(remoteSessionState)}
              ${this.renderAndroidSharePending(androidShareSummary)}
            </div>
            <div class="status-context-items status-context-start">
              ${summary ? this.renderContextItems(summary.startItems) : nothing}
            </div>
          </div>

          <div class="status-end">
            ${mediaVisible ? html`<media-mini-player variant="statusbar"></media-mini-player>` : nothing}
            ${this.renderSelectionCounter(selectedCount)} ${this.renderError(lastError)}
            <div class="status-context-items status-context-end">
              ${summary ? this.renderContextItems(summary.endItems) : nothing}
            </div>
          </div>
        </div>
      </div>
    `
  }
}
