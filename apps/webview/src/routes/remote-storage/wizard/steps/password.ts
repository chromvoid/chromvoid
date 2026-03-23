import {html} from 'lit'

type PasswordStepInput = {
  password: string
  onPasswordInput: (e: Event) => void
  onBack: () => void
  onStartExport: () => void
}

export const renderPasswordStep = ({
  password,
  onPasswordInput,
  onBack,
  onStartExport,
}: PasswordStepInput) => html`
  <div class="wizard-header">
    <h3 class="wizard-title">Авторизация</h3>
    <p class="wizard-description">Введите master password для создания резервной копии.</p>
  </div>

  <div class="wizard-body">
    <div class="password-field">
      <label for="master-password">Master Password</label>
      <cv-input
        id="master-password"
        type="password"
        placeholder="Введите master password"
        .value=${password}
        @cv-input=${onPasswordInput}
        size="large"
      ></cv-input>
    </div>

    <div class="alert">
      <div class="alert-title">
        <cv-icon name="key"></cv-icon>
        Запомните пароль
      </div>
      <div class="alert-text">
        Этот же master password потребуется для восстановления данных из резервной копии. Убедитесь, что он
        надёжно сохранён.
      </div>
    </div>
  </div>

  <div class="wizard-actions">
    <cv-button variant="default" @click=${onBack}>
      <cv-icon name="arrow-left" slot="prefix"></cv-icon>
      Назад
    </cv-button>
    <cv-button variant="primary" ?disabled=${!password.trim()} @click=${onStartExport}>
      <cv-icon name="play" slot="prefix"></cv-icon>
      Начать экспорт
    </cv-button>
  </div>
`
