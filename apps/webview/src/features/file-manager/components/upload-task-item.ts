import {XLitElement} from '@statx/lit'

import {css, html, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {
  hostContentContainStyles,
  motionPrimitiveStyles,
  pulseIndicatorStyles,
  sharedStyles,
} from 'root/shared/ui/shared-styles'
import type {UploadTask, UploadTaskStatus} from 'root/types/upload-task'

import {formatFileSize} from './upload-progress.model'

export class UploadTaskItem extends XLitElement {
  static define() {
    customElements.define('upload-task-item', this)
  }

  static get properties() {
    return {
      task: {type: Object},
      compact: {type: Boolean, reflect: true},
    }
  }

  declare task: UploadTask | null
  declare compact: boolean

  static styles = [
    sharedStyles,
    motionPrimitiveStyles,
    pulseIndicatorStyles,
    hostContentContainStyles,
    css`
      :host([compact]) .upload-task {
        padding-block: 12px;
        padding-inline: 16px;
      }

      :host([compact]) .task-header {
        margin-block-end: 8px;
        gap: 8px;
      }

      :host([compact]) .task-name {
        -webkit-line-clamp: 1;
        max-height: 1.3em;
      }

      :host([compact]) .progress-bar {
        block-size: 4px;
        margin-block-end: 6px;
      }

      :host([compact]) .task-details {
        font-size: 0.75em;
        gap: 4px;
      }

      .upload-task {
        padding-block: 18px;
        padding-inline: 20px;
        border-bottom: 1px solid var(--cv-color-border);
        transition: background 0.2s ease;

        &:hover {
          background: var(--cv-color-surface-2);
        }
      }

      .task-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-block-end: 12px;
        gap: 12px;
      }

      .task-name {
        font-weight: 500;
        color: var(--cv-color-text);
        flex: 1;
        margin-inline-end: 12px;
        line-height: 1.3;
        word-break: break-word;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        max-height: 2.6em;
      }

      .task-status {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.85em;
        font-weight: 500;
        white-space: nowrap;
        flex-shrink: 0;

        &.uploading {
          color: var(--cv-color-primary);
        }

        &.done {
          color: var(--cv-color-success);
        }

        &.error {
          color: var(--cv-color-danger);
        }

        &.paused {
          color: var(--cv-color-warning);
        }
      }

      .progress-bar {
        inline-size: 100%;
        block-size: 6px;
        background: var(--cv-color-border);
        border-radius: 3px;
        overflow: hidden;
        margin-block-end: 8px;
      }

      .progress-fill {
        block-size: 100%;
        inline-size: 100%;
        border-radius: 3px;
        transform-origin: left center;
        will-change: transform;
        transition: transform var(--cv-duration-fast) linear;

        &.uploading {
          background: var(--gradient-primary);
          --motion-pulse-mid-opacity: 0.7;
        }

        &.done {
          background: var(--cv-color-success);
        }

        &.error {
          background: var(--cv-color-danger);
        }

        &.paused {
          background: var(--cv-color-warning);
        }
      }

      .task-details {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 0.8em;
        color: var(--cv-color-text-muted);
      }

      .task-size-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .task-size {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .task-progress {
        font-weight: 600;
        color: var(--cv-color-primary);
      }

      .task-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      .task-meta-info {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .task-meta-actions {
        display: flex;
        gap: 8px;
      }
    `,
  ]

  private formatSpeed(bytesPerSecond: number): string {
    return i18n('upload:speed' as any, {speed: formatFileSize(bytesPerSecond)})
  }

  private formatTime(seconds: number): string {
    if (seconds < 60) return i18n('upload:eta:seconds' as any, {value: String(Math.round(seconds))})
    if (seconds < 3600) return i18n('upload:eta:minutes' as any, {value: String(Math.round(seconds / 60))})
    return i18n('upload:eta:hours' as any, {value: String(Math.round(seconds / 3600))})
  }

  private getStatusIcon(status: UploadTaskStatus, direction: UploadTask['direction']) {
    if (status === 'uploading') return direction === 'download' ? 'download' : 'upload'
    const icons: Record<Exclude<UploadTaskStatus, 'uploading'>, string> = {
      done: 'check-circle-fill',
      error: 'x-circle-fill',
      paused: 'pause-circle-fill',
    }
    return icons[status]
  }

  private getStatusText(status: UploadTaskStatus, direction: UploadTask['direction']) {
    if (status === 'uploading') {
      return direction === 'download' ? i18n('upload:downloading' as any) : i18n('upload:uploading' as any)
    }
    const texts: Record<Exclude<UploadTaskStatus, 'uploading'>, string> = {
      done: i18n('upload:done' as any),
      error: i18n('upload:error' as any),
      paused: i18n('upload:paused' as any),
    }
    return texts[status]
  }

  private onRetryClick = () => {
    if (!this.task) return
    getAppContext().store.updateUploadTask(this.task.id, {status: 'uploading'})
  }

  private onCancelClick = () => {
    if (!this.task) return
    getAppContext().store.cancelUploadTask(this.task.id)
  }

  render() {
    const t = this.task
    if (!t) return nothing
    const total = t.total()
    const status = t.status()
    const direction = t.direction
    // Если статус уже done — принудительно показываем 100% и total
    const loaded = status === 'done' ? total : t.loaded()
    const denom = total && total > 0 ? total : 1
    const rawProgress = status === 'done' ? 100 : Math.max(0, Math.min(100, (loaded / denom) * 100))
    // Не показываем 100% до подтверждения сервера: визуально ограничим 99%
    const progress = status === 'done' ? 100 : Math.min(99, rawProgress)
    const statusText =
      status === 'uploading' && rawProgress >= 99
        ? i18n('upload:finalizing' as any)
        : this.getStatusText(status, direction)

    return html`
      <div class="upload-task">
        <div class="task-header">
          <div class="task-name" title=${t.name}>${t.name}</div>
          <div class="task-status ${status}">
            <cv-icon name=${this.getStatusIcon(status, direction)}></cv-icon>
            <span>${statusText}</span>
          </div>
        </div>

        <div class="progress-bar">
          <div class="progress-fill ${status}" style="transform: scaleX(${progress / 100})"></div>
        </div>

        <div class="task-details">
          <div class="task-size-row">
            <div class="task-size">
              <span>${formatFileSize(loaded)} / ${formatFileSize(total)}</span>
            </div>
            <div class="task-progress">${Math.round(progress)}%</div>
          </div>
          <div class="task-meta">
            <div class="task-meta-info">
              ${t.speed() ? html`<span>${this.formatSpeed(t.speed())}</span>` : nothing}
              ${t.eta() && status === 'uploading'
                ? html`<span>${i18n('upload:remaining' as any, {time: this.formatTime(t.eta())})}</span>`
                : nothing}
            </div>
            <div class="task-meta-actions">
              ${status === 'error'
                ? html`<cv-button size="small" variant="ghost" @click=${this.onRetryClick}
                    >${i18n('button:retry' as any)}</cv-button
                  >`
                : nothing}
              ${status !== 'done'
                ? html`<cv-button size="small" variant="ghost" @click=${this.onCancelClick}
                    >${i18n('button:cancel' as any)}</cv-button
                  >`
                : nothing}
            </div>
          </div>
        </div>
      </div>
    `
  }
}

UploadTaskItem.define()
