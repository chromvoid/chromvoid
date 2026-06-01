import {html} from 'lit'
import {i18n} from 'root/i18n'

import {renderRemoteStorageCallout} from '../../render-callout'

type ConfirmStepInput = {
  targetDir: string | null
  onSelectFolder: () => void
  onBack: () => void
  onContinue: () => void
}

export const renderConfirmStep = ({targetDir, onSelectFolder, onBack, onContinue}: ConfirmStepInput) => html`
  <div class="wizard-header">
    <h3 class="wizard-title">${i18n('remote-storage:confirm-title')}</h3>
    <p class="wizard-description">${i18n('remote-storage:confirm-description')}</p>
  </div>

  <div class="wizard-body">
    ${renderRemoteStorageCallout({
      variant: 'info',
      icon: 'info',
      title: i18n('remote-storage:what-exported'),
      text: i18n('remote-storage:what-exported-text'),
    })}

    <div class="field-group">
      <cv-button variant="${targetDir ? 'default' : 'primary'}" @click=${onSelectFolder}>
        <cv-icon name="folder" slot="prefix"></cv-icon>
        ${targetDir ? i18n('remote-storage:change-folder') : i18n('remote-storage:choose-folder')}
      </cv-button>

      ${targetDir
        ? html`
            <div class="path-display">
              <cv-icon name="folder-open"></cv-icon>
              ${targetDir}
            </div>
          `
        : html`
            ${renderRemoteStorageCallout({
              variant: 'warning',
              text: i18n('remote-storage:default-folder-info'),
            })}
          `}
    </div>
  </div>

  <div class="wizard-actions">
    <cv-button variant="default" @click=${onBack}>
      <cv-icon name="arrow-left" slot="prefix"></cv-icon>
      ${i18n('button:back')}
    </cv-button>
    <cv-button variant="primary" @click=${onContinue}>
      ${i18n('button:continue')}
      <cv-icon name="arrow-right" slot="suffix"></cv-icon>
    </cv-button>
  </div>
`
