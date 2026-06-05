import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {
  hostContentContainStyles,
  motionPrimitiveStyles,
  pulseIndicatorStyles,
  sharedStyles,
} from 'root/shared/ui/shared-styles'
import type {UploadTask, UploadTaskStatus} from 'root/types/upload-task'

import {AnimatedTransferValueModel} from './upload-progress-animation.model'
import {formatFileSize} from './upload-progress.model'

export class UploadTaskItem extends ReatomLitElement {
  static define() {
    if (!customElements.get('upload-task-item')) {
      customElements.define('upload-task-item', this)
    }
  }

  static get properties() {
    return {
      task: {type: Object},
      compact: {type: Boolean, reflect: true},
    }
  }

  declare task: UploadTask | null
  declare compact: boolean

  private readonly progressDisplay = new AnimatedTransferValueModel()

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

      :host([compact]) .task-progress-bar {
        --cv-progress-height: 4px;
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

        &.queued {
          color: var(--cv-color-text-muted);
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

      .task-progress-bar {
        --cv-progress-height: 6px;
        margin-block-end: 8px;
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

      .task-progress-value {
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
    return i18n('upload:speed', {speed: formatFileSize(bytesPerSecond)})
  }

  private formatTime(seconds: number): string {
    if (seconds < 60) return i18n('upload:eta:seconds', {value: String(Math.round(seconds))})
    if (seconds < 3600) return i18n('upload:eta:minutes', {value: String(Math.round(seconds / 60))})
    return i18n('upload:eta:hours', {value: String(Math.round(seconds / 3600))})
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)
    this.syncProgressDisplay()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.progressDisplay.dispose()
  }

  private getStatusIcon(task: UploadTask, status: UploadTaskStatus) {
    if (status === 'uploading') {
      if (task.kind === 'open-external') return 'box-arrow-up-right'
      return task.direction === 'download' ? 'download' : 'upload'
    }
    const icons: Record<Exclude<UploadTaskStatus, 'uploading'>, string> = {
      queued: 'clock',
      done: 'check-circle-fill',
      error: 'x-circle-fill',
      paused: 'pause-circle-fill',
    }
    return icons[status]
  }

  private getStatusText(task: UploadTask, status: UploadTaskStatus) {
    if (task.kind === 'open-external') {
      if (status === 'uploading') {
        return i18n('file-manager:preparing-file')
      }
      const texts: Record<Exclude<UploadTaskStatus, 'uploading'>, string> = {
        queued: i18n('upload:queued'),
        done: i18n('file-manager:opened-in-system'),
        error: i18n('file-manager:open-failed-status'),
        paused: i18n('upload:paused'),
      }
      return texts[status]
    }
    if (status === 'uploading') {
      return task.direction === 'download'
        ? i18n('upload:downloading')
        : i18n('upload:uploading')
    }
    const texts: Record<Exclude<UploadTaskStatus, 'uploading'>, string> = {
      queued: i18n('upload:queued'),
      done: i18n('upload:done'),
      error: i18n('upload:error'),
      paused: i18n('upload:paused'),
    }
    return texts[status]
  }

  private getProgressTone(status: UploadTaskStatus) {
    if (status === 'done') return 'success'
    if (status === 'error') return 'danger'
    if (status === 'paused') return 'warning'
    if (status === 'queued') return 'queued'
    return 'upload'
  }

  private onRetryClick = () => {
    if (!this.task) return
    getAppContext().store.updateUploadTask(this.task.id, {status: 'uploading'})
  }

  private onCancelClick = () => {
    if (!this.task) return
    getAppContext().store.cancelUploadTask(this.task.id)
  }

  private getProgressSnapshot(task: UploadTask) {
    const total = task.total()
    const status = task.status()
    const loaded = status === 'done' ? total : task.loaded()
    const isIndeterminate = status === 'queued' || (status === 'uploading' && total <= 0)
    const denom = total && total > 0 ? total : 1
    const rawProgress = status === 'done' ? 100 : Math.max(0, Math.min(100, (loaded / denom) * 100))
    const progress = status === 'done' ? 100 : Math.min(99, rawProgress)

    return {total, status, loaded, isIndeterminate, rawProgress, progress}
  }

  private syncProgressDisplay() {
    const task = this.task
    if (!task) {
      this.progressDisplay.reset('empty-task')
      return
    }

    const snapshot = this.getProgressSnapshot(task)
    this.progressDisplay.setTargets({
      key: task.id,
      progress: snapshot.progress,
      loadedBytes: snapshot.loaded,
      active: snapshot.status === 'uploading' || snapshot.status === 'done',
      done: snapshot.status === 'done',
    })
  }

  render() {
    const t = this.task
    if (!t) return nothing
    const {total, status, loaded, isIndeterminate, rawProgress} = this.getProgressSnapshot(t)
    const displayedProgress = status === 'done' ? 100 : this.progressDisplay.progress()
    const displayedLoaded = status === 'done' ? total : Math.min(this.progressDisplay.loadedBytes(), loaded)
    const statusText =
      t.kind === 'transfer' && status === 'uploading' && rawProgress >= 99
        ? i18n('upload:finalizing')
        : this.getStatusText(t, status)

    return html`
      <div class="upload-task">
        <div class="task-header">
          <div class="task-name" title=${t.name}>${t.name}</div>
          <div class="task-status ${status}">
            <cv-icon name=${this.getStatusIcon(t, status)}></cv-icon>
            <span>${statusText}</span>
          </div>
        </div>

        <cv-progress
          class="task-progress-bar ${status}"
          tone=${this.getProgressTone(status)}
          value=${displayedProgress}
          ?indeterminate=${isIndeterminate}
          aria-label=${statusText}
        ></cv-progress>

        <div class="task-details">
          ${isIndeterminate
            ? nothing
            : html`
                <div class="task-size-row">
                  <div class="task-size">
                    <span>${formatFileSize(displayedLoaded)} / ${formatFileSize(total)}</span>
                  </div>
                  <div class="task-progress-value">${Math.round(displayedProgress)}%</div>
                </div>
              `}
          <div class="task-meta">
            <div class="task-meta-info">
              ${t.kind === 'transfer' && t.speed()
                ? html`<span>${this.formatSpeed(t.speed())}</span>`
                : nothing}
              ${t.kind === 'transfer' && t.eta() && status === 'uploading'
                ? html`<span>${i18n('upload:remaining', {time: this.formatTime(t.eta())})}</span>`
                : nothing}
            </div>
            <div class="task-meta-actions">
              ${t.kind === 'transfer' && status === 'error'
                ? html`<cv-button size="small" variant="ghost" @click=${this.onRetryClick}
                    >${i18n('button:retry')}</cv-button
                  >`
                : nothing}
              ${t.kind === 'transfer' && status !== 'done'
                ? html`<cv-button size="small" variant="ghost" @click=${this.onCancelClick}
                    >${i18n('button:cancel')}</cv-button
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
