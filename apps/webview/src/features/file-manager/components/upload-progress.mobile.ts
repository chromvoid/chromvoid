import {css, nothing} from 'lit'
import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {html} from '@chromvoid/uikit/reatom-lit'

import {i18n} from 'root/i18n'
import {transientBackModel} from 'root/shared/services/transient-back.model'
import {sharedStyles} from 'root/shared/ui/shared-styles'

import {formatFileSize, type UploadHudSummary} from './upload-progress.model'
import {UploadProgressBase} from './upload-progress.base'

import './upload-task-item'

export class UploadProgressMobile extends UploadProgressBase {
  static define() {
    CVBottomSheet.define()
    if (!customElements.get('upload-progress-mobile')) {
      customElements.define('upload-progress-mobile', this)
    }
  }

  private unregisterTransientBack?: () => void

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        inline-size: 100%;
        box-sizing: border-box;
        z-index: 1000;
      }

      /* Minimized bar */
      .minimized-bar {
        inline-size: 100%;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto auto;
        grid-template-rows: minmax(0, 1fr) auto;
        align-items: center;
        box-sizing: border-box;
        column-gap: 10px;
        row-gap: 5px;
        block-size: 48px;
        padding-block: 6px 5px;
        padding-inline: 12px 10px;
        border-block: 1px solid var(--cv-color-border);
        border-inline: 0;
        border-radius: 0;
        background: var(--cv-color-surface);
        box-shadow: var(--cv-shadow-2);
        color: var(--cv-color-text);
        cursor: pointer;
        font: inherit;
        text-align: start;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }

      .minimized-bar[data-tone='success'] {
        border-block-color: var(--cv-color-success-surface-strong);
      }

      .minimized-bar[data-tone='danger'] {
        border-block-color: var(--cv-color-danger-surface-strong);
      }

      .minimized-bar:focus-visible {
        outline: 2px solid var(--cv-color-primary);
        outline-offset: 2px;
      }

      .bar-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        inline-size: 30px;
        block-size: 30px;
        color: var(--cv-color-primary);
        font-size: 16px;
        border-radius: 10px;
        background: var(--cv-color-primary-surface);
        flex-shrink: 0;
      }

      .minimized-bar[data-tone='success'] .bar-icon {
        color: var(--cv-color-success);
        background: var(--cv-color-success-surface);
      }

      .minimized-bar[data-tone='danger'] .bar-icon {
        color: var(--cv-color-danger);
        background: var(--cv-color-danger-surface);
      }

      .bar-copy {
        min-inline-size: 0;
        display: grid;
        gap: 2px;
      }

      .bar-title {
        min-inline-size: 0;
        font-weight: 600;
        font-size: 0.82em;
        line-height: 1.15;
        color: var(--cv-color-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .bar-meta {
        min-inline-size: 0;
        font-size: 0.72em;
        line-height: 1.1;
        color: var(--cv-color-text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-variant-numeric: tabular-nums;
      }

      .bar-progress {
        font-size: 0.82em;
        font-weight: 700;
        color: var(--cv-color-primary);
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
      }

      .minimized-bar[data-tone='success'] .bar-progress {
        color: var(--cv-color-success);
      }

      .minimized-bar[data-tone='danger'] .bar-progress {
        color: var(--cv-color-danger);
      }

      .bar-chevron {
        color: var(--cv-color-text-muted);
        font-size: 14px;
        flex-shrink: 0;
      }

      .minimized-progress-bar {
        grid-column: 1 / -1;
        inline-size: 100%;
        --cv-progress-height: 3px;
        --cv-progress-track-color: var(--cv-color-border);
        --cv-progress-indicator-background: var(--gradient-primary);
      }

      .minimized-bar[data-tone='success'] .minimized-progress-bar {
        --cv-progress-indicator-background: var(--cv-color-success);
      }

      .minimized-bar[data-tone='danger'] .minimized-progress-bar {
        --cv-progress-indicator-background: var(--cv-color-danger);
      }

      .header-spinner {
        font-size: 16px;
        flex-shrink: 0;
      }

      cv-bottom-sheet {
        --cv-bottom-sheet-z-index: 1001;
        --cv-bottom-sheet-overlay-color: var(--cv-alpha-black-35);
        --cv-bottom-sheet-max-height: min(74dvh, calc(100dvh - 24px));
        --cv-bottom-sheet-border-radius: 18px 18px 0 0;
        --cv-bottom-sheet-grabber-color: var(--cv-color-primary-border-strong);
      }

      cv-bottom-sheet:not([open]) {
        display: none;
      }

      cv-bottom-sheet::part(content) {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        border: 1px solid var(--cv-color-border);
        border-block-end: 0;
        background: var(--cv-color-surface);
        box-shadow: var(--cv-shadow-2);
      }

      cv-bottom-sheet::part(handle) {
        min-block-size: 28px;
        padding-block: 10px 6px;
      }

      cv-bottom-sheet::part(grabber) {
        inline-size: 42px;
        block-size: 4px;
      }

      cv-bottom-sheet::part(body) {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        min-block-size: 0;
        overflow: hidden;
      }

      cv-bottom-sheet::part(footer) {
        display: none;
      }

      /* Sheet header */
      .sheet-header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        min-block-size: 58px;
        padding-block: 8px 10px;
        padding-inline: 14px;
        background: var(--cv-color-surface);
        border-block-end: 1px solid var(--cv-color-border);
      }

      .sheet-title {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        column-gap: 8px;
        row-gap: 2px;
        min-inline-size: 0;
      }

      .sheet-title-main {
        grid-column: 1;
        min-inline-size: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        color: var(--cv-color-text);
      }

      .sheet-title-main cv-icon {
        color: var(--cv-color-primary);
        flex-shrink: 0;
      }

      .sheet-title[data-tone='success'] .sheet-title-main cv-icon {
        color: var(--cv-color-success);
      }

      .sheet-title[data-tone='danger'] .sheet-title-main cv-icon {
        color: var(--cv-color-danger);
      }

      .sheet-title-main span,
      .sheet-status {
        min-inline-size: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .sheet-status {
        grid-column: 1;
        color: var(--cv-color-text-muted);
        font-size: 0.78em;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
      }

      .sheet-title .header-spinner {
        grid-column: 2;
        grid-row: 1 / span 2;
        align-self: center;
      }

      .sheet-controls {
        display: flex;
        gap: 4px;
      }

      .sheet-btn {
        padding: 8px;
        border: none;
        border-radius: var(--cv-radius-1);
        background: transparent;
        color: var(--cv-color-text-muted);
        cursor: pointer;
        min-block-size: 48px;
        min-inline-size: 48px;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          background: var(--cv-color-surface-2);
        }

        &:focus-visible {
          outline: 2px solid var(--cv-color-primary);
          outline-offset: 2px;
        }
      }

      /* Task list */
      .tasks-container {
        min-block-size: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }

      /* Sheet footer */
      .sheet-footer {
        display: grid;
        gap: 6px;
        padding-block: 10px 12px;
        padding-inline: 14px;
        background: var(--cv-color-surface-2);
        border-block-start: 1px solid var(--cv-color-border);
      }

      .footer-stats {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        font-size: 0.85em;
        color: var(--cv-color-text);
      }

      .footer-progress-label {
        min-inline-size: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .footer-count {
        color: var(--cv-color-text-muted);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .footer-size {
        font-size: 0.8em;
        color: var(--cv-color-text-muted);
        font-variant-numeric: tabular-nums;
      }

      .sheet-footer[data-tone='success'] .footer-progress-label,
      .sheet-footer[data-tone='success'] .footer-count {
        color: var(--cv-color-success);
      }

      .sheet-footer[data-tone='danger'] .footer-progress-label,
      .sheet-footer[data-tone='danger'] .footer-count {
        color: var(--cv-color-danger);
      }

      .footer-progress-bar {
        --cv-progress-height: 6px;
        --cv-progress-track-color: var(--cv-color-border);
        --cv-progress-indicator-background: var(--gradient-primary);
      }

      .sheet-footer[data-tone='success'] .footer-progress-bar {
        --cv-progress-indicator-background: var(--cv-color-success);
      }

      .sheet-footer[data-tone='danger'] .footer-progress-bar {
        --cv-progress-indicator-background: var(--cv-color-danger);
      }
    `,
  ]

  connectedCallback() {
    super.connectedCallback()
    this.unregisterTransientBack = transientBackModel.register(() => this.consumeBack(), {priority: 80})
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.unregisterTransientBack?.()
    this.unregisterTransientBack = undefined
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    this.model?.reconcileAutoHideClear()
  }

  private onBarClick() {
    this.model.expand()
  }

  private onClearClick(e: Event) {
    e.stopPropagation()
    this.model.clearCompleted()
  }

  private onCollapseClick() {
    this.model.collapse()
  }

  private onSheetChange(e: CustomEvent<{open?: boolean}>) {
    if (typeof e.detail.open !== 'boolean') return
    if (!e.detail.open) {
      this.model.collapse()
    }
  }

  private consumeBack(): boolean {
    if (!this.model?.expanded()) {
      return false
    }

    this.model.collapse()
    return true
  }

  private getSummaryLabel(summary: UploadHudSummary): string {
    if (summary.state === 'failed') {
      return i18n('file-manager:transfer-summary:failed', {failed: String(summary.failed)})
    }

    if (summary.state === 'complete') {
      return i18n('file-manager:transfer-summary:complete')
    }

    const keyByDirection = {
      upload: 'file-manager:transfer-summary:upload-active',
      download: 'file-manager:transfer-summary:download-active',
      mixed: 'file-manager:transfer-summary:mixed-active',
      external: 'file-manager:transfer-summary:external-active',
    } as const
    return i18n(keyByDirection[summary.direction], {count: String(summary.total)})
  }

  private getBytesLabel(loadedBytes: number, totalBytes: number): string {
    if (totalBytes <= 0) return formatFileSize(loadedBytes)
    return `${formatFileSize(loadedBytes)} / ${formatFileSize(totalBytes)}`
  }

  render() {
    const m = this.model
    if (!m) return nothing

    const tasks = m.tasks()
    const stats = m.stats()
    const summary = m.hudSummary()
    const displayedProgress = m.primaryDisplay.progress()
    const displayedLoadedBytes = m.primaryDisplay.loadedBytes()
    const expanded = m.expanded()
    const progressLabel = String(Math.round(displayedProgress))
    const summaryLabel = this.getSummaryLabel(summary)
    const bytesLabel = this.getBytesLabel(displayedLoadedBytes, summary.totalBytes)
    const ariaLabel = i18n('file-manager:transfer-details-aria', {
      label: summaryLabel,
      progress: progressLabel,
      bytes: bytesLabel,
    })

    return html`
      ${!expanded
        ? html`
            <button
              class="minimized-bar"
              data-tone=${summary.tone}
              type="button"
              @click=${this.onBarClick}
              title=${i18n('file-manager:transfer-details-open')}
              aria-label=${ariaLabel}
              aria-live="polite"
            >
              <cv-icon class="bar-icon" name=${summary.icon}></cv-icon>
              <span class="bar-copy">
                <span class="bar-title">${summaryLabel}</span>
                <span class="bar-meta">
                  ${i18n('file-manager:completed-of-total', {
                    completed: String(summary.completed),
                    total: String(summary.total),
                  })}
                  · ${bytesLabel}
                </span>
              </span>
              <span class="bar-progress">${progressLabel}%</span>
              <cv-icon class="bar-chevron" name="chevron-up"></cv-icon>
              <cv-progress
                class="minimized-progress-bar"
                value=${displayedProgress}
                ?indeterminate=${summary.indeterminate}
                aria-label=${i18n('file-manager:transfers-progress')}
              ></cv-progress>
            </button>
          `
        : nothing}

      <cv-bottom-sheet .open=${expanded} no-header show-handle drag-to-close @cv-change=${this.onSheetChange}>
        <div class="sheet-header">
          <div class="sheet-title" data-tone=${summary.tone}>
            <div class="sheet-title-main">
              <cv-icon name=${summary.icon}></cv-icon>
              <span>${i18n('file-manager:transfers', {total: String(stats.total)})}</span>
            </div>
            <span class="sheet-status">${summaryLabel} · ${bytesLabel}</span>
            ${m.hasActiveTransfers()
              ? html`<cv-spinner
                  class="header-spinner"
                  label=${i18n('file-manager:transfers-progress')}
                ></cv-spinner>`
              : nothing}
          </div>
          <div class="sheet-controls">
            ${m.hasCompletedTasks()
              ? html`
                  <cv-button
                    unstyled
                    class="sheet-btn"
                    @click=${this.onClearClick}
                    title=${i18n('button:clear-completed')}
                  >
                    <cv-icon name="trash"></cv-icon>
                  </cv-button>
                `
              : nothing}
            <cv-button unstyled class="sheet-btn" @click=${this.onCollapseClick} title=${i18n('button:collapse')}>
              <cv-icon name="chevron-down"></cv-icon>
            </cv-button>
          </div>
        </div>

        <div class="tasks-container">
          ${tasks.map((task) => html`<upload-task-item .task=${task} compact></upload-task-item>`)}
        </div>

        <div class="sheet-footer" data-tone=${summary.tone}>
          <div class="footer-stats">
            <span class="footer-progress-label">${summaryLabel}</span>
            <span class="footer-count"
              >${i18n('file-manager:completed-of-total', {
                completed: String(summary.completed),
                total: String(summary.total),
              })}</span
            >
          </div>
          <cv-progress
            class="footer-progress-bar"
            value=${displayedProgress}
            ?indeterminate=${summary.indeterminate}
            aria-label=${i18n('file-manager:transfers-progress')}
          ></cv-progress>
          <div class="footer-size">${bytesLabel}</div>
        </div>
      </cv-bottom-sheet>
    `
  }
}

UploadProgressMobile.define()
