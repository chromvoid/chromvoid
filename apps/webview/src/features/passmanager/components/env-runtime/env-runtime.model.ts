import {wrap} from '@reatom/core'

import {envRuntimeI18n as t, getEnvRuntimeLocale} from './env-runtime.i18n'
import {EnvRuntimeModelEditors} from './env-runtime.model-editors'
import {
  errorCode,
  errorMessage,
  errorMessageWithCode,
  RUN_APPROVAL_TERMINAL_ERROR_CODES,
  variableErrors,
} from './env-runtime.model.support'
import type {
  AgentPairingInfo,
  AgentRunMetadata,
  EnvRuntimeDesktopSnapshot,
  PairedAgent,
  ProfileSecretBinding,
  ProductCliInstallStatus,
  RunApprovalSnapshot,
} from './env-runtime.types'

export type {EnvRuntimeDependencies} from './env-runtime.model.support'

export class EnvRuntimeModel extends EnvRuntimeModelEditors {
  openProposal(id: string): void {
    const proposal = this.proposals().find((item) => item.metadata.id === id)
    if (!proposal || proposal.metadata.status !== 'pending') return
    if (proposal.metadata.expires_at_epoch_ms <= this.dependencies.now()) {
      this.error.set(t('reviewClosed', {code: 'PROPOSAL_EXPIRED'}))
      return
    }
    this.resetRunApprovalReview()
    this.error.set(null)
    this.proposalGeneration += 1
    this.selectedProposalId.set(proposal.metadata.id)
    this.proposalAttempted.set(false)
    this.proposalPending.set(false)
    this.proposalError.set(null)
    this.proposalProfileDraft.set(
      proposal.draft?.resource_kind === 'profile'
        ? {
            ...proposal.draft.draft,
            variables: proposal.draft.draft.variables.map((variable) => ({...variable})),
          }
        : null,
    )
  }

  closeProposal(): void {
    if (this.proposalPending()) return
    this.resetProposalReview()
  }

  proposalVariableIsBindable(index: number): boolean {
    const proposal = this.selectedProposal()
    return (
      proposal?.draft?.resource_kind === 'profile' &&
      proposal.draft.draft.variables[index]?.secret_id === null
    )
  }

  updateProposalVariable(index: number, secretId: string): void {
    const draft = this.proposalProfileDraft()
    if (!draft) return
    const proposal = this.selectedProposal()
    const originalVariable =
      proposal?.draft?.resource_kind === 'profile' ? proposal.draft.draft.variables[index] : undefined
    if (originalVariable?.secret_id !== null) return
    this.proposalProfileDraft.set({
      ...draft,
      variables: draft.variables.map((variable, itemIndex) =>
        itemIndex === index ? {...variable, secret_id: secretId || null} : variable,
      ),
    })
  }

  async resolveProposal(approve: boolean): Promise<string | null> {
    const proposal = this.selectedProposal()
    if (!proposal || this.proposalPending()) return null
    const approvalReadiness = this.proposalApprovalReadiness()
    if (approve && !approvalReadiness.ready) {
      this.proposalError.set(this.readinessError(approvalReadiness))
      return null
    }
    const profileDraft = this.proposalProfileDraft()
    if (approve && profileDraft && proposal.metadata.operation !== 'delete') {
      this.proposalAttempted.set(true)
      const errors = variableErrors(profileDraft.variables)
      const rowIndex = errors.findIndex((row) => row.name || row.secret)
      if (rowIndex >= 0) return `proposal-variable-${errors[rowIndex]?.name ? 'name' : 'secret'}-${rowIndex}`
    }
    const profileBindings: ProfileSecretBinding[] = []
    if (approve && profileDraft && proposal.draft?.resource_kind === 'profile') {
      proposal.draft.draft.variables.forEach((variable, index) => {
        if (variable.secret_id !== null) return
        const secretId = profileDraft.variables[index]?.secret_id
        if (secretId) profileBindings.push({name: variable.name, secret_id: secretId})
      })
    }
    const generation = ++this.proposalGeneration
    this.proposalPending.set(true)
    this.proposalError.set(null)
    try {
      await wrap(
        this.dependencies.invoke('env_runtime_proposal_resolve', {
          proposalId: proposal.metadata.id,
          approve,
          profileBindings,
        }),
      )
      if (generation !== this.proposalGeneration) return null
      this.resetProposalReview()
      await wrap(this.refresh())
      return null
    } catch (error) {
      if (generation !== this.proposalGeneration) return null
      const code = errorCode(error)
      if (
        code === 'PROPOSAL_EXPIRED' ||
        code === 'PROPOSAL_NOT_FOUND' ||
        code === 'PROPOSAL_CLOSED' ||
        code === 'REVISION_CONFLICT' ||
        code === 'VAULT_REQUIRED' ||
        code === 'AGENT_REVOKED'
      ) {
        this.resetProposalReview()
        this.error.set(errorMessageWithCode(error))
        return null
      }
      this.proposalError.set(errorMessageWithCode(error))
      return null
    } finally {
      if (generation === this.proposalGeneration) this.proposalPending.set(false)
    }
  }

