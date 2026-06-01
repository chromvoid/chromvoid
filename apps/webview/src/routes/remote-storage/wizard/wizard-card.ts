import {html, nothing} from 'lit'
import {i18n} from 'root/i18n'

import {type TransferStep, type TransferResult} from '../remote-storage.model'

type WizardRenderer = () => ReturnType<typeof html>

type RemoteStorageWizardInput = {
  step: TransferStep
  stepNumber: number
  transferResult: TransferResult | null
  renderConfirmStep: WizardRenderer
  renderPasswordStep: WizardRenderer
  renderProgressStep: WizardRenderer
  renderResultStep: WizardRenderer
}

export const renderRemoteStorageWizard = ({
  step,
  stepNumber,
  transferResult,
  renderConfirmStep,
  renderPasswordStep,
  renderProgressStep,
  renderResultStep,
}: RemoteStorageWizardInput) => {
  if (step === 'idle') return nothing

  return html`
    <section class="card card-full">
      <div class="card-header">
        <div class="card-header-main">
          <div class="card-icon card-icon-primary">
            <cv-icon name="archive"></cv-icon>
          </div>
          <div class="card-title">
            <div class="name">${i18n('remote-storage:wizard-title')}</div>
            <div class="hint">${i18n('remote-storage:wizard-step-of', {step: stepNumber, total: 4})}</div>
          </div>
        </div>
        ${step === 'result' && transferResult?.success
          ? html`<span class="badge success">${i18n('remote-storage:wizard-completed')}</span>`
          : html`<span class="badge info">${i18n('remote-storage:wizard-in-progress')}</span>`}
      </div>
      <div class="card-body">
        <div class="wizard">
          <div class="wizard-progress">
            ${[1, 2, 3, 4].map((num, i) => html`
              ${i > 0 ? html`<div class="wizard-step-line ${num <= stepNumber ? 'completed' : ''}"></div>` : nothing}
              <div class="wizard-step-indicator ${num === stepNumber ? 'active' : num < stepNumber ? 'completed' : ''}">
                ${num < stepNumber ? html`<cv-icon class="wizard-step-check-icon" name="check"></cv-icon>` : num}
              </div>
            `)}
          </div>

          <div class="wizard-content">
            ${step === 'confirm' ? renderConfirmStep() : nothing}
            ${step === 'password' ? renderPasswordStep() : nothing}
            ${step === 'progress' ? renderProgressStep() : nothing}
            ${step === 'result' ? renderResultStep() : nothing}
          </div>
        </div>
      </div>
    </section>
  `
}
