import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {nothing} from 'lit'

import {isTauriRuntime} from 'root/core/runtime/runtime'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {i18n} from 'root/i18n'
import {renderRouteBackLink} from 'root/shared/ui/route-back-link'

import {renderVolumeMountSection} from './remote-storage/sections/volume-mount-section'
import {remoteStorageStyles} from './remote-storage/remote-storage.styles'
import {renderRemoteStorageWizard} from './remote-storage/wizard/wizard-card'
import {renderConfirmStep} from './remote-storage/wizard/steps/confirm'
import {renderPasswordStep} from './remote-storage/wizard/steps/password'
import {renderProgressStep} from './remote-storage/wizard/steps/progress'
import {renderResultStep} from './remote-storage/wizard/steps/result'
import {remoteStorageModel} from './remote-storage/remote-storage.model'
import {renderRemoteStorageCallout} from './remote-storage/render-callout'

export class RemoteStoragePage extends ReatomLitElement {
  static define() {
    if (!customElements.get('remote-storage-page')) {
      customElements.define('remote-storage-page', this)
    }
  }

  static properties = {
    hideBackLink: {type: Boolean, attribute: 'hide-back-link'},
    externalToolbar: {type: Boolean, attribute: 'external-toolbar'},
  }

  declare hideBackLink: boolean
  declare externalToolbar: boolean

  static styles = remoteStorageStyles

  private readonly model = remoteStorageModel

  readonly transferStep = this.model.transferStep
  readonly targetDir = this.model.targetDir
  readonly masterPassword = this.model.masterPassword
  readonly progress = this.model.progress
  readonly transferResult = this.model.transferResult

  private unregisterBackHandler?: () => void

  constructor() {
    super()
    this.hideBackLink = false
    this.externalToolbar = false
    this.model.initialize()
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.unregisterBackHandler = navigationModel.registerSurfaceBackHandler('remote-storage', () =>
      this.model.handleMobileToolbarBack(),
    )
  }

  override disconnectedCallback(): void {
    this.unregisterBackHandler?.()
    this.unregisterBackHandler = undefined
    super.disconnectedCallback()
  }

  override updated(changed: Map<string, unknown>) {
    super.updated(changed)
    const progress = this.renderRoot.querySelector<HTMLElement>('.progress-fill[data-progress]')
    if (!progress) {
      return
    }

    progress.style.setProperty('--remote-storage-progress', `${progress.dataset['progress'] ?? '0'}%`)
  }

  private onBack = () => {
    this.model.closePage()
  }

  private startTransferWizard = () => {
    this.model.startTransferWizard()
  }

  private renderWizard() {
    const isCancelling = this.model.isCancelling()

    return renderRemoteStorageWizard({
      step: this.transferStep(),
      stepNumber: this.model.getStepNumber(this.transferStep()),
      transferResult: this.transferResult(),
      renderConfirmStep: () =>
        renderConfirmStep({
          targetDir: this.targetDir(),
          onSelectFolder: this.model.selectFolder,
          onBack: this.model.cancelWizard,
          onContinue: () => this.model.goToStep('password'),
        }),
      renderPasswordStep: () =>
        renderPasswordStep({
          password: this.masterPassword(),
          onPasswordInput: this.model.handlePasswordInput,
          onBack: () => this.model.goToStep('confirm'),
          onStartExport: this.model.startExport,
        }),
      renderProgressStep: () =>
        renderProgressStep({
          progress: this.progress(),
          percent: this.model.getProgressPercent(),
          getPhaseLabel: this.model.getPhaseLabel,
          formatBytes: this.model.formatBytes,
          onCancel: this.model.cancelExport,
          cancelDisabled: isCancelling,
          isCancelling,
        }),
      renderResultStep: () =>
        renderResultStep({
          result: this.transferResult(),
          onCopyPath: this.model.copyBackupPath,
          onClose: this.model.cancelWizard,
          onRetry: () => this.model.goToStep('password'),
        }),
    })
  }

  protected render() {
    const wizardActive = this.transferStep() !== 'idle'
    const isDesktop = isTauriRuntime()
    const volumeStatus = this.model.volume.status()

    return html`
      <div class="page">
        ${this.externalToolbar
          ? nothing
          : html`
              <header class="header">
                ${renderRouteBackLink({
                  hidden: this.hideBackLink,
                  label: i18n('remote-storage:back-to-storage'),
                  onBack: this.onBack,
                })}
                <div class="header-content">
                  <h1 class="title">${i18n('remote-storage:page-title')}</h1>
                  <p class="subtitle">${i18n('remote-storage:page-subtitle')}</p>
                </div>
              </header>
            `}

        <div class="quick-stats">
          <div class="stat-card stat-card-info">
            <div class="stat-icon">
              <cv-icon name="hard-drive"></cv-icon>
            </div>
            <div class="stat-content">
              <div class="stat-label">${i18n('remote-storage:stat-mode')}</div>
              <div class="stat-value">${isDesktop ? i18n('remote-storage:mode-local') : i18n('remote-storage:mode-browser')}</div>
            </div>
          </div>
          <div class="stat-card ${volumeStatus.state === 'mounted' ? 'stat-card-success' : 'stat-card-neutral'}">
            <div class="stat-icon">
              <cv-icon name="${volumeStatus.state === 'mounted' ? 'check-circle' : 'circle'}"></cv-icon>
            </div>
            <div class="stat-content">
              <div class="stat-label">${i18n('remote-storage:stat-volume')}</div>
              <div class="stat-value">${volumeStatus.state === 'mounted' ? i18n('remote-storage:volume-mounted') : i18n('remote-storage:volume-unmounted')}</div>
            </div>
          </div>
        </div>

        ${wizardActive
          ? this.renderWizard()
          : html`
              <div class="main-grid">
                ${renderVolumeMountSection({model: this.model})}

                <section class="card">
                  <div class="card-header">
                    <div class="card-header-main">
                      <div class="card-icon card-icon-success">
                        <cv-icon name="archive"></cv-icon>
                      </div>
                      <div class="card-title">
                        <div class="name">${i18n('remote-storage:backup-title')}</div>
                        <div class="hint">${i18n('remote-storage:backup-hint')}</div>
                      </div>
                    </div>
                    ${isDesktop
                      ? html`<span class="badge success">${i18n('remote-storage:available')}</span>`
                      : html`<span class="badge">${i18n('remote-storage:desktop-only')}</span>`}
                  </div>
                  <div class="card-body">
                    ${renderRemoteStorageCallout({
                      variant: 'info',
                      icon: 'info',
                      title: i18n('remote-storage:encrypted-export'),
                      text: i18n('remote-storage:encrypted-export-text'),
                    })}

                    <div class="actions-row">
                      <cv-button variant="primary" ?disabled=${!isDesktop} @click=${this.startTransferWizard}>
                        <cv-icon name="download" slot="prefix"></cv-icon>
                        ${i18n('remote-storage:export-to-folder')}
                      </cv-button>
                      <cv-button variant="default" disabled>
                        <cv-icon name="upload" slot="prefix"></cv-icon>
                        ${i18n('button:import')}
                      </cv-button>
                    </div>
                  </div>
                </section>
              </div>
            `}
      </div>
    `
  }
}

RemoteStoragePage.define()