  openRunApproval(runId: string): void {
    const approval = this.approvals().find((item) => item.run.id === runId)
    if (!approval) return
    if (approval.expires_at_epoch_ms <= this.dependencies.now()) {
      this.error.set(t('reviewClosed', {code: 'APPROVAL_EXPIRED'}))
      return
    }
    this.resetProposalReview()
    this.error.set(null)
    this.runApprovalGeneration += 1
    this.selectedRunApprovalId.set(runId)
    this.runApprovalPending.set(false)
    this.runApprovalError.set(null)
  }

  closeRunApproval(): void {
    if (this.runApprovalPending()) return
    this.resetRunApprovalReview()
  }

  async resolveRunApproval(approve: boolean): Promise<void> {
    const approval = this.selectedRunApproval()
    if (!approval || this.runApprovalPending()) return
    const approvalReadiness = this.runApprovalReadiness()
    if (approve && !approvalReadiness.ready) {
      this.runApprovalError.set(this.readinessError(approvalReadiness))
      return
    }
    const runId = approval.run.id
    const generation = ++this.runApprovalGeneration
    this.runApprovalPending.set(true)
    this.runApprovalError.set(null)
    try {
      await wrap(this.dependencies.invoke('env_runtime_run_approval_resolve', {runId, approve}))
      if (generation !== this.runApprovalGeneration) return
      this.resetRunApprovalReview()
      await wrap(this.refreshOperationalState())
    } catch (error) {
      if (generation !== this.runApprovalGeneration) return
      const code = errorCode(error)
      if (code && RUN_APPROVAL_TERMINAL_ERROR_CODES.has(code)) {
        this.resetRunApprovalReview()
        this.error.set(errorMessageWithCode(error))
        return
      }
      this.runApprovalError.set(errorMessageWithCode(error))
    } finally {
      if (generation === this.runApprovalGeneration) this.runApprovalPending.set(false)
    }
  }

  async stopRun(runId: string): Promise<void> {
    if (!this.activeRuns().some((run) => run.id === runId)) return
    try {
      await wrap(this.dependencies.invoke('env_runtime_run_stop', {runId}))
      await wrap(this.refreshOperationalState())
    } catch (error) {
      this.error.set(errorMessage(error))
    }
  }

  async installCli(): Promise<void> {
    if (this.reportReadinessDenial(this.privilegedReadiness()) || this.cliInstallPending()) return
    this.cliInstallPending.set(true)
    try {
      this.cliStatus.set(
        await wrap(this.dependencies.invoke<ProductCliInstallStatus>('env_runtime_cli_install')),
      )
    } catch (error) {
      this.error.set(errorMessage(error))
    } finally {
      this.cliInstallPending.set(false)
    }
  }

  async startPairing(): Promise<void> {
    if (this.reportReadinessDenial(this.privilegedReadiness()) || this.pairingPending()) return
    this.pairingPending.set(true)
    this.error.set(null)
    this.pairingInitialAgentIds = new Set(this.pairedActiveAgents().map((agent) => agent.id))
    try {
      const info = await wrap(this.dependencies.invoke<AgentPairingInfo>('gateway_start_agent_pairing'))
      this.pairingInfo.set(info)
      this.clock.set(this.dependencies.now())
    } catch (error) {
      this.error.set(errorMessage(error))
    } finally {
      this.pairingPending.set(false)
    }
  }

