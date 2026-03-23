import {html} from 'lit'

type ConfirmStepInput = {
  targetDir: string | null
  onSelectFolder: () => void
  onBack: () => void
  onContinue: () => void
}

export const renderConfirmStep = ({targetDir, onSelectFolder, onBack, onContinue}: ConfirmStepInput) => html`
  <div class="wizard-header">
    <h3 class="wizard-title">Выберите место сохранения</h3>
    <p class="wizard-description">Укажите папку для сохранения резервной копии хранилища.</p>
  </div>

  <div class="wizard-body">
    <div class="alert info">
      <div class="alert-title">
        <cv-icon name="info"></cv-icon>
        Что будет экспортировано
      </div>
      <div class="alert-text">
        Полная зашифрованная копия хранилища со всеми vault'ами и файлами. Для восстановления потребуется
        master password.
      </div>
    </div>

    <div class="field-group">
      <cv-button variant="${targetDir ? 'default' : 'primary'}" @click=${onSelectFolder}>
        <cv-icon name="folder" slot="prefix"></cv-icon>
        ${targetDir ? 'Изменить папку' : 'Выбрать папку'}
      </cv-button>

      ${targetDir
        ? html`
            <div class="path-display">
              <cv-icon name="folder-open"></cv-icon>
              ${targetDir}
            </div>
          `
        : html`
            <div class="alert">
              <div class="alert-text">
                Если папка не выбрана, резервная копия будет сохранена в папку приложения по умолчанию.
              </div>
            </div>
          `}
    </div>
  </div>

  <div class="wizard-actions">
    <cv-button variant="default" @click=${onBack}>
      <cv-icon name="arrow-left" slot="prefix"></cv-icon>
      Назад
    </cv-button>
    <cv-button variant="primary" @click=${onContinue}>
      Продолжить
      <cv-icon name="arrow-right" slot="suffix"></cv-icon>
    </cv-button>
  </div>
`
