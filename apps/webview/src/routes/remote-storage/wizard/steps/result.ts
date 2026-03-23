import {html, nothing} from 'lit'

import type {TransferResult} from '../../remote-storage.model'

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
        <div class="alert info">
          <div class="alert-text">Загрузка результатов...</div>
        </div>
      </div>
    `
  }

  if (result.success) {
    return html`
      <div class="wizard-body">
        <div class="result">
          <div class="result-icon success">
            <cv-icon name="check"></cv-icon>
          </div>
          <p class="result-message">Экспорт завершён успешно</p>
          <p class="result-hint">Резервная копия хранилища создана и сохранена на диск</p>
        </div>

        ${result.backupDir
          ? html`
              <div class="alert success">
                <div class="alert-title">
                  <cv-icon name="folder-check"></cv-icon>
                  Файлы сохранены
                </div>
              </div>
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
                Скопировать путь
              </cv-button>
            `
          : nothing}
        <cv-button variant="primary" @click=${onClose}>
          <cv-icon name="check" slot="prefix"></cv-icon>
          Готово
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
        <p class="result-message">${isCancelled ? 'Экспорт отменён' : 'Ошибка экспорта'}</p>
        <p class="result-hint">
          ${isCancelled
            ? 'Операция была остановлена по запросу пользователя.'
            : 'Не удалось создать резервную копию'}
        </p>
      </div>

      <div class="alert ${isCancelled ? 'info' : 'danger'}">
        <div class="alert-title">
          <cv-icon name="${isCancelled ? 'info' : 'alert-triangle'}"></cv-icon>
          ${isCancelled ? 'Статус операции' : 'Подробности ошибки'}
        </div>
        <div class="alert-text">
          ${result.error || (isCancelled ? 'Экспорт отменён.' : 'Неизвестная ошибка. Попробуйте ещё раз.')}
        </div>
      </div>
    </div>

    <div class="wizard-actions">
      <cv-button variant="default" @click=${onClose}>Закрыть</cv-button>
      <cv-button variant="primary" @click=${onRetry}>
        <cv-icon name="refresh-cw" slot="prefix"></cv-icon>
        ${isCancelled ? 'Запустить снова' : 'Повторить'}
      </cv-button>
    </div>
  `
}
