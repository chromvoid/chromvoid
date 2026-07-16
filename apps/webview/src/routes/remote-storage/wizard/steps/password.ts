import {html} from 'lit'
import {i18n} from 'root/i18n'

import {renderRemoteStorageCallout} from '../../render-callout'

type PasswordStepInput = {
  password: string
  passwordError: string
  onPasswordInput: (e: Event) => void
  onBack: () => void
  onStartExport: () => Promise<void>
}

export const renderPasswordStep = ({
  password,
  passwordError,
  onPasswordInput,
  onBack,
  onStartExport,
}: PasswordStepInput) => html`
  <div class="wizard-header">
    <h3 class="wizard-title">${i18n('remote-storage:password-title')}</h3>
    <p class="wizard-description">${i18n('remote-storage:password-description')}</p>
  </div>

  <div class="wizard-body">
    <cv-field class="password-field" ?invalid=${Boolean(passwordError)} required>
      <span slot="label">${i18n('welcome:master-password')}</span>
      <cv-input
        id="master-password"
        type="password"
        password-toggle
        autocomplete="current-password"
        placeholder=${i18n('welcome:master-password')}
        .value=${password}
        @cv-input=${onPasswordInput}
        size="large"
      ></cv-input>
      ${passwordError ? html`<span slot="error">${passwordError}</span>` : ''}
    </cv-field>

    ${renderRemoteStorageCallout({
      variant: 'warning',
      icon: 'key',
      title: i18n('remote-storage:remember-password'),
      text: i18n('remote-storage:remember-password-text'),
    })}
  </div>

  <div class="wizard-actions">
    <cv-button variant="default" @click=${onBack}>
      <cv-icon name="arrow-left" slot="prefix"></cv-icon>
      ${i18n('button:back')}
    </cv-button>
    <cv-button variant="primary" @click=${onStartExport}>
      <cv-icon name="play" slot="prefix"></cv-icon>
      ${i18n('remote-storage:start-export')}
    </cv-button>
  </div>
`
