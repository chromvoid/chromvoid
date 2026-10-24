import type {CVDialogEventDetail} from '@chromvoid/uikit/components/cv-dialog'
import type {CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import {CVSelect, type CVSelectInputEvent} from '@chromvoid/uikit/components/cv-select'
import type {CVTabsEventDetail} from '@chromvoid/uikit/components/cv-tabs'
import {CVTextarea, type CVTextareaInputEvent} from '@chromvoid/uikit/components/cv-textarea'
import {ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {envRuntimeModel} from './env-runtime.model'

export abstract class EnvRuntimePageBase extends ReatomLitElement {
  override connectedCallback(): void {
    super.connectedCallback()
    envRuntimeModel.connect()
  }

  override disconnectedCallback(): void {
    envRuntimeModel.disconnect()
    super.disconnectedCallback()
  }

  protected handleTabChange(event: CustomEvent<CVTabsEventDetail>): void {
    if (event.target !== event.currentTarget) return
    envRuntimeModel.setSection(event.detail.selectedTabId ?? event.detail.activeTabId ?? '')
  }

  protected handleRefresh(): void {
    void envRuntimeModel.refresh()
  }

  protected handleClearError(): void {
    envRuntimeModel.clearError()
  }

  protected handleRetryAccess(): void {
    void envRuntimeModel.retryAccess()
  }

  protected handleCreateSecret(): void {
    envRuntimeModel.openCreateSecret()
  }

  protected handleEditSecret(event: Event): void {
    envRuntimeModel.openEditSecret(this.data(event, 'secretId'))
  }

  protected handleRevealSecret(event: Event): void {
    envRuntimeModel.openRevealSecret(this.data(event, 'secretId'))
  }

  protected handleHideSecret(): void {
    envRuntimeModel.clearReveal()
  }

  protected handleDeleteSecret(event: Event): void {
    void envRuntimeModel.deleteSecret(this.data(event, 'secretId'))
  }

  protected handleSecretLabelInput(event: CVInputInputEvent): void {
    envRuntimeModel.setSecretLabel(event.detail.value)
  }

  protected handleSecretValueInput(event: CVInputInputEvent): void {
    envRuntimeModel.setSecretValue(event.detail.value)
  }

  protected handleMasterPasswordInput(event: CVInputInputEvent): void {
    envRuntimeModel.setMasterPassword(event.detail.value)
  }

  protected handleSecretDialogChange(event: CustomEvent<CVDialogEventDetail>): void {
    if (event.target !== event.currentTarget) return
    if (!event.detail.open) envRuntimeModel.closeSecretDialog()
  }

  protected handleCloseSecretDialog(): void {
    envRuntimeModel.closeSecretDialog()
  }

  protected async handleSecretSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    const field = await envRuntimeModel.submitSecret()
    if (field) await this.focusControl(`env-secret-${field}`)
  }

  protected async handleRevealSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    const field = await envRuntimeModel.submitReveal()
    if (field) await this.focusControl('env-secret-master-password')
  }

  protected handleCreateProfile(): void {
    envRuntimeModel.openCreateProfile()
  }

  protected handleEditProfile(event: Event): void {
    envRuntimeModel.openEditProfile(this.data(event, 'profileId'))
  }

  protected handleDeleteProfile(event: Event): void {
    void envRuntimeModel.deleteProfile(this.data(event, 'profileId'))
  }

  protected handleProfileDialogChange(event: CustomEvent<CVDialogEventDetail>): void {
    if (event.target !== event.currentTarget) return
    if (!event.detail.open) envRuntimeModel.closeProfileDialog()
  }

  protected handleCloseProfileDialog(): void {
    envRuntimeModel.closeProfileDialog()
  }

  protected handleProfileTextInput(event: CVInputInputEvent): void {
    const field = this.data(event, 'profileField') as 'slug' | 'label'
    envRuntimeModel.setProfileField(field, event.detail.value)
  }

  protected handleProfileDescriptionInput(event: CVTextareaInputEvent): void {
    envRuntimeModel.setProfileField('description', event.detail.value)
  }

  protected handleAddProfileVariable(): void {
    envRuntimeModel.addProfileVariable()
  }

  protected handleCreateSecretForProfile(event: Event): void {
    envRuntimeModel.openCreateSecretForProfile(this.dataIndex(event))
  }

  protected handleRemoveProfileVariable(event: Event): void {
    envRuntimeModel.removeProfileVariable(this.dataIndex(event))
  }

  protected handleProfileVariableInput(event: CVInputInputEvent): void {
    envRuntimeModel.updateProfileVariable(this.dataIndex(event), 'name', event.detail.value)
  }

  protected handleProfileVariableSecretChange(event: CVSelectInputEvent): void {
    envRuntimeModel.updateProfileVariable(this.dataIndex(event), 'secret_id', event.detail.value ?? '')
  }

  protected async handleProfileSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    const focusId = await envRuntimeModel.submitProfile()
    if (focusId) await this.focusControl(focusId)
  }

  protected handleCreatePreset(): void {
    envRuntimeModel.openCreatePreset()
  }

  protected handleEditPreset(event: Event): void {
    envRuntimeModel.openEditPreset(this.data(event, 'presetId'))
  }

  protected handleDeletePreset(event: Event): void {
    void envRuntimeModel.deletePreset(this.data(event, 'presetId'))
  }

  protected handlePresetDialogChange(event: CustomEvent<CVDialogEventDetail>): void {
    if (event.target !== event.currentTarget) return
    if (!event.detail.open) envRuntimeModel.closePresetDialog()
  }

  protected handleClosePresetDialog(): void {
    envRuntimeModel.closePresetDialog()
  }

  protected handlePresetProfileChange(event: CVSelectInputEvent): void {
    envRuntimeModel.setPresetField('profileId', event.detail.value ?? '')
  }

  protected handlePresetTextInput(event: CVInputInputEvent): void {
    const field = this.data(event, 'presetField') as 'slug' | 'label' | 'workspaceRoot' | 'cwd' | 'executable'
    envRuntimeModel.setPresetField(field, event.detail.value)
  }

  protected handleAddPresetArg(): void {
    envRuntimeModel.addPresetArg()
  }

  protected handlePresetArgInput(event: CVInputInputEvent): void {
    envRuntimeModel.updatePresetArg(this.dataIndex(event), event.detail.value)
  }

  protected handleRemovePresetArg(event: Event): void {
    envRuntimeModel.removePresetArg(this.dataIndex(event))
  }

  protected handleAddPresetPassthrough(): void {
    envRuntimeModel.addPresetPassthrough()
  }

  protected handlePresetPassthroughInput(event: CVInputInputEvent): void {
    envRuntimeModel.updatePresetPassthrough(this.dataIndex(event), event.detail.value)
  }

  protected handleRemovePresetPassthrough(event: Event): void {
    envRuntimeModel.removePresetPassthrough(this.dataIndex(event))
  }

  protected async handlePresetSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    const focusId = await envRuntimeModel.submitPreset()
    if (focusId) await this.focusControl(focusId)
  }

  protected handleOpenProposal(event: Event): void {
    envRuntimeModel.openProposal(this.data(event, 'proposalId'))
  }

  protected handleProposalDialogChange(event: CustomEvent<CVDialogEventDetail>): void {
    if (event.target !== event.currentTarget) return
    if (!event.detail.open) envRuntimeModel.closeProposal()
  }

  protected handleCloseProposal(): void {
    envRuntimeModel.closeProposal()
  }

  protected handleProposalSecretChange(event: CVSelectInputEvent): void {
    envRuntimeModel.updateProposalVariable(this.dataIndex(event), event.detail.value ?? '')
  }

  protected handleRejectProposal(): void {
    void envRuntimeModel.resolveProposal(false)
  }

  protected async handleApproveProposal(): Promise<void> {
    const focusId = await envRuntimeModel.resolveProposal(true)
    if (focusId) await this.focusControl(focusId)
  }

  protected handleOpenRunApproval(event: Event): void {
    envRuntimeModel.openRunApproval(this.data(event, 'runId'))
  }

  protected handleRunApprovalDialogChange(event: CustomEvent<CVDialogEventDetail>): void {
    if (event.target !== event.currentTarget) return
    if (!event.detail.open) envRuntimeModel.closeRunApproval()
  }

  protected handleCloseRunApproval(): void {
    envRuntimeModel.closeRunApproval()
  }

  protected handleRejectRunApproval(): void {
    void envRuntimeModel.resolveRunApproval(false)
  }

  protected handleApproveRunApproval(): void {
    void envRuntimeModel.resolveRunApproval(true)
  }

  protected handleStopRun(event: Event): void {
    void envRuntimeModel.stopRun(this.data(event, 'runId'))
  }

  protected handleInstallCli(): void {
    void envRuntimeModel.installCli()
  }

  protected handleStartPairing(): void {
    void envRuntimeModel.startPairing()
  }

  protected handleCancelPairing(): void {
    void envRuntimeModel.cancelPairing()
  }

  protected handleRevokeAgent(event: Event): void {
    void envRuntimeModel.revokeAgent(this.data(event, 'agentId'))
  }

  protected data(event: Event, key: string): string {
    return (event.currentTarget as HTMLElement).dataset[key] ?? ''
  }

  protected dataIndex(event: Event): number {
    return Number.parseInt(this.data(event, 'index'), 10)
  }

  protected formatCommand(executable: string, args: readonly string[]): string {
    return JSON.stringify([executable, ...args])
  }

  protected formatStatus(status: string): string {
    return status.replaceAll('_', ' ')
  }

  protected async focusControl(id: string): Promise<void> {
    await this.updateComplete
    const control = this.renderRoot.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
    if (!control) return
    if (control instanceof CVSelect) {
      control.shadowRoot?.querySelector<HTMLElement>('[part="trigger"]')?.focus()
      return
    }
    if (control instanceof CVTextarea) {
      control.shadowRoot?.querySelector<HTMLElement>('[part="textarea"]')?.focus()
      return
    }
    control.focus()
  }
}
