import {html, nothing} from 'lit'
import {i18n} from 'root/i18n'

import type {TransferResult} from '../../remote-storage.model'
import {renderRemoteStorageCallout} from '../../render-callout'

type ResultStepInput = {
  result: TransferResult | null
  onCopyPath: () => void
  onClose: () => void
  onRetry: () => void
}

export const renderResultStep = ({result, onCopyPath, onClose, onRetry}: ResultStepInput) => {
  if (!result) {
    return html`
      <div class="wizard-body">
        ${renderRemoteStorageCallout({
          variant: 'info',
          text: i18n('remote-storage:result-loading'),
        })}
      </div>
    `
  }

  if (result.success) {
    return html`
      <div class="wizard-body">
        <div class="result">
          <div class="result-icon success motion-success-check">
            <cv-icon name="check"></cv-icon>
          </div>
          <p class="result-message">${i18n('remote-storage:result-success')}</p>
          <p class="result-hint">${i18n('remote-storage:result-success-hint')}</p>
        </div>

        ${result.backupDir
          ? html`
              ${renderRemoteStorageCallout({
                variant: 'success',
                icon: 'folder-check',
                title: i18n('remote-storage:files-saved'),
              })}
              <div class="path-display">
                <cv-icon name="folder"></cv-icon>
                ${result.backupDir}
              </div>
            `
          : nothing}
      </div>

      <div class="wizard-actions">
        ${result.backupDir
          ? html`
              <cv-button variant="default" @click=${onCopyPath}>
                <cv-icon name="copy" slot="prefix"></cv-icon>
                ${i18n('remote-storage:copy-path')}
              </cv-button>
            `
          : nothing}
        <cv-button variant="primary" @click=${onClose}>
          <cv-icon name="check" slot="prefix"></cv-icon>
          ${i18n('button:done')}
        </cv-button>
      </div>
    `
  }

  const isCancelled = result.code === 'CANCELLED'

  return html`
    <div class="wizard-body">
      <div class="result">
        <div class="result-icon error">
          <cv-icon name="x"></cv-icon>
        </div>
        <p class="result-message">${isCancelled ? i18n('remote-storage:result-cancelled') : i18n('remote-storage:result-error')}</p>
        <p class="result-hint">
          ${isCancelled ? i18n('remote-storage:result-cancelled-hint') : i18n('remote-storage:result-error-hint')}
        </p>
      </div>

      ${renderRemoteStorageCallout({
        variant: isCancelled ? 'info' : 'danger',
        icon: isCancelled ? 'info' : 'alert-triangle',
        title: isCancelled ? i18n('remote-storage:operation-status') : i18n('remote-storage:error-details'),
        text:
          result.error ||
          (isCancelled ? i18n('remote-storage:export-cancelled') : i18n('remote-storage:error-unknown-retry')),
      })}
    </div>

    <div class="wizard-actions">
      <cv-button variant="default" @click=${onClose}>${i18n('button:close')}</cv-button>
      <cv-button variant="primary" @click=${onRetry}>
        <cv-icon name="refresh-cw" slot="prefix"></cv-icon>
        ${isCancelled ? i18n('remote-storage:run-again') : i18n('button:retry')}
      </cv-button>
    </div>
  `
}
