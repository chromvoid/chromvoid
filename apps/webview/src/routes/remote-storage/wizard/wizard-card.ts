import {html, nothing} from 'lit'

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
          <div
            class="card-icon"
            style="--card-icon-bg: color-mix(in oklch, var(--cv-color-brand) 15%, var(--cv-color-surface)); --card-icon-color: var(--cv-color-brand);"
          >
            <cv-icon name="archive"></cv-icon>
          </div>
          <div class="card-title">
            <div class="name">Экспорт хранилища</div>
            <div class="hint">Шаг ${stepNumber} из 4</div>
          </div>
        </div>
        ${step === 'result' && transferResult?.success
          ? html`<span class="badge success">Завершено</span>`
          : html`<span class="badge info">В процессе</span>`}
      </div>
      <div class="card-body">
        <div class="wizard">
          <div class="wizard-progress">
            ${[1, 2, 3, 4].map((num, i) => html`
              ${i > 0 ? html`<div class="wizard-step-line ${num <= stepNumber ? 'completed' : ''}"></div>` : nothing}
              <div class="wizard-step-indicator ${num === stepNumber ? 'active' : num < stepNumber ? 'completed' : ''}">
                ${num < stepNumber ? html`<cv-icon name="check" style="font-size: 14px;"></cv-icon>` : num}
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
