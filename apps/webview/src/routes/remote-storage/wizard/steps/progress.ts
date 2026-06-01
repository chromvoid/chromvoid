import {html} from 'lit'
import {i18n} from 'root/i18n'

import type {BackupProgressEvent} from '../../remote-storage.model'
import {renderRemoteStorageCallout} from '../../render-callout'

type ProgressStepInput = {
  progress: BackupProgressEvent | null
  percent: number
  getPhaseLabel: (phase: string) => string
  formatBytes: (bytes: number) => string
  onCancel: () => void
  cancelDisabled: boolean
  isCancelling: boolean
}

export const renderProgressStep = ({
  progress,
  percent,
  getPhaseLabel,
  formatBytes,
  onCancel,
  cancelDisabled,
  isCancelling,
}: ProgressStepInput) => html`
  <div class="wizard-header">
    <h3 class="wizard-title">${i18n('remote-storage:progress-title')}</h3>
    <p class="wizard-description">
      ${isCancelling ? i18n('remote-storage:progress-cancel-description') : i18n('remote-storage:progress-description')}
    </p>
  </div>

  <div class="wizard-body">
    <div class="progress-container">
      <div class="progress-header">
        <span class="progress-phase">${progress ? getPhaseLabel(progress.phase) : i18n('remote-storage:phase-starting')}</span>
        <span class="progress-percent">${percent}%</span>
      </div>

      <div class="progress-bar">
        <div class="progress-fill" data-progress=${percent.toFixed(1)}></div>
      </div>

      <div class="progress-stats">
        <span
          >${progress
            ? i18n('remote-storage:progress-block', {
                current: progress.chunk_index,
                total: progress.chunk_count,
              })
            : i18n('remote-storage:progress-initializing')}</span
        >
        <span
          >${progress ? formatBytes(progress.bytes_written) : '0 B'} /
          ${progress ? formatBytes(progress.estimated_size) : '—'}</span
        >
      </div>
    </div>

    ${renderRemoteStorageCallout({
      variant: 'info',
      icon: 'loader',
      iconClass: 'animate-spin',
      title: isCancelling ? i18n('remote-storage:backup-stopping') : i18n('remote-storage:backup-running'),
      text: isCancelling ? i18n('remote-storage:backup-stopping-text') : i18n('remote-storage:backup-running-text'),
    })}
  </div>

  <div class="wizard-actions">
    <cv-button variant="default" ?disabled=${cancelDisabled} @click=${onCancel}>
      <cv-icon name="x-circle" slot="prefix"></cv-icon>
      ${isCancelling ? i18n('remote-storage:canceling-export') : i18n('remote-storage:cancel-export')}
    </cv-button>
  </div>
`
