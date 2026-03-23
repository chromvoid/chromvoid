import {html} from 'lit'

import type {BackupProgressEvent} from '../../remote-storage.model'

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
    <h3 class="wizard-title">Экспорт выполняется</h3>
    <p class="wizard-description">
      ${isCancelling
        ? 'Запрос на отмену отправлен. Дождитесь завершения текущих операций.'
        : 'Пожалуйста, не закрывайте приложение до завершения.'}
    </p>
  </div>

  <div class="wizard-body">
    <div class="progress-container">
      <div class="progress-header">
        <span class="progress-phase">${progress ? getPhaseLabel(progress.phase) : 'Подготовка...'}</span>
        <span class="progress-percent">${percent}%</span>
      </div>

      <div class="progress-bar">
        <div class="progress-fill" style="width: ${percent}%"></div>
      </div>

      <div class="progress-stats">
        <span
          >${progress ? `Блок ${progress.chunk_index} из ${progress.chunk_count}` : 'Инициализация...'}</span
        >
        <span
          >${progress ? formatBytes(progress.bytes_written) : '0 B'} /
          ${progress ? formatBytes(progress.estimated_size) : '—'}</span
        >
      </div>
    </div>

    <div class="alert info">
      <div class="alert-title">
        <cv-icon name="loader" class="animate-spin"></cv-icon>
        ${isCancelling ? 'Остановка экспорта' : 'Выполняется резервное копирование'}
      </div>
      <div class="alert-text">
        ${isCancelling
          ? 'Ожидаем безопасную остановку процесса. Это может занять некоторое время.'
          : 'Данные шифруются и записываются на диск. Это может занять несколько минут в зависимости от размера хранилища.'}
      </div>
    </div>
  </div>

  <div class="wizard-actions">
    <cv-button variant="default" ?disabled=${cancelDisabled} @click=${onCancel}>
      <cv-icon name="x-circle" slot="prefix"></cv-icon>
      ${isCancelling ? 'Отмена...' : 'Отменить экспорт'}
    </cv-button>
  </div>
`
