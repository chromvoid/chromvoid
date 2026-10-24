import {CVBottomSheet, type CVBottomSheetChangeEvent} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {CVSwitch, type CVSwitchChangeEvent} from '@chromvoid/uikit/components/cv-switch'
import {html} from '@chromvoid/uikit/reatom-lit'
import {nothing, type PropertyValues, type TemplateResult} from 'lit'

import {navigationModel} from 'root/app/navigation/navigation.model'
import type {SettingsRoute} from 'root/app/navigation/navigation.types'
import {i18n} from 'root/i18n'
import {isLegalDocument} from 'root/shared/services/legal-documents.model'
import {SettingsMobileUiModel} from './settings-mobile-ui.model'
import {renderMacosCredentialProviderCapabilities} from './settings-credential-provider-capabilities'
import {SettingsPageLayoutBase} from './settings-page-layout-base'
import {settingsPageMobileStyles} from './settings-page-mobile.styles'
import {renderSettingsMobileSheets} from './settings-page-mobile.sheets'
import {SettingsVaultRekeyForm} from './settings-vault-rekey-form'
import type {SettingsPreferenceKey} from './settings.model'

type SettingsCategoryRoute = Extract<SettingsRoute, {kind: 'security' | 'autofill' | 'files' | 'passwords'}>

export class SettingsPageMobileLayout extends SettingsPageLayoutBase {
  static elementName = 'settings-page-mobile-layout'
  static styles = settingsPageMobileStyles

  private readonly uiModel = new SettingsMobileUiModel()
  private unregisterNavigationGuard?: () => void
  private lastRouteKind: SettingsRoute['kind'] | null = null
  private importTaskPreparing = false

  static define(): void {
    CVBottomSheet.define()
    CVSwitch.define()
    SettingsVaultRekeyForm.define()
    if (!customElements.get(this.elementName)) customElements.define(this.elementName, this)
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.unregisterNavigationGuard = navigationModel.registerNavigationBlocker((intent) => {
      const currentRoute = intent.current.settings ?? {kind: 'overview'}
      const nextRoute = intent.next.settings ?? {kind: 'overview'}
      const leavesActiveRekey =
        intent.current.surface === 'settings' &&
        currentRoute.kind === 'vault-rekey' &&
        (intent.next.surface !== 'settings' || nextRoute.kind !== 'vault-rekey')

      return leavesActiveRekey && this.model.vaultRekey.busy()
    })
  }

  disconnectedCallback(): void {
    this.unregisterNavigationGuard?.()
    this.unregisterNavigationGuard = undefined
    this.model.cancelPasswordImportTaskPreparation()
    this.importTaskPreparing = false
    super.disconnectedCallback()
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties)
    const rawRoute = navigationModel.settingsRoute()
    const previousRouteKind = this.lastRouteKind

    this.model.cancelPasswordImportTaskForRouteChange(previousRouteKind, rawRoute.kind)
    if (previousRouteKind === 'password-import' && rawRoute.kind !== previousRouteKind) {
      this.importTaskPreparing = false
    }

    if (!this.model.isRouteAvailable(rawRoute)) {
      navigationModel.navigateToSettingsRoute({kind: 'overview'}, 'replace')
      return
    }

    if (previousRouteKind !== rawRoute.kind) {
      this.restoreRouteFocus(previousRouteKind, rawRoute.kind)
      this.lastRouteKind = rawRoute.kind
    }

