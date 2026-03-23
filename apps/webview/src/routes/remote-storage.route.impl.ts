import {XLitElement} from '@statx/lit'
import {html, nothing} from 'lit'

import {isTauriRuntime} from 'root/core/runtime/runtime'
import {navigationModel} from 'root/app/navigation/navigation.model'

import {renderVolumeMountSection} from './remote-storage/sections/volume-mount-section'
import {remoteStorageStyles} from './remote-storage/remote-storage.styles'
import {renderRemoteStorageWizard} from './remote-storage/wizard/wizard-card'
import {renderConfirmStep} from './remote-storage/wizard/steps/confirm'
import {renderPasswordStep} from './remote-storage/wizard/steps/password'
import {renderProgressStep} from './remote-storage/wizard/steps/progress'
import {renderResultStep} from './remote-storage/wizard/steps/result'
import {RemoteStorageModel} from './remote-storage/remote-storage.model'

export class RemoteStoragePage extends XLitElement {
  static define() {
    if (!customElements.get('remote-storage-page')) {
      customElements.define('remote-storage-page', this)
    }
  }

  static properties = {
    hideBackLink: {type: Boolean, attribute: 'hide-back-link'},
  }

  declare hideBackLink: boolean

  static styles = remoteStorageStyles

  private readonly model = new RemoteStorageModel()

  readonly transferStep = this.model.transferStep
  readonly targetDir = this.model.targetDir
  readonly masterPassword = this.model.masterPassword
  readonly progress = this.model.progress
  readonly transferResult = this.model.transferResult

  private unregisterBackHandler?: () => void

  constructor() {
    super()
    this.hideBackLink = false
    this.model.initialize()
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.unregisterBackHandler = navigationModel.registerSurfaceBackHandler('remote-storage', () =>
      this.handleMobileToolbarBack(),
    )
  }

  override disconnectedCallback(): void {
    this.unregisterBackHandler?.()
    this.unregisterBackHandler = undefined
    super.disconnectedCallback()
  }

  private onBack = () => {
    this.model.closePage()
  }

  getMobileToolbarContext(): {
    title: string
    canGoBack: boolean
    backDisabled: boolean
    showCommand: boolean
  } {
    return this.model.getMobileToolbarContext()
  }

  handleMobileToolbarBack(): boolean {
    return this.model.handleMobileToolbarBack()
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
        <header class="header">
          ${this.hideBackLink
            ? nothing
            : html`<button class="back-link" @click=${this.onBack}>
                <cv-icon name="arrow-left"></cv-icon>
                Назад к хранилищу
              </button>`}
          <div class="header-content">
            <h1 class="title">Хранилище и устройства</h1>
            <p class="subtitle">
              Управление монтированием томов и резервным копированием данных
            </p>
          </div>
        </header>

        <div class="quick-stats">
          <div
            class="stat-card"
            style="--stat-bg: color-mix(in oklch, var(--cv-color-info) 12%, var(--cv-color-surface)); --stat-color: var(--cv-color-info);"
          >
            <div class="stat-icon">
              <cv-icon name="hard-drive"></cv-icon>
            </div>
            <div class="stat-content">
              <div class="stat-label">Режим</div>
              <div class="stat-value">${isDesktop ? 'Локальный' : 'Браузер'}</div>
            </div>
          </div>
          <div
            class="stat-card"
            style="--stat-bg: color-mix(in oklch, ${volumeStatus.state === 'mounted'
              ? 'var(--cv-color-success)'
              : 'var(--cv-color-text-muted)'} 12%, var(--cv-color-surface)); --stat-color: ${volumeStatus.state ===
            'mounted'
              ? 'var(--cv-color-success)'
              : 'var(--cv-color-text-muted)'};"
          >
            <div class="stat-icon">
              <cv-icon name="${volumeStatus.state === 'mounted' ? 'check-circle' : 'circle'}"></cv-icon>
            </div>
            <div class="stat-content">
              <div class="stat-label">Том</div>
              <div class="stat-value">${volumeStatus.state === 'mounted' ? 'Подключён' : 'Отключён'}</div>
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
                      <div
                        class="card-icon"
                        style="--card-icon-bg: color-mix(in oklch, var(--cv-color-success) 15%, var(--cv-color-surface)); --card-icon-color: var(--cv-color-success);"
                      >
                        <cv-icon name="archive"></cv-icon>
                      </div>
                      <div class="card-title">
                        <div class="name">Резервное копирование</div>
                        <div class="hint">Экспорт данных</div>
                      </div>
                    </div>
                    ${isDesktop
                      ? html`<span class="badge success">Доступно</span>`
                      : html`<span class="badge">Desktop</span>`}
                  </div>
                  <div class="card-body">
                    <div class="alert info">
                      <div class="alert-title">
                        <cv-icon name="info"></cv-icon>
                        Зашифрованный экспорт
                      </div>
                      <div class="alert-text">
                        Создайте полную копию хранилища, защищённую master password. Используйте для
                        резервного копирования или переноса данных.
                      </div>
                    </div>

                    <div class="actions-row">
                      <cv-button variant="primary" ?disabled=${!isDesktop} @click=${this.startTransferWizard}>
                        <cv-icon name="download" slot="prefix"></cv-icon>
                        Экспорт в папку
                      </cv-button>
                      <cv-button variant="default" disabled>
                        <cv-icon name="upload" slot="prefix"></cv-icon>
                        Импорт
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