  async cancelPairing(): Promise<void> {
    if (!this.privilegedReadiness().ready) {
      this.pairingInfo.set(null)
      return
    }
    try {
      await wrap(this.dependencies.invoke('gateway_cancel_pairing'))
    } catch {
      // The short-lived ceremony may already have expired; clearing local UI remains safe.
    }
    this.pairingInfo.set(null)
  }

  async revokeAgent(id: string): Promise<void> {
    if (this.reportReadinessDenial(this.privilegedReadiness())) return
    const agent = this.pairedAgents().find((item) => item.id === id)
    if (!agent) return
    const label = agent.label || agent.id
    const confirmed = await wrap(
      this.dependencies.confirm({
        title: t('cliRevokeTitle'),
        message: t('cliRevokeMessage', {label}),
        confirmText: t('cliRevoke'),
        cancelText: t('cancel'),
        confirmVariant: 'danger',
        variant: 'warning',
      }),
    )
    if (!confirmed) return
    try {
      this.setPairedAgents(await wrap(this.dependencies.invoke<PairedAgent[]>('gateway_revoke_agent', {id})))
    } catch (error) {
      this.error.set(errorMessage(error))
    }
  }

  profileLabel(profileId: string): string {
    return this.profiles().find((profile) => profile.id === profileId)?.label ?? profileId
  }

  presetLabel(presetId: string): string {
    return this.presets().find((preset) => preset.id === presetId)?.label ?? presetId
  }

  actorLabel(actorId: string): string {
    const actor = this.pairedAgents().find((agent) => agent.id === actorId)
    return actor?.label || actor?.id || actorId
  }

  secretLabel(secretId: string | null): string {
    if (!secretId) return t('unknown')
    return this.secrets().find((secret) => secret.id === secretId)?.label ?? secretId
  }

  secretUsageLabel(count: number): string {
    return count === 1 ? t('secretUsageOne') : t('secretUsage', {count})
  }

  profileMappingsLabel(count: number): string {
    return count === 1 ? t('profileMappingsOne') : t('profileMappings', {count})
  }