    if (rawRoute.kind === 'password-import') {
      void this.ensurePasswordImportTaskReady()
    }
  }

  private async ensurePasswordImportTaskReady(): Promise<void> {
    if (this.importTaskPreparing || this.model.passwordImportDialogOpen()) return
    this.importTaskPreparing = true
    await this.model.ensurePasswordImportTaskReady()
    this.importTaskPreparing = false
  }

  private restoreRouteFocus(previous: SettingsRoute['kind'] | null, current: SettingsRoute['kind']): void {
    if (previous === null) return
    const target =
      current === 'overview'
        ? this.renderRoot.querySelector<HTMLElement>(`[data-settings-route="${previous}"]`)
        : this.renderRoot.querySelector<HTMLElement>('#settings-mobile-heading')
    target?.focus({preventScroll: true})
  }

  private handleOpenRoute(event: Event): void {
    const kind = (event.currentTarget as HTMLElement).dataset['settingsRoute'] as
      | SettingsCategoryRoute['kind']
      | undefined
    if (kind) navigationModel.navigateToSettingsRoute({kind})
  }

  private handleOpenLanguage(): void {
    this.uiModel.openLanguage()
  }

  private handleOpenAutoLock(): void {
    this.uiModel.openAutoLock()
  }

  private handleOpenAttachmentFolder(): void {
    this.uiModel.openAttachmentFolder(this.model.settings().markdown_attachment_folder_path)
  }

  private handleSheetChange(event: CVBottomSheetChangeEvent): void {
    if (event.detail.open === false) this.uiModel.closeSheet()
  }

  private handleLanguageSelect(event: Event): void {
    const value = (event.currentTarget as HTMLElement).dataset['value']
    if (!value) return
    this.model.setLanguage(value)
    this.uiModel.closeSheet()
  }

  private async handleAutoLockSelect(event: Event): Promise<void> {
    const value = (event.currentTarget as HTMLElement).dataset['value']
    if (!value) return
    if (await this.model.setAutoLockTimeout(value)) this.uiModel.closeSheet()
  }

  private handleAttachmentFolderInput(event: Event): void {
    this.uiModel.setAttachmentFolderDraft((event.target as HTMLInputElement).value)
  }

  private async handleAttachmentFolderSave(): Promise<void> {
    const saved = await this.model.setMarkdownAttachmentFolderPath(this.uiModel.attachmentFolderDraft())
    if (saved) this.uiModel.closeSheet()
  }

  private handleLockOnSleepChange(event: CVSwitchChangeEvent): void {
    void this.model.setLockOnSleep(event.detail.checked)
  }

  private handleBiometricChange(event: CVSwitchChangeEvent): void {
    void this.model.setRequireBiometricAppGate(event.detail.checked)
  }

  private handleKeepAwakeChange(event: CVSwitchChangeEvent): void {
    void this.model.setKeepScreenAwakeWhenUnlocked(event.detail.checked)
  }

  private handleAutoMountChange(event: CVSwitchChangeEvent): void {
    void this.model.setAutoMountAfterUnlock(event.detail.checked)
  }

  private handleConfirmDeletionChange(event: CVSwitchChangeEvent): void {
    void this.model.setConfirmFileDeletion(event.detail.checked)
  }

  private handleShowHiddenChange(event: CVSwitchChangeEvent): void {
    void this.model.setShowHiddenFiles(event.detail.checked)
  }

  private handleOpenCredentialProviderSettings(): void {
    void this.model.openCredentialProviderSettings()
  }

  private handleLegalDocumentClick(event: Event): void {
    event.preventDefault()
    const legalDocument = (event.currentTarget as HTMLElement).dataset['legalDocument']
    if (isLegalDocument(legalDocument)) void this.model.legalDocuments.open(legalDocument)
  }

  private handlePasswordImport(): void {
    void this.model.openPasswordImportTask()
  }

  private handlePasswordExport(): void {
    void this.model.exportPasswords()
  }

  private handlePasswordClean(): void {
    void this.model.cleanPasswords()
  }

  private handleOpenVaultRekey(): void {
    this.model.openVaultRekeyTask()
  }

  private handlePasswordImportComplete(event: Event): void {
    event.stopPropagation()
    void this.model.handlePasswordImportComplete(event)
  }

  private handlePasswordImportClose(event?: Event): void {
    event?.stopPropagation()
    this.model.closePasswordImportTask()
  }

  protected render(): TemplateResult {
    const route = this.model.resolveAvailableRoute(navigationModel.settingsRoute())

    return html`
      <main class="mobile-page page-transition">
        ${route.kind === 'overview' ? this.renderOverview() : this.renderDetail(route)}
        ${renderSettingsMobileSheets({
          model: this.model,
          uiModel: this.uiModel,
          handlers: {
            handleSheetChange: this.handleSheetChange,
            handleLanguageSelect: this.handleLanguageSelect,
            handleAutoLockSelect: this.handleAutoLockSelect,
            handleAttachmentFolderInput: this.handleAttachmentFolderInput,
            handleAttachmentFolderSave: this.handleAttachmentFolderSave,
          },
        })}
      </main>
    `
  }

  private renderOverview(): TemplateResult {
    return html`
      <section class="overview" aria-labelledby="settings-mobile-heading">
        <h1 id="settings-mobile-heading" class="sr-only" tabindex="-1">${i18n('settings:title')}</h1>
        ${this.renderOverviewSection(i18n('settings:group-security'), [
          this.renderOverviewRow(
            'security',
            'shield-check',
            i18n('settings:security-title'),
            this.model.autoLockSummary(),
          ),
          this.model.showsCredentialProviderSection()
            ? this.renderOverviewRow(
                'autofill',
                'smartphone',
                i18n('settings:provider-title'),
                this.model.credentialProviderSummary(),
              )
            : nothing,
        ])}
        ${this.renderOverviewSection(i18n('settings:group-data'), [
          this.renderOverviewRow(
            'files',
            'folder-cog',
            i18n('settings:files-storage-title'),
            i18n('settings:files-storage-summary'),
          ),
          this.renderOverviewRow(
            'passwords',
            'key-round',
            i18n('settings:password-vault-title'),
            i18n('settings:password-vault-summary'),
          ),
        ])}
        ${this.renderOverviewSection(i18n('settings:application'), [
          html`
            <button class="overview-row" type="button" @click=${this.handleOpenLanguage}>
              <span class="overview-icon" aria-hidden="true"><cv-icon name="languages"></cv-icon></span>
              <span class="overview-copy">
                <span class="overview-title">${i18n('settings:language-title')}</span>
                <span class="overview-summary">${this.model.currentLanguageLabel()}</span>
              </span>
              <cv-icon name="chevron-right" aria-hidden="true"></cv-icon>
            </button>
          `,
        ])}
        ${this.renderOverviewSection(
          i18n('settings:about-title'),
          this.model.legalDocuments.links().map(
            (link) => html`
              <a
                class="overview-row"
                href=${link.href}
                target="_blank"
                rel="noopener noreferrer"
                data-legal-document=${link.document}
                @click=${this.handleLegalDocumentClick}
              >
                <span class="overview-icon" aria-hidden="true"><cv-icon name=${link.icon}></cv-icon></span>
                <span class="overview-copy">
                  <span class="overview-title">${link.label}</span>
                  <span class="overview-summary">${i18n('legal:opens-in-browser')}</span>
                </span>
                <cv-icon name="external-link" aria-hidden="true"></cv-icon>
              </a>
            `,
          ),
        )}
      </section>
    `
  }

  private renderOverviewSection(title: string, rows: unknown[]): TemplateResult {
    return html`
      <section class="overview-section">
        <h2 class="group-label">${title}</h2>
        <div class="overview-group">${rows}</div>
      </section>
    `
  }

  private renderOverviewRow(
    kind: SettingsCategoryRoute['kind'],
    icon: string,
    title: string,
    summary: string,
  ): TemplateResult {
    return html`
      <button class="overview-row" type="button" data-settings-route=${kind} @click=${this.handleOpenRoute}>
        <span class="overview-icon" aria-hidden="true"><cv-icon name=${icon}></cv-icon></span>
        <span class="overview-copy">
          <span class="overview-title">${title}</span>
          <span class="overview-summary">${summary}</span>
        </span>
        <cv-icon name="chevron-right" aria-hidden="true"></cv-icon>
      </button>
    `
  }

  private renderDetail(route: Exclude<SettingsRoute, {kind: 'overview'}>): TemplateResult {
    const title = this.routeTitle(route)
    return html`
      <section
        class=${route.kind === 'vault-rekey' || route.kind === 'password-import' ? 'task' : 'detail'}
        aria-labelledby="settings-mobile-heading"
      >
        <h1 id="settings-mobile-heading" class="sr-only" tabindex="-1">${title}</h1>
        ${route.kind === 'security'
          ? this.renderSecurity()
          : route.kind === 'autofill'
            ? this.renderAutofill()
            : route.kind === 'files'
              ? this.renderFiles()
              : route.kind === 'passwords'
                ? this.renderPasswords()
                : route.kind === 'vault-rekey'
                  ? html`<settings-vault-rekey-form .showTitle=${false}></settings-vault-rekey-form>`
                  : this.renderPasswordImportTask()}
      </section>
    `
  }

  private routeTitle(route: Exclude<SettingsRoute, {kind: 'overview'}>): string {
    switch (route.kind) {
      case 'security':
        return i18n('settings:security-title')
      case 'autofill':
        return i18n('settings:provider-title')
      case 'files':
        return i18n('settings:files-storage-title')
      case 'passwords':
        return i18n('settings:password-vault-title')
      case 'vault-rekey':
        return i18n('settings:vault-password-title')
      case 'password-import':
        return i18n('settings:passwords-maintenance-import')
    }
  }

  private renderSecurity(): TemplateResult {
    const settings = this.model.settings()
    return html`
      <div class="detail-stack">
        <div class="settings-group">
          ${this.renderPickerRow(
            i18n('settings:auto-lock-after'),
            i18n('settings:auto-lock-hint'),
            this.model.autoLockSummary(),
            this.handleOpenAutoLock,
          )}
          ${this.renderSwitchRow(
            'lock_on_sleep',
            i18n('settings:lock-on-sleep'),
            i18n('settings:lock-on-background-hint'),
            this.model.isLockOnSleepEnabled(),
            this.handleLockOnSleepChange,
          )}
          ${this.model.showsMobileAutofillLockConflict()
            ? html`<cv-callout class="route-callout" variant="warning" density="dense">
                ${i18n('settings:autofill-incompatible')}
              </cv-callout>`
            : nothing}
          ${this.model.isMobileBiometricSupported()
            ? this.renderSwitchRow(
                'require_biometric_app_gate',
                i18n('settings:require-biometrics'),
                i18n('settings:require-biometrics-hint'),
                settings.require_biometric_app_gate,
                this.handleBiometricChange,
              )
            : nothing}
          ${this.model.isIosRuntime()
            ? this.renderSwitchRow(
                'keep_screen_awake_when_unlocked',
                i18n('settings:keep-screen-awake'),
                i18n('settings:keep-screen-awake-hint'),
                settings.keep_screen_awake_when_unlocked,
                this.handleKeepAwakeChange,
              )
            : nothing}
        </div>
      </div>
    `
  }

  private renderFiles(): TemplateResult {
    const settings = this.model.settings()
    return html`
      <div class="settings-group">
        ${this.renderSwitchRow(
          'auto_mount_after_unlock',
          i18n('settings:auto-mount'),
          '',
          settings.auto_mount_after_unlock,
          this.handleAutoMountChange,
        )}
        ${this.renderSwitchRow(
          'confirm_file_deletion',
          i18n('settings:confirm-file-deletion'),
          i18n('settings:confirm-file-deletion-hint'),
          settings.confirm_file_deletion,
          this.handleConfirmDeletionChange,
        )}
        ${this.renderSwitchRow(
          'show_hidden_files',
          i18n('settings:show-hidden-files'),
          i18n('settings:show-hidden-files-hint'),
          settings.show_hidden_files,
          this.handleShowHiddenChange,
        )}
        ${this.renderPickerRow(
          i18n('settings:markdown-attachment-folder'),
          i18n('settings:markdown-attachment-folder-hint'),
          settings.markdown_attachment_folder_path,
          this.handleOpenAttachmentFolder,
        )}
      </div>
    `
  }

  private renderPasswords(): TemplateResult {
    const busyAction = this.model.passwordMaintenanceBusyAction()
    const busy = Boolean(busyAction)
    return html`
      <div class="detail-stack">
        <div class="settings-group">
          ${this.renderActionRow(
            i18n('settings:passwords-maintenance-import'),
            i18n('settings:password-import-summary'),
            'cloud-upload',
            this.handlePasswordImport,
            busy,
            busyAction === 'import',
          )}
          ${this.renderActionRow(
            i18n('settings:passwords-maintenance-export'),
            i18n('settings:password-export-summary'),
            'download',
            this.handlePasswordExport,
            busy,
            busyAction === 'export',
          )}
          ${this.renderActionRow(
            i18n('settings:vault-password-title'),
            i18n('settings:vault-password-mobile-summary'),
            'key-round',
            this.handleOpenVaultRekey,
            this.model.vaultRekey.busy(),
          )}
        </div>
        <section class="danger-zone" aria-labelledby="settings-danger-title">
          <h2 id="settings-danger-title" class="group-label">${i18n('settings:danger-zone')}</h2>
          ${this.renderActionRow(
            i18n('settings:passwords-maintenance-clear'),
            i18n('settings:password-clear-summary'),
            'trash',
            this.handlePasswordClean,
            busy,
            busyAction === 'clean',
          )}
        </section>
      </div>
    `
  }

  private renderAutofill(): TemplateResult {
    const selected = this.model.credentialProviderSelected()
    const accessNotice = this.model.credentialProviderAccessNotice()
    const steps = this.model.credentialProviderSteps()
    return html`
      <div class="settings-group">
        <div class="status-row">
          <div class="status-copy">
            <span
              class="status-pill"
              data-state=${this.model.credentialProviderStatusState()}
              role="status"
              aria-atomic="true"
            >
              <span class="status-dot" aria-hidden="true"></span>
              ${this.model.credentialProviderSummary()}
            </span>
            <p class="row-description">${this.model.credentialProviderDescription()}</p>
          </div>
        </div>
        ${renderMacosCredentialProviderCapabilities(this.model, 'status-pill')}
        <div class="inline-actions">
          <cv-button
            variant="primary"
            ?disabled=${this.model.credentialProviderSettingsActionDisabled()}
            @click=${this.handleOpenCredentialProviderSettings}
          >
            ${this.model.credentialProviderActionLabel()}
          </cv-button>
        </div>
        ${accessNotice
          ? html`<cv-callout class="route-callout" variant="warning" density="dense">${accessNotice}</cv-callout>`
          : nothing}
        ${selected === true
          ? nothing
          : html`
              <ol class="provider-steps">
                <li>${steps[0]}</li>
                <li>${steps[1]}</li>
              </ol>
            `}
      </div>
    `
  }

  private renderPasswordImportTask(): TemplateResult {
    if (this.model.passwordImportCompletedSuccessfully()) {
      return html`
        <div class="import-success" role="status">
          <cv-icon name="check-circle"></cv-icon>
          <h2>${i18n('settings:passwords-maintenance-import-success-title')}</h2>
          <p>${i18n('settings:passwords-maintenance-import-success-description')}</p>
          <cv-button variant="primary" @click=${this.handlePasswordImportClose}>
            ${i18n('button:close')}
          </cv-button>
        </div>
      `
    }

    if (this.model.passwordImportDialogOpen()) {
      return html`
        <pm-import-dialog
          @import-complete=${this.handlePasswordImportComplete}
          @import-close=${this.handlePasswordImportClose}
        ></pm-import-dialog>
      `
    }

    return html`
      <div class="task-loading" role="status" aria-live="polite">
        <cv-icon name="loader-circle"></cv-icon>
        <p>${this.model.passwordMaintenanceError() || i18n('settings:password-import-preparing')}</p>
      </div>
    `
  }

  private renderSwitchRow(
    key: SettingsPreferenceKey,
    title: string,
    description: string,
    checked: boolean,
    handler: (event: CVSwitchChangeEvent) => void,
  ): TemplateResult {
    const error = this.model.preferenceErrorFor(key)
    return html`
      <div class="preference-row">
        <div class="row-copy">
          <span class="row-title">${title}</span>
          ${description ? html`<span class="row-description">${description}</span>` : nothing}
        </div>
        <cv-switch
          aria-label=${title}
          .helpText=${description}
          .checked=${checked}
          .loading=${this.model.isPreferencePending(key)}
          .disabled=${this.model.preferenceSavePending()}
          @cv-change=${handler}
        ></cv-switch>
        ${error
          ? html`<span class="preference-error" role="status" aria-live="polite">${error}</span>`
          : nothing}
      </div>
    `
  }

  private renderPickerRow(
    title: string,
    description: string,
    value: string,
    handler: () => void,
  ): TemplateResult {
    return html`
      <button class="picker-row" type="button" @click=${handler}>
        <span class="row-copy">
          <span class="row-title">${title}</span>
          <span class="row-description">${description}</span>
          <span class="overview-summary">${value}</span>
        </span>
        <cv-icon name="chevron-right" aria-hidden="true"></cv-icon>
      </button>
    `
  }

  private renderActionRow(
    title: string,
    description: string,
    icon: string,
    handler: () => void,
    disabled = false,
    loading = false,
  ): TemplateResult {
    return html`
      <button class="action-row" type="button" @click=${handler} ?disabled=${disabled}>
        <span class="row-copy">
          <span class="row-title">${title}</span>
          <span class="row-description">${description}</span>
          ${loading
            ? html`<span class="overview-summary" role="status">${i18n('settings:saving')}</span>`
            : nothing}
        </span>
        <cv-icon name=${icon} aria-hidden="true"></cv-icon>
      </button>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-page-mobile-layout': SettingsPageMobileLayout
  }
}