  formatTime(timestamp: number | null): string {
    if (timestamp == null) return '—'
    return new Intl.DateTimeFormat(getEnvRuntimeLocale(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(timestamp)
  }

  secondsUntil(timestamp: number): number {
    this.clock()
    return Math.max(0, Math.ceil((timestamp - this.dependencies.now()) / 1_000))
  }

  formatRunExit(run: AgentRunMetadata): string {
    if (run.exit_code != null) return String(run.exit_code)
    if (run.signal != null) return `signal ${run.signal}`
    return '—'
  }

  protected override async refreshOperationalState(): Promise<void> {
    if (this.operationalRefreshPending) return
    this.operationalRefreshPending = true
    try {
        const snapshot = await wrap(
          this.dependencies.invoke<EnvRuntimeDesktopSnapshot>('env_runtime_desktop_snapshot'),
        )
      this.desktopSnapshot.set(snapshot)
      if (!this.privilegedReadiness().ready) {
          this.applyRecoverySnapshot(snapshot)
        return
      }

      this.applyDesktopSnapshot(snapshot)
      const agents = await wrap(this.dependencies.invoke<PairedAgent[]>('gateway_list_paired_agents'))
      if (!this.privilegedReadiness().ready) {
        this.applyRecoverySnapshot(snapshot)
        return
      }
      this.setPairedAgents(agents)
    } catch (error) {
      if (this.connected) this.error.set(errorMessage(error))
    } finally {
      this.operationalRefreshPending = false
    }
  }

  protected override setPairedAgents(agents: PairedAgent[]): void {
    this.pairedAgents.set(agents)
    const selectedActorId =
      this.selectedRunApproval()?.run.actor_id ?? this.selectedProposal()?.metadata.actor_id ?? null
    if (selectedActorId && agents.some((agent) => agent.id === selectedActorId && agent.revoked)) {
      this.resetRunApprovalReview()
      this.resetProposalReview()
      this.error.set(t('reviewClosed', {code: 'AGENT_REVOKED'}))
    }
    const pairing = this.pairingInfo()
    if (!pairing) return
    const pairedNewAgent = agents.some(
      (agent) => !agent.revoked && !this.pairingInitialAgentIds.has(agent.id),
    )
    if (pairedNewAgent || pairing.pin_expires_at_ms <= this.dependencies.now()) {
      this.pairingInfo.set(null)
    }
  }

  protected override async attachNativeListeners(): Promise<void> {
    try {
      const [vaultUnlisten, approvalUnlisten] = await wrap(
        Promise.all([
          this.dependencies.listen(
            'vault:locked',
            wrap(() => {
              const snapshot = this.desktopSnapshot()
              if (snapshot) {
                this.desktopSnapshot.set({
                  ...snapshot,
                  status: {...snapshot.status, vault_unlocked: false},
                })
              }
              this.closePrivilegedDialogsForRecovery()
              void this.refreshOperationalState()
            }),
          ),
          this.dependencies.listen<RunApprovalSnapshot>(
            'env-runtime:run-approval',
            wrap(() => {
              this.setSection('activity')
              void this.refreshOperationalState()
            }),
          ),
        ]),
      )
      if (!this.connected) {
        vaultUnlisten()
        approvalUnlisten()
        return
      }
      this.unlisteners.push(vaultUnlisten, approvalUnlisten)
    } catch {
      // Browser preview and tests do not provide Tauri events; manual refresh remains available.
    }
  }

  protected override applyDesktopSnapshot(snapshot: EnvRuntimeDesktopSnapshot): void {
    this.desktopSnapshot.set(snapshot)
    if (!snapshot.status.vault_unlocked) this.closePrivilegedDialogsForRecovery()
    this.reconcileReviewSelections()
  }

  protected override applyRecoverySnapshot(snapshot: EnvRuntimeDesktopSnapshot): void {
    this.desktopSnapshot.set({
      status: snapshot.status,
      runs: snapshot.runs,
      presets: [],
      proposals: snapshot.proposals,
      approvals: snapshot.approvals,
    })
    this.secrets.set([])
    this.profiles.set([])
    this.cliStatus.set(null)
    this.pairedAgents.set([])
    this.pairingInfo.set(null)
    this.closePrivilegedDialogsForRecovery()
    this.reconcileReviewSelections()
  }

  private closePrivilegedDialogsForRecovery(): void {
    this.clearReveal()
    this.closeSecretDialog()
    this.closeProfileDialog()
    this.closePresetDialog()
  }

  protected override updateClock(): void {
    this.clock.set(this.dependencies.now())
    this.reconcileReviewSelections()
    if (this.pairingInfo() && this.pairingInfo()!.pin_expires_at_ms <= this.dependencies.now()) {
      this.pairingInfo.set(null)
    }
  }

  protected reconcileReviewSelections(): void {
    const now = this.dependencies.now()
    const selectedRunId = this.selectedRunApprovalId()
    if (selectedRunId) {
      const approval = this.approvals().find((item) => item.run.id === selectedRunId)
      if (!approval) {
        this.resetRunApprovalReview()
        this.error.set(t('reviewClosed', {code: 'APPROVAL_CLOSED'}))
      } else if (approval.expires_at_epoch_ms <= now) {
        this.resetRunApprovalReview()
        this.error.set(t('reviewClosed', {code: 'APPROVAL_EXPIRED'}))
      }
    }

    const selectedProposalId = this.selectedProposalId()
    if (selectedProposalId) {
      const proposal = this.pendingProposals().find((item) => item.metadata.id === selectedProposalId)
      if (!proposal) {
        this.resetProposalReview()
        this.error.set(t('reviewClosed', {code: 'PROPOSAL_NOT_FOUND'}))
      } else if (proposal.metadata.expires_at_epoch_ms <= now) {
        this.resetProposalReview()
        this.error.set(t('reviewClosed', {code: 'PROPOSAL_EXPIRED'}))
      }
    }
  }

  protected override resetRunApprovalReview(): void {
    this.runApprovalGeneration += 1
    this.selectedRunApprovalId.set(null)
    this.runApprovalPending.set(false)
    this.runApprovalError.set(null)
  }

  protected override resetProposalReview(): void {
    this.proposalGeneration += 1
    this.selectedProposalId.set(null)
    this.proposalProfileDraft.set(null)
    this.proposalAttempted.set(false)
    this.proposalPending.set(false)
    this.proposalError.set(null)
  }

  protected override closeAllDialogs(): void {
    this.closeSecretDialog()
    this.closeProfileDialog()
    this.closePresetDialog()
    this.resetProposalReview()
    this.resetRunApprovalReview()
  }
}

export const envRuntimeModel = new EnvRuntimeModel()
